import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { interceptRequests, jsonResponse } from '../../test/http';
import { makeCheck } from '../../test/fixtures';

describe('Server history', () => {
  it('shows the input category instead of zero claims for completed nonfactual inputs', async () => {
    interceptRequests(() => jsonResponse({
      items: [makeCheck({ title: 'Ronaldo GOAT?', claims: [], claimCount: 0, inputCategory: 'subjective' })],
      page: 1, pageSize: 20, total: 1, totalPages: 1,
    }));
    renderApp('/history');
    expect(await screen.findByText('Subjective opinion')).toBeInTheDocument();
    expect(screen.queryByText('0 claims')).not.toBeInTheDocument();
  });

  it('shows an empty history without inserting sample checks', async () => {
    const fetchMock = interceptRequests((url) => {
      expect(url.pathname).toBe('/api/checks');
      return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    });
    renderApp('/history');
    expect(await screen.findByRole('heading', { name: 'No checks yet' })).toBeInTheDocument();
    expect(screen.getByText('Checks you run appear here.')).toBeInTheDocument();
    expect(screen.queryByText(/sample|demo/i)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });

  function historyWith(items: ReturnType<typeof makeCheck>[], refusedId?: string) {
    let rows = items;
    return interceptRequests((url, init) => {
      if (init?.method === 'DELETE') {
        if (url.pathname.endsWith(`/${refusedId}`)) return jsonResponse({ detail: 'Stop this check before deleting it.' }, 422);
        rows = rows.filter((row) => !url.pathname.endsWith(`/${row.id}`));
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ items: rows, page: 1, pageSize: 20, total: rows.length, totalPages: rows.length ? 1 : 0 });
    });
  }

  it('asks before deleting one check, then removes it', async () => {
    const user = userEvent.setup();
    const check = makeCheck({ id: 'chk_one', title: 'Metro claim' });
    const fetchMock = historyWith([check]);
    renderApp('/history');
    expect(await screen.findByRole('link', { name: /Metro claim/ })).toHaveAttribute('href', '/checks/chk_one');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Metro claim' }));
    await user.click(screen.getByRole('button', { name: 'Delete (1)' }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    const dialog = await screen.findByRole('dialog', { name: 'Delete selected checks?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')?.[0]).toContain('/api/check/chk_one');
    expect(await screen.findByRole('heading', { name: 'No checks yet' })).toBeInTheDocument();
  });

  it('cancelling deletes nothing', async () => {
    const user = userEvent.setup();
    const fetchMock = historyWith([makeCheck({ title: 'Metro claim' })]);
    renderApp('/history');
    await screen.findByText('Metro claim');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Metro claim' }));
    await user.click(screen.getByRole('button', { name: 'Delete (1)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete selected checks?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    expect(screen.getByText('Metro claim')).toBeInTheDocument();
  });

  it('deletes multiple selected checks and disables selection for a running check', async () => {
    const user = userEvent.setup();
    const running = makeCheck({ id: 'chk_run', title: 'Running claim', status: 'retrieving' });
    const fetchMock = historyWith([
      running, makeCheck({ id: 'chk_old', title: 'Old claim' }), makeCheck({ id: 'chk_other', title: 'Other claim' }),
    ]);
    renderApp('/history');
    expect(await screen.findByText('Running claim')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('checkbox', { name: 'Select Running claim' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Select Old claim' }));
    await user.click(screen.getByText('Other claim'));
    await user.click(screen.getByRole('button', { name: 'Delete (2)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete selected checks?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Old claim')).not.toBeInTheDocument());
    expect(screen.queryByText('Other claim')).not.toBeInTheDocument();
    expect(screen.getByText('Running claim')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => new URL(String(url), 'http://localhost').pathname))
      .toEqual(['/api/check/chk_old', '/api/check/chk_other']);
  });

  it('keeps only failed deletions selected when the server refuses one check', async () => {
    const user = userEvent.setup();
    historyWith([makeCheck({ id: 'chk_old', title: 'Old claim' }), makeCheck({ id: 'chk_refused', title: 'Metro claim' })], 'chk_refused');
    renderApp('/history');
    await screen.findByText('Metro claim');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Old claim' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Metro claim' }));
    await user.click(screen.getByRole('button', { name: 'Delete (2)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete selected checks?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Stop this check before deleting it.');
    expect(dialog).toHaveTextContent('1 check selected');
    await waitFor(() => expect(screen.queryByText('Old claim')).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Select Metro claim' })).toBeChecked();
  });

  it('shows a backend error without substituting sample records', async () => {
    interceptRequests(() => jsonResponse({ detail: 'Unavailable' }, 503));
    renderApp('/history');
    expect(await screen.findByRole('alert')).toHaveTextContent('History could not be loaded.');
    expect(screen.queryByRole('heading', { name: 'No checks yet' })).not.toBeInTheDocument();
  });
});
