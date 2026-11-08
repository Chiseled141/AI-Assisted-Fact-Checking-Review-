import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { interceptRequests, jsonResponse } from '../../test/http';
import { readItem, RUNNING_CHECK_KEY, writeItem } from '../../lib/storage';
import { forgetAccount } from '../../services/account';

const signedOut = () => jsonResponse({ detail: 'Log in to continue.' }, 401);

describe('Account form', () => {
  it('requires password confirmation when creating an account', async () => {
    interceptRequests(signedOut);
    const user = userEvent.setup();
    renderApp('/login');
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('Confirm password')).toBeRequired();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });

  it('rejects a mismatched confirmation before sending, then signs up and returns to the page it came from', async () => {
    const fetchMock = interceptRequests((url, init) => {
      if (url.pathname === '/api/auth/me') return signedOut();
      expect(url.pathname).toBe('/api/auth/register');
      expect(init?.credentials).toBe('include');
      expect(JSON.parse(String(init?.body))).toEqual({ username: 'test-reader', password: 'preview-password', passwordConfirmation: 'preview-password' });
      return jsonResponse({ id: 'usr_1', username: 'test-reader' }, 201);
    });
    const user = userEvent.setup();
    renderApp('/login?next=%2Fhistory');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Username'), 'test-reader');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'preview-password');
    const confirmation = screen.getByLabelText('Confirm password');
    await user.type(confirmation, 'different-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The passwords do not match.');
    expect(confirmation).toHaveAttribute('aria-invalid', 'true');
    expect(confirmation).toHaveFocus();
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith('/api/auth/me'))).toBe(true);

    fetchMock.mockClear();
    await user.clear(confirmation);
    await user.type(confirmation, 'preview-password');
    // History loads after signing up; it answers with an empty page.
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/checks') return Promise.resolve(jsonResponse({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 }));
      expect(url.pathname).toBe('/api/auth/register');
      expect(JSON.parse(String(init?.body))).toEqual({ username: 'test-reader', password: 'preview-password', passwordConfirmation: 'preview-password' });
      return Promise.resolve(jsonResponse({ id: 'usr_1', username: 'test-reader' }, 201));
    });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'No checks yet' })).toBeInTheDocument();
  });

  it('shows the server’s reason when logging in fails, and keeps the username', async () => {
    interceptRequests((url) => url.pathname === '/api/auth/me' ? signedOut() : jsonResponse({ detail: 'Wrong username or password.' }, 401));
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(screen.getByLabelText('Username'), 'lan');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'not-the-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
    expect(screen.getByLabelText('Username')).toHaveValue('lan');
  });

  it('logs out a signed-in user and forgets their running check', async () => {
    writeItem(RUNNING_CHECK_KEY, 'chk_mine');
    let signedIn = true;
    const fetchMock = interceptRequests((url, init) => {
      if (url.pathname === '/api/auth/me') return signedIn ? jsonResponse({ id: 'usr_1', username: 'lan' }) : signedOut();
      expect(url.pathname).toBe('/api/auth/logout');
      expect(init?.method).toBe('POST');
      signedIn = false;
      return new Response(null, { status: 204 });
    });
    const user = userEvent.setup();
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Signed in as lan' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(readItem(RUNNING_CHECK_KEY)).toBe('');
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/auth/logout'))).toBe(true);
  });

  it('shows the signed-in username in the header, and "Account" when signed out', async () => {
    interceptRequests((url) => url.pathname === '/api/auth/me'
      ? jsonResponse({ id: 'usr_1', username: 'lan' })
      : jsonResponse({ claims: [], link: null }));
    const { unmount } = renderApp('/');
    const link = await screen.findByRole('link', { name: 'Account: lan' });
    expect(link).toHaveTextContent('lan');
    expect(link).toHaveAttribute('href', '/login');
    unmount();

    forgetAccount();
    interceptRequests(signedOut);
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Account' })).toHaveTextContent('Account');
  });

  it('sends a signed-out visitor from History to the login page and back', async () => {
    interceptRequests(signedOut);
    renderApp('/history');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});
