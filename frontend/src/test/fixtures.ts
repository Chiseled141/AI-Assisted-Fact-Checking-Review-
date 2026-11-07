// Small synthetic response objects for unit tests only. Application code must never import this file.
import type { AssessmentRevision, CheckDetail, Claim, EvidenceSnapshot } from '../types/models';

export const checkedAt = '2026-11-04T10:00:00+00:00';

export function makeRevision(overrides: Partial<AssessmentRevision> = {}): AssessmentRevision {
  return {
    id: 'rev_test', claimId: 'clm_test', version: 1, kind: 'ai_assessment', verdict: 'supported',
    rationale: 'The supplied report states the opening date.', citedEvidenceIds: ['evd_test'],
    citationFreshness: { evd_test: { status: 'current' } }, author: 'AI', createdAt: checkedAt,
    judges: [
      { judge: 'GPT Luna', verdict: 'supported', confidence: 0.9, review: 'The report gives the opening date.', primary: true },
      { judge: 'Gemma 4 31B', verdict: 'supported', confidence: 0.8, review: 'The dates agree.', primary: false },
    ],
    ...overrides,
  };
}

export function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'clm_test', checkId: 'chk_test', position: 1, text: 'The route opened in March 2024.',
    status: 'assessed', evidenceIds: ['evd_test'], currentVersion: 1, current: makeRevision(), ...overrides,
  };
}

export function makeCheck(overrides: Partial<CheckDetail> = {}): CheckDetail {
  return {
    id: 'chk_test', title: 'A saved check', inputType: 'text', inputText: 'The route opened in March 2024.',
    status: 'completed', createdAt: checkedAt, updatedAt: checkedAt, claimCount: 1,
    judgeIds: ['gpt-luna', 'gemma-4-31b'], claims: [makeClaim()], ...overrides,
  };
}

export function makeEvidence(overrides: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot {
  return {
    id: 'evd_test', claimId: 'clm_test', sourceTitle: 'Opening report', publisher: 'Test News',
    url: 'https://example.org/opening', excerpt: 'The route opened in March 2024.',
    publishedAt: '2024-03-01', retrievedAt: checkedAt, relation: 'supporting',
    ...overrides,
  };
}
