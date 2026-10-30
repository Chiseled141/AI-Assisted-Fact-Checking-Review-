// Frontend service contract. The mock implementation satisfies it today;
// an HTTP implementation calling the Spring Boot API can replace it later.
// These are proposals, not a fixed backend specification.

import type {
  AssessmentRevision,
  Check,
  CheckDetail,
  Claim,
  CorrectionRequest,
  CreateCheckInput,
  EvidenceSnapshot,
  ListChecksParams,
  Page,
} from '../types/models';

export interface PublishCorrectionResult {
  claim: Claim;
  revision: AssessmentRevision;
}

export interface CheckService {
  /** Suggested: POST /api/checks → 202 Check + status location (multipart when files are attached) */
  createCheck(input: CreateCheckInput): Promise<Check>;
  /** Suggested: GET /api/checks/{id} → CheckDetail (claims empty until completed) */
  getCheck(id: string): Promise<CheckDetail>;
  /** Suggested: GET /api/checks?query=&status=&page= → Page<Check> */
  listChecks(params?: ListChecksParams): Promise<Page<Check>>;
  /** Suggested: GET /api/claims/{id}/evidence → EvidenceSnapshot[] */
  getClaimEvidence(claimId: string): Promise<EvidenceSnapshot[]>;
  /** Suggested: GET /api/claims/{id}/revisions → AssessmentRevision[] (oldest first) */
  getClaimRevisions(claimId: string): Promise<AssessmentRevision[]>;
  /**
   * Suggested: POST /api/claims/{id}/corrections with `expectedVersion`.
   * The server must reject a stale version with 409 Conflict (→ VersionConflictError).
   */
  publishCorrection(claimId: string, request: CorrectionRequest): Promise<PublishCorrectionResult>;
}
