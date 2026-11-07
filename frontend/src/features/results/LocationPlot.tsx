import { useEffect, useState } from 'react';
import Highcharts from 'highcharts/highmaps';
import HighchartsReact from 'highcharts-react-official';
import type { LocationMapData } from '../../types/models';
import { t } from '../../lib/i18n';
import { locationMap } from './chartSettings';
import { islandShapes, islandsInView, withoutVietnamsIslands, type IslandCode } from './islands';
import { middles, viewAround, viewOfGeometry, viewOfShapes, withIslandRoom, withoutUsInsets, type TopoMap } from './mapViews';
import { useMediaQuery } from '../../lib/useMediaQuery';

// Copied from the Highcharts map collection. The world file is the one that has Gaza and the West Bank.
const mapFile = { vietnam: '/maps/vn-all.topo.json', world: '/maps/world-palestine.topo.json', us: '/maps/us-all.topo.json' };
// The collection leaves out Hoàng Sa and Trường Sa, so their shapes come from Natural Earth, which is public domain.
const islandFile = '/maps/vn-islands.geo.json';

const inkSoft = 'rgb(var(--ink-soft))';
const indigo = '#4338ca'; // Tailwind's indigo-700, as on the figures beside the map.
const islandColor = 'rgb(var(--ink-faint))';
const countryTint = '#e0e7ff'; // Tailwind's indigo-100: the country around a highlighted region.
// Degrees of surroundings kept around a named region.
const regionMargin = 3;

// Every country's region map would add a lot to the project, so each loads when a reader first drills into it.
const regionFile = (code: string) =>
  code === 'vn' ? mapFile.vietnam : `https://code.highcharts.com/mapdata/2.3.3/countries/${code}/${code}-all.topo.json`;
const folded = (text: string) =>
  text
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

/** The areas of a region map that a claim's regions refer to, by the map's name for them or any other name it lists. */
function matchRegions(topo: TopoMap, regions: { name: string; code?: string }[]) {
  return regions.flatMap(({ name, code }) => {
    const wanted = folded(name);
    const found = code
      ? code
      : topo.objects.default.geometries.find(({ properties }) => {
          const names = [properties.name, ...String(properties['alt-name'] ?? '').split('|')];
          return names.some((other) => typeof other === 'string' && folded(other) === wanted);
        })?.properties['hc-key'];
    return found ? [{ 'hc-key': String(found), label: escapeHtml(name), value: 1 }] : [];
  });
}

// Highcharts has this, but not in its published types.
interface ChartWithView {
  mapView: { update: (options: Highcharts.MapViewOptions, redraw?: boolean) => void };
}
// The real islands would be too small to see at this scale, so the border thickens them.
const drilledIsland = { color: islandColor, borderColor: islandColor, borderWidth: 2.5 };
const fitTo = (coordinates: [number, number][]): Highcharts.MapViewOptions => ({
  fitToGeometry: { type: 'MultiPoint', coordinates },
  padding: 8,
});

/** The drilldown module registers itself on the last Highcharts loaded, so this page's copy is put first. */
async function loadDrilldown(): Promise<void> {
  (window as unknown as { _Highcharts: typeof Highcharts })._Highcharts = Highcharts;
  await import('highcharts/modules/drilldown');
}

// Vietnam, with the sea as far as Trường Sa, which the map's own bounds stop short of.
const vietnamView: [number, number][] = [
  [102, 7],
  [118, 24],
];
// How far around the claim's places each map looks first, in degrees of longitude and latitude.
const margin = { vietnam: [3, 2.5], world: [16, 10], us: [7, 4.5] };
// What the model's `map_zoom` does to that margin, and the room left around a place's own shape.
const zooms = { close: { scale: 0.6, room: 0.12 }, region: { scale: 1, room: 0.3 }, wide: { scale: 2.5, room: 0.5 } };
// Labels closer than this many degrees of latitude would overlap, and a line of text is this many pixels.
const labelGap = 1.5;
// The small map of the whole country, in pixels.
const overviewSize = [116, 150];
const labelLine = 16;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Neighbours would hide each other's labels, so a label close below another moves down a line. */
function labelOffsets(centers: Map<string, [number, number]>): Map<string, number> {
  const offsets = new Map<string, number>();
  let previous: [number, number] | null = null;
  let offset = 0;
  for (const [code, center] of [...centers].sort(([, a], [, b]) => b[1] - a[1])) {
    const near: boolean =
      previous !== null && Math.abs(previous[1] - center[1]) < labelGap && Math.abs(previous[0] - center[0]) < labelGap * 4;
    offset = near ? offset + labelLine : 0;
    offsets.set(code, offset);
    previous = center;
  }
  return offsets;
}

/** The map, with the claim's places highlighted. Loaded on demand, because it and its shapes are large. */
export default function LocationPlot({ map, height }: { map: LocationMapData; height: number }) {
  const [topo, setTopo] = useState<TopoMap | null>(null);
  const [islands, setIslands] = useState<unknown>(null);
  // With figures beside it the map is narrow on a wide screen too, so its labels wrap the same way.
  const phone = useMediaQuery('(max-width: 639px)');
  const narrow = phone || Boolean(map.details?.length);

  useEffect(() => {
    let current = true;
    const canDrillDown = map.places.some(({ regions }) => regions?.length);
    void Promise.all([fetch(mapFile[map.map]), fetch(islandFile), canDrillDown ? loadDrilldown() : null])
      .then(([mapResponse, islandResponse]) => Promise.all([mapResponse.json(), islandResponse.json()]))
      .then(([data, shapes]) => {
        if (!current) return;
        setTopo(data as TopoMap);
        setIslands(shapes);
      });
    return () => {
      current = false;
    };
  }, [map.map]);

  if (!topo || !islands) return null;

  const islandPoint = (code: string, label: string, narrowLabel: { x: number; y: number }) => {
    const named = map.places.some((place) => place.code === code);
    const short = label.replace(/^Quần đảo | Islands/g, '').replace(' (', '<br>(');
    return {
      'hc-key': code,
      label: narrow ? short : label,
      color: named ? indigo : islandColor,
      borderColor: named ? indigo : islandColor,
      ...(narrow ? { dataLabels: narrowLabel } : {}),
    };
  };
  const centers = middles(
    topo,
    map.places.map(({ code }) => code),
  );
  const namesIslands = map.places.some(({ code }) => code === 'hoang-sa' || code === 'truong-sa');
  const offsets = labelOffsets(centers);
  const places = map.places.map(({ code, name, named, regions }) => ({
    'hc-key': code,
    value: 1,
    // A region's name on its whole country would point at the wrong place.
    label: escapeHtml(regions?.length ? name : named),
    // On its own, a country opens on its region. Several can't all do that, so a reader chooses.
    ...(regions?.length && map.places.length > 1 ? { drilldown: code } : {}),
    // The place's own figures show when it is hovered.
    figures: (map.details ?? [])
      // On a map of one place, the overall figures are about that place too.
      .filter(({ place }) => place === code || (!place && map.places.length === 1))
      .map(({ label, value }) => `<div style="margin-top:2px">${escapeHtml(label)}: <b>${escapeHtml(value)}</b></div>`)
      .join(''),
    dataLabels: { y: offsets.get(code) ?? 0 },
  }));
  // Each check opens on its own area. Zoomed in on Vietnam the islands can leave the view, so the overview keeps them on screen.
  const zoom = zooms[map.zoom ?? 'region'];
  const wholeVietnam = namesIslands || (map.map === 'vietnam' && map.zoom === 'wide');
  const zoomedInVietnam = map.map === 'vietnam' && !wholeVietnam;
  const codes = map.places.map(({ code }) => code);
  // At least the usual margin around a place, and more for a big one, so its whole shape shows.
  const around = [
    ...viewAround(
      centers.values(),
      margin[map.map].map((degrees) => degrees * zoom.scale),
    ),
    ...viewOfShapes(topo, codes, zoom.room),
  ];
  const view = wholeVietnam ? vietnamView : map.map === 'world' ? withIslandRoom(around) : around;
  // The Vietnam map always has them, because they are part of what it shows. Other views only if they reach them.
  const shownIslands = map.map === 'vietnam' ? islandsInView(vietnamView) : islandsInView(view);
  const islandShort = (label: string) => label.replace(/^Quần đảo | Islands| \(.*\)$/g, '');

  Highcharts.setOptions({ lang: { mainBreadcrumb: t('All places') } });
  const labelStyle = { color: 'rgb(var(--ink))', fontSize: '12px', fontWeight: '500', textOutline: '2.5px #fff' };

  const options: Highcharts.Options = {
    accessibility: { enabled: false }, // LocationMap hides this from screen readers and lists the places as text.
    chart: {
      height,
      backgroundColor: 'transparent',
      style: { fontFamily: 'inherit' },
      events: {
        // A claim about a region of one country opens on that region, on the world map so its neighbours stay around it.
        load() {
          const chart = this;
          const only = map.map === 'world' && map.places.length === 1 ? map.places[0] : null;
          if (!only?.regions?.length) return;
          void fetch(regionFile(only.code))
            .then((response) => response.json())
            .then((regionTopo: TopoMap) => {
              if (!chart.series?.length) return; // The chart has gone, as the reader moved on.
              const named = matchRegions(regionTopo, only.regions ?? []);
              const keys = named.map((region) => region['hc-key']);
              const shapes = withoutVietnamsIslands(Highcharts.geojson(regionTopo as unknown as Highcharts.GeoJSON)).filter((shape) =>
                keys.includes(String((shape as { properties?: Record<string, unknown> }).properties?.['hc-key'])),
              );
              if (!shapes.length) return; // The world map stays as it is, so a failed match only costs the extra detail.
              // The island groups' own label position would be off, because it counted the polygons just removed.
              const placed = shapes.map(({ properties, ...shape }) => ({
                ...shape,
                properties: { ...properties, 'hc-middle-x': undefined, 'hc-middle-y': undefined, 'hc-middle-lon': undefined, 'hc-middle-lat': undefined },
              }));
              chart.series[0].points
                .find((point) => (point as unknown as { 'hc-key': string })['hc-key'] === only.code)
                ?.update({ color: countryTint, dataLabels: { enabled: false } }, false);
              chart.addSeries(
                {
                  type: 'map',
                  mapData: placed,
                  joinBy: 'hc-key',
                  affectsMapView: false,
                  color: indigo,
                  borderColor: '#fff',
                  borderWidth: 0.6,
                  data: named,
                  tooltip: { pointFormat: '<b>{point.label}</b>' },
                  dataLabels: { enabled: true, format: '{point.label}', allowOverlap: true, align: 'left', x: 10, style: labelStyle },
                } as Highcharts.SeriesOptionsType,
                false,
              );
              (chart as unknown as ChartWithView).mapView.update(fitTo(withIslandRoom(viewOfGeometry(placed, regionMargin))), false);
              chart.redraw();
            })
            .catch(() => undefined);
        },
        drillup() {
          (this as unknown as ChartWithView).mapView.update(fitTo(view), false);
        },
        drilldown(event) {
          const chart = this;
          const code = String((event.point as unknown as { 'hc-key': string })['hc-key']);
          const place = map.places.find((other) => other.code === code);
          if (event.seriesOptions || !place) return;
          chart.showLoading(t('Loading map…'));
          void fetch(regionFile(code))
            .then((response) => response.json())
            .then((regionTopo: TopoMap) => {
              // Vietnam's map carries the islands, because they are part of what it shows.
              const allShapes = Highcharts.geojson(regionTopo as unknown as Highcharts.GeoJSON);
              const named = matchRegions(regionTopo, place.regions ?? []);
              const keys = named.map((region) => region['hc-key']);
              const shapes = code === 'vn' ? allShapes : withoutVietnamsIslands(allShapes);
              // Close on the region the claim names, or the new map fills the frame, so a small country doesn't stay small.
              const [west, south, east, north] = regionTopo.bbox ?? [];
              const nearRegion = viewOfGeometry(
                shapes.filter((shape) => keys.includes(String((shape as { properties?: Record<string, unknown> }).properties?.['hc-key']))),
                regionMargin,
              );
              const regionView: [number, number][] | null =
                code === 'vn'
                  ? vietnamView
                  : nearRegion.length
                    ? withIslandRoom(nearRegion)
                    : north === undefined
                      ? null
                      : [
                          [west, south],
                          [east, north],
                        ];
              if (regionView) (chart as unknown as ChartWithView).mapView.update(fitTo(regionView), false);
              // Another country's view reaching Vietnam keeps both island groups, with their small labels.
              const nearIslands = code === 'vn' || !regionView ? [] : islandsInView(regionView);
              const mapData =
                code === 'vn'
                  ? [...shapes, ...Highcharts.geojson(islands as Highcharts.GeoJSON)]
                  : [...shapes, ...(nearIslands.length ? Highcharts.geojson(islandShapes(islands, nearIslands) as Highcharts.GeoJSON) : [])];
              chart.addSeriesAsDrilldown(event.point, {
                type: 'map',
                name: place.named,
                mapData,
                joinBy: 'hc-key',
                allAreas: true,
                nullColor: 'rgb(var(--line))',
                borderColor: '#fff',
                borderWidth: 0.6,
                color: indigo,
                data: [
                  ...named,
                  ...nearIslands.map((island) => ({
                    'hc-key': island,
                    label: t(island === 'hoang-sa' ? 'Hoàng Sa Islands (Vietnam)' : 'Trường Sa Islands (Vietnam)'),
                    ...drilledIsland,
                    dataLabels: { style: { color: inkSoft, ...locationMap.contextIslandLabel } },
                  })),
                  ...(code === 'vn'
                    ? [
                        { 'hc-key': 'hoang-sa', label: t('Hoàng Sa Islands (Vietnam)'), ...drilledIsland },
                        { 'hc-key': 'truong-sa', label: t('Trường Sa Islands (Vietnam)'), ...drilledIsland },
                      ]
                    : []),
                ],
                dataLabels: { enabled: true, format: '{point.label}', allowOverlap: true, style: labelStyle },
              } as Highcharts.SeriesOptionsType);
            })
            // The world map stays as it is, so a failed download only costs the extra detail.
            .catch(() => undefined)
            .finally(() => chart.hideLoading());
        },
      },
    },
    title: { text: undefined },
    legend: { enabled: false },
    mapView: fitTo(view),
    drilldown: {
      mapZooming: false, // This map's fixed view would undo the zoom, so the view changes along with the map instead.
      activeDataLabelStyle: { ...labelStyle, textDecoration: 'none' },
      breadcrumbs: { floating: true, showFullPath: false, position: { align: 'left' } },
    },
    mapNavigation: {
      enabled: true,
      enableMouseWheelZoom: false, // The wheel keeps scrolling the page.
      buttonOptions: { verticalAlign: 'bottom' },
    },
    tooltip: {
      useHTML: true,
      backgroundColor: 'rgb(var(--surface))',
      borderColor: 'rgb(var(--line-strong))',
      borderRadius: 8,
      shadow: false,
      style: { color: inkSoft, fontSize: '13px' },
      headerFormat: '',
      pointFormat: '<div style="max-width:260px;white-space:normal"><b>{point.label}</b>{point.figures}</div>',
    },
    series: [
      {
        type: 'map',
        mapData: (map.map === 'us' ? withoutUsInsets(topo, codes) : topo) as unknown as Highcharts.GeoJSON,
        joinBy: 'hc-key',
        allAreas: true,
        nullColor: 'rgb(var(--line))',
        borderColor: '#fff',
        borderWidth: 0.6,
        color: indigo,
        data: places,
        states: { hover: { color: indigo, brightness: 0.1 } },
        dataLabels: {
          enabled: true,
          format: '{point.label}',
          allowOverlap: true,
          align: 'left',
          x: 10,
          style: labelStyle,
        },
      },
      ...(shownIslands.length > 0
        ? [
            {
              type: 'map',
              mapData: islandShapes(islands, shownIslands) as unknown as Highcharts.GeoJSON,
              joinBy: 'hc-key',
              affectsMapView: false,
              // The real islands would be too small to see at this scale, so the border thickens them.
              borderWidth: 2.5,
              data: [
                islandPoint('hoang-sa', t('Hoàng Sa Islands (Vietnam)'), { x: 0, y: -24 }),
                islandPoint('truong-sa', t('Trường Sa Islands (Vietnam)'), { x: -22, y: 24 }),
              ].filter((point) => shownIslands.includes(point['hc-key'] as IslandCode)),
              tooltip: { pointFormat: '<b>{point.label}</b>' },
              dataLabels: {
                enabled: !zoomedInVietnam, // The overview labels them then, and here they could be cut off at the edge.
                format: '{point.label}',
                // A phone has no room beside the islands, so each point sets a place above or below them instead.
                ...(narrow
                  ? { align: 'center' as const, verticalAlign: 'middle' as const }
                  : { align: 'left' as const, x: 12, y: 0, verticalAlign: 'middle' as const }),
                allowOverlap: true,
                style: {
                  color: inkSoft,
                  ...(map.map === 'world' && !namesIslands ? locationMap.contextIslandLabel : locationMap.namedIslandLabel),
                },
              },
            } as Highcharts.SeriesOptionsType,
          ]
        : []),
    ],
  };

  const overviewIslands = [
    { 'hc-key': 'hoang-sa', label: islandShort(t('Hoàng Sa Islands (Vietnam)')) },
    { 'hc-key': 'truong-sa', label: islandShort(t('Trường Sa Islands (Vietnam)')), dataLabels: { x: -14 } },
  ];
  const overview: Highcharts.Options = {
    accessibility: { enabled: false },
    chart: {
      width: overviewSize[0],
      height: overviewSize[1],
      spacing: [0, 0, 0, 0],
      backgroundColor: 'transparent',
      style: { fontFamily: 'inherit' },
    },
    title: { text: undefined },
    legend: { enabled: false },
    credits: { enabled: false }, // The main map carries the credit.
    tooltip: { enabled: false },
    mapView: { fitToGeometry: { type: 'MultiPoint', coordinates: vietnamView }, padding: 4 },
    plotOptions: { series: { enableMouseTracking: false, animation: false } },
    series: [
      {
        type: 'map',
        mapData: topo as unknown as Highcharts.GeoJSON,
        joinBy: 'hc-key',
        allAreas: true,
        nullColor: 'rgb(var(--line-strong))',
        borderWidth: 0,
        color: indigo,
        data: places.map((place) => ({ 'hc-key': place['hc-key'], value: 1 })),
      },
      {
        type: 'map',
        mapData: islands as unknown as Highcharts.GeoJSON,
        joinBy: 'hc-key',
        affectsMapView: false,
        borderWidth: 1.5,
        borderColor: islandColor,
        color: islandColor,
        data: overviewIslands,
        dataLabels: {
          enabled: true,
          format: '{point.label}',
          allowOverlap: true,
          y: 11,
          style: { color: inkSoft, fontSize: '10px', fontWeight: '500', textOutline: '2px #fff' },
        },
      },
    ],
  };

  return (
    <div className="relative">
      <HighchartsReact highcharts={Highcharts} constructorType="mapChart" options={options} />
      {zoomedInVietnam && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-line bg-white p-1">
          <HighchartsReact highcharts={Highcharts} constructorType="mapChart" options={overview} />
        </div>
      )}
    </div>
  );
}
