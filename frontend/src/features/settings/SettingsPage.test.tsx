import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { interceptRequests, jsonResponse } from '../../test/http';

it('changes the app theme from Settings and keeps the language switcher in the header', async () => {
  const user = userEvent.setup();
  renderApp('/settings');

  const appearance = within(screen.getByRole('group', { name: 'Appearance' }));
  expect(appearance.getByRole('radio', { name: 'Follow device' })).toBeChecked();
  expect(within(screen.getByRole('banner')).getByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
  expect(screen.getAllByRole('radiogroup', { name: 'Language' })).toHaveLength(1);

  await user.click(appearance.getByRole('radio', { name: 'Dark' }));
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(localStorage.getItem('claimtrace.theme')).toBe('dark');

  await user.click(appearance.getByRole('radio', { name: 'Light' }));
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  expect(localStorage.getItem('claimtrace.theme')).toBe('light');

  await user.click(appearance.getByRole('radio', { name: 'Follow device' }));
  expect(localStorage.getItem('claimtrace.theme')).toBe('system');
});

describe('Search preferences', () => {
  it('saves a custom endpoint with two judges, clears the key field, and can return to the default provider', async () => {
    const user = userEvent.setup();
    const updates: Record<string, unknown>[] = [];
    let account: Record<string, unknown> = { id: 'usr_test', username: 'lan', apiProvider: null, hasApiKey: false };
    interceptRequests((url, init) => {
      if (url.pathname === '/api/auth/me') {
        if (init?.method === 'PATCH') {
          const patch = JSON.parse(String(init.body));
          updates.push(patch);
          account = { ...account, apiProvider: patch.apiProvider, hasApiKey: Boolean(patch.apiProvider) };
        }
        return jsonResponse(account);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    renderApp('/settings');
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Use a third-party API' })).toBeEnabled());
    const toggle = screen.getByRole('switch', { name: 'Use a third-party API' });
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByRole('combobox', { name: 'Tavily search model' })).toBeDisabled();
    await user.type(screen.getByLabelText('API base URL'), 'https://models.example.com/v1');
    await user.type(screen.getByLabelText('API key'), 'private-test-key');
    await user.type(screen.getByLabelText('Extraction, search & follow-up model'), 'shared-model');
    await user.type(screen.getByLabelText('First judge model'), 'judge-a');
    await user.type(screen.getByLabelText('Second judge model'), 'judge-a');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter two different judge model IDs.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(updates).toHaveLength(0);
    await user.clear(screen.getByLabelText('Second judge model'));
    await user.type(screen.getByLabelText('Second judge model'), 'judge-b');
    await user.click(screen.getByRole('switch', { name: 'JSON response format' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('API settings saved.');
    expect(updates).toEqual([{
      apiProvider: { baseUrl: 'https://models.example.com/v1', model: 'shared-model', judgeModels: ['judge-a', 'judge-b'], supportsJsonMode: false },
      apiKey: 'private-test-key',
    }]);
    expect(screen.getByLabelText('API key')).toHaveValue('');
    expect(screen.getByLabelText('API key')).not.toBeRequired();
    expect(JSON.stringify(localStorage)).not.toContain('private-test-key');
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates[1]).toEqual({ apiProvider: null });
    expect(screen.getByRole('combobox', { name: 'Tavily search model' })).toBeEnabled();
  });

  it('keeps saved endpoint choices after a restart and asks for the lost key', async () => {
    interceptRequests((url) => {
      if (url.pathname === '/api/auth/me') return jsonResponse({
        id: 'usr_test', username: 'lan', hasApiKey: false,
        apiProvider: { baseUrl: 'https://models.example.com/v1', model: 'shared-model', judgeModels: ['judge-a', 'judge-b'], supportsJsonMode: true },
      });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderApp('/settings');
    expect(await screen.findByRole('status')).toHaveTextContent('Re-enter your custom API key in Settings to use this endpoint.');
    expect(screen.getByLabelText('API base URL')).toHaveValue('https://models.example.com/v1');
    expect(screen.getByLabelText('API key')).toBeRequired();
  });

  it('saves both preferences together and reopens the panel with the saved values', async () => {
    const user = userEvent.setup();
    const updates: unknown[] = [];
    let account = { id: 'usr_test', username: 'lan', preferredSearchModelId: null, preferredSourceLanguage: 'en' };
    interceptRequests((url, init) => {
      if (url.pathname === '/api/auth/me') {
        if (init?.method === 'PATCH') {
          const patch = JSON.parse(String(init.body));
          updates.push(patch);
          account = { ...account, ...patch };
        }
        return jsonResponse(account);
      }
      if (url.pathname === '/api/checks') return jsonResponse({ items: [], totalPages: 1 });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderApp('/');
    await screen.findByRole('button', { name: 'Account: lan' });
    const settings = screen.getByRole('button', { name: 'Settings' });
    await user.click(settings);
    const panel = within(screen.getByRole('dialog', { name: 'Settings' }));
    const select = panel.getByRole('combobox', { name: 'Tavily search model' });
    const language = panel.getByRole('combobox', { name: 'Preferred source language' });
    expect(language).toHaveTextContent('English');
    await user.click(select);
    const modelOptions = panel.getByRole('listbox', { name: 'Tavily search model' });
    expect(within(modelOptions).getByRole('option', { name: 'Server default', selected: true })).toBeVisible();
    await user.click(within(modelOptions).getByRole('option', { name: /DeepSeek Flash/ }));
    await user.click(language);
    await user.keyboard('{Escape}');
    expect(panel.queryByRole('listbox')).not.toBeInTheDocument();
    expect(language).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}{Enter}');
    expect(language).toHaveTextContent('Tiếng Việt');
    await user.click(panel.getByRole('button', { name: 'Save' }));
    expect(await panel.findByRole('status')).toHaveTextContent('Search preferences saved.');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    await user.click(settings);
    const reopened = within(screen.getByRole('dialog', { name: 'Settings' }));
    const saved = reopened.getByRole('combobox', { name: 'Tavily search model' });
    expect(saved).toHaveTextContent('DeepSeek Flash');
    expect(reopened.getByRole('combobox', { name: 'Preferred source language' })).toHaveTextContent('Tiếng Việt');
    await user.click(saved);
    await user.click(reopened.getByRole('option', { name: 'Server default' }));
    await user.click(reopened.getByRole('button', { name: 'Save' }));
    expect(await reopened.findByRole('status')).toHaveTextContent('Search preferences saved.');
    expect(updates).toEqual([{ preferredSearchModelId: 'deepseek-flash', preferredSourceLanguage: 'vi' }, { preferredSearchModelId: null }]);
  });

  it('saves a search prompt and search limits, and stepping back to the default clears a limit', async () => {
    const user = userEvent.setup();
    const updates: unknown[] = [];
    let account: Record<string, unknown> = {
      id: 'usr_test', username: 'lan', preferredSourceLanguage: 'en',
      searchInstructions: null, searchOptions: { sourcesPerClaim: null, searchesPerClaim: null, searchOutsideList: null },
    };
    interceptRequests((url, init) => {
      if (url.pathname === '/api/auth/me') {
        if (init?.method === 'PATCH') {
          const patch = JSON.parse(String(init.body));
          updates.push(patch);
          account = { ...account, ...patch };
        }
        return jsonResponse(account);
      }
      if (url.pathname === '/api/checks') return jsonResponse({ items: [], totalPages: 1 });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderApp('/settings');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search prompt' })).toBeEnabled());
    const note = screen.getByRole('textbox', { name: 'Search prompt' });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await user.type(note, '  Prefer official statistics.  ');
    expect(screen.getByText('31/500')).toBeInTheDocument();
    const sources = within(screen.getByRole('group', { name: 'Sources per claim' }));
    expect(sources.getByText('5')).toBeInTheDocument();
    expect(sources.getByText('default')).toBeVisible();
    await user.click(sources.getByRole('button', { name: 'Fewer: Sources per claim' }));
    await user.click(sources.getByRole('button', { name: 'Fewer: Sources per claim' }));
    expect(sources.getByText('3')).toBeInTheDocument();
    const outside = screen.getByRole('switch', { name: 'Search beyond approved sources' });
    expect(outside).toBeChecked();
    await user.click(outside);
    expect(outside).not.toBeChecked();
    await user.click(save);
    expect(await screen.findByRole('status')).toHaveTextContent('Search preferences saved.');

    await user.click(sources.getByRole('button', { name: 'More: Sources per claim' }));
    await user.click(sources.getByRole('button', { name: 'More: Sources per claim' }));
    await user.click(save);
    await waitFor(() => expect(updates).toHaveLength(2));
    const unset = { searchDepth: null, claimsPerCheck: null, blockedDomains: null };
    expect(updates).toEqual([
      {
        searchInstructions: 'Prefer official statistics.',
        searchOptions: { sourcesPerClaim: 3, searchesPerClaim: null, searchOutsideList: false, ...unset },
      },
      { searchOptions: { sourcesPerClaim: null, searchesPerClaim: null, searchOutsideList: false, ...unset } },
    ]);
  });

  it('saves blocked sites, search depth and a claim limit', async () => {
    const user = userEvent.setup();
    const updates: { searchOptions: Record<string, unknown> }[] = [];
    let account: Record<string, unknown> = { id: 'usr_test', username: 'lan', preferredSourceLanguage: 'en' };
    interceptRequests((url, init) => {
      if (url.pathname === '/api/auth/me') {
        if (init?.method === 'PATCH') {
          const patch = JSON.parse(String(init.body));
          updates.push(patch);
          account = { ...account, ...patch };
        }
        return jsonResponse(account);
      }
      if (url.pathname === '/api/checks') return jsonResponse({ items: [], totalPages: 1 });
      throw new Error(`Unexpected request: ${url}`);
    });
    renderApp('/settings');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Blocked sources' })).toBeEnabled());
    const blocked = screen.getByRole('textbox', { name: 'Blocked sources' });

    await user.type(blocked, 'not a site{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('“not” is not a website address.');
    await user.clear(blocked);
    await user.type(blocked, 'https://www.Example.com/news{Enter}');
    await user.type(blocked, 'tabloid.co.uk,');
    expect(screen.getByRole('button', { name: 'Remove example.com' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove tabloid.co.uk' }));

    await user.click(screen.getByRole('switch', { name: 'Advanced search' }));
    await user.click(screen.getByRole('button', { name: 'Fewer: Claims per check' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Search preferences saved.');
    expect(updates[0].searchOptions).toMatchObject({
      blockedDomains: ['example.com'], searchDepth: 'advanced', claimsPerCheck: 4,
    });
  });
});
