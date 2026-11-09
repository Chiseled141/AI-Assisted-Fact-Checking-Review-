import Highcharts from 'highcharts/highmaps';
import HighchartsReact from 'highcharts-react-official';
import type { CountryMapData } from '../../types/models';
import { locale } from '../../lib/i18n';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { countryMap } from './chartSettings';
import { formatExactStat, formatStat, type ChosenCountry } from './CountryMap';

const inkSoft = 'rgb(var(--ink-soft))';
const dashStyles = ['Solid', 'ShortDash', 'ShortDot', 'Dash', 'DashDot'] as const;

/** Each chosen country's values over the years. Loaded on demand with the map. */
export default function CountryHistory({ map, chosen }: { map: CountryMapData; chosen: ChosenCountry[] }) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const single = chosen.length === 1;
  const options: Highcharts.Options = {
    accessibility: { enabled: false }, // CountryMap gives screen readers the same figures as text.
    chart: { height: 250, backgroundColor: 'transparent', spacing: [8, 0, 4, 0], style: { fontFamily: 'inherit' } },
    title: { text: undefined },
    credits: { enabled: false },
    legend: {
      enabled: true,
      align: 'left',
      margin: 8,
      padding: 0,
      symbolWidth: 16,
      itemStyle: { color: inkSoft, fontSize: '12px', fontWeight: 'normal' },
      itemHoverStyle: { color: 'rgb(var(--ink))' },
    },
    xAxis: {
      allowDecimals: false,
      tickPixelInterval: 65,
      lineColor: 'rgb(var(--line-strong))',
      crosshair: { color: 'rgba(18, 20, 22, 0.25)', width: 1 },
      labels: { style: { color: inkSoft, fontSize: '12px' } },
    },
    yAxis: {
      title: { text: undefined },
      opposite: true,
      gridLineColor: 'rgb(var(--line))',
      labels: {
        style: { color: inkSoft, fontSize: '12px' },
        formatter() {
          // Short, because the long form doesn't fit beside the chart.
          if (map.indicator === 'life_expectancy') return formatStat(Number(this.value), map.indicator);
          const money = map.indicator === 'population' ? {} : ({ style: 'currency', currency: 'USD' } as const);
          return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1, ...money }).format(
            Number(this.value),
          );
        },
      },
    },
    tooltip: {
      split: !single,
      backgroundColor: 'rgb(var(--surface))',
      borderColor: 'rgb(var(--line-strong))',
      borderRadius: 8,
      shadow: false,
      style: { color: inkSoft, fontSize: '13px' },
      headerFormat: '<b>{point.key}</b><br/>',
      pointFormatter() {
        if (typeof this.y !== 'number') return '';
        return `${this.series.name}: <b>${formatExactStat(this.y, map.indicator)}</b>`;
      },
    },
    plotOptions: {
      series: { animation: reduceMotion ? false : { duration: 300 }, lineWidth: 2, connectNulls: false },
      area: { fillOpacity: 0.18, threshold: map.indicator === 'life_expectancy' ? null : 0 },
    },
    series: chosen.map(({ code, label }, index) => {
      const values = map.values[code] ?? [];
      const data: [number, number | null][] = map.years.map((year, yearIndex) => [year, values[yearIndex] ?? null]);
      const series = {
        id: code,
        name: label,
        color: countryMap.compareColors[index % countryMap.compareColors.length],
        data,
        marker: { enabled: values.filter((value) => value != null).length === 1 },
      };
      return single
        ? { ...series, type: 'area' }
        : { ...series, type: 'line', dashStyle: dashStyles[index % dashStyles.length] };
    }),
  };

  return <HighchartsReact highcharts={Highcharts} options={options} updateArgs={[true, true, false]} />;
}
