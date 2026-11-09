import { lazy, Suspense } from 'react';
import type { LocationMapData, MapDetail } from '../../types/models';
import { safeHref } from '../../lib/format';
import { t } from '../../lib/i18n';
import { ChartReply } from './ChartReply';

const LocationPlot = lazy(() => import('./LocationPlot'));

/** Rows for one place. Sources that give the same measure different values share a row, so the difference shows. */
function FigureRows({ rows }: { rows: MapDetail[] }) {
  const labels = [...new Set(rows.map(({ label }) => label))];
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-x-5 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] sm:gap-x-6">
      {labels.map((label) => {
        const values = rows.filter((row) => row.label === label);
        return (
          <div key={label} className="flex min-w-0 flex-col border-b border-line py-3.5 sm:py-4">
            <dt className="text-sm leading-snug text-ink-soft [overflow-wrap:anywhere]">{label}</dt>
            <dd className="mt-auto space-y-3 pt-2.5 [overflow-wrap:anywhere]">
              {values.map(({ place, value, publisher, url }) => {
                const href = safeHref(url);
                return (
                  <div key={`${value}-${publisher}`}>
                    <div className={`font-wordmark text-xl font-strong leading-tight tracking-tight tabular-nums sm:text-2xl ${place ? 'text-indigo-700' : 'text-orange-800'}`}>
                      {value}
                    </div>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative mt-1 inline-block max-w-full text-xs text-ink-muted underline decoration-line-strong underline-offset-2 after:absolute after:-inset-y-2 after:-inset-x-1 hover:text-ink"
                      >
                        {publisher}
                      </a>
                    ) : (
                      <span className="text-xs text-ink-muted">{publisher}</span>
                    )}
                  </div>
                );
              })}
              {values.length > 1 && (
                <span className="block text-xs font-medium text-orange-800">
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

/** Places named in a claim, with the map and its shapes loaded on demand. */
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
  const groups = [
    { key: 'event', title: t('Overall'), rows: details.filter(({ place }) => !place) },
    ...map.places.map(({ code, named }) => ({
      key: code,
      title: named,
      rows: details.filter(({ place }) => place === code),
    })),
  ].filter(({ rows }) => rows.length > 0);

  return (
    <section aria-labelledby="location-map-heading" className="mt-8">
      <div className="flex items-start justify-between gap-3">
        <h2 id="location-map-heading" className="text-xl font-medium leading-tight tracking-[-0.02em] text-ink sm:text-2xl">
          {title}
        </h2>
        <ChartReply title={title} onReply={onReply} />
      </div>
      <p className="mt-1.5 text-sm text-ink-soft">{places}</p>
      {canDrillDown && (
        <p className="mt-1 text-[13px] text-ink-muted">{t('Click a highlighted country to see the region the claim names.')}</p>
      )}
      <div className="mt-4 h-[360px] min-w-0 rounded-xl border border-line bg-zinc-50 sm:h-[460px] lg:h-[560px]" aria-hidden="true">
        <Suspense fallback={null}>
          <LocationPlot map={map} />
        </Suspense>
      </div>
      {groups.length > 0 && (
        <div className="mt-6 sm:mt-8">
          <h3 className="text-lg font-medium tracking-tight text-ink">{t('Figures from the sources')}</h3>
          <div className={`mt-4 grid gap-y-5 ${groups.length > 1 ? 'md:grid-cols-2 md:gap-x-8' : ''}`}>
            {groups.map(({ key, title, rows }) => (
              <div key={key} className="min-w-0">
                <h4 className="border-b border-line-strong pb-2 text-sm font-strong text-ink [overflow-wrap:anywhere]">{title}</h4>
                <FigureRows rows={rows} />
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[13px] leading-[1.5] text-ink-muted">
        {t('Shows the places the claim names. This map is context and did not decide the verdict.')}
        {map.map === 'vietnam' && ` ${t('Province borders are from before the 2025 mergers.')}`}
        {groups.length > 0 &&
          ` ${t('Each figure is copied from the article it links to. Reports can differ, and early counts can change.')}`}
      </p>
    </section>
  );
}
