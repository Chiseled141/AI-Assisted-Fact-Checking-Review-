// Accounts over backend/app/api/auth.py: a username and password, kept signed in by an HttpOnly cookie
// the page itself can't read. `useAccount` follows who is signed in; `undefined` means not asked yet.

import { useSyncExternalStore } from 'react';
import type { Account } from '../types/models';
import { t } from '../lib/i18n';
import { RUNNING_CHECK_KEY, writeItem } from '../lib/storage';
import { apiUrl } from './api';
import { ValidationError } from './errors';

let account: Account | null | undefined;
const listeners = new Set<() => void>();
const signInListeners = new Set<() => void>();

function setAccount(next: Account | null) {
  // A running check belongs to whoever started it, so it isn't carried over to the next person.
  if (account !== undefined && account?.id !== next?.id) writeItem(RUNNING_CHECK_KEY, '');
  account = next;
  listeners.forEach((listener) => listener());
}

async function send(path: string, body?: unknown): Promise<Response> {
  const response = await fetch(`${apiUrl}/api/auth/${path}`, {
    method: path === 'me' ? 'GET' : 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.ok || (path === 'me' && response.status === 401)) return response;
  const detail = await response.json().then((data) => data.detail).catch(() => undefined);
  throw new ValidationError(typeof detail === 'string' ? t(detail) : t('Could not reach ClaimTrace. Please try again.'));
}

let loading: Promise<Account | null> | null = null;

/** Asks the backend who is signed in. Pages that ask at the same time share one request. */
export function loadAccount(): Promise<Account | null> {
  loading ??= send('me')
    .then(async (response) => {
      setAccount(response.ok ? ((await response.json()) as Account) : null);
      return account ?? null;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export async function signUp(username: string, password: string, passwordConfirmation: string): Promise<Account> {
  const signedIn = (await (await send('register', { username, password, passwordConfirmation })).json()) as Account;
  setAccount(signedIn);
  return signedIn;
}

export async function logIn(username: string, password: string): Promise<Account> {
  const signedIn = (await (await send('login', { username, password })).json()) as Account;
  setAccount(signedIn);
  return signedIn;
}

export async function logOut(): Promise<void> {
  await send('logout');
  setAccount(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAccount(): Account | null | undefined {
  return useSyncExternalStore(subscribe, () => account);
}

/** Called when a page's data needs an account. The app answers by opening the login page. */
export function signInRequired(): void {
  if (account !== null) setAccount(null);
  signInListeners.forEach((listener) => listener());
}

export function onSignInRequired(listener: () => void): () => void {
  signInListeners.add(listener);
  return () => signInListeners.delete(listener);
}

/** Tests start each case signed out, as a fresh page load would. */
export function forgetAccount(): void {
  account = undefined;
  loading = null;
}
