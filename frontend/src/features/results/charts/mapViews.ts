// Where a map opens, worked out from the places it shows.

import { islandsInView } from './islands';

export interface TopoMap {
  objects: {
    default: {
      geometries: { properties: Record<string, unknown>; arcs?: unknown }[];
      'hc-recommended-mapview'?: Record<string, unknown>;
    };
  };
  /** [west, south, east, north] */
  bbox?: number[];
  arcs?: [number, number][][];
  transform?: { scale: [number, number]; translate: [number, number] };
}

const US_INSETS = ['us-ak', 'us-hi'];

/** Where each place's middle is, by code. */
export function middles(topo: TopoMap, codes: string[]): Map<string, [number, number]> {
  const found = new Map<string, [number, number]>();
  for (const { properties } of topo.objects.default.geometries) {
    const lon = Number(properties['hc-middle-lon']);
    const lat = Number(properties['hc-middle-lat']);
    const code = String(properties['hc-key']);
    if (codes.includes(code) && !Number.isNaN(lon) && !Number.isNaN(lat)) found.set(code, [lon, lat]);
  }
  return found;
}

export function viewAround(centers: Iterable<[number, number]>, [marginLon, marginLat]: number[]): [number, number][] {
  return [...centers].flatMap(
    ([lon, lat]) =>
      [
        [lon - marginLon, lat - marginLat],
        [lon + marginLon, lat + marginLat],
      ] as [number, number][],
  );
}

/** Regional views reaching Vietnam keep both island groups and their labels inside the frame. */
export function withIslandRoom(view: [number, number][]): [number, number][] {
  if (!view.length) return view;
  const lons = view.map(([lon]) => lon);
  const lats = view.map(([, lat]) => lat);
  const reachesVietnam = Math.min(...lons) <= 110 && Math.max(...lons) >= 102
    && Math.min(...lats) <= 24 && Math.max(...lats) >= 8;
  return reachesVietnam || islandsInView(view).length > 0 ? [...view, [122, 5], [122, 18]] : view;
}

/** The corners of a place's real shape with some room around it, so a big place is never cut off. */
export function viewOfShapes(topo: TopoMap, codes: string[], room = 0.3): [number, number][] {
  const { arcs, transform } = topo;
  if (!arcs || !transform) return [];
  return topo.objects.default.geometries
    .filter(({ properties }) => codes.includes(String(properties['hc-key'])))
    .flatMap((geometry) => {
      const lons: number[] = [];
      const lats: number[] = [];
      for (const index of [geometry.arcs].flat(Infinity) as number[]) {
        // TopoJSON stores each arc as steps from the last point, and a negative index means the arc reversed.
        let [x, y] = [0, 0];
        for (const [dx, dy] of arcs[index < 0 ? ~index : index]) {
          x += dx;
          y += dy;
          lons.push(x * transform.scale[0] + transform.translate[0]);
          lats.push(y * transform.scale[1] + transform.translate[1]);
        }
      }
      if (!lons.length) return [];
      const [west, east, south, north] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
      const [roomLon, roomLat] = [(east - west) * room, (north - south) * room];
      return [
        [west - roomLon, south - roomLat],
        [east + roomLon, north + roomLat],
      ] as [number, number][];
    });
}

/** A label point can sit near a coast, so keep both the surroundings and each complete shape in view. */
export function viewOfPlaces(topo: TopoMap, codes: string[], margin: number[], room = 0.3): [number, number][] {
  return [...viewAround(middles(topo, codes).values(), margin), ...viewOfShapes(topo, codes, room)];
}

/** The US map draws Alaska and Hawaii in boxes near the Mexican border, which only belong there if the claim names them. */
export function withoutUsInsets(topo: TopoMap, codes: string[]): TopoMap {
  if (codes.some((code) => US_INSETS.includes(code))) return topo;
  const { geometries, 'hc-recommended-mapview': view } = topo.objects.default;
  return {
    ...topo,
    objects: {
      default: {
        ...topo.objects.default,
        geometries: geometries.filter(({ properties }) => !US_INSETS.includes(String(properties['hc-key']))),
        'hc-recommended-mapview': { ...view, insets: [] },
      },
    },
  };
}

/** The box around finished shapes, with room around it. Close on a small region, but never tighter than `least` degrees. */
export function viewOfGeometry(shapes: { geometry?: { coordinates: unknown } | null }[], least: number): [number, number][] {
  const points: [number, number][] = [];
  const collect = (value: unknown) => {
    if (Array.isArray(value) && typeof value[0] === 'number') points.push(value as [number, number]);
    else if (Array.isArray(value)) value.forEach(collect);
  };
  shapes.forEach(({ geometry }) => collect(geometry?.coordinates));
  if (!points.length) return [];
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  return [
    [Math.min(...lons) - least, Math.min(...lats) - least],
    [Math.max(...lons) + least, Math.max(...lats) + least],
  ];
}
