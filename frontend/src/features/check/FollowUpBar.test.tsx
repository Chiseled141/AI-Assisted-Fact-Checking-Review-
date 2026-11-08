import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { checkedAt, makeCheck, makeClaim, makeEvidence, makeRevision } from '../../test/fixtures';
import { interceptRequests, jsonResponse } from '../../test/http';
import type { ChatMessage } from '../../types/models';

const answer: ChatMessage = {
  id: 'msg_1', question: 'Which source is the most direct?', answer: 'Test News reports the opening directly.',
  modelName: 'Claude Haiku 5.5', createdAt: '2026-11-07T10:00:00+00:00',
};

/** Serves one finished check, and records what the page posts. */
function serve({ messages = [] as ChatMessage[], status = 'completed' as const, claims = [makeClaim()] } = {}) {
  let saved = messages;
  const posts: { path: string; body: unknown }[] = [];
  const fetchMock = interceptRequests((url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push({ path: url.pathname, body });
      if (url.pathname.endsWith('/messages')) {
        const original = saved.find((message) => message.id === body.replyToId);
        const reference = original
          ? { kind: 'answer' as const, title: original.answer, modelName: original.modelName }
          : undefined;
        const reply = { ...answer, id: `msg_${saved.length + 1}`, reference };
        saved = [...saved, reply];
        return jsonResponse(reply, 201);
      }
      return jsonResponse({ ok: true }, 201);
    }
    if (url.pathname.endsWith('/evidence')) return jsonResponse([makeEvidence()]);
    return jsonResponse(makeCheck({ status, claims, messages: saved }));
  });
  return { posts, fetchMock };
}

describe('The box under a check', () => {
  it('shows newly searched source links and ignores unsafe URLs', async () => {
    serve({ messages: [{ ...answer, sources: [
      { title: 'Party history', url: 'https://example.org/history' },
      { title: 'Unsafe source', url: 'javascript:alert(1)' },
    ] }] });
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('link', { name: 'Party history' })).toHaveAttribute('href', 'https://example.org/history');
    expect(screen.getByRole('list', { name: 'Additional sources' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Unsafe source' })).not.toBeInTheDocument();
  });

  it('asks a follow-up question and shows the answer in the chat', async () => {
    const { posts } = serve();
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.type(await screen.findByRole('textbox', { name: 'Question about this check' }), 'Which source is the most direct?{Enter}');
    expect(await screen.findByText('Test News reports the opening directly.')).toBeInTheDocument();
    expect(posts).toEqual([{ path: '/api/check/chk_test/messages', body: { question: 'Which source is the most direct?', modelId: 'claude-haiku' } }]);
    expect(screen.getByRole('textbox', { name: 'Question about this check' })).toHaveValue('');
  });

  it('clears the draft while sending and restores it if the request fails', async () => {
    let respond!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { respond = resolve; });
    interceptRequests((url, init) => {
      if (init?.method === 'POST') return response;
      if (url.pathname.endsWith('/evidence')) return jsonResponse([makeEvidence()]);
      return jsonResponse(makeCheck());
    });
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    const box = await screen.findByRole('textbox', { name: 'Question about this check' });
    await user.type(box, 'Why?{Enter}');
    expect(await screen.findByText('Why?')).toBeInTheDocument();
    expect(box).toHaveValue('');

    await act(async () => respond(jsonResponse({ detail: 'Temporarily unavailable.' }, 503)));
    expect(await screen.findByText('Temporarily unavailable.')).toBeInTheDocument();
    expect(box).toHaveValue('Why?');
  });

  it('sends attached text files with the question and shows them in the chat', async () => {
    const { posts } = serve();
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    const box = await screen.findByRole('textbox', { name: 'Question about this check' });
    await user.upload(screen.getByTestId('followup-file-input'), new File(['The line opened in 2020.'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('button', { name: 'Remove notes.txt' })).toBeInTheDocument();
    await user.type(box, 'Does my note match?{Enter}');
    await screen.findByText('Test News reports the opening directly.');
    expect(posts[0].body).toEqual({
      question: 'Does my note match?',
      files: [{ name: 'notes.txt', size: 24, text: 'The line opened in 2020.' }],
      modelId: 'claude-haiku',
    });
    expect(screen.queryByRole('button', { name: 'Remove notes.txt' })).not.toBeInTheDocument();
  });

  it('lets the reader pick which model answers', async () => {
    const { posts } = serve();
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.click(await screen.findByRole('button', { name: 'Answering model: Claude Haiku 5.5' }));
    expect(screen.getByText('Pick the model that answers')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /GPT Luna/ }));
    expect(screen.getByRole('button', { name: 'Answering model: GPT Luna' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.type(screen.getByRole('textbox', { name: 'Question about this check' }), 'Why?{Enter}');
    await screen.findByText('Test News reports the opening directly.');
    expect(posts[0].body).toEqual({ question: 'Why?', modelId: 'gpt-luna' });
  });

  it('selects the model from its review card and sends the draft to that model', async () => {
    const current = makeRevision();
    current.judges![1] = { ...current.judges![1], judge: 'Claude Haiku 5.5', verdict: 'contradicted' };
    const { posts } = serve({ claims: [makeClaim({ current })] });
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    const box = await screen.findByRole('textbox', { name: 'Question about this check' });
    await user.type(box, 'Why this verdict?');
    await user.click(screen.getByRole('button', { name: 'Reply to GPT Luna' }));
    expect(box).toHaveFocus();
    expect(box).toHaveValue('Why this verdict?');
    expect(screen.getByText('Replying to GPT Luna')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Answering model: GPT Luna' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await screen.findByText('Test News reports the opening directly.');
    expect(posts[0].body).toEqual({
      question: 'Why this verdict?', modelId: 'gpt-luna',
      target: { claimId: 'clm_test', kind: 'judge', key: 'GPT Luna' },
    });
  });

  it.each([
    ['Opening report', { kind: 'source', key: 'evd_test' }],
    ['Bitcoin price', { kind: 'chart', key: 'priceChart', label: 'Bitcoin price' }],
  ])('sends the selected result as context from %s', async (label, target) => {
    const claim = makeClaim({
      priceChart: { asset: 'bitcoin', currency: 'USD', source: 'Yahoo Finance', retrievedAt: checkedAt, prices: [[1, 100]], events: [] },
    });
    const { posts } = serve({ claims: [claim] });
    const user = userEvent.setup();
    const { container } = renderApp('/checks/chk_test');
    const button = await screen.findByRole('button', { name: `Ask about ${label}` });
    const scrollIntoView = vi.fn();
    const composerEnd = container.querySelector('#followup-composer-end')!;
    composerEnd.scrollIntoView = scrollIntoView;
    await user.click(button);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end' });
    expect(screen.getByText(`Replying to ${label}`)).toBeVisible();
    const box = screen.getByRole('textbox', { name: 'Question about this check' });
    expect(box).toHaveFocus();
    expect(box).toHaveValue('');
    await user.keyboard('What does this show?{Enter}');
    await waitFor(() => expect(posts[0]?.body).toEqual({
      question: 'What does this show?', modelId: 'claude-haiku', target: { claimId: claim.id, ...target },
    }));
  });

  it('shows an attached source above the question while sending and after reopening the check', async () => {
    const source = makeEvidence();
    const message: ChatMessage = {
      ...answer,
      question: 'Is this source legitimate?',
      reference: { kind: 'source', title: source.sourceTitle, url: source.url },
    };
    let finish!: () => void;
    const sending = new Promise<void>((resolve) => { finish = resolve; });
    let messages: ChatMessage[] = [];
    interceptRequests(async (url, init) => {
      if (init?.method === 'POST') {
        await sending;
        messages = [message];
        return jsonResponse(message, 201);
      }
      if (url.pathname.endsWith('/evidence')) return jsonResponse([source]);
      return jsonResponse(makeCheck({ messages }));
    });

    const user = userEvent.setup();
    const view = renderApp('/checks/chk_test');
    await user.click(await screen.findByRole('button', { name: 'Ask about Opening report' }));
    await user.keyboard(`${message.question}{Enter}`);
    const link = await screen.findByRole('link', { name: source.sourceTitle });
    expect(link).toHaveAttribute('href', source.url);
    expect(link.parentElement).toHaveTextContent(message.question);
    expect(screen.queryByText('Replying to Opening report')).not.toBeInTheDocument();

    await act(async () => finish());
    await screen.findByText(message.answer);
    view.unmount();
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('link', { name: source.sourceTitle })).toHaveAttribute('href', source.url);
    expect(screen.getByText(message.question)).toBeVisible();
  });

  it('removes result context when the reader cancels the reply', async () => {
    const { posts } = serve();
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.click(await screen.findByRole('button', { name: 'Ask about Opening report' }));
    await user.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(screen.queryByText('Replying to Opening report')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Question about this check' })).toHaveFocus();
    await user.keyboard('A general question{Enter}');
    await waitFor(() => expect(posts[0]?.body).toEqual({
      question: 'A general question', modelId: 'claude-haiku',
    }));
  });

  it('keeps earlier questions and answers in the chat', async () => {
    serve({ messages: [answer] });
    renderApp('/checks/chk_test');
    expect(await screen.findByText('Which source is the most direct?')).toBeInTheDocument();
    expect(screen.getByText('Test News reports the opening directly.')).toBeInTheDocument();
  });

  it('copies an answer and replies to that specific exchange', async () => {
    const { posts } = serve({ messages: [answer] });
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.click(await screen.findByRole('button', { name: 'Copy answer' }));
    expect(await navigator.clipboard.readText()).toBe(answer.answer);
    await user.click(screen.getByRole('button', { name: 'Reply to this answer' }));
    expect(screen.getByText(`Replying to ${answer.answer}`)).toBeVisible();
    const box = screen.getByRole('textbox', { name: 'Question about this check' });
    expect(box).toHaveFocus();
    await user.type(box, 'Can you explain more?{Enter}');
    await waitFor(() => expect(posts[0]?.body).toEqual({
      question: 'Can you explain more?', modelId: 'claude-haiku', replyToId: answer.id,
    }));
  });

  it('asks a different model to review the selected answer', async () => {
    const { posts } = serve({ messages: [answer] });
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.click(await screen.findByRole('button', { name: 'Ask another model to review' }));
    expect(screen.queryByRole('button', { name: 'Request a review from Claude Haiku 5.5' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request a review from GPT Luna' }));
    await waitFor(() => expect(posts[0]?.body).toEqual({
      question: 'Review this answer against the sources.', modelId: 'gpt-luna', replyToId: answer.id,
    }));
    expect(await screen.findByTitle(`${answer.modelName} · ${answer.answer}`)).toBeVisible();
  });

  it('waits for the check to finish before taking questions', async () => {
    const { posts } = serve({ status: 'assessing' as never });
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('textbox', { name: 'Question about this check' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Edit result' })).not.toBeInTheDocument();
    expect(posts).toEqual([]);
  });

  it('keeps the question box without feedback or correction actions', async () => {
    serve();
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('textbox', { name: 'Question about this check' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Feedback' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit result' })).not.toBeInTheDocument();
  });

  it.each(['Edit result', 'Sửa kết quả'])('opens the correction dialog from the command %s', async (command) => {
    const { posts } = serve();
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.type(await screen.findByRole('textbox', { name: 'Question about this check' }), `${command}{Enter}`);
    expect(await screen.findByText('Correction reason')).toBeVisible();
    expect(posts).toEqual([]);
  });

  it('keeps the check action in the header instead of above the follow-up box', async () => {
    serve();
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('link', { name: 'New check' })).toHaveAttribute('href', '/');
  });
});
