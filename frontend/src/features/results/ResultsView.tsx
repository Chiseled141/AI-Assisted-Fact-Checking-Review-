import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileSearch, ListChecks, PanelRightOpen } from 'lucide-react';
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

type Pane = 'claims' | 'evidence';

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
  const [pane, setPane] = useState<Pane>('claims');
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
    // On narrow screens the detail replaces the list, so jump to it.
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(min-width: 1024px)').matches) {
      setPane('evidence');
    }
  }

  function showCitation(claim: Claim, evidenceId: string) {
    setSelectedId(claim.id);
    setActive((prev) => ({ evidenceId, request: prev.request + 1 }));
    setEvidenceOpen(true);
    setPane('evidence');
  }

  function openEvidence() {
    setEvidenceOpen(true);
    setPane('evidence');
  }

  function closeEvidence() {
    setEvidenceOpen(false);
    setPane('claims');
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
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-4 sm:px-6">
        <CheckSummary check={check} />
        <div className="panel p-8 text-center">
          <h2 className="font-semibold tracking-tight text-xl text-ink">No claims found</h2>
          <p className="mt-2 text-ink-soft">No checkable factual claims were extracted from this input.</p>
          <Link to="/" className="btn-primary mt-5">
            Start a new check
          </Link>
        </div>
      </div>
    );
  }

  const evidenceItems = selectedEvidence?.kind === 'ready' ? selectedEvidence.items : null;
  const paneButton = (value: Pane) =>
    `relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap py-3 text-sm transition-colors after:absolute after:inset-x-6 after:-bottom-px after:h-0.5 ${
      pane === value ? 'font-medium text-ink after:bg-ink' : 'text-ink-muted hover:text-ink'
    }`;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-8 sm:pt-14">
      <CheckSummary check={check} />
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div
        className="sticky top-[62px] z-20 mt-8 flex border-b border-line bg-page lg:hidden"
        role="group"
        aria-label="Switch between claims and evidence"
      >
        <button type="button" className={paneButton('claims')} aria-pressed={pane === 'claims'} onClick={() => setPane('claims')}>
          <ListChecks className="h-4 w-4 max-[380px]:hidden" aria-hidden="true" />
          Claims ({check.claims.length})
        </button>
        <button
          type="button"
          className={paneButton('evidence')}
          aria-pressed={pane === 'evidence'}
          onClick={openEvidence}
        >
          <FileSearch className="h-4 w-4 max-[380px]:hidden" aria-hidden="true" />
          Claim {selected?.position}
        </button>
      </div>

      <div className={`mt-6 grid gap-10 lg:mt-12 ${evidenceOpen ? 'lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-0' : ''}`}>
        <section aria-labelledby="claims-heading" className={`min-w-0 ${pane === 'claims' ? '' : 'hidden lg:block'}`}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="claims-heading" className="text-sm font-medium text-ink">
              Claims
            </h2>
            {!evidenceOpen && selected && (
              <button type="button" className="btn-ghost hidden px-3 py-1.5 text-xs lg:inline-flex" onClick={openEvidence}>
                <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
                Show evidence · claim {selected.position}
              </button>
            )}
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {check.claims.map((claim) => (
              <li key={claim.id}>
                <ClaimCard claim={claim} selected={claim.id === selected?.id} onSelect={() => selectClaim(claim)} />
              </li>
            ))}
          </ul>
        </section>

        {evidenceOpen && (
          <div className={`min-w-0 lg:ml-10 lg:border-l lg:border-line lg:pl-10 ${pane === 'evidence' ? '' : 'hidden lg:block'}`}>
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-3">
              {selected && (
                <EvidencePanel
                  claim={selected}
                  evidence={selectedEvidence ?? { kind: 'loading' }}
                  activeEvidenceId={active.evidenceId}
                  focusRequest={active.request}
                  onRetry={() => void loadEvidence(selected.id)}
                  onCite={(evidenceId) => showCitation(selected, evidenceId)}
                  onReview={() => openDialog(selected, 'review')}
                  onShowHistory={() => openDialog(selected, 'history')}
                  onClose={closeEvidence}
                />
              )}
            </div>
          </div>
        )}
      </div>

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
