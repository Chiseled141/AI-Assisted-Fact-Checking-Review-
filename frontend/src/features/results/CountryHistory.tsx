import Highcharts from 'highcharts/highmaps';
import HighchartsReact from 'highcharts-react-official';
import type { CountryMapData } from '../../types/models';
import { locale } from '../../lib/i18n';
import { countryMap } from './chartSettings';
import { formatExactStat, formatStat, type ChosenCountry } from './CountryMap';

const inkSoft = 'rgb(var(--ink-soft))';

/** Each chosen country's values over the years. Loaded on demand with the map. */
export default function CountryHistory({ map, chosen }: { map: CountryMapData; chosen: ChosenCountry[] }) {
  const options: Highcharts.Options = {
    accessibility: { enabled: false }, // CountryMap gives screen readers the same figures as text.
    chart: { type: 'line', height: 250, backgroundColor: 'transparent', spacing: [8, 0, 4, 0], style: { fontFamily: 'inherit' } },
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
      categories: map.years.map(String),
      tickInterval: 5,
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
      shared: true,
      backgroundColor: 'rgb(var(--surface))',
      borderColor: 'rgb(var(--line-strong))',
      borderRadius: 8,
      shadow: false,
      style: { color: inkSoft, fontSize: '13px' },
      formatter() {
        const rows = (this.points ?? []).map(
          (point) =>
            `<br/><span style="color:${String(point.color)}">●</span> ${point.series.name}: <b>${formatExactStat(point.y ?? 0, map.indicator)}</b>`,
        );
        return `${map.years[this.points?.[0]?.index ?? 0]}${rows.join('')}`;
      },
    },
    plotOptions: { line: { marker: { enabled: false }, lineWidth: 2 } },
    series: chosen.map(({ code, label }, index) => ({
      type: 'line' as const,
      name: label,
      color: countryMap.compareColors[index % countryMap.compareColors.length],
      data: map.values[code] ?? [],
    })),
  };

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
