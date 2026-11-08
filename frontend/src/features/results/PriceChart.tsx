import { ChartReply } from './ChartReply';
import { lazy, Suspense } from 'react';
import type { MarketAsset, PriceChartData } from '../../types/models';
import { formatCalendarDate, safeHref } from '../../lib/format';
import { locale, t, translated } from '../../lib/i18n';
import { priceChart } from './chartSettings';

const PricePlot = lazy(() => import('./PricePlot'));

export const priceTitle = translated<MarketAsset>({
  bitcoin: 'Bitcoin price',
  ethereum: 'Ethereum price',
  gold: 'Gold price',
  silver: 'Silver price',
  oil: 'Brent crude oil price',
  sjc_gold: 'SJC gold price',
});

/** The line takes the color people link with the asset, so gold and Bitcoin are yellow. */
export const assetColor: Record<MarketAsset, string> = {
  bitcoin: '#f2b600',
  gold: '#f2b600',
  sjc_gold: '#f2b600',
  ethereum: '#627eea',
  silver: '#8a94a6',
  oil: '#374151',
};

export const formatPrice = (value: number, currency: string) =>
  new Intl.NumberFormat(locale(), { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);

const day = (ms: number) => formatCalendarDate(new Date(ms).toISOString().slice(0, 10));

/**
 * Market prices around a claim about an asset's price, with the claim's dates flagged. Claims without
 * `priceChart` never reach this, so Highcharts Stock only loads when there is a chart to show.
 */
export function PriceChart({ chart, onReply }: { chart: PriceChartData; onReply?: (title: string) => void }) {
  const title = priceTitle[chart.asset];
  const [start, first] = chart.prices[0];
  const [end, last] = chart.prices[chart.prices.length - 1];
  return (
    <section aria-labelledby="price-chart-heading" className="mt-8">
      {/* A white panel, so the chart stands apart from the page. */}
      <div className="rounded-2xl border border-ink bg-white p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="price-chart-heading" className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-ink">
            {title}
          </h2>
          <ChartReply title={title} onReply={onReply} />
        </div>
        {/* The height matches the chart's, so nothing jumps when it loads. */}
        <div className="mt-3" style={{ height: priceChart.height }} aria-hidden="true">
          <Suspense fallback={null}>
            <PricePlot chart={chart} />
          </Suspense>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-[1.5] text-ink-muted">
        {chart.reports
          ? t(
              'Verified SJC selling-price reports per tael, retrieved {date}. These are snapshots, not a full price history. The AI judges also read these prices.',
              { date: formatCalendarDate(chart.retrievedAt.slice(0, 10)) },
            )
          : t(
              'Daily closing price from {source}, retrieved {date}. A peak within a day may not show. The AI judges also read these prices.',
              { source: chart.source, date: formatCalendarDate(chart.retrievedAt.slice(0, 10)) },
            )}
      </p>

      {chart.reports && (
        <details className="mt-3 text-[13px]">
          <summary className="cursor-pointer font-medium text-indigo-700 underline decoration-line-strong underline-offset-4">
            {t('View the source behind each price')}
          </summary>
          <ul className="mt-3 space-y-1.5 text-ink-soft">
            {chart.reports.map((report, index) => {
              const href = safeHref(report.url);
              return (
                <li key={report.date} className="break-words">
                  {formatCalendarDate(report.date)} · {formatPrice(chart.prices[index][1], chart.currency)} ·{' '}
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-line-strong underline-offset-4"
                    >
                      {report.publisher}
                    </a>
                  ) : (
                    report.publisher
                  )}
                  {report.publishedAt && (
                    <span className="ml-2 text-ink-muted">{t('Published {date}', { date: formatCalendarDate(report.publishedAt) })}</span>
                  )}
                  {report.quote && <blockquote className="mt-1 border-l border-line-strong pl-3 leading-relaxed">“{report.quote}”</blockquote>}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <div className="sr-only">
        <p>
          {t(
            chart.reports
              ? 'Reported price went from {first} on {start} to {last} on {end}.'
              : 'Closing price went from {first} on {start} to {last} on {end}.',
            {
              first: formatPrice(first, chart.currency),
              start: day(start),
              last: formatPrice(last, chart.currency),
              end: day(end),
            },
          )}
        </p>
        <ul>
          {chart.events.map((event) => (
            <li key={`${event.date}-${event.title}`}>
              {formatCalendarDate(event.date)}: {event.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
