# ClaimTrace — conversation handoff

## Living project plan

`PROJECT_PLAN.md` holds the editable project scope and latest design direction. Read it alongside this historical handoff. The user wants a backend-focused portfolio project, not SaaS filler; planned features must not be mistaken for implemented work. No implementation changes were requested when that plan was created.

## Goal and audience

Build a backend-internship portfolio project with Java and Spring Boot. Prioritize explainable backend decisions and a working demo over an ambitious feature list. The user wants meaningful differentiation from a simple ChatGPT wrapper without Kafka, Kubernetes, microservices, or a monitoring platform.

## Project identity

- Name: **ClaimTrace**
- GitHub description: “AI-assisted fact-checking web app that extracts claims, retrieves evidence, and generates cited verdicts, with human review and versioned corrections.”
- This is a web app. The user does not want “platform” in its title.

## Two implementations

1. Coursework version: Python/FastAPI, aligned with the original ATI report.
2. CV version: Java/Spring Boot, this repository.

The original report is at `/Users/chiseled/Documents/ATI/FINAL PROJECT REPORT-ATI.docx`. It describes a decompose → retrieve → verify pipeline with claim extraction, known-fact-check lookup, hybrid retrieval, NLI/LLM verification, cited verdicts, and evaluation. Treat report progress statements as report claims, not proof that code exists in this repository.

## Agreed product direction

Submit content → extract claims → retrieve evidence → generate cited assessments → human review and corrections.

Key differentiator: saved evidence passages and revision-preserving corrections, not merely an AI answer.

- Verdicts: Supported, Contradicted, Insufficient evidence.
- Technical failures are separate from insufficient evidence.
- Evidence snapshots include URL, source title, excerpt, and retrieval time.
- Evidence can carry an **Outdated** tag with a reason when historically correct information no longer applies to the claim's time period. Freshness is separate from verdicts; old publication dates alone do not imply outdatedness. See `PROJECT_PLAN.md` for the proposed revision-scoped freshness model.
- Corrections create new assessment revisions; earlier assessments remain available.
- MVP corrections reference existing evidence for the claim.
- Avoid overall truth percentages and unsupported accuracy claims.

## Backend plan — not yet verified as implemented

- Spring Boot, Java, Maven, PostgreSQL, JPA/Hibernate, Flyway.
- Authentication/private history with Spring Security and JWT after the core works.
- Bounded asynchronous verification jobs; persistent status and honest failure handling.
- Publish revisions, citations, and the current-assessment pointer in one short transaction.
- Keep external API calls outside database transactions.
- Validate that citation IDs belong to the relevant claim.
- Optimistic concurrency using a version field; stale corrections return a conflict rather than silently overwriting.
- Integration tests with real PostgreSQL via Testcontainers; deterministic stub AI provider.
- Docker, GitHub Actions, eventual single-instance deployment.
- Redis is optional, not a requirement merely to add a CV keyword.
- Python inference service is optional: add only if local embeddings/NLI/reranking actually require it.
- Application-level append-only history is not administrator-proof immutability.

Suggested entities: users, checks, claims, evidence_snapshots, assessment_revisions, assessment_citations.

## Current priority: frontend first

The user chose to build the frontend first and requested an instruction file for Claude. Do not start backend implementation without a new request.

Confirmed frontend decisions:

- React + TypeScript + Vite + Tailwind, React Router, Lucide icons.
- Reference: user attached a DeepSeek-like landing screenshot with soft blue gradients, faint grid, large rounded input, spacious typography. Use visual inspiration, not DeepSeek branding.
- ClaimTrace branding; light mode only.
- Top navigation: New Check / History.
- Both text and URL inputs. URL fetching is mocked in this frontend phase; safe backend fetching is future work.
- Complete clickable mock flow: submission, processing, results, review/correction history, check history.
- Results are not a chat: claim cards on the left and a selected-claim evidence panel on the right. Stack accessibly on mobile.
- No login/register screens yet.
- Explicit demo labels; do not pretend arbitrary inputs were actually verified.
- Fixture scenarios: completed, partial provider failure, failed, stale correction conflict.
- Mock Promise-based service layer, typed models, localStorage demo persistence.
- Preserve original assessment when publishing corrections; show revision comparisons.
- Tests for validation, claim/evidence selection, correction history, stale-version conflict.

The full frontend instruction file was created at:
`/Users/chiseled/Documents/ATI/Front-end agent.md`

Suggested headline: **Trace claims. Examine evidence.**

## Research already completed

Research combined Vietnam entry-level employer descriptions, developer forums, practitioner articles, and public implementation examples. Findings do not prove hiring outcomes or project uniqueness. Some postings are historical/undated; several Reddit sources were search-index excerpts only.

Reports:
- `/Users/chiseled/Documents/ATI/reports/Backend intern project differentiation.md`
- `/Users/chiseled/Documents/ATI/reports/Backend portfolio hiring discussion evidence.md`

The final recommendation favors evidence/correction workflow plus transaction/concurrency proof over adding infrastructure. Idempotent submission is useful but not the project's headline.

## Repository state at handoff

Project directory: `/Users/chiseled/Documents/Github/AI-Assisted-Fact-Checking-Review-`

Observed entries: `.git/`, `frontend/`, `.gitignore`, `LICENSE`, `README.md`.

The existing frontend and other files have not been inspected for implementation details. Treat them as potential user/Claude work; inspect before changing anything. This handoff does not assert any feature is implemented.

The user selected GitHub's Java .gitignore template. That template ignores generated artifacts, not `.java` source files; `target/` and `.env` need explicit rules if absent. No changes to those rules have been verified.

## Working style

- Keep explanations clear and practical.
- Avoid overengineering or technology checklists.
- No invented metrics, users, accuracy, or performance claims.
- Do not overwrite existing work or commit changes without authorization.
