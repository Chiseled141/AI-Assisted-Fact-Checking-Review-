import type { IncidentMapData } from '../../../types/models';

type Point = [number, number];
type Bounds = NonNullable<IncidentMapData['bounds']>;
type Road = { path: Point[]; roadClass: string; oneway?: number };
const metersPerDegree = 111_195;
const localRadius = 85;
export const incidentAreaColors = ['#4338ca', '#0369a1', '#b45309', '#a21caf'] as const;

export function incidentRoadWindow(map: IncidentMapData): Bounds | null {
  const { position, bounds, wholeRoad } = map;
  if (!position && !bounds) return null;
  const [x, y] = position ?? [0, 0];
  const [west, south, east, north] = bounds ?? [x, y, x, y];
  const latitude = position?.[1] ?? (south + north) / 2;
  const lonScale = metersPerDegree * Math.cos(latitude * Math.PI / 180);
  if (wholeRoad && bounds) {
    const padding = 30;
    return [west - padding / lonScale, south - padding / metersPerDegree,
      east + padding / lonScale, north + padding / metersPerDegree];
  }
  // Broad search results locate a road, but do not identify the event's part of it.
  if (Math.hypot((east - west) * lonScale, (north - south) * metersPerDegree) > 450) return null;
  const longitude = position?.[0] ?? (west + east) / 2;
  return [
    longitude - localRadius / lonScale, latitude - localRadius / metersPerDegree,
    longitude + localRadius / lonScale, latitude + localRadius / metersPerDegree,
  ];
}

/** Intersect a road edge with the incident bounds, retaining its original direction. */
function clipEdge(a: Point, b: Point, bounds: Bounds): [Point, Point] | null {
  let start = 0;
  let end = 1;
  for (const axis of [0, 1] as const) {
    const delta = b[axis] - a[axis];
    const low = bounds[axis];
    const high = bounds[axis + 2];
    if (!delta) {
      if (a[axis] < low || a[axis] > high) return null;
      continue;
    }
    const entry = (low - a[axis]) / delta;
    const exit = (high - a[axis]) / delta;
    start = Math.max(start, Math.min(entry, exit));
    end = Math.min(end, Math.max(entry, exit));
  }
  if (start >= end) return null;
  const at = (t: number): Point => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return [at(start), at(end)];
}

function clipRoads(roads: Road[], bounds: Bounds): Road[] {
  return roads.flatMap(({ path, ...attributes }) => {
    const parts: Road[] = [];
    for (let i = 1; i < path.length; i += 1) {
      const edge = clipEdge(path[i - 1], path[i], bounds);
      if (!edge) continue;
      const last = parts.at(-1)?.path;
      const endpoint = last?.at(-1);
      if (last && endpoint && endpoint[0] === edge[0][0] && endpoint[1] === edge[0][1]) last.push(edge[1]);
      else parts.push({ ...attributes, path: edge });
    }
    return parts;
  });
}

export function incidentRoadPaths(
  named: Road[], carriageways: Road[], bounds: Bounds, heading?: Point, includeAllDirections = false,
): Point[][] {
  const [west, south, east, north] = bounds;
  const latitude = (south + north) / 2;
  const longitude = (west + east) / 2;
  const lonScale = metersPerDegree * Math.cos(latitude * Math.PI / 180);
  const local = ([x, y]: Point): Point => [(x - longitude) * lonScale, (y - latitude) * metersPerDegree];
  const namedPaths = clipRoads(named, bounds);
  if (!namedPaths.length) return [];

  // Road labels can use stitched geometry. Snap the overlay to the actual road geometry used by the basemap.
  const namedEdges = namedPaths.flatMap(({ path, roadClass }) => path.slice(1).map(
    (end, i) => ({ a: local(path[i]), b: local(end), roadClass }),
  ));
  const onNamedRoad = (point: Point, roadClass: string) => namedEdges.some(({ a, b, roadClass: namedClass }) => {
    if (roadClass !== namedClass) return false;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return false;
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
    return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy) <= 3;
  });
  const matched = clipRoads(carriageways, bounds).flatMap(({ path, roadClass, oneway }) => {
    const points = path.map(local);
    return path.slice(1).flatMap((end, i) => {
      const [ax, ay] = points[i];
      const [bx, by] = points[i + 1];
      const middle: Point = [(ax + bx) / 2, (ay + by) / 2];
      if (!onNamedRoad(middle, roadClass) || !onNamedRoad(points[i], roadClass) || !onNamedRoad(points[i + 1], roadClass)) return [];
      return [{ path: [path[i], end], vector: [bx - ax, by - ay] as Point, oneway }];
    });
  });
  if (heading) {
    const target = local(heading);
    const directed = matched.filter(({ vector: [dx, dy], oneway }) =>
      (oneway === 1 || oneway === -1) &&
      (dx * target[0] + dy * target[1]) * oneway > Math.hypot(dx, dy) * Math.hypot(...target) * 0.65,
    );
    const selected = directed.length ? directed : matched.filter(({ oneway }) => oneway !== 1 && oneway !== -1);
    return selected.map(({ path }) => path);
  }
  // An isolated carriageway in the loaded tiles does not identify the incident's side.
  if (!includeAllDirections && (!matched.length || matched.some(({ oneway }) => oneway === 1 || oneway === -1))) return [];
  return (matched.length ? matched : namedPaths).map(({ path }) => path);
}
