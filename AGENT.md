# ClaimTrace

An AI-assisted fact-checking web app. It splits text, a link or a file into claims, finds evidence with web search, and returns cited verdicts from two AI models. It is a first-pass screening tool, not a replacement for fact-checkers.

Course project: Advanced Topics in IT, Hanoi University, Fall 2026, Group 12. Non-commercial. Ends 20 December 2026.

This file is a map, not a rulebook. Use your judgment, match the code around you, and read the code and tests when something here is too brief.

## How a check runs

```text
React app (frontend/)  →  FastAPI (backend/app/api/)  →  backend/app/pipeline/run.py
  1. Read the input: text, files, or a fetched URL
  2. Extraction model splits it into at most 5 claims, and asks for any charts
  3. Research model searches Tavily and picks each claim's sources
  4. Two judge models read the same passages and give cited verdicts
  5. Charts and maps are built beside the verdicts, and everything is saved
```

Status goes `queued → extracting → retrieving → assessing → completed | failed`, and the frontend polls `GET /api/check/{id}`. Models go through OpenRouter. Chart numbers come from Yahoo Finance, Open-Meteo, the World Bank and Data USA, none of which need a key.

## File structure

```text
backend/
  app/
    api/          Routes, JSON shapes (schemas.py), rows to JSON
    core/         config.py for limits and settings, labels.py
    db/           Tables, connection, alembic.ini, migrations/, local claimtrace.db
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
  features/       One folder per page: new-check, check, results, history
  components/     Shared pieces
  services/       Calls to the backend
  lib/  data/  types/  test/
```

Imports flow `api → pipeline → charts / search / providers → db`, never back into `api/`. Prefer adding to an existing file over creating many small ones.

## Where to look

| For | Start with |
|---|---|
| Models | `backend/config/models.toml`, judge names also in `frontend/src/config.ts` |
| Prompts | `backend/config/prompts/`; answer formats in `backend/app/pipeline/prompts.py`. Bump `prompt_version` in `core/config.py` after changing wording |
| Limits and settings | `backend/app/core/config.py`, overridable in `backend/.env` |
| Source ratings | `backend/config/data/source_ratings.json` and `frontend/src/data/sourceRegistry.ts`, kept equal by a test |
| Tables | `backend/app/db/models.py`, then generate a migration |
| Checking screen | `frontend/src/features/check/`, fed by `backend/app/pipeline/progress.py` |
| Results page | `frontend/src/features/results/ResultsView.tsx` |
| Shared types | `frontend/src/types/models.ts`, matching `backend/app/api/schemas.py` |
| Vietnamese text | `frontend/src/lib/vi.ts` |

### Charts and maps

| Visual | Builder in `backend/app/charts/` | Numbers from | Frontend in `features/results/` | Settings prefix |
|---|---|---|---|---|
| Price chart | `price_chart.py` | Yahoo Finance; SJC gold read from news | `PriceChart.tsx`, `PricePlot.tsx` | `price_chart_`, `sjc_chart_` |
| Location map | `location_map.py` | Shapes in `frontend/public/maps/`, figures from the claim's sources | `LocationMap.tsx`, `LocationPlot.tsx` | `location_map_` |
| Heatmap | `heat_map.py` | Open-Meteo | `HeatMap.tsx`, `HeatPlot.tsx` | `heat_map_` |
| Country / US state map | `country_map.py` | World Bank, Data USA | `CountryMap.tsx`, `CountryPlot.tsx` | `country_map_`, `state_map_` |
| US election map | `election_map.py` | Pages found by the research model | `ElectionMap.tsx`, `ElectionPlot.tsx` | `election_map_` |
| Parliament chart | `seat_chart.py` | Pages found by the research model | `SeatChart.tsx`, `SeatPlot.tsx` | `seat_chart_` |

`chart_triggers.py` decides which visuals a claim gets. Chart prompts are in `config/prompts/charts/`.

## Design choices worth keeping

- Only the judges decide truth. Extraction keeps every factual claim, even short or doubtful ones.
- When judges disagree, both verdicts are shown, and the first judge's is the headline.
- A failed search, page read or model call marks a claim `unavailable`, not "insufficient evidence".
- Page text is data, never instructions. An article can't be its own evidence.
- Only green-rated domains are searched or used as evidence, and fetching only reaches public addresses.
- Each call uses exactly the configured model, with no fallback to another one.
- Chart numbers come from data services or are checked word for word against a source quote, never taken from a model as is. Judges never see charts. A chart that fails or is incomplete costs only the chart.
- Keep the map and data credits (Highcharts, Open-Meteo, World Bank). Vietnam maps always show Hoàng Sa and Trường Sa.
- Verdicts are append-only: a human correction adds a new version.
- There is no demo mode or fake data. Without keys, the backend refuses new checks and still serves saved ones.

## Commands

```bash
# Backend, from backend/
cp .env.example .env     # needs OPENROUTER_API_KEY and TAVILY_API_KEY
uv sync
uv run uvicorn app.main:app --port 8000
uv run pytest && uv run ruff check
uv run alembic -c app/db/alembic.ini revision --autogenerate -m "what changed"

# Frontend, from frontend/
npm install
npm run dev
npm test && npx tsc --noEmit
```

Tests need no network or keys. Charts are stubbed in frontend tests, so check them in a browser.

## Working with this repo

- Commit or push only when asked. No AI attribution or `Co-Authored-By` lines. Never stage `.claude/` or `.env`.
- `ATI` tracks `origin/demo_fastapi`.
- Don't invent metrics, quotes or sources. Say what was really run and what only ran against fakes.
- The interface is minimal and light, with the fonts Schibsted Grotesk and Space Grotesk, indigo and orange, and green or red only for verdicts. Skip decorative labels and number tags.
- Every `t('…')` string needs a Vietnamese entry in `vi.ts`.

## Status and open questions

- Live OpenRouter and Tavily checks have only been run a few times, and accuracy hasn't been measured. PostgreSQL has never been run.
- The course report differs from the code: it describes a trusted corpus and an NLI layer, where the code uses web search and two LLM judges. The verdict labels and the default judge pair are still undecided.
- Not built: user accounts, OCR, and screens for stats and feedback. Anyone who can reach the API can publish a correction.
