import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setMockLatency } from '../services/mock/mockCheckService';
import { clearDbCache } from '../services/mock/demoDb';

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
  document.documentElement.classList.remove('dark');
  clearDbCache();
  setMockLatency(0);
});

afterEach(() => {
  cleanup();
});
