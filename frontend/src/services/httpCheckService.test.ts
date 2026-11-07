import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ apiUrl: 'http://api.test' }));

import { httpCheckService } from './httpCheckService';
import { NotFoundError, ValidationError, VersionConflictError } from './errors';

function reply(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('httpCheckService', () => {
  it('posts a new check with the selected model IDs', async () => {
    const fetchMock = reply(202, { id: 'chk_1', status: 'queued' });
    const check = await httpCheckService.createCheck({ inputType: 'url', url: 'https://a.org/b', judgeIds: ['gpt-luna', 'gemma-4-31b'] });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/check');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ inputType: 'url', url: 'https://a.org/b', judgeIds: ['gpt-luna', 'gemma-4-31b'] });
    expect(check.id).toBe('chk_1');
  });

  it('sends history filters', async () => {
    const fetchMock = reply(200, { items: [{ id: 'chk_1' }], page: 2, pageSize: 5, total: 6, totalPages: 2 });
    const page = await httpCheckService.listChecks({ query: 'metro', status: 'failed', page: 2, pageSize: 5 });
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/checks?query=metro&status=failed&page=2&pageSize=5');
    expect(page.items[0].id).toBe('chk_1');
  });

  it('turns server errors into the errors the UI understands', async () => {
    reply(404, { detail: 'Not found.' });
    await expect(httpCheckService.getCheck('nope')).rejects.toBeInstanceOf(NotFoundError);

    reply(422, { detail: 'Enter a valid link.' });
    await expect(httpCheckService.createCheck({ inputType: 'url', url: 'x' })).rejects.toThrow(
      new ValidationError('Enter a valid link.'),
    );

    reply(503, { detail: 'The server is missing its API keys.' });
    await expect(httpCheckService.createCheck({ inputType: 'text', text: 'x' })).rejects.toBeInstanceOf(ValidationError);

    reply(409, { detail: { expectedVersion: 1, currentVersion: 2 } });
    const conflict = await httpCheckService
      .publishCorrection('clm_1', { verdict: 'supported', reason: 'r', evidenceIds: [], expectedVersion: 1 })
      .catch((error) => error);
    expect(conflict).toBeInstanceOf(VersionConflictError);
    expect(conflict.currentVersion).toBe(2);

    reply(500, {});
    await expect(httpCheckService.getCheck('x')).rejects.not.toBeInstanceOf(ValidationError);
  });
});
