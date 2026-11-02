// Domain models shared by the UI and the service layer.
// The FastAPI backend returns the same field names.

export type InputType = 'text' | 'url';

/** Processing lifecycle of a check. `completed` and `failed` are terminal. */
export type CheckStatus = 'queued' | 'extracting' | 'retrieving' | 'assessing' | 'completed' | 'failed';

export type Verdict = 'supported' | 'contradicted' | 'insufficient_evidence' | 'outdated';

/**
 * `assessed` claims have at least one revision with a verdict.
 * `unavailable` means the evidence provider failed, so no verdict exists.
 */
export type ClaimStatus = 'assessed' | 'unavailable';

export type EvidenceRelation = 'supporting' | 'contradicting' | 'contextual';

export type RevisionKind = 'ai_assessment' | 'human_correction';

/**
 * Whether a cited passage applies to the claim's time period. Judged per revision,
 * separately from the verdict: `outdated` means it may have been true then but no
 * longer applies; `current` means temporally applicable, not guaranteed accurate.
 */
export type Freshness = 'current' | 'outdated' | 'unknown';

export interface FreshnessJudgment {
  status: Freshness;
  /** Required for `outdated`; recommended for `unknown`. */
  reason?: string;
}

/** Demo-only: which preset fixture scenario a check plays back. */
export type DemoScenario = 'completed' | 'partial_failure' | 'failed' | 'stale_conflict';

/** A text file attached to a text check. Contents are read in the browser. */
export interface SubmittedFile {
  name: string;
  /** Size in bytes of the original file. */
  size: number;
  text: string;
}

export interface CheckedArticle {
  title: string;
  publisher?: string;
  /** YYYY-MM-DD */
  publishedAt?: string;
}

export interface Check {
  id: string;
  title: string;
  inputType: InputType;
  inputText?: string;
  inputUrl?: string;
  /** Text checks only. */
  files?: SubmittedFile[];
  /** What is known about the article at `inputUrl`, when the demo has it. */
  article?: CheckedArticle;
  /** Demo-only: the claims really come from this input, rather than being sample data. */
  claimsMatchInput?: boolean;
  status: CheckStatus;
  createdAt: string;
  updatedAt: string;
  /** Set once claims have been extracted. */
  claimCount?: number;
  /** Human-readable failure reason when `status === 'failed'`. */
  errorMessage?: string;
  /** Ids of the two judges this check was started with (see `config.judges`). */
  judgeIds?: string[];
  /** Demo-only metadata; a real backend would not return this. */
  scenario: DemoScenario;
}

/** Editorial rating of a source: good, mixed, or bad. Separate from verdicts and freshness. */
export type SourceTrust = 'green' | 'yellow' | 'red';

export interface SourceEntry {
  domain: string;
  name: string;
  trust: SourceTrust;
  /** One line on what this source is, e.g. "Official website of the Government of Vietnam". */
  about?: string;
  /** File name in public/source-logos. Missing means the UI shows a monogram. */
  logo?: string;
}

/** Screenshot of the source page taken when the evidence was retrieved. */
export interface PageCapture {
  /** Image URL (same-origin path or https). */
  url: string;
  capturedAt: string;
  width: number;
  height: number;
}

export interface EvidenceSnapshot {
  id: string;
  claimId: string;
  sourceTitle: string;
  publisher?: string;
  url: string;
  /** Saved text captured at retrieval time — not a live preview. */
  excerpt: string;
  /** Publication date of the source, when known (YYYY-MM-DD). Unknown stays unknown. */
  publishedAt?: string;
  /** Last update date stated by the source, when known (YYYY-MM-DD). */
  updatedAt?: string;
  retrievedAt: string;
  /** The article's own lead image (its og:image), shown from the publisher's server, never copied. */
  imageUrl?: string;
  capture?: PageCapture;
  relation: EvidenceRelation;
  analysis?: SourceAnalysis;
}

/** What each judge scores a source on, in chart order. */
export const ratingCriteria = ['match', 'directness', 'timing', 'detail'] as const;
export type RatingCriterion = (typeof ratingCriteria)[number];

/** What an article says, and how the AI judges read it. The assessment, notes and ratings are simulated in this demo. */
export interface SourceAnalysis {
  summary: string;
  keyPoints: string[];
  assessment: string;
  /** `ratings` are scores out of 100, in `ratingCriteria` order. */
  judgeNotes: { judge: string; note: string; ratings: number[] }[];
}

/**
 * One LLM judge's verdict on a claim. An AI revision lists both judges; the judge
 * marked `primary` is the configured one whose verdict the revision shows.
 */
export interface JudgeVerdict {
  /** Display name of the model, e.g. "DeepSeek". */
  judge: string;
  verdict: Verdict;
  /** 0–1. */
  confidence: number;
  /** The judge's overall reasoning for its verdict. */
  review: string;
  primary: boolean;
}

/** A published fact-check that the known-fake lookup matched to a claim (fast path). */
export interface FactCheckMatch {
  publisher: string;
  /** The publisher's own rating wording, shown as written. */
  rating: string;
  url: string;
}

/** An image attached by a reviewer, stored as a base64 data URL in demo mode. */
export interface Attachment {
  id: string;
  name: string;
  /** MIME type of the stored image. */
  type: string;
  /** Approximate stored size in bytes. */
  size: number;
  dataUrl: string;
}

export interface AssessmentRevision {
  id: string;
  claimId: string;
  /** 1-based, increments with every published revision. */
  version: number;
  kind: RevisionKind;
  verdict: Verdict;
  /** AI explanation, or the reviewer's correction reason. */
  rationale: string;
  citedEvidenceIds: string[];
  /** Freshness of each cited snapshot for this revision, keyed by evidence id. Missing = unknown. */
  citationFreshness?: Record<string, FreshnessJudgment>;
  /** Screenshots the reviewer attached to a human correction. */
  attachments?: Attachment[];
  /** AI revisions record which model and prompt produced them. */
  model?: { name: string; promptVersion: string };
  /** AI revisions: each LLM judge's own verdict, so disagreement is visible. */
  judges?: JudgeVerdict[];
  author: string;
  createdAt: string;
}

export interface Claim {
  id: string;
  checkId: string;
  position: number;
  text: string;
  /** Short noun phrase for the overall statement (e.g. "the March 2024 opening"). */
  topic?: string;
  /** Time period the claim refers to, when known (e.g. "March 2024"). */
  timeContext?: string;
  status: ClaimStatus;
  /** Ordered; citation number `[n]` is index + 1. */
  evidenceIds: string[];
  /** Version of the latest revision (0 when none exists). */
  currentVersion: number;
  current: AssessmentRevision | null;
  /** Provider error shown when `status === 'unavailable'`. */
  unavailableReason?: string;
  /** Set when the known-fake lookup found a published fact-check for this claim. */
  factCheck?: FactCheckMatch;
}

export interface CheckDetail extends Check {
  claims: Claim[];
}

export interface CorrectionRequest {
  verdict: Verdict;
  reason: string;
  /** Must be a subset of the claim's attached evidence snapshots. */
  evidenceIds: string[];
  /** Optional screenshots supporting the correction. */
  attachments?: Attachment[];
  /** Freshness judgments for cited snapshots, keyed by evidence id. */
  citationFreshness?: Record<string, FreshnessJudgment>;
  /** Version the reviewer saw; a mismatch is rejected as a conflict. */
  expectedVersion: number;
}

export interface CreateCheckInput {
  inputType: InputType;
  text?: string;
  url?: string;
  /** Text checks only; may stand in for typed text. */
  files?: SubmittedFile[];
  scenario?: DemoScenario;
  /** Two judge ids from `config.judges`; defaults to `config.judges.defaultIds`. */
  judgeIds?: string[];
}

export interface ListChecksParams {
  query?: string;
  status?: 'all' | 'processing' | 'completed' | 'failed';
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const PROCESSING_STAGES = ['queued', 'extracting', 'retrieving', 'assessing', 'completed'] as const;

export function isTerminal(status: CheckStatus): boolean {
  return status === 'completed' || status === 'failed';
}
