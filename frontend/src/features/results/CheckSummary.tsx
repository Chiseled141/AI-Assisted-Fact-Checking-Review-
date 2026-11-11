import type { Claim, Verdict } from '../../types/models';
import { verdictLabel } from '../../lib/format';
import { t } from '../../lib/i18n';
import { judgesDisagree } from './JudgeComparison';

type Outcome = Verdict | 'disagreement' | 'unavailable';

const order: Outcome[] = ['supported', 'contradicted', 'outdated', 'insufficient_evidence', 'disagreement', 'unavailable'];
const tone: Record<Outcome, { fill: string; text: string }> = {
  supported: { fill: 'bg-emerald-700', text: 'text-emerald-700' },
  contradicted: { fill: 'bg-rose-600', text: 'text-rose-600' },
  outdated: { fill: 'bg-slate-600', text: 'text-slate-600' },
  insufficient_evidence: { fill: 'bg-amber-700', text: 'text-amber-700' },
  disagreement: { fill: 'bg-ink-muted', text: 'text-ink-soft' },
  unavailable: { fill: 'bg-ink-faint/45', text: 'text-ink-muted' },
};

export function claimOutcome(claim: Claim): Outcome {
  if (claim.status !== 'assessed' || !claim.current) return 'unavailable';
  return judgesDisagree(claim.current.judges) ? 'disagreement' : claim.current.verdict;
}

function outcomeLabel(outcome: Outcome): string {
  if (outcome === 'disagreement') return t('Judges disagree');
  if (outcome === 'unavailable') return t('Not checked');
  return verdictLabel[outcome];
}

/** How the whole check came out: one bar segment per claim, and a count for each verdict. Shown when there is more than one claim. */
export function CheckSummary({ claims }: { claims: Claim[] }) {
  if (claims.length < 2) return null;
  const outcomes = claims.map(claimOutcome);
  const counts = order
    .map((outcome) => ({ outcome, count: outcomes.filter((value) => value === outcome).length }))
    .filter(({ count }) => count > 0);

  return (
    <section aria-label={t('Summary of this check')} className="press-rise mb-8">
      <dl className="flex flex-wrap items-end gap-x-8 gap-y-3">
        {counts.map(({ outcome, count }) => (
          <div key={outcome} className="flex items-baseline gap-2">
            <dd className={`text-[30px] font-medium leading-none tracking-[-0.03em] tabular-nums ${tone[outcome].text}`}>{count}</dd>
            <dt className="text-[13px] text-ink-muted">{outcomeLabel(outcome)}</dt>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex h-1.5 gap-[3px]" aria-hidden="true">
        {counts.flatMap(({ outcome, count }) =>
          Array.from({ length: count }, (_, index) => (
            <span key={`${outcome}${index}`} className={`h-full flex-1 rounded-full ${tone[outcome].fill}`} />
          )))}
      </div>
    </section>
  );
}
