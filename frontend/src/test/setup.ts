import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Highcharts needs a real browser to load. Tests read the chart's numbers from its table instead.
vi.mock('../features/results/PricePlot', () => ({ default: () => null }));
vi.mock('../features/results/LocationPlot', () => ({ default: () => null }));
vi.mock('../features/results/HeatPlot', () => ({ default: () => null }));
vi.mock('../features/results/CountryPlot', () => ({ default: () => null }));
vi.mock('../features/results/SeatPlot', () => ({ default: () => null }));
vi.mock('../features/results/ElectionPlot', () => ({ default: () => null }));
vi.mock('../features/results/CountryHistory', () => ({ default: () => null }));

// Newer Node versions ship their own (disabled) localStorage global that shadows jsdom's.
// Install a simple in-memory Storage so tests behave the same on every Node version.
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}
Object.defineProperty(window, 'localStorage', { value: new MemoryStorage(), configurable: true });

beforeEach(() => {
  window.localStorage.clear();
  // Every test must supply its own responses. No request can reach an external service.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request in a unit test.')));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
