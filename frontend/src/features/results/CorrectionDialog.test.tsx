import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { checkService } from '../../services';

async function openReview(checkId: string, claimName: RegExp) {
  const user = userEvent.setup();
  renderApp(`/checks/${checkId}`);
  const card = await screen.findByRole('article', { name: claimName });
  await user.click(within(card).getByRole('button', { name: claimName }));
  await user.click(screen.getByRole('button', { name: /review assessment/i }));
  const dialog = await screen.findByRole('dialog', { name: /review assessment/i });
  // Wait for the claim's evidence snapshots to load into the form.
  await within(dialog).findAllByRole('checkbox');
  return { user, dialog };
}

describe('Publishing a correction', () => {
  it('creates a new revision and preserves the original AI assessment', async () => {
    const { user, dialog } = await openReview('chk_demo_transit', /opened to passengers in march 2024/i);

    await user.click(within(dialog).getByRole('radio', { name: 'Insufficient evidence' }));
    await user.type(
      within(dialog).getByLabelText(/correction reason/i),
      'Both sources describe the opening ceremony, not the start of regular service.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Publish correction' }));

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
    await user.click(within(dialog).getByRole('button', { name: 'Publish correction' }));
    expect(within(dialog).getByText(/explain why in at least/i)).toBeInTheDocument();
    expect(await checkService.getClaimRevisions('chk_demo_transit_c1')).toHaveLength(1);
  });
});

describe('Freshness in corrections', () => {
  it('requires a reason when a cited source is marked outdated, then saves it with the revision', async () => {
    const { user, dialog } = await openReview('chk_demo_transit', /opened to passengers in march 2024/i);

    await user.selectOptions(within(dialog).getByLabelText('Freshness of Harbor Line opens to passengers'), 'outdated');
    await user.type(within(dialog).getByLabelText(/correction reason/i), 'Service dates were later revised.');
    await user.click(within(dialog).getByRole('button', { name: 'Publish correction' }));
    expect(within(dialog).getByText('Explain why this source is outdated.')).toBeInTheDocument();
    expect(await checkService.getClaimRevisions('chk_demo_transit_c1')).toHaveLength(1);

    await user.type(
      within(dialog).getByLabelText('Freshness reason for Harbor Line opens to passengers'),
      'A later timetable superseded this release.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Publish correction' }));
    expect(await within(dialog).findByText(/published as revision 2/i)).toBeInTheDocument();

    const [original, correction] = await checkService.getClaimRevisions('chk_demo_transit_c1');
    expect(original.citationFreshness?.['chk_demo_transit_c1_e1']?.status).toBe('current');
    expect(correction.citationFreshness?.['chk_demo_transit_c1_e1']).toEqual({
      status: 'outdated',
      reason: 'A later timetable superseded this release.',
    });
  });
});

describe('Stale-version conflict', () => {
  it('rejects the stale correction, explains it, and lets the reviewer reload', async () => {
    const { user, dialog } = await openReview('chk_demo_conflict', /opened to passengers in march 2024/i);

    await user.type(within(dialog).getByLabelText(/correction reason/i), 'Adding the exact opening date to the record.');
    await user.click(within(dialog).getByRole('button', { name: 'Publish correction' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/changed while you were reviewing/i);
    expect(alert).toHaveTextContent(/nothing was overwritten/i);
    expect(alert).toHaveTextContent(/demo simulation/i);
    expect(within(dialog).getByRole('button', { name: 'Publish correction' })).toBeDisabled();

    // The concurrent revision is kept; the stale request did not create one.
    const afterConflict = await checkService.getClaimRevisions('chk_demo_conflict_c1');
    expect(afterConflict.map((r) => r.version)).toEqual([1, 2]);
    expect(afterConflict[1].author).toMatch(/another reviewer/i);

    await user.click(within(dialog).getByRole('button', { name: /reload latest version/i }));
    expect(await within(dialog).findByText(/latest version loaded \(revision 2\)/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/correction reason/i)).toHaveValue('Adding the exact opening date to the record.');

    await user.click(within(dialog).getByRole('button', { name: 'Publish correction' }));
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
    await user.click(within(dialog).getByRole('button', { name: 'Publish correction' }));
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
