# ClaimTrace frontend

React + TypeScript + Vite + Tailwind CSS frontend for ClaimTrace, an AI-assisted fact-checking app.
This phase is **frontend only**: it runs entirely in **demo mode** with simulated results.

## Setup

Requires Node 18+.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

| Command             | What it does                         |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the Vite dev server            |
| `npm run typecheck` | TypeScript check (`tsc -b --noEmit`) |
| `npm test`          | Run the Vitest + Testing Library suite |
| `npm run build`     | Type-check and build to `dist/`      |
| `npm run preview`   | Serve the production build           |

## Light and dark mode

The moon/sun button in the header switches between light and dark themes (palette inspired by fireship.dev: coal and beige in dark, warm cream in light, yellow buttons and blue highlights in both). Dark is the default; your choice is saved in `localStorage` (`claimtrace.theme`). Colors are CSS variables
in `src/index.css` (`:root` for light, `.dark` for dark) that `tailwind.config.js` maps to the usual class names, so
components don't need separate `dark:` classes. A small script in `index.html` applies the theme before first paint.

## Demo-mode limitations

- **No AI, search, or network calls.** Processing stages advance on a timer, then a preset fixture is shown.
- **Your input is not analyzed.** Every check plays back the same illustrative claims about a fictional
  city (Marlow City). The results page says so with a "Preset scenario shown" notice.
- **Files are read in the browser, not uploaded.** In Text mode, "Add files" (or drag and drop) attaches up to 3
  plain-text files (`.txt`, `.md`), 200 KB each. Their text is saved with the demo check and shown on the results
  page, but, like typed text, it is not analyzed. PDF and Word files are not supported yet. Limits live in
  `src/config.ts`.
- **Correction screenshots stay in the browser.** Reviewers can attach up to 3 PNG/JPG/WebP/GIF screenshots to a
  correction (pick, drag and drop, or paste with Cmd/Ctrl+V). Large images are resized to JPEG in the browser and
  stored as data URLs with the revision. SVG and remote URLs are rejected. With a real backend these should be
  uploaded as files instead (multipart), not embedded in JSON.
- **Evidence dates and page captures are illustrative.** Each snapshot shows the source's own publication date and
  the exact time it was retrieved (to the second, with time zone), plus a page capture taken at retrieval. In demo
  mode the captures are generated images in `public/captures/`, watermarked "Illustrative capture · demo data". A
  real backend should store an actual screenshot (e.g. a headless-browser capture) and return its URL as
  `EvidenceSnapshot.capture`.
- **Evidence freshness is a fixture judgment.** Each cited snapshot carries a Current / Outdated / Unknown tag
  relative to the claim's time period (shown on the claim card), with a reason for Outdated. It is stored per
  revision (`AssessmentRevision.citationFreshness`), so a correction can mark a source outdated without rewriting
  the earlier assessment. Freshness is separate from the verdict and is never inferred from age alone. AI revisions
  also record the model and prompt version (`AssessmentRevision.model`).
- **URLs are not fetched.** URL input is validated (http/https only) but nothing is downloaded. Safe server-side
  URL fetching is separate backend work.
- **Data lives in this browser only** (`localStorage`, key `claimtrace.demo.v3`). Malformed or outdated data is
  discarded and the seed is rebuilt. History → "Reset demo data" restores the seed.
- **Conflict handling is simulated.** The "Stale correction conflict" scenario injects a concurrent edit on your
  first publish. The real guarantee must come from the backend (see below).
- Demo controls (scenario selector on New Check, reset on History) are styled with dashed borders to keep them
  apart from product features.

### Demo scenarios

Pick one under **Demo controls** on the New Check page before submitting:

| Scenario                 | What you see                                                            |
| ------------------------ | ----------------------------------------------------------------------- |
| Completed check          | Supported, contradicted, and insufficient-evidence claims               |
| Partial provider failure | One claim shows **Verification unavailable** (no verdict)               |
| Failed check             | Processing fails during evidence retrieval; "Run again" is offered      |
| Stale correction conflict| First correction is rejected with a friendly conflict message + reload  |

Seeded history includes one check of each kind, and saved human corrections on claim 3.

## Where things live

```
src/
  types/models.ts                  Check, Claim, EvidenceSnapshot, AssessmentRevision, CorrectionRequest
  services/contract.ts             CheckService interface (the service contract)
  services/errors.ts               NotFoundError, ValidationError, VersionConflictError
  services/index.ts                Picks the implementation the UI uses
  services/mock/mockCheckService.ts  Mock implementation (timing, scenarios, corrections)
  services/mock/demoDb.ts          Versioned localStorage persistence + seed
  mocks/fixtures.ts                Illustrative fixture claims, evidence, examples, seed history
  config.ts                        Input limits, page size, simulated stage durations
  features/new-check/              New Check page
  features/check/                  Check routing, processing stepper, failed state
  features/results/                Results workspace, evidence panel, correction dialog, revision drawer
  features/history/                History list with search, status filter, pagination
  features/demo/                   Demo-only scenario selector and reset
```

## Replacing the mock with the Spring Boot API

The UI only talks to `checkService` from `src/services/index.ts`, typed by `CheckService`:

```ts
createCheck({ inputType, text?, url?, files? })  // POST /api/checks (multipart with files)
getCheck(id)                                     // GET  /api/checks/{id}
listChecks({ query?, status?, page? })           // GET  /api/checks?query=&status=&page=
getClaimEvidence(claimId)                        // GET  /api/claims/{id}/evidence
getClaimRevisions(claimId)                       // GET  /api/claims/{id}/revisions
publishCorrection(claimId, request)              // POST /api/claims/{id}/corrections
```

The endpoint paths are suggestions, not a fixed backend spec.

1. Create `src/services/http/httpCheckService.ts` implementing `CheckService` with `fetch`
   (base URL from `import.meta.env.VITE_API_BASE_URL`).
2. Map HTTP errors to the existing error classes: `404 → NotFoundError`, `400/422 → ValidationError`,
   `409 → VersionConflictError(expectedVersion, currentVersion)`.
3. Export it from `src/services/index.ts` instead of `mockCheckService`.
4. Drop the demo-only bits: the `scenario` field on `Check`, `features/demo/`, and the preset-scenario notices.

Processing: the UI polls `getCheck` every 600 ms until the status is `completed` or `failed`, so the backend only
needs to report the current status.

Corrections: send `expectedVersion` and have the backend enforce it — for example a JPA `@Version` column or a
`WHERE version = :expectedVersion` update — returning **409 Conflict** when it does not match. The frontend never
overwrites a newer revision, but only the server can guarantee that across users. Revisions should be append-only
so the original AI assessment is always preserved.

Do not put API keys or secrets in the frontend; AI and search provider credentials belong on the server.
