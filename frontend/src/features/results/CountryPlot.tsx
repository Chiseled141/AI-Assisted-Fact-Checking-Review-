import { useEffect, useMemo, useRef, useState } from 'react';
import Highcharts from 'highcharts/highmaps';
import HighchartsReact from 'highcharts-react-official';
import type { CountryMapData } from '../../types/models';
import { locale, t } from '../../lib/i18n';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { countryMap } from './chartSettings';
import { flagUrl, formatExactStat, valueAt, type ChosenCountry } from './CountryMap';
import { islandShapes, islandsInView, type IslandCode } from './islands';
import { viewOfPlaces, withIslandRoom, type TopoMap } from './mapViews';

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
  onChoose: (countries: ChosenCountry[]) => void;
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
    borderWidth: 1,
    custom: { picked: true, label },
  }) as Highcharts.PointOptionsObject;

const plainStyle = {
  color: null,
  borderColor: '#fff',
  borderWidth: 0.5,
  custom: { picked: false },
} as unknown as Highcharts.PointOptionsObject;

/** The map. Clicking a country adds it to the comparison, and clicking it again takes it off. */
export default function CountryPlot({ map, height, onChoose }: Props) {
  const [topo, setTopo] = useState<TopoMap | null>(null);
  const [islands, setIslands] = useState<unknown>(null);
  const phone = useMediaQuery('(max-width: 639px)');
  const states = map.scope === 'us-states';
  const choose = useRef(onChoose);
  choose.current = onChoose;
  const picked = useRef(map.selected.map(({ code }) => code));
  const chart = useRef<HighchartsReact.RefObject>(null);
  const firstHeight = useRef(height);

  // Resized in place, because new options would redraw the map and undo the reader's zoom and clicks.
  useEffect(() => {
    chart.current?.chart?.setSize(null, height, false);
  }, [height]);

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
    // Every state stays in view, because the map's point is comparing them. Countries zoom to the claim's region.
    const view = codes.length && !states ? withIslandRoom(viewOfPlaces(topo, codes, regionMargin)) : null;
    // Only a region that includes the islands carries them, so the whole world and regions elsewhere don't.
    const shown: IslandCode[] = view ? islandsInView(view) : [];
    const islandLabels: Record<IslandCode, string> = {
      'hoang-sa': t('Hoàng Sa Islands (Vietnam)'),
      'truong-sa': t('Trường Sa Islands (Vietnam)'),
    };
    // The figures sit beside this map, so there is no room for the long name on one line.
    const islandLabel = (code: IslandCode) => islandLabels[code].replace(/^Quần đảo | Islands/g, '').replace(' (', '<br>(');

    return {
      accessibility: { enabled: false }, // CountryMap gives screen readers the same figures as text.
      chart: { height: firstHeight.current, backgroundColor: 'transparent', style: { fontFamily: 'inherit' } },
      title: { text: undefined },
      mapView: view ? { fitToGeometry: { type: 'MultiPoint', coordinates: view }, padding: 4 } : {},
      mapNavigation: { enabled: true, enableMouseWheelZoom: false, buttonOptions: { verticalAlign: 'bottom' } },
      legend: { symbolWidth: phone ? 220 : 280, itemStyle: { color: inkSoft, fontWeight: 'normal' } },
      colorAxis: {
        ...(states ? { type: 'logarithmic' as const, min: 500_000 } : scale[map.indicator]),
        stops: states
          ? [
              [0, '#EFEFFF'],
              [0.67, '#4444FF'],
              [1, '#000022'],
            ]
          : [
              [0, '#eef0fb'],
              [0.5, '#8f8fe0'],
              [1, '#312e81'],
            ],
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
        useHTML: true,
        formatter() {
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
                picked.current = picked.current.includes(code)
                  ? picked.current.filter((other) => other !== code)
                  : [...picked.current, code];
                const series = point.series;
                (series.points as PointWithCode[]).forEach((other) => {
                  const index = picked.current.indexOf(other['hc-key'] ?? '');
                  if (index >= 0) other.update(pickedStyle(index, other.options.custom?.label ?? other.name), false);
                  else if (other.options.custom?.picked) other.update(plainStyle, false);
                });
                series.chart.redraw();
                choose.current(
                  picked.current.map((pick) => {
                    const found = (series.points as PointWithCode[]).find((other) => other['hc-key'] === pick);
                    return { code: pick, label: found?.options.custom?.label ?? found?.name ?? pick };
                  }),
                );
                return false;
              },
            },
          },
          data: Object.keys(map.values)
            .filter((code) => code !== 'world')
            .map((code) => {
              const index = map.selected.findIndex((place) => place.code === code);
              return {
                'hc-key': code,
                value: valueAt(map, code, map.year)?.value ?? null,
                ...(index >= 0 ? pickedStyle(index, map.selected[index].named) : {}),
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
            style: { color: ink, fontSize: '12px', fontWeight: '500', textOutline: '2.5px #fff' },
          },
        } as Highcharts.SeriesOptionsType,
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
                data: shown.map((code) => ({ 'hc-key': code, label: islandLabel(code), color: islandColor })),
                dataLabels: {
                  enabled: true,
                  format: '{point.label}',
                  allowOverlap: true,
                  y: 22,
                  style: { color: inkSoft, fontSize: '12px', fontWeight: '500', textOutline: '2.5px #fff' },
                },
              } as Highcharts.SeriesOptionsType,
            ]
          : []),
      ],
    };
  }, [topo, islands, map, phone, states]);

  if (!options) return null;
  return <HighchartsReact ref={chart} highcharts={Highcharts} constructorType="mapChart" options={options} />;
}
