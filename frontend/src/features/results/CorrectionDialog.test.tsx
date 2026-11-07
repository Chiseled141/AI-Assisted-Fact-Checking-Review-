import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CorrectionDialog } from './CorrectionDialog';
import { makeClaim, makeEvidence, makeRevision } from '../../test/fixtures';
import { interceptRequests, jsonResponse } from '../../test/http';

function openReview() {
  const onPublished = vi.fn();
  const onReloadLatest = vi.fn().mockResolvedValue(makeClaim({ currentVersion: 2 }));
  render(<CorrectionDialog open claim={makeClaim()} evidence={[makeEvidence()]} onClose={() => {}}
    onPublished={onPublished} onReloadLatest={onReloadLatest} onShowHistory={() => {}} />);
  return { user: userEvent.setup(), dialog: screen.getByRole('dialog'), onPublished, onReloadLatest };
}

describe('Correction requests', () => {
  it('requires a reason before sending a request', async () => {
    const fetchMock = interceptRequests(() => { throw new Error('Must validate first.'); });
    const { user, dialog } = openReview();
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(within(dialog).getByText(/explain why in at least/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the version, citations and reason, and uses the returned revision', async () => {
    const revision = makeRevision({ id: 'rev_correction', version: 2, kind: 'human_correction' });
    const fetchMock = interceptRequests((url, init) => {
      expect(url.pathname).toBe('/api/claims/clm_test/corrections');
      expect(init?.method).toBe('POST');
      return jsonResponse({ claim: makeClaim({ current: revision, currentVersion: 2 }), revision }, 201);
    });
    const { user, dialog, onPublished } = openReview();
    await user.type(within(dialog).getByLabelText(/correction reason/i), 'Adding the precise opening date.');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByText('Correction published as revision 2.')).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      expectedVersion: 1, verdict: 'supported', reason: 'Adding the precise opening date.',
      evidenceIds: ['evd_test'], citationFreshness: { evd_test: { status: 'current' } },
    });
    expect(onPublished).toHaveBeenCalledWith(revision);
  });

  it('keeps outdated citations paired with the reviewer’s reason', async () => {
    const fetchMock = interceptRequests(() => jsonResponse({ claim: makeClaim(), revision: makeRevision({ version: 2, verdict: 'outdated' }) }, 201));
    const { user, dialog } = openReview();
    await user.click(within(dialog).getByRole('radio', { name: 'Outdated' }));
    await user.type(within(dialog).getByLabelText(/correction reason/i), 'A later timetable replaced these dates.');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await within(dialog).findByText('Correction published as revision 2.');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).citationFreshness).toEqual({
      evd_test: { status: 'outdated', reason: 'A later timetable replaced these dates.' },
    });
  });

  it('handles a real conflict response and reloads before retrying', async () => {
    let posts = 0;
    const fetchMock = interceptRequests(() => {
      if (++posts === 1) return jsonResponse({ detail: { expectedVersion: 1, currentVersion: 2 } }, 409);
      return jsonResponse({ claim: makeClaim(), revision: makeRevision({ version: 3 }) }, 201);
    });
    const { user, dialog, onReloadLatest } = openReview();
    await user.type(within(dialog).getByLabelText(/correction reason/i), 'Adding the exact date to the record.');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/nothing was overwritten/i);
    expect(alert).not.toHaveTextContent(/demo|simulation/i);
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: /reload latest version/i }));
    expect(await within(dialog).findByText(/latest version loaded \(revision 2\)/i)).toBeInTheDocument();
    expect(onReloadLatest).toHaveBeenCalledOnce();
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await within(dialog).findByText('Correction published as revision 3.');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).expectedVersion).toBe(2);
  });

  it('attaches screenshot data to the correction request', async () => {
    const fetchMock = interceptRequests(() => jsonResponse({ claim: makeClaim(), revision: makeRevision({ version: 2 }) }, 201));
    const { user, dialog } = openReview();
    const png = new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13])], 'proof.png', { type: 'image/png' });
    await user.upload(within(dialog).getByTestId('screenshot-input'), png);
    await within(dialog).findByRole('button', { name: 'Remove screenshot proof.png' });
    await user.type(within(dialog).getByLabelText(/correction reason/i), 'A screenshot of the dated report.');
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await within(dialog).findByText('Correction published as revision 2.');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).attachments).toEqual([
      expect.objectContaining({ name: 'proof.png', type: 'image/png', dataUrl: expect.stringMatching(/^data:image\/png;base64,/) }),
    ]);
  });

  it('rejects unsupported screenshot types', async () => {
    const { dialog } = openReview();
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(within(dialog).getByTestId('screenshot-input'), new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(await within(dialog).findByText(/“logo.svg” is not a supported image/)).toBeInTheDocument();
  });
});
