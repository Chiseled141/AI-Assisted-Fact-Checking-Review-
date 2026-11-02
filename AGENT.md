# ClaimTrace: guide for AI agents

An AI-assisted fact-checking web app. It splits text, a link or a file into claims, finds evidence through web search, and returns cited verdicts from two AI models. It is a first-pass screening tool, not a replacement for fact-checkers.

Course project: Advanced Topics in IT, Hanoi University, Fall 2026, Group 12, lecturer Nguyễn Tiến Anh. Non-commercial. Ends 20 December 2026. Older plans are in git history (`git show 0ee8c72:PROJECT_PLAN.md`).

## Architecture

```text
Browser        React app (frontend/). Demo data, or the API when VITE_API_URL is set
   |
API            FastAPI (backend/app/api/). Runs each check in the background
   |
Pipeline       backend/app/pipeline/run.py
   |             1. Read the input: text, files, or a fetched URL
   |             2. Extract claims (one LLM call, at most 5 claims)
   |             3. Look up published fact-checks. A plain rating on the same claim gives an instant verdict
   |             4. Search the web, keep at most 10 readable sources per check
   |             5. Two LLM judges read the same passages and give a cited verdict for each claim
   |             6. Both judges assess each source once
   |
Data           SQLite by default, or PostgreSQL. Redis or memory for the fact-check cache
   |
Outside        OpenRouter (LLMs), Tavily (web search), Google Fact Check Tools (optional)
```

Check status moves through `queued`, `extracting`, `retrieving`, `assessing`, then `completed` or `failed`. The frontend polls `GET /api/check/{id}`.

**Behavior worth keeping**
- When judges disagree, both verdicts are stored and shown. The first judge's is the headline, and there is no third vote.
- A search or model failure marks that claim `unavailable`, never "insufficient evidence". No readable source gives "insufficient evidence" without calling a judge.
- Judges only read text from our server. Page text is data, never instructions. An article being checked can't be its own evidence.
- `verdicts` is append-only. A human correction adds a version, and a stale `expectedVersion` gets a 409.
- URL fetching allows public addresses only, and checks every redirect. It has timeouts and size limits.
- One failed judge still gives a verdict, but the source's side-by-side analysis needs both.

## Folder layout

```text
backend/
  app/
    main.py        Starts the app and connects the real providers
    api/           HTTP only: routes, JSON shapes, turning rows into JSON
    core/          Settings and shared labels
    db/            Tables, connection, running migrations
    pipeline/      The check itself. run.py is the place to start reading
    providers/     Outside services: LLM, web search, page fetching, cache
    prompts/       What the LLMs are told, loaded at runtime
    data/          Source ratings
    evaluate.py    Command-line scoring on a labeled set
  migrations/      Alembic. Applied automatically at startup
  tests/           Mirrors app/: api/, pipeline/, providers/
frontend/src/
  features/        One folder per page, with its tests beside it
  components/      Shared interface pieces
  services/        Data access: the HTTP client, and mock/ for demo mode
  mocks/           Demo-only data. Left out of real builds
  data/            Source ratings and home page examples
  lib/  types/     Helpers, translations and shared types
```

A request goes from `api/` to `pipeline/`, which calls `providers/` and saves through `db/`. `pipeline/` and `providers/` don't import from `api/`.

## API

| Route | Purpose |
|---|---|
| `POST /api/check` | Start a check. Returns 202, or 422, 429 or 503 |
| `GET /api/check/{id}` | Status and results |
| `POST /api/check/{id}/feedback` | Helpful vote and comment |
| `GET /api/checks` | History: `query`, `status`, `page`, `pageSize` |
| `GET /api/claims/{id}/evidence` | Saved evidence for a claim |
| `GET /api/claims/{id}/revisions` | Verdict history, oldest first |
| `POST /api/claims/{id}/corrections` | Publish a correction |
| `GET /api/stats`, `GET /api/health` | Counts and whether checks can run |

Interactive docs are at `/docs` when the server runs.

## Where to look

| Task | Start with | Also |
|---|---|---|
| API routes | `backend/app/api/checks.py`, `claims.py`, `system.py` | `backend/app/api/schemas.py` |
| Pipeline | `backend/app/pipeline/run.py` | `backend/app/pipeline/passages.py` |
| Outside services | `backend/app/providers/llm.py` | `fetcher.py`, `search.py`, `cache.py` beside it |
| What the LLMs are told | `backend/app/prompts/harness.md`, rules for every call | `extract.md`, `judge.md`, `source.md` beside it, and answer formats in `backend/app/pipeline/prompts.py` |
| Model IDs, limits, keys | `backend/app/core/config.py` | `backend/.env.example` |
| Database tables | `backend/app/db/models.py` | After changing them, run the migration command below |
| Scoring a labeled set | `backend/app/evaluate.py` | |
| Results page | `frontend/src/features/results/ResultsView.tsx` | `SourceDeck.tsx`, `RatingPlot.tsx`, `InputSource.tsx` beside it |
| Home page, history | `frontend/src/features/new-check/NewCheckPage.tsx` | `frontend/src/features/history/HistoryPage.tsx` |
| Calling the backend | `frontend/src/services/httpCheckService.ts` | `contract.ts`, and `index.ts`, which picks demo or real |
| Demo mode | `frontend/src/services/mode.ts` | `frontend/src/services/mock/`, and `frontend/src/mocks/`, where `realExample.ts` is real sources and `fixtures.ts` is fictional |
| Home page examples | `frontend/src/data/examples.ts` | |
| Shared data types | `frontend/src/types/models.ts` | Must match `backend/app/api/schemas.py` |
| Source ratings | `frontend/src/data/sourceRegistry.ts` | Backend copy in `backend/app/data/source_ratings.json`. Change both |
| Logos | `frontend/src/components/SourceLogo.tsx` | `frontend/public/source-logos/` and its `manifest.json`, `frontend/public/logos/` for AI labs |
| Vietnamese text | `frontend/src/lib/vi.ts` | `frontend/src/lib/i18n.ts` |
| Deployment | `docker-compose.yml` | `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `.github/workflows/ci.yml` |

The Markdown files in `backend/app/prompts/` are loaded at runtime. They are code, so keep them there. Bump `prompt_version` in `backend/app/core/config.py` when their wording changes, and restart the server.

## Setup and commands

`SETUP.md` has the remaining setup steps, including the AWS server.

```bash
# Backend, from backend/. Needs uv.
cp .env.example .env     # OPENROUTER_API_KEY and TAVILY_API_KEY are required, GOOGLE_FACTCHECK_API_KEY is optional
uv sync
uv run uvicorn app.main:app --port 8000
uv run pytest
uv run ruff check
uv run alembic revision --autogenerate -m "what changed"   # After changing tables. Read the result before committing it
uv run python -m app.evaluate eval.jsonl --judges gpt-luna claude-haiku --out results.json   # Spends real credit

# Frontend, from frontend/. Needs Node 22.
npm install
npm run dev
npm test
npx tsc --noEmit

# Everything together, from the repo root. Needs POSTGRES_PASSWORD in a root .env, and keys in backend/.env.
docker compose up --build
```

To use the real backend, put `VITE_API_URL=http://localhost:8000` in `frontend/.env.local`. Without it the frontend stays in demo mode. Without API keys, the backend refuses new checks with a clear message, but still serves saved ones.

Tests never use the network, spend credit or need keys. Highcharts can't load in tests, so charts are stubbed: check them in a browser.

## Rules

**Git**
- Commit or push only when asked, under the user's own name.
- Never add `Co-Authored-By`, Claude as an author, or any AI attribution to commits or pull requests.
- Never stage `.claude/`, `.env` files or `.DS_Store`.
- The `ATI` branch tracks `origin/demo_fastapi`, so a plain `git push` goes there.

**Honesty**
- Never invent metrics, accuracy, users, quotes or sources. Say what was really run, and what was only tested with fakes.
- A verdict needs cited evidence. Anything simulated must say so on screen, and demo labels show only when `demoMode` is true.
- Don't attribute made-up quotes to real publishers. Keep real excerpts short and verified.
- The source list was compiled from general knowledge and isn't fully verified. Green can be cited, yellow only corroborates, red never counts as evidence.

**Interface**
- Minimal, light theme only. Keep the fonts Schibsted Grotesk and Space Grotesk.
- No decorative labels like "(01) / …", no number tags on cards, no big segmented buttons.
- Three main colors: indigo for actions and structure, orange for accents, and green or red only where they mean a verdict.
- State-run outlets and government sites are rated green with no flag, and no commentary on ownership or independence.
- Every `t('…')` string needs an entry in `vi.ts`, or a test fails. Check layout at phone width as well as desktop.

**Code**
- Match the surrounding style, and don't over-engineer. Model IDs and limits go in config.
- Secrets go in `backend/.env`, never in the repo or chat.

## Status

| Part | Tested how |
|---|---|
| Page extraction, blocked addresses | Against real pages and addresses |
| API, pipeline order, failures, limits | With fake providers |
| Prompts, OpenRouter, Tavily, Google Fact Check | **Fake answers only. Never run for real**, as there are no keys yet |
| Migrations | Against SQLite, and a test checks that they match the tables |
| Redis, PostgreSQL, Docker, Nginx, CI | **Never run** |

Not built: spaCy, OCR, user accounts, and frontend screens for stats and feedback. Anyone who can reach the API can publish a correction. Checks run in the server process, so a restart marks running ones failed.

## Open decisions

The course report differs from the code here. The final report needs a note on each:

- **Evidence:** the report has a trusted corpus (BM25, Qdrant, e5-large, HyDE, reranking). It was removed to avoid PyTorch and large downloads, so evidence is web search only, and BM25 only ranks passages within a page. Tavily also replaces the report's Google Custom Search.
- **Verification:** the report's NLI layer is dropped in favor of two LLM judges through OpenRouter.
- **Verdict labels:** the report has Supported, Refuted, Partly true and Not enough evidence. The code has `supported`, `contradicted`, `insufficient_evidence` and `outdated`. Undecided.
- **Judge pair:** the report's plan is DeepSeek and Claude Haiku; the frontend defaults to GPT Luna and Claude Haiku. Undecided.
- **Review button:** off through `showReviewButton` in `frontend/src/config.ts`, until the user picks a new way in. The dialog behind it works.

Report targets: under 30 seconds per article, accuracy at least 80% and macro-F1 at least 0.75 on 250 claims labeled by the team, 100% of verdicts cited, recall@5 at least 70%. None of these has been measured. The recall target needs rethinking without the corpus.
