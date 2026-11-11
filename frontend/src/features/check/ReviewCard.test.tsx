import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { makeCheck } from '../../test/fixtures';
import { interceptRequests, jsonResponse } from '../../test/http';
import type { CheckReview, ReviewAnswer } from '../../types/models';

const review: CheckReview = {
  claims: [{ position: 1, text: 'The line has 12 stations.' }, { position: 2, text: 'It opened in 2021.' }],
  choose: true,
  questions: [{ claim: 2, question: 'Which line?', options: ['Cát Linh', 'Nhổn'] }],
};

function waiting(answered: () => boolean, saved = review) {
  let submission: ReviewAnswer | undefined;
  return interceptRequests((_, init) => {
    if (init?.method === 'POST') {
      submission = JSON.parse(String(init.body));
      return jsonResponse({ ok: true }, 202);
    }
    return jsonResponse(
      answered()
        ? makeCheck({ status: 'retrieving', claims: [], review: { ...saved, answer: submission } })
        : makeCheck({ status: 'awaiting_input', claims: [], review: saved }),
    );
  });
}

function sentAnswer(fetchMock: ReturnType<typeof interceptRequests>) {
  return JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')![1]?.body));
}

describe('Questions before the search', () => {
  it('waits for every question, then sends the answers and goes back to following the check', async () => {
    let answered = false;
    const fetchMock = waiting(() => answered);
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    expect(await screen.findByText('Waiting for your answer')).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Select all claims' }));
    const firstOption = screen.getByRole('radio', { name: 'Cát Linh' });
    await user.click(firstOption);
    await user.click(screen.getByRole('radio', { name: 'Nhổn' }));
    expect(firstOption).not.toBeChecked();
    expect(next).toBeEnabled();
    answered = true;
    await user.click(next);
    await waitFor(() => expect(sentAnswer(fetchMock)).toEqual({ claim: null, answers: [{ claim: 2, answer: 'Nhổn' }] }));
    expect(await screen.findByText('Nhổn')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('sends the checked subset and skips questions about the claims the reader left out', async () => {
    let answered = false;
    const third = { position: 3, text: 'The line is 13 km long.' };
    const fetchMock = waiting(() => answered, { ...review, claims: [...review.claims, third] });
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    const all = await screen.findByRole('checkbox', { name: 'Select all claims' });
    await user.click(all);
    expect(all).toBeChecked();
    expect(screen.getByText('Which line?')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'It opened in 2021.' }));
    expect(all).toBePartiallyChecked();
    expect(screen.queryByText('Which line?')).not.toBeInTheDocument();
    answered = true;
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(sentAnswer(fetchMock)).toEqual({ claim: null, selectedClaims: [1, 3], answers: [] }));
    expect(await screen.findByText(third.text)).toBeVisible();
    expect(screen.queryByText('It opened in 2021.')).not.toBeInTheDocument();
  });

  it('needs words for a typed answer, and sends null to check as written', async () => {
    const fetchMock = waiting(() => false);
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.click(await screen.findByRole('checkbox', { name: 'Select all claims' }));
    await user.click(screen.getByRole('radio', { name: 'Other' }));
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), '   ');
    expect(next).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Skip, check as written' }));
    await user.click(next);
    await waitFor(() => expect(sentAnswer(fetchMock)).toEqual({ claim: null, answers: [{ claim: 2, answer: null }] }));
  });

  it('sends a typed claim, and asks nothing else once the reader has typed one', async () => {
    const fetchMock = waiting(() => false);
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    const next = await screen.findByRole('button', { name: 'Continue' });
    await user.click(screen.getByRole('textbox', { name: 'What else to check' }));
    expect(screen.queryByText('Which line?')).not.toBeInTheDocument();
    expect(next).toBeDisabled();
    await user.keyboard('The line cost $1 billion.');
    await user.click(next);
    await waitFor(() => expect(sentAnswer(fetchMock)).toEqual({ claim: null, answers: [], typedClaim: 'The line cost $1 billion.' }));
  });

  it('always ends a question with a row to type in', async () => {
    interceptRequests(() => jsonResponse(makeCheck({ status: 'awaiting_input', claims: [], review: {
      ...review, choose: false, questions: [{ claim: 2, question: 'Which line?', options: [] }],
    } })));
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('textbox', { name: 'Your answer' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: 'Other' })).toHaveLength(1);
  });

  it('does not keep asking the server while it waits for the reader', async () => {
    const fetchMock = waiting(() => false);
    renderApp('/checks/chk_test');
    await screen.findByRole('button', { name: 'Continue' });
    const checkRequests = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/check/chk_test')).length;
    const before = checkRequests();
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(checkRequests()).toBe(before);
  });

  it('keeps the card and says why when the answer is refused', async () => {
    interceptRequests((_, init) => {
      if (init?.method === 'POST') return jsonResponse({ detail: 'This check is no longer waiting for an answer.' }, 422);
      return jsonResponse(makeCheck({ status: 'awaiting_input', claims: [], review: { ...review, questions: [] } }));
    });
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.click(await screen.findByRole('checkbox', { name: 'Select all claims' }));
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This check is no longer waiting for an answer.');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });
});

describe('Stopping a check from the chat bar', () => {
  it('stops a running check and offers to run it again', async () => {
    let stopped = false;
    const fetchMock = interceptRequests((url, init) => {
      if (init?.method === 'POST' && url.pathname.endsWith('/stop')) {
        stopped = true;
        return jsonResponse({ ok: true }, 202);
      }
      return jsonResponse(makeCheck({ status: stopped ? 'stopped' : 'retrieving', claims: [], errorMessage: stopped ? 'You stopped this check.' : undefined }));
    });
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.click(await screen.findByRole('button', { name: 'Stop checking' }));
    expect(await screen.findByRole('heading', { name: 'Check stopped' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run again' })).toBeInTheDocument();
    expect(screen.queryByText('Check failed')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop checking' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
  });

  it('can stop a check that is waiting for an answer', async () => {
    interceptRequests(() => jsonResponse(makeCheck({ status: 'awaiting_input', claims: [], review })));
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('button', { name: 'Stop checking' })).toBeInTheDocument();
  });

  it('has nothing to stop once the check is done', async () => {
    interceptRequests(() => jsonResponse(makeCheck({ status: 'completed', claims: [] })));
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('button', { name: 'Send question' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop checking' })).not.toBeInTheDocument();
  });
});
