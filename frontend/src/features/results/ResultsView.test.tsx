import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
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

  it('selects the claim and focuses the passage when a citation is clicked', async () => {
    const user = userEvent.setup();
    renderApp('/checks/chk_demo_transit');
    await screen.findByText('Harbor Line opens to passengers');

    const ridership = screen.getByRole('article', { name: /ridership reached 50,000/i });
    await user.click(within(ridership).getByRole('button', { name: /ridership reached 50,000/i }));
    await screen.findByText('Six-month ridership summary, Harbor Line');
    await user.click(screen.getByRole('button', { name: /citation 2/i }));

    const passage = (await screen.findByText('What the Harbor Line promised, and when')).closest('li');
    expect(passage).toHaveAttribute('aria-current', 'true');
    expect(passage).toHaveFocus();
  });

  it('shows the source date, exact retrieval time, and page capture for each snapshot', async () => {
    const user = userEvent.setup();
    renderApp('/checks/chk_demo_transit');
    const passage = (await screen.findByText('Harbor Line opens to passengers')).closest('li')!;

    expect(within(passage).getByText('Published').nextElementSibling).toHaveTextContent('March 18, 2024');
    const retrieved = within(passage).getByText('Retrieved').nextElementSibling!.querySelector('time')!;
    expect(retrieved).toHaveAttribute('datetime', expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/));
    expect(retrieved.textContent).toMatch(/\d{1,2}:\d{2}:\d{2}/);

    expect(within(passage).queryByRole('img', { name: /page capture/i })).not.toBeInTheDocument();
    await user.click(within(passage).getByRole('button', { name: /show page capture/i }));
    const capture = within(passage).getByRole('img', { name: 'Page capture of Harbor Line opens to passengers' });
    expect(capture).toHaveAttribute('src', '/captures/mcta-release.svg');
    expect(within(passage).getByRole('button', { name: /hide page capture/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('tags outdated and unknown-freshness evidence with a reason, separate from the verdict', async () => {
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

    const ridership = screen.getByRole('article', { name: /ridership reached 50,000/i });
    await user.click(within(ridership).getByRole('button', { name: /ridership reached 50,000/i }));
    const target = (await screen.findByText('What the Harbor Line promised, and when')).closest('li')!;
    expect(within(target).getByText('Freshness unknown')).toBeInTheDocument();
  });

  it('can close the evidence panel and reopen it', async () => {
    const user = userEvent.setup();
    renderApp('/checks/chk_demo_transit');
    await screen.findByText('Harbor Line opens to passengers');

    await user.click(screen.getByRole('button', { name: 'Close evidence panel' }));
    expect(screen.queryByRole('list', { name: /evidence snapshots for claim/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^show evidence · claim 1$/i }));
    expect(evidencePanel()).toHaveAccessibleName('Evidence snapshots for claim 1');
  });

  it('opens the claim named in the URL', async () => {
    renderApp('/checks/chk_demo_transit?claim=3');
    expect(await screen.findByRole('list', { name: 'Evidence snapshots for claim 3' })).toBeInTheDocument();
    const budget = screen.getByRole('article', { name: /original budget/i });
    expect(within(budget).getByRole('button', { name: /original budget/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the share of supported claims, labeled as not a truth score', async () => {
    renderApp('/checks/chk_demo_transit');
    await screen.findByText('Harbor Line opens to passengers');
    // Seeded transit check: 1 supported out of 4 claims.
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('of claims supported')).toBeInTheDocument();
    expect(screen.getByText('Share of claims, not a truth score')).toBeInTheDocument();
  });

  it('shows a provider failure as verification unavailable, not a verdict', async () => {
    renderApp('/checks/chk_demo_url');
    const claim = await screen.findByRole('article', { name: /downtown traffic congestion/i });
    expect(within(claim).getByText('Verification unavailable')).toBeInTheDocument();
    expect(within(claim).queryByRole('button', { name: /review assessment/i })).not.toBeInTheDocument();
    expect(within(claim).queryByText(/insufficient evidence/i)).not.toBeInTheDocument();
  });
});
