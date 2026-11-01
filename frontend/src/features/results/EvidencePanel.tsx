import { useEffect, useState } from 'react';
import { CalendarDays, CalendarX, ChevronDown, CloudOff, ExternalLink, History, ImageIcon, Loader2, PencilLine, X } from 'lucide-react';
import type { Claim, EvidenceSnapshot, PageCapture } from '../../types/models';
import { formatCalendarDate, formatExactDateTime, safeHref, safeImageSrc } from '../../lib/format';
import {
  FreshnessText,
  RelationText,
  RevisionKindBadge,
  UnavailableMark,
  VerdictMark,
} from '../../components/Badges';
import { citationNumber, evidenceElementId } from './citations';
import { FactCheckNote, JudgeComparison } from './JudgeComparison';
import { ProportionBar } from './ProportionBar';

export type EvidenceState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: EvidenceSnapshot[] };

interface Props {
  claim: Claim;
  evidence: EvidenceState;
  activeEvidenceId: string | null;
  /** Changes on every citation click so repeated clicks re-scroll. */
  focusRequest: number;
  onRetry: () => void;
  onCite: (evidenceId: string) => void;
  onReview: () => void;
  onShowHistory: () => void;
  /** Hides the panel; the claims list then uses the full width. */
  onClose?: () => void;
}

function CaptureView({ capture, title }: { capture: PageCapture; title: string }) {
  const [open, setOpen] = useState(false);
  const src = safeImageSrc(capture.url);
  if (!src) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${open ? 'Hide' : 'Show'} page capture of ${title}`}
        className="inline-flex min-h-6 items-center gap-1 text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
      >
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        {open ? 'Hide page capture' : 'Page capture'}
      </button>
      {open && (
        <img
          src={src}
          alt={`Page capture of ${title}`}
          width={capture.width}
          height={capture.height}
          className="rise-in mt-2 w-full border border-line"
        />
      )}
    </div>
  );
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Detail for the selected claim: verdict, reasoning, actions, and the evidence behind it. */
export function EvidencePanel({
  claim,
  evidence,
  activeEvidenceId,
  focusRequest,
  onRetry,
  onCite,
  onReview,
  onShowHistory,
  onClose,
}: Props) {
  const current = claim.current;
  const assessed = Boolean(current && claim.status === 'assessed');
  const cited = new Set(current?.citedEvidenceIds ?? []);
  const freshness = current?.citationFreshness ?? {};
  const outdatedCount = [...cited].filter((id) => freshness[id]?.status === 'outdated').length;
  const items = evidence.kind === 'ready' ? evidence.items : [];
  const balance = {
    supporting: items.filter((i) => i.relation === 'supporting').length,
    contradicting: items.filter((i) => i.relation === 'contradicting').length,
    contextual: items.filter((i) => i.relation === 'contextual').length,
  };

  useEffect(() => {
    if (!activeEvidenceId || evidence.kind !== 'ready') return;
    const el = document.getElementById(evidenceElementId(activeEvidenceId));
    if (!el) return;
    el.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  }, [activeEvidenceId, focusRequest, evidence.kind]);

  return (
    <section aria-labelledby="evidence-heading" className="text-sm">
      <h2 id="evidence-heading" className="sr-only">
        {claim.text}
      </h2>

      {/* Verdict and actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {assessed ? <VerdictMark verdict={current!.verdict} /> : <UnavailableMark />}
          {assessed && <RevisionKindBadge kind={current!.kind} version={current!.version} />}
        </span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {assessed && (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-1 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
                onClick={onShowHistory}
                aria-label={`Revisions (${claim.currentVersion})`}
                title="Revision history"
              >
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="tabular-nums">Rev {claim.currentVersion}</span>
              </button>
              <button type="button" className="btn-fire" onClick={onReview}>
                <PencilLine className="h-4 w-4" aria-hidden="true" />
                Review assessment
              </button>
            </>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close evidence panel"
              title="Close evidence panel"
              className="-mr-1 p-1.5 text-ink-faint transition-colors hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Reasoning */}
      <p className="mt-4 max-w-prose text-[15px] leading-[1.75] text-ink-soft">
        {assessed
          ? current!.rationale
          : `${claim.unavailableReason ?? 'Verification was unavailable.'} This is not an evidence-based verdict.`}
      </p>

      {assessed && current!.judges && <JudgeComparison judges={current!.judges} />}
      {claim.factCheck && <FactCheckNote factCheck={claim.factCheck} />}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-sans text-xs text-ink-muted">
        {claim.timeContext && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {claim.timeContext}
          </span>
        )}
        {outdatedCount > 0 && (
          <span className="inline-flex items-center gap-1 text-ink-soft">
            <CalendarX className="h-3.5 w-3.5 text-candy" aria-hidden="true" />
            {outdatedCount} outdated source{outdatedCount === 1 ? '' : 's'}
          </span>
        )}
        {assessed && current!.citedEvidenceIds.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-1.5" aria-label="Citations">
            <span>Cites</span>
            {current!.citedEvidenceIds.map((evidenceId) => {
              const n = citationNumber(claim, evidenceId);
              return (
                <button
                  key={evidenceId}
                  type="button"
                  onClick={() => onCite(evidenceId)}
                  aria-label={`Citation ${n}: show evidence passage ${n}`}
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-sans text-[11px] font-semibold tabular-nums text-brand-700 underline decoration-brand-200 underline-offset-2 transition-colors hover:bg-brand-50"
                >
                  {n}
                </button>
              );
            })}
          </span>
        )}
      </div>

      {/* Evidence */}
      <div className="mt-6 border-t border-line pt-5">
        {claim.status === 'unavailable' ? (
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            No evidence was retrieved, so there is no verdict — true or false.
          </p>
        ) : evidence.kind === 'loading' ? (
          <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading evidence…
          </p>
        ) : evidence.kind === 'error' ? (
          <p role="alert" className="text-sm text-rose-700">
            {evidence.message}{' '}
            <button type="button" className="underline underline-offset-4" onClick={onRetry}>
              Try again
            </button>
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-muted">No evidence snapshots are attached to this claim.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Evidence</h3>
              <span className="font-sans text-xs text-ink-faint">
                {items.length} source{items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-3">
              <ProportionBar
                size="sm"
                summary={`${balance.supporting} supporting, ${balance.contradicting} contradicting, ${balance.contextual} context.`}
                segments={[
                  { key: 'supporting', label: 'supporting', value: balance.supporting, color: 'bg-brand-500' },
                  { key: 'contradicting', label: 'contradicting', value: balance.contradicting, color: 'bg-rose-400' },
                  { key: 'contextual', label: 'context', value: balance.contextual, color: 'bg-ink-faint' },
                ]}
              />
            </div>

            <ol
              className="mt-4 divide-y divide-line border-t border-line"
              aria-label={`Evidence snapshots for claim ${claim.position}`}
            >
              {items.map((item) => {
                const n = citationNumber(claim, item.id);
                const href = safeHref(item.url);
                const active = item.id === activeEvidenceId;
                const judgment = cited.has(item.id) ? freshness[item.id] : undefined;
                return (
                  <li
                    key={item.id}
                    id={evidenceElementId(item.id)}
                    tabIndex={-1}
                    aria-current={active ? 'true' : undefined}
                    className="scroll-mt-28 py-4 focus:outline-none"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`shrink-0 pt-px font-sans text-[11px] font-semibold tabular-nums ${
                          active ? 'text-brand-700' : 'text-ink-faint'
                        }`}
                        aria-hidden="true"
                      >
                        [{n}]
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <h4
                            className={`text-[15px] font-medium leading-[1.5] ${
                              active ? 'text-brand-700' : 'text-ink'
                            }`}
                          >
                            {item.sourceTitle}
                          </h4>
                          <span className="flex items-center gap-2 font-sans text-xs">
                            <RelationText relation={item.relation} />
                            {judgment?.status === 'outdated' && <FreshnessText status="outdated" />}
                          </span>
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 font-sans text-xs text-ink-muted">
                          {item.publisher && <span>{item.publisher}</span>}
                          {item.publisher && <span aria-hidden="true">·</span>}
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              title={item.url}
                              className="inline-flex items-center gap-0.5 hover:text-ink hover:underline hover:underline-offset-2"
                            >
                              {new URL(href).hostname}
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              <span className="sr-only">(opens {item.url} in a new tab)</span>
                            </a>
                          ) : (
                            <span className="break-all">{item.url}</span>
                          )}
                        </p>

                        <blockquote
                          className={`mt-2.5 border-l-2 pl-3 text-[15px] leading-[1.7] text-ink-soft ${
                            active ? 'border-brand-300' : 'border-line'
                          }`}
                        >
                          <span className="sr-only">Saved excerpt: </span>“{item.excerpt}”
                        </blockquote>

                        {judgment?.reason && judgment.status === 'outdated' && (
                          <p className="mt-2 font-sans text-xs text-ink-soft">
                            <span className="font-semibold text-candy">Why outdated: </span>
                            {judgment.reason}
                          </p>
                        )}

                        <details className="group mt-2">
                          <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 py-1 font-sans text-xs text-ink-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
                            Details
                            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                          </summary>
                          <div className="rise-in mt-2 space-y-2 border-l-2 border-line pl-3">
                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-sans text-xs">
                              <dt className="text-ink-faint">Published</dt>
                              <dd className="text-ink-soft">
                                {item.publishedAt ? (
                                  <time dateTime={item.publishedAt}>{formatCalendarDate(item.publishedAt)}</time>
                                ) : (
                                  'Unknown'
                                )}
                              </dd>
                              {item.updatedAt && (
                                <>
                                  <dt className="text-ink-faint">Updated</dt>
                                  <dd className="text-ink-soft">
                                    <time dateTime={item.updatedAt}>{formatCalendarDate(item.updatedAt)}</time>
                                  </dd>
                                </>
                              )}
                              <dt className="text-ink-faint">Retrieved</dt>
                              <dd className="text-ink-soft">
                                <time dateTime={item.retrievedAt} title={item.retrievedAt}>
                                  {formatExactDateTime(item.retrievedAt)}
                                </time>
                              </dd>
                              {cited.has(item.id) && judgment?.status !== 'outdated' && (
                                <>
                                  <dt className="text-ink-faint">Freshness</dt>
                                  <dd>
                                    <FreshnessText status={judgment?.status ?? 'unknown'} />
                                    {judgment?.reason && (
                                      <span className="block text-ink-muted">{judgment.reason}</span>
                                    )}
                                  </dd>
                                </>
                              )}
                            </dl>
                            {item.capture && <CaptureView capture={item.capture} title={item.sourceTitle} />}
                          </div>
                        </details>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
