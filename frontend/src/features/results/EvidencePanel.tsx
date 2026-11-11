import { CalendarX, Loader2, PencilLine } from 'lucide-react';
import { config } from '../../config';
import type { ChartKey, ChatReference, Claim, EvidenceSnapshot, FollowUpTarget } from '../../types/models';
import { RevisionKindBadge, VerdictHeadline } from '../../components/Badges';
import { JudgeReviews, judgesDisagree } from './JudgeComparison';
import { HighlightedText } from '../../components/HighlightedText';
import { SourceDeck } from './SourceDeck';
import { EvidenceGlance } from './EvidenceGlance';
import { EvidenceSourceLinks } from './EvidenceSourceLinks';
import { PriceChart } from './charts/PriceChart';
import { StockHeatmap } from './charts/StockHeatmap';
import { LocationMap } from './charts/LocationMap';
import { PieChart } from './charts/PieChart';
import { BarChart } from './charts/BarChart';
import { RouteMap } from './charts/RouteMap';
import { MatchResult } from './charts/MatchResult';
import { IncidentMap } from './charts/IncidentMap';
import { CountryMap } from './charts/CountryMap';
import { PopulationPyramid } from './charts/PopulationPyramid';
import { ElectionMap } from './charts/ElectionMap';
import { SeatChart } from './charts/SeatChart';
import { getLanguage, inLanguage, t } from '../../lib/i18n';

export type EvidenceState =
  { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; items: EvidenceSnapshot[] };

interface Props {
  claim: Claim;
  claimCount: number;
  evidence: EvidenceState;
  onRetry: () => void;
  onReview: () => void;
  onReplyToResult: (target: FollowUpTarget, reference: Omit<ChatReference, 'kind'>, modelId?: string) => void;
}

/** Detail for the selected claim: verdict, reasoning, actions, and the evidence behind it. */
export function EvidencePanel({ claim, claimCount, evidence, onRetry, onReview, onReplyToResult }: Props) {
  const current = claim.current;
  const assessed = Boolean(current && claim.status === 'assessed');
  // A human correction has no model reviews, so it shows its rationale alone.
  const reviews = assessed && current!.judges?.length ? current!.judges : null;
  const disagree = judgesDisagree(reviews);
  const cited = new Set(current?.citedEvidenceIds ?? []);
  const freshness = current?.citationFreshness ?? {};
  const outdatedCount = [...cited].filter((id) => freshness[id]?.status === 'outdated').length;
  const items = evidence.kind === 'ready' ? evidence.items : [];
  const sourcesProvided = evidence.kind === 'ready' && current?.version === 1 ? items.length : undefined;
  const translation = claim.translations?.[getLanguage()];
  function replyToJudge(judge: string, modelId: string) {
    onReplyToResult({ claimId: claim.id, kind: 'judge', key: judge }, { title: judge }, modelId);
  }

  function replyToSource(item: EvidenceSnapshot) {
    onReplyToResult({ claimId: claim.id, kind: 'source', key: item.id }, { title: item.sourceTitle, url: item.url });
  }

  function replyToChart(key: ChartKey, title: string) {
    onReplyToResult({ claimId: claim.id, kind: 'chart', key }, { title });
  }

  return (
    <section aria-labelledby="evidence-heading" className="text-sm">
      <div className={disagree ? 'grid gap-4' : 'grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14'}>
        {/* The claim and its verdict */}
        <div>
          <p className="sr-only">{t('Claim {position} of {count}', { position: claim.position, count: claimCount })}</p>
          <h1 id="evidence-heading" className={`text-[24px] font-medium leading-[1.25] tracking-[-0.025em] text-ink sm:text-[30px] ${disagree ? 'max-w-[72ch]' : ''}`}>
            {claim.text}
          </h1>
          {/* The claim stays as it was checked. Its translation only ever appears under it. */}
          {translation && translation !== claim.text && (
            <p className="mt-3 text-[15px] leading-[1.5] text-ink-soft">
              <span className="font-medium text-ink-muted">{t('Translation:')} </span>{translation}
            </p>
          )}
          {claim.rephrasedFrom && (
            <p className="mt-2 text-[13px] leading-[1.5] text-ink-muted">
              {t('Written by AI from your question: “{question}”. You did not state this claim.', { question: claim.rephrasedFrom })}
            </p>
          )}
          <div className="mt-4">
            <VerdictHeadline verdict={disagree ? 'disagreement' : assessed ? current!.verdict : null} />
            {/* AI revisions need no label here; a human correction is worth stating. */}
            {assessed && current!.kind === 'human_correction' && (
              <div className="mt-2.5">
                <RevisionKindBadge kind={current!.kind} version={current!.version} />
              </div>
            )}
          </div>
        </div>

        {/* Reasoning. The wide-screen rule sits in the gap, so the columns stay aligned with the sources below. */}
        <div className={disagree ? undefined : 'relative border-t border-line-strong pt-6 lg:border-t-0 lg:pt-0 lg:before:absolute lg:before:inset-y-0 lg:before:-left-7 lg:before:w-px lg:before:bg-line-strong'}>
          {disagree && reviews ? (
            <JudgeReviews judges={reviews} onReply={replyToJudge} evidence={items} sourcesProvided={sourcesProvided} />
          ) : reviews ? (
            <div>
              <p className="text-[15px] leading-[1.65] text-ink-soft">
                <HighlightedText text={inLanguage(current!.rationale, reviews.find((judge) => judge.primary)?.translations)} />
              </p>
              <details className="mt-4">
                <summary className="cursor-pointer font-medium text-indigo-700 underline decoration-line-strong underline-offset-4">
                  {t('View model reasoning')}
                </summary>
                <div className="mt-4">
                  <JudgeReviews judges={reviews} onReply={replyToJudge} evidence={items} sourcesProvided={sourcesProvided} />
                </div>
              </details>
            </div>
          ) : (
            <p className="text-[15px] leading-[1.65] text-ink-soft">
              {assessed
                ? <HighlightedText text={current!.rationale} />
                : t(claim.unavailableReason ?? 'The system could not complete this check.')}
            </p>
          )}

          {outdatedCount > 0 && (
            <a
              href="#sources-heading"
              className="mt-4 inline-flex items-center gap-1 text-[13px] text-ink-soft underline decoration-line-strong underline-offset-4"
            >
              <CalendarX className="h-3.5 w-3.5 text-candy" aria-hidden="true" />
              {t(outdatedCount === 1 ? '{count} outdated source' : '{count} outdated sources', { count: outdatedCount })}
            </a>
          )}
        </div>
      </div>

      <EvidenceGlance revision={assessed ? current : null} sourcesReady={evidence.kind === 'ready'} items={items} judges={disagree ? null : reviews} />

      {claim.matchResult && <MatchResult match={claim.matchResult} onReply={(title) => replyToChart('matchResult', title)} />}
      {claim.priceChart && <PriceChart chart={claim.priceChart} onReply={(title) => replyToChart('priceChart', title)} />}
      {!!claim.stockHeatmapMarkets?.length && <StockHeatmap key={claim.id} marketIds={claim.stockHeatmapMarkets} />}
      {claim.locationMap && <LocationMap map={claim.locationMap} onReply={(title) => replyToChart('locationMap', title)} />}
      {claim.incidentMap && <IncidentMap map={claim.incidentMap} onReply={(title) => replyToChart('incidentMap', title)} />}
      {claim.countryMap && <CountryMap map={claim.countryMap} onReply={(title) => replyToChart('countryMap', title)} />}
      {claim.populationPyramid && <PopulationPyramid chart={claim.populationPyramid} onReply={(title) => replyToChart('populationPyramid', title)} />}
      {claim.seatChart && <SeatChart chart={claim.seatChart} onReply={(title) => replyToChart('seatChart', title)} />}
      {claim.pieChart && <PieChart chart={claim.pieChart} onReply={(title) => replyToChart('pieChart', title)} />}
      {claim.barChart && <BarChart chart={claim.barChart} onReply={(title) => replyToChart('barChart', title)} />}
      {claim.routeMap && <RouteMap route={claim.routeMap} onReply={(title) => replyToChart('routeMap', title)} />}
      {claim.electionMap && <ElectionMap map={claim.electionMap} onReply={(title) => replyToChart('electionMap', title)} />}

      {/* Evidence */}
      {assessed && config.correction.showReviewButton && (
        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={onReview}
            className="press-lift inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-page hover:opacity-90"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            {t('Review assessment')}
          </button>
        </div>
      )}

      <div id="sources-heading" className="mt-5 scroll-mt-20">
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
        ) : items.length === 0 && claim.status === 'unavailable' ? null : items.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('No evidence snapshots are attached to this claim.')}</p>
        ) : (
          <>
            <EvidenceSourceLinks items={items} freshness={freshness} onReply={replyToSource} />
            <div className="mt-5">
              <SourceDeck claim={claim} items={items} citedIds={cited} freshness={freshness} onReply={replyToSource} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
