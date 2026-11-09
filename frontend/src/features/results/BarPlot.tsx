import Highcharts from 'highcharts/esm/highcharts.js';
import 'highcharts/esm/modules/exporting.js';
import 'highcharts/esm/modules/accessibility.js';
import HighchartsReact from 'highcharts-react-official';
import { locale } from '../../lib/i18n';
import { useMediaQuery } from '../../lib/useMediaQuery';
import type { BarChartData } from '../../types/models';
import { barChart } from './chartSettings';

interface Props {
  points: BarChartData['points'];
  unit: string;
  height: number;
  title: string;
  source: string;
}

export default function BarPlot({ points, unit, height, title, source }: Props) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const compact = new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 2 });
  const exact = new Intl.NumberFormat(locale(), { maximumSignificantDigits: 16 });
  const options: Highcharts.Options = {
    chart: { type: 'bar', height, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: undefined },
    credits: { enabled: false },
    legend: { enabled: false },
    accessibility: { description: `${title} (${unit})` },
    xAxis: {
      categories: points.map(({ name }) => name),
      gridLineWidth: 1,
      lineWidth: 0,
      labels: { style: { textOverflow: 'ellipsis', fontSize: '12px' } },
    },
    yAxis: {
      min: points.every(({ value }) => value >= 0) ? 0 : undefined,
      max: points.every(({ value }) => value <= 0) ? 0 : undefined,
      title: { text: unit },
      gridLineWidth: 0,
      labels: { formatter() { return compact.format(Number(this.value)); } },
    },
    tooltip: {
      headerFormat: '<b>{point.key}</b><br/>',
      pointFormatter() { return typeof this.y === 'number' ? exact.format(this.y) : ''; },
    },
    plotOptions: {
      bar: {
        borderRadius: '50%',
        groupPadding: 0.1,
        maxPointWidth: 30,
        animation: reduceMotion ? false : { duration: 300 },
        dataLabels: {
          enabled: true,
          inside: false,
          formatter() { return typeof this.y === 'number' ? compact.format(this.y) : undefined; },
        },
      },
    },
    series: [{
      type: 'bar',
      name: unit,
      data: points.map(({ value }, index) => ({
        y: value,
        color: barChart.categoryColors[index % barChart.categoryColors.length],
      })),
    }],
    exporting: {
      local: true,
      fallbackToExportServer: false,
      buttons: { contextButton: { menuItems: ['downloadPNG', 'downloadSVG'] } },
      chartOptions: { title: { text: title }, subtitle: { text: source } },
    },
  };
  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
