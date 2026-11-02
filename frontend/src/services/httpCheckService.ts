// CheckService over the FastAPI backend in ../backend. Routes are listed in AGENT.md.

import type { Check, CheckDetail, CreateCheckInput, ListChecksParams } from '../types/models';
import { t } from '../lib/i18n';
import type { CheckService } from './contract';
import { NotFoundError, ValidationError, VersionConflictError } from './errors';
import { apiUrl } from './mode';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (response.ok) return response.json() as Promise<T>;

  const detail = await response
    .json()
    .then((body) => body.detail)
    .catch(() => undefined);
  if (response.status === 404) throw new NotFoundError();
  if (response.status === 409) throw new VersionConflictError(detail.expectedVersion, detail.currentVersion);
  // 422 from our own checks has a sentence. From request parsing it has a list, which is no use to a reader.
  if (typeof detail === 'string' && [422, 429, 503].includes(response.status)) {
    throw new ValidationError(t(detail));
  }
  throw new Error(`Request failed with status ${response.status}`);
}

/** The backend has no demo scenarios, but the type still expects one. Its fixed messages are in English. */
function fromServer<T extends Omit<Check, 'scenario'>>(check: T): T & Pick<Check, 'scenario'> {
  return { ...check, errorMessage: check.errorMessage && t(check.errorMessage), scenario: 'completed' };
}

function detailFromServer(check: CheckDetail): CheckDetail {
  return {
    ...fromServer(check),
    claims: check.claims.map((claim) => ({
      ...claim,
      unavailableReason: claim.unavailableReason && t(claim.unavailableReason),
      // A model's own text has no translation, so `t` leaves it unchanged.
      current: claim.current && { ...claim.current, rationale: t(claim.current.rationale) },
    })),
  };
}

export const httpCheckService: CheckService = {
  async createCheck({ scenario: _scenario, ...input }: CreateCheckInput) {
    const check = await request<Check>('/api/check', { method: 'POST', body: JSON.stringify(input) });
    return fromServer(check);
  },

  async getCheck(id) {
    return detailFromServer(await request<CheckDetail>(`/api/check/${encodeURIComponent(id)}`));
  },

  async listChecks({ query, status, page, pageSize }: ListChecksParams = {}) {
    const search = new URLSearchParams();
    if (query) search.set('query', query);
    if (status) search.set('status', status);
    if (page) search.set('page', String(page));
    if (pageSize) search.set('pageSize', String(pageSize));
    const result = await request<Awaited<ReturnType<CheckService['listChecks']>>>(`/api/checks?${search}`);
    return { ...result, items: result.items.map(fromServer) };
  },

  getClaimEvidence: (claimId) => request(`/api/claims/${encodeURIComponent(claimId)}/evidence`),

  getClaimRevisions: (claimId) => request(`/api/claims/${encodeURIComponent(claimId)}/revisions`),

  // Note: the UI's correction flow is hidden for now (`showReviewButton` in config).
  publishCorrection: (claimId, body) =>
    request(`/api/claims/${encodeURIComponent(claimId)}/corrections`, { method: 'POST', body: JSON.stringify(body) }),
};
