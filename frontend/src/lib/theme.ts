import { useSyncExternalStore } from 'react';
import { readItem, writeItem } from './storage';

export type Theme = 'light' | 'dark' | 'system';

const storageKey = 'claimtrace.theme';
const deviceTheme = window.matchMedia?.('(prefers-color-scheme: dark)');
const savedTheme = readItem(storageKey);
let theme: Theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'system';
const listeners = new Set<() => void>();

function applyTheme() {
  const dark = theme === 'dark' || (theme === 'system' && deviceTheme?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141718' : '#f7f8f5');
}

applyTheme();
deviceTheme?.addEventListener('change', applyTheme);

export function setTheme(next: Theme) {
  if (next === theme) return;
  theme = next;
  writeItem(storageKey, next);
  applyTheme();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useTheme() {
  return useSyncExternalStore(subscribe, () => theme);
}
