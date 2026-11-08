import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { makeCheck } from '../../test/fixtures';
import { interceptRequests, jsonResponse } from '../../test/http';

describe('New Check', () => {
  it('validates short text before sending a request', async () => {
    const user = userEvent.setup();
    const fetchMock = interceptRequests(() => { throw new Error('Validation must happen before HTTP.'); });
    renderApp('/');
    await user.type(screen.getByLabelText('Text to check'), 'Too short');
    await user.click(screen.getByRole('button', { name: 'Check claims' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 20 characters/i);
    expect(screen.getByLabelText('Text to check')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-http URL before submission', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.type(screen.getByLabelText('Text to check'), 'ftp://example.org/file');
    await user.click(screen.getByRole('button', { name: 'Check claims' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/only http/i);
  });

  it('posts the URL and selected judges, then shows the server status', async () => {
    const check = makeCheck({ inputType: 'url', inputUrl: 'https://example.org/story', status: 'retrieving', claims: [] });
    const fetchMock = interceptRequests((url, init) => {
      if (url.pathname === '/api/check' && init?.method === 'POST') return jsonResponse(check, 202);
      if (url.pathname === '/api/check/chk_test') return jsonResponse(check);
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderApp('/');
    await user.type(screen.getByLabelText('Text to check'), 'https://example.org/story');
    await user.click(screen.getByRole('button', { name: 'Judges: GPT Luna + Claude Haiku 5.5' }));
    await user.click(screen.getByRole('checkbox', { name: 'Gemini 3.5 Flash-Lite' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Check claims' }));
    expect(await screen.findByRole('heading', { name: 'Checking claims' })).toBeInTheDocument();
    expect(screen.getByText('Looking up and saving source snapshots')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]?.body))).toEqual({
      inputType: 'url', url: 'https://example.org/story', judgeIds: ['claude-haiku', 'gemini-flash-lite'],
    });
    expect(screen.queryByText(/simulated|demo/i)).not.toBeInTheDocument();
  });

  it('asks a signed-out visitor to log in and keeps what they typed', async () => {
    interceptRequests((url) => url.pathname === '/api/checks/similar'
      ? jsonResponse({ claims: [], link: null })
      : jsonResponse({ detail: 'Log in to continue.' }, 401));
    const user = userEvent.setup();
    renderApp('/');
    await user.type(screen.getByLabelText('Text to check'), 'The route opened in March 2024.');
    await user.click(screen.getByRole('button', { name: 'Check claims' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Log in to continue.');
    expect(screen.getByLabelText('Text to check')).toHaveValue('The route opened in March 2024.');
    expect(screen.queryByRole('heading', { name: 'Log in' })).not.toBeInTheDocument();
  });

  it('shows missing-key errors without fabricating results', async () => {
    const message = 'The server is missing its API keys, so it can’t run checks yet.';
    interceptRequests(() => jsonResponse({ detail: message }, 503));
    const user = userEvent.setup();
    renderApp('/');
    await user.type(screen.getByLabelText('Text to check'), 'The route opened in March 2024.');
    await user.click(screen.getByRole('button', { name: 'Check claims' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('heading', { name: 'Checking claims' })).not.toBeInTheDocument();
  });

  it('sends attached file text to the backend', async () => {
    const text = 'The route opened to passengers in March 2024.';
    const check = makeCheck({ status: 'extracting', claims: [] });
    const fetchMock = interceptRequests(() => jsonResponse(check));
    const user = userEvent.setup();
    renderApp('/');
    await user.upload(screen.getByTestId('file-input'), new File([text], 'statement.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('list', { name: 'Attached files' })).toHaveTextContent('statement.txt');
    await user.click(screen.getByRole('button', { name: 'Check claims' }));
    await screen.findByRole('heading', { name: 'Checking claims' });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]?.body)).files).toEqual([{ name: 'statement.txt', size: text.length, text }]);
  });

  it('removes an attached file', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.upload(screen.getByTestId('file-input'), new File(['A claim.'], 'notes.md', { type: 'text/markdown' }));
    await user.click(await screen.findByRole('button', { name: 'Remove notes.md' }));
    expect(screen.queryByRole('list', { name: 'Attached files' })).not.toBeInTheDocument();
  });

  it('rejects unsupported files', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderApp('/');
    await user.upload(screen.getByTestId('file-input'), new File(['%PDF-1.7'], 'scan.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/“scan.pdf” is not supported/);
  });

  it('fills example input without precomputing results', async () => {
    const fetchMock = interceptRequests(() => { throw new Error('Examples must not submit automatically.'); });
    const user = userEvent.setup();
    renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Verify a news fact' }));
    expect((screen.getByLabelText('Text to check') as HTMLTextAreaElement).value).toContain('Cát Linh');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /demo scenario/i })).not.toBeInTheDocument();
  });

  it('explains each stage of a check in its own card, with the pictures hidden from screen readers', () => {
    renderApp('/');
    const guide = screen.getByRole('region', { name: 'How it works' });
    const titles = within(guide).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(titles).toEqual(['Split into claims', 'Search rated sources', 'Two models judge', 'Ask about the results']);
    expect(within(guide).getByText(/only on sites rated reliable/i)).toBeInTheDocument();
    expect(within(guide).getByText('Both models agree').closest('[aria-hidden="true"]')).not.toBeNull();
    // Without motion, each picture rests on its last frame, so nothing is left half drawn.
    expect(within(guide).getByText('Verdict unchanged')).toBeInTheDocument();
  });

  it.each([
    ['https://example.org/story', 'https://example.org/story'],
    ['  example.org/story  ', 'https://example.org/story'],
    ['vnexpress.net', 'https://vnexpress.net'],
  ])('reads %s on its own as a link', async (typed, url) => {
    const fetchMock = interceptRequests((_, init) => jsonResponse(makeCheck({ id: 'chk_new', status: 'queued', claims: [] }), init?.method === 'POST' ? 202 : 200));
    const user = userEvent.setup();
    renderApp('/');
    await user.type(screen.getByLabelText('Text to check'), typed);
    expect(screen.getByText('This link will be read as an article.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check claims' }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ inputType: 'url', url });
  });

  it.each([
    'The U.S. economy grew by 2.8% in 2024.',
    'See https://example.org/story for how the route opened in March.',
    'Version 3.14 shipped in the first week of March.',
  ])('keeps %s as text, even with a link or dots inside', async (typed) => {
    const fetchMock = interceptRequests((_, init) => jsonResponse(makeCheck({ id: 'chk_new', status: 'queued', claims: [] }), init?.method === 'POST' ? 202 : 200));
    const user = userEvent.setup();
    renderApp('/');
    await user.type(screen.getByLabelText('Text to check'), typed);
    expect(screen.queryByText('This link will be read as an article.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check claims' }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(post[1]?.body))).toMatchObject({ inputType: 'text', text: typed });
  });

  it('has no text and link tabs to choose between', () => {
    interceptRequests(() => jsonResponse({}));
    renderApp('/');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
