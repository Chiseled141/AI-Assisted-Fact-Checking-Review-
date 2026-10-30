import { useEffect, useState } from 'react';
import { CalendarDays, CalendarX, ChevronDown, CloudOff, ExternalLink, History, ImageIcon, Loader2, PencilLine, X } from 'lucide-react';
import type { Claim, EvidenceSnapshot, PageCapture } from '../../types/models';
import { formatCalendarDate, formatExactDateTime, safeHref, safeImageSrc, verdictLabel } from '../../lib/format';
import { FreshnessText, RelationText, VerdictIcon } from '../../components/Badges';
import { citationNumber, evidenceElementId } from './citations';
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

const verdictTone = {
  supported: 'text-emerald-700',
  contradicted: 'text-rose-700',
  insufficient_evidence: 'text-amber-700',
} as const;

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
        className="inline-flex min-h-6 items-center gap-1 text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
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
    <section aria-labelledby="evidence-heading">
      {/* Verdict and actions */}
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <VerdictIcon verdict={assessed ? current!.verdict : null} className="h-6 w-6" />
          <span aria-hidden="true" className={`text-lg font-semibold ${assessed ? verdictTone[current!.verdict] : 'text-ink-muted'}`}>
            {assessed ? verdictLabel[current!.verdict] : 'Verification unavailable'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {assessed && (
            <>
              <button
                type="button"
                className="btn-ghost px-2.5 py-1.5 text-xs"
                onClick={onShowHistory}
                aria-label={`Revisions (${claim.currentVersion})`}
                title="Revision history"
              >
                <History className="h-4 w-4" aria-hidden="true" />
                {claim.currentVersion}
              </button>
              <button type="button" className="btn-fire mb-[3px]" onClick={onReview}>
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
              className="btn-ghost -mr-2 p-1.5"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Claim and reasoning */}
      <h2 id="evidence-heading" className="mt-4 text-balance text-xl font-medium leading-snug text-ink">
        {claim.text}
      </h2>
      <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-soft">
        {assessed
          ? current!.rationale
          : `${claim.unavailableReason ?? 'Verification was unavailable.'} This is not an evidence-based verdict.`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        {assessed && (
          <span>
            {current!.kind === 'human_correction' ? 'Human correction' : 'AI assessment'} · rev {current!.version}
          </span>
        )}
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
          <span className="inline-flex items-center gap-0.5" aria-label="Citations">
            Cites
            {current!.citedEvidenceIds.map((evidenceId) => {
              const n = citationNumber(claim, evidenceId);
              return (
                <button
                  key={evidenceId}
                  type="button"
                  onClick={() => onCite(evidenceId)}
                  aria-label={`Citation ${n}: show evidence passage ${n}`}
                  className="inline-flex min-h-6 min-w-6 items-center justify-center rounded font-mono text-brand-700 hover:bg-brand-50"
                >
                  [{n}]
                </button>
              );
            })}
          </span>
        )}
      </div>

      {/* Evidence */}
      <div className="mt-8 border-t border-line pt-6">
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
              <h3 className="text-sm font-medium text-ink">Evidence</h3>
              <span className="text-xs text-ink-muted">
                {items.length} source{items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-3">
              <ProportionBar
                size="sm"
                summary={`${balance.supporting} supporting, ${balance.contradicting} contradicting, ${balance.contextual} context.`}
                segments={[
                  { key: 'supporting', label: 'supporting', value: balance.supporting, color: 'bg-emerald-700' },
                  { key: 'contradicting', label: 'contradicting', value: balance.contradicting, color: 'bg-rose-700' },
                  { key: 'contextual', label: 'context', value: balance.contextual, color: 'bg-ink-faint' },
                ]}
              />
            </div>

            <ol className="mt-4 divide-y divide-line" aria-label={`Evidence snapshots for claim ${claim.position}`}>
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
                    className={`-mx-3 scroll-mt-28 px-3 py-5 transition-colors focus:outline-none ${active ? 'bg-brand-50/50' : ''}`}
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-brand-700">[{n}]</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <h4 className="text-sm font-medium text-ink">{item.sourceTitle}</h4>
                          <span className="flex items-center gap-2 text-xs">
                            <RelationText relation={item.relation} />
                            {judgment?.status === 'outdated' && <FreshnessText status="outdated" />}
                          </span>
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
                          {item.publisher && <span>{item.publisher}</span>}
                          {item.publisher && <span aria-hidden="true">·</span>}
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              title={item.url}
                              className="inline-flex items-center gap-0.5 hover:text-ink"
                            >
                              {new URL(href).hostname}
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              <span className="sr-only">(opens {item.url} in a new tab)</span>
                            </a>
                          ) : (
                            <span className="break-all">{item.url}</span>
                          )}
                        </p>

                        <blockquote className="mt-3 text-[15px] leading-relaxed text-ink">
                          <span className="sr-only">Saved excerpt: </span>“{item.excerpt}”
                        </blockquote>

                        {judgment?.reason && judgment.status === 'outdated' && (
                          <p className="mt-2 text-xs text-ink-soft">
                            <span className="font-medium text-candy">Why outdated: </span>
                            {judgment.reason}
                          </p>
                        )}

                        <details className="group mt-3 text-xs">
                          <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                            Details
                            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                          </summary>
                          <div className="rise-in mt-2 space-y-2 border-l-2 border-line pl-3">
                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
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
                              <dd className="font-mono text-ink-soft">
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

      <p className="mt-4 text-xs text-ink-faint">Excerpts and captures are saved snapshots, not live pages. Demo sources are fictional.</p>
    </section>
  );
}
