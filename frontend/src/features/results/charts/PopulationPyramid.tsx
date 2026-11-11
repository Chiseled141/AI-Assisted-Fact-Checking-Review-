import { ChartReply } from './ChartReply';
import { lazy, Suspense, useId } from 'react';
import type { PopulationPyramidData } from '../../../types/models';
import { formatCalendarDate } from '../../../lib/format';
import { locale, t } from '../../../lib/i18n';
import { populationPyramid } from './chartSettings';

const PyramidPlot = lazy(() => import('./PyramidPlot'));

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** One country's people by age and sex. Claims without `populationPyramid` never reach this, so Highcharts only loads when needed. */
export function PopulationPyramid({ chart, onReply }: { chart: PopulationPyramidData; onReply?: (title: string) => void }) {
  const heading = useId();
  const title = t('Population pyramid');
  const men = sum(chart.men);
  const women = sum(chart.women);
  const total = men + women;
  const number = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });
  const percent = (share: number) => `${number.format(share * 100)}%`;
  // Bands are five years wide, so 15 starts at the fourth and 65 at the fourteenth.
  const ages = (from: number, to?: number) => sum(chart.men.slice(from, to)) + sum(chart.women.slice(from, to));
  const ageGroups = [
    { label: t('Under 15'), share: ages(0, 3) / total },
    { label: t('15 to 64'), share: ages(3, 13) / total },
    { label: t('65 and over'), share: ages(13) / total },
  ];
  const sexGroups = [
    { label: t('Men'), share: men / total, color: populationPyramid.menColor },
    { label: t('Women'), share: women / total, color: populationPyramid.womenColor },
  ];

  return (
    <section aria-labelledby={heading} className="mt-8">
      <div className="rounded-2xl border border-line-strong bg-white p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id={heading} className="text-xl font-medium leading-tight tracking-[-0.02em] text-ink sm:text-2xl">
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
          <div className="min-w-0 self-start overflow-hidden rounded-xl border border-line-strong bg-page">
            <h3 className="px-4 py-4 text-base font-medium text-ink sm:px-5">{t('Share of the population')}</h3>
            <div className="border-y border-line bg-white px-4 py-4 sm:px-5">
              <h4 className="text-xs font-medium text-ink-muted">{t('By age group')}</h4>
              <dl className="mt-3 space-y-3">
                {ageGroups.map(({ label, share }) => (
                  <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5">
                    <dt className="text-sm text-ink-soft">{label}</dt>
                    <dd className="contents">
                      <span className="text-base font-strong leading-tight text-ink tabular-nums">{percent(share)}</span>
                      <span aria-hidden="true" className="col-span-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                        <span className="block h-full rounded-full bg-brand-700" style={{ width: (share * 100) + '%' }} />
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <h4 className="text-xs font-medium text-ink-muted">{t('By sex')}</h4>
              <div aria-hidden="true" className="mt-3 flex h-2 overflow-hidden rounded-full bg-zinc-100">
                {sexGroups.map(({ label, share, color }) => (
                  <span key={label} style={{ width: (share * 100) + '%', backgroundColor: color }} />
                ))}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                {sexGroups.map(({ label, share, color }) => (
                  <div key={label} className="last:text-right">
                    <dt className="text-sm text-ink-soft">
                      <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full" style={{ backgroundColor: color }} />
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-xl font-strong leading-tight text-ink tabular-nums">{percent(share)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
        <p className="sr-only">
          {t('{under15} of the population is under 15, and {over65} is 65 or over.', {
            under15: percent(ageGroups[0].share),
            over65: percent(ageGroups[2].share),
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
