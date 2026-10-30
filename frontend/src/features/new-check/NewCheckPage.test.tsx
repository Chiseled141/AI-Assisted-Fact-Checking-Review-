import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';

describe('New Check form validation', () => {
  it('shows an inline error for short text and does not submit', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.type(screen.getByLabelText('Text to check'), 'Too short');
    await user.click(screen.getByRole('button', { name: 'Check claims' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/at least 20 characters/i);
    expect(screen.getByLabelText('Text to check')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { name: /trace claims/i })).toBeInTheDocument();
  });

  it('rejects a non-http URL in URL mode', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(screen.getByRole('tab', { name: 'URL' }));
    await user.type(screen.getByLabelText('Article URL'), 'ftp://example.org/file');
    await user.click(screen.getByRole('button', { name: 'Check claims' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/only http/i);
    expect(screen.getByText(/page is not fetched/i)).toBeInTheDocument();
  });

  it('starts processing for a valid URL', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(screen.getByRole('tab', { name: 'URL' }));
    await user.type(screen.getByLabelText('Article URL'), 'https://example.org/news/story');
    await user.click(screen.getByRole('button', { name: 'Check claims' }));

    expect(await screen.findByRole('heading', { name: 'Checking claims' })).toBeInTheDocument();
    expect(screen.getByText(/simulated processing/i)).toBeInTheDocument();
  });
});

describe('Adding files', () => {
  const textFile = (name: string, content: string, type = 'text/plain') => new File([content], name, { type });

  it('attaches a text file, lets it stand in for typed text, and saves it with the check', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.upload(
      screen.getByTestId('file-input'),
      textFile('statement.txt', 'The Harbor Line opened to passengers in March 2024.'),
    );

    const attached = await screen.findByRole('list', { name: 'Attached files' });
    expect(within(attached).getByText('statement.txt')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Check claims' }));
    expect(await screen.findByRole('heading', { name: 'Checking claims' })).toBeInTheDocument();
    expect(screen.getByText('statement.txt')).toBeInTheDocument();
  });

  it('removes an attached file', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.upload(screen.getByTestId('file-input'), textFile('notes.md', '# Notes\nA claim worth checking.'));
    await user.click(await screen.findByRole('button', { name: 'Remove notes.md' }));
    expect(screen.queryByRole('list', { name: 'Attached files' })).not.toBeInTheDocument();
  });

  it('rejects unsupported files with an inline error', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderApp('/');
    await user.upload(screen.getByTestId('file-input'), textFile('scan.pdf', '%PDF-1.7', 'application/pdf'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/“scan.pdf” is not supported/);
    expect(screen.queryByRole('list', { name: 'Attached files' })).not.toBeInTheDocument();
  });
});

describe('How it works', () => {
  it('shows details for a step when clicked and hides them again', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const step = screen.getByRole('button', { name: /find evidence/i });
    expect(step).toHaveAttribute('aria-expanded', 'false');

    await user.click(step);
    expect(step).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/exact retrieval time/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close step details' }));
    expect(screen.queryByText(/exact retrieval time/i)).not.toBeInTheDocument();
  });
});
