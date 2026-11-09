import { useEffect, useState } from 'react';
import Highcharts from 'highcharts/highmaps';
import HighchartsReact from 'highcharts-react-official';
import { t } from '../../lib/i18n';
import type { RouteMapData } from '../../types/models';
import { drawOcean, graticule } from './globe';

type Stops = RouteMapData['stops'];

/** Find a center on the sphere so routes crossing the date line face the reader. */
function rotation(stops: Stops): Highcharts.ProjectionRotationOption {
  const radians = Math.PI / 180;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const { position: [lon, lat] } of stops) {
    const latitude = lat * radians;
    x += Math.cos(latitude) * Math.cos(lon * radians);
    y += Math.cos(latitude) * Math.sin(lon * radians);
    z += Math.sin(latitude);
  }
  if (Math.hypot(x, y, z) < 1e-8) return [-stops[0].position[0], -stops[0].position[1]];
  return [-Math.atan2(y, x) / radians, -Math.atan2(z, Math.hypot(x, y)) / radians];
}

export default function RoutePlot({ stops, height, distanceKm }: { stops: Stops; height: number; distanceKm: number }) {
  const [topo, setTopo] = useState<Highcharts.GeoJSON | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}maps/world-palestine.topo.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('World map unavailable');
        return response.json();
      })
      .then(setTopo)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  if (failed) return <p className="py-4 text-sm text-ink-muted" role="status">{t('The route map could not be loaded.')}</p>;
  if (!topo) return null;

  const color = '#4338ca';
  const line = { type: 'LineString' as const, coordinates: stops.map(({ position }) => [...position]) };
  const options: Highcharts.Options = {
    accessibility: { enabled: false }, // RouteMap exposes the complete ordered itinerary in HTML.
    chart: {
      map: topo, height, backgroundColor: 'transparent', style: { fontFamily: 'inherit' },
      events: { render: drawOcean },
    },
    title: { text: undefined },
    legend: { enabled: false },
    mapNavigation: { enabled: true, enableMouseWheelZoom: false, buttonOptions: { verticalAlign: 'bottom' } },
    mapView: {
      projection: { name: 'Orthographic', rotation: rotation(stops), projectedBounds: 'world' },
      padding: 16,
      maxZoom: 10,
      ...(distanceKm <= 2500 ? { fitToGeometry: line, padding: 54 } : {}),
    },
    tooltip: { headerFormat: '', pointFormat: '<b>{point.name}</b>' },
    plotOptions: { series: { animation: false, states: { inactive: { opacity: 1 } } } },
    series: [
      {
        type: 'map', allAreas: true, nullColor: '#e0e9d9', borderColor: '#a6b4a1',
        borderWidth: 0.5, enableMouseTracking: false,
      },
      {
        type: 'mapline', data: graticule, affectsMapView: false, nullColor: '#c5cde1',
        lineWidth: 0.5, enableMouseTracking: false,
      },
      {
        type: 'mapline', nullColor: color, lineWidth: 2.5, enableMouseTracking: false,
        data: [{ geometry: line, color }],
      },
      {
        type: 'mappoint', color,
        marker: { symbol: 'circle', radius: 8, lineWidth: 1, lineColor: '#fff' },
        dataLabels: { enabled: true, format: '{point.custom.stop}', y: 0, align: 'center', verticalAlign: 'middle',
          style: { color: '#fff', fontSize: '10px', textOutline: 'none' } },
        data: stops.map(({ name, position: [lon, lat] }, index) => ({ name, lon, lat, custom: { stop: index + 1 } })),
      },
    ],
  };
  return <HighchartsReact highcharts={Highcharts} constructorType="mapChart" options={options} />;
}
