import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import type { PopulationPyramidData } from '../../types/models';
import { locale, t } from '../../lib/i18n';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { populationPyramid } from './chartSettings';

const inkSoft = 'rgb(var(--ink-soft))';
const gridLine = 'rgb(var(--line))';
const axisLine = 'rgb(var(--line-strong))';
const labelStyle = { color: inkSoft, fontSize: '12px' };

const ages = [
  '0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44',
  '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80+',
];

/** Men to the left and women to the right, each band as a share of the whole population. Loaded on demand. */
export default function PyramidPlot({ chart }: { chart: PopulationPyramidData }) {
  const phone = useMediaQuery('(max-width: 639px)');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const total = [...chart.men, ...chart.women].reduce((sum, value) => sum + value, 0);
  const share = (people: number) => (people / total) * 100;
  const widest = Math.ceil(Math.max(...[...chart.men, ...chart.women].map(share)));
  const percent = (value: number, digits: number) =>
    `${new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(Math.abs(value))}%`;
  const ageAxis = {
    categories: ages,
    reversed: false,
    lineColor: axisLine,
    tickLength: 0,
    labels: { step: 1, style: labelStyle },
  };

  const options: Highcharts.Options = {
    accessibility: { enabled: false }, // PopulationPyramid gives the shares as text.
    chart: { type: 'bar', height: populationPyramid.height, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: undefined },
    // The second age axis would take too much of a phone's width.
    xAxis: phone ? [ageAxis] : [ageAxis, { ...ageAxis, opposite: true, linkedTo: 0 }],
    yAxis: {
      title: { text: '' },
      // The same reach on both sides, so the center line is the middle of the chart.
      min: -widest,
      max: widest,
      gridLineColor: gridLine,
      labels: {
        style: labelStyle,
        formatter() {
          return percent(Number(this.value), 0);
        },
      },
    },
    legend: { itemStyle: { color: inkSoft, fontWeight: 'normal' } },
    tooltip: {
      backgroundColor: 'rgb(var(--surface))',
      borderColor: 'rgb(var(--line-strong))',
      borderRadius: 8,
      shadow: false,
      style: { color: inkSoft, fontSize: '13px' },
      formatter() {
        return `<b>${this.series.name}, ${this.x}</b><br/>${percent(this.y ?? 0, 2)}`;
      },
    },
    plotOptions: {
      bar: { stacking: 'normal', borderRadius: '50%', borderWidth: 0, groupPadding: 0.08, pointPadding: 0.04 },
      series: { animation: reduceMotion ? false : { duration: 450 } },
    },
    series: [
      { type: 'bar', name: t('Men'), color: populationPyramid.menColor, data: chart.men.map((people) => -share(people)) },
      { type: 'bar', name: t('Women'), color: populationPyramid.womenColor, data: chart.women.map(share) },
    ],
  };

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
