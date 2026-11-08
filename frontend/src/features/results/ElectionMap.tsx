import { ChartReply } from './ChartReply';
import { lazy, Suspense } from 'react';
import type { ElectionMapData } from '../../types/models';
import { formatCalendarDate, safeHref } from '../../lib/format';
import { t, translated } from '../../lib/i18n';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { electionMap } from './chartSettings';

const ElectionPlot = lazy(() => import('./ElectionPlot'));

const officeTitle = translated<ElectionMapData['office']>({
  president: 'Presidential election',
  house: 'House of Representatives',
  senate: 'Senate',
});

/** Parties keep the colors US readers expect. Anyone else, such as a candidate named without a party, takes the next color. */
function winnerColors(map: ElectionMapData): (state: ElectionMapData['states'][number]) => string {
  const partyOf = (state: ElectionMapData['states'][number]) => {
    const name = state.winner.toLowerCase();
    if (state.party === 'republican' || electionMap.republicanWords.test(name)) return electionMap.republicanColor;
    if (state.party === 'democratic' || electionMap.democraticWords.test(name)) return electionMap.democraticColor;
    return null;
  };
  // A winner with a stated party in one state has it everywhere, as sources rarely repeat it.
  const known = new Map(map.states.flatMap((state) => {
    const color = partyOf(state);
    return color ? [[state.winner.toLowerCase(), color] as const] : [];
  }));
  const others = [...new Set(map.states.map(({ winner }) => winner.toLowerCase()))].filter((name) => !known.has(name));
  return (state) => {
    const name = state.winner.toLowerCase();
    return known.get(name) ?? electionMap.otherColors[others.indexOf(name) % electionMap.otherColors.length];
  };
}

/**
 * Who won each US state, as far as the sources show. Claims without `electionMap` never reach this,
 * so Highcharts Maps and the map shapes only load when needed.
 */
export function ElectionMap({ map, onReply }: { map: ElectionMapData; onReply?: (title: string) => void }) {
  const title = t('US election results by state');
  const phone = useMediaQuery('(max-width: 639px)');
  const height = phone ? electionMap.phoneHeight : electionMap.height;
  const colorOf = winnerColors(map);
  const count = map.states.length;
  const coverage = map.office === 'president'
    ? t('{count} of {total} states verified', { count, total: electionMap.totalStates })
    : t(count === 1 ? '{count} state verified' : '{count} states verified', { count });

  return (
    <section aria-labelledby="election-map-heading" className="mt-8">
      <div className="rounded-2xl border border-ink bg-white p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="election-map-heading" className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-ink">
            {title}
          </h2>
          <ChartReply title={title} onReply={onReply} />
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">
          {[map.year, officeTitle[map.office], coverage].join(' · ')}
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
          {/* The height matches the map's, so nothing jumps when it loads. */}
          <div className="min-w-0 self-center" style={{ height }} aria-hidden="true">
            <Suspense fallback={null}>
              <ElectionPlot map={map} height={height} colorOf={colorOf} />
            </Suspense>
          </div>
          <div className="min-w-0 self-start">
            <h3 className="text-[15px] font-medium leading-[1.3] text-ink">{t('Results from the sources')}</h3>
            <dl className="mt-3 max-h-[360px] divide-y divide-line overflow-y-auto rounded-xl border border-line-strong">
              {map.states.map((state) => {
                const href = safeHref(state.url);
                return (
                  <div key={state.code} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 px-4 py-2.5">
                    <dt className="flex items-baseline gap-2 text-[13px] leading-[1.4] text-ink-soft">
                      <span
                        className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-[3px]"
                        style={{ backgroundColor: colorOf(state) }}
                        aria-hidden="true"
                      />
                      <span>
                        {state.name}
                        {state.others.length > 0 && (
                          <span className="mt-1.5 block w-fit whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">
                            {t('Sources differ')}
                          </span>
                        )}
                      </span>
                    </dt>
                    <dd className="space-y-1 text-right">
                      <div className="text-[15px] font-medium leading-[1.3] text-ink">
                        {state.winner}
                        {state.detail ? ` · ${state.detail}` : ''}
                      </div>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-ink">
                          {state.publisher}
                        </a>
                      ) : (
                        <span className="text-xs text-ink-muted">{state.publisher}</span>
                      )}
                      {state.others.map((other) => (
                        <div key={`${other.winner}-${other.publisher}`} className="text-xs text-ink-muted">
                          {other.winner} · {other.publisher}
                        </div>
                      ))}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-[1.5] text-ink-muted">
        {t(
          'Each result is copied from the article it links to, retrieved {date}. States that could not be verified in the sources are grey. This map is context and did not decide the verdict.',
          { date: formatCalendarDate(map.retrievedAt.slice(0, 10)) },
        )}
      </p>
    </section>
  );
}
