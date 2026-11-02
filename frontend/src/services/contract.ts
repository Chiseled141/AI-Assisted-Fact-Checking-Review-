// Frontend service contract. The mock implementation satisfies it today;
// httpCheckService calls the FastAPI backend with the same shapes.

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
  /** POST /api/check → 202 Check + status location (multipart when files are attached) */
  createCheck(input: CreateCheckInput): Promise<Check>;
  /** GET /api/check/{id} → CheckDetail (claims empty until completed) */
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
