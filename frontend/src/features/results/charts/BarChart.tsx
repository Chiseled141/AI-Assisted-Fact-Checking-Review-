import { lazy, Suspense, useId } from 'react';
import { safeHref } from '../../../lib/format';
import { t } from '../../../lib/i18n';
import type { BarChartData } from '../../../types/models';
import { ChartReply } from './ChartReply';

const BarPlot = lazy(() => import('./BarPlot'));

export function BarChart({ chart, onReply }: { chart: BarChartData; onReply?: (title: string) => void }) {
  const heading = useId();
  const href = safeHref(chart.url);
  const points = [...chart.points].sort((left, right) => right.value - left.value);
  const height = Math.max(240, points.length * 36 + 104);
  const source = t('Figures from {source}', { source: chart.publisher });
  const unit = t(chart.unit);

  return (
    <section aria-labelledby={heading} className="mt-8 rounded-2xl border border-line-strong bg-white p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={heading} className="text-xl font-medium leading-tight tracking-[-0.02em] text-ink sm:text-2xl">{chart.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">{source}</a> : source}
          </p>
        </div>
        <ChartReply title={chart.title} onReply={onReply} />
      </div>
      <div className="mt-4 min-w-0" style={{ minHeight: height }}>
        <Suspense fallback={null}>
          <BarPlot points={points} unit={unit} height={height} title={chart.title} source={source} />
        </Suspense>
      </div>
    </section>
  );
}
