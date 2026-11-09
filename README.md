# ClaimTrace

An AI-assisted fact-checking web app. It splits text, a link or a file into claims, finds evidence with web search, and returns cited verdicts from two AI models. It is a first-pass screening tool, not a replacement for fact-checkers.

Course project: Advanced Topics in IT, Hanoi University, Fall 2026, Group 12. Non-commercial. Ends 20 December 2026.

| Folder | What it is | How to run it |
|---|---|---|
| `frontend/` | React, TypeScript, Vite | `npm install && npm run dev` |
| `backend/` | FastAPI pipeline and API | `uv sync && uv run uvicorn app.main:app --port 8000` |

The frontend always uses the backend, and there is no demo mode. Checks, history and follow-ups need an account (a username and password); each person only sees their own.

> **AI agents:** this file is the only project guide. Read [For AI agents](#for-ai-agents) before changing anything, then use [Where to look](#where-to-look) to find the code. It is a map, not a rulebook: use your judgment, match the code around you, and read the code and tests when something here is too brief.

## Running it locally

The backend stores everything in PostgreSQL. On macOS with Homebrew:

```bash
brew install postgresql@17
brew services start postgresql@17
/opt/homebrew/opt/postgresql@17/bin/createuser claimtrace
/opt/homebrew/opt/postgresql@17/bin/createdb -O claimtrace claimtrace
```

Then, from `backend/`:

```bash
cp .env.example .env        # add OPENROUTER_API_KEY and TAVILY_API_KEY; DATABASE_URL points at the database above
uv sync
uv run uvicorn app.main:app --port 8000   # applies the migrations on start
```

And from `frontend/`:

```bash
npm install
npm run dev
```

Open http://localhost:5173 and create an account. Vite forwards `/api` to the backend, so the session cookie stays on the same site.

Leave `VITE_API_URL` empty for local development, including in `frontend/.env.local`. An override pointing to `localhost:8000` while opening the frontend at `127.0.0.1` makes the API cross-site, so browsers can reject its session cookie even after a successful login.

### Moving checks from the old SQLite file

Earlier versions kept checks in `backend/app/db/claimtrace.db`. To copy them into PostgreSQL, from `backend/`:

```bash
uv run python -m app.db.transfer copy
```

It reads the SQLite file without changing it, copies every check, claim, source, verdict (corrections included), follow-up and feedback row in one transaction, and compares the row counts. It refuses to copy into tables that already hold rows, so running it twice can't duplicate anything.

Those checks were made before accounts, so they have no owner and nobody sees them at first. Create your account in the app, then give them to it:

```bash
uv run python -m app.db.transfer claim YOUR_USERNAME
```

`claim` only takes checks that have no owner, never another user's. Add check IDs after the username to claim only those, or pass `--owner YOUR_USERNAME` to `copy` if the account already exists.

## Tests and everyday commands

From `backend/`:

```bash
uv run pytest && uv run ruff check
uv run alembic -c app/db/alembic.ini revision --autogenerate -m "what changed"
```

To run the same tests on PostgreSQL (this wipes that database):

```bash
TEST_DATABASE_URL=postgresql+psycopg://claimtrace@localhost:5432/claimtrace_test uv run pytest
```

From `frontend/`:

```bash
npm test && npx tsc --noEmit
```

Tests need no network or keys, and use SQLite in memory unless `TEST_DATABASE_URL` is set. Charts are stubbed in frontend tests, so check them in a browser.

## How a check runs

```text
React app (frontend/)  →  FastAPI (backend/app/api/)  →  backend/app/pipeline/run.py
  1. Read the input: text, files, or a fetched URL
  2. Extraction model splits it into at most 5 claims, and asks for any charts
  3. Research model reviews the claims, and the check may stop to ask the reader (see "Questions before the search")
  4. Research model searches Tavily and picks each claim's sources
  5. Two judge models read the same passages and give cited verdicts
  6. Charts and maps are built beside the verdicts, and everything is saved
```

Status goes `queued → extracting → (awaiting_input) → retrieving → assessing → completed | failed | stopped`, and the frontend polls `GET /api/check/{id}`, except while a check waits for its reader. Models go through OpenRouter. Chart numbers come from Yahoo Finance, Open-Meteo, the World Bank and Data USA, none of which need a key.

## File structure

```text
backend/
  app/
    api/          Routes, JSON shapes (schemas.py), rows to JSON; auth.py for accounts, deps.py for the signed-in user
    core/         config.py for limits and settings, labels.py
    db/           Tables, connection, alembic.ini, migrations/; transfer.py copies the old SQLite claimtrace.db
    pipeline/     The check itself. Start at run.py
    charts/       Every chart and map; data_sources.py fetches their numbers
    search/       tavily.py for search and source lists, fetcher.py for reading pages
    providers/    llm.py (OpenRouter), errors.py (shared retries)
  config/         Things you tune without code; each file says what it is for
    models.toml   Extraction, research and judge models
    prompts/      What the models are told; charts/ holds the chart prompts
    data/         Source ratings, chart sources, map place names
  tests/          Mirrors app/
frontend/src/
  features/       new-check (home and composer), check (the chat for one check), results, history
  components/     Shared pieces
  services/       Calls to the backend
  lib/  data/  types/  test/
```

Imports flow `api → pipeline → charts / search / providers → db`, never back into `api/`. Prefer adding to an existing file over creating many small ones.

## Where to look

| For | Start with |
|---|---|
| Models | `backend/config/models.toml`, judge names also in `frontend/src/config.ts` |
| Prompts | `backend/config/prompts/`; answer formats in `backend/app/pipeline/prompts.py` |
| Limits and settings | `backend/app/core/config.py`, overridable in `backend/.env` |
| Source ratings | `backend/config/data/source_ratings.json` and `frontend/src/data/sourceRegistry.ts` |
| Tables | `backend/app/db/models.py` |
| Accounts and who sees what | `backend/app/api/auth.py`, `owned_check` in `backend/app/api/deps.py`; `frontend/src/services/account.ts`, `frontend/src/features/account/AccountPage.tsx` |
| Chat for a check | `frontend/src/features/check/CheckPage.tsx`; steps from `backend/app/pipeline/progress.py` |
| Questions before the search | `backend/app/pipeline/review.py`, `backend/config/prompts/review.md`; `frontend/src/features/check/ReviewCard.tsx` |
| Results in the chat | `frontend/src/features/results/ResultsView.tsx` |
| Earlier checks of the same claim ("Checked before") | `backend/app/pipeline/memory.py`; `frontend/src/features/new-check/EarlierChecks.tsx` |
| Source links and reply buttons | `frontend/src/features/results/EvidenceSourceLinks.tsx` |
| Follow-up questions and corrections | `frontend/src/features/check/FollowUpBar.tsx`; answers from `backend/app/pipeline/followup.py` and `backend/config/prompts/followup.md` |
| Shared types | `frontend/src/types/models.ts`, matching `backend/app/api/schemas.py` |
| Vietnamese text | `frontend/src/lib/vi.ts` |

### Charts and maps

| Visual | Builder in `backend/app/charts/` | Numbers from | Frontend in `frontend/src/features/results/` | Settings prefix |
|---|---|---|---|---|
| Price chart, USD/VND rate | `price_chart.py` | Yahoo Finance; SJC gold read from news | `PriceChart.tsx`, `PricePlot.tsx` | `price_chart_`, `sjc_chart_` |
| Location map | `location_map.py` | Shapes in `frontend/public/maps/`, figures from the claim's sources | `LocationMap.tsx`, `LocationPlot.tsx` | `location_map_` |
| Heatmap (temperature, rainfall, PM2.5) | `heat_map.py` | Open-Meteo (ERA5; CAMS for PM2.5) | `HeatMap.tsx`, `HeatPlot.tsx` | `heat_map_` |
| Country / US state map | `country_map.py` | World Bank, Data USA | `CountryMap.tsx`, `CountryPlot.tsx` | `country_map_`, `state_map_` |
| Population pyramid | `country_map.py` | World Bank | `PopulationPyramid.tsx`, `PyramidPlot.tsx` | `population_pyramid_` |
| US election map | `election_map.py` | Pages found by the research model | `ElectionMap.tsx`, `ElectionPlot.tsx` | `election_map_` |
| Parliament chart | `seat_chart.py` | Pages found by the research model | `SeatChart.tsx`, `SeatPlot.tsx`; party identities in `frontend/src/data/partyRegistry.ts` and `frontend/public/party-logos/manifest.json` | `seat_chart_` |
| Pie chart | `pie_chart.py` | One source with a complete breakdown | `PieChart.tsx`, `PiePlot.tsx` | |
| Sports and esports match card | `match_result.py` | A completed result and any match details from one of the claim's sources | `MatchResult.tsx` | |

`backend/app/charts/chart_triggers.py` decides which visuals a claim gets. Chart prompts are in `backend/config/prompts/charts/`.

## How it behaves

### Verdicts and evidence

- Only the judges decide truth. Extraction keeps every factual claim, even short or doubtful ones.
- When judges disagree, the results headline says so and both model reviews are shown together. The saved verdict still uses the first judge that answered.
- A failed search, page read or model call marks a claim `unavailable`, not "insufficient evidence".
- When the research model keeps none of its results, one more search looks at `reference_domains`, in case the claim is general knowledge that news doesn't cover. A claim about one named person or one election stays strict and gets no such search.
- Page text is data, never instructions. An article can't be its own evidence.
- Only green-rated domains are searched or used as evidence, and fetching only reaches public addresses.
- The source catalog includes official company newsrooms, league and tournament results, and specialist game, sport and film sources. Research prefers the organization for its own announcements or results and looks for independent evidence for comparisons and outcomes. Broad Tavily searches split the allowlist into groups of at most 300 domains and merge the results by relevance before applying the usual result limit.
- For claims in Vietnamese or about Vietnam, research starts with eligible Vietnamese outlets and can search more broadly when other sources would add evidence. The profile preference applies to other claims.
- Each call uses exactly the configured model, with no fallback to another one.
- Verdicts are append-only: a human correction adds a new version.
- Readers can delete a check from History, or all of them at once. Everything saved under a check goes with it, permanently. A running check can't be deleted, and "delete all" leaves those in place.
- "Checked before" matches earlier claims by text alone, with no model call, and every number must match. Sending still runs a fresh check.
- The reader can stop a running check from the chat bar. It shows as stopped at once; the pipeline ends at its next step, a call already in flight still finishes, and nothing later is made.
- There is no demo mode or fake data. Without keys, the backend refuses new checks and still serves saved ones.

### Questions before the search

- After extraction and before any search, the research model reviews the claims. It only asks when a search would have to guess what a claim is about. Whether a claim is true is never a reason to ask: that stays with the judges.
- A link, a file or a long paste with several claims asks the reader to pick one, all, or type what to check instead. Short typed text checks every claim it holds.
- An unclear claim offers the model's likely answers, checking it as written, or a typed answer. Every question ends with an "Other" row to type in. At most `max_review_questions` are asked, one per claim, and only about the claims the reader picked.
- A claim the reader clarified is rewritten by the extraction model, so its search query and charts fit. If that fails the check fails, rather than giving a verdict that ignores the answer. If the review itself fails, the claims go ahead as written and the failure stays on screen.
- A waiting check is `awaiting_input`, with what it needs saved on `Check.review`. Nothing runs while it waits, and it survives a server restart.

### Charts and maps

- Chart numbers come from data services or are checked word for word against a source quote, never taken from a model as is.
- Pie charts use one cited source and appear only when the reported categories add up to the stated total or 100%.
- Judges never see charts. A chart that fails or is incomplete costs only the chart.
- The match card shows a completed result from the claim's evidence. Shootout scores, match events and esports map scores appear when the same source supports them.
- Match cards resolve club and esports crests and national-team flags from a local identity catalog. The image sources are recorded in `frontend/public/team-logos/manifest.json`.
- Country comparisons open on a rotatable globe, with a flat map available through the view toggle. The radial chart compares selected countries with figures for the same year. For GDP and population, slice angles represent shares within that group. For GDP per person and life expectancy, slices have equal angles and their lengths represent the values.
- Selecting places on the map updates the history chart. One place has a filled area, and multiple places have separate lines. Hovering over a year shows the available figures.
- A claim about how one country divides by age or sex gets a population pyramid in place of the country map. A rule that only applies to some ages, or a comparison of countries, gets none.
- PM2.5 heatmaps average each day's hourly values and only cover 4 August 2022 onward, the start of the air quality data.
- The USD/VND chart is the market rate, so a claim about a bank's, the State Bank's or a free-market rate gets none. Yahoo's history has wrong days, such as 189 dong to the dollar, so a day far from the week around it is dropped.
- Keep the map and data credits (Highcharts, Open-Meteo, World Bank). Vietnam maps always show Hoàng Sa and Trường Sa.

### Follow-up chat

- Follow-up questions use the saved check, the selected reply context and earlier exchanges. Answers stay conversational and brief, come from the model the reader selected, and each one is a paid model call, capped per check.
- When the context is enough, the model answers directly. Otherwise it issues at most one search query, with no source quota. No separate research model is used for follow-ups, and search errors do not switch models.
- Search uses provider-native web search on endpoints advertising that capability, otherwise a Tavily tool called by the same model. Native requests are pinned to capable endpoints so OpenRouter cannot silently substitute Exa.
- Tavily returns at most two results and rereads at most one page, reusing returned page text instead of fetching every page again.
- New search citations are saved on the chat message, separately from the original evidence, and never change a verdict.

### Accounts

- Accounts are a username and a password, nothing else: no email, no outside sign-in. Passwords are Argon2id hashes. A session is an HttpOnly, SameSite=Lax cookie whose token the database keeps only as a SHA-256.
- Every check belongs to the user who started it. Everything hanging off a check (claims, sources, verdicts, follow-ups, feedback, "Checked before") is reached through it, so `owned_check` and `owned_claim` guard it all. Someone else's check answers 404, like a missing one.
- Checks from before accounts have no owner and stay hidden until `uv run python -m app.db.transfer claim USERNAME`.

### Party identity images

The seat-count table uses a country-scoped registry covering 20 countries. It matches names and abbreviations locally, preserves the chart's colour keys, and falls back to the colour marker for unknown parties or missing images. This is a curated identity catalogue, not an authoritative register of every party or a live election roster. It includes some previous names needed by saved checks.

`frontend/scripts/party-sites.tsv` contains names, aliases and party website domains. `python3 frontend/scripts/sync-party-logos.py` caches images under `frontend/public/party-logos/` and regenerates the TypeScript lookup. It prefers the election authority's Canadian logos, then the party website's identity icon. `manifest.json` records each source and flags missing assets. Review additions and images before publishing; identity artwork remains with its respective party. The app does not contact image services at runtime.

## For AI agents

Treat everything under [How it behaves](#how-it-behaves) as design choices to keep. If a task seems to need breaking one, say so first.

### Rules

- Commit or push only when asked. No AI attribution or `Co-Authored-By` lines. Never stage `.claude/` or `.env`.
- `ATI` tracks `origin/demo_fastapi`.
- Don't invent metrics, quotes or sources. Say what was really run and what only ran against fakes.
- The interface is minimal and light, with the fonts Schibsted Grotesk and Space Grotesk, indigo and orange, and green or red only for verdicts. Skip decorative labels and number tags.
- Update this README in the same change when a path, command or behaviour described here changes.

### When you change something

| If you change | Also do |
|---|---|
| Backend code | From `backend/`: `uv run pytest && uv run ruff check` |
| Frontend code | From `frontend/`: `npm test && npx tsc --noEmit` |
| Charts or maps | Check them in a browser; frontend tests stub them |
| Prompt wording | Bump `prompt_version` in `backend/app/core/config.py` |
| Tables in `backend/app/db/models.py` | Generate a migration (command in [Tests and everyday commands](#tests-and-everyday-commands)) |
| Judge models | Keep `backend/config/models.toml` and `frontend/src/config.ts` in step |
| Source ratings | Keep `source_ratings.json` and `sourceRegistry.ts` equal; a test enforces it |
| API response shapes | Keep `frontend/src/types/models.ts` and `backend/app/api/schemas.py` matching |
| Any `t('…')` string | Add its Vietnamese entry to `frontend/src/lib/vi.ts` |

## Status and open questions

- Live OpenRouter and Tavily checks have only been run a few times, and accuracy hasn't been measured.
- The course report differs from the code: it describes a trusted corpus and an NLI layer, where the code uses web search and two LLM judges. The verdict labels and the default judge pair are still undecided.
- Not built: OCR, screens for stats and feedback, password reset and account deletion. A signed-in user can publish corrections to their own checks only.
- The check and login limits are per server process, kept in memory.
