import Highcharts from 'highcharts/highmaps';
import HighchartsReact from 'highcharts-react-official';
import { useMediaQuery } from '../../lib/useMediaQuery';

export default function PiePlot({ parts }: { parts: { name: string; value: number; color: string }[] }) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const phone = useMediaQuery('(max-width: 639px)');
  const options: Highcharts.Options = {
    accessibility: { enabled: false }, // PieChart exposes each category and its value as text.
    chart: { height: 300, spacing: [0, 0, 0, 0], backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: undefined },
    tooltip: { headerFormat: '', pointFormat: '<b>{point.name}</b><br/>{point.percentage:.1f}%' },
    plotOptions: {
      pie: {
        center: ['50%', '50%'],
        size: phone ? '86%' : '72%',
        innerSize: '75%',
        borderRadius: 8,
        dataLabels: [
          {
            enabled: !phone,
            distance: 14,
            filter: { property: 'percentage', operator: '>=', value: 5 },
            format: '{point.name}',
            style: { color: 'rgb(var(--ink-soft))', fontWeight: '400', textOutline: 'none' },
          },
          {
            enabled: true,
            distance: -14,
            filter: { property: 'percentage', operator: '>=', value: 8 },
            format: '{point.percentage:.0f}%',
            backgroundColor: 'rgba(17, 24, 39, 0.78)',
            borderRadius: 4,
            padding: 2,
            style: { color: '#fff', fontSize: '11px', textOutline: 'none' },
          },
        ],
      },
    },
    series: [{
      type: 'pie',
      animation: reduceMotion ? false : { duration: 300 },
      allowPointSelect: true,
      cursor: 'pointer',
      borderColor: '#fff',
      borderWidth: 2,
      data: parts.map(({ name, value, color }) => ({
        name,
        y: value,
        color: {
          radialGradient: { cx: 0.5, cy: 0.3, r: 0.7 },
          stops: [[0, color], [1, Highcharts.color(color).brighten(-0.2).get() as string]],
        },
      })),
    }],
  };
  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
