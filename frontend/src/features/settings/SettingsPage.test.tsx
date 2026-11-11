import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
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
});
