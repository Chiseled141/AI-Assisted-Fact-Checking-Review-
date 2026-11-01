# AI Fact-Checking & Misinformation Detector — Local Submission Plan

> Living draft, v0.1 · 2026-11-01 · branch `ATI_submission`
>
> This plan covers the **local, no-server version** of ClaimTrace for the ATI submission. It runs on a laptop with no EC2, Docker, Nginx, PostgreSQL, Redis or Qdrant. The main plan (`PROJECT_PLAN.md`, branch `ATI`) keeps the full server design.
>
> - **[Local change]** marks a change from the server design in `PROJECT_PLAN.md`.
> - **[Report match]** marks a part that follows the report as written.
> - **[Extra option]** marks a choice that is kept open on purpose.

## 1. Goal

Show the full fact-checking flow on one machine: paste a claim or text, get claims, evidence, an NLI score per passage, two LLM judges, a tie-breaker when they disagree, and cited verdicts. The demo must run offline except for the LLM and search calls.

## 2. What runs where

| Part | Where it runs | Notes |
|---|---|---|
| Web interface | Local React app (`frontend/`), `npm run dev` | **[Local change]** Already built. Demo mode runs on mock data today. |
| Pipeline (claims, evidence, judges, tie-breaker) | Local Python process, called from the app | **[Local change]** Replaces the FastAPI server. Start it by hand before the demo. |
| NLI model | Local, on the laptop | **[Report match]** DeBERTa-v3 or RoBERTa-large fine-tuned on MNLI. See section 4. |
| Stored results | Local files (JSON per check) | **[Local change]** Replaces PostgreSQL. No database server. |
| Known-fact-check lookup | Google Fact Check Tools API | **[Report match]** Free. Needs an API key stored in a local `.env` file. |
| Web search for evidence | Tavily, free tier | **[Local change]** Replaces Google Custom Search, which is closed to new customers. Free tier: 1,000 credits a month. |
| LLM judges and tie-breaker | Remote APIs through OpenRouter | **[Extra option]** See section 5. |
| Hosting | None | **[Local change]** No EC2, Docker or Nginx. The demo runs on the presenter's laptop. |

Nothing that holds a key goes into git. Keys live in a local `.env` file, which must be in `.gitignore`.

## 3. Pipeline

1. **Extract claims.** A small LLM splits the text into atomic claims with their time context.
2. **Check published fact-checks.** Google Fact Check Tools API. A match shows the fact-checker, its rating and a link. This step uses no LLM.
3. **Find evidence.** Tavily search for each claim, limited to trusted news sites. Save the source title, publisher, link, excerpt, publication date and retrieval time.
4. **NLI add-on.** The local NLI model scores each claim–passage pair as supporting, contradicting or neutral, with a score. It runs on every passage. It does not write the verdict.
5. **Two LLM judges.** Two LLMs read the same top passages and the NLI scores, then each writes a verdict, confidence and explanation.
6. **Tie-breaker.** Only when the two judges disagree: a third LLM from a different lab than both judges decides by majority. If all three differ, the claim is marked Insufficient evidence.
7. **Verdicts with citations.** Supported, Contradicted or Insufficient evidence, with cited sources and Outdated tags where a source no longer applies to the claim's period.

## 4. NLI model choice

The report names **DeBERTa-v3 or RoBERTa-large** fine-tuned on MNLI. [Report match]

| Option | Parameters | Approx. weights (fp32) | Note |
|---|---|---|---|
| DeBERTa-v3-large | about 435M | about 1.7 GB | Report option. Usually the stronger of the two. |
| RoBERTa-large | about 355M | about 1.4 GB | Report option. Smaller than DeBERTa-v3-large. |

- Pick one after a short test on the evaluation set (section 6). Keep the other as the fallback.
- Confirm a fine-tuned MNLI checkpoint exists for the chosen model on Hugging Face before the project depends on it.
- A laptop with 16 GB RAM is enough for either model. Expect a few seconds per claim, not measured yet.

The earlier small DeBERTa-v3-base option is **not** used in this version. The team decided it was too weak to trust.

## 5. LLM APIs and the option to add more

**Default** [Extra option]:
- Judges: two LLMs through OpenRouter, chosen in config. The current demo default is GPT Luna and Claude Haiku 5.5. The evaluation pair is still open until the 30-claim test is done (main plan, section 4.2).
- Tie-breaker: one LLM from a different lab than both judges, set in config. It is not in the user's picker.
- Claim splitting: one small LLM, set in config.

**Adding another LLM API** [Extra option]:
- Add one entry to the provider list in config: name, base URL, model ID, and the key's environment variable name.
- If the provider is not OpenAI-compatible, write one small adapter that turns the request and response into the common schema. Nothing else changes.
- Each verdict stores the model that actually answered, so results from different providers stay traceable.
- Rule: a new provider is used only after it passes the 30-claim test (section 6).

## 6. Evaluation

Same measures as the main plan (section 4.5), run locally:
- Verdict accuracy and macro-F1 on a 250-claim set, labelled by two team members.
- Evidence recall@5.
- Agreement between the two judges, and how often the tie-breaker matches the human label.
- Ablation: with and without the NLI add-on, and with and without the tie-breaker. Keep a part only if it helps.
- Time per claim on the laptop, and the search credits and LLM spend used.

**Candidate test:** about 30 claims, same evidence, to choose the judge pair, the tie-breaker and the NLI model. Then freeze those choices for the 250-claim run.

## 7. Report alignment

| Report says | This version does | Status |
|---|---|---|
| OpenAI GPT-4o-mini and GPT-4o | OpenRouter models chosen in config | **[Local change]** Needs a note in the report. |
| Google Custom Search for web search | Tavily free tier | **[Local change]** Needs a note in the report. |
| NLI DeBERTa-v3 or RoBERTa-large | Same models | **[Report match]** |
| Streamlit demo, React extension | React demo | **[Local change]** Needs a note in the report. |
| Server on EC2 with Docker, Nginx, PostgreSQL, Redis, Qdrant | Local files and a local Python process | **[Local change]** Needs a note in the report. |

The report docx is not changed by this plan.

## 8. Milestones (local)

| Step | Task | Done when |
|---|---|---|
| 1 | Local Python pipeline with claim extraction, Google Fact Check lookup and Tavily search | One text runs end to end and saves a JSON result |
| 2 | Local NLI model scores each passage | Scores appear per passage in the saved result |
| 3 | Two LLM judges and the tie-breaker | Verdicts and disagreements are saved |
| 4 | React app reads the saved results | The results page shows real data instead of fixtures |
| 5 | Candidate test (about 30 claims), then the 250-claim evaluation | Judge pair, tie-breaker and NLI choice are frozen and measured |

## 9. Open decisions

- Which NLI model: DeBERTa-v3-large or RoBERTa-large (test in step 2).
- Judge pair for the evaluation, and which lab the tie-breaker comes from.
- Whether a Google fact-check match skips the judges, or runs them as well.
- Whether to show the NLI score as a small tag on each source. It is not a judge and is not in the Judges list.

## Change log

| Date | Change | Reason |
|---|---|---|
| 2026-11-01 | Local submission plan created on branch `ATI_submission` | Submit a version that runs on one machine with no server |
