import { describe, expect, it } from 'vitest';
import { mockCheckService as service } from './mockCheckService';
import { ValidationError, VersionConflictError } from '../errors';

describe('mockCheckService', () => {
  it('preserves earlier revisions when publishing a correction', async () => {
    const claimId = 'chk_demo_transit_c2';
    await service.getCheck('chk_demo_transit');
    const [original] = await service.getClaimRevisions(claimId);

    const { claim, revision } = await service.publishCorrection(claimId, {
      verdict: 'insufficient_evidence',
      reason: 'The report covers weekdays only.',
      evidenceIds: [`${claimId}_e1`],
      expectedVersion: 1,
    });

    expect(revision.version).toBe(2);
    expect(claim.current?.verdict).toBe('insufficient_evidence');
    const revisions = await service.getClaimRevisions(claimId);
    expect(revisions[0]).toEqual(original);
  });

  it('rejects evidence that is not attached to the claim', async () => {
    await service.getCheck('chk_demo_transit');
    await expect(
      service.publishCorrection('chk_demo_transit_c2', {
        verdict: 'supported',
        reason: 'Citing another claim’s evidence.',
        evidenceIds: ['chk_demo_transit_c1_e1'],
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('never overwrites a newer revision', async () => {
    await service.getCheck('chk_demo_transit');
    const claimId = 'chk_demo_transit_c3'; // seeded with an AI assessment and a human correction
    await expect(
      service.publishCorrection(claimId, {
        verdict: 'supported',
        reason: 'Based on an outdated view.',
        evidenceIds: [],
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);
    expect(await service.getClaimRevisions(claimId)).toHaveLength(2);
  });

  it('rejects attachments that are not safe raster images', async () => {
    await service.getCheck('chk_demo_transit');
    await expect(
      service.publishCorrection('chk_demo_transit_c1', {
        verdict: 'supported',
        reason: 'Attaching a remote image should fail.',
        evidenceIds: [],
        attachments: [{ id: 'a', name: 'x.png', type: 'image/png', size: 1, dataUrl: 'https://example.org/x.png' }],
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps freshness judgments per revision without rewriting earlier ones', async () => {
    await service.getCheck('chk_demo_transit');
    const [ai, human] = await service.getClaimRevisions('chk_demo_transit_c3');
    expect(ai.citationFreshness?.['chk_demo_transit_c3_e1']?.status).toBe('current');
    expect(human.citationFreshness?.['chk_demo_transit_c3_e1']).toMatchObject({ status: 'outdated' });
    expect(ai.model).toMatchObject({ promptVersion: 'assess-v3' });
    expect(human.model).toBeUndefined();
  });

  it('rejects a judge pair that is not two different known judges', async () => {
    const url = 'https://example.org/news/story';
    await expect(service.createCheck({ inputType: 'url', url, judgeIds: ['gpt-luna'] })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      service.createCheck({ inputType: 'url', url, judgeIds: ['gpt-luna', 'gpt-luna'] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('stores the judges a new check was started with', async () => {
    const check = await service.createCheck({
      inputType: 'url',
      url: 'https://example.org/news/story',
      judgeIds: ['gpt-luna', 'glm-5-3-flash'],
    });
    expect(check.judgeIds).toEqual(['gpt-luna', 'glm-5-3-flash']);
  });

  it('keeps each judge verdict on AI revisions and marks the shown one as primary', async () => {
    await service.getCheck('chk_demo_transit');
    const [ai] = await service.getClaimRevisions('chk_demo_transit_c3');
    expect(ai.judges).toHaveLength(2);
    expect(ai.judges?.filter((judge) => judge.primary)).toHaveLength(1);
    expect(ai.judges?.[0]).toMatchObject({ primary: true, verdict: ai.verdict });
  });

  it('attaches a matched fact-check to the claim', async () => {
    const check = await service.getCheck('chk_demo_transit');
    expect(check.claims.find((claim) => claim.factCheck)?.factCheck?.rating).toBe('Misleading');
  });

  it('requires a reason for outdated evidence and rejects freshness for uncited evidence', async () => {
    await service.getCheck('chk_demo_transit');
    const base = { verdict: 'supported' as const, reason: 'Testing freshness rules.', expectedVersion: 1 };
    await expect(
      service.publishCorrection('chk_demo_transit_c1', {
        ...base,
        evidenceIds: ['chk_demo_transit_c1_e1'],
        citationFreshness: { chk_demo_transit_c1_e1: { status: 'outdated' } },
      }),
    ).rejects.toThrow(/outdated/i);
    await expect(
      service.publishCorrection('chk_demo_transit_c1', {
        ...base,
        evidenceIds: ['chk_demo_transit_c1_e1'],
        citationFreshness: { chk_demo_transit_c1_e2: { status: 'current' } },
      }),
    ).rejects.toThrow(/cited in this correction/i);
  });

  it('recovers from malformed stored data', async () => {
    window.localStorage.setItem('claimtrace.demo.v7', '{not json');
    const page = await service.listChecks();
    expect(page.total).toBeGreaterThan(0);
  });
});
