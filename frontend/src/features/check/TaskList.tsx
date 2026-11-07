import { Check as CheckIcon, Loader2, TriangleAlert } from 'lucide-react';
import type { TaskProgress } from '../../types/models';
import { inLanguage, t } from '../../lib/i18n';
import { judgeLogo } from '../../lib/judges';
import { VerdictMark } from '../../components/Badges';
import { electionMap } from '../results/chartSettings';

const chartLabel: Record<string, string> = {
  price: 'Price chart data',
  heat: 'Heatmap data',
  country: 'Country map data',
  state: 'State map data',
  election: 'Election chart data',
};

const aiTaskLabel: Partial<Record<TaskProgress['task'], string>> = {
  extracting: 'Extracting claims',
  rephrasing: 'Writing the question as a claim',
  researching: 'Finding sources with Tavily',
  researching_chart: 'Finding sources for the chart',
  judging: 'Judging the claim',
  reading_seats: 'Reading seat counts from sources',
  reading_prices: 'Reading SJC prices from sources',
  reading_figures: 'Reading map figures from sources',
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
    return <p className="mt-1 text-xs leading-relaxed text-ink-muted tabular-nums">{t('{count} pages read', { count: task.sourceCount ?? 0 })}</p>;
  }
  if (task.task !== 'searching') return null;
  return (
    <p className="mt-1 text-xs leading-relaxed text-ink-muted tabular-nums">
      {t('Search {count}', { count: task.searchCount ?? 1 })}
      {' · '}
      {t('{count} of {target} publishers saved', { count: task.sourceCount ?? 0, target: task.sourceTarget ?? 0 })}
    </p>
  );
}

/** One color for who is doing the work: indigo for AI models, orange for Tavily, neutral for data services. */
const kindStyle: Record<TaskProgress['kind'], { icon: string; name: string; section: string; dot: string }> = {
  ai: { icon: 'text-indigo-600', name: 'text-indigo-700', section: 'border-t-indigo-500', dot: 'bg-indigo-500' },
  search: { icon: 'text-orange-600', name: 'text-orange-700', section: 'border-t-orange-500', dot: 'bg-orange-500' },
  data: { icon: 'text-ink-muted', name: 'text-ink', section: 'border-t-ink-muted', dot: 'bg-ink-muted' },
};

function TaskRow({ task }: { task: TaskProgress }) {
  const style = kindStyle[task.kind];
  const logo = task.modelName ? judgeLogo(task.modelName) : undefined;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {task.status === 'running' ? (
          <Loader2 className={`h-4 w-4 animate-spin ${style.icon}`} aria-hidden="true" />
        ) : task.status === 'completed' ? (
          <CheckIcon className={`h-4 w-4 ${style.icon}`} aria-hidden="true" />
        ) : (
          <TriangleAlert className="h-4 w-4 text-amber-700" aria-hidden="true" />
        )}
        {logo && <img src={logo} alt="" className="h-4 w-4" />}
        <strong className={`font-semibold ${style.name}`}>{task.modelName ?? task.service}</strong>
        <span className="text-ink-muted">{taskName(task)}</span>
        {task.claimPosition != null && (
          <span className="text-ink-muted">{t('Claim {position}', { position: task.claimPosition })}</span>
        )}
        <span className="text-ink-muted">{statusText(task)}</span>
        {task.verdict && <VerdictMark verdict={task.verdict} />}
      </div>
      <SearchLine task={task} />
      {task.stateCount != null && (
        <p className="mt-1 text-xs tabular-nums text-ink-muted">
          {t('{count} of {total} states verified', { count: task.stateCount, total: electionMap.totalStates })}
        </p>
      )}
      {task.summary && (
        <p className={`mt-2 text-[13px] leading-relaxed ${task.status === 'failed' ? 'text-amber-800' : 'text-ink-soft'}`}>
          {inLanguage(t(task.summary), task.translations)}
        </p>
      )}
      {task.task === 'extracting' && task.status === 'completed' && (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          {t('Extracted {count} factual claims.', { count: task.claimCount ?? 0 })}
        </p>
      )}
    </li>
  );
}

export function TaskRows({ tasks }: { tasks: TaskProgress[] }) {
  return (
    <ol className="mt-3 divide-y divide-line" aria-live="polite" aria-relevant="additions text">
      {tasks.map((task) => <TaskRow key={task.id} task={task} />)}
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
          <section key={kind} aria-label={t(title)} className={`mt-4 rounded-xl border border-line border-t-2 bg-white/80 p-4 sm:p-5 ${kindStyle[kind].section}`}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className={`h-2 w-2 rounded-full ${kindStyle[kind].dot}`} aria-hidden="true" />
              {t(title)}
            </h2>
            <TaskRows tasks={inGroup} />
          </section>
        );
      })}
    </>
  );
}
