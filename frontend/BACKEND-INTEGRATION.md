# ClaimTrace frontend → backend integration guide

Read this before implementing the backend. It describes the frontend that exists today, the exact JSON it
expects, and the single place where HTTP is wired.

**Status:** the frontend is a demo. It makes no network calls, uses fixtures plus `localStorage`, and labels itself
as simulated. `PROJECT_PLAN.md` plans a FastAPI backend for this coursework branch; a few code comments still say
"Spring Boot" from the portfolio branch — ignore the framework names, the HTTP contract below is what matters.

## 1. How the frontend gets data

Every screen reads through one module: [`src/services/index.ts`](src/services/index.ts), which exports
`checkService` typed by [`src/services/contract.ts`](src/services/contract.ts). The demo implementation is
[`src/services/mock/mockCheckService.ts`](src/services/mock/mockCheckService.ts).

| Screen / route | Calls |
| --- | --- |
| New Check `/` | `createCheck()` then navigates to `/checks/{id}` |
| Check `/checks/:checkId` | `getCheck()` every 600 ms until `completed` or `failed` |
| Results (same route) | `getClaimEvidence()`, `getClaimRevisions()`, `publishCorrection()` |
| History `/history` | `listChecks({ query, status, page })` |

`CheckPage` chooses the view from `status`: processing stages → live brief, `failed` → failure page, `completed` →
results. The UI never calls AI or search providers directly, and no API keys may reach the browser.

## 2. Wire the backend in one place

Do not scatter `fetch` calls through components. Add an HTTP implementation and swap the export:

1. Create `src/services/http/httpCheckService.ts` implementing `CheckService`.
2. Map errors (section 8) to the existing classes in `src/services/errors.ts`.
3. Export it from `src/services/index.ts` instead of `mockCheckService`.
4. Remove the demo-only pieces (section 11) only once the real endpoints work.
5. Keep the tests green or update them (section 12).

Minimal shape of the adapter:

```ts
// src/services/http/httpCheckService.ts
import type { CheckService } from '../contract';
import { NotFoundError, ValidationError, VersionConflictError } from '../errors';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) } : init.headers,
    // credentials: 'include', // add if the backend uses cookie sessions
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.ok) return body as T;

  const detail = body?.detail ?? body?.message;
  const message = typeof detail === 'string' ? detail : res.statusText;
  if (res.status === 404) throw new NotFoundError(message);
  if (res.status === 400 || res.status === 422) throw new ValidationError(message);
  if (res.status === 409) {
    throw new VersionConflictError(body?.expectedVersion ?? 0, body?.currentVersion ?? 0);
  }
  throw new Error(message || 'Request failed');
}

export const httpCheckService: CheckService = {
  createCheck: (input) => {
    const payload = { ...input };
    delete payload.scenario; // `scenario` is demo-only
    return request('/api/check', { method: 'POST', body: JSON.stringify(payload) });
  },
  getCheck: (id) => request(`/api/check/${encodeURIComponent(id)}`),
  listChecks: ({ query = '', status = 'all', page = 1 } = {}) =>
    request(`/api/checks?query=${encodeURIComponent(query)}&status=${status}&page=${page}`),
  getClaimEvidence: (claimId) => request(`/api/claims/${encodeURIComponent(claimId)}/evidence`),
  getClaimRevisions: (claimId) => request(`/api/claims/${encodeURIComponent(claimId)}/revisions`),
  publishCorrection: (claimId, correction) =>
    request(`/api/claims/${encodeURIComponent(claimId)}/corrections`, {
      method: 'POST',
      body: JSON.stringify(correction),
    }),
};
```

`VITE_API_BASE_URL` should be empty when using a Vite dev proxy (section 10), otherwise e.g.
`http://localhost:8000`.

The project's `tsconfig.json` does not include Vite's client types, so `import.meta.env` will not type-check until you
add `src/vite-env.d.ts` containing `/// <reference types="vite/client" />` (or add `"vite/client"` to `compilerOptions.types`).

## 3. Endpoints

Route names are suggestions. The report uses `/api/check` for create and get; the plural forms below are the bonus
endpoints. Whatever you choose, the adapter must map to them. Keep IDs URL-safe (no `/` or `?`).

| `CheckService` method | Suggested endpoint | Returns |
| --- | --- | --- |
| `createCheck(input)` | `POST /api/check` | full `Check` (201/202) |
| `getCheck(id)` | `GET /api/check/{id}` | `CheckDetail` |
| `listChecks(params)` | `GET /api/checks?query=&status=&page=` | `Page<Check>` |
| `getClaimEvidence(claimId)` | `GET /api/claims/{id}/evidence` | `EvidenceSnapshot[]` |
| `getClaimRevisions(claimId)` | `GET /api/claims/{id}/revisions` | `AssessmentRevision[]`, oldest first |
| `publishCorrection(claimId, request)` | `POST /api/claims/{id}/corrections` | `{ claim, revision }` |

`/api/check/{id}/feedback` and `/api/stats` from the report are not consumed by the UI yet.

### POST /api/check

Accept JSON (recommended, files are already plain text) with:

```json
{
  "inputType": "text",
  "text": "The Harbor Line was finished under budget...",
  "files": [{ "name": "notes.txt", "size": 512, "text": "..." }]
}
```

or `{ "inputType": "url", "url": "https://..." }`. The current client may also send `"scenario"`; ignore it and
remove it with the demo code.

Return a complete `Check` immediately — do not hold the request until processing finishes. The UI navigates to
`/checks/{id}` as soon as this resolves. If you follow the report and return only `{ "check_id": "..." }`, adapt the
client to fetch the check before returning. Validate input again on the server; client validation is UX only.

### GET /api/check/{id}

Return `CheckDetail`: the `Check` fields plus a `claims` array (empty while processing). Include the submitted
`inputText`/`inputUrl` and `files` metadata; the results page displays them.

Once `status` is `completed`, each claim must include its latest revision in `current`, with `currentVersion`
matching it. Evidence is fetched separately, so it need not be embedded.

### GET /api/checks

| Parameter | Allowed values | Notes |
| --- | --- | --- |
| `query` | free text | case-insensitive; search title, input text/URL, and file names |
| `status` | `all`, `processing`, `completed`, `failed` | `processing` = queued/extracting/retrieving/assessing |
| `page` | 1-based | page size 20 in the UI; accept `pageSize` or default to 20 |

Sort newest first. Return the `Page` envelope:

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 0, "totalPages": 1 }
```

`totalPages` must be at least 1. `items` are `Check` objects (no claims needed). History shows `claimCount`,
`files.length`, status, and the title.

## 4. Data shapes

The TypeScript source of truth is [`src/types/models.ts`](src/types/models.ts). JSON must be camelCase and use
these exact enum values:

| Type | Values |
| --- | --- |
| `CheckStatus` | `queued`, `extracting`, `retrieving`, `assessing`, `completed`, `failed` |
| `Verdict` | `supported`, `contradicted`, `insufficient_evidence` |
| `ClaimStatus` | `assessed`, `unavailable` |
| `EvidenceRelation` | `supporting`, `contradicting`, `contextual` |
| `RevisionKind` | `ai_assessment`, `human_correction` |
| `Freshness` | `current`, `outdated`, `unknown` |
| `InputType` | `text`, `url` |

Only `completed` and `failed` are terminal. Keep transitions forward-only and idempotent to reads.

Example `CheckDetail`:

```json
{
  "id": "chk_01H...",
  "title": "The Harbor Line was finished under budget...",
  "inputType": "text",
  "inputText": "The Harbor Line was finished under budget...",
  "status": "completed",
  "createdAt": "2026-11-01T00:07:00Z",
  "updatedAt": "2026-11-01T00:07:06Z",
  "claimCount": 1,
  "claims": [
    {
      "id": "clm_01",
      "checkId": "chk_01H...",
      "position": 1,
      "text": "The Harbor Line was finished under budget.",
      "timeContext": "2024",
      "status": "assessed",
      "evidenceIds": ["ev_01"],
      "currentVersion": 1,
      "current": {
        "id": "rev_01",
        "claimId": "clm_01",
        "version": 1,
        "kind": "ai_assessment",
        "verdict": "supported",
        "rationale": "Two independent sources place the cost below the estimate.",
        "citedEvidenceIds": ["ev_01"],
        "citationFreshness": { "ev_01": { "status": "current" } },
        "model": { "name": "deepseek-chat", "promptVersion": "assess-v3" },
        "author": "AI assessor",
        "createdAt": "2026-11-01T00:07:06Z"
      }
    }
  ]
}
```

`EvidenceSnapshot`:

```json
{
  "id": "ev_01",
  "claimId": "clm_01",
  "sourceTitle": "Harbor Line opens to passengers",
  "publisher": "Marlow City Transit Authority",
  "url": "https://example.org/mcta/news/harbor-line-opening",
  "excerpt": "Revenue service on the Harbor Line began on 18 March 2024...",
  "publishedAt": "2024-03-18",
  "updatedAt": "2024-03-20",
  "retrievedAt": "2026-11-01T00:07:04.210Z",
  "capture": {
    "url": "/captures/ev_01.png",
    "capturedAt": "2026-11-01T00:07:04.210Z",
    "width": 1280,
    "height": 800
  },
  "relation": "supporting"
}
```

Rules the UI depends on:

- **Claims** are sorted by `position` (1-based). `evidenceIds` order defines citation numbers `[1]`, `[2]`, ...
- **Revisions** are append-only, oldest first from `getClaimRevisions`; `version` starts at 1.
  `claim.currentVersion` equals `claim.current.version`. For `unavailable`, `current` is `null`,
  `currentVersion` is `0`, and `unavailableReason` is shown instead of a verdict.
- **Evidence is a snapshot**, not a live preview: save the excerpt and retrieval time at retrieval, and capture the
  page then. `capture.url` must be same-origin (`/...`) or HTTPS; `safeImageSrc` rejects other values.
- Dates: `createdAt`, `updatedAt`, `retrievedAt`, `capturedAt` are full ISO 8601 with a time zone. `publishedAt`
  and `updatedAt` on evidence are calendar dates only (`YYYY-MM-DD`) or omitted — not full timestamps.
- `citationFreshness` is keyed by evidence id and records applicability to the claim's time period, separately
  from the verdict. `outdated` requires a `reason`. Never infer it from age alone.
- `rationale`, `excerpt`, and `unavailableReason` are rendered as plain text. Escape nothing in JSON; React escapes.
- Use URL-safe ids. They appear in routes and API paths.

## 5. Processing and polling

- `POST /api/check` must return quickly (target < 2 s); processing continues in the background.
- The client polls `GET /api/check/{id}` every 600 ms; no websockets or SSE are needed.
- Report one of the six exact statuses. Any other value makes the progress screen fall back to "queued" and never
  finish. `completed` must include claims; `failed` must include a human-readable `errorMessage` and produces no
  verdicts. A failed check is retried by creating a new check from the same input.
- Partial provider failure is still `completed`; mark only the affected claim `unavailable` with a reason.
- The UI shows stages `queued → extracting → retrieving → assessing → completed`. If the backend does extra work
  (known-fact-check lookup, URL extraction), keep it inside these stages unless the frontend is extended.
- `claimCount` should equal the number of claims once extracted.

## 6. Corrections

`CorrectionRequest` (POST body):

```json
{
  "verdict": "contradicted",
  "reason": "The cited budget figure excludes land acquisition costs.",
  "evidenceIds": ["ev_01", "ev_02"],
  "attachments": [],
  "citationFreshness": { "ev_01": { "status": "outdated", "reason": "Predates the 2024 revision." } },
  "expectedVersion": 1
}
```

Server rules, also enforced in the UI:

- `reason` 10–1000 characters; never empty.
- `evidenceIds` must be a subset of the claim's `evidenceIds`; reviewers cannot invent evidence.
- `citationFreshness` keys must be cited; `outdated` needs a reason.
- `expectedVersion` must match the current revision. If not, return **409** with a body containing
  `expectedVersion` and `currentVersion` (the UI displays the current one). Never overwrite a newer revision.
- On success, append a `human_correction` revision and return the updated `claim` plus the new `revision`. The UI
  reloads the check afterward, so the claim must reflect the new `currentVersion` and `current`.
- Set `revision.kind` to `human_correction` and `revision.author` to the signed-in reviewer — never trust an `author`
  sent from the browser. Without auth (section 10), use a fixed label such as "Reviewer".
- The original AI assessment must be preserved in history.

Attachments are demo-shaped: base64 data URLs in `Attachment.dataUrl` (PNG/JPEG/WebP/GIF, up to 3). For production,
prefer multipart uploads and return URLs; that requires changing `Attachment` and `ScreenshotThumbs`, so agree on it
before implementing. Do not accept SVG or remote URLs.

## 7. Validation limits

Mirror these on the server (`src/config.ts` is the source):

| Input | Limit |
| --- | --- |
| Text | 20–5,000 characters |
| URL | ≤ 2,048 characters; http/https only; no credentials; real domain |
| Files | ≤ 3 plain-text files, ≤ 200 KB each, ≤ 20,000 characters each, `.txt`/`.md`/`.markdown` |
| Correction reason | 10–1,000 characters |
| Screenshots | ≤ 3; PNG/JPEG/WebP/GIF; ≤ 8 MB before client-side resize |

Files are read in the browser and sent as `{ name, size, text }`; validate size, count, and content again. URL
checks currently do not fetch anything — the backend must implement safe extraction (SSRF protection, redirects,
timeouts) for the report's URL mode.

## 8. Error contract

| HTTP | Client error | UI behavior |
| --- | --- | --- |
| 400 / 422 | `ValidationError(message)` | message shown in the form (creation or correction) |
| 404 | `NotFoundError` | "Check not found" page |
| 409 | `VersionConflictError(expected, current)` | conflict panel, reload latest, keep draft |
| 5xx / network | generic `Error` | "could not be loaded" / retry affordance |

Use `{ "detail": "human-readable message" }` for 400/422 (FastAPI's default). For 409 include the version numbers
at the top level. Do not return 200 with an error body.

## 9. Product mismatches to resolve, not guess

The current UI supports **three verdicts** (`supported`, `contradicted`, `insufficient_evidence`), **no confidence
score**, and **no overall article label**. `PROJECT_PLAN.md` describes four verdicts plus confidence for the report.
If the backend emits other labels or fields, nothing renders until the UI is extended. Agree on one of:

- map the model output into the three current verdicts, or
- extend the frontend first (badges, summary bar, correction form, fixtures, tests).

Likewise, a visible "known fact-check" stage, feedback (`/feedback`), and `/stats` require UI work; the backend can
compute them now but they are not displayed.

## 10. Auth, CORS, and deployment

- There is **no login UI and no token handling**. Decide with the team: single-user demo, or add auth and send
  cookies (`credentials: 'include'`) / a bearer token in the HTTP adapter. Scope history and corrections to a user;
  otherwise every visitor shares one list.
- Dev: add a Vite proxy so the SPA calls `/api` on port 5173. For example:
  `server: { proxy: { '/api': 'http://127.0.0.1:8000' } }` in `vite.config.ts`.
- Or allow CORS from `http://localhost:5173` for GET/POST, `Content-Type`, and credentials when used.
- Production: serve `dist/` and the API from the same origin behind Nginx, with a SPA fallback so `/checks/...` and
  `/history` load `index.html`. Long jobs belong in a worker/queue; a single request must not block.

## 11. Demo-only code to remove when live

| What | Where |
| --- | --- |
| Scenario selector and demo scenarios | `features/demo/`, `NewCheckPage.tsx`, `scenario` in `types/models.ts` |
| "Demo · simulated" badge | `DemoModeLabel` in `components/Badges.tsx`, used by `ProcessingView`/`FailedView` |
| Footer demo note | `components/Layout.tsx` ("Demo · simulated data") |
| Simulated stage timings and latency | `config.stageDurations`, `config.mockLatency` |
| "Simulated processing..." note | `features/check/ProcessingView.tsx` |
| Mock service and seed data | `services/mock/`, `mocks/fixtures.ts`, `public/captures/` |
| Demo reset / saved-in-browser copy | `HistoryPage.tsx`, `CorrectionDialog.tsx` ("stays in your browser"), `README.md` |
| Hard-coded retry scenario | `FailedView.tsx` (`scenario: 'completed'`) |

Keep the a11y labels and live regions. Do not replace the visual system in this pass.

## 12. Tests to keep passing

```bash
cd frontend
npm run typecheck
npm test        # 52 tests
npm run build
```

Tests currently import the mock and reset it in `src/test/setup.ts`, and `renderApp` mounts the real `App`. If you
swap `checkService` globally, mock the HTTP module in Vitest or keep the demo implementation under an explicit
test flag. Do not delete tests to make the swap pass.

Tests assert accessible names such as the **Checking claims** heading, form labels, and live regions. Preserve
them when changing screens.

## 13. Definition of done for the wiring

- `POST /api/check` → poll → `completed` renders results with claims, citations, evidence snapshots, and captures.
- A `failed` check shows the server message and "Run again" starts a fresh check.
- Correction publishes with a new version; a stale `expectedVersion` returns 409 and the UI reloads the latest.
- History search, status filter, pagination, and empty states work against the API.
- No secrets in the frontend; no demo-only labels remain once the backend is real.
