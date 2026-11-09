import { ChartReply } from './ChartReply';
import { lazy, Suspense } from 'react';
import type { PopulationPyramidData } from '../../types/models';
import { formatCalendarDate } from '../../lib/format';
import { locale, t } from '../../lib/i18n';
import { populationPyramid } from './chartSettings';

const PyramidPlot = lazy(() => import('./PyramidPlot'));

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** One country's people by age and sex. Claims without `populationPyramid` never reach this, so Highcharts only loads when needed. */
export function PopulationPyramid({ chart, onReply }: { chart: PopulationPyramidData; onReply?: (title: string) => void }) {
  const title = t('Population pyramid');
  const total = sum(chart.men) + sum(chart.women);
  const percent = (people: number) => `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format((people / total) * 100)}%`;
  // Bands are five years wide, so 15 starts at the fourth and 65 at the fourteenth.
  const ages = (from: number, to?: number) => sum(chart.men.slice(from, to)) + sum(chart.women.slice(from, to));
  const rows = [
    { label: t('Under 15'), value: ages(0, 3) },
    { label: t('15 to 64'), value: ages(3, 13) },
    { label: t('65 and over'), value: ages(13) },
    { label: t('Men'), value: sum(chart.men) },
    { label: t('Women'), value: sum(chart.women) },
  ];

  return (
    <section aria-labelledby="population-pyramid-heading" className="mt-8">
      <div className="rounded-2xl border border-ink bg-white p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="population-pyramid-heading" className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-ink">
            {title}
          </h2>
          <ChartReply title={title} onReply={onReply} />
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">
          {chart.named} · {chart.year}
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
          {/* The height matches the chart's, so nothing jumps when it loads. */}
          <div className="min-w-0" style={{ height: populationPyramid.height }} aria-hidden="true">
            <Suspense fallback={null}>
              <PyramidPlot chart={chart} />
            </Suspense>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium leading-[1.3] text-ink">{t('Share of the population')}</h3>
            <dl className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line-strong bg-white">
              {rows.map(({ label, value }) => (
                <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 px-4 py-2.5">
                  <dt className="text-[13px] leading-[1.4] text-ink-soft">{label}</dt>
                  <dd className="text-[15px] font-medium leading-[1.3] text-ink">{percent(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <p className="sr-only">
          {t('{under15} of the population is under 15, and {over65} is 65 or over.', {
            under15: percent(rows[0].value),
            over65: percent(rows[2].value),
          })}
        </p>
      </div>
      <p className="mt-3 text-[13px] leading-[1.5] text-ink-muted">
        {t('Population estimates from the {source}, retrieved {date}.', {
          source: chart.source,
          date: formatCalendarDate(chart.retrievedAt.slice(0, 10)),
        })}{' '}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-line-strong underline-offset-2"
        >
          CC BY 4.0
        </a>
        . {t('This chart is context and did not decide the verdict.')}
      </p>
    </section>
  );
}
