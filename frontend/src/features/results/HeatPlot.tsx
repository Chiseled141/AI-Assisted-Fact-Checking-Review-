import { useEffect, useState } from 'react';
import Highcharts from 'highcharts/highmaps';
import HighchartsReact from 'highcharts-react-official';
import type { HeatMapData } from '../../types/models';
import { t } from '../../lib/i18n';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { islandShapes, islandsInView } from './islands';
import { heatMap } from './chartSettings';
import { formatValue, metricTitle, metricUnit } from './HeatMap';

// The same map files as the location map, in public/maps.
const worldFile = '/maps/world-palestine.topo.json';
const vietnamFile = '/maps/vn-all.topo.json';
const islandFile = '/maps/vn-islands.geo.json';

const inkSoft = 'rgb(var(--ink-soft))';
const outline = 'rgba(18, 20, 22, 0.7)';

const colorStops: Record<HeatMapData['metric'], [number, string][]> = {
  temperature: [
    [0, 'rgb(14, 14, 120)'],
    [0.17, 'rgb(62, 117, 207)'],
    [0.3, 'rgb(91, 190, 243)'],
    [0.43, 'rgb(175, 237, 234)'],
    [0.5, 'rgb(229, 241, 196)'],
    [0.59, 'rgb(244, 213, 130)'],
    [0.71, 'rgb(237, 158, 80)'],
    [0.85, 'rgb(204, 90, 41)'],
    [1, 'rgb(150, 20, 30)'],
  ],
  rainfall: [
    [0, '#f4f8fb'],
    [0.4, '#7fb6dc'],
    [1, '#0b3a78'],
  ],
  pm25: [
    [0, '#f6f4d2'],
    [0.3, '#f2c14e'],
    [0.6, '#d9482b'],
    [1, '#5e1a6b'],
  ],
};

interface Shapes {
  map: Highcharts.GeoJSON;
  islands: Highcharts.GeoJSON;
}

/** The module registers itself on the last Highcharts loaded, so this page's copy is put first. */
async function loadModule(): Promise<void> {
  (window as unknown as { _Highcharts: typeof Highcharts })._Highcharts = Highcharts;
  await import('highcharts/modules/geoheatmap');
}

/** The grid as a heatmap, under the map's outlines. Loaded on demand, because it and its shapes are large. */
export default function HeatPlot({ map }: { map: HeatMapData }) {
  const [shapes, setShapes] = useState<Shapes | null>(null);
  const phone = useMediaQuery('(max-width: 639px)');

  useEffect(() => {
    let current = true;
    const file = map.area === 'vn' ? vietnamFile : worldFile;
    void Promise.all([loadModule(), fetch(file).then((r) => r.json()), fetch(islandFile).then((r) => r.json())]).then(
      ([, mapShape, islands]) => {
        if (current) setShapes({ map: mapShape as Highcharts.GeoJSON, islands: islands as Highcharts.GeoJSON });
      },
    );
    return () => {
      current = false;
    };
  }, [map.area]);

  if (!shapes) return null;

  const world = map.area === 'world';
  const island = (label: string) => (phone ? label.replace(/^Quần đảo | Islands| \(.*\)$/g, '') : label);
  const lons = map.points.map(([lon]) => lon);
  const lats = map.points.map(([, lat]) => lat);
  const values = map.points.map(([, , value]) => value);
  // Round outward, so the legend reads in clean steps.
  const air = map.metric === 'pm25';
  const lowest = map.metric === 'temperature' ? Math.floor(Math.min(...values) / 5) * 5 : 0;
  const highest = Math.ceil(Math.max(...values) / 5) * 5 || 5;
  // Above and below freezing, the scale centers on 0°C, so warm places read warm and cold ones cold.
  const reach = Math.max(Math.abs(lowest), highest);
  const crossesZero = lowest < 0 && highest > 0;
  const low = crossesZero ? -reach : lowest;
  const high = crossesZero ? reach : highest;
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const south = Math.min(...lats);
  const north = Math.max(...lats);

  // Only a region that includes the islands carries them, so the whole world and regions elsewhere don't.
  const shownIslands = world
    ? []
    : islandsInView([
        [west, south],
        [east, north],
      ]);
  const islandSeries: Highcharts.SeriesOptionsType[] = [
    {
      // The map collection leaves these islands out, so their shapes are added, the same as on the location map.
      type: 'mapline',
      color: outline,
      lineWidth: 1.5,
      data: Highcharts.geojson(islandShapes(shapes.islands, shownIslands)),
    } as Highcharts.SeriesOptionsType,
    {
      type: 'mappoint',
      enableMouseTracking: false,
      marker: { enabled: false },
      dataLabels: {
        enabled: true,
        format: '{point.name}',
        allowOverlap: true,
        style: { color: 'rgb(var(--ink))', fontSize: '12px', fontWeight: '500', textOutline: '2.5px #fff' },
      },
      data: [
        ...(shownIslands.includes('hoang-sa') ? [{ lat: 15, lon: 112, name: island(t('Hoàng Sa Islands (Vietnam)')) }] : []),
        ...(shownIslands.includes('truong-sa') ? [{ lat: 7.3, lon: 114.6, name: island(t('Trường Sa Islands (Vietnam)')) }] : []),
      ],
    } as Highcharts.SeriesOptionsType,
  ];

  const options: Highcharts.Options = {
    accessibility: { enabled: false }, // HeatMap hides this from screen readers and states the range as text.
    chart: { map: shapes.map, height: heatMap.height, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
    title: { text: undefined },
    mapView: world
      ? {}
      : {
          fitToGeometry: {
            type: 'MultiPoint',
            coordinates: [
              [west, south],
              [east, north],
            ],
          },
          padding: 4,
        },
    mapNavigation: { enabled: true, enableMouseWheelZoom: false, buttonOptions: { verticalAlign: 'bottom' } },
    legend: {
      symbolWidth: phone ? 240 : 320,
      itemStyle: { color: inkSoft, fontWeight: 'normal' },
      // This unit is too wide to repeat on every tick.
      ...(air ? { title: { text: metricUnit.pm25.trim(), style: { color: inkSoft, fontSize: '12px', fontWeight: 'normal' } } } : {}),
    },
    colorAxis: {
      min: low,
      max: high,
      stops: colorStops[map.metric],
      gridLineColor: '#fff',
      tickPositions: [0, 1, 2, 3, 4].map((index) => low + (index * (high - low)) / 4),
      labels: { format: air ? '{value}' : `{value}${metricUnit[map.metric]}`, overflow: 'allow', style: { color: inkSoft, fontSize: '12px' } },
    },
    tooltip: {
      backgroundColor: 'rgb(var(--surface))',
      borderColor: 'rgb(var(--line-strong))',
      borderRadius: 8,
      shadow: false,
      style: { color: inkSoft, fontSize: '13px' },
      headerFormat: '',
      formatter() {
        const point = this as unknown as { value?: number };
        return `${metricTitle[map.metric]}: <b>${formatValue(point.value ?? 0, map.metric)}</b>`;
      },
    },
    plotOptions: {
      // Outlines take `nullColor`, because the color axis would otherwise color them.
      mapline: {
        enableMouseTracking: false,
        fillColor: 'transparent',
        nullColor: outline,
        states: { inactive: { enabled: false } },
      },
    },
    series: [
      {
        type: 'geoheatmap',
        name: metricTitle[map.metric],
        colsize: map.step,
        rowsize: map.step,
        interpolation: { enabled: true, blur: 1 },
        // The globe's edge at -180° is also its edge at 180°, so the color carries across the seam.
        data: map.points.flatMap(([lon, lat, value]) =>
          lon === -180
            ? [
                { lon, lat, value },
                { lon: 180, lat, value },
              ]
            : [{ lon, lat, value }],
        ),
      } as Highcharts.SeriesOptionsType,
      {
        type: 'mapline',
        color: outline,
        lineWidth: 0.6,
        data: Highcharts.geojson(shapes.map),
      } as Highcharts.SeriesOptionsType,
      ...(shownIslands.length > 0 ? islandSeries : []),
    ],
  };

  return <HighchartsReact highcharts={Highcharts} constructorType="mapChart" options={options} />;
}
