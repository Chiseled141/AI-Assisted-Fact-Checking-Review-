import { type ClipboardEvent, type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, CircleCheck, CircleHelp, CircleX, ImagePlus, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import type {
  AssessmentRevision,
  Attachment,
  Claim,
  EvidenceRelation,
  EvidenceSnapshot,
  Freshness,
  FreshnessJudgment,
  Verdict,
} from '../../types/models';
import { config } from '../../config';
import { formatCalendarDate, verdictLabel } from '../../lib/format';
import { checkService, ValidationError, VersionConflictError } from '../../services';
import { RelationBadge, RevisionKindBadge, VerdictBadge } from '../../components/Badges';
import { Dialog } from '../../components/Dialog';
import { ScreenshotThumbs } from '../../components/ScreenshotThumbs';
import { readScreenshots } from '../../lib/images';
import { citationNumber } from './citations';

interface Props {
  open: boolean;
  claim: Claim;
  evidence: EvidenceSnapshot[] | null;
  onClose: () => void;
  onPublished: (revision: AssessmentRevision) => Promise<void> | void;
  /** Reloads the check; resolves with the claim's latest state. */
  onReloadLatest: () => Promise<Claim | null>;
  onShowHistory: () => void;
}

export function CorrectionDialog({ open, claim, ...rest }: Props) {
  return (
    <Dialog
      open={open}
      onClose={rest.onClose}
      wide
      title={`Review assessment · Claim ${claim.position}`}
      description={<span className="line-clamp-2">“{claim.text}”</span>}
    >
      {/* Remount per opening so the form starts from the version the reviewer sees now. */}
      {open && <CorrectionForm key={`${claim.id}`} claim={claim} {...rest} />}
    </Dialog>
  );
}

const verdictOptions: {
  value: Verdict;
  hint: string;
  Icon: typeof CircleCheck;
  iconClass: string;
  selectedClass: string;
  suggests?: EvidenceRelation;
}[] = [
  {
    value: 'supported',
    hint: 'Evidence backs the claim',
    Icon: CircleCheck,
    iconClass: 'text-emerald-700',
    selectedClass: 'border-emerald-700 bg-emerald-50',
    suggests: 'supporting',
  },
  {
    value: 'contradicted',
    hint: 'Evidence shows it is false',
    Icon: CircleX,
    iconClass: 'text-rose-700',
    selectedClass: 'border-rose-700 bg-rose-50',
    suggests: 'contradicting',
  },
  {
    value: 'insufficient_evidence',
    hint: 'Not enough to decide',
    Icon: CircleHelp,
    iconClass: 'text-amber-700',
    selectedClass: 'border-amber-700 bg-amber-50',
  },
];

function Step({ n, title, aside, children }: { n: number; title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-2 text-sm font-medium text-ink">
          <span className="font-mono text-xs text-candy">{String(n).padStart(2, '0')}</span>
          {title}
        </span>
        {aside}
      </div>
      {children}
    </div>
  );
}

type Phase =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'conflict'; currentVersion: number; reloading: boolean; reloaded: boolean }
  | { kind: 'success'; revision: AssessmentRevision; previousVerdict: Verdict | null };

function CorrectionForm({
  claim,
  evidence,
  onClose,
  onPublished,
  onReloadLatest,
  onShowHistory,
}: Omit<Props, 'open'>) {
  const ids = { reason: useId(), reasonError: useId(), evidenceError: useId(), verdict: useId(), shotHint: useId() };
  const current = claim.current;

  const [verdict, setVerdict] = useState<Verdict>(current?.verdict ?? 'insufficient_evidence');
  const [reason, setReason] = useState('');
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>(current?.citedEvidenceIds ?? []);
  // Starts from the current revision's judgments; a correction records its own copy.
  const [freshness, setFreshness] = useState<Record<string, FreshnessJudgment>>(() => ({
    ...(current?.citationFreshness ?? {}),
  }));
  const [expectedVersion, setExpectedVersion] = useState(claim.currentVersion);
  const [attempted, setAttempted] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' });
  const [formError, setFormError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [shotErrors, setShotErrors] = useState<string[]>([]);
  const [shotStatus, setShotStatus] = useState('');
  const [shotDragging, setShotDragging] = useState(false);
  const shotInputRef = useRef<HTMLInputElement>(null);
  const maxShots = config.correction.screenshots.maxFiles;
  const reloadButtonRef = useRef<HTMLButtonElement>(null);
  const doneButtonRef = useRef<HTMLButtonElement>(null);
  const publishButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus to the next action when the form's phase changes, so it is never lost on a disabled button.
  const focusTarget =
    phase.kind === 'success' ? doneButtonRef : phase.kind === 'conflict' ? (phase.reloaded ? publishButtonRef : reloadButtonRef) : null;
  useEffect(() => {
    focusTarget?.current?.focus();
  }, [focusTarget]);

  const reasonError =
    reason.trim().length < config.correction.minReasonLength
      ? `Explain why in at least ${config.correction.minReasonLength} characters.`
      : reason.length > config.correction.maxReasonLength
        ? `Keep the reason under ${config.correction.maxReasonLength} characters.`
        : null;
  const freshnessMissingReason = selectedEvidence.some(
    (id) => freshness[id]?.status === 'outdated' && !freshness[id]?.reason?.trim(),
  );
  const evidenceError =
    verdict !== 'insufficient_evidence' && selectedEvidence.length === 0
      ? `Select at least one snapshot that shows the claim is ${verdictLabel[verdict].toLowerCase()}.`
      : null;

  async function addScreenshots(files: File[]) {
    if (files.length === 0) return;
    const { added, errors } = await readScreenshots(files, attachments.length);
    setAttachments((prev) => [...prev, ...added]);
    setShotErrors(errors);
    setShotStatus(added.length > 0 ? `Attached ${added.map((a) => a.name).join(', ')}.` : '');
  }

  function removeScreenshot(id: string) {
    const removed = attachments.find((a) => a.id === id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setShotErrors([]);
    if (removed) setShotStatus(`Removed ${removed.name}.`);
  }

  function onPaste(event: ClipboardEvent<HTMLFormElement>) {
    const images = Array.from(event.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    event.preventDefault();
    void addScreenshots(images);
  }

  function setFreshnessFor(id: string, patch: Partial<FreshnessJudgment>) {
    setFreshness((prev) => ({ ...prev, [id]: { ...prev[id], status: prev[id]?.status ?? 'unknown', ...patch } }));
  }

  function toggleEvidence(id: string) {
    setSelectedEvidence((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setFormError(null);
    if (reasonError || evidenceError || freshnessMissingReason) return;

    setPhase({ kind: 'submitting' });
    try {
      const { revision } = await checkService.publishCorrection(claim.id, {
        verdict,
        reason,
        evidenceIds: selectedEvidence,
        attachments,
        citationFreshness: Object.fromEntries(
          selectedEvidence.map((id) => [id, freshness[id] ?? { status: 'unknown' as Freshness }]),
        ),
        expectedVersion,
      });
      setPhase({ kind: 'success', revision, previousVerdict: current?.verdict ?? null });
      await onPublished(revision);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        setPhase({ kind: 'conflict', currentVersion: err.currentVersion, reloading: false, reloaded: false });
      } else {
        setPhase({ kind: 'editing' });
        setFormError(err instanceof ValidationError ? err.message : 'The correction could not be published. Try again.');
      }
    }
  }

  async function reloadLatest() {
    if (phase.kind !== 'conflict') return;
    setPhase({ ...phase, reloading: true });
    const latest = await onReloadLatest();
    if (!latest) {
      setPhase({ ...phase, reloading: false });
      setFormError('Could not load the latest version. Try again.');
      return;
    }
    setExpectedVersion(latest.currentVersion);
    setPhase({ kind: 'conflict', currentVersion: latest.currentVersion, reloading: false, reloaded: true });
  }

  if (phase.kind === 'success') {
    return (
      <div role="status" className="text-sm">
        <div className="flex flex-col items-center px-2 py-4 text-center">
          <CircleCheck className="h-10 w-10 text-emerald-700" aria-hidden="true" />
          <p className="mt-3 text-base font-medium text-ink">Correction published as revision {phase.revision.version}.</p>
          <p className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {phase.previousVerdict && phase.previousVerdict !== phase.revision.verdict ? (
              <>
                <VerdictBadge verdict={phase.previousVerdict} />
                <ArrowRight className="h-4 w-4 text-ink-muted" aria-label="changed to" />
                <VerdictBadge verdict={phase.revision.verdict} />
              </>
            ) : (
              <>
                <VerdictBadge verdict={phase.revision.verdict} />
                <span className="text-xs text-ink-muted">Verdict unchanged</span>
              </>
            )}
          </p>
          {phase.revision.attachments?.length ? (
            <p className="mt-2 text-xs text-ink-muted">
              With {phase.revision.attachments.length} screenshot{phase.revision.attachments.length === 1 ? '' : 's'}
            </p>
          ) : null}
          <p className="mt-3 max-w-sm text-ink-soft">The original AI assessment is kept in the revision history.</p>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-line pt-4">
          <button type="button" className="btn-secondary" onClick={onShowHistory}>
            View revision history
          </button>
          <button type="button" className="btn-primary" onClick={onClose} ref={doneButtonRef}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const submitting = phase.kind === 'submitting';
  const blockedByConflict = phase.kind === 'conflict' && !phase.reloaded;
  const suggested = verdictOptions.find((o) => o.value === verdict)?.suggests;
  const verdictChanged = current ? current.verdict !== verdict : true;

  return (
    <form onSubmit={submit} onPaste={onPaste} noValidate className="text-sm">
      <div className="space-y-6">
        {current && (
          <details className="group border border-line bg-zinc-50">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="text-xs text-ink-muted">Current</span>
              <VerdictBadge verdict={current.verdict} />
              <RevisionKindBadge kind={current.kind} version={current.version} />
              <span className="ml-auto text-xs text-brand-700 group-open:hidden">Show reasoning</span>
              <span className="ml-auto hidden text-xs text-brand-700 group-open:inline">Hide reasoning</span>
            </summary>
            <p className="border-t border-line px-3 py-2.5 text-ink-soft">
              {current.rationale} <span className="text-xs text-ink-muted">— {current.author}</span>
            </p>
          </details>
        )}

        {phase.kind === 'conflict' && (
          <div
            role="alert"
            className={`border p-4 ${
              phase.reloaded ? 'border-brand-200 bg-brand-50 text-brand-900' : 'border-amber-300 bg-amber-50 text-amber-950'
            }`}
          >
            {phase.reloaded ? (
              <p>
                Latest version loaded (revision {phase.currentVersion}). Check the current assessment above, then publish
                again if your correction still applies. Your draft was kept.
              </p>
            ) : (
              <>
                <p className="flex items-center gap-2 font-medium">
                  <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                  This claim changed while you were reviewing it
                </p>
                <p className="mt-1">
                  Revision {phase.currentVersion} was published after you opened this form. Your correction was not saved,
                  and nothing was overwritten. Reload to see the latest version.
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-3 border-amber-300"
                  onClick={() => void reloadLatest()}
                  disabled={phase.reloading}
                  ref={reloadButtonRef}
                >
                  <RefreshCw className={`h-4 w-4 ${phase.reloading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {phase.reloading ? 'Reloading…' : 'Reload latest version'}
                </button>
              </>
            )}
            <p className="mt-3 text-xs opacity-80">
              Demo simulation: a concurrent edit is injected on your first publish. Real protection must come from the
              backend rejecting a stale version (409 Conflict).
            </p>
          </div>
        )}

        <fieldset>
          <legend className="sr-only">Proposed verdict</legend>
          <Step n={1} title="Your verdict">
            <div className="grid gap-2 sm:grid-cols-3">
              {verdictOptions.map(({ value, hint, Icon, iconClass, selectedClass }) => {
                const checked = verdict === value;
                return (
                  <label
                    key={value}
                    className={`relative flex cursor-pointer flex-col gap-1 border p-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-brand-500 ${
                      checked ? selectedClass : 'border-line bg-white hover:border-line-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name="verdict"
                      value={value}
                      checked={checked}
                      onChange={() => setVerdict(value)}
                      aria-labelledby={`${ids.verdict}-${value}`}
                      aria-describedby={`${ids.verdict}-${value}-hint`}
                      className="sr-only"
                    />
                    <span className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden="true" />
                      <span id={`${ids.verdict}-${value}`} className="font-medium text-ink">
                        {verdictLabel[value]}
                      </span>
                    </span>
                    <span id={`${ids.verdict}-${value}-hint`} className="text-xs text-ink-muted">
                      {hint}
                      {current?.verdict === value && ' · current'}
                    </span>
                  </label>
                );
              })}
            </div>
          </Step>
        </fieldset>

        <Step
          n={2}
          title={<label htmlFor={ids.reason}>Correction reason</label>}
          aside={
            <span className="font-mono text-xs text-ink-faint">
              {reason.trim().length} / {config.correction.maxReasonLength}
            </span>
          }
        >
          <textarea
            id={ids.reason}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
            }}
            rows={3}
            maxLength={config.correction.maxReasonLength + 100}
            className="field resize-y"
            placeholder="What does the evidence show?"
            aria-invalid={attempted && Boolean(reasonError)}
            aria-describedby={attempted && reasonError ? ids.reasonError : undefined}
            data-autofocus
          />
          {attempted && reasonError && (
            <p id={ids.reasonError} className="mt-1 text-rose-700">
              {reasonError}
            </p>
          )}
        </Step>

        <fieldset aria-describedby={attempted && evidenceError ? ids.evidenceError : undefined}>
          <legend className="sr-only">Cited evidence</legend>
          <Step
            n={3}
            title="Cited evidence"
            aside={
              evidence && (
                <span className="font-mono text-xs text-ink-faint">
                  {selectedEvidence.length} of {evidence.length} selected
                </span>
              )
            }
          >
            {evidence === null ? (
              <p className="flex items-center gap-2 text-ink-soft">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading snapshots…
              </p>
            ) : (
              <ul className="divide-y divide-line border border-line">
                {evidence.map((item) => {
                  const checked = selectedEvidence.includes(item.id);
                  return (
                    <li key={item.id}>
                      <label
                        className={`flex cursor-pointer gap-3 p-3 transition-colors ${checked ? 'bg-brand-50/60' : 'bg-white hover:bg-zinc-50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEvidence(item.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-brand-700">[{citationNumber(claim, item.id)}]</span>
                            <span className="font-medium text-ink">{item.sourceTitle}</span>
                            <RelationBadge relation={item.relation} />
                            {suggested === item.relation && !checked && (
                              <span className="text-xs text-candy">matches your verdict</span>
                            )}
                          </span>
                          <span className="mt-1 line-clamp-2 block text-xs text-ink-muted">{item.excerpt}</span>
                          <span className="mt-1 block font-mono text-[11px] text-ink-faint">
                            published {item.publishedAt ? formatCalendarDate(item.publishedAt) : 'unknown'}
                          </span>
                        </span>
                      </label>
                      {checked && (
                        <div className="flex flex-wrap items-start gap-2 border-t border-line bg-white px-3 py-2 pl-10">
                          <label className="flex items-center gap-2 text-xs text-ink-soft">
                            Freshness for this claim
                            <select
                              value={freshness[item.id]?.status ?? 'unknown'}
                              onChange={(e) => setFreshnessFor(item.id, { status: e.target.value as Freshness })}
                              className="field w-auto py-1 text-xs"
                              aria-label={`Freshness of ${item.sourceTitle}`}
                            >
                              <option value="current">Current</option>
                              <option value="outdated">Outdated</option>
                              <option value="unknown">Unknown</option>
                            </select>
                          </label>
                          {freshness[item.id]?.status && freshness[item.id].status !== 'current' && (
                            <div className="min-w-[200px] flex-1">
                              <input
                                type="text"
                                value={freshness[item.id]?.reason ?? ''}
                                onChange={(e) => setFreshnessFor(item.id, { reason: e.target.value })}
                                placeholder={
                                  freshness[item.id].status === 'outdated'
                                    ? 'Why it no longer applies (required)'
                                    : 'Why applicability is unclear (optional)'
                                }
                                aria-label={`Freshness reason for ${item.sourceTitle}`}
                                aria-invalid={
                                  attempted && freshness[item.id].status === 'outdated' && !freshness[item.id].reason?.trim()
                                }
                                className="field py-1 text-xs"
                              />
                              {attempted && freshness[item.id].status === 'outdated' && !freshness[item.id].reason?.trim() && (
                                <p className="mt-1 text-xs text-rose-700">Explain why this source is outdated.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {attempted && evidenceError && (
              <p id={ids.evidenceError} className="mt-2 text-rose-700">
                {evidenceError}
              </p>
            )}
          </Step>
        </fieldset>

        <Step
          n={4}
          title="Screenshots"
          aside={
            <span className="font-mono text-xs text-ink-faint">
              optional · {attachments.length}/{maxShots}
            </span>
          }
        >
          {attachments.length > 0 && (
            <div className="mb-3 pt-2">
              <ScreenshotThumbs items={attachments} onRemove={removeScreenshot} />
            </div>
          )}
          <div
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('Files')) return;
              e.preventDefault();
              setShotDragging(true);
            }}
            onDragLeave={() => setShotDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setShotDragging(false);
              void addScreenshots(Array.from(e.dataTransfer.files));
            }}
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 border border-dashed px-3 py-2.5 text-ink-muted ${
              shotDragging ? 'border-brand-500 bg-brand-50' : 'border-line-strong'
            }`}
          >
            <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Paste, drop, or</span>
            <input
              ref={shotInputRef}
              type="file"
              multiple
              accept={config.correction.screenshots.accept}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="screenshot-input"
              onChange={(e) => {
                void addScreenshots(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => shotInputRef.current?.click()}
              disabled={attachments.length >= maxShots}
              aria-describedby={ids.shotHint}
              className="font-medium text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-600 disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
            >
              add screenshots
            </button>
          </div>
          <p id={ids.shotHint} className="mt-1.5 text-xs text-ink-muted">
            PNG, JPG, WebP, or GIF · large images are resized · stays in your browser
          </p>
          {shotErrors.length > 0 && (
            <ul role="alert" className="mt-2 space-y-0.5 text-rose-700">
              {shotErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <p className="sr-only" role="status" aria-live="polite">
            {shotStatus}
          </p>
        </Step>

        {formError && (
          <p role="alert" className="text-rose-700">
            {formError}
          </p>
        )}
      </div>

      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-5 py-3 sm:-mx-6 sm:px-6">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
          {current && verdictChanged ? (
            <>
              <VerdictBadge verdict={current.verdict} />
              <ArrowRight className="h-3.5 w-3.5" aria-label="to" />
              <VerdictBadge verdict={verdict} />
            </>
          ) : (
            <span>Verdict unchanged · updates reason and evidence</span>
          )}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting || blockedByConflict} ref={publishButtonRef}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {submitting ? 'Publishing…' : 'Publish correction'}
          </button>
        </div>
      </div>
    </form>
  );
}
