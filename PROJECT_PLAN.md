# ClaimTrace — Project Plan

> Living draft, v0.1 · 2026-10-26
>
> This document describes intended behavior, not implemented features. Change it as the project evolves. New ideas are not commitments until explicitly moved into scope.

## 1. Project direction

**ClaimTrace is an AI-assisted fact-checking web app with traceable evidence and revision-preserving human corrections.**

The purpose of this repository is to demonstrate backend engineering for Java internship/fresher roles. It is not a subscription business, a general-purpose chatbot, or a claim to outperform professional fact-checkers.

The frontend makes backend behavior visible. A polished homepage is useful, but the main proof is inspectable data, enforced business rules, reproducible failures, and tests.

### Short description

AI-assisted fact-checking web app that extracts claims, retrieves evidence, and generates cited verdicts, with human review and versioned corrections.

### Relationship to coursework

- **This repository:** Spring Boot CV implementation.
- **Separate coursework implementation:** Python/FastAPI, aligned with the ATI report.
- The CV implementation does not need every model or infrastructure component in the report.

## 2. Problem and bounded use case

An AI answer alone is difficult to inspect and easy to overwrite. A user should be able to see which passages informed an assessment, correct the assessment, and inspect the original result afterward.

Start with one user reviewing a short English passage containing a small number of checkable claims. A user may correct their own assessment; collaboration between organizations or editorial teams is not required.

The system records assessments and their evidence. It does not certify objective truth or make a source trustworthy simply because it was cited.

## 3. Core workflow

1. Submit text, or use the frontend's URL input where supported.
2. Create a check and return its ID without waiting for all AI calls.
3. Extract a bounded number of atomic, checkable claims.
4. Retrieve relevant passages through one evidence-provider integration.
5. Save evidence snapshots and generate structured AI assessments.
6. Display each claim, its verdict, explanation, and cited passages.
7. Publish a reasoned human correction using evidence already saved for the claim.
8. Preserve earlier revisions and allow comparison with the current assessment.

### URL support boundary

The frontend includes text and URL tabs. URL processing is simulated until a safe backend implementation is explicitly added. Do not silently imply that submitting a URL fetches and verifies its contents.

The first live backend slice can support text only. Arbitrary URL ingestion is a separate decision because it introduces SSRF, redirects, extraction, response-size, and timeout concerns.

## 4. Core scope

| Capability | Intended behavior | Why it belongs |
|---|---|---|
| Check submission | Validate input and persist a check | API contracts and persistence |
| Background processing | Bounded execution with visible terminal states | Resource control and failure handling |
| Claim assessments | Supported, Contradicted, or Insufficient evidence | Clear, domain-specific outcomes |
| Evidence snapshots | Save source metadata, excerpt, and retrieval time | Inspectable reasoning |
| Evidence freshness | Show an Outdated tag when information no longer applies to the claim's time period, with a reason | Distinguish historically correct evidence from currently applicable evidence |
| Citation validation | References must belong to the assessed claim | Data integrity independent of AI |
| Human corrections | Create revisions without overwriting earlier results | Meaningful business workflow |
| Stale-edit protection | Reject corrections against an outdated version | Concurrency correctness |
| History | Reopen checks and inspect revisions | Useful persistent behavior |
| Deterministic demo | Explicit fixtures for normal and failure paths | Reproducible review without paid API access |

Authentication is deferred until the core workflow works. Before exposing real user data or public mutation endpoints, add appropriate access control. A fixture-only public demo must not expose unrestricted shared editing.

## 5. Business rules owned by the backend

### Assessments and evidence

- Verdicts are `SUPPORTED`, `CONTRADICTED`, and `INSUFFICIENT_EVIDENCE`.
- Provider errors are processing failures, not evidence-based verdicts.
- Validate model output against a constrained schema before publishing it.
- Citation IDs must exist and belong to the relevant claim.
- A valid reference does not prove that its passage actually supports the verdict; that remains an assessment-quality question.
- Save the passage used at assessment time, not only its URL.
- Treat evidence freshness separately from the claim verdict. An **Outdated** tag means the passage may have been correct historically but no longer applies to the time period being checked; it does not mean the passage was false.
- Do not infer outdatedness from age alone. Show the reason and relevant dates, such as a superseding policy or a claim about a newer reporting period. If applicability cannot be established, use **Unknown**, not an unsupported current/outdated judgment.
- Track freshness as `CURRENT`, `OUTDATED`, or `UNKNOWN`, relative to the claim's time context. `CURRENT` means temporally applicable, not guaranteed accurate.
- Preserve outdated evidence in snapshots and earlier revisions. Do not automatically use it as support for a present-day claim or treat it as contradictory solely because it is outdated.
- Do not show unsupported truth percentages or treat model confidence as calibrated probability.

### Corrections and revisions

- Published revisions are append-only through application operations.
- A correction requires a verdict, a nonempty reason, and an expected claim version.
- Corrections may cite only evidence already attached to that claim in the initial scope.
- Do not require evidence to exist for an insufficient-evidence outcome. The precise minimum-citation policy for other verdicts remains an explicit decision below.
- Save the revision, its citations, and the current-revision pointer atomically.
- Keep remote AI/search calls outside this database transaction.
- A stale correction returns a documented conflict; it never silently overwrites a newer revision.
- Application-level history is not tamper-proof against a database administrator.

### Processing

- Limit input length, extracted claims, pending work, provider wait times, and retry attempts.
- Keep successful claim results visible if another claim fails.
- Separate legitimate insufficient-evidence outcomes from unavailable verification.
- Do not blindly retry paid inference after an ambiguous timeout.
- A single-instance in-memory executor is acceptable initially, but is not a durable queue. On restart, reconcile abandoned work to an interrupted/failed state rather than leaving it processing indefinitely.

## 6. Architecture

Use a **modular monolith**: one Spring Boot backend and one PostgreSQL database.

```text
React frontend
      |
Spring Boot REST API
      |-- Check processing
      |-- Claim extraction
      |-- Evidence retrieval
      |-- Assessment generation
      |-- Review and revision management
      |
PostgreSQL

External adapters: one LLM provider and one evidence-search provider
```

### Proposed stack

- Java, Spring Boot, Maven
- Spring Web, Validation, Spring Data JPA
- PostgreSQL and Flyway migrations
- React, TypeScript, Vite, Tailwind
- JUnit and PostgreSQL Testcontainers
- Docker Compose and GitHub Actions

Use provider interfaces and a deterministic fixture implementation. Choose a stable Java/Spring combination supported by the actual project; do not upgrade just for a newer version number.

### Optional, not baseline requirements

- Redis only after identifying a measurable repeated-work/cache use case.
- Python inference only if local embeddings, NLI, or reranking justify another runtime.
- Spring Security and authentication after the core, with private ownership checks before real public use. JWT is an option, not an architectural goal.
- Deployment after a reproducible local workflow and tests exist.

## 7. Proposed data model

| Entity | Main responsibility |
|---|---|
| `Check` | Submitted content, status, timestamps, processing error summary |
| `Claim` | Extracted statement, time context when known, current revision, optimistic-lock version |
| `EvidenceSnapshot` | Claim, source URL/title, saved excerpt, retrieval time, publication/update date when known |
| `AssessmentRevision` | Claim, predecessor, verdict, explanation/reason, author type, model metadata |
| `AssessmentCitation` | Association between a revision and an evidence snapshot, with freshness status and reason relative to that assessment's time context |
| `User` — later | Ownership and authenticated authorship |

Capture model identifier and prompt version for AI revisions. Identify human revisions separately. Do not invent user accounts before authentication exists; fixture identities must be labeled as demo data.

Record freshness judgments with the revision rather than overwriting the source snapshot: the same passage may apply to a historical claim but be outdated for a present-day claim. Store unknown publication dates as unknown; retrieval time is not publication time.

Use database foreign keys and constraints alongside service validation. Exact schema and association choices remain implementation decisions.

## 8. Proposed API surface

These routes are a draft, not a frozen contract.

| Method | Route | Behavior |
|---|---|---|
| POST | `/api/checks` | Validate input, create check, return `202` and status location |
| GET | `/api/checks` | Paginated history with bounded filters |
| GET | `/api/checks/{id}` | Status and available results |
| GET | `/api/claims/{id}/evidence` | Saved passages |
| GET | `/api/claims/{id}/revisions` | Assessment history |
| POST | `/api/claims/{id}/corrections` | Publish a correction against an expected version |

Use consistent error responses for invalid input, missing records, stale versions, and unavailable capacity. Authentication endpoints and authorization rules come with the access-control milestone.

## 9. Frontend direction

The user has chosen frontend-first work using mock services. A mock frontend exists in `frontend/` (React, TypeScript, Vite, Tailwind); see `frontend/README.md` for setup, demo limitations, and service contracts. Everything below runs on fixtures — no live AI, search, or URL fetching.

**Visual direction**

- Framed, editorial layout: thin frame lines, `//` mono section labels, numbered rows, Geist and Geist Mono type.
- Palette inspired by fireship.dev: warm cream light theme and coal/charcoal dark theme with beige text; yellow primary buttons, blue headline accent, pink labels, purple selection states. Verdict colors (green/red/amber) are reserved for verdicts.
- Light and dark mode with a header toggle; follows the OS setting until the user chooses.
- ClaimTrace branding and minimal New Check / History navigation. No chat bubbles or fake model streaming.
- Compact home page: headline and "how it works" steps beside a framed check form (Text / URL tabs, optional plain-text file attachments, examples).

**Results and review**

- The results header shows the share of claims with a Supported verdict as a large percentage ("25% of claims supported"), labeled "Share of claims, not a truth score", beside a labeled verdict bar. It is a count of verdicts, not a truth, credibility, or confidence score.
- Claim cards on the left, each showing its verdict, explanation, time context, citations, and AI/human revision marker. The selected claim's evidence panel is on the right; it can be closed so the claims list uses the full width. On mobile, a toggle switches between claims and evidence.
- Evidence snapshots show source title, publisher, URL, saved excerpt, publication date (and update date when stated), exact retrieval time, and a page capture. Unknown publication dates stay unknown. Demo captures are generated, watermarked illustrations, not real screenshots.
- Freshness tags (Current / Outdated / Unknown) appear on cited evidence, relative to the claim's time context, with a reason for Outdated. They are visually distinct from verdict badges and are stored per revision.
- The review form uses numbered steps (verdict, reason, cited evidence with per-citation freshness, optional screenshots) and a pinned action bar. Publishing creates a new revision; the conflict path explains the rejection and offers a reload.
- Revision history shows each revision's verdict, reason, citations with freshness, screenshots, author, and — for AI revisions — model and prompt version, with comparison against the current revision.
- The mock currently requires at least one citation for Supported or Contradicted corrections. This is provisional until the citation-policy decision in section 13 is made.

**Honesty and structure**

- Explicit demo labels, a "preset scenario" notice on results, and a separate demo-scenario selector (completed, partial provider failure, failed, stale conflict).
- Realistic loading, empty, validation, and error states.
- Typed Promise-based service layer (`frontend/src/services/`) designed to be replaced with Spring Boot HTTP calls.
- URL input remains available with a clear note that the page is not fetched.

The original instructions at `/Users/chiseled/Documents/ATI/Front-end agent.md` are superseded on visual direction (blue gradients, light-only) by the choices above. Inspect the existing frontend code before changing it; this section describes intended direction and the mock's current behavior, not backend functionality.

## 10. Evidence to show in an interview

### Main demonstration

1. Open a completed check and select a claim.
2. Inspect the exact saved evidence passage.
3. Publish a human correction with a reason.
4. Compare it with the original AI assessment.
5. Submit an outdated edit from a second tab and see a conflict.
6. Open the enforcing service code and its PostgreSQL integration test.

### Failure demonstration

Use clearly labeled fixtures to show a provider timeout or malformed response. Preserve unaffected results and distinguish technical failure from insufficient evidence. Do not present fixture replay as live inference.

### Tests to prioritize

- Invalid or cross-claim citations are rejected.
- Failed publication leaves no half-written revision or pointer update.
- A correction preserves its predecessor and saved evidence.
- Concurrent corrections using the same expected version produce one success and one conflict.
- Timeouts and malformed AI output produce bounded, honest failure behavior.
- Historically correct but superseded evidence displays an Outdated tag with a reason; old-but-still-applicable evidence is not tagged solely for its age.
- Unknown source dates remain unknown, and later freshness judgments do not rewrite earlier assessment history.
- Ownership checks deny access to another user's records once accounts exist.

## 11. Build sequence

1. **Frontend mock:** establish the submission/results/review interaction.
2. **Backend vertical slice:** submit text, persist a check, retrieve status, apply migrations.
3. **Domain integrity with fixtures:** evidence, revisions, atomic publication, stale-edit tests.
4. **Live integrations:** connect one evidence provider and one LLM provider with validation and timeouts.
5. **Connect frontend:** replace mock service calls incrementally.
6. **Access control and delivery:** ownership, CI, Docker, documentation, deployment.

Live integrations and domain integrity can be reordered if needed. Neither requires finishing the entire frontend first. Keep a runnable vertical slice throughout.

## 12. Explicitly out of scope

- Pricing pages, subscriptions, billing, usage sales dashboards
- Organization/team administration and complex editorial roles
- Continuous monitoring or scheduled claim reverification
- General-purpose chat, multi-agent systems, autonomous actions
- Image/video verification
- Large custom crawler or a comprehensive news corpus
- Kafka, Kubernetes, or microservices for portfolio appearances
- Unmeasured performance/accuracy claims, fake users, or invented outcomes

## 13. Open decisions

Move a decision into the relevant section once agreed.

- [ ] Input and claim-count limits
- [ ] LLM and evidence-search providers, costs, and source coverage
- [ ] Citation policy for supported/contradicted assessments
- [ ] Whether live URL fetching is worth the security and extraction scope
- [ ] Authentication mechanism and public-demo editing restrictions
- [ ] Exact API DTOs and partial-result representation
- [ ] Executor capacity and startup reconciliation policy
- [ ] Small manually checked examples for assessing citation relevance
- [ ] How source freshness is assessed and reviewed; begin with explicit dated examples rather than a general automatic stale-source detector

## 14. How to revise this plan

For each proposed feature, ask:

1. What user problem does it solve?
2. Which backend decision does it demonstrate?
3. How will it be tested and shown in the browser?
4. What can be removed to keep scope manageable?

Keep new ideas below until accepted. Do not treat this file as an instruction to implement everything immediately.

### Idea parking lot

- None accepted yet.

### Change log

| Date | Change | Reason |
|---|---|---|
| 2026-10-26 | Created backend-focused living plan | Separate project scope from chat history; remove SaaS-style feature pressure |
| 2026-10-26 | Added separate evidence freshness tags and dated reasoning | Historically true information may no longer apply to a current claim |
| 2026-10-26 | Updated frontend direction to match the mock frontend: framed layout, fireship-inspired light/dark palette, freshness per revision, source dates, page captures, review steps, closable evidence panel | Original blue-gradient, light-only direction was replaced during frontend iteration |
| 2026-10-27 | Results header shows "% of claims supported" as a big number | User wanted a headline figure; kept as a labeled share of verdicts so it does not become a truth or confidence score |
