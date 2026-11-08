import { describe, expect, it } from 'vitest';
import type { IncidentMapData } from '../../types/models';
import { incidentRoadPaths, incidentRoadWindow } from './incidentRoads';

const map: IncidentMapData = {
  city: 'Hà Nội', roads: ['Nguyễn Trãi'], position: null, bounds: [105.81, 21, 105.81, 21],
  publisher: 'Example', url: 'https://example.org', quote: 'A crash was reported on Nguyễn Trãi.',
};

describe('Incident road geometry', () => {
  it('limits a local highlight and allows an explicit whole-road window', () => {
    const local = incidentRoadWindow(map)!;
    expect(local[2] - local[0]).toBeLessThan(0.002);
    const wide: IncidentMapData = { ...map, bounds: [105.79, 21, 105.82, 21] };
    expect(incidentRoadWindow(wide)).toBeNull();
    const whole = incidentRoadWindow({ ...wide, wholeRoad: true })!;
    expect(whole[0]).toBeLessThan(105.79);
    expect(whole[2]).toBeGreaterThan(105.82);
  });

  it('clips to the local window and keeps the matching direction on the original carriageway', () => {
    const named = [{ roadClass: 'primary', path: [[105.80, 21], [105.82, 21]] as [number, number][] }];
    const east = { roadClass: 'primary', oneway: 1, path: [[105.80, 21.00001], [105.82, 21.00001]] as [number, number][] };
    const west = { roadClass: 'primary', oneway: 1, path: [[105.82, 20.99999], [105.80, 20.99999]] as [number, number][] };
    const bounds = incidentRoadWindow(map)!;
    expect(incidentRoadPaths(named, [east, west], bounds, [105.83, 21])).toEqual([
      [[bounds[0], 21.00001], [bounds[2], 21.00001]],
    ]);
    expect(incidentRoadPaths(named, [east, west], bounds)).toEqual([]);
    expect(incidentRoadPaths(named, [east], bounds)).toEqual([]);
    expect(incidentRoadPaths(named, [east, west], bounds, undefined, true)).toHaveLength(2);
    expect(incidentRoadPaths(named, [named[0]], bounds)).toHaveLength(1);
    expect(incidentRoadPaths(named, [west], bounds, [105.83, 21])).toEqual([]);
  });
});
