import type Highcharts from 'highcharts/highmaps';

export interface GlobeChart extends Highcharts.Chart {
  mapView: {
    projection: { def: { bounds: { x2: number } } };
    projectedUnitsToPixels: (position: { x: number; y: number }) => { x: number; y: number };
    fitToBounds: (bounds?: undefined, padding?: undefined, redraw?: boolean) => void;
    update: (options: Highcharts.MapViewOptions, redraw: boolean) => void;
  };
}

const ocean = new WeakMap<Highcharts.Chart, Highcharts.SVGElement>();

export const graticule: Highcharts.SeriesMaplineDataOptions[] = [
  ...Array.from({ length: 24 }, (_, index) => {
    const lon = index * 15 - 180;
    return { geometry: { type: 'LineString', coordinates: [[lon, -90], [lon, 0], [lon, 90]] } };
  }),
  ...Array.from({ length: 17 }, (_, index) => {
    const lat = index * 10 - 80;
    return {
      geometry: { type: 'LineString', coordinates: Array.from({ length: 73 }, (_, step) => [step * 5 - 180, lat]) },
    };
  }),
];

export function drawOcean(this: Highcharts.Chart) {
  const { mapView } = this as GlobeChart;
  const center = mapView.projectedUnitsToPixels({ x: 0, y: 0 });
  const edge = mapView.projectedUnitsToPixels({ x: mapView.projection.def.bounds.x2, y: 0 });
  let disc = ocean.get(this);
  if (!disc) {
    disc = this.renderer.circle()
      .attr({
        fill: {
          radialGradient: { cx: 0.38, cy: 0.35, r: 0.65 },
          stops: [[0, '#f5f7ff'], [1, '#d9dff6']],
        },
        zIndex: 0,
      })
      .css({ pointerEvents: 'none' })
      .add();
    ocean.set(this, disc);
  }
  disc.attr({ cx: this.plotLeft + center.x, cy: this.plotTop + center.y, r: edge.x - center.x });
}
