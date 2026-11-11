import Highcharts from 'highcharts/esm/highcharts.js';
import 'highcharts/esm/modules/heatmap.js';
import 'highcharts/esm/modules/accessibility.js';
import HighchartsReact from 'highcharts-react-official';

type Row = { label: string; values: (number | null)[] };

export default function CountryHeatmapPlot({ rows, years, title, heading, source, missing, compact, formatValue }: {
  rows: Row[];
  years: string[];
  title: string;
  heading: string;
  source: string;
  missing: string;
  compact: Intl.NumberFormat;
  formatValue: (value: number) => string;
}) {
  const options: Highcharts.Options = {
    chart: { height: rows.length * 42 + 100, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: undefined },
    credits: { enabled: false },
    accessibility: {
      description: `${heading}. ${source}.`,
      point: { descriptionFormatter(point) {
        return `${rows[point.y ?? -1]?.label}, ${years[point.x]}, ${point.value == null ? missing : formatValue(point.value)}`;
      } },
    },
    xAxis: { categories: years, opposite: true, lineWidth: 0, tickLength: 0 },
    yAxis: {
      categories: rows.map(({ label }) => label),
      reversed: true,
      title: { text: undefined },
      gridLineWidth: 0,
      labels: { style: { width: 112, textOverflow: 'ellipsis' } },
    },
    colorAxis: {
      minColor: '#ecfdf5',
      maxColor: '#065f46',
      startOnTick: false,
      endOnTick: false,
      labels: { formatter() { return compact.format(Number(this.value)); } },
    },
    legend: { symbolWidth: 172, symbolHeight: 10, symbolRadius: 5, margin: 10 },
    tooltip: {
      formatter() {
        const name = rows[this.y ?? -1]?.label ?? '';
        const escapedName = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        return `${escapedName} · ${years[this.x]}<br/><b>${this.value == null ? missing : formatValue(this.value)}</b>`;
      },
    },
    series: [{
      type: 'heatmap',
      name: title,
      animation: false,
      borderColor: '#fff',
      borderWidth: 2,
      nullColor: '#f1f5f4',
      nullInteraction: true,
      data: rows.flatMap(({ values }, y) => values.map((value, x) => [x, y, value])),
      dataLabels: {
        enabled: true,
        nullFormat: '–',
        formatter() { return this.value == null ? '–' : compact.format(this.value); },
        style: { fontSize: '11px', pointerEvents: 'none' },
      },
    }],
  };

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
