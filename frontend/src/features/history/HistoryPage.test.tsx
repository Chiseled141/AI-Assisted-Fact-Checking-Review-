import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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

  it('shows a backend error without substituting sample records', async () => {
    interceptRequests(() => jsonResponse({ detail: 'Unavailable' }, 503));
    renderApp('/history');
    expect(await screen.findByRole('alert')).toHaveTextContent('History could not be loaded.');
    expect(screen.queryByRole('heading', { name: 'No checks yet' })).not.toBeInTheDocument();
  });
});
