// Frontend contract for the FastAPI backend.

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
  /** POST /api/check → 202 Check. File contents are included as text in the JSON body. */
  createCheck(input: CreateCheckInput): Promise<Check>;
  /** GET /api/check/{id} → CheckDetail, including claims saved so far. */
  getCheck(id: string): Promise<CheckDetail>;
  /** GET /api/checks?query=&status=&page= → Page<Check> */
  listChecks(params?: ListChecksParams): Promise<Page<Check>>;
  /** GET /api/claims/{id}/evidence → EvidenceSnapshot[] */
  getClaimEvidence(claimId: string): Promise<EvidenceSnapshot[]>;
  /** GET /api/claims/{id}/revisions → AssessmentRevision[] (oldest first) */
  getClaimRevisions(claimId: string): Promise<AssessmentRevision[]>;
  /**
   * POST /api/claims/{id}/corrections with `expectedVersion`.
   * The server must reject a stale version with 409 Conflict (→ VersionConflictError).
   */
  publishCorrection(claimId: string, request: CorrectionRequest): Promise<PublishCorrectionResult>;
}
