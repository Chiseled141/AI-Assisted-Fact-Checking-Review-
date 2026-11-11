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
    if (url.pathname === `/api/check/${check.id}/input-suggestions`) return jsonResponse({ suggestions: [] });
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

  it('opens a related suggestion as an editable draft and submits it only on Enter', async () => {
    const user = userEvent.setup();
    const suggestion = 'Did Cristiano Ronaldo win the 2016 UEFA European Championship?';
    const original = makeCheck({ claims: [], claimCount: 0, inputCategory: 'subjective' });
    const next = makeCheck({ id: 'chk_suggested', inputText: suggestion, status: 'completed', claims: [], inputSuggestions: [] });
    const fetchMock = interceptRequests((url, init) => {
      if (url.pathname === '/api/check/chk_test') return jsonResponse(original);
      if (url.pathname === '/api/check/chk_test/input-suggestions') return jsonResponse({ suggestions: [suggestion] });
      if (url.pathname === '/api/checks/similar') return jsonResponse({ claims: [], link: null });
      if (url.pathname === '/api/check' && init?.method === 'POST') return jsonResponse(next, 202);
      if (url.pathname === '/api/check/chk_suggested') return jsonResponse(next);
      throw new Error(`Unexpected request: ${url}`);
    });

    renderApp('/checks/chk_test');
    await user.click(await screen.findByRole('button', { name: suggestion }));
    const composer = await screen.findByRole('textbox', { name: 'Text to check' });
    expect(composer).toHaveValue(suggestion);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/check'))).toBe(false);

    await user.click(composer);
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: suggestion })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/check'));
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ inputType: 'text', text: suggestion });
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
    expect(await screen.findByRole('heading', { name: 'Opening report' })).toBeInTheDocument();
    expect(screen.getByText('Supported.')).toBeInTheDocument();
    await user.click(screen.getByText('View model reasoning'));
    const reviews = screen.getByRole('list', { name: 'AI model reviews' });
    expect(within(reviews).getByText('GPT Luna')).toBeInTheDocument();
    expect(within(reviews).getByText('Gemma 4 31B')).toBeInTheDocument();
    expect(screen.queryByText(/demo|simulated|sample data/i)).not.toBeInTheDocument();
  });

  it('shows both verdicts and their own quotes immediately when the judges disagree', async () => {
    const current = makeRevision();
    const [first, second] = current.judges!;
    current.judges = [
      { ...first, citations: [
        { evidenceId: 'evd_test', quote: 'The route opened in March.', relation: 'supporting' },
        { evidenceId: 'evd_old', quote: 'Construction was due to finish.', relation: 'contextual', freshness: 'outdated' },
      ] },
      { ...second, verdict: 'contradicted', citations: [{ evidenceId: 'evd_test', quote: 'The opening was delayed.' }] },
    ];
    serve(makeCheck({ claims: [makeClaim({ current })] }), [
      makeEvidence(), makeEvidence({ id: 'evd_old', sourceTitle: 'Early construction update' }),
    ]);
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('heading', { name: 'AI judges disagree' })).toBeVisible();
    expect(screen.queryByText('Supported.')).not.toBeInTheDocument();
    const reviews = screen.getByRole('list', { name: 'AI model reviews' });
    const [firstReview, secondReview] = Array.from(reviews.children) as HTMLElement[];
    expect(within(firstReview).getByText('Supported')).toBeVisible();
    expect(within(firstReview).getByText('The route opened in March.')).toBeVisible();
    expect(await within(firstReview).findByText('Quoted 2 of 2 sources provided')).toBeVisible();
    expect(within(firstReview).getByText('Context only · Outdated')).toBeVisible();
    expect(within(secondReview).getByText('Contradicted')).toBeVisible();
    expect(within(secondReview).getByText('The opening was delayed.')).toBeVisible();
    expect(within(secondReview).getByRole('link', { name: 'Early construction update' })).toBeVisible();
    expect(within(secondReview).getByText('Quoted 1 of 2 sources provided')).toBeVisible();
  });

  it('shows older model reviews without attributing a shared passage to either judge', async () => {
    const current = makeRevision();
    current.judges![1] = { ...current.judges![1], verdict: 'insufficient_evidence' };
    serve(makeCheck({ claims: [makeClaim({ current })] }));
    renderApp('/checks/chk_test');
    const reviews = await screen.findByRole('list', { name: 'AI model reviews' });
    expect(screen.queryByText('Citations by model were not saved for this check.')).not.toBeInTheDocument();
    expect(within(reviews).queryByRole('blockquote')).not.toBeInTheDocument();
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
    const article = await screen.findByRole('link', { name: /^Submitted article/ });
    expect(article).toHaveAttribute('href', 'https://example.org/article');
    expect(within(article.parentElement!).getByText('Test News')).toBeInTheDocument();
    expect(screen.queryByText(/not read|sample data/i)).not.toBeInTheDocument();
  });

  it('shows submitted file text with accurate server wording', async () => {
    serve(makeCheck({ files: [{ name: 'notes.txt', size: 15, text: 'A saved claim.' }] }));
    const user = userEvent.setup();
    renderApp('/checks/chk_test');
    await user.click(await screen.findByText('notes.txt'));
    expect(screen.getByText(/Text sent to the server for checking/)).toBeInTheDocument();
    expect(screen.getByText('A saved claim.')).toBeVisible();
  });

  it('shows the saved passage without an extra source-analysis section', async () => {
    serve();
    renderApp('/checks/chk_test');
    await screen.findByRole('heading', { name: 'Opening report' });
    expect(screen.getByText('What this source says')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Sources ·/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/supporting · .* contradicting/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /see analysis/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Scores for this source' })).not.toBeInTheDocument();
  });

  it('does not replace unavailable verification with a verdict', async () => {
    serve(makeCheck({ claims: [makeClaim({ status: 'unavailable', current: null, currentVersion: 0, unavailableReason: 'Evidence could not be retrieved, so there is no verdict.' })] }), []);
    renderApp('/checks/chk_test');
    expect(await screen.findByText('Verification interrupted by a technical error.', { selector: 'p' })).toBeInTheDocument();
    expect(await screen.findByText('Evidence could not be retrieved, so there is no verdict.')).toBeInTheDocument();
    expect(screen.queryByText('Insufficient evidence.')).not.toBeInTheDocument();
  });

  it('shows insufficient evidence as a verdict after a completed assessment', async () => {
    const current = makeRevision({ verdict: 'insufficient_evidence', judges: undefined });
    serve(makeCheck({ claims: [makeClaim({ current })] }), []);
    renderApp('/checks/chk_test');
    expect(await screen.findByText('Insufficient evidence.')).toBeVisible();
    expect(screen.queryByText('Verification interrupted by a technical error.')).not.toBeInTheDocument();
  });

  it('does not invent chart data when the backend provides none', async () => {
    serve();
    renderApp('/checks/chk_test');
    await screen.findByRole('heading', { level: 1 });
    for (const name of ['Bitcoin price', 'Stock heatmap', 'Population', 'Population heatmap by year', 'Places in this claim', 'Incident location']) {
      expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByTitle(/stock heatmap/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Markets' })).not.toBeInTheDocument();
  });

  it('compares saved country figures by year without filling gaps or using later years', async () => {
    serve(makeCheck({ claims: [makeClaim({ countryMap: {
      indicator: 'population', source: 'World Bank', retrievedAt: checkedAt, year: 2023,
      years: [2021, 2022, 2023, 2024],
      values: { vn: [97_000_000, null, 100_000_000, 101_000_000], th: [71_000_000, 71_500_000, 72_000_000, 72_500_000] },
      selected: [
        { code: 'vn', name: 'Vietnam', named: 'Vietnam' },
        { code: 'th', name: 'Thailand', named: 'Thailand' },
      ],
    } })] }));
    renderApp('/checks/chk_test');
    const heatmap = await screen.findByRole('region', { name: 'Population heatmap by year' });
    expect(within(heatmap).getByText('Figures from World Bank')).toBeVisible();
    await userEvent.setup().click(within(heatmap).getByText('View heatmap figures'));
    const table = within(heatmap).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['2021', '2022', '2023']);
    const vietnam = within(table).getByRole('row', { name: /Vietnam/ });
    expect(within(vietnam).getByTitle('No figure for this year')).toHaveTextContent('–');
    expect(within(vietnam).getByRole('cell', { name: '100,000,000' })).toBeVisible();
  });

  it('loads a widget only for the selected market from a stock claim', async () => {
    serve(makeCheck({ claims: [makeClaim({ stockHeatmapMarkets: ['us', 'vn'] })] }));
    renderApp('/checks/chk_test');
    const panel = await screen.findByRole('region', { name: 'Stock heatmap' });
    const selector = within(panel).getByRole('combobox', { name: 'Stock market' });
    expect(within(selector).getAllByRole('option').map((option) => option.textContent)).toEqual(['United States', 'Vietnam · VN-Index']);
    const widget = within(panel).getByTitle('United States stock heatmap');
    expect(widget).toHaveAttribute('loading', 'lazy');
    expect(decodeURIComponent(widget.getAttribute('src')!)).toContain('"dataSource":"AllUSA"');
    await userEvent.setup().selectOptions(selector, 'vn');
    expect(within(panel).queryByTitle('United States stock heatmap')).not.toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'View VN-Index on TradingView' })).toHaveAttribute(
      'href', 'https://www.tradingview.com/symbols/HOSE-VNINDEX/',
    );
    expect(within(panel).getByRole('link', { name: /Vingroup/ }).querySelector('img')).toHaveAttribute('src', '/market-logos/VIC.svg');
  });

  it('shows a reported total for a source-backed breakdown', async () => {
    serve(makeCheck({ claims: [makeClaim({ pieChart: {
      title: 'Car registrations by fuel', unit: 'count', publisher: 'Vehicle Report', url: 'https://example.org/vehicles',
      parts: [{ name: 'Electric', value: 300 }, { name: 'Petrol', value: 900 }],
    } })] }));
    renderApp('/checks/chk_test');
    const panel = await screen.findByRole('region', { name: 'Car registrations by fuel' });
    expect(within(panel).getByText('Total')).toBeInTheDocument();
    expect(within(panel).getByText('1,200')).toBeInTheDocument();
  });

  it('links the comparison source and lists the route stops alongside their charts', async () => {
    serve(makeCheck({ claims: [makeClaim({
      barChart: { title: 'Passenger totals', unit: 'passengers', publisher: 'Transport Report', url: 'https://example.org/passengers',
        points: [{ name: 'Rail', value: 1250 }, { name: 'Coach', value: 850 }] },
      routeMap: { title: 'Hanoi to Da Nang', publisher: 'Transport Report', url: 'https://example.org/route', straightLineKm: 606,
        stops: [{ name: 'Hanoi', position: [105.85, 21.03], schedule: '08:30' }, { name: 'Da Nang', position: [108.2, 16.05] }] },
    })] }));
    renderApp('/checks/chk_test');
    const comparison = await screen.findByRole('region', { name: 'Passenger totals' });
    expect(within(comparison).getByRole('link', { name: 'Figures from Transport Report' })).toHaveAttribute(
      'href', 'https://example.org/passengers',
    );
    expect(within(comparison).queryByText('View comparison data')).not.toBeInTheDocument();
    const route = screen.getByRole('region', { name: 'Hanoi to Da Nang' });
    expect(within(route).getAllByRole('listitem')).toHaveLength(2);
    expect(within(route).getByText('08:30')).toBeVisible();
    expect(within(route).getByText('606 km')).toBeVisible();
  });

  const charts: [string, Partial<Claim>, string][] = [
    ['price', { priceChart: { asset: 'bitcoin', currency: 'USD', source: 'Yahoo Finance', retrievedAt: checkedAt, prices: [[1, 100], [2, 101]], events: [] } }, 'Bitcoin price'],
    ['location', { locationMap: { map: 'us', places: [{ code: 'us-nj', name: 'New Jersey', named: 'New Jersey' }] } }, 'Places in this claim'],
    ['incident', { incidentMap: { city: 'Hà Nội', roads: ['Nguyễn Trãi'], position: null, bounds: [105.79, 20.98, 105.81, 21], quote: 'Vụ việc xảy ra trên đường Nguyễn Trãi.', publisher: 'Test News', url: 'https://example.org/incident' } }, 'Incident location'],
    ['country', { countryMap: { indicator: 'population', source: 'Unit-test statistics', retrievedAt: checkedAt, year: 2023, years: [2023], values: { vn: [100], th: [70] }, selected: [{ code: 'vn', name: 'Vietnam', named: 'Vietnam' }] } }, 'Population'],
    ['election', { electionMap: { office: 'house', year: 2024, retrievedAt: checkedAt, states: [{ code: 'us-oh', name: 'Ohio', winner: 'Republicans', publisher: 'Test News', url: 'https://example.org/oh', others: [] }] } }, 'US election results by state'],
    ['seats', { seatChart: { body: 'Test chamber', year: 2024, total: 10, totalSource: { publisher: 'Test News', url: 'https://example.org/seats' }, retrievedAt: checkedAt, parties: [{ name: 'Party A', seats: 5, publisher: 'Test News', url: 'https://example.org/seats', others: [] }, { name: 'Party B', seats: 3, publisher: 'Test News', url: 'https://example.org/seats', others: [] }] } }, 'Seats in Test chamber'],
    ['match', { matchResult: { kind: 'esport', teams: ['Spirit', 'MOUZ'], scores: [3, 0], maps: [{ name: 'Mirage', scores: [13, 8] }], publisher: 'HLTV', url: 'https://www.hltv.org/matches/2383844/spirit-vs-mouz-iem-cologne-2025' } }, 'Match result'],
  ];

  it.each(charts)('renders the %s panel from its backend field', async (_name, chart, heading) => {
    serve(makeCheck({ claims: [makeClaim(chart)] }));
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('labels road-level incident locations as approximate and links the source', async () => {
    const chart = charts.find(([name]) => name === 'incident')![1];
    serve(makeCheck({ claims: [makeClaim(chart)] }));
    renderApp('/checks/chk_test');
    expect(await screen.findByText('Approximate location along the road')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Test News' })).toHaveAttribute('href', 'https://example.org/incident');
    expect(screen.getByRole('link', { name: 'Open in Google Maps' })).toBeVisible();
  });

  it('lists each reported incident area in the map legend', async () => {
    serve(makeCheck({ claims: [makeClaim({ incidentMap: {
      city: 'Hà Nội', roads: [], position: null, bounds: [105.81, 20.98, 105.86, 21.03],
      quote: 'Ngập quanh Hồ Gươm và ở phường Khương Đình.', publisher: 'Test News', url: 'https://example.org/incident',
      areas: [
        { name: 'Hồ Gươm', bounds: [105.85, 21.02, 105.86, 21.03] },
        { name: 'phường Khương Đình', bounds: [105.81, 20.98, 105.82, 21] },
      ],
    } })] }));
    renderApp('/checks/chk_test');
    const legend = await screen.findByRole('list', { name: 'Map legend' });
    expect(within(legend).getAllByRole('listitem')).toHaveLength(2);
    expect(within(legend).getByText('Hồ Gươm')).toBeVisible();
    expect(within(legend).getByText('phường Khương Đình')).toBeVisible();
    expect(within(legend).getAllByText('Approximate extent')).toHaveLength(2);
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

describe('Evidence at a glance', () => {
  it('summarises the check, the sources and both judges without a chart', async () => {
    const claims = [
      makeClaim({ text: 'Inflation was 4% last year.' }),
      makeClaim({ id: 'clm_two', position: 2, text: 'The bridge closed.', current: makeRevision({ id: 'rev_two', claimId: 'clm_two', verdict: 'contradicted', judges: [] }) }),
    ];
    serve(makeCheck({ claims, claimCount: 2 }), [
      makeEvidence({ excerpt: 'Inflation reached 3.2% in 2024.' }),
      makeEvidence({ id: 'evd_two', relation: 'contradicting', publishedAt: '2025-06-01', publisher: 'Other News', excerpt: 'Prices rose 4%.' }),
      makeEvidence({ id: 'evd_three', relation: 'contextual', publishedAt: undefined }),
    ]);
    renderApp('/checks/chk_test');

    const summary = await screen.findByRole('region', { name: 'Summary of this check' });
    expect(summary).toHaveTextContent('1Supported');
    expect(summary).toHaveTextContent('1Contradicted');

    const glance = await screen.findByRole('region', { name: 'Evidence at a glance' });
    expect(await within(glance).findByText('Sources are split between supporting and contradicting')).toBeInTheDocument();
    expect(within(glance).getByLabelText('Source ratings')).toHaveTextContent('3 unrated');
    expect(within(glance).getByText('Both models reached this verdict')).toBeInTheDocument();
    // Models: (95 + 90) / 2 = 92.5. Sources: one each way, equally rated, so 50. 0.6 × 92.5 + 0.4 × 50 = 75.5.
    expect(within(glance).getByRole('meter', { name: 'Accuracy score' })).toHaveAttribute('aria-valuenow', '76');
  });
});

describe('Claim translation', () => {
  it('shows the claim in the reader’s language under the original, and only then', async () => {
    serve(makeCheck({ claims: [makeClaim({ text: 'Aston Hall lived in Miami.', translations: { vi: 'Aston Hall từng sống ở Miami.' } })] }));
    renderApp('/checks/chk_test');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Aston Hall lived in Miami.');
    expect(screen.queryByText('Aston Hall từng sống ở Miami.')).not.toBeInTheDocument();

    act(() => setLanguage('vi'));
    try {
      expect(await screen.findByText('Aston Hall từng sống ở Miami.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Aston Hall lived in Miami.');
    } finally {
      act(() => setLanguage('en'));
    }
  });
});
