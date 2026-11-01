# AI Fact-Checking & Misinformation Detector (ClaimTrace) — Project Plan

> Living draft, v1.0 · 2026-11-01 · branch `ATI` (cloud server version)
>
> Based on the ATI final project report (`docs/FINAL PROJECT REPORT-ATI.docx`, status as of 2026-10-05).
>
> - **[LLM change]** marks a change to the report: OpenAI is replaced by OpenRouter (DeepSeek or Claude Haiku).
- **[Search change]** marks a change to the report: Google Custom Search is replaced by Tavily for web search. The report still names Google Custom Search, so the team must decide how the final report handles this.
- **[Tie-breaker change]** marks the removal of the NLI layer and the addition of a third model that breaks ties between the two judges. The report describes an NLI layer and a single LLM judge, so the final report needs a note.
> - **[Bonus]** marks features the report does not mention. They extend the report and never replace anything in it.
>
> Progress statements come from the report and are not proof that code exists in this repository.

**Hanoi University · Faculty of Information Technology**
**Advanced Topics in Information Technology · Fall 2026**
**Lecturer:** Nguyễn Tiến Anh · **Group 12**

## Executive summary

This report presents the mid-term progress of the project "AI Fact-Checking & Misinformation Detector": a system that supports the detection and verification of misinformation in news articles and social media posts. Misinformation, amplified by generative AI, now spreads faster than manual, expert-driven fact-checking can handle. Existing automated tools remain closed boxes: they rarely return per-claim verdicts grounded in traceable, cited evidence, and LLM-only systems hallucinate when evidence is missing.

The proposed system follows a "decompose – retrieve – verify" pipeline. It splits an article into small checkable statements (atomic claims), looks them up against pre-verified fact-checks (Google Fact Check Tools API), and retrieves evidence with a hybrid approach (BM25 + vector search over a trusted news corpus, plus real-time web search). It then uses two LLM judges, with a third model as tie-breaker, to reach a verdict with cited sources. The team analyzed the main design trade-offs (fine-tuned classifiers vs LLMs, local indexes vs live search, large vs small LLMs) and selected a configuration that balances accuracy, cost and explainability.

As of the reporting date (October 5, 2026, week 5), the team has completed the literature survey, the system architecture design, initial data collection (the FEVER, LIAR and AVeriTeC benchmarks), and a baseline prototype (a zero-shot LLM fact-checker with a Streamlit interface). The next weeks focus on the evidence-retrieval module, NLI + LLM Judge verification, end-to-end integration, and quantitative evaluation.

## 1. Project title and team members

### 1.1 Project title

**AI Fact-Checking & Misinformation Detector**: a system for detecting and verifying misinformation with artificial intelligence.

The project builds a web application that checks content automatically. The user pastes an article link or a piece of text; the system analyzes it, retrieves evidence, and returns a verdict (**Supported / Refuted / Partly true / Not enough evidence**) with a detailed explanation and cited sources. The current scope is English text (news articles and social media posts). Images are planned as a future extension.

### 1.2 Team members and roles

| No. | Full name | Student ID | Main role |
|---|---|---|---|
| 1 | Trịnh Xuân Toàn | 2301040179 | Team leader: project management, system architecture, backend and integration |
| 2 | Nguyễn Văn Lợi | 2301040111 | Machine learning: verification models, prompt engineering, evaluation |
| 3 | Vương Trần Lâm Bình | 2301040021 | Data: collection, cleaning, labeling, evidence corpus building |
| 4 | Trần Vĩnh Phúc | 2301040150 | Frontend: web interface, user experience, demo |

## 2. Overview

Misinformation is one of the most pressing problems of today's digital space. The World Economic Forum's Global Risks Report 2024 ranked misinformation and disinformation, amplified by generative AI, as the number-one short-term global risk. False information about health, finance, education and social issues spreads rapidly on social media. Manual verification by professional fact-checkers cannot keep up, especially now that generative AI makes fabricating fake stories cheaper and faster than ever.

Existing automated tools (Google Fact Check Explorer, and LLM-based tools such as Perplexity and Factcheck-GPT) help, but three gaps remain:

1. Their verdicts are rarely broken down to the claim level.
2. They seldom show the exact evidence used for each conclusion.
3. LLM-only systems hallucinate without grounding. Factcheck-Bench reports a best F1 of only ≈ 0.63 for end-to-end LLM checking.

The project targets this transparency and reliability gap.

The app lets users verify a news link or a text passage within tens of seconds. The system automatically:

1. splits the article into checkable statements;
2. looks them up against fact-checks already published by fact-checking organizations;
3. retrieves evidence from a trusted English news corpus and real-time web search;
4. applies two LLM judges, with a tie-breaker when they disagree, to reach a verdict for each statement;
5. combines these into an overall result with a confidence score, a plain-language explanation and full source links.

The system is a first-pass screening tool for users and journalists. It does not replace the judgment of professional fact-checkers.

## 3. Problems and objectives

### 3.1 Problems to solve

- **Claim detection and decomposition:** an article mixes events, opinions and value judgments. The system must extract small, independent, checkable statements (atomic claims) and prioritize the ones worth checking (check-worthiness).
- **Noisy web evidence:** pre-verified fact-checks cover only a small share of circulating claims, and web search results are noisy, even including fake-news sites. Retrieval must combine a curated source base with live search.
- **LLM hallucination:** an LLM can produce confident conclusions without real evidence. Every verdict must be grounded in retrieved evidence and cite it, and the system must be able to answer "Not enough evidence" instead of guessing.
- **Complex claims with numbers:** multi-clause claims and statistics need component-level verification rather than judging the whole sentence at once.
- **Cost and latency:** a multi-step pipeline with many LLM calls adds latency and per-call cost. It needs a fast path for pre-verified claims, caching, and model tiering (small models for auxiliary steps, large models for final verdicts).
- **Out-of-context image misinformation (future extension):** real images shared with false captions are common. Checking them requires OCR, reverse image search and multimodal models.

### 3.2 Objectives

General objective: build an automated fact-checking system for English text that is transparent (every verdict comes with evidence) and deployable as a working demo.

Specific, measurable objectives:

- An end-to-end pipeline that runs automatically (no manual step at inference time) and processes one article in under 30 seconds.
- Verdict accuracy ≥ 80% and macro-F1 ≥ 0.75 on a 250-sample evaluation set built by the team from AVeriTeC, LIAR and real English news articles.
- 100% of verdicts come with cited evidence and verifiable source links.
- Evidence recall@5 ≥ 70%: the share of claims whose relevant evidence appears in the top 5 retrieved results.
- A web demo and REST API deployed on Amazon EC2 (AWS), with a complete end-to-end user experience.
- A comparison of at least two configurations (zero-shot LLM baseline vs the full pipeline) to show the value of the design.

Deliverables: the system source code (GitHub), a labeled evaluation dataset, the final report, and a web demo deployed on AWS EC2 (or hosted locally).

## 4. Technical approaches

### 4.1 Research trends 2024–2025

Recent work shows that the dominant architecture for automated fact-checking is a structured "decompose → retrieve → verify" pipeline:

- Factcheck-GPT (EMNLP Findings 2024) automates the full chain: claim splitting, check-worthiness estimation, evidence retrieval and assessment.
- Loki (COLING 2025) and AFEV-style systems continue the "split into atomic claims, then verify" direction.
- In the AVeriTeC shared task (FEVER workshop 2024) on real-world claims, all top-ranked systems were multi-step web-RAG pipelines, notably HerO (hypothetical document embeddings, HyDE) and Team Papelo's multi-hop evidence pursuit system.

Factcheck-Bench reports that end-to-end systems relying only on an LLM reach a best F1 of about 0.63. Letting the LLM conclude on its own is not enough; a controlled pipeline is required.

### 4.2 The decompose – retrieve – verify pipeline

The team selected a six-block pipeline (integration details in section 5):

1. **Preprocessing:** content extraction from URLs with trafilatura/newspaper3k, and OCR with PaddleOCR (extension). Cleaning, segmentation and normalization with spaCy (en_core_web_sm).
2. **Claim extraction and check-worthiness:** **[LLM change]** a small, low-cost model accessed through **OpenRouter** (DeepSeek or Claude Haiku) with a few-shot prompt that outputs a JSON list of atomic claims with check-worthiness scores. Fallback: fine-tune a RoBERTa/DeBERTa check-worthiness classifier.
3. **Known-fake lookup:** calls to the Google Fact Check Tools API (`claims.search`, the global ClaimReview corpus, free of charge) with a Redis cache. Embedding similarity between the claim and existing fact-checks gives an instant verdict when a match exists. The matched fact-check's publisher, rating and URL are shown as the source. This stage uses no LLM, so its result does not depend on the two judges.
4. **Hybrid evidence retrieval:** BM25 combined with dense retrieval using sentence embeddings (e5-large) over a trusted English news corpus (Reuters, AP, BBC, WHO, government portals), crawled on a schedule and indexed in Qdrant. Real-time web search covers fresh topics. **[Search change]** It uses **Tavily** (free tier of 1,000 credits a month, restricted to trusted domains) instead of Google Custom Search, which is closed to new customers and ends on January 1, 2027. HyDE and cross-encoder reranking improve evidence quality.
5. **Evidence assessment** by LLM judges, with a tie-breaker:
   - (a) **[LLM change, adjusted]** two LLM judges through **OpenRouter**, DeepSeek and Claude Haiku, run on every claim. Each receives the same top-k evidence and outputs the required schema: label, evidence IDs used, explanation and confidence. Both are kept so their verdicts can be compared.
   - (b) **[Tie-breaker change]** when the two judges disagree, a third LLM from a different lab than both judges decides the verdict by majority vote. It is called only on disagreement, and its model is set in configuration, not in the user's picker. If all three verdicts differ, the claim is marked "Not enough evidence". All three verdicts are stored in `verdicts` for review.
6. **Aggregation and explanation:** merge per-claim verdicts (weighted by confidence), derive the article-level conclusion, and generate a clear explanation with citations and highlighted passages.

#### OpenRouter integration [LLM change]

- One OpenAI-compatible client pointed at OpenRouter. Model IDs live in configuration, not code.
- Output-format support differs between models. Validate every response against the required schema before saving it. On malformed JSON, allow one repair attempt, then mark the claim as failed.
- Configure a fallback model for outages and rate limits. Store the model that actually answered (it can differ from the requested one) in `verdicts.model`.
- Free-tier models may log prompts. Do not send private user data through them.
- Both models are used as judges in the evaluation (section 4.5), on the same eval set and prompts.

#### Judge pair and web search [Adjustment]

- **Search stays in our pipeline.** Judges do not search the web themselves. The retrieval step (trusted corpus plus Tavily) produces the evidence, and both judges receive the same top passages. Built-in web search is turned off for judge calls. Otherwise the judges see different evidence, and the comparison measures the search rather than the judging.
- **Two judges plus a tie-breaker.** The two judges give the verdict. When they disagree, a third model from a different lab decides by majority. It is called only on disagreement, so it adds cost and latency only in those cases. Test on the 250-claim set whether it helps, and drop it if it doesn't.
- **No extra models for now.** GPT Luna and GLM are not in the report's OpenRouter choice, and their model IDs are not confirmed. Before either is used:
  1. Confirm the exact OpenRouter model IDs, and confirm with the team that these models are allowed.
  2. Run all four candidates on a small set (about 30 claims) with the same evidence, and pick the pair from the results.
  3. Freeze that pair for the 250-claim evaluation (section 4.5). The chat-box picker stays as a live demo option only.

### 4.3 Design options and trade-offs

| Option | Pros | Cons | Team decision |
|---|---|---|---|
| Fine-tuned classifier (RoBERTa/DeBERTa) vs LLM zero-shot | Classifier: fast, cheap, stable, reproducible | Needs task-specific labeled data; generalizes poorly | Combine: LLM for claim splitting and judging; fine-tune a RoBERTa/DeBERTa check-worthiness classifier if enough data is collected |
| **[LLM change]** Stronger LLM vs smaller LLM (both via OpenRouter) | Stronger: more accurate, better at subtle context | Smaller: cheap and fast; stronger: more expensive, slower | Smaller model for auxiliary steps (claim splitting), stronger model only for the final judge; measured on the eval set |
| Real-time RAG (web search) vs pre-indexed local corpus | Live: fresh news. Local: controlled source quality, fast, cheap | Live: noisy, slow, per-query cost. Local: no fresh news | Hybrid: prefer the curated local corpus, add web search when evidence is missing |
| Tie-breaker vs no tie-breaker | Tie-breaker resolves disagreements; costs one extra call only when the judges disagree | A third model can also be wrong; adds latency on disagreements | Third LLM from a different lab, called only on disagreement; test on the eval set |
| Structured pipeline vs end-to-end LLM | Pipeline: traceable step by step, easier to test, less hallucination | End-to-end: less code, simpler | Pipeline (per SOTA 2024–2025 and the 0.63 F1 of end-to-end systems on Factcheck-Bench), accepting more system complexity |
| **[LLM change]** Single LLM provider (OpenAI) vs multi-provider gateway (OpenRouter) | Single: simpler integration, one bill, stable JSON schema. Gateway: many models, free tiers, fallback options | Single: vendor lock-in, rate limits concentrated on one provider. Gateway: output formats vary, more integration code | **Gateway: OpenRouter with DeepSeek or Claude Haiku**, with schema validation and a fallback model |

### 4.4 Datasets and benchmarks

| Dataset | Language | Scale | Characteristics | Role in the project |
|---|---|---|---|---|
| AVeriTeC (FEVER @ ACL 2024) | English | 4,568 real-world claims | Claims checked by 50 fact-checking organizations, annotated with web-search questions, answers and source URLs | Primary real-world benchmark for retrieval-based verification |
| LIAR-RAW / RAWFC (ACL 2022) | English | 12,590 + 2,012 claims | LIAR extended with retrieved raw evidence; Snopes claims paired with raw reports | Hard real-world benchmark; published SOTA F1 only ~33% |
| FEVER (NAACL 2018) | English | ~185,000 claims | Curated Wikipedia claims; SOTA full pipeline ~75–77% accuracy | Curated benchmark for pipeline development and evaluation |
| Factcheck-Bench (EMNLP 2024) | English | Fine-grained | Evaluates end-to-end systems; best F1 ≈ 0.63 | Reference standard for per-claim evaluation |

The team is also building a separate evaluation set of 250 English claims drawn from AVeriTeC, LIAR and real news articles and social media posts. Each claim is labeled independently by at least two members, with no AI labeling. This set is used for the measurements in section 4.5.

### 4.5 Evaluation methodology

The system is evaluated on:

- verdict label accuracy and macro-F1;
- evidence recall@k;
- p50/p95 latency;
- average cost per check;
- human-rated explanation quality on a 1–5 scale, scored by team members.

Two-model and Fact Check API comparison [Adjustment]:

- Run both judges (DeepSeek and Claude Haiku) on the same 250-sample set, with the same evidence and prompts. Report accuracy and macro-F1 for each.
- Agreement between the two judges (percent agreement and Cohen's kappa). Where they disagree, which one matches the human label.
- Google Fact Check Tools API: the share of claims with a matched published fact-check (fast-path hit rate), and how often the matched rating, mapped to our four labels, matches the human label.

The team also plans ablation studies, removing one component at a time, to measure how much HyDE, web search, the tie-breaker and the LLM judges each contribute to the final result.

## 5. System design

### 5.1 Overall architecture

The system has five layers: user and interface, API, NLP processing (the fact-checking pipeline), data, and external services. Separating responsibilities lets each module be tested independently and lets models be replaced without affecting the rest.

```text
User & interface      Web interface
       |
API layer             FastAPI REST API
       |
NLP processing        Preprocessing -> Claim extraction -> Known-fake lookup
                      -> Hybrid retrieval -> LLM judges + tie-breaker -> Aggregation
       |
Data layer            PostgreSQL (check history, user feedback)
                      Qdrant (vector index of the trusted news corpus)
                      Redis (cache for Google Fact Check results and embeddings)
       |
External services     Google Fact Check Tools API, Tavily [Search change],
                      LLM API via OpenRouter   [LLM change]
```

The NLP processing layer is the core of the system, with six modules following the pipeline in section 4.2. External services connect at the matching points. The whole backend is packaged with Docker Compose and deployed on an Amazon EC2 instance behind an Nginx reverse proxy.

### 5.2 Data flow

A full check goes through eight steps:

1. The user submits a link or text through the web interface. The system creates a check record in PostgreSQL with status "processing".
2. The backend extracts the original content (scraping/OCR) and stores the cleaned text.
3. The claim-extraction module calls the LLM (via OpenRouter) and receives a list of atomic claims with check-worthiness scores. They are stored in the `claims` table.
4. For each claim, the system queries the Redis cache and the Google Fact Check API. A high-similarity match reuses the existing result (fast path).
5. Evidence is retrieved from Qdrant (BM25 + vectors) and Google Custom Search. Source metadata is stored in the `evidence` table.
6. The top-k evidence is passed to the two LLM judges. If they disagree, a third model breaks the tie.
7. Per-claim verdicts are combined into the overall result and stored in the `verdicts` table, and the check status is updated.
8. The interface shows the result: the overall label, confidence, and per-claim explanations with citations. User feedback is stored to improve the system.

### 5.3 Inference flow

There are three main paths:

- **Fast path:** the claim already exists in the verification database, so the result is near-instant.
- **Standard path:** split claims, retrieve evidence, assess.
- **Fallback path:** return "Not enough evidence" instead of guessing when evidence is insufficient.

A user feedback loop feeds data back to improve prompts and models over time.

### 5.4 Database design

| Table | Main fields | Purpose |
|---|---|---|
| `checks` | id, input_url, input_text, status, created_at, user_id | Each verification request and its processing status |
| `claims` | id, check_id, text, checkworthy_score, span | Atomic claims extracted from the article |
| `evidence` | id, claim_id, source_url, title, snippet, publisher, published_at | Evidence retrieved for each claim |
| `verdicts` | id, claim_id, label, confidence, explanation, evidence_ids, model | Per-claim verdicts with cited explanations; `model` holds the OpenRouter model ID |
| `feedback` | id, check_id, user_vote, comment, created_at | User feedback used to improve the system |

**[Bonus]** fields and tables for the bonus features in section 9. They add to the report's tables and do not remove anything:

| Table / field | Purpose |
|---|---|
| `evidence.retrieved_at`, `evidence.updated_at`, `evidence.capture_url` | Retrieval time (not publication time) and the page capture saved with the snippet |
| `claims.time_context`, `claims.version` | The period a claim refers to; version number for stale-edit protection |
| `verdicts.kind`, `verdicts.predecessor_id`, `verdicts.author`, `verdicts.prompt_version` | Turns `verdicts` into an append-only revision history: AI verdicts and human corrections |
| `verdict_citations` (verdict_id, evidence_id, freshness, freshness_reason) | Per-verdict freshness tag for each cited source |

### 5.5 Technology stack and infrastructure

| Component | Technology | Notes |
|---|---|---|
| Language | Python 3.11 | Entire backend and NLP pipeline |
| Backend API | FastAPI + Uvicorn | REST API with auto-generated docs (OpenAPI) |
| Interface | React (`frontend/`, TypeScript, Vite, Tailwind) | Demo mode on fixture data today (section 10). |
| Text NLP | spaCy (en_core_web_sm) | Tokenization and lemmatization for BM25. NLTK is not used. |
| Retrieval | BM25 (rank_bm25) + Qdrant + e5-large embeddings | Hybrid retrieval over the trusted corpus, with cross-encoder reranking. e5-large is English-only and smaller than BGE-M3. |
| **[Tie-breaker change]** Assessment models | LLM judges through OpenRouter: two judges, plus a third model as tie-breaker | Tie-breaker only on disagreement; NLI dropped |
| **[LLM change, adjusted]** LLM access | **OpenRouter: DeepSeek and Claude Haiku**, both run as judges for the evaluation (claim splitting uses one of them, set in configuration) | Pay-per-token through one OpenAI-compatible API; model IDs in configuration; fallback model for outages |
| Database and cache | PostgreSQL, Redis | Docker Compose on EC2 |
| Cloud hosting | Amazon EC2 (Ubuntu), t3.large (2 vCPU, 8 GB) to start, + Nginx reverse proxy | Backend and UI deployed with Docker Compose. Stop the instance when idle, and check memory during a test run before going smaller. |
| CI/CD | GitHub Actions (lint + unit tests) | Automated checks on every push |
| **[LLM change] [Search change]** External services | Google Fact Check Tools API, **Tavily** (replaces Google Custom Search), **OpenRouter API** | Fact Check API free; Tavily free tier of 1,000 credits a month; LLM billed per token through OpenRouter |

### 5.6 Core API

| Endpoint | Method | Description |
|---|---|---|
| `/api/check` | POST | Accepts a URL or text, creates a new check, returns the `check_id` |
| `/api/check/{id}` | GET | Returns the status and detailed result of a check |
| `/api/check/{id}/feedback` | POST | Records user feedback on a verdict |
| `/api/stats` | GET | Statistics: number of checks, label distribution, average latency |

**[Bonus]** endpoints for the bonus features:

| Endpoint | Method | Description |
|---|---|---|
| `/api/checks` | GET | Paginated check history with search and status filter |
| `/api/claims/{id}/evidence` | GET | Saved evidence for one claim |
| `/api/claims/{id}/revisions` | GET | Verdict history for one claim, oldest first |
| `/api/claims/{id}/corrections` | POST | Publish a human correction against an expected version; `409 Conflict` when stale |

## 6. Development plan

The project runs for 16 weeks (September 1 – December 20, 2026), with two-week milestones during the core development phase. Statuses are as of October 5, 2026.

| Week | Timeframe | Main tasks | Deliverables | Status |
|---|---|---|---|---|
| W1 | Sep 1–6 | Define topic and scope; assign roles | Project outline | Done |
| W2 | Sep 7–13 | In-depth literature survey (Factcheck-GPT, AVeriTeC, Loki, FEVER/LIAR) | Survey notes, chosen approach | Done |
| W3 | Sep 14–20 | Architecture and data schema design; repo and CI setup | Architecture diagram v1, GitHub repo | Done |
| W4 | Sep 21–27 | Data collection: FEVER/LIAR/AVeriTeC, news corpus trial crawl; prompt v1 design | Raw dataset, prompt v1 | Done |
| W5 | Sep 28–Oct 4 | Baseline prototype (zero-shot LLM); midterm report writing | Working prototype, midterm report | Done |
| W6–7 | Oct 5–18 | Hybrid retrieval module: crawl + index the news corpus, BM25 + vector search, reranking | Complete retrieval service | In progress |
| W8–9 | Oct 19–Nov 1 | Known-fake lookup + Redis cache; Google Fact Check API integration; claim-splitting prompt tuning | Fast-verification module | Planned |
| W10–11 | Nov 2–15 | LLM judges + tie-breaker; build the manually labeled evaluation set | Verdict module + 250-sample eval set | Planned |
| W12–13 | Nov 16–29 | End-to-end integration; ablation and tuning; preliminary multimodality (OCR + reverse image search) | Complete end-to-end system | Planned |
| W14 | Nov 30–Dec 6 | Full evaluation on the eval set; draft final report | Evaluation results, report draft | Planned |
| W15 | Dec 7–13 | Deploy the demo on AWS EC2; finalize slides and the introduction video | Deployed demo + defense slides | Planned |
| W16 | Dec 14–20 | Submit the final report; defense preparation | Final version | Planned |

Bonus features (section 9) are built only after the report's core for that stage works.

### 6.1 Risks and mitigation

- **Dependence on external APIs (LLM, Google):** rate limiting, result caching, and a fallback model configuration in case of API outages. **[LLM change]** OpenRouter lets the fallback be a different model or provider behind the same API.
- **Search API access:** Google Custom Search is closed to new customers and ends on January 1, 2027, so the evidence step uses Tavily. **[Search change]** Its free tier allows 1,000 credits a month, so keep the number of searches per claim low, and check Tavily's terms before the report is submitted.
- **Benchmark–reality gap:** curated benchmarks such as FEVER are easier than live claims. The team builds a harder eval subset from real articles, with quality control (2 annotators per sample).
- **Pipeline latency:** process claims in parallel, use the fast path for pre-verified claims, and use smaller models for auxiliary steps.
- **AWS cost control:** stop the EC2 instance when idle, set billing alarms, and keep total spending within the team credits.

## 7. Progress

As of the reporting date (October 5, 2026, end of week 5), the team has completed all items on schedule.

### 7.1 Completed work

- **Survey and approach selection:** studied Factcheck-GPT, Loki, OpenFactCheck/CustChecker, the AVeriTeC results and the benchmarks (FEVER, LIAR, Factcheck-Bench); chose the decompose – retrieve – verify pipeline.
- **System architecture design v1:** the five-layer diagram, the inference flow and the data schema (section 5).
- **Data:** downloaded FEVER (~185K claims), LIAR (12.8K statements) and AVeriTeC (4,568 real-world claims with web evidence) from Hugging Face; registered for and tested the Google Fact Check Tools API; trial-crawled 1,000 articles from trusted English news sources.
- **Baseline prototype:** a working zero-shot LLM fact-checking script (claim splitting + verdicts) tested on 20 sample articles, with a simple interface for input and raw results.
- **Infrastructure:** GitHub repo with a review workflow, automated CI (lint + unit tests), and docker-compose for PostgreSQL/Redis/Qdrant.
- **Management:** a detailed 16-week plan, role assignments and weekly meetings.

### 7.2 Work in progress

The team is building the hybrid evidence-retrieval module (weeks 6–7): scheduled crawling of trusted news sources, vector indexing with e5 embeddings, and recall measurement on trial claims. In parallel, labeling of the 250-sample evaluation set has started, and baseline measurements are being collected for the final report.

### 7.3 Challenges and lessons learned

1. Curated benchmarks are far easier than live claims: published SOTA F1 on raw real-world claims (LIAR-RAW) is only ~33%, so the team must build its own challenging evaluation set.
2. Few-shot prompts for claim splitting needed several rounds of tuning to stabilize.
3. LLM call costs rise quickly when processing many claims, so the team has started using caching and model tiering.

These lessons feed directly into the design of the next modules.

## 8. AI disclosure

### 8.1 AI usage principles

The team uses AI tools under three principles:

1. **Transparency:** every tool used, and the part of the work AI contributed to, is documented (table below).
2. **Human responsibility:** all technical decisions, data labeling and report content are reviewed, edited and approved by team members.
3. **No fabrication:** AI is not used to fake experimental data, measurements or references.

### 8.2 Division of work: humans and AI

AI shares are estimates.

| Task | What humans do | What AI assists with | AI share | Verification |
|---|---|---|---|---|
| Topic and scope definition | Team discussion, topic and scope decisions | None | 0% | Supervisor approves the outline |
| Literature survey | Selecting sources, reading originals, drawing conclusions | Draft summaries, suggesting search keywords | ~40% | Members re-read the original papers |
| Architecture design | Architecture and trade-off decisions | Suggesting options, pros/cons analysis | ~25% | Internal review, supervisor feedback |
| Coding | System design, review, debugging, code ownership | Generating boilerplate, sample unit tests, explaining errors | ~50% | Mandatory code review, CI, live demo |
| Data building and labeling | 100% of labeling done by members | Deduplication support, data formatting | ~5% | Cross-labeling by 2 members per sample |
| Prompt engineering | Designing, evaluating and selecting prompts | Initial prompt drafts, improvement suggestions | ~30% | Comparison experiments on the eval set |
| Report writing | Writing the main content and conclusions, content ownership | Wording support, formatting, diagram drawing | ~30% | Whole-team review of each chapter |
| Slides and demo | Key messages, running the demo | Slide layout support | ~25% | Demo rehearsal before the defense |

### 8.3 AI tools used and commitment

AI tools used during the mid-term phase:

- **ChatGPT (OpenAI):** literature summaries, prompt drafts, Python coding support.
- **GLM (Z.ai):** research, document synthesis and report presentation support.

**Commitment:** all AI-generated content has been reviewed, checked and edited by team members before use, and the team takes full responsibility for the report content. The percentages in the table above are estimates based on actual working experience, not precisely measured figures.

## 9. Bonus features [Bonus]

None of these are in the report. Each extends a report feature without changing it.

| Feature | What it does | Extends |
|---|---|---|
| Saved evidence with page capture | Keeps the exact snippet, retrieval time, publication and update dates (unknown stays unknown) and a page capture | Report's `evidence` table and "cited sources" |
| Evidence freshness tags | Tags each cited source Current, Outdated or Unknown relative to the claim's time period, with a reason for Outdated. Outdated means historically correct but no longer applicable, not false. Never inferred from age alone. | Report's citations |
| Claim time context | Records the period a claim refers to, when the text states one | Report's `claims` |
| Human corrections | A reviewer publishes a corrected verdict with a reason, citing evidence already saved for the claim. Optional screenshots. | Report's user feedback loop |
| Revision history | Corrections create a new version. The original AI verdict, with its model and prompt version, is kept and can be compared. | Report's `verdicts` |
| Stale-edit protection | A correction made against an outdated version is rejected with a conflict instead of overwriting a newer one | Corrections |
| Partial failure handling | A provider error marks only that claim "Verification unavailable"; other claims still show. A technical failure is never reported as "Not enough evidence". | Report's fallback path |
| Check history page | Search and filter past checks | Report's check history in PostgreSQL |
| Text file attachments | Up to 3 `.txt`/`.md` files as input | Report's text input |
| Verdict summary bar | Share of claims per verdict, labeled as a count of verdicts | Report's overall result |
| Demo scenarios | Fixture playback of completed, partial failure, failed and stale-conflict checks, clearly labeled | Demo and defense |
| Light and dark theme | Header toggle, follows the OS setting by default | Interface |

Processing limits that go with these: cap input length, claim count, wait times and retries, and do not blindly retry paid LLM calls after an ambiguous timeout.

## 10. Frontend status and gaps

A mock React frontend exists in `frontend/` (React, TypeScript, Vite, Tailwind). It is the report's "React (extension)" interface. It runs on fixtures with no live AI, search or URL fetching, and is labeled as a demo. See `frontend/README.md`.

Checked against the report on 2026-10-30. Items the report does not mention are kept as bonus features (section 9). These items **disagree with or are missing from** the report:

| # | Report says | Frontend does | Fix |
|---|---|---|---|
| 1 | Four verdicts: Supported / Refuted / Partly true / Not enough evidence | Three: Supported / Contradicted / Insufficient evidence | Rename Contradicted → Refuted and Insufficient evidence → Not enough evidence; add Partly true (badge, color, summary bar, correction form, fixtures) |
| 2 | Each verdict has a confidence score; the result shows an overall label and confidence | No confidence anywhere, and no overall label. The home page says "never a truth score". | Show per-claim confidence and an article-level label with confidence. Keep the verdict bar as a bonus. |
| 3 | Known-fake lookup is a pipeline stage; a matched fact-check gives the fast path | Stages are queued → extracting → retrieving → assessing; fact-check matches are never shown | Add a "Checking known fact-checks" stage and a "Matched published fact-check" marker with the fact-checker as source |
| 4 | User feedback: vote and comment on a verdict (`/api/check/{id}/feedback`) | Only full corrections exist | Add a simple helpful/not helpful vote with an optional comment |
| 5 | API routes `/api/check`, `/api/check/{id}` | Service contract suggests `/api/checks`, `/api/checks/{id}` | Use the report's routes for create and get; keep the other routes as bonus endpoints |
| 6 | Backend is FastAPI | Comments in `src/types/models.ts`, `src/services/contract.ts` and `src/services/index.ts` say Spring Boot | Change the comments to FastAPI on this branch |
| 7 | URL content is extracted (trafilatura/newspaper3k) | URL tab is simulated | Fine for the mock. The backend must implement URL extraction. |
| 8 | Check-worthiness score per claim; highlighted passages in the explanation | Not shown | Optional: show check-worthiness on the claim card and highlight the claim span in the submitted text |
| 9 | `/api/stats`: check count, label distribution, average latency | No stats view | Optional: a small stats panel, or leave for the API only |

Items 1–3 are the most important, because the report's verdict labels, confidence and fast path are what the defense will be judged on.

## 11. Project notes

Carried over from the old `PROJECT_CONTEXT.md` handoff.

- **Two implementations:** this branch (`demo_fastapi`) is the Python/FastAPI coursework version and follows the report. `main` is a Java/Spring Boot portfolio version that shares the frontend and bonus features but does not need every model or infrastructure piece in the report.
- **Product name:** ClaimTrace. It is a web app; don't call it a "platform" in the title.
- **GitHub description:** "AI-assisted fact-checking web app that extracts claims, retrieves evidence, and generates cited verdicts, with human review and versioned corrections."
- **Frontend headline:** "Trace claims. Examine evidence."
- **Frontend brief:** `/Users/chiseled/Documents/ATI/Front-end agent.md`. Its visual direction (blue gradients, light only) is replaced by the current frontend.
- **Earlier research (local files):** `/Users/chiseled/Documents/ATI/reports/Backend intern project differentiation.md` and `/Users/chiseled/Documents/ATI/reports/Backend portfolio hiring discussion evidence.md`.
- **Working style:** keep explanations clear and practical; avoid overengineering and technology checklists; no invented metrics, users, accuracy or performance claims; don't overwrite existing work or commit without permission.

## References

1. J. Thorne, A. Vlachos, C. Christodoulopoulos, A. Mittal. FEVER: A Large-Scale Dataset for Fact Extraction and VERification. NAACL-HLT 2018. aclanthology.org/N18-1074
2. W. Y. Wang. "Liar, Liar Pants on Fire": A New Benchmark Dataset for Fake News Detection. ACL 2017. arXiv:1705.00648
3. Z. Yang, J. Liu, J. Wang. A Coarse-to-fine Cascaded Evidence-Distillation Neural Network for Explainable Fake News Detection (introduces the RAWFC and LIAR-RAW datasets). ACL 2022. aclanthology.org/2022.acl-long.183
4. I.-C. Chern, S. Chern, S. Chen, et al. FacTool: Factuality Detection in Generative AI — A Tool-Augmented Framework for Multi-Task and Multi-Domain Scenarios. arXiv:2307.13528, 2023.
5. Y. Wang et al. Factcheck-GPT: End-to-End Fine-Grained Document-Level Fact-Checking and Correction of LLM Output. Findings of EMNLP 2024. arXiv:2311.09000
6. H. Li et al. Loki: An Open-Source Tool for Fact Verification. System Demonstration of COLING 2025. aclanthology.org/2025.coling-demos.4
7. M. Schlichtkrull et al. AVeriTeC: A Dataset for Real-world Claim Verification with Evidence from the Web. arXiv:2305.13117; shared task at FEVER Workshop @ ACL 2024.
8. Y. Wang et al. OpenFactCheck: Building, Benchmarking Customized Fact-Checking Systems and Evaluating the Factuality of Claims and LLMs. arXiv:2405.05583, 2024.
9. World Economic Forum. The Global Risks Report 2024. Geneva, 2024.
10. Google. Fact Check Tools API Documentation. developers.google.com/fact-check/tools/api (accessed October 2026).

## Change log

| Date | Change | Reason |
|---|---|---|
| 2026-10-26 | Created the ClaimTrace living plan | Separate project scope from chat history |
| 2026-10-30 | Merged with the ATI final project report into one document that follows the report | One document for the FastAPI coursework branch |
| 2026-10-30 | LLM provider changed from OpenAI (GPT-4o-mini / GPT-4o) to OpenRouter (DeepSeek or Claude Haiku) | Team decision; the only change to the report |
| 2026-10-30 | Plan-only features kept as bonus features; frontend checked against the report | Report wins on conflicts; features it doesn't mention are kept as extras |
| 2026-11-01 | Two judge models (DeepSeek and Claude Haiku) run side by side for evaluation; Google Fact Check Tools API stage and its metrics made explicit | Team plan for the evaluation |
| 2026-11-01 | Judge pair and web search rules added: search stays in our pipeline, two judges for the app, candidate models checked on a small set before the evaluation | Keep the judges comparable and the evaluation fixed |
| 2026-11-01 | Google Custom Search replaced by Tavily for web search [Search change]; Google closed the API to new customers and it ends on 2027-01-01 | The evidence step must work for a new team account; this differs from the report |
| 2026-11-01 | NLI model set to DeBERTa-v3-base as a small add-on that runs on every check (the report names DeBERTa-v3 or RoBERTa-large) | Smallest option in the report's DeBERTa-v3 family, cheap to run on EC2 |
| 2026-11-01 | NLI add-on dropped; a third LLM from a different lab breaks ties when the two judges disagree [Tie-breaker change] | A weak per-passage model should not shape verdicts; the report describes an NLI layer, so the final report needs a note |
| 2026-11-01 | Cloud server version finalized as v1.0: Streamlit removed, spaCy only, Qdrant with e5-large, t3.large to start on EC2 | Match the server stack to the choices made for the cloud version |
