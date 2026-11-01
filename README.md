# AI-Assisted-Fact-Checking-Review-
An AI-assisted fact-checking web app. It splits text into claims, finds evidence, and gives each claim a verdict with its sources and highlighted passages. People decide how deep to check, and can ask the AI about any source or claim.

## Backend focus (planned)

This repository is a portfolio project for Java backend roles. Its headline feature is **the most trusted source, highlighted**: the AI rates each source, and the results page points to the most trusted one with its reason. The backend checks every quote against the saved source text, runs the AI work as background jobs in PostgreSQL, and enforces ownership in the service layer.

- **Planned stack:** Java 21 LTS, Spring Boot 3.x (Spring Web, Validation, Spring Data JPA), Spring Security with JWT, PostgreSQL with Flyway migrations, JUnit and Testcontainers, Docker Compose, GitHub Actions, and AWS (EC2, IAM, VPC; RDS optional).
- **Access:** checks work without login. Viewing history requires login.
- **Backend depth (planned):** a PostgreSQL job queue for checks and source checks, idempotent check creation, checked AI output (quotes must match the saved source text), and ownership tests.
- **Status:** the Spring Boot backend is not implemented yet. The frontend runs with mock data.
- **Scope and build order:** see [`PROJECT_PLAN.md`](PROJECT_PLAN.md).

## Frontend

The demo frontend lives in [`frontend/`](frontend/README.md) (React + TypeScript + Vite). It runs in demo mode with simulated results:

```bash
cd frontend && npm install && npm run dev
```
