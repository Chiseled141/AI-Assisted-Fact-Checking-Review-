import { viewOfPlaces, viewOfShapes, withIslandRoom, withoutUsInsets, type TopoMap } from './mapViews';
import { describe, expect, it } from 'vitest';
import { islandShapes, islandsInView, withoutVietnamsIslands } from './islands';

describe('islandsInView', () => {
  it('keeps both island groups when a Myanmar-sized regional view reaches Vietnam', () => {
    expect(islandsInView(withIslandRoom([[86, 10], [106, 30]]))).toEqual(['hoang-sa', 'truong-sa']);
    expect(withIslandRoom([[-10, 35], [30, 60]])).toEqual([[-10, 35], [30, 60]]);
  });
  it('keeps the islands on a region that includes them', () => {
    expect(
      islandsInView([
        [102, 7],
        [118, 24],
      ]),
    ).toEqual(['hoang-sa', 'truong-sa']);
  });

  it('keeps only the group a region includes', () => {
    expect(
      islandsInView([
        [105, 13],
        [120, 25],
      ]),
    ).toEqual(['hoang-sa']);
  });

  it('leaves them off a region elsewhere', () => {
    expect(
      islandsInView([
        [122, 28],
        [156, 48],
      ]),
    ).toEqual([]);
    expect(
      islandsInView([
        [-10, 35],
        [30, 60],
      ]),
    ).toEqual([]);
  });
});

describe('islandShapes', () => {
  it('returns only the shapes asked for', () => {
    const shapes = {
      type: 'FeatureCollection',
      features: [{ properties: { 'hc-key': 'hoang-sa' } }, { properties: { 'hc-key': 'truong-sa' } }],
    };
    expect(islandShapes(shapes, ['truong-sa']).features).toEqual([{ properties: { 'hc-key': 'truong-sa' } }]);
  });
});

describe('where a map opens', () => {
  // Two squares: `big` spans 10 degrees each way, and `us-ak` is one of the US map's inset states.
  const topo: TopoMap = {
    arcs: [
      [
        [0, 0],
        [10, 0],
        [0, 10],
        [-10, 0],
        [0, -10],
      ],
      [
        [50, 50],
        [1, 0],
      ],
    ],
    transform: { scale: [1, 1], translate: [-100, 20] },
    objects: {
      default: {
        geometries: [
          { properties: { 'hc-key': 'big', 'hc-middle-lon': -100, 'hc-middle-lat': 20 }, arcs: [[0]] },
          { properties: { 'hc-key': 'us-ak' }, arcs: [[-2]] },
        ],
        'hc-recommended-mapview': { insets: [{ id: 'us-alaska' }] },
      },
    },
  };

  it('fits a place’s whole shape with room around it', () => {
    expect(viewOfShapes(topo, ['big'])).toEqual([
      [-103, 17],
      [-87, 33],
    ]);
    expect(viewOfShapes(topo, ['nothing'])).toEqual([]);
  });

  it('keeps the far edge visible when the label point lies near a corner', () => {
    const view = viewOfPlaces(topo, ['big'], [1, 1]);
    expect(Math.max(...view.map(([, lat]) => lat))).toBeGreaterThan(30);
    expect(Math.max(...view.map(([lon]) => lon))).toBeGreaterThan(-90);
    expect(Math.min(...view.map(([, lat]) => lat))).toBeLessThan(20);
    expect(Math.min(...view.map(([lon]) => lon))).toBeLessThan(-100);
  });

  it('hides Alaska and Hawaii unless the claim names them', () => {
    const hidden = withoutUsInsets(topo, ['big']).objects.default;
    expect(hidden.geometries.map(({ properties }) => properties['hc-key'])).toEqual(['big']);
    expect(hidden['hc-recommended-mapview']).toEqual({ insets: [] });
    expect(withoutUsInsets(topo, ['us-ak'])).toBe(topo);
  });
});

describe('Another country\'s map', () => {
  const polygon = (lon: number, lat: number) => [[[lon, lat], [lon + 0.1, lat], [lon, lat + 0.1], [lon, lat]]];

  it('loses the polygons of Hoàng Sa and Trường Sa and keeps its own land', () => {
    const hainan = polygon(110, 19);
    const paracels = polygon(112, 16.5);
    const spratlys = polygon(114, 10);
    const [shape] = withoutVietnamsIslands([{ geometry: { type: 'MultiPolygon', coordinates: [hainan, paracels, spratlys] } }]);
    expect(shape.geometry?.coordinates).toEqual([hainan]);
  });

  it('leaves a single shape and land outside those waters alone', () => {
    const palawan = polygon(118.5, 9.5);
    const shape = { geometry: { type: 'MultiPolygon', coordinates: [palawan, polygon(120, 15)] } };
    expect(withoutVietnamsIslands([shape])[0]).toEqual(shape);
    const single = { geometry: { type: 'Polygon', coordinates: polygon(112, 16) } };
    expect(withoutVietnamsIslands([single])[0]).toEqual(single);
  });
});
