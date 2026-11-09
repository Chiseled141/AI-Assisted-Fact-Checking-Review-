// Frontend contract for the FastAPI backend.

import type {
  AssessmentRevision,
  ChatMessage,
  Check,
  EarlierChecks,
  CheckDetail,
  FollowUpTarget,
  Claim,
  CorrectionRequest,
  CreateCheckInput,
  ReviewAnswer,
  EvidenceSnapshot,
  ListChecksParams,
  Page,
  SubmittedFile,
} from '../types/models';

export interface PublishCorrectionResult {
  claim: Claim;
  revision: AssessmentRevision;
}

export interface CheckService {
  /** POST /api/check → 202 Check. File contents are included as text in the JSON body. */
  createCheck(input: CreateCheckInput): Promise<Check>;
  /** GET /api/check/{id} → CheckDetail, including claims saved so far. */
  getCheck(id: string): Promise<CheckDetail>;
  suggestCheckInputs(id: string): Promise<{ suggestions: string[] }>;
  /** GET /api/checks?query=&status=&page= → Page<Check> */
  listChecks(params?: ListChecksParams, options?: { redirectOnUnauthorized?: boolean; signal?: AbortSignal }): Promise<Page<Check>>;
  /** GET /api/claims/{id}/evidence → EvidenceSnapshot[] */
  getClaimEvidence(claimId: string): Promise<EvidenceSnapshot[]>;
  /** GET /api/claims/{id}/revisions → AssessmentRevision[] (oldest first) */
  getClaimRevisions(claimId: string): Promise<AssessmentRevision[]>;
  /**
   * POST /api/claims/{id}/corrections with `expectedVersion`.
   * The server must reject a stale version with 409 Conflict (→ VersionConflictError).
   */
  publishCorrection(claimId: string, request: CorrectionRequest): Promise<PublishCorrectionResult>;
  /** POST /api/check/{id}/messages → 201 ChatMessage. A paid model call, answered with saved context and optional web search. */
  askFollowUp(checkId: string, question: string, files?: SubmittedFile[], modelId?: string, replyToId?: string, target?: FollowUpTarget): Promise<ChatMessage>;
  /** POST /api/check/{id}/stop → the check ends now, and the running pipeline at its next step. */
  stopCheck(checkId: string): Promise<unknown>;
  /** POST /api/check/{id}/review → the reader's answer to what the check asked, and the check goes on. */
  answerReview(checkId: string, answer: ReviewAnswer): Promise<unknown>;
  /** DELETE /api/check/{id} → the check and everything saved under it are gone. A running check is refused. */
  deleteCheck(checkId: string): Promise<unknown>;
  /** POST /api/checks/similar → earlier checks of the same claim or link. Reads the database; no model is called. */
  findEarlier(input: { text?: string; url?: string }, signal?: AbortSignal): Promise<EarlierChecks>;
}
