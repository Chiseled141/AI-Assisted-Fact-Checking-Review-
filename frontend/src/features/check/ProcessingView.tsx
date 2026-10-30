import { Check as CheckIcon, Circle, Loader2 } from 'lucide-react';
import type { Check } from '../../types/models';
import { PROCESSING_STAGES } from '../../types/models';
import { formatDateTime, statusLabel } from '../../lib/format';
import { DemoModeLabel } from '../../components/Badges';

const stageHint: Record<(typeof PROCESSING_STAGES)[number], string> = {
  queued: 'Waiting for a worker',
  extracting: 'Splitting the input into atomic claims',
  retrieving: 'Looking up and saving source snapshots',
  assessing: 'Comparing each claim with its evidence',
  completed: 'Results ready to review',
};

export function ProcessingView({ check }: { check: Check }) {
  const currentIndex = PROCESSING_STAGES.indexOf(check.status as (typeof PROCESSING_STAGES)[number]);

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-10 sm:pt-16">
      <div className="panel p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-semibold tracking-tight text-2xl text-ink">Checking claims</h1>
          <DemoModeLabel />
        </div>
        <p className="mt-2 break-words text-sm text-ink-soft">{check.title}</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-ink-muted">
          <dt>Check ID</dt>
          <dd className="font-mono text-ink-soft">{check.id}</dd>
          <dt>Started</dt>
          <dd>
            <time dateTime={check.createdAt}>{formatDateTime(check.createdAt)}</time>
          </dd>
        </dl>

        <p className="sr-only" role="status" aria-live="polite">
          Current stage: {statusLabel[check.status]}
        </p>

        <ol className="mt-8 space-y-0" aria-label="Processing stages">
          {PROCESSING_STAGES.map((stage, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            const last = index === PROCESSING_STAGES.length - 1;
            return (
              <li key={stage} className="relative flex gap-4 pb-6 last:pb-0" aria-current={active ? 'step' : undefined}>
                {!last && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px ${done ? 'bg-brand-500' : 'bg-line'}`}
                  />
                )}
                <span
                  aria-hidden="true"
                  className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                    done
                      ? 'border-brand-500 bg-brand-500 text-on-brand'
                      : active
                        ? 'border-brand-500 bg-white text-brand-600'
                        : 'border-line bg-white text-zinc-300'
                  }`}
                >
                  {done ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Circle className="h-2.5 w-2.5 fill-current" />
                  )}
                </span>
                <div className="pt-0.5">
                  <p className={`text-sm font-medium ${done || active ? 'text-ink' : 'text-ink-muted'}`}>
                    {statusLabel[stage]}
                    <span className="sr-only">{done ? ' — done' : active ? ' — in progress' : ' — pending'}</span>
                  </p>
                  <p className="text-xs text-ink-muted">{stageHint[stage]}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="mt-8 bg-zinc-50 px-3 py-2 text-xs text-ink-muted">
          Simulated processing. No AI model, search provider, or URL fetch is called — stages advance on a timer and a
          preset scenario is shown at the end. You can leave or refresh this page; progress is saved.
        </p>
      </div>
    </div>
  );
}
