import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/renderApp';
import { THEME_STORAGE_KEY } from '../lib/theme';

describe('Theme toggle', () => {
  it('starts in dark mode, switches to light, saves the choice, and switches back', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const root = document.documentElement;
    expect(root).toHaveClass('dark');

    await user.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(root).not.toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(root).toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('starts in the saved theme', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderApp('/history');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });
});
