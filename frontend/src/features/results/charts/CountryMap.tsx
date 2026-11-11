import { ChartReply } from './ChartReply';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Globe2, LocateFixed, Map as MapIcon } from 'lucide-react';
import type { CountryMapData } from '../../../types/models';
import { formatCalendarDate, safeHref } from '../../../lib/format';
import { locale, t, translated } from '../../../lib/i18n';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { countryMap } from './chartSettings';

const CountryPlot = lazy(() => import('./CountryPlot'));
const CountryHistory = lazy(() => import('./CountryHistory'));
const CountryComparison = lazy(() => import('./CountryComparison'));
const CountryHeatmap = lazy(() => import('./CountryHeatmap'));

const mapHeight = 460;
const licenceUrl = 'https://creativecommons.org/licenses/by/4.0/';

const indicatorTitle = translated<CountryMapData['indicator']>({
  population: 'Population',
  gdp: 'GDP',
  gdp_per_capita: 'GDP per person',
  life_expectancy: 'Life expectancy',
});

// The map's codes for these two don't match a flag, and they share the Palestinian one.
const flagCodes: Record<string, string> = { gz: 'ps', we: 'ps' };
// No flag to show: the world as a whole, and Washington DC, which the flag service doesn't have.
const noFlag = new Set(['world', 'us-dc']);

/** Only places with statistics reach this, which leaves out the map's disputed areas, whose codes match the wrong flags. */
export function flagUrl(code: string): string | null {
  return noFlag.has(code) ? null : `https://flagcdn.com/w40/${flagCodes[code] ?? code}.png`;
}

export interface ChosenCountry {
  code: string;
  label: string;
}

export function formatStat(value: number, indicator: CountryMapData['indicator']): string {
  if (indicator === 'life_expectancy') {
    return t('{value} years', { value: new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(value) });
  }
  const money = indicator === 'population' ? {} : ({ style: 'currency', currency: 'USD' } as const);
  const compact = indicator === 'gdp_per_capita' ? {} : ({ notation: 'compact', compactDisplay: 'long' } as const);
  return new Intl.NumberFormat(locale(), {
    maximumFractionDigits: indicator === 'gdp_per_capita' ? 0 : 1,
    ...money,
    ...compact,
  }).format(value);
}

/** The figure in full, because a fact-check can turn on a difference that rounding would hide. */
export function formatExactStat(value: number, indicator: CountryMapData['indicator']): string {
  if (indicator === 'population') return new Intl.NumberFormat(locale()).format(value);
  if (indicator === 'gdp') {
    return new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      compactDisplay: 'long',
      maximumFractionDigits: 2,
    }).format(value);
  }
  return formatStat(value, indicator);
}

/** The latest value at or before a year, with the year it comes from. */
export function valueAt(map: CountryMapData, code: string, year: number): { value: number; year: number } | null {
  const values = map.values[code] ?? [];
  for (let index = map.years.lastIndexOf(year); index >= 0; index -= 1) {
    const value = values[index];
    if (value !== null && value !== undefined) return { value, year: map.years[index] };
  }
  return null;
}

function rankOf(map: CountryMapData, code: string): { rank: number; count: number } | null {
  const own = valueAt(map, code, map.year);
  if (!own || code === 'world') return null;
  const others = Object.keys(map.values)
    .filter((key) => key !== 'world')
    .map((key) => valueAt(map, key, map.year)?.value)
    .filter((value): value is number => value !== undefined);
  return { rank: others.filter((value) => value > own.value).length + 1, count: others.length };
}

/**
 * A national statistic across the world, with the claim's countries highlighted, their figures, and their history.
 * Claims without `countryMap` never reach this, so Highcharts Maps and the map shapes only load when needed.
 */
export function CountryMap({ map, onReply }: { map: CountryMapData; onReply?: (title: string) => void }) {
  const title = indicatorTitle[map.indicator];
  const states = map.scope === 'us-states';
  const worldOnly: ChosenCountry[] = states ? [] : [{ code: 'world', label: t('World') }];
  const fromClaim = map.selected.map(({ code, named }) => ({ code, label: named }));
  const [chosen, setChosen] = useState<ChosenCountry[]>(fromClaim.length ? fromClaim : worldOnly);
  const [globe, setGlobe] = useState(!states && fromClaim.length > 1);
  const [focus, setFocus] = useState<ChosenCountry | null>(null);
  const focusCountry = (country: ChosenCountry) => setFocus({ ...country });
  const column = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery('(min-width: 1024px)');
  const [height, setHeight] = useState(mapHeight);
  const globeHeight = wide ? 420 : 360;
  const plotHeight = globe ? globeHeight : height;

  // On a wide screen the map stands beside the figures, so it takes the height of their column to line up with it.
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
  }, [wide]);

  const licence = safeHref(licenceUrl);

  return (
    <section aria-labelledby="country-map-heading" className="mt-8">
      {/* A white panel, the same as the other charts'. */}
      <div className="rounded-2xl border border-ink bg-white p-4 sm:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div>
            <h2 id="country-map-heading" className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-ink">
              {title}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {[...map.selected.map(({ named }) => named), String(map.year)].join(' · ')}
            </p>
          </div>
          {!states && (
            <div
              role="group"
              aria-label={t('Map view')}
              className="col-span-2 col-start-1 row-start-2 flex justify-self-start rounded-lg border border-line bg-page p-0.5 sm:col-span-1 sm:col-start-2 sm:row-start-1"
            >
              {[
                { isGlobe: false, label: 'Flat map', Icon: MapIcon },
                { isGlobe: true, label: 'Globe', Icon: Globe2 },
              ].map(({ isGlobe, label, Icon }) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={globe === isGlobe}
                  onClick={() => setGlobe(isGlobe)}
                  className="relative inline-flex min-h-8 items-center gap-1 rounded-md border border-transparent px-2 text-xs font-medium text-ink-muted after:absolute after:inset-x-0 after:-inset-y-1.5 hover:text-ink aria-pressed:border-line-strong aria-pressed:bg-white aria-pressed:text-ink"
                >
                  <Icon size={14} aria-hidden="true" />
                  {t(label)}
                </button>
              ))}
            </div>
          )}
          {onReply && (
            <div className="col-start-2 row-start-1 sm:col-start-3">
              <ChartReply title={title} onReply={onReply} />
            </div>
          )}
        </div>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(300px,3fr)]">
          <div className="min-w-0">
            {/* Reserve space while Highcharts and the map shapes load. */}
            <div style={{ height: plotHeight }} aria-hidden="true">
              <Suspense fallback={null}>
                <CountryPlot
                  map={map}
                  height={plotHeight}
                  globe={globe}
                  focus={focus}
                  onChoose={(countries) => setChosen(countries.length ? countries : worldOnly)}
                />
              </Suspense>
            </div>
            {globe && (
              <Suspense fallback={null}>
                <CountryComparison map={map} chosen={chosen} onFocus={focusCountry} />
              </Suspense>
            )}
          </div>
          <div ref={column} className="min-w-0 self-start">
            <h3 className="text-sm font-medium text-ink-muted">
              {t('Figures from {source}', { source: map.source })}
            </h3>
            <div className="mt-2 divide-y divide-line rounded-xl border border-line bg-page empty:hidden">
              {chosen.map(({ code, label }, index) => {
                const own = valueAt(map, code, map.year);
                const rank = rankOf(map, code);
                const flag = flagUrl(code);
                const identity = (
                  <span className="flex min-w-0 items-center gap-2">
                    {flag && (
                      <img
                        src={flag}
                        alt=""
                        width={20}
                        height={15}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-[15px] w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-line-strong"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <span className="min-w-0 break-words">{label}</span>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: countryMap.compareColors[index % countryMap.compareColors.length] }}
                      aria-hidden="true"
                    />
                  </span>
                );
                return (
                  <div key={code} className="px-4 py-3">
                    <h4 className="text-[15px] font-medium leading-snug text-ink">
                      {globe && code !== 'world' ? (
                        <button
                          type="button"
                          className="-my-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left hover:text-brand-600"
                          onClick={() => focusCountry({ code, label })}
                          aria-label={t('Show {country} on the globe', { country: label })}
                        >
                          {identity}
                          <LocateFixed size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
                        </button>
                      ) : identity}
                    </h4>
                    <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,36%)] items-end gap-3">
                      <div className="col-span-2 flex min-w-0 flex-col-reverse gap-1 data-[ranked=true]:col-span-1" data-ranked={Boolean(rank)}>
                        <dt className="text-xs leading-snug text-ink-muted">
                          {t('Figures for {year}', { year: own?.year ?? map.year })}
                        </dt>
                        <dd className="break-words text-xl font-strong leading-none tracking-[-0.03em] text-ink tabular-nums min-[360px]:text-2xl sm:text-[28px]">
                          {own ? formatExactStat(own.value, map.indicator) : '–'}
                        </dd>
                      </div>
                      {rank && (
                        <div className="flex min-w-0 flex-col-reverse gap-1 text-right">
                          <dt className="text-xs leading-snug text-ink-muted">
                            <span className="sr-only sm:not-sr-only">{t(states ? 'Rank among states' : 'Rank among countries')}</span>
                            <span className="sm:hidden" aria-hidden="true">{t('Rank')}</span>
                          </dt>
                          <dd className="text-base font-medium leading-none text-ink tabular-nums">
                            {t('{rank} of {count}', { rank: rank.rank, count: rank.count })}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                );
              })}
            </div>
            <h3 className="mt-6 text-base font-medium leading-snug text-ink">
              {t(map.indicator === 'population' ? 'Population over time' : 'Over time')}
            </h3>
            {!states && (
              <p className="mt-1 text-sm text-ink-soft">{t('Select countries on the map to compare their trends.')}</p>
            )}
            <div className="mt-2" style={{ height: 250 }} aria-hidden="true">
              <Suspense fallback={null}>
                <CountryHistory map={map} chosen={chosen} />
              </Suspense>
            </div>
          </div>
        </div>
        {chosen.filter(({ code }) => code !== 'world').length >= 2 && (
          <Suspense fallback={null}>
            <CountryHeatmap map={map} chosen={chosen} title={title} />
          </Suspense>
        )}
      </div>
      <p className="mt-3 text-[13px] leading-[1.5] text-ink-muted">
        {t('Data from {source}, retrieved {date}.', {
          source: map.source,
          date: formatCalendarDate(map.retrievedAt.slice(0, 10)),
        })}{' '}
        {licence && (
          <a
            href={licence}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-line-strong underline-offset-2"
          >
            CC BY 4.0
          </a>
        )}
        {'. '}
        {t(
          states
            ? 'Click a state to add it to the comparison. These are 5-year estimates, so they lag the latest yearly figures. This map is context and did not decide the verdict.'
            : 'National estimates can be revised. This map is context and did not decide the verdict.',
        )}
      </p>
    </section>
  );
}
