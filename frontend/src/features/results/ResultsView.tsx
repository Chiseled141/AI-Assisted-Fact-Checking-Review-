import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, PanelRightOpen } from 'lucide-react';
import type { AssessmentRevision, CheckDetail, Claim } from '../../types/models';
import { checkService } from '../../services';
import { verdictLabel } from '../../lib/format';
import { CheckSummary } from './CheckSummary';
import { ClaimCard } from './ClaimCard';
import { EvidencePanel, type EvidenceState } from './EvidencePanel';
import { CorrectionDialog } from './CorrectionDialog';
import { RevisionDrawer } from './RevisionDrawer';

interface Props {
  check: CheckDetail;
  /** Re-fetches the check; resolves with the fresh detail or null on failure. */
  onReload: () => Promise<CheckDetail | null>;
}

/** Quiet way back to the list a check was opened from. */
function BackToHistory() {
  return (
    <Link
      to="/history"
      className="group mb-8 inline-flex items-center gap-1.5 rounded-md font-sans text-xs text-ink-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
      Back to history
    </Link>
  );
}

export function ResultsView({ check, onReload }: Props) {
  // The selected claim lives in the URL (?claim=2) so a view can be shared or bookmarked.
  const [params, setParams] = useSearchParams();
  const fromUrl = check.claims.find((claim) => String(claim.position) === params.get('claim'));
  const [selectedId, setSelectedIdState] = useState<string | null>(fromUrl?.id ?? check.claims[0]?.id ?? null);

  function setSelectedId(id: string) {
    setSelectedIdState(id);
    const claim = check.claims.find((c) => c.id === id);
    if (!claim || params.get('claim') === String(claim.position)) return;
    const next = new URLSearchParams(params);
    next.set('claim', String(claim.position));
    setParams(next, { replace: true });
  }
  const [evidenceByClaim, setEvidenceByClaim] = useState<Record<string, EvidenceState>>({});
  const [active, setActive] = useState<{ evidenceId: string | null; request: number }>({ evidenceId: null, request: 0 });
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [dialog, setDialog] = useState<'review' | 'history' | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const selected = check.claims.find((claim) => claim.id === selectedId) ?? check.claims[0] ?? null;
  const selectedEvidence = selected ? evidenceByClaim[selected.id] : undefined;

  const loadEvidence = useCallback(async (claimId: string) => {
    setEvidenceByClaim((prev) => ({ ...prev, [claimId]: { kind: 'loading' } }));
    try {
      const items = await checkService.getClaimEvidence(claimId);
      setEvidenceByClaim((prev) => ({ ...prev, [claimId]: { kind: 'ready', items } }));
    } catch {
      setEvidenceByClaim((prev) => ({
        ...prev,
        [claimId]: { kind: 'error', message: 'Evidence could not be loaded.' },
      }));
    }
  }, []);

  useEffect(() => {
    if (selected && !evidenceByClaim[selected.id]) void loadEvidence(selected.id);
  }, [selected, evidenceByClaim, loadEvidence]);

  function selectClaim(claim: Claim) {
    setSelectedId(claim.id);
    setActive((prev) => ({ evidenceId: null, request: prev.request }));
    setEvidenceOpen(true);
  }

  function showCitation(claim: Claim, evidenceId: string) {
    setSelectedId(claim.id);
    setActive((prev) => ({ evidenceId, request: prev.request + 1 }));
    setEvidenceOpen(true);
  }

  function openEvidence() {
    setEvidenceOpen(true);
  }

  function closeEvidence() {
    setEvidenceOpen(false);
  }

  function openDialog(claim: Claim, which: 'review' | 'history') {
    selectClaim(claim);
    setDialog(which);
  }

  async function handlePublished(revision: AssessmentRevision) {
    await onReload();
    setAnnouncement(
      `Correction published as revision ${revision.version}. Claim ${selected?.position} is now ${verdictLabel[revision.verdict]}.`,
    );
  }

  async function reloadLatest(): Promise<Claim | null> {
    const detail = await onReload();
    return detail?.claims.find((claim) => claim.id === selected?.id) ?? null;
  }

  if (check.claims.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[820px] px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <BackToHistory />
        <CheckSummary check={check} />
        <div className="mt-10 border-y border-line py-16 text-center">
          <h2 className="text-[20px] leading-[1.3] tracking-[-0.015em] text-ink">No claims found</h2>
          <p className="mt-2 text-sm text-ink-muted">No checkable factual claims were extracted from this input.</p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-ink py-2 pl-4 pr-3.5 text-sm font-medium text-page transition-opacity hover:opacity-90"
          >
            Start a new check
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  const evidenceItems = selectedEvidence?.kind === 'ready' ? selectedEvidence.items : null;

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <BackToHistory />
      <CheckSummary check={check} />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <section aria-labelledby="claims-heading" className="mt-10">
        <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2.5">
          <h2
            id="claims-heading"
            className="font-sans text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-muted"
          >
            Claims <span className="ml-1 font-normal tabular-nums text-ink-faint">{check.claims.length}</span>
          </h2>
          {!evidenceOpen && selected && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
              onClick={openEvidence}
            >
              <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Show evidence · claim {selected.position}
            </button>
          )}
        </div>

        <ul className="divide-y divide-line border-b border-line">
          {check.claims.map((claim) => (
            <li key={claim.id}>
              <ClaimCard
                claim={claim}
                selected={claim.id === selected?.id}
                expanded={claim.id === selected?.id && evidenceOpen}
                onSelect={() => selectClaim(claim)}
              />
              {claim.id === selected?.id && evidenceOpen && (
                <div className="border-t border-line pb-8 sm:pl-10">
                  <EvidencePanel
                    claim={claim}
                    evidence={selectedEvidence ?? { kind: 'loading' }}
                    activeEvidenceId={active.evidenceId}
                    focusRequest={active.request}
                    onRetry={() => void loadEvidence(claim.id)}
                    onCite={(evidenceId) => showCitation(claim, evidenceId)}
                    onReview={() => openDialog(claim, 'review')}
                    onShowHistory={() => openDialog(claim, 'history')}
                    onClose={closeEvidence}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <>
          <CorrectionDialog
            open={dialog === 'review'}
            claim={selected}
            evidence={evidenceItems}
            onClose={() => setDialog(null)}
            onPublished={handlePublished}
            onReloadLatest={reloadLatest}
            onShowHistory={() => setDialog('history')}
          />
          <RevisionDrawer
            open={dialog === 'history'}
            claim={selected}
            evidence={evidenceItems}
            onClose={() => setDialog(null)}
          />
        </>
      )}
    </div>
  );
}
