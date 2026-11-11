// CheckService over the FastAPI backend in ../backend. Routes are in backend/app/api/, and at /docs when it runs.

import type { Check, CheckDetail, CreateCheckInput, ListChecksParams } from '../types/models';
import { inLanguage, t } from '../lib/i18n';
import type { CheckService } from './contract';
import { NotFoundError, UnauthorizedError, ValidationError, VersionConflictError } from './errors';
import { apiUrl } from './api';
import { signInRequired } from './account';

async function request<T>(path: string, init?: RequestInit, redirectOnUnauthorized = true): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    // The session cookie also goes to a backend on another origin (VITE_API_URL).
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (response.ok) return response.json() as Promise<T>;
  if (response.status === 401) {
    // Opening a page sends you to log in. Sending a form keeps it, with the message beside it.
    if (!init?.method || init.method === 'GET') signInRequired(redirectOnUnauthorized);
    throw new UnauthorizedError(t('Log in to continue.'));
  }

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

/** Translate fixed server messages while preserving the saved results. */
function fromServer<T extends Check>(check: T): T {
  return { ...check, errorMessage: check.errorMessage && t(check.errorMessage) };
}

function detailFromServer(check: CheckDetail): CheckDetail {
  return {
    ...fromServer(check),
    claims: check.claims.map((claim) => ({
      ...claim,
      unavailableReason: claim.unavailableReason && t(claim.unavailableReason),
      // A model's own text has no translation, so `t` leaves it unchanged. A model note carries its own languages.
      current: claim.current && {
        ...claim.current,
        rationale: claim.current.translations
          ? inLanguage(claim.current.rationale, claim.current.translations)
          : t(claim.current.rationale),
      },
    })),
  };
}

export const httpCheckService: CheckService = {
  async createCheck(input: CreateCheckInput) {
    const check = await request<Check>('/api/check', { method: 'POST', body: JSON.stringify(input) });
    return fromServer(check);
  },

  async getCheck(id) {
    return detailFromServer(await request<CheckDetail>(`/api/check/${encodeURIComponent(id)}`));
  },

  suggestCheckInputs: (id) => request(`/api/check/${encodeURIComponent(id)}/input-suggestions`, { method: 'POST' }),

  async listChecks({ query, status, page, pageSize }: ListChecksParams = {}, { redirectOnUnauthorized, signal } = {}) {
    const search = new URLSearchParams();
    if (query) search.set('query', query);
    if (status) search.set('status', status);
    if (page) search.set('page', String(page));
    if (pageSize) search.set('pageSize', String(pageSize));
    const result = await request<Awaited<ReturnType<CheckService['listChecks']>>>(`/api/checks?${search}`, { signal }, redirectOnUnauthorized);
    return { ...result, items: result.items.map(fromServer) };
  },

  getClaimEvidence: (claimId) => request(`/api/claims/${encodeURIComponent(claimId)}/evidence`),

  getClaimRevisions: (claimId) => request(`/api/claims/${encodeURIComponent(claimId)}/revisions`),

  publishCorrection: (claimId, body) =>
    request(`/api/claims/${encodeURIComponent(claimId)}/corrections`, { method: 'POST', body: JSON.stringify(body) }),

  askFollowUp: (checkId, question, files = [], modelId, replyToId, target) =>
    request(`/api/check/${encodeURIComponent(checkId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        question,
        ...(files.length ? { files } : {}),
        ...(modelId ? { modelId } : {}),
        ...(replyToId ? { replyToId } : {}),
        ...(target ? { target } : {}),
      }),
    }),

  stopCheck: (checkId) => request(`/api/check/${encodeURIComponent(checkId)}/stop`, { method: 'POST' }),

  answerReview: (checkId, answer) =>
    request(`/api/check/${encodeURIComponent(checkId)}/review`, { method: 'POST', body: JSON.stringify(answer) }),

  deleteCheck: (checkId) => request(`/api/check/${encodeURIComponent(checkId)}`, { method: 'DELETE' }),

  findEarlier: (input, signal) => request('/api/checks/similar', { method: 'POST', body: JSON.stringify(input), signal }),
};
