import { lazy, Suspense, useId } from 'react';
import { safeHref } from '../../lib/format';
import { locale, t } from '../../lib/i18n';
import type { PieChartData } from '../../types/models';
import { ChartReply } from './ChartReply';

const PiePlot = lazy(() => import('./PiePlot'));
const colors = ['#4338ca', '#c2410c', '#0f766e', '#7e22ce', '#a16207', '#0369a1', '#be185d', '#475569'];

export function PieChart({ chart, onReply }: { chart: PieChartData; onReply?: (title: string) => void }) {
  const heading = useId();
  const total = chart.parts.reduce((sum, part) => sum + part.value, 0);
  const parts = chart.parts.map((part, index) => ({ ...part, color: colors[index % colors.length] }));
  const number = new Intl.NumberFormat(locale());
  const share = new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: 2 });
  const totalLabel = chart.unit === 'count' ? number.format(total) : share.format(total / 100);
  const href = safeHref(chart.url);

  return (
    <section aria-labelledby={heading} className="mt-8 rounded-2xl border border-line-strong bg-white p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={heading} className="text-xl font-medium leading-tight tracking-[-0.02em] text-ink sm:text-2xl">{chart.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('Share of the total')}</p>
        </div>
        <ChartReply title={chart.title} onReply={onReply} />
      </div>
      <div className="mt-4 grid items-center gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-6">
        <div className="relative h-[300px] min-w-0">
          <div aria-hidden="true">
            <Suspense fallback={null}><PiePlot parts={parts} /></Suspense>
          </div>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-sm text-ink-muted">{t('Total')}</span>
            <strong className={`tabular-nums text-ink ${totalLabel.length > 14 ? 'text-base' : 'text-xl sm:text-2xl'}`}>
              {totalLabel}
            </strong>
          </div>
        </div>
        <dl className="min-w-0 divide-y divide-line rounded-xl border border-line bg-zinc-50 px-3 sm:px-4">
          {parts.map(({ name, color, value }) => (
            <div key={name} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 py-3">
              <dt className="flex items-baseline gap-2 text-sm text-ink [overflow-wrap:anywhere]">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="min-w-0">{name}</span>
              </dt>
              <dd className="text-right text-sm font-medium tabular-nums text-ink">
                {share.format(value / (chart.unit === 'percent' ? 100 : total))}
                {chart.unit === 'count' && <span className="block text-xs font-normal text-ink-muted">{number.format(value)}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-4 border-t border-line pt-3 text-[13px] text-ink-muted">
        {t('This chart shows the breakdown reported by the source.')}{' '}
        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">{chart.publisher}</a> : chart.publisher}
      </p>
    </section>
  );
}
