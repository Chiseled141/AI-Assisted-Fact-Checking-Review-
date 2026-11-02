import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/renderApp';
import { sourceRegistry } from '../data/sourceRegistry';
import { checkService } from '../services';
import { loadDb } from '../services/mock/demoDb';
import { formatCalendarDate } from './format';
import { getLanguage, setLanguage, t } from './i18n';
import { isVietnameseSource } from './sources';
import { vi as viText } from './vi';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

function checkClaimsLanguage(check: { id: string }) {
  return loadDb().checks[check.id].language;
}

describe('language', () => {
  afterEach(() => setLanguage('en'));

  it('switches the interface from the header, keeps form text, and remembers the choice', async () => {
    const user = userEvent.setup();
    renderApp('/');
    expect(screen.getByRole('link', { name: 'History' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Text to check' }), 'My draft claim');

    await user.click(screen.getByRole('button', { name: 'Tiếng Việt' }));

    expect(screen.getByRole('link', { name: 'Lịch sử' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Văn bản cần kiểm tra' })).toHaveValue('My draft claim');
    expect(document.documentElement.lang).toBe('vi');
    expect(window.localStorage.getItem('claimtrace.language')).toBe('vi');

    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('link', { name: 'History' })).toBeInTheDocument();
    expect(getLanguage()).toBe('en');
  });

  it('translates the result page and dates', async () => {
    setLanguage('vi');
    renderApp('/checks/chk_demo_real');
    expect(await screen.findByText('Nhận định 1 trên 2')).toBeInTheDocument();
    expect(screen.getAllByText('Nguồn đáng tin cậy').length).toBeGreaterThan(0);
    expect(formatCalendarDate('2021-11-06')).toMatch(/2021/);
    expect(formatCalendarDate('2021-11-06')).not.toMatch(/November/);
  });

  it('swaps the real example for its Vietnamese version, built on Vietnamese newspapers', async () => {
    const user = userEvent.setup();
    setLanguage('vi');
    renderApp('/checks/chk_demo_real');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/Cát Linh - Hà Đông chính thức vận hành/);
    expect(await screen.findByText('Chính thức vận hành thương mại đường sắt Cát Linh - Hà Đông')).toBeInTheDocument();
    expect(screen.queryByText('Hanoi gets country’s 1st metro service')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByText('Hanoi gets country’s 1st metro service')).toBeInTheDocument();
  });

  it('lists only the example in the current language in history', async () => {
    setLanguage('vi');
    renderApp('/history');
    expect(await screen.findByText(/^Tuyến đường sắt đô thị Cát Linh/)).toBeInTheDocument();
    expect(screen.queryByText(/^Hanoi’s Cát Linh/)).not.toBeInTheDocument();
  });

  it('uses Vietnamese sources for a new check started in Vietnamese', async () => {
    setLanguage('vi');
    const check = await checkService.createCheck({ inputType: 'text', text: 'Một nhận định đủ dài để kiểm tra.', scenario: 'completed' });
    expect(checkClaimsLanguage(check)).toBe('vi');
  });

  it('puts Vietnamese newspapers first in Vietnamese', () => {
    expect(isVietnameseSource('https://vnexpress.net/a')).toBe(true);
    expect(isVietnameseSource('https://nhandan.vn/a')).toBe(true);
    expect(isVietnameseSource('https://en.baochinhphu.vn/a')).toBe(false);
    expect(isVietnameseSource('https://www.reuters.com/a')).toBe(false);
  });

  it('fills placeholders', () => {
    setLanguage('vi');
    expect(t('Claim {position} of {count}', { position: 1, count: 4 })).toBe('Nhận định 1 trên 4');
  });

  it('has Vietnamese for every interface string and source description', () => {
    const root = resolve(process.cwd(), 'src');
    const missing = new Set<string>();
    for (const file of sourceFiles(root)) {
      if (file.endsWith('lib/i18n.ts') || file.endsWith('lib/vi.ts')) continue;
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
        if (!(match[1] in viText)) missing.add(match[1]);
      }
    }
    for (const source of sourceRegistry) {
      if (source.about && !(source.about in viText)) missing.add(source.about);
    }
    expect([...missing]).toEqual([]);
  });
});
