# ClaimTrace

An AI-assisted fact-checking web app. It extracts claims from text, a link or a file, retrieves evidence from trusted sources, and returns cited verdicts from two AI models.

| Folder | What it is | How to run it |
|---|---|---|
| `frontend/` | React, TypeScript, Vite | `npm install && npm run dev` |
| `backend/` | FastAPI pipeline and API | `uv sync && uv run uvicorn app.main:app --port 8000` |

The frontend always uses the backend, and there is no demo mode.

Architecture, a guide to the files, and project rules are in [`AGENT.md`](AGENT.md).
