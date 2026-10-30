import { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AssessmentRevision, Claim, EvidenceSnapshot, FreshnessJudgment } from '../../types/models';
import { formatDateTime } from '../../lib/format';
import { checkService } from '../../services';
import { FreshnessBadge, RevisionKindBadge, VerdictBadge } from '../../components/Badges';
import { Dialog } from '../../components/Dialog';
import { ScreenshotThumbs } from '../../components/ScreenshotThumbs';
import { citationNumber } from './citations';

interface Props {
  open: boolean;
  claim: Claim;
  evidence: EvidenceSnapshot[] | null;
  onClose: () => void;
}

type RevisionsState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; items: AssessmentRevision[] };

export function RevisionDrawer({ open, claim, evidence, onClose }: Props) {
  const [state, setState] = useState<RevisionsState>({ kind: 'loading' });
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const selectId = useId();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    checkService
      .getClaimRevisions(claim.id)
      .then((items) => {
        if (cancelled) return;
        setState({ kind: 'ready', items });
        setCompareVersion(items.length > 1 ? items[0].version : null);
      })
      .catch(() => !cancelled && setState({ kind: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [open, claim.id, claim.currentVersion, attempt]);

  const titleFor = (id: string) => evidence?.find((item) => item.id === id)?.sourceTitle;

  function renderCitations(ids: string[], freshness?: Record<string, FreshnessJudgment>) {
    if (ids.length === 0) return <span className="text-ink-muted">None cited</span>;
    return (
      <ul className="space-y-1">
        {ids.map((id) => (
          <li key={id}>
            <span className="font-mono text-xs text-brand-700">[{citationNumber(claim, id)}]</span>{' '}
            {titleFor(id) ?? 'Evidence snapshot'}{' '}
            <FreshnessBadge status={freshness?.[id]?.status ?? 'unknown'} />
            {freshness?.[id]?.reason && <span className="mt-0.5 block text-xs text-ink-muted">{freshness[id].reason}</span>}
          </li>
        ))}
      </ul>
    );
  }

  const freshnessKey = (r: AssessmentRevision) =>
    r.citedEvidenceIds.map((id) => `${id}:${r.citationFreshness?.[id]?.status ?? 'unknown'}`).join();

  const items = state.kind === 'ready' ? state.items : [];
  const current = items.at(-1);
  const compared = items.find((r) => r.version === compareVersion);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="drawer"
      title={`Revision history · Claim ${claim.position}`}
      description={<span className="line-clamp-2">{claim.text}</span>}
    >
      {state.kind === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-ink-soft" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading revisions…
        </p>
      )}
      {state.kind === 'error' && (
        <div role="alert" className="text-sm text-rose-700">
          Revisions could not be loaded.{' '}
          <button type="button" className="btn-secondary ml-2 px-3 py-1" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      {state.kind === 'ready' && current && (
        <div className="space-y-6 text-sm">
          {items.length > 1 && compared && (
            <section aria-labelledby={`${selectId}-heading`} className="border border-line bg-white p-4">
              <h3 id={`${selectId}-heading`} className="font-medium text-ink">
                Compare revisions
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label htmlFor={selectId} className="text-ink-soft">
                  Compare
                </label>
                <select
                  id={selectId}
                  value={compareVersion ?? ''}
                  onChange={(e) => setCompareVersion(Number(e.target.value))}
                  className="field w-auto py-1.5"
                >
                  {items.slice(0, -1).map((r) => (
                    <option key={r.version} value={r.version}>
                      Revision {r.version} ({r.kind === 'ai_assessment' ? 'AI' : 'human'})
                    </option>
                  ))}
                </select>
                <span className="text-ink-soft">with current (revision {current.version})</span>
              </div>

              <table className="mt-4 w-full table-fixed border-collapse text-left text-xs sm:text-sm">
                <caption className="sr-only">
                  Revision {compared.version} compared with current revision {current.version}
                </caption>
                <thead>
                  <tr className="text-ink-muted">
                    <th scope="col" className="w-24 pb-2 font-medium sm:w-28">
                      Field
                    </th>
                    <th scope="col" className="pb-2 pr-2 font-medium">
                      Revision {compared.version}
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      Current · rev {current.version}
                    </th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {[
                    {
                      label: 'Verdict',
                      changed: compared.verdict !== current.verdict,
                      a: <VerdictBadge verdict={compared.verdict} />,
                      b: <VerdictBadge verdict={current.verdict} />,
                    },
                    {
                      label: 'Type',
                      changed: compared.kind !== current.kind,
                      a: <RevisionKindBadge kind={compared.kind} />,
                      b: <RevisionKindBadge kind={current.kind} />,
                    },
                    {
                      label: compared.kind === current.kind && current.kind === 'ai_assessment' ? 'Explanation' : 'Rationale',
                      changed: compared.rationale !== current.rationale,
                      a: <span className="text-ink-soft">{compared.rationale}</span>,
                      b: <span className="text-ink-soft">{current.rationale}</span>,
                    },
                    {
                      label: 'Evidence',
                      changed: freshnessKey(compared) !== freshnessKey(current),
                      a: renderCitations(compared.citedEvidenceIds, compared.citationFreshness),
                      b: renderCitations(current.citedEvidenceIds, current.citationFreshness),
                    },
                    {
                      label: 'Screenshots',
                      changed: (compared.attachments?.length ?? 0) !== (current.attachments?.length ?? 0),
                      a: <span className="text-ink-soft">{compared.attachments?.length ?? 0}</span>,
                      b: <span className="text-ink-soft">{current.attachments?.length ?? 0}</span>,
                    },
                  ].map((row) => (
                    <tr key={row.label} className="border-t border-line">
                      <th scope="row" className="py-2 pr-2 font-medium text-ink">
                        {row.label}
                        {row.changed && (
                          <span className="mt-0.5 block text-[11px] font-normal text-brand-700">Changed</span>
                        )}
                      </th>
                      <td className="break-words py-2 pr-2">{row.a}</td>
                      <td className="break-words py-2">{row.b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section aria-label="All revisions, newest first">
            <ol className="space-y-3">
              {[...items].reverse().map((revision) => (
                <li key={revision.id} className="border border-line bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">Revision {revision.version}</h3>
                    {revision.version === current.version && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                        Current
                      </span>
                    )}
                    {revision.version === 1 && revision.kind === 'ai_assessment' && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-ink-soft">Original</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <VerdictBadge verdict={revision.verdict} />
                    <RevisionKindBadge kind={revision.kind} />
                  </div>
                  <dl className="mt-3 space-y-2">
                    <div>
                      <dt className="text-xs text-ink-muted">
                        {revision.kind === 'ai_assessment' ? 'Explanation' : 'Correction reason'}
                      </dt>
                      <dd className="text-ink">{revision.rationale}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">Cited evidence</dt>
                      <dd className="text-ink">
                        {renderCitations(revision.citedEvidenceIds, revision.citationFreshness)}
                      </dd>
                    </div>
                    {revision.attachments && revision.attachments.length > 0 && (
                      <div>
                        <dt className="mb-1 text-xs text-ink-muted">Screenshots</dt>
                        <dd>
                          <ScreenshotThumbs items={revision.attachments} />
                        </dd>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 text-xs text-ink-muted">
                      <div>
                        <dt className="inline">By </dt>
                        <dd className="inline">{revision.author}</dd>
                      </div>
                      {revision.model && (
                        <div>
                          <dt className="inline">Model </dt>
                          <dd className="inline font-mono">
                            {revision.model.name} · prompt {revision.model.promptVersion}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="sr-only">Published</dt>
                        <dd>
                          <time dateTime={revision.createdAt}>{formatDateTime(revision.createdAt)}</time>
                        </dd>
                      </div>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Dialog>
  );
}
