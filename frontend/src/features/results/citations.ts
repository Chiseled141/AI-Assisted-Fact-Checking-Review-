import type { Claim } from '../../types/models';

/** Citation numbers are stable per claim: `[n]` is the evidence's position + 1. */
export function citationNumber(claim: Pick<Claim, 'evidenceIds'>, evidenceId: string): number {
  return claim.evidenceIds.indexOf(evidenceId) + 1;
}

export function evidenceElementId(evidenceId: string): string {
  return `evidence-${evidenceId}`;
}
