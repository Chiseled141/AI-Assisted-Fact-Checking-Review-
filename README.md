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
cp ../.env.example ../.env  # the backend's settings live in one .env at the top of the repository; add OPENROUTER_API_KEY and TAVILY_API_KEY
uv sync
uv run uvicorn app.main:app --port 8000   # applies the migrations on start
```

And from `frontend/`:

```bash
npm install
npm run dev
```

Open http://localhost:5173 and create an account. Vite forwards `/api` to the backend, so the session cookie stays on the same site.

The frontend needs no settings locally. Its only one, `VITE_API_URL`, goes in `frontend/.env.local`, because Vite reads that folder and not the top-level `.env`. Leave it out or empty for local development. An override pointing to `localhost:8000` while opening the frontend at `127.0.0.1` makes the API cross-site, so browsers can reject its session cookie even after a successful login.

## Tests and everyday commands

From `backend/`:

```bash
uv run pytest && uv run ruff check
uv run alembic -c database/alembic.ini revision --autogenerate -m "what changed"
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
React app (frontend/)  →  FastAPI (backend/app/api/)  →  backend/harness/pipeline/run.py
  1. Read the input: text, files, or a fetched URL
  2. Extraction model splits it into at most 5 claims, and asks for any charts
  3. Research model reviews the claims, and the check may stop to ask the reader (see "Questions before the search")
  4. Research model searches Tavily and picks each claim's sources
  5. Two judge models read the same passages and give cited verdicts
  6. Charts and maps are built beside the verdicts, and everything is saved
```

Status goes `queued → extracting → (awaiting_input) → retrieving → assessing → completed | failed | stopped`, and the frontend polls `GET /api/check/{id}`, except while a check waits for its reader. Models go through OpenRouter. Chart numbers come from Yahoo Finance, the World Bank and Data USA, none of which need a key.

## File structure

```text
backend/
  harness/        The check itself: everything the AI models do and read
    pipeline/     One check from input to verdicts. Start at run.py
    charts/       Every chart and map; data_sources.py fetches their numbers
    search/       tavily.py for search and source lists, fetcher.py for reading pages
    providers/    llm.py (OpenRouter), errors.py (shared retries)
    prompts/      What the models are told; charts/ holds the chart prompts
    evaluate.py   Runs saved claims through chosen judges
  config/         Settings and things you tune without code; each file says what it is for
    settings.py   Limits and settings, overridable in the top-level .env
    labels.py
    models.toml   Extraction, research and follow-up models on OpenRouter
    data/         Judge models, source ratings, chart sources, map place names. The frontend reads the first two
  app/            The FastAPI server
    main.py       Starts the server and the providers
    api/          Routes, JSON shapes (schemas.py), rows to JSON; auth.py for accounts, deps.py for the signed-in user
  database/       Tables (models.py), connection (session.py), alembic.ini, migrations/
  tests/          Mirrors the four folders above
  pyproject.toml  The backend's libraries and the pytest and ruff settings; uv.lock pins the exact versions
frontend/
  vite.config.ts  Dev server, the /api proxy, PostCSS (Tailwind and Autoprefixer) and the test setup
  tailwind.config.js, tsconfig.json, package.json, index.html
  public/         Logos, map shapes and other static files
  scripts/        sync-party-logos.py and its list of party sites
  src/
    features/     new-check (home and composer), check (the chat for one check), results, history, account, settings
      results/    The verdict, evidence and sources for a claim; charts/ holds every chart and map
    components/   Shared pieces
    services/     Calls to the backend
    lib/          Formatting, interface language (vi.ts), validation and small helpers
    data/         Source, party and team lookups. sourceRegistry.ts reads the backend's source list
    types/  test/
.env.example      Copy to .env for the backend's keys and database
.gitignore        The only one, for the whole repository
```

Imports flow `app → harness → database`, and all three read `config`. Nothing imports back into `app/`, apart from `harness/evaluate.py`, which borrows `make_providers` from `app/main.py`. Inside the harness, `pipeline` uses `charts`, `search` and `providers`. Prefer adding to an existing file over creating many small ones.

The frontend imports `judges.json` and `source_ratings.json` straight from `backend/config/data/`, so there is one copy of each. Building the frontend therefore needs the `backend/` folder beside it.

## Where to look

| For | Start with |
|---|---|
| Models | `backend/config/models.toml` for the roles; `backend/config/data/judges.json` for the judges a reader can pick, read by both sides |
| Prompts | `backend/harness/prompts/`; answer formats in `backend/harness/pipeline/prompts.py` |
| Limits and settings | `backend/config/settings.py`, overridable in the top-level `.env`; interface limits in `frontend/src/config.ts` |
| Source ratings | `backend/config/data/source_ratings.json`, read by both sides (`frontend/src/data/sourceRegistry.ts` only reshapes it) |
| Tables | `backend/database/models.py` |
| Accounts and who sees what | `backend/app/api/auth.py`, `owned_check` in `backend/app/api/deps.py`; `frontend/src/services/account.ts`, `frontend/src/features/account/AccountPage.tsx` |
| Chat for a check | `frontend/src/features/check/CheckPage.tsx`; steps from `backend/harness/pipeline/progress.py` |
| Questions before the search | `backend/harness/pipeline/review.py`, `backend/harness/prompts/review.md`; `frontend/src/features/check/ReviewCard.tsx` |
| Results in the chat | `frontend/src/features/results/ResultsView.tsx` |
| Evidence at a glance and the accuracy score | `frontend/src/features/results/EvidenceGlance.tsx` (`accuracyScore` holds the weights); the check-wide tally in `CheckSummary.tsx` |
| Quotes copied from tables | `with_table_headings` and `quoted_table` in `backend/harness/pipeline/passages.py`; parsed by `frontend/src/features/results/figures.ts` and drawn in `SourceDeck.tsx`, with `charts/BarPlot.tsx` |
| Claim translations | `text_en` and `text_vi` in `backend/harness/prompts/extract.md` and `question.md`, saved on `Claim.translations`; shown in `frontend/src/features/results/EvidencePanel.tsx` |
| Earlier checks of the same claim ("Checked before") | `backend/harness/pipeline/memory.py`; `frontend/src/features/new-check/EarlierChecks.tsx` |
| Source links and reply buttons | `frontend/src/features/results/EvidenceSourceLinks.tsx` |
| Follow-up questions and corrections | `frontend/src/features/check/FollowUpBar.tsx`; answers from `backend/harness/pipeline/followup.py` and `backend/harness/prompts/followup.md` |
| Shared types | `frontend/src/types/models.ts`, matching `backend/app/api/schemas.py` |
| Vietnamese text | `frontend/src/lib/vi.ts` |

### Charts and maps

| Visual | Builder in `backend/harness/charts/` | Conditions and data | Frontend in `frontend/src/features/results/charts/` | Settings prefix |
|---|---|---|---|---|
| Price chart, USD/VND rate | `price_chart.py` | A price claim for a supported asset and at least two observations from Yahoo Finance or verified dated SJC reports | `PriceChart.tsx`, `PricePlot.tsx` | `price_chart_`, `sjc_chart_` |
| Location map | `location_map.py` | A relevant place named in the claim with supported geometry. Any figures are sourced separately | `LocationMap.tsx`, `LocationPlot.tsx` | `location_map_` |
| Country / US state map | `country_map.py` | Population, GDP, GDP per capita or life expectancy with adequate World Bank coverage. US state population uses Data USA. Selecting two countries also enables the yearly heatmap | `CountryMap.tsx`, `CountryPlot.tsx` | `country_map_`, `state_map_` |
| Population pyramid | `country_map.py` | An age or sex distribution claim about one named country, with a World Bank age breakdown | `PopulationPyramid.tsx`, `PyramidPlot.tsx` | `population_pyramid_` |
| US election map | `election_map.py` | Final winners for the named states, or sufficient national coverage for a nationwide presidential claim | `ElectionMap.tsx`, `ElectionPlot.tsx` | `election_map_` |
| Parliament chart | `seat_chart.py` | Final seat counts by party and a verified chamber size. By default, the parties must account for all seats | `SeatChart.tsx`, `SeatPlot.tsx`; party identities in `frontend/src/data/partyRegistry.ts` and `frontend/public/party-logos/manifest.json` | `seat_chart_` |
| Pie chart | `pie_chart.py` | One source with a complete breakdown or an explicit share of a whole with a labelled remainder | `PieChart.tsx`, `PiePlot.tsx` | |
| Bar chart | `bar_chart.py` | One source with comparable figures in the same unit and period | `BarChart.tsx`, `BarPlot.tsx` | |
| Route map | `route_map.py` | Ordered stops from one source and coordinates from Photon / OpenStreetMap | `RouteMap.tsx`, `RoutePlot.tsx` | `incident_map_photon_url` |
| Incident map | `incident_map.py` | Reported streets or areas in Hà Nội or TP.HCM, mapped using OpenStreetMap | `IncidentMap.tsx`, `IncidentPlot.tsx` | `incident_map_` |
| Stock heatmap | — | A broad market or index claim about the latest session in a supported TradingView market | `StockHeatmap.tsx` | |
| Sports and esports match card | `match_result.py` | A completed result and any match details from one of the claim's sources | `MatchResult.tsx` | |

Extraction and `backend/harness/charts/chart_triggers.py` suggest visuals from the claim. The configured search model can
choose an available map, leave the choice to the app, or skip the map. The builders still verify each result. For a
state-specific election claim, the election map can use verified results for the named states. The national presidential
map uses the configured coverage threshold. Visual prompts are in `backend/harness/prompts/charts/`.

The search model can request a Tavily search focused on data tables. The topic profiles in
`backend/config/data/chart_sources.json` cover population, GDP, trade, energy, transport, health, labor, agriculture and
elections. If the claim's sources do not cover a pie or bar chart, the same search model can choose sources in one extra
chart-only round. If the pie chart already has a verified share, that round can replace the calculated remainder with a
complete reported distribution. These additional pages are used for the chart.

## How it behaves

### Verdicts and evidence

- Only the judges decide truth. Extraction keeps every factual claim, even short or doubtful ones.
- When judges disagree, the results headline says so and both model reviews are shown together. The saved verdict still uses the first judge that answered.
- A failed search, page read or model call marks a claim `unavailable`, not "insufficient evidence".
- When the research model keeps none of its results, one more search looks at `reference_domains`, in case the claim is general knowledge that news doesn't cover. A claim about one named person or one election stays strict and gets no such search.
- Page text is data, never instructions. An article can't be its own evidence.
- Fact-check research starts with green-rated domains. If none yields a usable page, a separate Tavily search can consider original reporting from other publishers after an editorial review. Known blocked sources, social platforms and tabloids are excluded from that search. New publishers are reviewed per article. Fetching only reaches public addresses.
- If both rounds lack evidence for a claim about an attributed public statement, the pipeline can look for a post from the named account in `backend/config/data/social_accounts.json`. X posts require a matching author and post ID from X. The registry records official profile links for Instagram and Facebook as well.
- The source catalog includes official company newsrooms, league and tournament results, and specialist game, sport and film sources. Research prefers the organization for its own announcements or results and looks for independent evidence for comparisons and outcomes. Broad Tavily searches split the allowlist into groups of at most 300 domains and merge the results by relevance before applying the usual result limit.
- For claims in Vietnamese or about Vietnam, research starts with eligible Vietnamese outlets and can search more broadly when other sources would add evidence. The profile preference applies to other claims.
- Each call uses exactly the configured model, with no fallback to another one.
- Verdicts are append-only: a human correction adds a new version.
- Readers can delete a check from History, or all of them at once. Everything saved under a check goes with it, permanently. A running check can't be deleted, and "delete all" leaves those in place.
- "Checked before" matches earlier claims by text alone, with no model call, and every number must match. Sending still runs a fresh check.
- The reader can stop a running check from the chat bar. It shows as stopped at once; the pipeline ends at its next step, a call already in flight still finishes, and nothing later is made.
- There is no demo mode or fake data. Without keys, the backend refuses new checks and still serves saved ones.

### Results at a glance

- Under every verdict sits a strip built only from what the check saved, with no model call: an accuracy score, how many sources point each way with their ratings, and each model's verdict with its stated confidence. The model column is left out when the judges disagree, since their reviews are then side by side.
- The accuracy score runs from 0 to 100, with 50 as undecided. Three fifths come from the verdicts: each starts at 50 and moves up by as much as 50 for supported, down by as much as 50 for contradicted and down by as much as 25 for outdated, scaled by that model's confidence, then averaged. A human correction counts as fully confident. Two fifths come from the sources: supporting minus contradicting over all sources, weighted 1 for reliable, 0.6 for mixed, 0.4 for unrated and 0.1 for unreliable. The weights are a first guess and have not been tested against real outcomes.
- A check with more than one claim opens with a tally of its verdicts.
- A quote that is a row of a table is shown as a table, never as a run of numbers. For a row under year headings, the headings are put back from the saved page, and a year marked `e` or `f` is labelled as an estimate or a forecast. For a row of a Markdown table, the heading row is put back, and the table's first rows are drawn as a bar chart with the quoted row in colour. Every figure is read from the saved page by code.
- A claim written in the reader's other language has its translation under it. The extraction model writes it in the same call that extracts the claim, and a translation that loses a figure of the original is dropped. The claim itself is never replaced.

### Questions before the search

- After extraction and before any search, the research model reviews the claims. It only asks when a search would have to guess what a claim is about. Whether a claim is true is never a reason to ask: that stays with the judges.
- A link, a file or a long paste with several claims asks the reader to select which claims to check, select all, or type what to check instead. Short typed text checks every claim it holds.
- An unclear claim offers the model's likely answers, checking it as written, or a typed answer. Every question ends with an "Other" row to type in. At most `max_review_questions` are asked, one per claim, and only about the claims the reader picked.
- A claim the reader clarified is rewritten by the extraction model, so its search query and charts fit. If that fails the check fails, rather than giving a verdict that ignores the answer. If the review itself fails, the claims go ahead as written and the failure stays on screen.
- A waiting check is `awaiting_input`, with what it needs saved on `Check.review`. Nothing runs while it waits, and it survives a server restart.

### Charts and maps

- Chart numbers come from data services or are checked word for word against a source quote, never taken from a model as is.
- Pie charts use one cited source. They can show a complete distribution or a verified share of a whole with a clearly labelled calculated remainder.
- Judges never see charts. A chart that fails or is incomplete costs only the chart.
- The match card shows a completed result from the claim's evidence. Shootout scores, match events and esports map scores appear when the same source supports them.
- Match cards resolve club and esports crests and national-team flags from a local identity catalog. The image sources are recorded in `frontend/public/team-logos/manifest.json`.
- Country comparisons open on a rotatable globe, with a flat map available through the view toggle. The radial chart compares selected countries with figures for the same year. For GDP and population, slice angles represent shares within that group. For GDP per person and life expectancy, slices have equal angles and their lengths represent the values.
- Selecting places on the map updates the history chart. One place has a filled area, and multiple places have separate lines. Hovering over a year shows the available figures.
- A claim about how one country divides by age or sex gets a population pyramid in place of the country map. A rule that only applies to some ages, or a comparison of countries, gets none.
- The USD/VND chart is the market rate, so a claim about a bank's, the State Bank's or a free-market rate gets none. Yahoo's history has wrong days, such as 189 dong to the dollar, so a day far from the week around it is dropped.
- Keep the map and data credits (Highcharts, World Bank). Vietnam maps always show Hoàng Sa and Trường Sa.

### Follow-up chat

- Follow-up questions use the saved check, the selected reply context and earlier exchanges. Answers stay conversational and brief, come from the model the reader selected, and each one is a paid model call, capped per check.
- When the context is enough, the model answers directly. Otherwise it issues at most one search query, with no source quota. No separate research model is used for follow-ups, and search errors do not switch models.
- Search uses provider-native web search on endpoints advertising that capability, otherwise a Tavily tool called by the same model. Native requests are pinned to capable endpoints so OpenRouter cannot silently substitute Exa.
- Tavily returns at most two results and rereads at most one page, reusing returned page text instead of fetching every page again.
- New search citations are saved on the chat message, separately from the original evidence, and never change a verdict.

### Accounts

- Accounts are a username and a password, nothing else: no email, no outside sign-in. Passwords are Argon2id hashes. A session is an HttpOnly, SameSite=Lax cookie whose token the database keeps only as a SHA-256.
- Every check belongs to the user who started it. Everything hanging off a check (claims, sources, verdicts, follow-ups, feedback, "Checked before") is reached through it, so `owned_check` and `owned_claim` guard it all. Someone else's check answers 404, like a missing one.
- A check with no owner, as saved before accounts existed, is hidden from everyone.
- Settings holds each reader's search preferences: the search model, the source language, a search prompt of up to 500 characters, sources and searches per claim, and whether to search beyond the approved sources. A new check saves a copy of them, so changing them later doesn't change a check already running. Limits left at the server's number stay unset and follow `backend/config/settings.py`.
- Only the research model reads the search prompt, as a `reader_guidance` block it treats as a preference and never as an instruction. Judges never see it, so it can't steer a verdict.

### Party identity images

The seat-count table uses a country-scoped registry covering 20 countries. It matches names and abbreviations locally, preserves the chart's colour keys, and falls back to the colour marker for unknown parties or missing images. This is a curated identity catalogue, not an authoritative register of every party or a live election roster. It includes some previous names needed by saved checks.

`frontend/scripts/party-sites.tsv` contains names, aliases and party website domains. `python3 frontend/scripts/sync-party-logos.py` caches images under `frontend/public/party-logos/` and regenerates the TypeScript lookup. It prefers the election authority's Canadian logos, then the party website's identity icon. `manifest.json` records each source and flags missing assets. Review additions and images before publishing; identity artwork remains with its respective party. The app does not contact image services at runtime.

## For AI agents

Treat everything under [How it behaves](#how-it-behaves) as design choices to keep. If a task seems to need breaking one, say so first.

### Rules

- Commit or push only when asked. No AI attribution or `Co-Authored-By` lines. Never stage `.claude/` or `.env`.
- `ATI` tracks `origin/demo_fastapi`.
- Don't invent metrics, quotes or sources. Say what was really run and what only ran against fakes.
- The interface is minimal and light, with the fonts Schibsted Grotesk and Space Grotesk, indigo and orange, and green or red only for verdicts and for which way a source points. Results sit on the page itself, split by hairlines, without filled boxes. Skip decorative labels and number tags.
- Update this README in the same change when a path, command or behaviour described here changes.

### When you change something

| If you change | Also do |
|---|---|
| Backend code | From `backend/`: `uv run pytest && uv run ruff check` |
| Frontend code | From `frontend/`: `npm test && npx tsc --noEmit` |
| Charts or maps | Check them in a browser; frontend tests stub them |
| Prompt wording | Bump `prompt_version` in `backend/config/settings.py` |
| A backend library | From `backend/`: `uv add NAME`, which updates `pyproject.toml` and `uv.lock` together |
| Tables in `backend/database/models.py` | Generate a migration (command in [Tests and everyday commands](#tests-and-everyday-commands)) |
| Judge models | Edit `backend/config/data/judges.json` only; the frontend reads the same file |
| Source ratings | Edit `backend/config/data/source_ratings.json` only; the frontend reads the same file |
| API response shapes | Keep `frontend/src/types/models.ts` and `backend/app/api/schemas.py` matching |
| Any `t('…')` string | Add its Vietnamese entry to `frontend/src/lib/vi.ts` |

## Status and open questions

- Live OpenRouter and Tavily checks have only been run a few times, and accuracy hasn't been measured. The accuracy score's weights are untested for the same reason.
- Table quotes are only rebuilt for rows under year headings and for Markdown tables. Other tables still show as one line.
- The course report differs from the code: it describes a trusted corpus and an NLI layer, where the code uses web search and two LLM judges. The verdict labels and the default judge pair are still undecided.
- Not built: OCR, screens for stats and feedback, password reset and account deletion. A signed-in user can publish corrections to their own checks only.
- The check and login limits are per server process, kept in memory.
