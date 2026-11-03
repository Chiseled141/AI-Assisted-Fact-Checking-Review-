import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';

const evidencePanel = () => screen.getByRole('list', { name: /evidence snapshots for claim/i });

describe('Results workspace', () => {
  it('shows evidence for the selected claim', async () => {
    const user = userEvent.setup();
    renderApp('/checks/chk_demo_transit');

    expect(await screen.findByText('Harbor Line opens to passengers')).toBeInTheDocument();
    expect(evidencePanel()).toHaveAccessibleName('Evidence snapshots for claim 1');

    const ridership = screen.getByRole('article', { name: /ridership reached 50,000/i });
    await user.click(within(ridership).getByRole('button', { name: /ridership reached 50,000/i }));

    expect(await screen.findByText('Six-month ridership summary, Harbor Line')).toBeInTheDocument();
    expect(screen.queryByText('Harbor Line opens to passengers')).not.toBeInTheDocument();
    expect(evidencePanel()).toHaveAccessibleName('Evidence snapshots for claim 2');
    expect(within(ridership).getByRole('button', { name: /ridership reached 50,000/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('marks fictional demo sources as not rated, and shows no review button for now', async () => {
    renderApp('/checks/chk_demo_transit');
    await screen.findByText('Harbor Line opens to passengers');

    expect(within(evidencePanel()).getAllByText('Not rated').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'How sources are rated' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review assessment' })).not.toBeInTheDocument();
  });

  it('shows logos and ratings for the real-source example', async () => {
    const user = userEvent.setup();
    renderApp('/checks/chk_demo_real');
    await screen.findByText('Hanoi gets country’s 1st metro service');

    expect(evidencePanel().querySelectorAll('img[src^="/source-logos/"]')).toHaveLength(5);
    expect(within(evidencePanel()).getAllByText('Trusted source')).toHaveLength(5);
    expect(within(evidencePanel()).queryByText('Not rated')).not.toBeInTheDocument();
    expect(within(evidencePanel()).getByText('Official news site of the Government of Vietnam')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /WHO declared COVID-19 over/i }));
    await screen.findByText('A monumental moment: End of international emergency');
    expect(within(evidencePanel()).getByText('Mixed source')).toBeInTheDocument();
  });

  it('links each source to its page in a new tab', async () => {
    renderApp('/checks/chk_demo_real');
    await screen.findByText('Hanoi gets country’s 1st metro service');

    const links = within(evidencePanel()).getAllByRole('link', { name: /^visit source/i });
    expect(links).toHaveLength(5);
    expect(links[0]).toHaveAttribute(
      'href',
      'https://e.vnexpress.net/news/business/economy/hanoi-gets-country-s-1st-metro-service-4382113.html',
    );
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('shows the page capture for each snapshot', async () => {
    const user = userEvent.setup();
    renderApp('/checks/chk_demo_transit');
    const passage = (await screen.findByText('Harbor Line opens to passengers')).closest('li')!;

    expect(within(passage).queryByRole('img', { name: /page capture/i })).not.toBeInTheDocument();
    await user.click(within(passage).getByRole('button', { name: /show page capture/i }));
    const capture = within(passage).getByRole('img', { name: 'Page capture of Harbor Line opens to passengers' });
    expect(capture).toHaveAttribute('src', '/captures/mcta-release.svg');
    expect(within(passage).getByRole('button', { name: /hide page capture/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('tags outdated evidence with a reason, separate from the verdict', async () => {
    const user = userEvent.setup();
    renderApp('/checks/chk_demo_transit');

    const congestion = await screen.findByRole('article', { name: /downtown traffic congestion/i });
    expect(within(congestion).getByText('Insufficient evidence')).toBeInTheDocument();

    await user.click(within(congestion).getByRole('button', { name: /downtown traffic congestion/i }));
    const detail = screen.getByRole('region', { name: /downtown traffic congestion/i });
    expect(within(detail).getByText('1 outdated source')).toBeInTheDocument();
    expect(within(detail).getByText('Present (as of this check)')).toBeInTheDocument();
    const minutes = (await screen.findByText('City council transport committee minutes, October 2024')).closest('li')!;
    expect(within(minutes).getByText('Outdated')).toBeInTheDocument();
    expect(within(minutes).getByText(/why outdated/i).parentElement).toHaveTextContent(/study was due in spring 2025/);
  });

  it('says how each source relates to the claim', async () => {
    renderApp('/checks/chk_demo_real');
    const passage = (await screen.findByText('Ngày 6/11, chính thức khai thác thương mại tuyến đường sắt Cát Linh - Hà Đông')).closest('li')!;
    expect(within(passage).getByText('This source gives background but does not settle the claim.')).toBeInTheDocument();
  });

  it('has no citation number buttons', async () => {
    renderApp('/checks/chk_demo_transit');
    await screen.findByText('Harbor Line opens to passengers');
    expect(screen.queryByRole('button', { name: /^citation/i })).not.toBeInTheDocument();
  });

  it('moves between claims with next and previous, with no next on the last claim', async () => {
    const user = userEvent.setup();
    renderApp('/checks/chk_demo_transit');
    await screen.findByText('Harbor Line opens to passengers');
    expect(screen.queryByRole('button', { name: 'Previous claim' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next claim' }));
    expect(evidencePanel()).toHaveAccessibleName('Evidence snapshots for claim 2');
    expect(screen.getByText('Claim 2 of 4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next claim' }));
    await user.click(screen.getByRole('button', { name: 'Next claim' }));
    expect(evidencePanel()).toHaveAccessibleName('Evidence snapshots for claim 4');
    expect(screen.queryByRole('button', { name: 'Next claim' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous claim' }));
    expect(evidencePanel()).toHaveAccessibleName('Evidence snapshots for claim 3');
  });

  it('shows the article a URL check read, and keeps that article out of its own evidence', async () => {
    renderApp('/checks/chk_demo_url_vi');
    const title = 'WHO tuyên bố Covid-19 không còn là tình trạng y tế khẩn cấp toàn cầu';
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText('Article checked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open article/i })).toHaveAttribute('href', expect.stringContaining('vnexpress.net'));
    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();

    expect(screen.getAllByRole('article')).toHaveLength(1);
    await screen.findByRole('list', { name: /evidence snapshots/i });
    expect(within(evidencePanel()).getAllByRole('listitem').map((item) => item.textContent).join()).not.toContain('VnExpress');
  });

  it('shows the file a check read', async () => {
    const user = userEvent.setup();
    renderApp('/checks/chk_demo_file_vi');
    expect(await screen.findByRole('heading', { name: 'ghi-chu-giao-thong-ha-noi.txt' })).toBeInTheDocument();
    expect(screen.getByText('File checked')).toBeInTheDocument();
    expect(screen.queryByText(/sample data/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);

    await user.click(screen.getByText('File contents'));
    expect(screen.getByText(/Ghi chú ví dụ về giao thông Hà Nội/)).toBeVisible();
  });

  it('says so when the demo did not really read the link', async () => {
    renderApp('/checks/chk_demo_url');
    expect(await screen.findByText(/did not read this link/i)).toBeInTheDocument();
  });

  it('shows nothing extra for pasted text', async () => {
    renderApp('/checks/chk_demo_transit');
    await screen.findByText('Harbor Line opens to passengers');
    expect(screen.queryByText('Article checked')).not.toBeInTheDocument();
    expect(screen.queryByText('File checked')).not.toBeInTheDocument();
  });

  it('shows both AI models’ overall reviews together, with neither verdict repeated when they agree', async () => {
    renderApp('/checks/chk_demo_real');
    await screen.findByText('Hanoi gets country’s 1st metro service');

    const reviews = screen.getByRole('list', { name: 'Reviews from both AI models' });
    const [first, second] = within(reviews).getAllByRole('listitem');
    expect(within(first).getByText('GPT Luna').tagName).toBe('STRONG');
    expect(within(first).getByText(/Four reports published on 6 November 2021/)).toBeInTheDocument();
    expect(within(first).getByText('95% confidence')).toBeInTheDocument();
    expect(within(second).getByText('Claude Haiku 5.5').tagName).toBe('STRONG');
    expect(within(second).getByText(/The date holds up/)).toBeInTheDocument();
    expect(within(second).getByText('92% confidence')).toBeInTheDocument();
    expect(within(reviews).queryByText('Supported')).not.toBeInTheDocument();
  });

  it('says so when the two AI models reach different verdicts, and shows each verdict', async () => {
    renderApp('/checks/chk_demo_transit?claim=2');
    expect(await screen.findByText('AI judges disagree')).toBeInTheDocument();

    const reviews = screen.getByRole('list', { name: 'Reviews from both AI models' });
    expect(within(reviews).getByText('Contradicted')).toBeInTheDocument();
    expect(within(reviews).getByText('Insufficient evidence')).toBeInTheDocument();
    expect(within(reviews).getByText(/boardings and trips may not be counted the same way, and no source/)).toBeInTheDocument();
  });

  it('shows what a source says, and opens the two AI models’ comments below it', async () => {
    const user = userEvent.setup();
    renderApp('/checks/chk_demo_real');
    await screen.findByText('Hanoi gets country’s 1st metro service');
    expect(screen.getByText(/first train leaving Cat Linh station at 7:40/)).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /^see analysis: hanoi gets/i });
    const comment = screen.getByText(/I read this as direct support/);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(comment).not.toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(comment).toBeVisible();
    const comments = screen.getByRole('heading', { name: 'Comments from both AI models', hidden: false }).parentElement!;
    expect(comments.querySelector('img[src="/logos/openai.svg"]')).toBeInTheDocument();
    expect(comments.querySelector('img[src="/logos/anthropic.svg"]')).toBeInTheDocument();

    // The chart's numbers are in a table too, one row per criterion and one column per model.
    const heading = screen.getByRole('heading', { name: 'How both AI models rated this source', hidden: false });
    const table = within(heading.parentElement!).getAllByRole('table')[0];
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    const row = within(table).getByRole('row', { name: /matches the claim/i });
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['96', '88']);

    const kinds = within(heading.parentElement!).getByRole('group', { name: 'Chart type' });
    expect(within(kinds).getByRole('button', { name: 'Bars' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(kinds).getByRole('button', { name: 'Radar' }));
    expect(within(kinds).getByRole('button', { name: 'Radar' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(kinds).getByRole('button', { name: 'Bars' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: /^hide analysis: hanoi gets/i }));
    expect(comment).not.toBeVisible();
  });

  describe('on wide screens', () => {
    const original = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        matches: query.includes('min-width'),
        addEventListener: () => {},
        removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = original;
    });

    it('opens a source when it is hovered, and it stays open', async () => {
      const user = userEvent.setup();
      renderApp('/checks/chk_demo_real');
      await screen.findByText('Hanoi gets country’s 1st metro service');

      await user.hover(screen.getByRole('button', { name: /show source: first metro line/i }));
      expect(await screen.findByRole('link', { name: /^visit source: first metro line/i })).toBeInTheDocument();
      expect(screen.getByText(/put into operation in the capital city/)).toBeInTheDocument();

      await user.unhover(screen.getByRole('link', { name: /^visit source: first metro line/i }));
      expect(screen.getByRole('link', { name: /^visit source: first metro line/i })).toBeInTheDocument();
    });

    it('opens one source at a time', async () => {
      const user = userEvent.setup();
      renderApp('/checks/chk_demo_real');
      await screen.findByText('Hanoi gets country’s 1st metro service');
      const links = () => within(evidencePanel()).getAllByRole('link', { name: /^visit source/i });
      expect(links()).toHaveLength(1);
      expect(screen.getByRole('button', { name: /show source: first metro line/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /show source: first metro line/i }));
      // The old card's text fades out before the new card's text appears.
      await waitFor(() => expect(links()[0]).toHaveAttribute('href', expect.stringContaining('en.baochinhphu.vn')));
      expect(links()).toHaveLength(1);
      expect(screen.getByText(/put into operation in the capital city/)).toBeInTheDocument();
    });
  });

  it('opens the claim named in the URL', async () => {
    renderApp('/checks/chk_demo_transit?claim=3');
    expect(await screen.findByRole('list', { name: 'Evidence snapshots for claim 3' })).toBeInTheDocument();
    const budget = screen.getByRole('article', { name: /original budget/i });
    expect(within(budget).getByRole('button', { name: /original budget/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('starts at the claims, with the selected claim as the page heading', async () => {
    renderApp('/checks/chk_demo_transit');
    await screen.findByText('Harbor Line opens to passengers');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/opened to passengers in March 2024/);
    expect(screen.queryByText(/claims checked/i)).not.toBeInTheDocument();
    expect(screen.queryByText('claims supported')).not.toBeInTheDocument();
  });

  it('shows each real source\u2019s article image, and no image for fictional sources', async () => {
    const { unmount } = renderApp('/checks/chk_demo_real');
    await screen.findByText('Hanoi gets country\u2019s 1st metro service');
    expect(evidencePanel().querySelector('img[src^="https://i1-english.vnecdn.net/"]')).toHaveAttribute('referrerpolicy', 'no-referrer');
    unmount();

    renderApp('/checks/chk_demo_transit');
    await screen.findByText('Harbor Line opens to passengers');
    // Article images load with no referrer. The AI labs' logos in the comments are ours.
    expect(evidencePanel().querySelector('img[referrerpolicy]')).toBeNull();
  });

  it('shows a provider failure as verification unavailable, not a verdict', async () => {
    renderApp('/checks/chk_demo_url');
    const claim = await screen.findByRole('article', { name: /downtown traffic congestion/i });
    expect(within(claim).getByText('Verification unavailable')).toBeInTheDocument();
    expect(within(claim).queryByText(/insufficient evidence/i)).not.toBeInTheDocument();
  });
});
