import { ExternalLink, MapPin, Newspaper, Quote } from 'lucide-react';
import { lazy, Suspense, useId } from 'react';
import { SourceLogo } from '../../components/SourceLogo';
import { safeHref } from '../../lib/format';
import { locale, t } from '../../lib/i18n';
import { findSource } from '../../lib/sources';
import type { IncidentMapData } from '../../types/models';
import { ChartReply } from './ChartReply';
import { incidentAreaColors } from './incidentRoads';

const IncidentPlot = lazy(() => import('./IncidentPlot'));
const actionClass = 'inline-flex min-h-11 w-fit max-w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';

export function IncidentMap({ map, onReply }: { map: IncidentMapData; onReply?: (title: string) => void }) {
  const heading = useId();
  const title = t('Incident location');
  const areas = map.areas ?? [];
  const place = [new Intl.ListFormat(locale()).format(areas.length ? areas.map(({ name }) => name) : map.roads),
    map.district, map.city].filter(Boolean).join(', ');
  const query = map.position ? [map.position[1], map.position[0]].join(',') : areas.length > 1 && map.bounds
    ? [(map.bounds[1] + map.bounds[3]) / 2, (map.bounds[0] + map.bounds[2]) / 2].join(',') : place;
  const externalMap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const source = safeHref(map.url);
  const publisher = source ? findSource(source) : null;

  return (
    <section aria-labelledby={heading} className="mt-8 rounded-2xl border border-line-strong bg-white p-4 sm:p-6">
      <header className="flex items-start gap-3 rounded-xl bg-indigo-50/70 p-3 sm:gap-4 sm:p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
          <MapPin size={21} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={heading} className="text-[20px] font-medium leading-tight tracking-[-0.02em] text-ink sm:text-[24px]">{title}</h2>
          <p className="mt-1 text-sm font-medium text-indigo-900 first-letter:uppercase">{place}</p>
          <p className="mt-1 text-[13px] text-ink-soft">
            {t(areas.length ? 'Reported areas' : map.position ? 'Junction reported by the source' : 'Approximate location along the road')}
          </p>
        </div>
        <ChartReply title={title} onReply={onReply} />
      </header>
      <div className="relative mt-4 h-72 overflow-hidden rounded-xl border border-line-strong bg-slate-50 sm:h-96">
        <Suspense fallback={<p role="status" className="p-4 text-ink-muted">{t('Loading map')}</p>}>
          <IncidentPlot map={map} place={place} />
        </Suspense>
      </div>
      {areas.length > 0 && (
        <ul aria-label={t('Map legend')} className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
          {areas.map((area, index) => (
            <li key={index} className="flex min-w-0 items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2 text-ink">
              <span
                aria-hidden="true"
                className={`h-3.5 w-3.5 shrink-0 rounded border-2 ${area.geometry ? '' : 'border-dashed'}`}
                style={{ borderColor: incidentAreaColors[index], backgroundColor: `${incidentAreaColors[index]}24` }}
              />
              <span className="min-w-0 break-words">
                {area.name}
                {!area.geometry && <span className="ml-2 text-xs text-ink-muted">{t('Approximate extent')}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <figure className="mt-3 rounded-xl bg-slate-50 px-3 py-3.5 sm:px-4">
        <div className="flex items-start gap-2.5">
          <Quote size={17} className="mt-0.5 shrink-0 text-indigo-600" aria-hidden="true" />
          <blockquote className="min-w-0 break-words leading-relaxed text-ink-soft">{map.quote}</blockquote>
        </div>
        <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {source ? (
            <a href={source} target="_blank" rel="noopener noreferrer" className={`${actionClass} border border-line-strong bg-white text-ink hover:bg-indigo-50`}>
              {publisher ? <SourceLogo source={publisher} decorative /> : <Newspaper size={15} className="shrink-0" aria-hidden="true" />}
              <span className="min-w-0 break-words">{map.publisher}</span>
              <ExternalLink size={13} className="shrink-0" aria-hidden="true" />
            </a>
          ) : <span className="text-[13px] text-ink-muted">{map.publisher}</span>}
          <a href={externalMap} target="_blank" rel="noopener noreferrer" className={`${actionClass} bg-indigo-100 text-indigo-900 hover:bg-indigo-200`}>
            {t('Open in Google Maps')} <ExternalLink size={13} className="shrink-0" aria-hidden="true" />
          </a>
        </figcaption>
      </figure>
    </section>
  );
}
