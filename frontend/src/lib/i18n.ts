// Interface language. Text is keyed by its English wording: t() returns the Vietnamese from vi.ts when
// that language is on, and the English otherwise. Check content (claims, reasoning, quotes) stays as written.

import { useSyncExternalStore } from 'react';
import { readItem, writeItem } from './storage';
import { vi } from './vi';

export type Language = 'en' | 'vi';

const STORAGE_KEY = 'claimtrace.language';

let language: Language = readItem(STORAGE_KEY) === 'vi' ? 'vi' : 'en';
const listeners = new Set<() => void>();

function applyToDocument(): void {
  document.documentElement.lang = language;
}
applyToDocument();

export function getLanguage(): Language {
  return language;
}

export function setLanguage(next: Language): void {
  if (next === language) return;
  language = next;
  writeItem(STORAGE_KEY, next);
  applyToDocument();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the caller when the language changes. The app root uses it, which refreshes the whole tree. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage);
}

export function t(english: string, vars?: Record<string, string | number>): string {
  const template = language === 'vi' ? (vi[english] ?? english) : english;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** The locale for dates and times. */
export function locale(): string {
  return language === 'vi' ? 'vi-VN' : 'en-US';
}

/** Text a model wrote itself: its version in the reader's language if it gave one, otherwise as written. */
export function inLanguage(original: string, translations?: Partial<Record<Language, string>> | null): string {
  return translations?.[language] ?? original;
}

/** A label map whose values are translated each time one is read. */
export function translated<K extends string>(labels: Record<K, string>): Record<K, string> {
  return new Proxy(labels, { get: (target, key) => t(target[key as K]) });
}
