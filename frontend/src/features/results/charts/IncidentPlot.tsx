import { LngLatBounds, Map, Marker, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../../lib/i18n';
import type { IncidentMapArea, IncidentMapData } from '../../../types/models';
import { incidentAreaColors, incidentRoadPaths, incidentRoadWindow } from './incidentRoads';

const style = 'https://tiles.openfreemap.org/styles/positron';
const incidentColor = incidentAreaColors[0];
setWorkerUrl(workerUrl);

const tiles = 'openmaptiles';

function readRoads(plot: Map, sourceLayer: string, names?: string[]) {
  return plot.querySourceFeatures(tiles, { sourceLayer }).flatMap(({ geometry, properties }) => {
    if (names && !names.includes(String(properties.name ?? '').normalize('NFC').toLowerCase())) return [];
    const paths: number[][][] = geometry.type === 'LineString' ? [geometry.coordinates]
      : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
    return paths.map((path) => ({
      path: path as [number, number][],
      roadClass: String(properties.class ?? ''),
      oneway: Number(properties.oneway),
    }));
  });
}

function approximateArea([west, south, east, north]: NonNullable<IncidentMapData['bounds']>, fraction: number) {
  const x = (west + east) / 2;
  const y = (south + north) / 2;
  const ring = Array.from({ length: 32 }, (_, index) => {
    const angle = index * 2 * Math.PI / 32;
    return [x + Math.cos(angle) * (east - west) * fraction, y + Math.sin(angle) * (north - south) * fraction];
  });
  ring.push(ring[0]);
  return { type: 'MultiPolygon' as const, coordinates: [[ring]] };
}

function highlightArea(plot: Map, area: IncidentMapArea, id: string, color: string, fraction = 0.5) {
  const [west, south, east, north] = area.bounds;
  const geometry = area.geometry ?? (area.road
    ? { type: 'Polygon' as const, coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] }
    : approximateArea(area.bounds, fraction));
  plot.addSource(id, {
    type: 'geojson',
    data: { type: 'Feature', properties: {}, geometry },
  });
  const below = plot.getLayer('highway-name-path') ? 'highway-name-path' : undefined;
  plot.addLayer({
    id: `${id}-fill`, type: 'fill', source: id,
    paint: { 'fill-color': color, 'fill-opacity': 0.17 },
  }, below);
  plot.addLayer({
    id: `${id}-outline`, type: 'line', source: id,
    paint: { 'line-color': color, 'line-width': 2, ...(!area.geometry ? { 'line-dasharray': [2, 2] } : {}) },
  }, below);
}

function roadNames(roads: string[]) {
  return roads.flatMap((road) => {
    const name = road.normalize('NFC').trim().toLowerCase();
    const ring = name.match(/^(?:(?:đường\s+)?cao tốc\s+|đường\s+)?(vành đai\s+\d+(?:[.,]\d+)?)(?:\s+(?:tp\.?\s*)?hà nội)?$/i)?.[1];
    if (ring) return [ring, `đường ${ring}`, `đường cao tốc ${ring}`, `đường cao tốc ${ring} tp. hà nội`];
    const base = name.replace(/^(đường|phố)\s+/, '');
    return base === name ? [name, `đường ${name}`, `phố ${name}`] : [name, base];
  });
}

function highlightRoads(plot: Map, map: IncidentMapData, bounds: NonNullable<IncidentMapData['bounds']>): boolean {
  if (!map.roads.length || !plot.getSource(tiles)) return false;
  const paths = incidentRoadPaths(
    readRoads(plot, 'transportation_name', roadNames(map.roads)), readRoads(plot, 'transportation'), bounds, map.toward,
    Boolean(map.position || map.wholeRoad),
  );
  if (!paths.length) {
    if (map.position || map.wholeRoad) return false;
    highlightArea(plot, { name: map.roads[0], bounds }, 'incident-area', incidentColor, 0.35);
    return true;
  }
  addRoadLayer(plot, 'incident-roads', paths, incidentColor);
  const view = new LngLatBounds();
  for (const path of paths) {
    for (const point of path) view.extend(point);
  }
  if (map.position) view.extend(map.position);
  plot.fitBounds(view, { padding: 42, maxZoom: 17.5, duration: 0 });
  return false;
}

function addRoadLayer(plot: Map, id: string, paths: [number, number][][], color: string, approximate = false) {
  const source = `${id}-paths`;
  plot.addSource(source, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiLineString', coordinates: paths },
    },
    maxzoom: 19,
    tolerance: 0,
  });
  const below = plot.getLayer('highway-name-path') ? 'highway-name-path' : undefined;
  plot.addLayer({
    id,
    type: 'line',
    source,
    ...(approximate ? { minzoom: 14 } : {}),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 16, 4, 19, 7],
      ...(approximate ? { 'line-dasharray': [2, 2] } : {}),
    },
  }, below);

}

function drawReportedAreas(plot: Map, areas: IncidentMapArea[]) {
  areas.forEach((area, index) => {
    const color = incidentAreaColors[index];
    const id = `incident-reported-area-${index}`;
    const road = area.road;
    highlightArea(plot, area, id, color);
    if (!road || !plot.getSource(tiles)) return;
    const drawRoad = () => {
      // At overview zoom the tiles can omit named pieces of the road.
      if (plot.getZoom() < 14) return;
      const paths = incidentRoadPaths(readRoads(plot, 'transportation_name', roadNames([road])),
        readRoads(plot, 'transportation'), area.bounds, undefined, true);
      if (!paths.length) return;
      plot.off('idle', drawRoad);
      addRoadLayer(plot, id, paths, color, true);
      plot.setLayerZoomRange(`${id}-fill`, 0, 14);
      plot.setLayerZoomRange(`${id}-outline`, 0, 14);
    };
    plot.on('idle', drawRoad);
    drawRoad();
  });
}

export default function IncidentPlot({ map, place }: { map: IncidentMapData; place: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'area' | 'error'>('loading');
  const zoomIn = t('Zoom in');
  const zoomOut = t('Zoom out');

  useEffect(() => {
    if (!container.current) return;
    let plot: Map | undefined;
    const { position, bounds, quote } = map;
    const roadWindow = map.areas?.length ? null : incidentRoadWindow(map);
    setStatus('loading');
    try {
      plot = new Map({
        container: container.current,
        style,
        bounds: roadWindow ?? bounds ?? undefined,
        center: position ?? undefined,
        zoom: position ? 16 : undefined,
        fitBoundsOptions: { padding: 40, maxZoom: roadWindow ? 17 : 15 },
        minZoom: map.areas?.length ? 8 : 10,
        cooperativeGestures: true,
        dragRotate: false,
        touchPitch: false,
        locale: { 'NavigationControl.ZoomIn': zoomIn, 'NavigationControl.ZoomOut': zoomOut },
      });
      plot.addControl(new NavigationControl({ showCompass: false }));
      plot.once('idle', () => {
        if (plot && map.areas?.length) drawReportedAreas(plot, map.areas);
        const area = plot && roadWindow && highlightRoads(plot, map, roadWindow);
        setStatus(area ? 'area' : 'ready');
      });
      plot.on('error', () => setStatus((state) => state === 'loading' ? 'error' : state));
      if (position) {
        const popup = document.createElement('div');
        const name = document.createElement('strong');
        const passage = document.createElement('p');
        name.textContent = place;
        passage.textContent = quote;
        passage.className = 'mt-1';
        popup.append(name, passage);
        const marker = new Marker({ color: incidentColor });
        marker.getElement().setAttribute('aria-label', place);
        marker.setLngLat(position).setPopup(new Popup({ offset: 24 }).setDOMContent(popup)).addTo(plot);
      }
    } catch {
      setStatus('error');
    }
    return () => plot?.remove();
  }, [map, place, zoomIn, zoomOut]);

  return (
    <>
      <div ref={container} className="h-full w-full" aria-label={place} />
      {status !== 'ready' && (
        <p role="status" className="pointer-events-none absolute left-3 top-3 rounded-lg bg-white px-3 py-2 text-ink-soft">
          {status === 'area'
            ? t(map.toward ? 'Approximate incident area' : 'Travel direction unknown')
            : t(status === 'error' ? 'Could not load the interactive map.' : 'Loading map')}
        </p>
      )}
    </>
  );
}
