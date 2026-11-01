import { useMemo } from 'react';
import { Check as CheckIcon, Info } from 'lucide-react';
import type { Check } from '../../types/models';
import { PROCESSING_STAGES } from '../../types/models';
import { formatDateTime, statusLabel } from '../../lib/format';
import { DemoModeLabel } from '../../components/Badges';
import { config } from '../../config';

const stageHint: Record<(typeof PROCESSING_STAGES)[number], string> = {
  queued: 'Waiting for a worker',
  extracting: 'Splitting the input into atomic claims',
  retrieving: 'Looking up and saving source snapshots',
  assessing: 'Comparing each claim with its evidence',
  completed: 'Results ready to review',
};

const TOTAL_STAGES = PROCESSING_STAGES.length;

/** Demo stage timing, used only to pace the segment fill. Unknown stages get a calm default. */
function stageDurationMs(stage: string): number {
  return (config.stageDurations as Record<string, number | undefined>)[stage] ?? 1600;
}

/**
 * The progress screen, read like a short live brief: one stage in focus,
 * finished stages quiet, and upcoming ones faint.
 */
export function ProcessingView({ check }: { check: Check }) {
  const currentIndex = Math.max(
    0,
    PROCESSING_STAGES.indexOf(check.status as (typeof PROCESSING_STAGES)[number]),
  );
  const nextStage = PROCESSING_STAGES[currentIndex + 1];

  // Fill the active segment from start to end. The stage advances on its own clock, so offset the
  // animation by time already spent in this stage — a reload mid-stage still ends the fill on time.
  const { stageMs, fillDelay } = useMemo(() => {
    const before = PROCESSING_STAGES.slice(0, currentIndex).reduce(
      (sum, stage) => sum + stageDurationMs(stage),
      0,
    );
    const duration = stageDurationMs(PROCESSING_STAGES[currentIndex]);
    const elapsed = Date.now() - new Date(check.createdAt).getTime() - before;
    return { stageMs: duration, fillDelay: -Math.max(0, Math.min(elapsed, duration)) };
  }, [currentIndex, check.createdAt]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16">
      <div className="mx-auto max-w-[640px]">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[13px] font-medium text-brand-600">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-50 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            Live check
          </p>
          <DemoModeLabel />
        </div>

        <h1 className="mt-5 text-[30px] font-medium leading-[1.12] tracking-[-0.03em] text-ink sm:mt-6 sm:text-[40px]">
          Checking claims
        </h1>
        <p className="mt-3 break-words text-[15px] leading-[1.7] text-ink-soft">{check.title}</p>
        <p className="mt-1.5 text-xs text-ink-faint">
          Started <time dateTime={check.createdAt}>{formatDateTime(check.createdAt)}</time>
        </p>

        <p className="sr-only" role="status" aria-live="polite">
          Current stage: {statusLabel[check.status]}
        </p>

        <div className="mt-9 sm:mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-[13px] text-ink-muted">Check progress</p>
            <p className="text-[13px] tabular-nums text-ink-muted">
              Stage <span className="font-medium text-ink">{currentIndex + 1}</span> of {TOTAL_STAGES}
            </p>
          </div>
          <div className="mt-2.5 flex gap-1.5" aria-hidden="true">
            {PROCESSING_STAGES.map((stage, index) => {
              const done = index < currentIndex;
              const active = index === currentIndex;
              return (
                <span
                  key={stage}
                  className={`relative h-[3px] flex-1 overflow-hidden rounded-full ${
                    done ? 'bg-brand-500' : active ? 'bg-brand-100' : 'bg-line'
                  }`}
                >
                  {active && (
                    <span
                      className="stage-fill absolute inset-y-0 left-0 rounded-full bg-brand-500"
                      style={{ animationDuration: `${stageMs}ms`, animationDelay: `${fillDelay}ms` }}
                    />
                  )}
                </span>
              );
            })}
          </div>
        </div>

        <ol className="mt-7 border-t border-line" aria-label="Processing stages">
          {PROCESSING_STAGES.map((stage, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            return (
              <li
                key={stage}
                aria-current={active ? 'step' : undefined}
                className={`border-b border-line ${active ? 'py-5' : 'py-3.5'}`}
              >
                <div className="flex items-center gap-4">
                  <span
                    aria-hidden="true"
                    className={`w-6 shrink-0 font-logo text-[11px] font-medium tracking-[0.12em] ${
                      active ? 'text-brand-600' : 'text-ink-faint'
                    }`}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p
                    className={`min-w-0 flex-1 leading-snug tracking-[-0.01em] ${
                      active
                        ? 'text-[17px] font-medium text-ink'
                        : done
                          ? 'text-[15px] text-ink-muted'
                          : 'text-[15px] text-ink-faint'
                    }`}
                  >
                    {statusLabel[stage]}
                    <span className="sr-only">{done ? ' — done' : active ? ' — in progress' : ' — pending'}</span>
                  </p>
                  {done ? (
                    <CheckIcon className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} aria-hidden="true" />
                  ) : active ? (
                    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-50 motion-safe:animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
                    </span>
                  ) : (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-line-strong" aria-hidden="true" />
                  )}
                </div>
                {active && (
                  <div className="rise-in pl-10">
                    <p className="mt-1.5 text-[15px] leading-[1.7] text-ink-soft">{stageHint[stage]}</p>
                    {nextStage && (
                      <p className="mt-1.5 text-xs text-ink-faint">Up next · {statusLabel[nextStage]}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <p className="mt-8 flex items-start gap-2 text-xs leading-[1.7] text-ink-faint">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Simulated processing. No AI model, search, or URL fetch is called.
        </p>
      </div>
    </div>
  );
}
