import { useEffect, useState } from 'react';
import Highcharts from 'highcharts/highmaps';
import HighchartsReact from 'highcharts-react-official';
import type { ElectionMapData } from '../../../types/models';
import { t } from '../../../lib/i18n';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { electionMap } from './chartSettings';
import type { TopoMap } from './mapViews';

const inkSoft = 'rgb(var(--ink-soft))';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

interface Props {
  map: ElectionMapData;
  height: number;
  colorOf: (state: ElectionMapData['states'][number]) => string;
}

/** Each state in its winner's color, and grey where no result could be verified. Loaded on demand, because Highcharts is large. */
export default function ElectionPlot({ map, height, colorOf }: Props) {
  const [shapes, setShapes] = useState<TopoMap | null>(null);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useEffect(() => {
    let current = true;
    void fetch('/maps/us-all.topo.json')
      .then((response) => response.json() as Promise<TopoMap>)
      .then((topo) => {
        if (current) setShapes(topo);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  if (!shapes) return null;

  const options: Highcharts.Options = {
    accessibility: { enabled: false }, // ElectionMap gives screen readers the same results in its list.
    chart: { map: shapes as unknown as Highcharts.GeoJSON, height, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: undefined },
    legend: { enabled: false },
    mapNavigation: { enabled: false },
    tooltip: {
      backgroundColor: 'rgb(var(--surface))',
      borderColor: 'rgb(var(--line-strong))',
      borderRadius: 8,
      shadow: false,
      style: { color: inkSoft, fontSize: '13px' },
      headerFormat: '',
      nullFormatter() {
        return `<b>${escapeHtml(String(this.name))}</b>: ${escapeHtml(t('Not verified in the sources'))}`;
      },
      pointFormatter() {
        const state = map.states.find(({ code }) => code === (this.options as { 'hc-key'?: string })['hc-key']);
        if (!state) return `<b>${escapeHtml(String(this.name))}</b>`;
        const detail = state.detail ? ` · ${escapeHtml(state.detail)}` : '';
        return `<b>${escapeHtml(state.name)}</b>: ${escapeHtml(state.winner)}${detail}`;
      },
    } as Highcharts.TooltipOptions,
    plotOptions: { series: { animation: reduceMotion ? false : { duration: 300 } } },
    series: [
      {
        type: 'map',
        name: 'Results',
        joinBy: 'hc-key',
        allAreas: true,
        nullColor: electionMap.unverifiedColor,
        borderColor: '#ffffff',
        borderWidth: 0.75,
        data: map.states.map((state) => ({ 'hc-key': state.code, value: 1, color: colorOf(state) })),
        dataLabels: {
          enabled: true,
          format: '{point.properties.hc-a2}',
          // Only verified states get a label, because 51 of them don't fit on a phone.
          filter: { property: 'value', operator: '>', value: 0 },
          style: { color: 'contrast', fontSize: '10px', fontWeight: '500', textOutline: 'none' },
        },
      } as Highcharts.SeriesOptionsType,
    ],
  };

  // A new size starts a new chart, because updating one in place leaves the map's view at the old size.
  return <HighchartsReact key={height} highcharts={Highcharts} constructorType="mapChart" options={options} />;
}
