import { lazy, Suspense, useId } from 'react';
import { safeHref } from '../../../lib/format';
import { locale, t } from '../../../lib/i18n';
import type { RouteMapData } from '../../../types/models';
import { ChartReply } from './ChartReply';

const RoutePlot = lazy(() => import('./RoutePlot'));
const height = 400;

export function RouteMap({ route, onReply }: { route: RouteMapData; onReply?: (title: string) => void }) {
  const heading = useId();
  const href = safeHref(route.url);
  const distance = new Intl.NumberFormat(locale(), {
    style: 'unit', unit: 'kilometer', maximumFractionDigits: 1,
  }).format(route.straightLineKm);
  return (
    <section aria-labelledby={heading} className="mt-8 rounded-2xl border border-line-strong bg-white p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={heading} className="text-xl font-medium leading-tight tracking-[-0.02em] text-ink sm:text-2xl">{route.title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('Drag to explore the map. The line connects the reported stops.')}</p>
        </div>
        <ChartReply title={route.title} onReply={onReply} />
      </div>
      <div className="mt-4 grid items-center gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0" style={{ minHeight: height }}>
          <Suspense fallback={null}><RoutePlot stops={route.stops} height={height} distanceKm={route.straightLineKm} /></Suspense>
        </div>
        <div className="min-w-0 rounded-xl border border-line bg-page p-4">
          <ol className="space-y-3">
            {route.stops.map(({ name, schedule }, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-700 text-xs font-semibold text-white"
                  aria-hidden="true">{index + 1}</span>
                <div className="min-w-0 pt-0.5 [overflow-wrap:anywhere]">
                  <p className="font-medium text-ink">{name}</p>
                  {schedule && <p className="text-ink-muted">{schedule}</p>}
                </div>
              </li>
            ))}
          </ol>
          <dl className="mt-4 border-t border-line pt-3">
            <dt className="text-xs text-ink-muted">{t('Approximate straight-line distance through the listed stops')}</dt>
            <dd className="mt-1 text-xl font-semibold text-ink tabular-nums">{distance}</dd>
          </dl>
        </div>
      </div>
      <p className="mt-4 border-t border-line pt-3 text-[13px] text-ink-muted">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">
            {t('Figures from {source}', { source: route.publisher })}
          </a>
        ) : route.publisher}
        {' · '}{t('Stop locations from')}{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">
          © OpenStreetMap
        </a>
      </p>
    </section>
  );
}
