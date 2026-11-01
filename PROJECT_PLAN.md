# ClaimTrace — Project Plan

> Version 0.7 · 2026-11-01
>
> This plan describes what we intend to build. Nothing here is built yet, except the React demo in `frontend/`.

## 1. What is ClaimTrace?

ClaimTrace helps a person check facts quickly, with the evidence in front of them.

1. You paste a short text.
2. The AI splits it into single claims.
3. For each claim, the AI finds evidence and gives a verdict: **Supported**, **Contradicted**, or **Insufficient evidence**.
4. The results page shows the numbers, the most trusted source, and every source with its highlighted passages.
5. You decide how deep to check: trust the summary, or read the sources yourself.
6. You can click a source or a claim and ask the AI a follow-up question.

The AI does the first pass. People make the final call. There are no human corrections, so each check stays as the AI produced it.

This repository is a portfolio project for **Java backend intern** roles.

## 2. Headline feature

**The most trusted source, highlighted.** The results page points to the one source the AI rates as most trusted, with the reason.

- The rating comes from saved source checks, not from a fresh guess.
- It is shown as an AI judgment with its reasons, never as a permanent label on a publisher.
- The backend checks that every quote used for the highlight appears in the saved source text.

Behind this feature are the backend skills: background jobs in PostgreSQL, checked AI output, safe repeated requests, and ownership checks.

## 3. How a check works

1. **Start:** the user submits text. The server returns a check ID right away.
2. **Claims:** the AI splits the text into claims.
3. **Evidence:** trusted sources are found and saved, with excerpts and dates.
4. **Verdicts:** two AI judges each give a verdict and a confidence for each claim.
5. **Results:** the page shows two numbers, a short overall review, and the most trusted source.
6. **Read:** the user either trusts the summary or opens the sources and reads the highlights.
7. **Source check (optional):** the user asks the AI about one source, such as whether it is trusted or current.
8. **Follow-up (optional):** the user asks the AI a question about a claim or a source.

## 4. Who can do what

| Action | Guest (no login) | Logged in |
|---|---|---|
| Run a check | Yes | Yes |
| Open a check | Yes, only with its link | Yes |
| See your history | No | Yes |
| Source check or follow-up question | Open decision (see section 12) | Yes |

Guest checks do not appear in any history.

## 5. Features

### In scope

| Feature | What it means |
|---|---|
| Start a check | Send text and get a check ID back right away |
| Claims and verdicts | Each claim gets one of the three verdicts, from two AI judges |
| Two results numbers | "Share of claims supported" and "AI confidence", shown separately |
| Evidence and highlights | Sources with excerpts, dates, and highlighted passages |
| Most trusted source | The source the AI rates as most trusted, with its reason (headline feature) |
| Source checks | The AI judges one source: trust, date, and reason |
| Follow-up questions | Ask the AI about a claim or source; two judges answer |
| Safe retries | Sending the same check twice creates only one check |
| Background jobs | Checks and source checks run in a PostgreSQL job queue, with retries and recovery |
| Ownership checks | Users cannot read other users' records |
| Guest limits | Rate limits and a daily cap for guest checks |
| Login for history | JWT login, required only to see history |
| AWS deployment | The app runs on AWS |

### Optional (only if time allows)

- **Page screenshots:** a picture of each trusted source page, run as a job in the same queue.
- **One live AI service:** a real AI or search call, with timeouts and checks on its output.

### Not in scope

- Human corrections or edits to verdicts
- Subscriptions, billing, or pricing pages
- Teams, organizations, or complex editorial roles
- Monitoring or re-checking claims on a schedule
- General chatbots or autonomous agents
- Image or video checking
- A large news crawler
- Kafka, Kubernetes, or microservices
- Claims about speed or accuracy that we have not measured

## 6. Rules

### Verdicts and numbers

- Verdicts are `SUPPORTED`, `CONTRADICTED`, and `INSUFFICIENT_EVIDENCE`.
- A provider error is not a verdict. It is shown as "Verification unavailable".
- When the two judges disagree on a claim's verdict, both verdicts are shown and the claim is marked as disputed. The summary shows the first judge's verdict. There is no third vote.
- **Share of claims supported** counts verdicts. It is not a truth score.
- **AI confidence** is the judges' own confidence. It is labelled as not a real probability.
- The two numbers are never merged into one.

### Evidence and highlights

- Save the exact passage used, not just its link.
- The AI must point to a quote. The backend checks that the quote appears in the saved source text, then computes the highlight position itself.
- A quote that does not match the saved text is rejected.
- A citation must belong to the claim it supports.
- **Outdated** means a source was true at one time but no longer applies to the claim's period. It does not mean the source was false.
- Do not mark a source Outdated only because it is old. Give a reason, or mark it **Unknown**.

### Most trusted source and source checks

- A source check uses only saved data: publisher, domain, publication date, and the excerpt.
- The AI's answer must follow a fixed format, and it must give the reasons it used.
- Results are labelled as AI judgments. The page never presents a trust label as a fact.
- Each source check is saved per source, so the same source is not checked and paid for twice.

### Follow-up questions

- Two judges answer each follow-up question.
- Each answer is saved with the check, the model names, and the time.
- For free-text answers, if the two judges disagree, both answers are shown.

### Background jobs

- Jobs live in a PostgreSQL table, not in memory, so they survive a restart.
- A job moves through `QUEUED` → `RUNNING` → `DONE`, or to `FAILED`. Any other move is rejected.
- Workers claim jobs with `SELECT ... FOR UPDATE SKIP LOCKED`, so two workers never take the same job.
- A failed job retries with a growing wait, up to a fixed number of tries.
- A job stuck in `RUNNING` for too long goes back to `QUEUED`. The retry limit still applies.
- Source checks and follow-up questions are jobs in the same queue.

### Safe retries

- `POST /api/checks` can take an `Idempotency-Key` header.
- The same key with the same body returns the original check.
- The same key with a different body returns `422`.
- Two identical requests sent at the same time create one check.

### Access and cost

- Every read or write checks ownership in the service code, not only in the controller.
- Guest checks are reachable only by their ID.
- Limits on text length, number of claims, and paid calls per check.
- Each paid AI call has a timeout, and no paid call is retried without a limit.

## 7. Tech stack

**Backend (Java)**
- Java 21 LTS, Maven
- Spring Boot 3.x: Spring Web, Validation, Spring Data JPA, Actuator (health checks)
- Spring Security with JWT (login for history)
- Flyway (database changes)
- PostgreSQL
- Errors in the ProblemDetail format
- springdoc OpenAPI (API docs)
- JUnit 5 and Testcontainers (tests against real PostgreSQL)

**Frontend (already built)**
- React, TypeScript, Vite, Tailwind
- Vitest and Testing Library

**Tools and cloud**
- Docker and Docker Compose
- GitHub Actions (runs the tests on every push)
- AWS EC2, IAM roles, VPC security groups
- AWS Budgets alarms
- RDS and S3 are optional (see section 12)

**Left out on purpose:** Redis, Kafka, Kubernetes, microservices, Python in this repo, embeddings, RAG, and NLI models.

AI and search calls sit behind interfaces. Fixed fake versions are used for demos and tests.

## 8. Data

| Table | What it holds |
|---|---|
| Check | The submitted text, its status, and timestamps |
| Claim | One statement and its time context |
| Evidence | A source's title, link, excerpt, retrieval time, and publication date if known |
| Verdict | One AI verdict per claim and judge, with its confidence and reason |
| Citation | Links a verdict to its evidence, with the highlight position |
| Source check | One AI judgment about one source, with its reasons |
| Question | A follow-up question and the answers from both judges |
| Job | One background task and its state |
| User | Later, for login |

Store unknown dates as unknown. The time we read a source is not its publication date.

## 9. API

These routes are a draft, not a fixed contract.

| Method | Route | What it does |
|---|---|---|
| POST | `/api/checks` | Start a check. Guests allowed. Accepts `Idempotency-Key`. Returns `202`. |
| GET | `/api/checks` | Your history (login required) |
| GET | `/api/checks/{id}` | One check, its status, its numbers, and its most trusted source |
| GET | `/api/claims/{id}/evidence` | The saved sources and highlights for a claim |
| POST | `/api/sources/{id}/checks` | Ask the AI to check one source |
| POST | `/api/claims/{id}/questions` | Ask a follow-up question about a claim |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Log in and get a JWT |

All errors use the same format (ProblemDetail).

## 10. Build order

Keep a working version at each step.

1. **Frontend demo.** Done.
2. **Backend start.** Save a check, return its status, set up the database with Flyway, and add safe retries.
3. **Claims, verdicts, and the two numbers.** Fake AI judges, with the highlight check on quotes.
4. **Job queue and worker.** The PostgreSQL table, state rules, and recovery.
5. **Most trusted source.** Source checks as jobs, then the highlight on the results page.
6. **Follow-up questions.** Two judges answer, and answers are saved.
7. **Connect the frontend.** Replace the demo data with real calls, bit by bit.
8. **Login and history.** JWT login, your history, and ownership checks with tests.
9. **AWS.** Deploy, document it, and write down how to stop it.
10. **Optional.** Page screenshots, or one live AI service.

## 11. Tests to write

- A quote that does not match the saved source text is rejected.
- A highlight position is computed from the saved text, not from the AI.
- A source check uses only saved data.
- Invalid AI output is rejected before it is saved.
- Two identical requests with the same `Idempotency-Key` create one check.
- The same key with a different body returns `422`.
- Two workers never take the same job.
- An invalid job state change is rejected.
- A stuck job goes back to `QUEUED`.
- A timeout shows "Verification unavailable" for one claim while other claims still show verdicts.
- When the two judges disagree on a follow-up answer, both answers are shown.
- Another user's check cannot be opened by changing its ID.
- Old evidence gets an Outdated tag with a reason. Old but still-valid evidence is not tagged for its age.

## 12. Interview demo

1. Open a finished check and show the two numbers.
2. Point to the most trusted source and read its reason.
3. Open that source and show the highlight matched to the saved text.
4. Ask a follow-up question and show both judges' answers.
5. Show the job in the queue and its state.
6. Show the service code and its database test.

## 13. Open decisions

Check these off as we decide them.

- [x] Login: JWT. Guests can run checks without login. History needs login.
- [x] Results show two numbers, share of claims supported and AI confidence, kept separate.
- [x] Headline feature: the most trusted source, highlighted.
- [x] No human corrections. No Quick or Manual setting is saved.
- [x] Tie-breaker dropped. Two judges only; there is no third vote.
- [ ] Can guests use source checks and follow-up questions? Proposed: yes, with rate limits.
- [ ] Input and claim limits (text length, number of claims)
- [ ] Which AI and search services, if any, and their costs
- [ ] Hosting: PostgreSQL in Docker on one EC2 instance, or RDS for a short time. Proposed: Docker, with RDS only for a short demo.
- [ ] Job settings: retry limit, wait between retries, and how long before a stuck job is retried. Proposed: 3 tries, growing wait, 5 minutes.
- [ ] How long to keep an idempotency key. Proposed: 24 hours.
- [ ] Repository layout: `backend/` next to `frontend/`. Proposed.
- [ ] Domain list for screenshots, if we add them

## 14. How to change this plan

Before adding a feature, ask:
1. What problem does it solve for a user?
2. Which backend skill does it show?
3. How will we test it?
4. What can we remove to keep the project small?

## 15. Change log

| Date | Change |
|---|---|
| 2026-10-26 | Created the backend-focused plan |
| 2026-10-26 | Added evidence freshness tags |
| 2026-10-26 | Updated the frontend direction to match the demo |
| 2026-10-27 | Results show "% of claims supported" as a labeled share of verdicts |
| 2026-11-01 | Focused the CV version on safe corrections; set Java 21 and Spring Boot 3 |
| 2026-11-01 | Guests can run checks without login; login is only for history; AWS deployment added |
| 2026-11-01 | Added safe retries, a PostgreSQL job queue, ownership checks with tests; screenshots as an optional job |
| 2026-11-01 | Rewrote the plan in plain language (v0.5) |
| 2026-11-01 | Removed human corrections. Headline is the most trusted source, highlighted. Added source checks, follow-up questions, two numbers, and quote checks (v0.6) |
| 2026-11-01 | Tie-breaker dropped. Two judges only; verdict disagreements are shown as disputed, not voted on (v0.7) |
