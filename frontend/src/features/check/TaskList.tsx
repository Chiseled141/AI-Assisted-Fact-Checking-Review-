import { Check as CheckIcon, Loader2, TriangleAlert } from 'lucide-react';
import type { TaskProgress } from '../../types/models';
import { inLanguage, t } from '../../lib/i18n';
import { judgeLogo } from '../../lib/judges';
import { VerdictMark } from '../../components/Badges';

const chartLabel: Record<string, string> = {
  price: 'Price chart data',
  heat: 'Heatmap data',
  country: 'Country map data',
  pyramid: 'Population pyramid data',
  state: 'State map data',
  route: 'Looking up route stops',
  election: 'Election chart data',
  'incident-map': 'Looking up the incident location',
};

const aiTaskLabel: Partial<Record<TaskProgress['task'], string>> = {
  extracting: 'Extracting claims',
  reviewing: 'Reviewing claims before searching',
  clarifying: 'Rewriting the claim with your answer',
  rephrasing: 'Writing the question as a claim',
  researching: 'Finding sources with Tavily',
  researching_chart: 'Finding sources for the chart',
  judging: 'Judging the claim',
  reading_seats: 'Reading seat counts from sources',
  reading_prices: 'Reading SJC prices from sources',
  reading_figures: 'Reading map figures from sources',
  reading_pie: 'Reading the breakdown from sources',
  reading_bar: 'Reading comparable figures from sources',
  reading_route: 'Reading route stops from sources',
  reading_match: 'Reading the match result from sources',
  reading_incident_location: 'Reading the incident location from sources',
  reading_states: 'Reading state results from sources',
  reading_election: 'Reading seats and state results from sources',
};

function taskName(task: TaskProgress): string {
  if (task.task === 'chart_data') return t(chartLabel[task.chart ?? ''] ?? 'Chart data');
  if (task.task === 'chart_sources') return t(task.chart ? 'Searching for the chart' : 'Finding SJC price articles');
  if (task.task === 'searching') return t(task.phase === 'reading' ? 'Reading the pages found' : 'Searching green sources');
  return t(aiTaskLabel[task.task] ?? task.task);
}

function statusText(task: TaskProgress): string {
  if (task.status === 'completed') return t('Completed');
  if (task.status === 'failed') return t('Failed');
  return t('Working…');
}

function SearchLine({ task }: { task: TaskProgress }) {
  if (task.task === 'chart_sources' && task.status === 'completed') {
    return <p className="mt-0.5 text-xs leading-relaxed text-ink-muted tabular-nums">{t('{count} pages read', { count: task.sourceCount ?? 0 })}</p>;
  }
  if (task.task !== 'searching') return null;
  return (
    <p className="mt-0.5 text-xs leading-relaxed text-ink-muted tabular-nums">
      {t('Search {count}', { count: task.searchCount ?? 1 })}
      {' · '}
      {t('{count} of {target} publishers saved', { count: task.sourceCount ?? 0, target: task.sourceTarget ?? 0 })}
    </p>
  );
}

function TaskRow({ task, showModelNames }: { task: TaskProgress; showModelNames: boolean }) {
  const claimTrace = !showModelNames && ['extracting', 'reviewing', 'clarifying', 'researching'].includes(task.task);
  const name = claimTrace ? 'ClaimTrace' : task.modelName ?? task.service;
  const logo = !claimTrace && task.modelName ? judgeLogo(task.modelName) : undefined;
  return (
    <li className="py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-5">
        {task.status === 'running' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" aria-hidden="true" />
        ) : task.status === 'completed' ? (
          <CheckIcon className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
        ) : (
          <TriangleAlert className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
        )}
        {logo && <img src={logo} alt="" className="h-3.5 w-3.5" />}
        <span className={claimTrace ? 'font-wordmark font-bold text-ink-soft' : task.status === 'running' ? 'font-medium text-ink' : 'text-ink-soft'}>
          {name}
        </span>
        <span className="text-ink-muted">{taskName(task)}</span>
        {task.claimPosition != null && (
          <span className="text-ink-faint">{t('Claim {position}', { position: task.claimPosition })}</span>
        )}
        {/* A tick already says it is done; only work in progress or a failure needs words. */}
        {task.status === 'completed' ? (
          <span className="sr-only">{statusText(task)}</span>
        ) : (
          <span className={task.status === 'failed' ? 'text-amber-800' : 'text-ink-faint'}>{statusText(task)}</span>
        )}
        {task.verdict && <VerdictMark verdict={task.verdict} />}
      </div>
      <div className="pl-[22px]">
        <SearchLine task={task} />
        {task.stateCount != null && (
          <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
            {t(task.stateCount === 1 ? '{count} state verified' : '{count} states verified', { count: task.stateCount })}
          </p>
        )}
        {task.summary && (
          <p className={`mt-0.5 text-[13px] leading-relaxed ${task.status === 'failed' ? 'text-amber-800' : 'text-ink-muted'}`}>
            {inLanguage(t(task.summary), task.translations)}
          </p>
        )}
        {task.task === 'extracting' && task.status === 'completed' && (
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
            {t('Extracted {count} factual claims.', { count: task.claimCount ?? 0 })}
          </p>
        )}
      </div>
    </li>
  );
}

export function TaskRows({ tasks, showModelNames = false }: { tasks: TaskProgress[]; showModelNames?: boolean }) {
  return (
    <ol className="mt-1" aria-live="polite" aria-relevant="additions text">
      {tasks.map((task) => <TaskRow key={task.id} task={task} showModelNames={showModelNames} />)}
    </ol>
  );
}

const groups: { kind: TaskProgress['kind']; title: string }[] = [
  { kind: 'ai', title: 'AI models' },
  { kind: 'search', title: 'Source search' },
  { kind: 'data', title: 'Chart and map data' },
];

/** The calls this check has really made, by who is doing the work. A group appears only once it has a call. */
export function TaskGroups({ tasks }: { tasks: TaskProgress[] }) {
  return (
    <>
      {groups.map(({ kind, title }) => {
        const inGroup = tasks.filter((task) => task.kind === kind);
        if (!inGroup.length) return null;
        return (
          <section key={kind} aria-label={t(title)} className="mt-3 first:mt-2">
            <h2 className="text-xs font-medium text-ink-faint">{t(title)}</h2>
            <TaskRows tasks={inGroup} />
          </section>
        );
      })}
    </>
  );
}
