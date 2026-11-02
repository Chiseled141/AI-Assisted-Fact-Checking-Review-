import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { checkService } from '../../services';

// The button is off for now, but the dialog behind it should keep working.
vi.mock('../../config', async (importOriginal) => {
  const { config } = await importOriginal<typeof import('../../config')>();
  return { config: { ...config, correction: { ...config.correction, showReviewButton: true } } };
});

async function openReview(checkId: string, claimName: RegExp) {
  const user = userEvent.setup();
  renderApp(`/checks/${checkId}`);
  const card = await screen.findByRole('article', { name: claimName });
  await user.click(within(card).getByRole('button', { name: claimName }));
  await user.click(screen.getByRole('button', { name: /review assessment/i }));
  const dialog = await screen.findByRole('dialog', { name: /review assessment/i });
  return { user, dialog };
}

describe('Publishing a correction', () => {
  it('is not offered when verification was unavailable', async () => {
    renderApp('/checks/chk_demo_url');
    const claim = await screen.findByRole('article', { name: /downtown traffic congestion/i });
    await userEvent.setup().click(within(claim).getByRole('button', { name: /downtown traffic congestion/i }));
    expect(await screen.findByText(/no evidence was retrieved/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review assessment/i })).not.toBeInTheDocument();
  });

  it('creates a new revision and preserves the original AI assessment', async () => {
    const { user, dialog } = await openReview('chk_demo_transit', /opened to passengers in march 2024/i);

    await user.click(within(dialog).getByRole('radio', { name: 'Insufficient evidence' }));
    await user.type(
      within(dialog).getByLabelText(/correction reason/i),
      'Both sources describe the opening ceremony, not the start of regular service.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));

    expect(await within(dialog).findByText(/published as revision 2/i)).toBeInTheDocument();

    const claimId = 'chk_demo_transit_c1';
    const revisions = await checkService.getClaimRevisions(claimId);
    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toMatchObject({ version: 1, kind: 'ai_assessment', verdict: 'supported' });
    expect(revisions[1]).toMatchObject({ version: 2, kind: 'human_correction', verdict: 'insufficient_evidence' });

    expect(screen.getByText('Human correction · rev 2')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /view revision history/i }));
    const drawer = await screen.findByRole('dialog', { name: /revision history/i });
    expect(await within(drawer).findByRole('heading', { name: 'Revision 1' })).toBeInTheDocument();
    expect(within(drawer).getByText('Original')).toBeInTheDocument();
    expect(within(drawer).getByRole('heading', { name: 'Revision 2' }).parentElement).toHaveTextContent('Current');
  });

  it('requires a correction reason', async () => {
    const { user, dialog } = await openReview('chk_demo_transit', /opened to passengers in march 2024/i);
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(within(dialog).getByText(/explain why in at least/i)).toBeInTheDocument();
    expect(await checkService.getClaimRevisions('chk_demo_transit_c1')).toHaveLength(1);
  });
});

describe('Citations in corrections', () => {
  it('keeps the current citations and their freshness when the verdict stays the same', async () => {
    const { user, dialog } = await openReview('chk_demo_transit', /opened to passengers in march 2024/i);
    await user.type(within(dialog).getByLabelText(/correction reason/i), 'Adding the exact date to the record.');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByText(/published as revision 2/i)).toBeInTheDocument();

    const [original, correction] = await checkService.getClaimRevisions('chk_demo_transit_c1');
    expect(correction.citedEvidenceIds).toEqual(original.citedEvidenceIds);
    expect(correction.citationFreshness).toEqual(original.citationFreshness);
  });

  it('marks the cited sources outdated when the verdict is outdated', async () => {
    const { user, dialog } = await openReview('chk_demo_transit', /opened to passengers in march 2024/i);
    await user.click(within(dialog).getByRole('radio', { name: 'Outdated' }));
    await user.type(within(dialog).getByLabelText(/correction reason/i), 'A later timetable replaced these dates.');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByText(/published as revision 2/i)).toBeInTheDocument();

    const [original, correction] = await checkService.getClaimRevisions('chk_demo_transit_c1');
    expect(correction.verdict).toBe('outdated');
    expect(correction.citedEvidenceIds).toEqual(original.citedEvidenceIds);
    for (const id of correction.citedEvidenceIds) {
      expect(correction.citationFreshness?.[id]).toEqual({
        status: 'outdated',
        reason: 'A later timetable replaced these dates.',
      });
    }
  });

  it('cites the sources that fit a changed verdict', async () => {
    const user = userEvent.setup();
    renderApp('/checks/chk_demo_transit?claim=3');
    await screen.findByText('Harbor Line delivered on schedule');
    await user.click(screen.getByRole('button', { name: /review assessment/i }));
    const dialog = await screen.findByRole('dialog', { name: /review assessment/i });

    await user.click(within(dialog).getByRole('radio', { name: 'Supported' }));
    await user.type(within(dialog).getByLabelText(/correction reason/i), 'The approved budget is the right measure here.');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByText(/published as revision/i)).toBeInTheDocument();

    const correction = (await checkService.getClaimRevisions('chk_demo_transit_c3')).at(-1)!;
    expect(correction.verdict).toBe('supported');
    expect(correction.citedEvidenceIds).toEqual(['chk_demo_transit_c3_e1']);
  });
});

describe('Stale-version conflict', () => {
  it('rejects the stale correction, explains it, and lets the reviewer reload', async () => {
    const { user, dialog } = await openReview('chk_demo_conflict', /opened to passengers in march 2024/i);

    await user.type(within(dialog).getByLabelText(/correction reason/i), 'Adding the exact opening date to the record.');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/changed while you were reviewing/i);
    expect(alert).toHaveTextContent(/nothing was overwritten/i);
    expect(alert).toHaveTextContent(/demo simulation/i);
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeDisabled();

    // The concurrent revision is kept; the stale request did not create one.
    const afterConflict = await checkService.getClaimRevisions('chk_demo_conflict_c1');
    expect(afterConflict.map((r) => r.version)).toEqual([1, 2]);
    expect(afterConflict[1].author).toMatch(/another reviewer/i);

    await user.click(within(dialog).getByRole('button', { name: /reload latest version/i }));
    expect(await within(dialog).findByText(/latest version loaded \(revision 2\)/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/correction reason/i)).toHaveValue('Adding the exact opening date to the record.');

    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByText(/published as revision 3/i)).toBeInTheDocument();
  });
});

describe('Correction screenshots', () => {
  const png = () =>
    new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13])], 'proof.png', { type: 'image/png' });

  it('attaches a screenshot, saves it with the revision, and shows it in history', async () => {
    const { user, dialog } = await openReview('chk_demo_transit', /opened to passengers in march 2024/i);

    await user.upload(within(dialog).getByTestId('screenshot-input'), png());
    expect(await within(dialog).findByRole('button', { name: 'Remove screenshot proof.png' })).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/correction reason/i), 'Screenshot of the timetable shows a later date.');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByText(/with 1 screenshot/i)).toBeInTheDocument();

    const [, revision] = await checkService.getClaimRevisions('chk_demo_transit_c1');
    expect(revision.attachments).toHaveLength(1);
    expect(revision.attachments?.[0]).toMatchObject({ name: 'proof.png', type: 'image/png' });

    await user.click(within(dialog).getByRole('button', { name: /view revision history/i }));
    const drawer = await screen.findByRole('dialog', { name: /revision history/i });
    await user.click(await within(drawer).findByRole('button', { name: 'View screenshot proof.png' }));
    expect(within(drawer).getByRole('img', { name: 'Screenshot: proof.png' })).toBeInTheDocument();
  });

  it('rejects unsupported image types', async () => {
    const { dialog } = await openReview('chk_demo_transit', /opened to passengers in march 2024/i);
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(
      within(dialog).getByTestId('screenshot-input'),
      new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }),
    );
    expect(await within(dialog).findByText(/“logo.svg” is not a supported image/)).toBeInTheDocument();
  });
});
