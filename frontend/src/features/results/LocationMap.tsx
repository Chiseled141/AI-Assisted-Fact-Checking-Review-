import { ChartReply } from './ChartReply';
import { lazy, Suspense, useEffect, useRef, useState, type RefObject } from 'react';
import type { LocationMapData, MapDetail } from '../../types/models';
import { safeHref } from '../../lib/format';
import { t } from '../../lib/i18n';
import { useMediaQuery } from '../../lib/useMediaQuery';

const LocationPlot = lazy(() => import('./LocationPlot'));

const mapHeight = 440;

/** On a wide screen the map stands beside the figures, so it takes the height of their column to line up with it. */
function useColumnHeight(column: RefObject<HTMLDivElement>): number {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [height, setHeight] = useState(mapHeight);

  useEffect(() => {
    const element = column.current;
    if (!wide || !element || typeof ResizeObserver === 'undefined') {
      setHeight(mapHeight);
      return;
    }
    const measure = () => setHeight(Math.max(mapHeight, element.offsetHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [column, wide]);

  return height;
}

/**
 * The places a claim names, highlighted on a map. Claims without `locationMap` never reach this,
 * so Highcharts Maps and the map shapes only load when there is a map to show.
 */
/** Rows for one place. Sources that give the same measure different values share a row, so the difference shows. */
function FigureRows({ rows }: { rows: MapDetail[] }) {
  const labels = [...new Set(rows.map(({ label }) => label))];
  return (
    <dl className="divide-y divide-line">
      {labels.map((label) => {
        const values = rows.filter((row) => row.label === label);
        return (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 px-4 py-2.5">
            <dt className="text-[13px] leading-[1.4] text-ink-soft">{label}</dt>
            <dd className="space-y-2 text-right">
              {values.map(({ value, publisher, url }) => {
                const href = safeHref(url);
                return (
                  <div key={`${value}-${publisher}`}>
                    <div className="text-[15px] font-medium leading-[1.3] text-ink">{value}</div>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative text-xs text-ink-muted underline decoration-line-strong underline-offset-2 after:absolute after:-inset-1.5 hover:text-ink"
                      >
                        {publisher}
                      </a>
                    ) : (
                      <span className="text-xs text-ink-muted">{publisher}</span>
                    )}
                  </div>
                );
              })}
              {/* Under the values, because a long value would run into it beside the label. */}
              {values.length > 1 && (
                <span className="ml-auto block w-fit whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">
                  {t('Sources differ')}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function LocationMap({ map, onReply }: { map: LocationMapData; onReply?: (title: string) => void }) {
  const title = t('Places in this claim');
  const places = map.places
    .map(({ name, named, regions }) => {
      if (regions?.length) return `${regions.map((region) => region.name).join(', ')}, ${name}`;
      return name === named ? named : `${named} (${name})`;
    })
    .join(' · ');
  // A single country opens on its region by itself, so only a map of several needs telling.
  const canDrillDown = map.places.length > 1 && map.places.some(({ regions }) => regions?.length);
  const details = map.details ?? [];
  const column = useRef<HTMLDivElement>(null);
  const height = useColumnHeight(column);
  const groups = [
    { key: 'event', title: t('Overall'), onMap: false, rows: details.filter(({ place }) => !place) },
    ...map.places.map(({ code, named }) => ({
      key: code,
      title: named,
      onMap: true,
      rows: details.filter(({ place }) => place === code),
    })),
  ].filter(({ rows }) => rows.length > 0);

  return (
    <section aria-labelledby="location-map-heading" className="mt-8">
      {/* A white panel, the same as the price chart's. */}
      <div className="rounded-2xl border border-ink bg-white p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="location-map-heading" className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-ink">
            {title}
          </h2>
          <ChartReply title={title} onReply={onReply} />
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">{places}</p>
        {canDrillDown && (
          <p className="mt-1 text-[13px] text-ink-muted">{t('Click a highlighted country to see the region the claim names.')}</p>
        )}
        <div className={groups.length > 0 ? 'mt-4 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8' : 'mt-3'}>
          {/* The height matches the map's, so nothing jumps when it loads. */}
          <div className="min-w-0" style={{ height }} aria-hidden="true">
            <Suspense fallback={null}>
              <LocationPlot map={map} height={height} />
            </Suspense>
          </div>
          {groups.length > 0 && (
            <div ref={column} className="min-w-0 self-start">
              <h3 className="text-[15px] font-medium leading-[1.3] text-ink">{t('Figures from the sources')}</h3>
              <div className="mt-3 space-y-3">
                {groups.map(({ key, title, onMap, rows }) => (
                  <div key={key} className="overflow-hidden rounded-xl border border-line-strong bg-white">
                    {/* Indigo is the place's color on the map. Orange marks what isn't tied to one place. */}
                    <h4
                      className={`flex items-center gap-2 border-b px-4 py-2.5 text-[13px] font-medium ${
                        onMap
                          ? 'border-indigo-100 bg-indigo-50 text-indigo-900'
                          : 'border-orange-100 bg-orange-50 text-orange-900'
                      }`}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-[3px] ${onMap ? 'bg-indigo-700' : 'bg-orange-700'}`}
                        aria-hidden="true"
                      />
                      {title}
                    </h4>
                    <FigureRows rows={rows} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-[1.5] text-ink-muted">
        {t('Shows the places the claim names. This map is context and did not decide the verdict.')}
        {map.map === 'vietnam' && ` ${t('Province borders are from before the 2025 mergers.')}`}
        {groups.length > 0 &&
          ` ${t('Each figure is copied from the article it links to. Reports can differ, and early counts can change.')}`}
      </p>
    </section>
  );
}
