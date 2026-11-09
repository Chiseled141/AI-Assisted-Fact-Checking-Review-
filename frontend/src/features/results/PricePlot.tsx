import Highcharts from 'highcharts/highstock';
import HighchartsReact from 'highcharts-react-official';
import type { PriceChartData } from '../../types/models';
import { locale, t } from '../../lib/i18n';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { priceChart } from './chartSettings';
import { assetColor, formatPrice, priceTitle } from './PriceChart';

const inkSoft = 'rgb(var(--ink-soft))';
const indigo = '#4338ca';
const orange = '#c2410c';
const gridLine = 'rgb(var(--line))';
const axisLine = 'rgb(var(--line-strong))';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

const tooltipDate = (ms: number) => new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(ms);

/** The price line with flags on the claim's dates, as a Highcharts Stock chart. Loaded on demand, because it is large. */
export default function PricePlot({ chart }: { chart: PriceChartData }) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const title = priceTitle[chart.asset];
  // The article's words reach the tooltip as HTML, so they are escaped.
  const flags = chart.events.map((event) => ({
    x: Date.parse(event.date),
    title: escapeHtml(event.title),
    text: escapeHtml(event.text),
  }));
  // News reports are single prices, so each shows as a dot, and the dashes between them are not data.
  const sparse = Boolean(chart.reports);
  const reportBy = new Map(chart.reports?.map((report) => [Date.parse(report.date), escapeHtml(report.publisher)]));
  Highcharts.setOptions({ lang: { locale: locale(), rangeSelectorZoom: '' } });

  const options: Highcharts.Options = {
    accessibility: { enabled: false }, // PriceChart hides this from screen readers and gives them the facts as text.
    chart: { height: priceChart.height, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: undefined },
    rangeSelector: {
      enabled: !sparse, // A few reports span too little for these buttons to do anything.
      // The saved prices already start shortly before the claim's dates, so the whole range shows them.
      selected: 4,
      inputEnabled: false,
      buttons: [
        { type: 'month', count: 3, text: t('3m') },
        { type: 'month', count: 6, text: t('6m') },
        { type: 'ytd', text: t('YTD') },
        { type: 'year', count: 1, text: t('1y') },
        { type: 'all', text: t('All') },
      ],
      buttonTheme: {
        width: 56,
        r: 6,
        fill: 'none',
        style: { color: inkSoft, fontWeight: 'normal' },
        states: {
          hover: { fill: gridLine },
          select: { fill: 'rgba(67, 56, 202, 0.1)', style: { color: indigo, fontWeight: '500' } },
        },
      },
    },
    scrollbar: { enabled: false },
    navigator: {
      height: 36,
      outlineColor: axisLine,
      maskFill: 'rgba(67, 56, 202, 0.08)',
      series: { color: assetColor[chart.asset], lineWidth: 1 },
    },
    xAxis: {
      overscroll: 2678400000, // 1 month
      ordinal: false, // Real spacing, so a long gap between news reports looks like one.
      lineColor: axisLine,
      labels: { style: { color: inkSoft, fontSize: '12px' } },
    },
    yAxis: {
      gridLineColor: gridLine,
      labels: {
        align: 'left',
        x: 8,
        y: 4,
        style: { color: inkSoft, fontSize: '12px' },
        formatter() {
          // SJC figures run to nine digits, too wide for a phone unless shortened. Shortening the exchange rate would make its ticks identical.
          const compact = chart.asset === 'sjc_gold' ? ({ notation: 'compact' } as const) : {};
          return new Intl.NumberFormat(locale(), {
            style: 'currency',
            currency: chart.currency,
            maximumFractionDigits: 0,
            ...compact,
          }).format(Number(this.value));
        },
      },
    },
    tooltip: {
      split: false,
      shared: false,
      useHTML: true,
      backgroundColor: 'rgb(var(--surface))',
      borderColor: 'rgb(var(--line-strong))',
      borderRadius: 8,
      shadow: false,
      style: { color: inkSoft, fontSize: '13px' },
      formatter() {
        const point = this as unknown as { x: number; y?: number; title?: string; text?: string };
        const date = tooltipDate(point.x);
        return this.series.type === 'flags'
          ? `<div style="max-width:240px;white-space:normal"><b>${point.title}</b><div style="margin-top:2px">${date}</div><div style="margin-top:4px">${point.text}</div></div>`
          : `<div>${date}</div><b>${formatPrice(point.y ?? 0, chart.currency)}</b>${
              reportBy.has(point.x) ? `<div style="margin-top:2px">${reportBy.get(point.x)}</div>` : ''
            }`;
      },
    },
    plotOptions: { series: { animation: reduceMotion ? false : { duration: 450 } } },
    series: [
      {
        type: 'line',
        id: 'prices',
        name: title,
        color: assetColor[chart.asset],
        lineWidth: 2,
        ...(sparse ? { dashStyle: 'ShortDash' as const, marker: { enabled: true, radius: 4 } } : {}),
        data: chart.prices,
        // Averaging days together would flatten the very peaks a claim can be about.
        dataGrouping: { enabled: false },
      },
      ...(flags.length
        ? [
            {
              type: 'flags' as const,
              name: title,
              onSeries: 'prices',
              shape: 'squarepin' as const,
              color: orange,
              fillColor: 'rgb(var(--surface))',
              style: { color: orange, fontWeight: '500' },
              showInNavigator: true,
              data: flags,
            },
          ]
        : []),
    ],
  };

  return <HighchartsReact highcharts={Highcharts} constructorType="stockChart" options={options} />;
}
