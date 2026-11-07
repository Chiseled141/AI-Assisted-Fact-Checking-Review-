import { describe, expect, it } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { checkedAt, makeCheck, makeClaim, makeEvidence, makeRevision } from '../../test/fixtures';
import { interceptRequests, jsonResponse } from '../../test/http';
import type { Claim, EvidenceSnapshot } from '../../types/models';
import { setLanguage } from '../../lib/i18n';

function serve(check = makeCheck(), evidence: EvidenceSnapshot[] = [makeEvidence()]) {
  return interceptRequests((url) => {
    if (url.pathname === `/api/check/${check.id}`) return jsonResponse(check);
    if (/^\/api\/claims\/[^/]+\/evidence$/.test(url.pathname)) return jsonResponse(evidence);
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe('Saved results from the backend', () => {
  it.each([
    ['subjective', 'Subjective opinion'], ['advice', 'Advice request'],
    ['prediction', 'Future prediction'], ['unclear', 'Needs clarification'],
    ['no_factual_claim', 'No factual claim identified'],
  ] as const)('shows an explanation and tags for %s without inventing a verdict', async (inputCategory, label) => {
    serve(makeCheck({ claims: [], claimCount: 0, inputCategory, inputText: 'Ronaldo có phải là GOAT?' }), []);
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ronaldo có phải là GOAT?');
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText('No factual verdict')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How to make this checkable' })).toBeInTheDocument();
    expect(screen.queryByText('Supported.')).not.toBeInTheDocument();
    expect(screen.queryByText('Contradicted.')).not.toBeInTheDocument();
  });

  it('gives older empty checks a neutral explanation without inventing their category', async () => {
    serve(makeCheck({ claims: [], claimCount: 0 }), []);
    renderApp('/checks/chk_test');
    expect(await screen.findByText('No factual claim identified')).toBeInTheDocument();
    expect(screen.queryByText('Subjective opinion')).not.toBeInTheDocument();
  });

  it('keeps a selected judge failure visible after the other judge completes', async () => {
    serve(makeCheck({ progress: [{
      id: 'judge-failed', kind: 'ai', task: 'judging', modelName: 'Gemma 4 31B', requestedModel: 'google/gemma-4-31b-it:free',
      status: 'failed', startedAt: checkedAt, claimPosition: 1,
      summary: 'This model is temporarily rate-limited. Please try again later.',
    }] }));
    renderApp('/checks/chk_test');
    const unavailable = await screen.findByRole('list', { name: 'Unavailable judges' });
    expect(unavailable).toHaveTextContent('Gemma 4 31B');
    expect(unavailable).toHaveTextContent('temporarily rate-limited');
  });

  it('shows the saved claim, verdict and both judges', async () => {
    serve();
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('The route opened in March 2024.');
    expect(await screen.findByText('Opening report')).toBeInTheDocument();
    expect(screen.getByText('Supported.')).toBeInTheDocument();
    await user.click(screen.getByText('View model reasoning'));
    const reviews = screen.getByRole('list', { name: 'AI model reviews' });
    expect(within(reviews).getByText('GPT Luna')).toBeInTheDocument();
    expect(within(reviews).getByText('Gemma 4 31B')).toBeInTheDocument();
    expect(screen.queryByText(/demo|simulated|sample data/i)).not.toBeInTheDocument();
  });

  it('keeps disagreements visible', async () => {
    const current = makeRevision();
    current.judges![1] = { ...current.judges![1], verdict: 'insufficient_evidence' };
    serve(makeCheck({ claims: [makeClaim({ current })] }));
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByText('View model reasoning'));
    expect(screen.getByText('AI judges disagree')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'AI model reviews' })).getByText('Insufficient evidence')).toBeInTheDocument();
  });

  it('opens the claim in the URL and supports previous and next', async () => {
    const claims = [makeClaim(), makeClaim({ id: 'clm_other', position: 2, text: 'A second statement.' })];
    serve(makeCheck({ claims, claimCount: 2 }));
    const user = userEvent.setup();
    renderApp('/checks/chk_test?claim=2');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('A second statement.');
    expect(screen.queryByRole('button', { name: 'Next claim' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous claim' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The route opened in March 2024.');
    expect(screen.getByRole('button', { name: 'Next claim' })).toBeInTheDocument();
  });

  it('shows article metadata from the server', async () => {
    serve(makeCheck({ inputType: 'url', inputUrl: 'https://example.org/article', article: { title: 'Submitted article', publisher: 'Test News' } }));
    renderApp('/checks/chk_test');
    const article = await screen.findByRole('heading', { name: /^Submitted article/ });
    expect(within(article).getByRole('link')).toHaveAttribute('href', 'https://example.org/article');
    expect(screen.queryByText(/not read|sample data/i)).not.toBeInTheDocument();
  });

  it('shows submitted file text with accurate server wording', async () => {
    serve(makeCheck({ files: [{ name: 'notes.txt', size: 15, text: 'A saved claim.' }] }));
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('heading', { name: 'notes.txt' })).toBeInTheDocument();
    expect(screen.getByText(/Text sent to the server for checking/)).toBeInTheDocument();
    await user.click(screen.getByText('File contents'));
    expect(screen.getByText('A saved claim.')).toBeVisible();
  });

  it('shows the saved passage without an extra source-analysis section', async () => {
    serve();
    renderApp('/checks/chk_test');
    await screen.findByText('Opening report');
    expect(screen.getByText('What this source says')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /see analysis/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Scores for this source' })).not.toBeInTheDocument();
  });

  it('does not replace unavailable verification with a verdict', async () => {
    serve(makeCheck({ claims: [makeClaim({ status: 'unavailable', current: null, currentVersion: 0, unavailableReason: 'Evidence could not be retrieved, so there is no verdict.' })] }), []);
    renderApp('/checks/chk_test');
    expect(await screen.findByText('Verification unavailable.')).toBeInTheDocument();
    expect(await screen.findByText(/No evidence was retrieved, so there is no verdict/)).toBeInTheDocument();
    expect(screen.queryByText('Insufficient evidence.')).not.toBeInTheDocument();
  });

  it('does not invent chart data when the backend provides none', async () => {
    serve();
    renderApp('/checks/chk_test');
    await screen.findByRole('heading', { level: 1 });
    for (const name of ['Bitcoin price', 'Population', 'Daily high temperature', 'Places in this claim']) {
      expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument();
    }
  });

  const charts: [string, Partial<Claim>, string][] = [
    ['price', { priceChart: { asset: 'bitcoin', currency: 'USD', source: 'Yahoo Finance', retrievedAt: checkedAt, prices: [[1, 100], [2, 101]], events: [] } }, 'Bitcoin price'],
    ['location', { locationMap: { map: 'us', places: [{ code: 'us-nj', name: 'New Jersey', named: 'New Jersey' }] } }, 'Places in this claim'],
    ['heat', { heatMap: { metric: 'temperature', area: 'world', areaName: 'World', start: '2024-01-01', end: '2024-01-01', days: ['2024-01-01'], step: 18, source: 'Unit-test climate', retrievedAt: checkedAt, points: [[0, 0, 20]] } }, 'Daily high temperature'],
    ['country', { countryMap: { indicator: 'population', source: 'Unit-test statistics', retrievedAt: checkedAt, year: 2023, years: [2023], values: { vn: [100], th: [70] }, selected: [{ code: 'vn', name: 'Vietnam', named: 'Vietnam' }] } }, 'Population'],
    ['election', { electionMap: { office: 'house', year: 2024, retrievedAt: checkedAt, states: [{ code: 'us-oh', name: 'Ohio', winner: 'Republicans', publisher: 'Test News', url: 'https://example.org/oh', others: [] }] } }, 'US election results by state'],
    ['seats', { seatChart: { body: 'Test chamber', year: 2024, total: 10, totalSource: { publisher: 'Test News', url: 'https://example.org/seats' }, retrievedAt: checkedAt, parties: [{ name: 'Party A', seats: 5, publisher: 'Test News', url: 'https://example.org/seats', others: [] }, { name: 'Party B', seats: 3, publisher: 'Test News', url: 'https://example.org/seats', others: [] }] } }, 'Seats in Test chamber'],
  ];

  it.each(charts)('renders the %s panel from its backend field', async (_name, chart, heading) => {
    serve(makeCheck({ claims: [makeClaim(chart)] }));
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });
});

describe('A model translating its own text', () => {
  const judges = [
    { judge: 'GPT Luna', verdict: 'supported' as const, confidence: 0.9, primary: true, review: 'The report gives the date.', translations: { en: 'The report gives the date.', vi: 'Báo cáo nêu rõ ngày.' } },
    { judge: 'Gemma 4 31B', verdict: 'supported' as const, confidence: 0.8, primary: false, review: 'The dates agree.' },
  ];
  const checkWith = () => makeCheck({ claims: [makeClaim({ current: makeRevision({ rationale: 'The report gives the date.', judges }) })] });

  it('replaces a review when the language changes, and falls back to the original without a translation', async () => {
    serve(checkWith());
    renderApp('/checks/chk_test');
    expect(await screen.findAllByText('The report gives the date.')).not.toHaveLength(0);
    await act(async () => setLanguage('vi'));
    expect(screen.getAllByText('Báo cáo nêu rõ ngày.')).not.toHaveLength(0);
    expect(screen.queryByText('The report gives the date.')).not.toBeInTheDocument();
    expect(screen.getByText('The dates agree.')).toBeInTheDocument();
    await act(async () => setLanguage('en'));
  });

  it('keeps the quote as written and adds its translation beneath it', async () => {
    const quote = 'Tuyến khai trương tháng 3/2024.';
    serve(checkWith(), [makeEvidence({ excerpt: quote, translations: { en: 'The line opened in March 2024.' } })]);
    renderApp('/checks/chk_test');
    expect(await screen.findByText('The line opened in March 2024.')).toBeInTheDocument();
    expect(screen.getByText(/Tuyến khai trương tháng 3\/2024/)).toBeInTheDocument();
    await act(async () => setLanguage('vi'));
    expect(screen.queryByText('The line opened in March 2024.')).not.toBeInTheDocument();
    expect(screen.getByText(/Tuyến khai trương tháng 3\/2024/)).toBeInTheDocument();
    await act(async () => setLanguage('en'));
  });
});

describe('An input with no claims', () => {
  it('explains what can\'t be checked', async () => {
    serve(makeCheck({ claims: [] }));
    renderApp('/checks/chk_test');
    expect(await screen.findByText('No factual claim identified')).toBeInTheDocument();
    expect(screen.getByText('No checkable factual claim was identified in this input. This does not mean the input is false.')).toBeInTheDocument();
  });
});

describe('A claim written from a question', () => {
  it('says the reader did not state it', async () => {
    serve(makeCheck({ claims: [makeClaim({ rephrasedFrom: 'hay ngứa có bị sỏi thận không' })] }));
    renderApp('/checks/chk_test');
    expect(await screen.findByText(/hay ngứa có bị sỏi thận không/)).toHaveTextContent('You did not state this claim.');
  });

  it('shows nothing extra on a claim the reader wrote', async () => {
    serve();
    renderApp('/checks/chk_test');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/You did not state this claim/)).not.toBeInTheDocument();
  });
});
