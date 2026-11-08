import { useId, useState } from 'react';
import { Check, ChevronDown, CircleHelp, Loader2 } from 'lucide-react';
import type { CheckDetail, TaskProgress } from '../../types/models';
import { isTerminal, PROCESSING_STAGES } from '../../types/models';
import { statusLabel } from '../../lib/format';
import { locale, t } from '../../lib/i18n';
import { TaskGroups } from './TaskList';

const stageHint: Record<(typeof PROCESSING_STAGES)[number], string> = {
  queued: 'Waiting for a worker',
  extracting: 'Splitting the input into atomic claims',
  retrieving: 'Looking up and saving source snapshots',
  assessing: 'Comparing each claim with its evidence',
  completed: 'Results ready to review',
};

const TOTAL_STAGES = PROCESSING_STAGES.length;

function processingDuration(tasks: TaskProgress[]): string | null {
  const intervals = tasks
    .filter((task) => task.status === 'completed' && task.finishedAt)
    .map((task) => ({ start: Date.parse(task.startedAt), end: Date.parse(task.finishedAt!) }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let through = -Infinity;
  for (const { start, end } of intervals) {
    total += Math.max(0, end - Math.max(start, through));
    through = Math.max(through, end);
  }
  if (total === 0) return null;

  const format = new Intl.NumberFormat(locale());
  const seconds = Math.floor(total / 1000);
  if (seconds === 0) return t('Less than 1 sec');
  if (seconds < 60) return t('{seconds} sec', { seconds: format.format(seconds) });

  const minutes = format.format(Math.floor(seconds / 60));
  const remainder = seconds % 60;
  return remainder
    ? t('{minutes} min {seconds} sec', { minutes, seconds: format.format(remainder) })
    : t('{minutes} min', { minutes });
}

/**
 * The work behind an answer, like a chat model's "thinking" block. Open with live steps while the check runs; once it
 * is done it folds into one line the reader can open again. Everything here is what the backend has saved: nothing is
 * estimated or animated forward.
 */
export function ProcessingView({ check }: { check: CheckDetail }) {
  const running = !isTerminal(check.status);
  const waiting = check.status === 'awaiting_input';
  const [openWhenDone, setOpenWhenDone] = useState(false);
  // While it waits for the reader, the question matters more than the steps behind it.
  const live = running && !waiting;
  const open = live || openWhenDone;
  const bodyId = useId();

  const currentIndex = Math.max(0, PROCESSING_STAGES.indexOf(check.status as (typeof PROCESSING_STAGES)[number]));
  const stage = PROCESSING_STAGES[currentIndex];
  const tasks = check.progress ?? [];
  const processed = check.claims.filter((claim) => claim.current || claim.status === 'unavailable').length;
  const finishing = check.status === 'assessing' && check.claims.length > 0 && processed === check.claims.length;
  // A link is read before any model is called, so this stage has nothing else to show yet.
  const readingLink = check.status === 'extracting' && check.inputType === 'url' && tasks.length === 0;
  const hint = finishing ? 'Finishing visual details' : readingLink ? 'Reading the submitted page' : stageHint[stage];

  const duration = running ? null : processingDuration(tasks);
  const summary = duration
    ? t(check.status === 'failed' || check.status === 'stopped' ? 'Stopped after {duration}' : 'Checked in {duration}', { duration })
    : statusLabel[live ? stage : check.status];

  return (
    <div>
      <h2 className="sr-only">{t('Checking claims')}</h2>
      <p className="sr-only" role="status" aria-live="polite">
        {running ? t('Current stage: {stage}', { stage: statusLabel[check.status] }) : ''}
      </p>

      <button
        type="button"
        onClick={() => setOpenWhenDone((value) => !value)}
        disabled={live}
        aria-expanded={open}
        aria-controls={bodyId}
        className="group inline-flex max-w-full items-center gap-2 rounded-full py-1 text-left text-[15px] text-ink-soft enabled:hover:text-ink"
      >
        {waiting ? (
          <CircleHelp className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        ) : running ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" aria-hidden="true" />
        ) : (
          <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        )}
        <span className={`truncate ${running ? 'font-medium text-ink' : ''}`}>{summary}</span>
        {live ? (
          <span className="shrink-0 text-[13px] tabular-nums text-ink-muted">
            {t('Stage {current} of {total}', { current: currentIndex + 1, total: TOTAL_STAGES })}
          </span>
        ) : (
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-ink-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div id={bodyId} className="rise-in mt-2 border-l-2 border-line pl-4">
          {live && (
            <>
              <p className="text-[14px] leading-[1.7] text-ink-soft">{t(hint)}</p>
              {check.status === 'assessing' && check.claims.length > 0 && (
                <p className="mt-0.5 text-xs text-ink-muted">
                  {t('{done} of {total} claims processed', { done: processed, total: check.claims.length })}
                </p>
              )}
            </>
          )}
          {tasks.length > 0 ? (
            <TaskGroups tasks={tasks} />
          ) : (
            !running && <p className="text-sm text-ink-muted">{t('No steps were recorded for this check.')}</p>
          )}
        </div>
      )}
    </div>
  );
}
