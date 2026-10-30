import { useEffect, useState } from 'react';
import { readItem, writeItem } from './storage';

export type Theme = 'light' | 'dark';

// Keep in sync with the pre-paint script in index.html.
export const THEME_STORAGE_KEY = 'claimtrace.theme';
export const DEFAULT_THEME: Theme = 'dark';

function storedTheme(): Theme | null {
  const value = readItem(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** Current theme plus a toggle. Dark by default; the user's choice is saved and used on every visit. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? DEFAULT_THEME);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    writeItem(THEME_STORAGE_KEY, next);
    setTheme(next);
  }

  return [theme, toggle];
}
