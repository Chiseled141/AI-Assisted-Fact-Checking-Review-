import type { CheckDetail } from '../../types/models';
import { PROCESSING_STAGES } from '../../types/models';
import { formatDateTime, statusLabel } from '../../lib/format';
import { t } from '../../lib/i18n';
import { TaskGroups } from './TaskList';

const stageHint: Record<(typeof PROCESSING_STAGES)[number], string> = {
  queued: 'Waiting for a worker',
  extracting: 'Splitting the input into atomic claims',
  retrieving: 'Looking up and saving source snapshots',
  assessing: 'Comparing each claim with its evidence',
  completed: 'Results ready to review',
};

const TOTAL_STAGES = PROCESSING_STAGES.length;

/** The progress screen. Everything on it comes from what the backend has saved: nothing is estimated or animated forward. */
export function ProcessingView({ check }: { check: CheckDetail }) {
  const currentIndex = Math.max(0, PROCESSING_STAGES.indexOf(check.status as (typeof PROCESSING_STAGES)[number]));
  const stage = PROCESSING_STAGES[currentIndex];
  const nextStage = PROCESSING_STAGES[currentIndex + 1];
  const tasks = check.progress ?? [];
  const processed = check.claims.filter((claim) => claim.current || claim.status === 'unavailable').length;
  const finishing = check.status === 'assessing' && check.claims.length > 0 && processed === check.claims.length;
  // A link is read before any model is called, so this stage has nothing else to show yet.
  const readingLink = check.status === 'extracting' && check.inputType === 'url' && tasks.length === 0;
  const hint = finishing ? 'Finishing visual details' : readingLink ? 'Reading the submitted page' : stageHint[stage];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16">
      <div className="mx-auto max-w-[640px]">
        <h1 className="text-[30px] font-medium leading-[1.12] tracking-[-0.03em] text-ink sm:text-[40px]">
          {t('Checking claims')}
        </h1>
        <p className="mt-3 break-words text-[15px] leading-[1.7] text-ink-soft">{check.title}</p>
        <p className="mt-1.5 text-xs text-ink-faint">
          {t('Started')} <time dateTime={check.createdAt}>{formatDateTime(check.createdAt)}</time>
        </p>

        <p className="sr-only" role="status" aria-live="polite">
          {t('Current stage: {stage}', { stage: statusLabel[check.status] })}
        </p>

        <div className="mt-8">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[17px] font-medium tracking-[-0.01em] text-ink">{statusLabel[stage]}</p>
            <p className="shrink-0 text-[13px] tabular-nums text-ink-muted">
              {t('Stage {current} of {total}', { current: currentIndex + 1, total: TOTAL_STAGES })}
            </p>
          </div>
          <div className="mt-2.5 flex gap-1.5" aria-hidden="true">
            {PROCESSING_STAGES.map((name, index) => (
              <span
                key={name}
                className={`h-[3px] flex-1 rounded-full ${
                  index < currentIndex ? 'bg-brand-500' : index === currentIndex ? 'bg-brand-200' : 'bg-line'
                }`}
              />
            ))}
          </div>
          <p className="mt-3 text-[15px] leading-[1.7] text-ink-soft">{t(hint)}</p>
          {check.status === 'assessing' && check.claims.length > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              {t('{done} of {total} claims processed', { done: processed, total: check.claims.length })}
            </p>
          )}
          {nextStage && (
            <p className="mt-1 text-xs text-ink-faint">{t('Up next · {stage}', { stage: statusLabel[nextStage] })}</p>
          )}
        </div>

        <div className="mt-6">
          <TaskGroups tasks={tasks} />
        </div>
      </div>
    </div>
  );
}
