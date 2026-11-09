import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { makeCheck } from '../../test/fixtures';
import { interceptRequests, jsonResponse } from '../../test/http';

describe('Backend check lifecycle', () => {
  it('opens header panels while keeping the current check visible and can start a new check', async () => {
    interceptRequests((url) => {
      if (url.pathname === '/api/auth/me') return jsonResponse({ id: 'usr_test', username: 'lan' });
      if (url.pathname === '/api/checks') {
        return jsonResponse({ items: [makeCheck({ status: 'retrieving' })], page: 1, pageSize: 20, total: 1, totalPages: 1 });
      }
      return jsonResponse(makeCheck({ status: 'retrieving', claims: [] }));
    });
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('heading', { name: 'Checking claims' })).toBeInTheDocument();
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getByRole('link', { name: 'New check' })).toHaveAttribute('href', '/');
    for (const name of ['Results', 'Follow-up', 'Find a check', 'How it works']) {
      expect(nav.queryByRole('link', { name })).not.toBeInTheDocument();
    }
    const settings = nav.getByRole('button', { name: 'Settings' });
    await user.click(settings);
    const settingsPanel = await screen.findByRole('dialog', { name: 'Settings' });
    expect(within(settingsPanel).getByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Checking claims' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(settings).toHaveFocus();
    expect(nav.getByRole('link', { name: 'New check' })).toHaveAttribute('href', '/');
    await user.click(nav.getByRole('button', { name: 'History' }));
    const history = await screen.findByRole('dialog', { name: 'History' });
    expect(await within(history).findByText('A saved check')).toBeInTheDocument();
    await user.click(nav.getByRole('link', { name: 'New check' }));
    expect(await screen.findByRole('heading', { name: /Trace claims/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Text to check' })).not.toHaveFocus();
    expect(nav.queryByRole('link', { name: 'New check' })).not.toBeInTheDocument();
  });

  it('resumes polling after retrying a failed status request', async () => {
    let requests = 0;
    interceptRequests((url) => {
      if (url.pathname === '/api/auth/me') return jsonResponse({ detail: 'Log in to continue.' }, 401);
      if (++requests === 1) return jsonResponse({ detail: 'Temporary failure' }, 503);
      return jsonResponse(makeCheck({ status: requests === 2 ? 'assessing' : 'completed', claims: [], inputSuggestions: [] }));
    });
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Checking claims' })).toBeInTheDocument();
    expect(await screen.findByText('No factual claim identified')).toBeInTheDocument();
    expect(requests).toBe(3);
  });

  it('shows missing records instead of seeded examples', async () => {
    interceptRequests(() => jsonResponse({ detail: 'Not found.' }, 404));
    renderApp('/checks/unknown');
    expect(await screen.findByRole('heading', { name: 'Check not found' })).toBeInTheDocument();
    expect(screen.getByText('This check was not found on the server.')).toBeInTheDocument();
  });

  it('retries failed checks with their original input and judges', async () => {
    const check = makeCheck({ inputType: 'url', inputUrl: 'https://example.org/story', status: 'failed', errorMessage: 'Search failed.' });
    const fetchMock = interceptRequests((url, init) => {
      if (init?.method === 'POST') return jsonResponse(makeCheck({ id: 'chk_retry', status: 'queued' }), 202);
      return jsonResponse(url.pathname.endsWith('chk_retry') ? makeCheck({ status: 'retrieving', claims: [] }) : check);
    });
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.click(await screen.findByRole('button', { name: 'Run again' }));
    await screen.findByRole('heading', { name: 'Checking claims' });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      inputType: 'url', url: 'https://example.org/story', judgeIds: ['gpt-luna', 'gemma-4-31b'],
    });
  });
});
