import { ChartReply } from './ChartReply';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { CountryMapData } from '../../types/models';
import { formatCalendarDate, safeHref } from '../../lib/format';
import { locale, t, translated } from '../../lib/i18n';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { countryMap } from './chartSettings';

const CountryPlot = lazy(() => import('./CountryPlot'));
const CountryHistory = lazy(() => import('./CountryHistory'));

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
  const column = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery('(min-width: 1024px)');
  const [height, setHeight] = useState(mapHeight);

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
        <div className="flex items-start justify-between gap-3">
          <h2 id="country-map-heading" className="text-[24px] font-medium leading-[1.2] tracking-[-0.02em] text-ink">
            {title}
          </h2>
          <ChartReply title={title} onReply={onReply} />
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">
          {[...map.selected.map(({ named }) => named), String(map.year)].join(' · ')}
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
          {/* The height matches the map's, so nothing jumps when it loads. */}
          <div className="min-w-0" style={{ height }} aria-hidden="true">
            <Suspense fallback={null}>
              <CountryPlot
                map={map}
                height={height}
                onChoose={(countries) => setChosen(countries.length ? countries : worldOnly)}
              />
            </Suspense>
          </div>
          <div ref={column} className="min-w-0 self-start">
            <h3 className="text-[15px] font-medium leading-[1.3] text-ink">
              {t('Figures from {source}', { source: map.source })}
            </h3>
            <div className="mt-3 space-y-3">
              {chosen.map(({ code, label }, index) => {
                const own = valueAt(map, code, map.year);
                const rank = rankOf(map, code);
                return (
                  <div key={code} className="overflow-hidden rounded-xl border border-line-strong bg-white">
                    {/* The underline is this country's color on the map and in the history chart. */}
                    <h4
                      className="flex items-center gap-2 border-b-2 bg-page px-4 py-2.5 text-[13px] font-medium text-ink"
                      style={{ borderBottomColor: countryMap.compareColors[index % countryMap.compareColors.length] }}
                    >
                      {flagUrl(code) && (
                        // The name is right beside it, so screen readers skip it. If it fails to load, it just disappears.
                        <img
                          src={flagUrl(code)!}
                          alt=""
                          width={20}
                          height={15}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-[15px] w-5 rounded-[2px] object-cover ring-1 ring-line-strong"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                      {label}
                    </h4>
                    <dl className="divide-y divide-line">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 px-4 py-2.5">
                        <dt className="text-[13px] leading-[1.4] text-ink-soft">
                          {t('Figures for {year}', { year: own?.year ?? map.year })}
                        </dt>
                        <dd className="text-right text-[15px] font-medium leading-[1.3] text-ink">
                          {own ? formatExactStat(own.value, map.indicator) : '–'}
                        </dd>
                      </div>
                      {rank && (
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-5 px-4 py-2.5">
                          <dt className="text-[13px] leading-[1.4] text-ink-soft">
                            {t(states ? 'Rank among states' : 'Rank among countries')}
                          </dt>
                          <dd className="text-right text-[15px] font-medium leading-[1.3] text-ink">
                            {t('{rank} of {count}', { rank: rank.rank, count: rank.count })}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                );
              })}
            </div>
            <h3 className="mt-5 text-[15px] font-medium leading-[1.3] text-ink">{t('Over time')}</h3>
            <div className="mt-2" style={{ height: 250 }} aria-hidden="true">
              <Suspense fallback={null}>
                <CountryHistory map={map} chosen={chosen} />
              </Suspense>
            </div>
          </div>
        </div>
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
            : 'Click a country to add it to the comparison. National estimates can be revised. This map is context and did not decide the verdict.',
        )}
      </p>
    </section>
  );
}
