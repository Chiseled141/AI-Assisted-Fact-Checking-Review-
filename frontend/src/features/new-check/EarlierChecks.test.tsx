import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { interceptRequests, jsonResponse } from '../../test/http';

const earlier = {
  claims: [{
    checkId: 'chk_old', claimId: 'clm_old', position: 2, text: 'The line opened on 6 November 2021.',
    verdict: 'supported', checkedAt: '2026-11-05T08:00:00+00:00', similarity: 0.96,
  }],
  link: null,
};

describe('Checked before', () => {
  it('shows an earlier verdict for the same claim before anything is sent', async () => {
    const fetchMock = interceptRequests((url) => {
      if (url.pathname === '/api/checks/similar') return jsonResponse(earlier);
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderApp('/');
    await user.type(screen.getByRole('textbox', { name: 'Text to check' }), 'The line opened on 6 November 2021');
    const note = await screen.findByRole('region', { name: 'Checked before' });
    expect(note).toHaveTextContent('The line opened on 6 November 2021.');
    expect(note).toHaveTextContent('Supported');
    expect(screen.getByRole('link', { name: /Open result/ })).toHaveAttribute('href', '/checks/chk_old?claim=2');
    // Only the lookup ran: nothing was checked, so nothing was paid for.
    expect(fetchMock.mock.calls.every(([, init]) => JSON.parse(String(init?.body)).text)).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/check'))).toBe(false);
  });

  it('stays quiet for short text and when nothing matches', async () => {
    const fetchMock = interceptRequests(() => jsonResponse({ claims: [], link: null }));
    const user = userEvent.setup();
    renderApp('/');
    await user.type(screen.getByRole('textbox', { name: 'Text to check' }), 'Short');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'Text to check' }), ' text that matches nothing saved');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(fetchMock).toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Checked before' })).not.toBeInTheDocument();
  });
});
