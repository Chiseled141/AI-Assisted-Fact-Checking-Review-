import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { AssessmentRevision, CheckDetail, Claim } from '../../types/models';
import { checkService } from '../../services';
import { verdictLabel } from '../../lib/format';
import { ClaimCard } from './ClaimCard';
import { InputSource } from './InputSource';
import { EvidencePanel, type EvidenceState } from './EvidencePanel';
import { CorrectionDialog } from './CorrectionDialog';
import { RevisionDrawer } from './RevisionDrawer';
import { t } from '../../lib/i18n';

interface Props {
  check: CheckDetail;
  /** Re-fetches the check; resolves with the fresh detail or null on failure. */
  onReload: () => Promise<CheckDetail | null>;
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
  const [dialog, setDialog] = useState<'review' | 'history' | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const claimsRef = useRef<HTMLElement>(null);

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
        [claimId]: { kind: 'error', message: t('Evidence could not be loaded.') },
      }));
    }
  }, []);

  useEffect(() => {
    if (selected && !evidenceByClaim[selected.id]) void loadEvidence(selected.id);
  }, [selected, evidenceByClaim, loadEvidence]);

  function selectClaim(claim: Claim) {
    setSelectedId(claim.id);
    // After scrolling down to the sources, bring the newly selected claim back into view.
    if (claimsRef.current && claimsRef.current.getBoundingClientRect().top < 0) {
      claimsRef.current.scrollIntoView?.({ block: 'start' });
    }
  }

  function openDialog(claim: Claim, which: 'review' | 'history') {
    selectClaim(claim);
    setDialog(which);
  }

  async function handlePublished(revision: AssessmentRevision) {
    await onReload();
    setAnnouncement(
      t('Correction published as revision {version}. Claim {position} is now {verdict}.', {
        version: revision.version,
        position: selected?.position ?? '',
        verdict: verdictLabel[revision.verdict],
      }),
    );
  }

  async function reloadLatest(): Promise<Claim | null> {
    const detail = await onReload();
    return detail?.claims.find((claim) => claim.id === selected?.id) ?? null;
  }

  if (check.claims.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
        <div className="rounded-2xl border border-line bg-white px-6 py-16 text-center">
          <h1 className="text-[20px] leading-[1.3] tracking-[-0.015em] text-ink">{t('No claims found')}</h1>
          <p className="mt-2 text-sm text-ink-muted">{t('No checkable factual claims were extracted from this input.')}</p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-ink py-2 pl-4 pr-3.5 text-sm font-medium text-page transition-opacity hover:opacity-90"
          >
            {t('Start a new check')}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  const evidenceItems = selectedEvidence?.kind === 'ready' ? selectedEvidence.items : null;

  const selectedIndex = selected ? check.claims.indexOf(selected) : -1;
  const previousClaim = check.claims[selectedIndex - 1];
  const nextClaim = check.claims[selectedIndex + 1];

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <InputSource check={check} />

      <section ref={claimsRef} aria-labelledby="claims-heading" className="scroll-mt-20">
        <h2 id="claims-heading" className="sr-only">
          {t('Claims')}
        </h2>
        <ul className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-7 sm:border-b sm:border-line">
          {check.claims.map((claim, index) => (
            <li
              key={claim.id}
              className="press-rise border-b border-line sm:border-b-0"
              style={{ '--press-delay': `${index * 70}ms` } as CSSProperties}
            >
              <ClaimCard claim={claim} selected={claim.id === selected?.id} onSelect={() => selectClaim(claim)} />
            </li>
          ))}
        </ul>

        {selected && (
          <div key={selected.id} className="press-rise mt-10">
            <EvidencePanel
              claim={selected}
              claimCount={check.claims.length}
              evidence={selectedEvidence ?? { kind: 'loading' }}
              onRetry={() => void loadEvidence(selected.id)}
              onReview={() => openDialog(selected, 'review')}
            />
          </div>
        )}

        {(previousClaim || nextClaim) && (
          <nav aria-label={t('Move between claims')} className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
            {previousClaim ? (
              <button
                type="button"
                onClick={() => selectClaim(previousClaim)}
                className="press-lift relative inline-flex after:absolute after:inset-x-0 after:-inset-y-0.5 h-10 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm font-medium text-ink-soft hover:border-line-strong hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {t('Previous claim')}
              </button>
            ) : (
              <span />
            )}
            {nextClaim && (
              <button
                type="button"
                onClick={() => selectClaim(nextClaim)}
                className="press-lift relative inline-flex after:absolute after:inset-x-0 after:-inset-y-0.5 h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-page hover:opacity-90"
              >
                {t('Next claim')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </nav>
        )}
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
