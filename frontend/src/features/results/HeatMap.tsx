import { ChartReply } from './ChartReply';
import { lazy, Suspense } from 'react';
import type { HeatMapData } from '../../types/models';
import { formatCalendarDate } from '../../lib/format';
import { locale, t, translated } from '../../lib/i18n';
import { heatMap } from './chartSettings';

const HeatPlot = lazy(() => import('./HeatPlot'));

export const metricTitle = translated<HeatMapData['metric']>({
  temperature: 'Daily high temperature',
  rainfall: 'Daily rainfall',
});

export const metricUnit: Record<HeatMapData['metric'], string> = { temperature: '°C', rainfall: ' mm' };

export const formatValue = (value: number, metric: HeatMapData['metric']) =>
  `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(value)}${metricUnit[metric]}`;

/**
 * Weather over the claim's area on the claim's days. Claims without `heatMap` never reach this,
 * so Highcharts Maps and the map shapes only load when there is a map to show.
 */
const degrees = (value: number, positive: string, negative: string) =>
  `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(Math.abs(value))}°${value >= 0 ? positive : negative}`;

export function HeatMap({ map, onReply }: { map: HeatMapData; onReply?: (title: string) => void }) {
  const title = metricTitle[map.metric];
  const highest = map.points.reduce((best, point) => (point[2] > best[2] ? point : best));
  const lowest = map.points.reduce((best, point) => (point[2] < best[2] ? point : best));
  const average = map.points.reduce((sum, [, , value]) => sum + value, 0) / map.points.length;
  const where = ([lon, lat]: [number, number, number]) => `${degrees(lat, 'N', 'S')}, ${degrees(lon, 'E', 'W')}`;
  const rows = [
    { label: t('Highest'), value: highest[2], place: where(highest) },
    { label: t('Average of the map points'), value: average, place: null },
    { label: t('Lowest'), value: lowest[2], place: where(lowest) },
  ];
  const period =
    map.start === map.end ? formatCalendarDate(map.start) : `${formatCalendarDate(map.start)} – ${formatCalendarDate(map.end)}`;
  const totalDays = Math.round((Date.parse(map.end) - Date.parse(map.start)) / 86_400_000) + 1;

  return (
    <section aria-labelledby="heat-map-heading" className="mt-8">
      {/* A white panel, the same as the other charts'. */}
      <div className="rounded-2xl border border-ink bg-white p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="heat-map-heading" className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-ink">
            {title}
          </h2>
          <ChartReply title={title} onReply={onReply} />
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">
          {map.areaName} · {period}
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
          {/* The height matches the map's, so nothing jumps when it loads. */}
          <div className="min-w-0" style={{ height: heatMap.height }} aria-hidden="true">
            <Suspense fallback={null}>
              <HeatPlot map={map} />
            </Suspense>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium leading-[1.3] text-ink">{t('Figures from the weather model')}</h3>
            <div className="mt-3 overflow-hidden rounded-xl border border-line-strong bg-white">
              <h4 className="flex items-center gap-2 border-b border-orange-100 bg-orange-50 px-4 py-2.5 text-[13px] font-medium text-orange-900">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-orange-700" aria-hidden="true" />
                {t('Across this map')}
              </h4>
              <dl className="divide-y divide-line">
                {rows.map(({ label, value, place }) => (
                  <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 px-4 py-2.5">
                    <dt className="text-[13px] leading-[1.4] text-ink-soft">{label}</dt>
                    <dd className="text-right">
                      <div className="text-[15px] font-medium leading-[1.3] text-ink">{formatValue(value, map.metric)}</div>
                      {place && <div className="text-xs text-ink-muted">{place}</div>}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
        <p className="sr-only">
          {t('{metric} ranged from {low} to {high} across the map.', {
            metric: metricTitle[map.metric],
            low: formatValue(lowest[2], map.metric),
            high: formatValue(highest[2], map.metric),
          })}
        </p>
      </div>
      <p className="mt-3 text-[13px] leading-[1.5] text-ink-muted">
        {t('Weather model data from {source}, retrieved {date}, with points {step}° apart and colors blended between them.', {
          source: map.source,
          date: formatCalendarDate(map.retrievedAt.slice(0, 10)),
          step: map.step,
        })}{' '}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-line-strong underline-offset-2"
        >
          CC BY 4.0
        </a>
        .
        {map.days.length < totalDays &&
          ` ${t('It averages {count} days sampled across the period: {days}.', {
            count: map.days.length,
            days: map.days.map(formatCalendarDate).join(', '),
          })}`}
        {` ${t('A model grid reads lower than a single weather station at a hot spot. This map is context and did not decide the verdict.')}`}
      </p>
    </section>
  );
}
