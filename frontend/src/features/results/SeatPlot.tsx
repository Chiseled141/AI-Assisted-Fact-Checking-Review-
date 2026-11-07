import { useEffect, useState } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import type { SeatChartData } from '../../types/models';
import { t } from '../../lib/i18n';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { seatChart } from './chartSettings';

const inkSoft = 'rgb(var(--ink-soft))';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** The module registers itself on the last Highcharts loaded, so this page's copy is put first. */
async function loadModule(): Promise<void> {
  (window as unknown as { _Highcharts: typeof Highcharts })._Highcharts = Highcharts;
  await import('highcharts/modules/item-series');
}

interface Props {
  chart: SeatChartData;
  height: number;
  notListed: number;
  phone: boolean;
}

/** One dot for each seat, in a half circle. Loaded on demand, because Highcharts is large. */
export default function SeatPlot({ chart, height, notListed, phone }: Props) {
  const [ready, setReady] = useState(false);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    let current = true;
    void loadModule().then(() => {
      if (current) setReady(true);
    });
    return () => {
      current = false;
    };
  }, []);

  if (!ready) return null;

  const options: Highcharts.Options = {
    accessibility: { enabled: false }, // SeatChart gives screen readers the same counts in its list.
    chart: { height, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: undefined },
    legend: { enabled: false },
    tooltip: {
      backgroundColor: 'rgb(var(--surface))',
      borderColor: 'rgb(var(--line-strong))',
      borderRadius: 8,
      shadow: false,
      style: { color: inkSoft, fontSize: '13px' },
      headerFormat: '',
      pointFormatter() {
        return `<b>${escapeHtml(this.name)}</b>: ${this.y}`;
      },
    },
    plotOptions: { series: { animation: reduceMotion ? false : { duration: 450 } } },
    series: [
      {
        type: 'item',
        name: 'Seats',
        dataLabels: { enabled: false },
        // Keep the parliament in a half circle.
        center: ['50%', '88%'],
        // A phone is narrower than it is tall here, so the size follows its width and the circle stays whole.
        size: phone ? '135%' : '170%',
        startAngle: -100,
        endAngle: 100,
        data: [
          ...chart.parties.map((party, index) => ({
            name: party.name,
            y: party.seats,
            color: seatChart.partyColors[index % seatChart.partyColors.length],
          })),
          ...(notListed > 0 ? [{ name: t('Not verified in the sources'), y: notListed, color: seatChart.unreportedColor }] : []),
        ],
      } as Highcharts.SeriesOptionsType,
    ],
  };

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
