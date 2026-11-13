# ClaimTrace

ClaimTrace is an AI-assisted fact-checking web app. You give it some text, a link or a file. It pulls out the factual claims, searches the web for evidence, and has two AI models give each claim a verdict with citations.

It is meant as a first-pass screening tool to help fact-checkers, not to replace them.

Course project for Advanced Topics in IT, Hanoi University, Fall 2026, Group 12. Non-commercial. The project ends on 20 December 2026.

## Features

- **Claim extraction:** splits text, a web page or an uploaded file into up to 5 checkable claims.
- **Evidence search:** searches the web with Tavily, starting from a list of rated, trusted sources.
- **Two independent judges:** two different AI models read the same evidence and each give a cited verdict. If they disagree, both reviews are shown side by side.
- **Clarifying questions:** if a claim is too vague to search for, the app asks you what you meant before it searches.
- **Charts and maps:** price charts, country and election maps, parliament seat charts, pie and bar charts, route and incident maps, and match result cards, built from real data and never from model guesses.
- **Follow-up chat:** you can ask questions about a finished check or send corrections.
- **Accounts and settings:** each person sees only their own checks. Settings let you pick the search model, the source language, blocked sites and other search limits, or use your own OpenAI-compatible API provider.
- **English and Vietnamese:** the interface is in both languages, and claims written in the other language show a translation.

## Tech stack

| Part | Built with |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, Highcharts |
| Backend | Python 3.11–3.12, FastAPI, SQLAlchemy, Alembic, uv |
| Database | PostgreSQL (SQLite in memory for tests) |
| AI models | OpenRouter, or any OpenAI-compatible API |
| Web search | Tavily |
| Chart data | Yahoo Finance, World Bank, Data USA, OpenStreetMap (no API keys needed) |

## Getting started

You need [uv](https://docs.astral.sh/uv/), Node.js and PostgreSQL, plus an OpenRouter API key and a Tavily API key.

### 1. Set up the database

On macOS with Homebrew:

```bash
brew install postgresql@17
brew services start postgresql@17
/opt/homebrew/opt/postgresql@17/bin/createuser claimtrace
/opt/homebrew/opt/postgresql@17/bin/createdb -O claimtrace claimtrace
```

### 2. Start the backend

Create a file called `.env` at the top of the repository with your API keys:

```bash
OPENROUTER_API_KEY=your-openrouter-key
TAVILY_API_KEY=your-tavily-key
```

The database defaults to `postgresql+psycopg://claimtrace@localhost:5432/claimtrace`, which matches step 1. To use a different one, add a `DATABASE_URL` line. When the site is served over HTTPS, also add `SESSION_COOKIE_SECURE=true`. Any setting in `backend/src/claimtrace/config/settings.py` can be overridden the same way, using its name in capital letters. Never commit `.env`.

Then, from `backend/`:

```bash
uv sync
uv run uvicorn claimtrace.main:app --app-dir src --port 8000
```

The database tables are created or updated automatically when the server starts. The API docs are at http://localhost:8000/docs.

### 3. Start the frontend

From `frontend/`:

```bash
npm install
npm run dev
```

Open http://localhost:5173 and create an account.

The frontend needs no settings when you run it locally, because Vite forwards `/api` requests to the backend. If you ever need to point it at a different backend, set `VITE_API_URL` in `frontend/.env.local`. Use the same host name for both, for example `localhost` for both rather than `localhost` and `127.0.0.1`, or the browser may reject the login cookie.

Without API keys, the backend still shows saved checks but refuses new ones. There is no demo mode or fake data.

### Using your own model provider

In Settings, turn on **Use a third-party API** and enter:

- the provider's HTTPS base URL (for example `https://api.example.com/v1`)
- your API key
- one model ID for extraction, research, charts and follow-ups
- two different model IDs for the judges

The provider must support Chat Completions and function calling. If it doesn't support JSON response format, turn that option off. Web search still uses the server's Tavily key, but OpenRouter isn't needed.

Your API key is kept only in the server's memory, and is never saved to the database or sent back to the browser. You need to enter it again after the server restarts, or after 30 days. Older checks keep the provider they were run with.

## Running the tests

Backend, from `backend/`:

```bash
uv run pytest
uv run ruff check
```

Frontend, from `frontend/`:

```bash
npm test
npx tsc --noEmit
```

The tests don't need a network connection or API keys. The backend tests use an in-memory SQLite database. To run them against PostgreSQL instead, set `TEST_DATABASE_URL` to a separate test database (it gets wiped):

```bash
TEST_DATABASE_URL=postgresql+psycopg://claimtrace@localhost:5432/claimtrace_test uv run pytest
```

Charts are stubbed in the frontend tests, so check those in a browser.

## How a check works

1. **Read the input:** typed text, uploaded files, or the text of a web page.
2. **Extract claims:** a model splits the input into at most 5 claims and suggests any useful charts.
3. **Review:** a model looks over the claims. If one is too vague to search for, or the input contains many claims, the check pauses and asks you.
4. **Research:** the model searches Tavily and picks sources for each claim.
5. **Judge:** two judge models read the same passages and each give a verdict with quotes.
6. **Charts:** charts and maps are built from data services or from figures quoted in the sources, and everything is saved.

A check moves through these statuses: `queued → extracting → (awaiting_input) → retrieving → assessing → completed`, or ends as `failed` or `stopped`. The frontend checks its progress by polling `GET /api/check/{id}`.

## Project structure

```text
backend/
  src/claimtrace/       The backend, one Python package
    main.py             Starts the server
    api/                REST API routes, request and response shapes, login
    core/               The fact-checking logic
      pipeline/         One check from input to verdicts (starts in run.py)
      charts/           Chart and map builders
      search/           Tavily search and page reading
      providers/        Calls to the AI models
      prompts/          Instructions given to the models
      evaluate.py       Script for comparing judge models on saved claims
    db/                 Database tables and migrations
    config/             Settings, model choices and data files
  tests/                Backend tests, in the same layout as src/claimtrace
  pyproject.toml        Dependencies and tool settings
frontend/
  public/               Logos, map shapes and other static files
  scripts/              Script that updates the party logos
  src/
    features/           The app's pages: new check, check chat, results, history, account, settings
    components/         Shared UI components
    services/           Calls to the backend API
    lib/                Helpers, formatting and the Vietnamese translations
    data/               Source, party and team lookups
    types/              Shared TypeScript types
.env                    Your API keys and settings (not committed, see Getting started)
```

The backend code is layered: `api` uses `core`, `core` uses `db`, and all of them read `config`.

The frontend reads two files directly from the backend's `config/data/` folder: the list of judge models (`judges.json`) and the source ratings (`source_ratings.json`). That way both sides use the same list, but it also means the frontend needs the `backend/` folder next to it to build.

### Where things are

| Topic | Files |
|---|---|
| Which models are used | `backend/src/claimtrace/config/models.toml`, `config/data/judges.json` |
| Limits and settings | `backend/src/claimtrace/config/settings.py` (each can be overridden in `.env`) |
| Prompts | `backend/src/claimtrace/core/prompts/` |
| Source ratings | `backend/src/claimtrace/config/data/source_ratings.json` |
| Database tables | `backend/src/claimtrace/db/models.py` |
| Main pipeline | `backend/src/claimtrace/core/pipeline/run.py` |
| Follow-up answers | `backend/src/claimtrace/core/pipeline/followup.py` |
| Login and accounts | `backend/src/claimtrace/api/auth.py` |
| Results page | `frontend/src/features/results/` |
| Check chat | `frontend/src/features/check/CheckPage.tsx` |
| Settings page | `frontend/src/features/settings/SettingsPage.tsx` |
| Vietnamese text | `frontend/src/lib/vi.ts` |

## Design decisions

### Verdicts and evidence

- Only the two judge models decide whether a claim is true. The extraction step keeps every factual claim, even short or doubtful ones.
- If the judges disagree, the result says so and shows both reviews.
- If a search, page or model call fails, the claim is marked **unavailable** rather than "not enough evidence".
- Research starts with sources rated as reliable. If those find nothing usable, a wider search can include other original reporting, but never known unreliable sources, tabloids or social media.
- For claims about a public figure's statement, the app can look for the post on that person's official account.
- Text on a web page is always treated as data, never as instructions to the model, and an article can't be used as evidence for itself.
- Inputs that try to trick the model, spam, and requests that aren't fact-checking (such as "write me an ad") are recognised and answered with an explanation instead of a verdict. Real claims mixed into such input are still checked.
- Each step uses exactly the model it is configured for, with no silent fallback to another model.
- Verdicts are never overwritten. A human correction is saved as a new version.
- You can stop a running check, and delete checks from your history.

### Results

- Each verdict has a summary strip: an accuracy score from 0 to 100, how many sources support or contradict the claim, and each judge's verdict and confidence.
- The accuracy score is 60% from the judges' verdicts and confidence, and 40% from the sources, weighted by how reliable each source is. These weights are a first guess and haven't been tested against real outcomes.
- **Checked before** shows earlier checks of the same claim. It matches by text only, and every number must match.
- Quotes taken from a table are shown as a table, with the headings restored from the original page.

### Charts and maps

- Chart numbers always come from a data service, or are matched word for word against a quote from a source. They are never taken from a model's answer.
- The judges never see the charts, so a broken chart can't affect a verdict.
- Maps of Vietnam always show the Hoàng Sa and Trường Sa islands.
- Map and data credits (Highcharts, World Bank) are kept on every chart.

### Accounts and privacy

- An account is just a username and password, with no email and no outside sign-in.
- Passwords are hashed with Argon2id. Sessions use an HttpOnly cookie, and the database stores only a hash of the session token.
- Every check belongs to the person who started it. Anyone else gets a "not found" error, the same as for a check that doesn't exist.
- Your Settings are copied onto each new check, so changing them later doesn't affect checks that have already started. Blocked sites can only narrow the trusted source list, never widen it.

### Follow-up chat

- Follow-up answers use the saved check and the earlier conversation, and stay short.
- When the saved check isn't enough, the model can run one extra web search. New sources found this way are saved with the answer and never change a verdict.

### Party logos

The parliament seat chart shows party logos for 20 countries. `frontend/scripts/sync-party-logos.py` downloads them from the list in `frontend/scripts/party-sites.tsv`, and `frontend/public/party-logos/manifest.json` records where each one came from. The app never contacts image services while it runs. The logos belong to their parties.

## Contributing

- Run the backend and frontend tests before committing.
- If you change a prompt, increase `prompt_version` in `backend/src/claimtrace/config/settings.py`, so each verdict records which prompts produced it.
- If you change a database table, create a migration from `backend/`:

  ```bash
  uv run alembic -c src/claimtrace/db/alembic.ini revision --autogenerate -m "what changed"
  ```

- Add backend libraries with `uv add NAME`, so `pyproject.toml` and `uv.lock` stay in sync.
- Keep `frontend/src/types/models.ts` in step with `backend/src/claimtrace/api/schemas.py`.
- Every interface string wrapped in `t('…')` needs a Vietnamese version in `frontend/src/lib/vi.ts`.
- The interface is minimal and light: Schibsted Grotesk and Space Grotesk fonts, indigo and orange, with green and red used only for verdicts.

## Known limitations

- Accuracy hasn't been measured yet. The app has only been run a few times against the live models and search.
- The protections against prompt injection are tested for coverage, but not against real attacks.
- Table quotes are only rebuilt for tables with year headings and Markdown tables.
- The course report describes a trusted document collection and an NLI model. The code uses web search and two LLM judges instead. The final verdict labels and the default pair of judges are still being decided.
- Not built yet: OCR, statistics and feedback screens, password reset and account deletion.
- Rate limits and saved custom API keys are kept in memory, so they assume a single server process.
