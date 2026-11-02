import Highcharts from 'highcharts';
import 'highcharts/highcharts-more';
import HighchartsReact from 'highcharts-react-official';
import { ratingCriteria, type SourceAnalysis } from '../../types/models';
import { criterionHint, criterionLabel, judgeColor, ratingChartHeight, type RatingChartKind } from './RatingChart';

type Notes = SourceAnalysis['judgeNotes'];

const inkSoft = 'rgb(var(--ink-soft))';
const categories = () => ratingCriteria.map((criterion) => criterionLabel[criterion]);
const rowLabels: Highcharts.XAxisLabelsOptions = {
  align: 'left',
  reserveSpace: true,
  style: { color: inkSoft, fontSize: '13px' },
};

function bars(notes: Notes): Highcharts.Options {
  return {
    chart: { type: 'bar', spacing: [0, 28, 18, 0] }, // The bottom leaves room for the Highcharts credit.
    xAxis: {
      categories: categories(),
      lineColor: 'rgb(var(--line-strong))',
      tickLength: 0,
      crosshair: { color: 'rgba(67, 56, 202, 0.07)' },
      labels: rowLabels,
    },
    yAxis: { min: 0, max: 100, title: { text: undefined }, labels: { enabled: false }, gridLineWidth: 0 },
    plotOptions: {
      bar: {
        pointWidth: 10,
        pointPadding: 0.05,
        groupPadding: 0.16,
        borderWidth: 0,
        borderRadius: { radius: 4, where: 'end' },
        states: { hover: { brightness: 0.08 }, inactive: { opacity: 0.2 } },
        dataLabels: {
          enabled: true,
          crop: false,
          overflow: 'allow',
          style: { color: inkSoft, fontSize: '12px', fontWeight: 'normal', textOutline: 'none' },
        },
      },
    },
    series: notes.map(({ judge, ratings }, index) => ({
      type: 'bar' as const,
      name: judge,
      color: judgeColor[index],
      data: ratings,
    })),
  };
}

/** The lower score's number sits left of its dot and the higher one's right, so they never collide. */
function scoreLabel(score: number, other: number, isFirst: boolean): Highcharts.DataLabelsOptions {
  if (score === other && !isFirst) return { enabled: false };
  return score < other ? { align: 'right', x: -11 } : { align: 'left', x: 11 };
}

/** A dot for each judge, joined by a line whose length is how far apart they are. */
function dumbbell(notes: Notes): Highcharts.Options {
  const [first, second] = notes;
  return {
    chart: { inverted: true, spacing: [0, 34, 18, 0] }, // Room for a score beside a dot at 100, and the credit.
    xAxis: { categories: categories(), lineWidth: 0, tickLength: 0, labels: rowLabels },
    yAxis: {
      min: 0,
      max: 100,
      tickInterval: 25,
      title: { text: undefined },
      gridLineColor: 'rgb(var(--line))',
      labels: { style: { color: 'rgb(var(--ink-muted))', fontSize: '12px' } },
    },
    series: [
      {
        type: 'columnrange',
        color: '#d0d4d8',
        pointWidth: 3,
        borderWidth: 0,
        enableMouseTracking: false,
        showInLegend: false,
        data: first.ratings.map((score, row) => [
          Math.min(score, second.ratings[row]),
          Math.max(score, second.ratings[row]),
        ]),
      },
      ...notes.map(({ judge, ratings }, index) => ({
        type: 'line' as const,
        name: judge,
        color: judgeColor[index],
        lineWidth: 0,
        states: { hover: { lineWidthPlus: 0 }, inactive: { opacity: 1 } },
        // Hiding one model would leave its line ending at nothing.
        events: { legendItemClick: (event: Highcharts.SeriesLegendItemClickEventObject) => event.preventDefault() },
        marker: { enabled: true, symbol: 'circle', radius: 6, lineWidth: 2, lineColor: '#ffffff' },
        dataLabels: {
          enabled: true,
          crop: false,
          overflow: 'allow' as const,
          verticalAlign: 'middle' as const,
          y: 0,
          style: { color: inkSoft, fontSize: '12px', fontWeight: 'normal', textOutline: 'none' },
        },
        data: ratings.map((score, row) => ({
          y: score,
          dataLabels: scoreLabel(score, notes[1 - index].ratings[row], index === 0),
          // On a tie the second dot lands on the first, so the first is drawn larger to stay visible around it.
          ...(index === 0 && score === second.ratings[row] ? { marker: { radius: 9 } } : {}),
        })),
      })),
    ],
  };
}

function radar(notes: Notes): Highcharts.Options {
  return {
    chart: { polar: true, spacing: [0, 0, 8, 0] },
    pane: { size: '78%' },
    xAxis: {
      categories: categories(),
      tickmarkPlacement: 'on',
      lineWidth: 0,
      gridLineColor: 'rgb(var(--line-strong))',
      labels: { style: { color: inkSoft, fontSize: '13px' } },
    },
    yAxis: {
      min: 0,
      max: 100,
      tickInterval: 25,
      gridLineInterpolation: 'polygon',
      gridLineColor: 'rgb(var(--line))',
      lineWidth: 0,
      title: { text: undefined },
      labels: { enabled: false },
    },
    plotOptions: {
      area: {
        pointPlacement: 'on',
        fillOpacity: 0.14,
        lineWidth: 2,
        states: { inactive: { opacity: 0.2 } },
        marker: { symbol: 'circle', radius: 4, lineWidth: 2, lineColor: '#ffffff' },
      },
    },
    series: notes.map(({ judge, ratings }, index) => ({
      type: 'area' as const,
      name: judge,
      color: judgeColor[index],
      data: ratings,
    })),
  };
}

const chartFor: Record<RatingChartKind, (notes: Notes) => Highcharts.Options> = { bars, dumbbell, radar };

/**
 * The judges' scores as whichever chart the reader picked. Hovering explains a criterion and gives both
 * scores, and clicking a name in the legend hides that model where that makes sense. Loaded on demand,
 * because Highcharts is large and most readers never open an analysis.
 */
export default function RatingPlot({ kind, notes }: { kind: RatingChartKind; notes: Notes }) {
  const specific = chartFor[kind](notes);
  const options: Highcharts.Options = {
    ...specific,
    accessibility: { enabled: false }, // RatingChart hides this from screen readers and gives them a table.
    chart: {
      ...specific.chart,
      height: ratingChartHeight[kind],
      backgroundColor: 'transparent',
      style: { fontFamily: 'inherit' },
    },
    title: { text: undefined },
    legend: {
      align: 'left',
      verticalAlign: 'top',
      margin: 8,
      padding: 0,
      symbolRadius: 3,
      symbolHeight: 10,
      symbolWidth: 10,
      itemStyle: { color: inkSoft, fontSize: '13px', fontWeight: 'normal' },
      itemHoverStyle: { color: 'rgb(var(--ink))' },
      itemHiddenStyle: { color: 'rgb(var(--ink-faint))', textDecoration: 'line-through' },
    },
    tooltip: {
      shared: true,
      useHTML: true,
      backgroundColor: 'rgb(var(--surface))',
      borderColor: 'rgb(var(--line-strong))',
      borderRadius: 8,
      shadow: false,
      style: { color: inkSoft, fontSize: '13px' },
      formatter() {
        const criterion = ratingCriteria[this.points?.[0]?.index ?? 0];
        const scores = (this.points ?? [])
          .map(
            (point) =>
              `<div style="display:flex;align-items:center;gap:6px;margin-top:4px">
                <span style="width:10px;height:10px;border-radius:3px;background:${point.color}"></span>
                ${point.series.name}: <b>${point.y}</b>
              </div>`,
          )
          .join('');
        return `<div style="max-width:240px;white-space:normal">
          <b>${criterionLabel[criterion]}</b>
          <div style="margin-top:2px">${criterionHint[criterion]}</div>
          ${scores}
        </div>`;
      },
    },
  };

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
