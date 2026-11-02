import { type ClipboardEvent, type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ArrowUp, CalendarX, CircleCheck, CircleHelp, CircleX, ImagePlus, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import type {
  AssessmentRevision,
  Attachment,
  Claim,
  EvidenceSnapshot,
  Freshness,
  Verdict,
} from '../../types/models';
import { config } from '../../config';
import { verdictLabel } from '../../lib/format';
import { checkService, ValidationError, VersionConflictError, demoMode } from '../../services';
import { RevisionKindBadge, VerdictBadge } from '../../components/Badges';
import { Dialog } from '../../components/Dialog';
import { ScreenshotThumbs } from '../../components/ScreenshotThumbs';
import { readScreenshots } from '../../lib/images';
import { t } from '../../lib/i18n';

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
      title={t('Review assessment · Claim {position}', { position: claim.position })}
      description={<span className="line-clamp-3">“{claim.text}”</span>}
    >
      {/* Remount per opening so the form starts from the version the reviewer sees now. */}
      {open && <CorrectionForm key={`${claim.id}`} claim={claim} {...rest} />}
    </Dialog>
  );
}

const verdictOptions: {
  value: Verdict;
  Icon: typeof CircleCheck;
  idleClass: string;
  selectedClass: string;
  composerClass: string;
}[] = [
  {
    value: 'supported',
    Icon: CircleCheck,
    idleClass: 'bg-emerald-50 text-emerald-800 hover:border-emerald-200',
    selectedClass: 'border-emerald-700 bg-emerald-700 text-page',
    composerClass: '!border-emerald-200 !bg-emerald-50/50 focus-within:!border-emerald-700/40',
  },
  {
    value: 'contradicted',
    Icon: CircleX,
    idleClass: 'bg-rose-50 text-rose-800 hover:border-rose-200',
    selectedClass: 'border-rose-600 bg-rose-600 text-page',
    composerClass: '!border-rose-200 !bg-rose-50/50 focus-within:!border-rose-600/40',
  },
  {
    value: 'insufficient_evidence',
    Icon: CircleHelp,
    idleClass: 'bg-amber-50 text-amber-900 hover:border-amber-200',
    selectedClass: 'border-amber-700 bg-amber-700 text-page',
    composerClass: '!border-amber-200 !bg-amber-50/50 focus-within:!border-amber-700/40',
  },
  {
    value: 'outdated',
    Icon: CalendarX,
    idleClass: 'bg-slate-100 text-slate-700 hover:border-slate-300',
    selectedClass: 'border-slate-600 bg-slate-600 text-page',
    composerClass: '!border-slate-300 !bg-slate-100/50 focus-within:!border-slate-600/40',
  },
];

/**
 * A correction that changes the verdict cites the sources that fit the new one. Otherwise, or when
 * none fit, it keeps what the current revision cited.
 */
function citationsFor(verdict: Verdict, current: Claim['current'], evidence: EvidenceSnapshot[] | null): string[] {
  const kept = current?.citedEvidenceIds ?? [];
  const relation = verdict === 'supported' ? 'supporting' : verdict === 'contradicted' ? 'contradicting' : null;
  if (!relation || current?.verdict === verdict) return kept;
  const fitting = (evidence ?? []).filter((item) => item.relation === relation).map((item) => item.id);
  return fitting.length > 0 ? fitting : kept;
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
  const ids = { reason: useId(), reasonError: useId(), shotHint: useId() };
  const current = claim.current;

  const [verdict, setVerdict] = useState<Verdict>(current?.verdict ?? 'insufficient_evidence');
  const [reason, setReason] = useState('');
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
      ? t('Explain why in at least {count} characters.', { count: config.correction.minReasonLength })
      : reason.length > config.correction.maxReasonLength
        ? t('Keep the reason under {count} characters.', { count: config.correction.maxReasonLength })
        : null;
  async function addScreenshots(files: File[]) {
    if (files.length === 0) return;
    const { added, errors } = await readScreenshots(files, attachments.length);
    setAttachments((prev) => [...prev, ...added]);
    setShotErrors(errors);
    setShotStatus(added.length > 0 ? t('Attached {names}.', { names: added.map((a) => a.name).join(', ') }) : '');
  }

  function removeScreenshot(id: string) {
    const removed = attachments.find((a) => a.id === id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setShotErrors([]);
    if (removed) setShotStatus(t('Removed {name}.', { name: removed.name }));
  }

  function onPaste(event: ClipboardEvent<HTMLFormElement>) {
    const images = Array.from(event.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    event.preventDefault();
    void addScreenshots(images);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setFormError(null);
    if (reasonError) return;

    setPhase({ kind: 'submitting' });
    const cited = citationsFor(verdict, current, evidence);
    try {
      const { revision } = await checkService.publishCorrection(claim.id, {
        verdict,
        reason,
        evidenceIds: cited,
        attachments,
        citationFreshness: Object.fromEntries(
          cited.map((id) => [
            id,
            // Calling the claim outdated means its sources no longer apply, for the reason given.
            verdict === 'outdated'
              ? { status: 'outdated' as Freshness, reason }
              : (current?.citationFreshness?.[id] ?? { status: 'unknown' as Freshness }),
          ]),
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
        setFormError(err instanceof ValidationError ? err.message : t('The correction could not be published. Try again.'));
      }
    }
  }

  async function reloadLatest() {
    if (phase.kind !== 'conflict') return;
    setPhase({ ...phase, reloading: true });
    const latest = await onReloadLatest();
    if (!latest) {
      setPhase({ ...phase, reloading: false });
      setFormError(t('Could not load the latest version. Try again.'));
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
          <p className="mt-3 text-base font-semibold text-ink">{t('Correction published as revision {version}.', { version: phase.revision.version })}</p>
          <p className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {phase.previousVerdict && phase.previousVerdict !== phase.revision.verdict ? (
              <>
                <VerdictBadge verdict={phase.previousVerdict} />
                <ArrowRight className="h-4 w-4 text-ink-muted" aria-label={t('changed to')} />
                <VerdictBadge verdict={phase.revision.verdict} />
              </>
            ) : (
              <>
                <VerdictBadge verdict={phase.revision.verdict} />
                <span className="text-xs text-ink-muted">{t('Verdict unchanged')}</span>
              </>
            )}
          </p>
          {phase.revision.attachments?.length ? (
            <p className="mt-2 text-xs text-ink-muted">
              {t(phase.revision.attachments.length === 1 ? 'With {count} screenshot' : 'With {count} screenshots', {
                count: phase.revision.attachments.length,
              })}
            </p>
          ) : null}
          <p className="mt-3 max-w-sm text-ink-soft">{t('The original AI assessment is kept in the revision history.')}</p>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2 border-t border-line pt-4">
          <button type="button" className="btn-secondary" onClick={onShowHistory}>
            {t('View revision history')}
          </button>
          <button type="button" className="btn-primary" onClick={onClose} ref={doneButtonRef}>
            {t('Done')}
          </button>
        </div>
      </div>
    );
  }

  const submitting = phase.kind === 'submitting';
  const blockedByConflict = phase.kind === 'conflict' && !phase.reloaded;

  return (
    <form onSubmit={submit} onPaste={onPaste} noValidate className="space-y-6 text-sm">
      {current && (
        <section>
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-normal text-ink-muted">
            {t('Current assessment')}
            <VerdictBadge verdict={current.verdict} />
            {current.kind === 'human_correction' && <RevisionKindBadge kind={current.kind} version={current.version} />}
          </h3>
          <p className="mt-1.5 text-[15px] leading-[1.65] text-ink-soft">{current.rationale}</p>
        </section>
      )}

      {phase.kind === 'conflict' && (
        <div
          role="alert"
          className={`rounded-xl border p-4 ${
            phase.reloaded ? 'border-brand-200 bg-brand-50 text-brand-900' : 'border-amber-300 bg-amber-50 text-amber-950'
          }`}
        >
          {phase.reloaded ? (
            <p>{t('Latest version loaded (revision {version}). Your draft was kept.', { version: phase.currentVersion })}</p>
          ) : (
            <>
              <p className="flex items-center gap-2 font-semibold">
                <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                {t('This claim changed while you were reviewing it')}
              </p>
              <p className="mt-1">
                {t(
                  'Revision {version} was published after you opened this form. Your correction was not saved, and nothing was overwritten. Reload to see the latest version.',
                  { version: phase.currentVersion },
                )}
              </p>
              <button
                type="button"
                className="btn-secondary mt-3 border-amber-300"
                onClick={() => void reloadLatest()}
                disabled={phase.reloading}
                ref={reloadButtonRef}
              >
                <RefreshCw className={`h-4 w-4 ${phase.reloading ? 'animate-spin' : ''}`} aria-hidden="true" />
                {phase.reloading ? t('Reloading…') : t('Reload latest version')}
              </button>
            </>
          )}
          {demoMode && (
            <p className="mt-3 text-xs opacity-80">
              {t('Demo simulation: a concurrent edit is injected on first publish.')}
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <fieldset>
          <legend className="sr-only">{t('Proposed verdict')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {verdictOptions.map(({ value, Icon, idleClass, selectedClass }) => {
              const checked = verdict === value;
              return (
                <label
                  key={value}
                  className={`relative inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 transition-colors [&:has(:focus-visible)]:outline [&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-offset-2 [&:has(:focus-visible)]:outline-brand-500 ${
                    checked ? `${selectedClass} font-semibold` : `border-transparent ${idleClass}`
                  }`}
                >
                  <input
                    type="radio"
                    name="verdict"
                    value={value}
                    checked={checked}
                    onChange={() => setVerdict(value)}
                    className="sr-only"
                  />
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {verdictLabel[value]}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor={ids.reason} className="sr-only">
            {t('Correction reason')}
          </label>
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
            className={`home-composer rounded-[24px] p-3.5 transition-colors sm:p-4 ${
              shotDragging
                ? '!border-brand-500 !bg-brand-50'
                : verdictOptions.find((option) => option.value === verdict)?.composerClass ?? '!border-line focus-within:!border-brand-200'
            }`}
          >
            {attachments.length > 0 && (
              <div className="mb-3">
                <ScreenshotThumbs items={attachments} onRemove={removeScreenshot} />
              </div>
            )}
            <textarea
              id={ids.reason}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
              }}
              rows={4}
              maxLength={config.correction.maxReasonLength + 100}
              className="block w-full resize-none bg-transparent px-1.5 pt-0.5 text-base leading-relaxed text-ink outline-none placeholder:text-ink-muted"
              placeholder={t('What should be corrected?')}
              aria-invalid={attempted && Boolean(reasonError)}
              aria-describedby={attempted && reasonError ? ids.reasonError : undefined}
              data-autofocus
            />
            <div className="mt-2 flex items-center justify-between gap-3">
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
                aria-label={t('add screenshots')}
                aria-describedby={ids.shotHint}
                title={t('PNG, JPG, WebP, or GIF · stays in your browser')}
                className="-ml-[3px] inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-zinc-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ImagePlus className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
              <span id={ids.shotHint} className="sr-only">
                {t('PNG, JPG, WebP, or GIF · stays in your browser')}
              </span>
              <button
                type="submit"
                disabled={submitting || blockedByConflict}
                ref={publishButtonRef}
                aria-label={submitting ? t('Sending…') : t('Send')}
                title={t('Send')}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {attempted && reasonError && (
            <p id={ids.reasonError} className="mt-1.5 text-rose-700">
              {reasonError}
            </p>
          )}
          {shotErrors.length > 0 && (
            <ul role="alert" className="mt-1.5 space-y-0.5 text-rose-700">
              {shotErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <p className="sr-only" role="status" aria-live="polite">
            {shotStatus}
          </p>
        </div>
      </div>

      {formError && (
        <p role="alert" className="text-rose-700">
          {formError}
        </p>
      )}
    </form>
  );
}
