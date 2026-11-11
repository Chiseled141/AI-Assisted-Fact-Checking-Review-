import { lazy, Suspense, useId } from 'react';
import { locale, t } from '../../../lib/i18n';
import type { CountryMapData } from '../../../types/models';
import type { ChosenCountry } from './CountryMap';

const CountryHeatmapPlot = lazy(() => import('./CountryHeatmapPlot'));

const yearLimit = 6;
const rowLimit = 6;

export default function CountryHeatmap({ map, chosen, title }: {
  map: CountryMapData;
  chosen: ChosenCountry[];
  title: string;
}) {
  const headingId = useId();
  const yearIndices = map.years.map((_, index) => index).filter((index) => map.years[index] <= map.year).slice(-yearLimit);
  const rows = chosen.filter(({ code }) => code !== 'world').map(({ code, label }) => ({
    code,
    label,
    values: yearIndices.map((index) => {
      const value = map.values[code]?.[index];
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }),
  })).filter(({ values }) => values.filter((value) => value !== null).length >= 2).slice(0, rowLimit);
  if (rows.length < 2) return null;

  const years = yearIndices.map((index) => String(map.years[index]));
  const heading = t('{indicator} heatmap by year', { indicator: title });
  const source = t('Figures from {source}', { source: map.source });
  const missing = t('No figure for this year');
  const currency = map.indicator === 'gdp' || map.indicator === 'gdp_per_capita';
  const numberOptions = currency ? { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' } as const : {};
  const compact = new Intl.NumberFormat(locale(), { ...numberOptions, notation: 'compact', maximumFractionDigits: 1 });
  const exact = new Intl.NumberFormat(locale(), { ...numberOptions, maximumFractionDigits: 2 });
  const formatValue = (value: number) => map.indicator === 'life_expectancy'
    ? t('{value} years', { value: exact.format(value) })
    : exact.format(value);

  return (
    <section aria-labelledby={headingId} className="mt-6 min-w-0 border-t border-line pt-5">
      <h3 id={headingId} className="text-base font-medium text-ink">{heading}</h3>
      <p className="mt-1 text-sm text-ink-muted">{source}{currency && ' · USD'}</p>
      <div className="mt-3 overflow-x-auto">
        <div style={{ minWidth: 116 + years.length * 68, minHeight: rows.length * 42 + 100 }}>
          <Suspense fallback={null}>
            <CountryHeatmapPlot {...{ rows, years, title, heading, source, missing, compact, formatValue }} />
          </Suspense>
        </div>
      </div>
      <details className="mt-1 text-sm text-ink-soft">
        <summary className="w-fit cursor-pointer rounded-sm py-2 font-medium hover:text-ink">{t('View heatmap figures')}</summary>
        <div className="overflow-x-auto">
          <table aria-labelledby={headingId} className="w-full border-collapse text-left tabular-nums">
            <thead>
              <tr className="border-b border-line">
                <td />
                {years.map((year) => <th key={year} scope="col" className="px-3 py-2 text-right font-medium">{year}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ code, label, values }) => (
                <tr key={code} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 font-medium">{label}</th>
                  {values.map((value, index) => (
                    <td key={years[index]} className="whitespace-nowrap px-3 py-2 text-right">
                      {value === null ? <abbr title={missing}>–</abbr> : formatValue(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
