import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/renderApp';
import { sourceRegistry } from '../data/sourceRegistry';
import { makeCheck, makeEvidence } from '../test/fixtures';
import { interceptRequests, jsonResponse } from '../test/http';
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

function serveCheck() {
  return interceptRequests((url) => {
    if (url.pathname === '/api/check/chk_test') return jsonResponse(makeCheck());
    if (url.pathname === '/api/claims/clm_test/evidence') return jsonResponse([makeEvidence()]);
    throw new Error(`Unexpected request: ${url}`);
  });
}

async function chooseLanguage(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('radio', { name }));
}

describe('language', () => {
  afterEach(async () => { await act(async () => setLanguage('en')); });

  it('moves between languages with the arrow keys, like a radio group', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const english = screen.getByRole('radio', { name: 'English' });
    expect(english).toHaveAttribute('aria-checked', 'true');

    await act(async () => english.focus());
    await user.keyboard('{ArrowRight}');
    const vietnamese = screen.getByRole('radio', { name: 'Tiếng Việt' });
    expect(vietnamese).toHaveAttribute('aria-checked', 'true');
    expect(vietnamese).toHaveFocus();
    expect(screen.getByRole('radiogroup', { name: 'Ngôn ngữ' })).toBeInTheDocument();
  });

  it('switches the interface from the header, keeps form text, and remembers the choice', async () => {
    const user = userEvent.setup();
    renderApp('/');
    expect(screen.getByRole('link', { name: 'History' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Text to check' }), 'My draft claim');

    await chooseLanguage(user, 'Tiếng Việt');

    expect(screen.getByRole('link', { name: 'Lịch sử' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Văn bản cần kiểm tra' })).toHaveValue('My draft claim');
    expect(document.documentElement.lang).toBe('vi');
    expect(window.localStorage.getItem('claimtrace.language')).toBe('vi');

    await chooseLanguage(user, 'English');
    expect(screen.getByRole('link', { name: 'History' })).toBeInTheDocument();
    expect(getLanguage()).toBe('en');
  });

  it('translates the result page and dates', async () => {
    serveCheck();
    setLanguage('vi');
    renderApp('/checks/chk_test');
    expect(await screen.findByText('Nhận định 1 trên 1')).toBeInTheDocument();
    expect(screen.queryByText('Nguồn đáng tin cậy')).not.toBeInTheDocument();
    expect(formatCalendarDate('2021-11-06')).toMatch(/2021/);
    expect(formatCalendarDate('2021-11-06')).not.toMatch(/November/);
  });

  it('changes interface language without replacing the saved claim or check ID', async () => {
    const fetchMock = serveCheck();
    const user = userEvent.setup();
    setLanguage('vi');
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('The route opened in March 2024.');

    await chooseLanguage(user, 'English');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The route opened in March 2024.');
    expect(fetchMock.mock.calls.filter(([url]) => new URL(String(url), 'http://localhost').pathname === '/api/check/chk_test')).toHaveLength(1);
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
