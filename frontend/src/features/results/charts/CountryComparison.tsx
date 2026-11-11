import { useEffect, useState } from 'react';
import Highcharts from 'highcharts/highmaps';
import HighchartsReact from 'highcharts-react-official';
import { t } from '../../../lib/i18n';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import type { CountryMapData } from '../../../types/models';
import { countryMap } from './chartSettings';
import { formatExactStat, type ChosenCountry } from './CountryMap';

interface Props {
  map: CountryMapData;
  chosen: ChosenCountry[];
  onFocus: (country: ChosenCountry) => void;
}

let moduleReady: Promise<unknown> | undefined;

/** A radial comparison of the selected countries using figures from the same year. */
export default function CountryComparison({ map, chosen, onFocus }: Props) {
  const [ready, setReady] = useState(false);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const totals = map.indicator === 'population' || map.indicator === 'gdp';
  const yearIndex = map.years.lastIndexOf(map.year);
  const points = chosen.flatMap((country, index) => {
    const value = map.values[country.code]?.[yearIndex];
    if (country.code === 'world' || value == null || !Number.isFinite(value) || value <= 0) return [];
    return [{
      id: country.code,
      name: country.label,
      y: totals ? value : 1,
      z: totals ? 1 : value,
      color: countryMap.compareColors[index % countryMap.compareColors.length],
      custom: { value: formatExactStat(value, map.indicator) },
      events: { click: () => onFocus(country) },
    }];
  });
  const comparable = points.length >= 2;

  useEffect(() => {
    if (!comparable) return;
    let current = true;
    // The UMD module registers on the Highcharts instance used by the globe.
    (window as unknown as { _Highcharts: typeof Highcharts })._Highcharts = Highcharts;
    moduleReady ??= import('highcharts/modules/variable-pie');
    void moduleReady.then(() => {
      if (current) setReady(true);
    });
    return () => { current = false; };
  }, [comparable]);

  if (!comparable) return null;
  const options: Highcharts.Options = {
    accessibility: { enabled: false }, // CountryMap lists the figures and provides focus buttons.
    chart: { height: 200, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: undefined },
    credits: { enabled: false }, // The map carries the Highcharts credit.
    tooltip: { headerFormat: '', pointFormat: '<b>{point.name}</b><br/>{point.custom.value}' },
    series: [{
      type: 'variablepie',
      animation: reduceMotion ? false : { duration: 300 },
      innerSize: '36%',
      minPointSize: 0,
      sizeBy: 'radius',
      zMin: 0,
      zMax: Math.max(...points.map(({ z }) => z)),
      cursor: 'pointer',
      dataLabels: { enabled: false },
      data: points,
    }],
  };

  return (
    <div className="mt-3 text-center">
      <h3 className="text-[15px] font-medium text-ink">
        {t(totals ? 'Share among charted countries in {year}' : 'Comparison for {year}', { year: map.year })}
      </h3>
      {!totals && <p className="mt-1 text-sm text-ink-soft">{t('Longer slices show higher values.')}</p>}
      <div className="h-[200px]" aria-hidden="true">
        {ready && <HighchartsReact highcharts={Highcharts} options={options} />}
      </div>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-ink-soft">
        {points.map(({ id, name, color }) => (
          <li key={id} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
