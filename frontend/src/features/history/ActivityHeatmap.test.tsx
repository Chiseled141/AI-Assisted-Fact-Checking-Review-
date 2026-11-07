import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { makeCheck } from '../../test/fixtures';
import { interceptRequests, jsonResponse } from '../../test/http';

beforeEach(() => {
  const createdAt = new Date().toISOString();
  const checks = [makeCheck({ createdAt }), makeCheck({ id: 'chk_failed', status: 'failed', createdAt })];
  interceptRequests((url) => {
    if (url.pathname !== '/api/checks') throw new Error(`Unexpected request: ${url}`);
    const items = url.searchParams.get('status') === 'failed' ? checks.slice(1) : checks;
    return jsonResponse({ items, page: 1, pageSize: 100, total: items.length, totalPages: 1 });
  });
});

describe('History heatmap', () => {
  it('counts the checks per day, with the same numbers in a table for screen readers', async () => {
    renderApp('/history');

    const chart = await screen.findByRole('img', { name: /^\d+ checks? in the past year$/ });
    const total = parseInt(chart.getAttribute('aria-label')!, 10);
    expect(total).toBeGreaterThan(0);

    const table = screen.getByRole('table', { name: 'Checks per day' });
    const perDay = within(table)
      .getAllByRole('cell')
      .map((cell) => parseInt(cell.textContent!, 10));
    expect(perDay.reduce((sum, count) => sum + count, 0)).toBe(total);
  });

  it('keeps counting every check when the list below is filtered', async () => {
    const user = userEvent.setup();
    renderApp('/history');

    const chart = await screen.findByRole('img', { name: /in the past year$/ });
    const label = chart.getAttribute('aria-label');
    await user.click(screen.getByRole('button', { name: 'Failed' }));
    expect(screen.getByRole('img', { name: /in the past year$/ })).toHaveAttribute('aria-label', label);
  });
});
