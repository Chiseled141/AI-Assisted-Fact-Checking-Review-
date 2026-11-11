import { useEffect, useMemo, useRef, useState } from 'react';
import Highcharts from 'highcharts/highmaps';
import HighchartsReact from 'highcharts-react-official';
import type { CountryMapData } from '../../../types/models';
import { locale, t } from '../../../lib/i18n';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { countryMap } from './chartSettings';
import { drawOcean, graticule, type GlobeChart } from './globe';
import { flagUrl, formatExactStat, valueAt, type ChosenCountry } from './CountryMap';
import { islandMiddles, islandShapes, islandsInView, type IslandCode } from './islands';
import { middles, viewOfPlaces, withIslandRoom, type TopoMap } from './mapViews';

// The same map files as the location map, in public/maps.
const worldFile = '/maps/world-palestine.topo.json';
const usFile = '/maps/us-all.topo.json';
const islandFile = '/maps/vn-islands.geo.json';

const inkSoft = 'rgb(var(--ink-soft))';
const ink = 'rgb(18, 20, 22)';
const islandColor = 'rgb(var(--ink-faint))';
// How far around the claim's countries the map looks first, in degrees of longitude and latitude.
const regionMargin = [18, 12];

// A few countries dwarf the rest on these two, so the scale is logarithmic and each step means ten times more.
const scale: Record<CountryMapData['indicator'], Highcharts.ColorAxisOptions> = {
  population: { type: 'logarithmic', min: 50_000 },
  gdp: { type: 'logarithmic', min: 100_000_000 },
  gdp_per_capita: { type: 'logarithmic', min: 200 },
  life_expectancy: { type: 'linear', min: 50, max: 90 },
};

interface Props {
  map: CountryMapData;
  height: number;
  globe: boolean;
  focus: ChosenCountry | null;
  onChoose: (countries: ChosenCountry[]) => void;
}

function globeRotation(topo: TopoMap, code: string): Highcharts.ProjectionRotationOption | undefined {
  const center = middles(topo, [code]).get(code);
  return center && [-center[0], -center[1]];
}

interface PointWithCode extends Highcharts.Point {
  'hc-key'?: string;
}

/** A picked country's look. Each keeps one color across the map, its figures and its line. */
const pickedStyle = (index: number, label: string): Highcharts.PointOptionsObject =>
  ({
    labelrank: 100, // A picked place keeps its label when others give way.
    color: countryMap.compareColors[index % countryMap.compareColors.length],
    borderColor: ink,
    borderWidth: 1.4,
    custom: { picked: true, label },
  }) as Highcharts.PointOptionsObject;

const plainStyle = {
  color: null,
  borderColor: '#fff',
  borderWidth: 0.5,
  custom: { picked: false },
} as unknown as Highcharts.PointOptionsObject;

/** The map. Clicking a country adds it to the comparison, and clicking it again takes it off. */
export default function CountryPlot({ map, height, globe, focus, onChoose }: Props) {
  const [topo, setTopo] = useState<TopoMap | null>(null);
  const [islands, setIslands] = useState<unknown>(null);
  const phone = useMediaQuery('(max-width: 639px)');
  const states = map.scope === 'us-states';
  const choose = useRef(onChoose);
  choose.current = onChoose;
  const picked = useRef<ChosenCountry[]>(map.selected.map(({ code, named }) => ({ code, label: named })));
  const chart = useRef<HighchartsReact.RefObject>(null);
  const chartHeight = useRef(height);
  chartHeight.current = height;

  // Resized in place, because new options would redraw the map and undo the reader's zoom and clicks.
  useEffect(() => {
    chart.current?.chart?.setSize(null, height, false);
  }, [height]);

  useEffect(() => {
    const current = chart.current?.chart as GlobeChart | undefined;
    if (!globe || !focus || !topo || !current) return;
    const rotation = globeRotation(topo, focus.code);
    if (!rotation) return;
    current.mapView.update({ projection: { rotation } }, false);
    current.mapView.fitToBounds(undefined, undefined, false);
    current.redraw(false);
  }, [focus, globe, topo]);

  useEffect(() => {
    let current = true;
    void Promise.all([fetch(states ? usFile : worldFile), fetch(islandFile)])
      .then((responses) => Promise.all(responses.map((response) => response.json())))
      .then(([data, shapes]) => {
        if (!current) return;
        setTopo(data as TopoMap);
        setIslands(shapes);
      });
    return () => {
      current = false;
    };
  }, [states]);

  // These only change with the data, so a click on the map keeps the reader's zoom.
  const options = useMemo<Highcharts.Options | null>(() => {
    if (!topo || !islands) return null;
    const codes = map.selected.map(({ code }) => code);
    const longitudes = [...middles(topo, codes).values()].map(([lon]) => lon);
    // Far-apart countries need the world extent, including shapes split by the antimeridian.
    const regional = !states && longitudes.length > 0 && Math.max(...longitudes) - Math.min(...longitudes) < 150;
    const view = regional ? withIslandRoom(viewOfPlaces(topo, codes, regionMargin)) : null;
    const shown: IslandCode[] = globe || states ? [] : view ? islandsInView(view) : ['hoang-sa', 'truong-sa'];
    const islandLabels: Record<IslandCode, string> = {
      'hoang-sa': t('Hoàng Sa Islands (Vietnam)'),
      'truong-sa': t('Trường Sa Islands (Vietnam)'),
    };
    // The figures sit beside this map, so there is no room for the long name on one line.
    const islandLabel = (code: IslandCode) =>
      islandLabels[code].replace(/^Quần đảo | Islands/g, '').replace(' (', '<br>(');

    return {
      accessibility: { enabled: false }, // CountryMap gives screen readers the same figures as text.
      chart: {
        height: chartHeight.current,
        backgroundColor: 'transparent',
        style: { fontFamily: 'inherit' },
        events: globe ? { render: drawOcean } : undefined,
      },
      title: { text: undefined },
      mapView: globe
        ? {
            projection: {
              name: 'Orthographic',
              rotation: globeRotation(topo, picked.current[0]?.code ?? '') ?? [0, -15],
              projectedBounds: 'world',
            },
            padding: 12,
          }
        : view ? { fitToGeometry: { type: 'MultiPoint', coordinates: view }, padding: 16 } : { padding: 12 },
      mapNavigation: { enabled: !globe, enableMouseWheelZoom: false, buttonOptions: { verticalAlign: 'bottom' } },
      legend: { symbolWidth: phone ? 220 : 280, itemStyle: { color: inkSoft, fontWeight: 'normal' } },
      colorAxis: {
        ...(states ? { type: 'logarithmic' as const, min: 500_000 } : scale[map.indicator]),
        stops: [[0, '#f1f5f9'], [0.5, '#cbd5e1'], [1, '#94a3b8']],
        startOnTick: false,
        endOnTick: false,
        gridLineColor: '#fff',
        labels: {
          style: { color: inkSoft, fontSize: '12px' },
          overflow: 'allow',
          formatter() {
            return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(Number(this.value));
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgb(var(--surface))',
        borderColor: 'rgb(var(--line-strong))',
        borderRadius: 8,
        shadow: false,
        style: { color: inkSoft, fontSize: '13px' },
        headerFormat: '',
        hideDelay: globe ? 0 : undefined,
        useHTML: true,
        formatter() {
          if (this.series.type === 'mappoint') {
            return this.plotX === undefined ? false : `<b>${this.name}</b>`;
          }
          const point = this as unknown as PointWithCode;
          const own = point['hc-key'] ? valueAt(map, point['hc-key'], map.year) : null;
          if (!own) return false;
          const flag = flagUrl(point['hc-key'] ?? '');
          const image = flag
            ? `<img src="${flag}" alt="" width="20" height="15" referrerpolicy="no-referrer" style="display:inline-block;vertical-align:-2px;margin-right:6px;border-radius:2px;object-fit:cover" />`
            : '';
          return `${image}<b>${point.name}</b><br/>${own.year}: <b>${formatExactStat(own.value, map.indicator)}</b>`;
        },
      },
      series: [
        ...(globe ? [{
          type: 'mapline' as const,
          data: graticule,
          color: '#a7b1d2',
          lineWidth: 0.5,
          enableMouseTracking: false,
          showInLegend: false,
          affectsMapView: false,
          colorAxis: false as const,
          states: { inactive: { opacity: 1 } },
        }] : []),
        {
          type: 'map',
          mapData: topo as unknown as Highcharts.GeoJSON,
          joinBy: 'hc-key',
          allAreas: true,
          nullColor: 'rgb(var(--line))',
          borderColor: '#fff',
          borderWidth: 0.5,
          cursor: 'pointer',
          states: { hover: { brightness: 0.1 } },
          point: {
            events: {
              click() {
                const point = this as PointWithCode;
                const code = point['hc-key'] ?? '';
                // Highcharts' own selected state can only give every country the same color.
                picked.current = picked.current.some((country) => country.code === code)
                  ? picked.current.filter((country) => country.code !== code)
                  : [...picked.current, { code, label: point.options.custom?.label ?? point.name ?? code }];
                const series = point.series;
                const picks = new Map(picked.current.map(({ code, label }, index) => [code, { index, label }]));
                (series.points as PointWithCode[]).forEach((other) => {
                  const pick = picks.get(other['hc-key'] ?? '');
                  if (pick) other.update(pickedStyle(pick.index, pick.label), false);
                  else if (other.options.custom?.picked) other.update(plainStyle, false);
                });
                series.chart.redraw();
                choose.current(picked.current);
                return false;
              },
            },
          },
          data: Object.keys(map.values)
            .filter((code) => code !== 'world')
            .map((code) => {
              const index = picked.current.findIndex((place) => place.code === code);
              return {
                'hc-key': code,
                value: valueAt(map, code, map.year)?.value ?? null,
                ...(index >= 0 ? pickedStyle(index, picked.current[index].label) : {}),
              };
            }),
          dataLabels: {
            enabled: true,
            // The small northeastern states can't all fit a code, so some give way.
            allowOverlap: !states,
            crop: false,
            formatter() {
              const point = this as unknown as PointWithCode;
              if (point.options.custom?.picked) return point.options.custom.label;
              // The states are small and familiar, so each shows its two-letter code.
              return states ? (point as unknown as { properties?: { 'hc-a2'?: string } }).properties?.['hc-a2'] : null;
            },
            style: { color: ink, fontSize: '12px', fontWeight: '500', textOutline: '2.5px rgb(var(--surface))' },
          },
        } as Highcharts.SeriesOptionsType,
        ...(globe ? [{
          type: 'mappoint' as const,
          affectsMapView: false,
          animation: false as const,
          showInLegend: false,
          color: islandColor,
          dataLabels: { enabled: false },
          stickyTracking: false,
          states: { hover: { halo: null } },
          marker: {
            symbol: 'circle',
            radius: 1,
            lineWidth: 0,
            states: { hover: { radiusPlus: 0, lineWidthPlus: 0 } },
          },
          data: Object.entries(islandMiddles).map(([code, [lon, lat]]) => ({
            name: islandLabels[code as IslandCode],
            lon,
            lat,
          })),
        }] : []),
        ...(shown.length > 0
          ? [
              {
                type: 'map',
                mapData: islandShapes(islands, shown) as unknown as Highcharts.GeoJSON,
                joinBy: 'hc-key',
                colorAxis: false,
                showInLegend: false,
                affectsMapView: false,
                enableMouseTracking: false,
                // The real islands would be too small to see at this scale, so the border thickens them.
                borderWidth: 2,
                borderColor: islandColor,
                nullColor: islandColor,
                data: shown.map((code) => ({
                  'hc-key': code,
                  label: view ? islandLabel(code) : islandLabel(code).split('<br>')[0],
                  color: islandColor,
                  dataLabels: { y: code === 'hoang-sa' ? 6 : 18 },
                })),
                dataLabels: {
                  enabled: true,
                  format: '{point.label}',
                  allowOverlap: true,
                  align: 'right',
                  x: -4,
                  style: { color: inkSoft, ...countryMap.islandLabel },
                },
              } as Highcharts.SeriesOptionsType,
            ]
          : []),
      ],
    };
  }, [topo, islands, map, phone, states, globe]);

  if (!options) return null;
  return <HighchartsReact key={globe ? 'globe' : 'flat'} ref={chart} highcharts={Highcharts} constructorType="mapChart" options={options} />;
}
