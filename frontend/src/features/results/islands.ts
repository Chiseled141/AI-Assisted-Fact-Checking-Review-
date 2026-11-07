// Hoàng Sa and Trường Sa, which the map collection leaves out. Their shapes are in public/maps/vn-islands.geo.json.

export type IslandCode = 'hoang-sa' | 'truong-sa';

/** The middle of each island group, as [longitude, latitude]. */
const islandMiddles: Record<IslandCode, [number, number]> = {
  'hoang-sa': [111.96, 16.38],
  'truong-sa': [114.6, 9.69],
};

const allIslands = Object.keys(islandMiddles) as IslandCode[];

/** The islands inside a view, so a map of the world or of a region elsewhere doesn't carry them. */
export function islandsInView(view: [number, number][]): IslandCode[] {
  const lons = view.map(([lon]) => lon);
  const lats = view.map(([, lat]) => lat);
  return allIslands.filter((code) => {
    const [lon, lat] = islandMiddles[code];
    return lon >= Math.min(...lons) && lon <= Math.max(...lons) && lat >= Math.min(...lats) && lat <= Math.max(...lats);
  });
}

interface FeatureCollection {
  features: { properties: { 'hc-key': string } }[];
}

/** The shapes of only these islands. */
export function islandShapes<T>(shapes: T, codes: IslandCode[]): T {
  const collection = shapes as unknown as FeatureCollection;
  return {
    ...collection,
    features: collection.features.filter(({ properties }) => (codes as string[]).includes(properties['hc-key'])),
  } as unknown as T;
}

// Where Hoàng Sa and Trường Sa lie. A polygon of another country's region inside this box is one of them.
const ISLAND_WATERS = { west: 110.5, east: 118, south: 6, north: 17.5 };

type Ring = [number, number][];
interface RegionShape {
  geometry?: { type: string; coordinates: unknown } | null;
}

const ringMiddle = (ring: Ring): [number, number] => [
  ring.reduce((sum, [lon]) => sum + lon, 0) / ring.length,
  ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length,
];
const inIslandWaters = ([lon, lat]: [number, number]) =>
  lon >= ISLAND_WATERS.west && lon <= ISLAND_WATERS.east && lat >= ISLAND_WATERS.south && lat <= ISLAND_WATERS.north;

/**
 * The Highcharts map of another country can draw Hoàng Sa and Trường Sa as part of its own region, such as China's Hainan.
 * They are Vietnam's, so those polygons are removed. It also keeps them out of the region's size and label position.
 */
export function withoutVietnamsIslands<T extends RegionShape>(shapes: T[]): T[] {
  return shapes.map((shape) => {
    const { geometry } = shape;
    if (geometry?.type !== 'MultiPolygon') return shape;
    const kept = (geometry.coordinates as Ring[][]).filter((polygon) => !inIslandWaters(ringMiddle(polygon[0])));
    return kept.length ? { ...shape, geometry: { ...geometry, coordinates: kept } } : shape;
  });
}
