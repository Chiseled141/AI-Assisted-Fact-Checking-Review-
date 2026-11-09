import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { interceptRequests, jsonResponse } from '../../test/http';
import { renderApp } from '../../test/renderApp';

describe('Account profile', () => {
  it('shows the username as text and saves avatar changes', async () => {
    let account = { id: 'usr_test', username: 'lan', avatar: null as string | null, preferredSourceLanguage: null as string | null };
    const thumbnail = 'data:image/webp;base64,dGh1bWI=';
    const requests: object[] = [];
    interceptRequests((url, init) => {
      if (url.pathname !== '/api/auth/me') return jsonResponse({ items: [], totalPages: 1 });
      if (init?.method === 'PATCH') {
        const changes = JSON.parse(String(init.body));
        requests.push(changes);
        account = { ...account, ...changes, avatar: changes.avatar ? thumbnail : account.avatar };
      }
      return jsonResponse(account);
    });
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Account: lan' }));
    expect(await screen.findByRole('heading', { name: 'Account details' })).toBeVisible();
    const dialog = screen.getByRole('dialog', { name: 'Account' });
    expect(within(dialog).getByText('lan')).toBeVisible();
    expect(within(dialog).queryByRole('textbox', { name: 'Username' })).not.toBeInTheDocument();
    const upload = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(upload, new File(['photo'], 'avatar.png', { type: 'image/png' }));
    await screen.findByRole('button', { name: 'Remove avatar' });
    await user.click(screen.getByRole('button', { name: 'Save avatar' }));
    expect(await screen.findByText('Profile updated.')).toBeVisible();
    const header = await screen.findByRole('button', { name: 'Account: lan' });
    expect(header.querySelector('img')).toHaveAttribute('src', thumbnail);
    expect(screen.queryByRole('combobox', { name: 'Preferred source language' })).not.toBeInTheDocument();
    expect(requests).toEqual([{ avatar: 'cGhvdG8=' }]);
  });

  it('submits the current password and clears the fields after changing it', async () => {
    const account = { id: 'usr_test', username: 'lan' };
    const fetchMock = interceptRequests((url) => {
      expect(url.pathname).toMatch(/^\/api\/auth\/me(?:\/password)?$/);
      return jsonResponse(account);
    });
    const user = userEvent.setup();
    renderApp('/profile');
    const form = within(await screen.findByRole('form', { name: 'Change password' }));
    const current = form.getByLabelText('Current password');
    await user.type(current, 'current-password');
    await user.type(form.getByLabelText('New password'), 'new-password');
    await user.type(form.getByLabelText('Confirm password'), 'new-password');
    await user.click(form.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByText('Password updated.')).toBeVisible();
    expect(current).toHaveValue('');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      currentPassword: 'current-password', newPassword: 'new-password', passwordConfirmation: 'new-password',
    });
  });

  it('asks signed-out visitors to log in before opening the profile', async () => {
    interceptRequests(() => jsonResponse({ detail: 'Log in to continue.' }, 401));
    renderApp('/profile');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeVisible();
  });
});
