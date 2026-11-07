import { CalendarDays, CalendarX, CloudOff, Loader2, PencilLine } from 'lucide-react';
import { config } from '../../config';
import type { Claim, EvidenceSnapshot } from '../../types/models';
import { RevisionKindBadge, VerdictHeadline } from '../../components/Badges';
import { JudgeReviews } from './JudgeComparison';
import { HighlightedText } from '../../components/HighlightedText';
import { SourceDeck } from './SourceDeck';
import { PriceChart } from './PriceChart';
import { LocationMap } from './LocationMap';
import { HeatMap } from './HeatMap';
import { CountryMap } from './CountryMap';
import { ElectionMap } from './ElectionMap';
import { SeatChart } from './SeatChart';
import { inLanguage, t } from '../../lib/i18n';

export type EvidenceState =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; items: EvidenceSnapshot[] };

interface Props {
  claim: Claim;
  claimCount: number;
  evidence: EvidenceState;
  onRetry: () => void;
  onReview: () => void;
}

/** Detail for the selected claim: verdict, reasoning, actions, and the evidence behind it. */
export function EvidencePanel({ claim, claimCount, evidence, onRetry, onReview }: Props) {
  const current = claim.current;
  const assessed = Boolean(current && claim.status === 'assessed');
  // A human correction has no model reviews, so it shows its rationale alone.
  const reviews = assessed && current!.judges?.length ? current!.judges : null;
  const cited = new Set(current?.citedEvidenceIds ?? []);
  const freshness = current?.citationFreshness ?? {};
  const outdatedCount = [...cited].filter((id) => freshness[id]?.status === 'outdated').length;
  const items = evidence.kind === 'ready' ? evidence.items : [];
  const balance = {
    supporting: items.filter((i) => i.relation === 'supporting').length,
    contradicting: items.filter((i) => i.relation === 'contradicting').length,
    contextual: items.filter((i) => i.relation === 'contextual').length,
  };

  return (
    <section aria-labelledby="evidence-heading" className="text-sm">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
        {/* The claim and its verdict */}
        <div>
          <p className="sr-only">{t('Claim {position} of {count}', { position: claim.position, count: claimCount })}</p>
          <h1 id="evidence-heading" className="text-[24px] font-medium leading-[1.2] tracking-[-0.025em] text-ink sm:text-[30px]">
            {claim.text}
          </h1>
          {claim.rephrasedFrom && (
            <p className="mt-2 text-[13px] leading-[1.5] text-ink-muted">
              {t('Written by AI from your question: “{question}”. You did not state this claim.', { question: claim.rephrasedFrom })}
            </p>
          )}
          <div className="mt-4">
            <VerdictHeadline verdict={assessed ? current!.verdict : null} />
            {/* AI revisions need no label here; a human correction is worth stating. */}
            {assessed && current!.kind === 'human_correction' && (
              <div className="mt-2.5">
                <RevisionKindBadge kind={current!.kind} version={current!.version} />
              </div>
            )}
          </div>
        </div>

        {/* Reasoning. The wide-screen rule sits in the gap, so the columns stay aligned with the sources below. */}
        <div className="relative border-t border-line-strong pt-6 lg:border-t-0 lg:pt-0 lg:before:absolute lg:before:inset-y-0 lg:before:-left-7 lg:before:w-px lg:before:bg-line-strong">
          {reviews ? (
            <div>
              <p className="text-[15px] leading-[1.65] text-ink-soft">
                <HighlightedText text={inLanguage(current!.rationale, reviews.find((judge) => judge.primary)?.translations)} />
              </p>
              <details className="mt-4">
                <summary className="cursor-pointer font-medium text-indigo-700 underline decoration-line-strong underline-offset-4">
                  {t('View model reasoning')}
                </summary>
                <div className="mt-4">
                  <JudgeReviews judges={reviews} />
                </div>
              </details>
            </div>
          ) : (
            <p className="text-[15px] leading-[1.65] text-ink-soft">
              {assessed
                ? <HighlightedText text={current!.rationale} />
                : `${t(claim.unavailableReason ?? 'Verification was unavailable.')} ${t('This is not an evidence-based verdict.')}`}
            </p>
          )}


          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-sans text-[13px] text-ink-muted">
            {claim.timeContext && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {claim.timeContext}
              </span>
            )}
            {outdatedCount > 0 && (
              <a
                href="#sources-heading"
                className="inline-flex items-center gap-1 text-ink-soft underline decoration-line-strong underline-offset-4"
              >
                <CalendarX className="h-3.5 w-3.5 text-candy" aria-hidden="true" />
                {t(outdatedCount === 1 ? '{count} outdated source' : '{count} outdated sources', { count: outdatedCount })}
              </a>
            )}
          </div>
        </div>
      </div>

      {claim.priceChart && <PriceChart chart={claim.priceChart} />}
      {claim.locationMap && <LocationMap map={claim.locationMap} />}
      {claim.heatMap && <HeatMap map={claim.heatMap} />}
      {claim.countryMap && <CountryMap map={claim.countryMap} />}
      {claim.seatChart && <SeatChart chart={claim.seatChart} />}
      {claim.electionMap && <ElectionMap map={claim.electionMap} />}

      {/* Evidence */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {items.length > 0 ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id="sources-heading" className="press-label scroll-mt-20">
              {t('Sources')} <span className="tabular-nums">· {items.length}</span>
            </h2>
            <p className="text-[13px] text-ink-muted">
              {t('{supporting} supporting · {contradicting} contradicting · {contextual} context', balance)}
            </p>
          </div>
        ) : (
          <span />
        )}
        {assessed && config.correction.showReviewButton && (
          <button
            type="button"
            onClick={onReview}
            className="press-lift inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-page hover:opacity-90"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            {t('Review assessment')}
          </button>
        )}
      </div>

      <div className="mt-5">
        {evidence.kind === 'loading' ? (
          <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t('Loading evidence…')}
          </p>
        ) : evidence.kind === 'error' ? (
          <p role="alert" className="text-sm text-rose-700">
            {evidence.message}{' '}
            <button type="button" className="underline underline-offset-4" onClick={onRetry}>
              {t('Try again')}
            </button>
          </p>
        ) : items.length === 0 && claim.status === 'unavailable' ? (
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('No evidence was retrieved, so there is no verdict — true or false.')}
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('No evidence snapshots are attached to this claim.')}</p>
        ) : (
          <>
            <div className="mt-5">
              <SourceDeck claim={claim} items={items} citedIds={cited} freshness={freshness} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
