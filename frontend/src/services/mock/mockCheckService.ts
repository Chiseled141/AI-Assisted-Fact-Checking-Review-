// Mock implementation of CheckService. Simulates processing with timestamps
// (so a page refresh never leaves a check stuck) and plays back fixture data.
// No network requests, AI calls, or URL fetching happen here.

import { config } from '../../config';
import { deriveTitle } from '../../lib/format';
import {
  isSafeImageDataUrl,
  validateFile,
  validateFileText,
  validateTextSubmission,
  validateUrl,
} from '../../lib/validation';
import {
  FAILED_CHECK_REASON,
  FIXTURE_MODEL,
  PARTIAL_FAILURE_REASON,
  STALE_CONFLICT_AUTHOR,
  fixtureClaims,
} from '../../mocks/fixtures';
import type {
  AssessmentRevision,
  Check,
  CheckDetail,
  CheckStatus,
  Claim,
  CorrectionRequest,
  CreateCheckInput,
  EvidenceSnapshot,
  ListChecksParams,
  Page,
} from '../../types/models';
import { isTerminal } from '../../types/models';
import type { CheckService, PublishCorrectionResult } from '../contract';
import { NotFoundError, ValidationError, VersionConflictError } from '../errors';
import { type DemoDb, type StoredCheck, loadDb, saveDb } from './demoDb';

let latency: number = config.mockLatency;

/** Tests set this to 0 to avoid artificial waits. */
export function setMockLatency(ms: number): void {
  latency = ms;
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), latency));
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

const stage = config.stageDurations;
const COMPLETES_AFTER = stage.queued + stage.extracting + stage.retrieving + stage.assessing;
const FAILS_AFTER = stage.queued + stage.extracting + Math.round(stage.retrieving * 0.75);

function statusAt(check: StoredCheck, now: number): CheckStatus {
  const elapsed = now - new Date(check.createdAt).getTime();
  if (check.scenario === 'failed' && elapsed >= FAILS_AFTER) return 'failed';
  if (elapsed < stage.queued) return 'queued';
  if (elapsed < stage.queued + stage.extracting) return 'extracting';
  if (elapsed < stage.queued + stage.extracting + stage.retrieving) return 'retrieving';
  if (elapsed < COMPLETES_AFTER) return 'assessing';
  return 'completed';
}

/** Moves a check forward based on elapsed time. Returns true if it changed. */
function advance(db: DemoDb, check: StoredCheck, now: number): boolean {
  if (isTerminal(check.status)) return false;
  const next = statusAt(check, now);
  if (next === check.status) return false;

  const createdMs = new Date(check.createdAt).getTime();
  check.status = next;
  if (next === 'completed') {
    materializeClaims(db, check);
    check.updatedAt = new Date(createdMs + COMPLETES_AFTER).toISOString();
  } else if (next === 'failed') {
    check.errorMessage = FAILED_CHECK_REASON;
    check.updatedAt = new Date(createdMs + FAILS_AFTER).toISOString();
  } else {
    check.updatedAt = new Date(now).toISOString();
  }
  return true;
}

function materializeClaims(db: DemoDb, check: StoredCheck): void {
  const createdMs = new Date(check.createdAt).getTime();
  const retrievedAt = new Date(createdMs + stage.queued + stage.extracting + stage.retrieving / 2).toISOString();
  const assessedAt = new Date(createdMs + COMPLETES_AFTER).toISOString();

  fixtureClaims.forEach((fixture, index) => {
    const claimId = `${check.id}_c${index + 1}`;
    const unavailable = check.scenario === 'partial_failure' && fixture.failsInPartialScenario;
    const evidenceIdByKey = new Map<string, string>();

    if (!unavailable) {
      fixture.evidence.forEach((item, evidenceIndex) => {
        const id = `${claimId}_e${evidenceIndex + 1}`;
        // Each source gets its own exact retrieval time, a few seconds apart.
        const fetchedAt = new Date(
          new Date(retrievedAt).getTime() + index * 4_210 + evidenceIndex * 1_370,
        ).toISOString();
        evidenceIdByKey.set(item.key, id);
        db.evidence[id] = {
          id,
          claimId,
          sourceTitle: item.sourceTitle,
          publisher: item.publisher,
          url: item.url,
          excerpt: item.excerpt,
          publishedAt: item.publishedAt,
          updatedAt: item.updatedAt,
          retrievedAt: fetchedAt,
          // Illustrative captures ship in public/captures (one per fixture source).
          capture: { url: `/captures/${item.key}.svg`, capturedAt: fetchedAt, width: 1280, height: 800 },
          relation: item.relation,
        };
      });
    }

    db.claims[claimId] = {
      id: claimId,
      checkId: check.id,
      position: index + 1,
      text: fixture.text,
      timeContext: fixture.timeContext,
      status: unavailable ? 'unavailable' : 'assessed',
      evidenceIds: [...evidenceIdByKey.values()],
      ...(unavailable ? { unavailableReason: PARTIAL_FAILURE_REASON } : {}),
    };

    // Fresh checks only get the AI assessment; seeded history also shows a saved human correction.
    const revisions = unavailable
      ? []
      : fixture.revisions
          .filter((revision) => revision.kind === 'ai_assessment' || check.seeded)
          .map<AssessmentRevision>((revision, revisionIndex) => ({
            id: `${claimId}_r${revisionIndex + 1}`,
            claimId,
            version: revisionIndex + 1,
            kind: revision.kind,
            verdict: revision.verdict,
            rationale: revision.rationale,
            citedEvidenceIds: [...evidenceIdByKey.entries()]
              .filter(([key]) => revision.cites.includes(key))
              .map(([, id]) => id),
            citationFreshness: Object.fromEntries(
              Object.entries(revision.freshness ?? {}).map(([key, judgment]) => [evidenceIdByKey.get(key)!, judgment]),
            ),
            ...(revision.kind === 'ai_assessment' ? { model: FIXTURE_MODEL } : {}),
            author: revision.author,
            createdAt:
              revision.kind === 'ai_assessment'
                ? assessedAt
                : new Date(createdMs + revision.offsetMinutes * 60_000).toISOString(),
          }));
    db.revisions[claimId] = revisions;
  });

  check.claimCount = fixtureClaims.length;
}

function toCheck(stored: StoredCheck): Check {
  const { seeded: _seeded, conflictSimulated: _conflict, ...check } = stored;
  return clone(check);
}

function toClaim(db: DemoDb, claimId: string): Claim {
  const stored = db.claims[claimId];
  const revisions = db.revisions[claimId] ?? [];
  const current = revisions.at(-1) ?? null;
  return clone({ ...stored, currentVersion: current?.version ?? 0, current });
}

function requireCheck(db: DemoDb, id: string): StoredCheck {
  const check = db.checks[id];
  if (!check) throw new NotFoundError(`Check ${id} was not found.`);
  if (advance(db, check, Date.now())) saveDb(db);
  return check;
}

function requireClaim(db: DemoDb, claimId: string) {
  const claim = db.claims[claimId];
  if (!claim) throw new NotFoundError(`Claim ${claimId} was not found.`);
  return claim;
}

/** Stale-conflict scenario: pretend another reviewer published while this one was editing. */
function injectConcurrentRevision(db: DemoDb, check: StoredCheck, claimId: string): void {
  const revisions = db.revisions[claimId];
  const latest = revisions.at(-1);
  if (!latest) return;
  revisions.push({
    id: `${claimId}_r${latest.version + 1}`,
    claimId,
    version: latest.version + 1,
    kind: 'human_correction',
    verdict: latest.verdict,
    rationale: 'Re-checked the cited snapshots; verdict unchanged. Added a note for the next reviewer.',
    citedEvidenceIds: [...latest.citedEvidenceIds],
    citationFreshness: { ...latest.citationFreshness },
    author: STALE_CONFLICT_AUTHOR,
    createdAt: new Date().toISOString(),
  });
  check.conflictSimulated = true;
}

export const mockCheckService: CheckService = {
  async createCheck(input: CreateCheckInput) {
    const value = (input.inputType === 'text' ? input.text : input.url) ?? '';
    const files = input.inputType === 'text' ? (input.files ?? []) : [];
    const fileError = files
      .map((file, index) => validateFile(file, files.slice(0, index)) ?? validateFileText(file.name, file.text))
      .find(Boolean);
    const error =
      fileError ?? (input.inputType === 'text' ? validateTextSubmission(value, files) : validateUrl(value));
    if (error) throw new ValidationError(error);

    const db = loadDb();
    const now = new Date().toISOString();
    const title =
      input.inputType === 'text' && value.trim() === '' && files.length > 0
        ? files.map((file) => file.name).join(', ')
        : deriveTitle(input.inputType, value);
    const check: StoredCheck = {
      id: newId('chk'),
      title,
      inputType: input.inputType,
      ...(input.inputType === 'text' ? { inputText: value.trim() } : { inputUrl: value.trim() }),
      ...(files.length > 0 ? { files: files.map(({ name, size, text }) => ({ name, size, text })) } : {}),
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      scenario: input.scenario ?? 'completed',
      seeded: false,
    };
    db.checks[check.id] = check;
    saveDb(db);
    return delay(toCheck(check));
  },

  async getCheck(id: string): Promise<CheckDetail> {
    const db = loadDb();
    const check = requireCheck(db, id);
    const claims = Object.values(db.claims)
      .filter((claim) => claim.checkId === id)
      .sort((a, b) => a.position - b.position)
      .map((claim) => toClaim(db, claim.id));
    return delay({ ...toCheck(check), claims });
  },

  async listChecks(params: ListChecksParams = {}): Promise<Page<Check>> {
    const db = loadDb();
    const now = Date.now();
    let changed = false;
    for (const check of Object.values(db.checks)) changed = advance(db, check, now) || changed;
    if (changed) saveDb(db);

    const query = params.query?.trim().toLowerCase() ?? '';
    const status = params.status ?? 'all';
    const pageSize = params.pageSize ?? config.history.pageSize;

    const matches = Object.values(db.checks)
      .filter((check) => {
        if (status === 'processing' && isTerminal(check.status)) return false;
        if (status === 'completed' && check.status !== 'completed') return false;
        if (status === 'failed' && check.status !== 'failed') return false;
        if (!query) return true;
        const fields = [check.title, check.inputText, check.inputUrl, ...(check.files ?? []).map((file) => file.name)];
        return fields.some((field) => field?.toLowerCase().includes(query));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    const page = Math.min(Math.max(1, params.page ?? 1), totalPages);
    const items = matches.slice((page - 1) * pageSize, page * pageSize).map(toCheck);
    return delay({ items, page, pageSize, total: matches.length, totalPages });
  },

  async getClaimEvidence(claimId: string) {
    const db = loadDb();
    const claim = requireClaim(db, claimId);
    return delay(claim.evidenceIds.map((id) => clone(db.evidence[id])).filter(Boolean) as EvidenceSnapshot[]);
  },

  async getClaimRevisions(claimId: string) {
    const db = loadDb();
    requireClaim(db, claimId);
    return delay(clone(db.revisions[claimId] ?? []));
  },

  async publishCorrection(claimId: string, request: CorrectionRequest): Promise<PublishCorrectionResult> {
    const db = loadDb();
    const claim = requireClaim(db, claimId);
    const check = requireCheck(db, claim.checkId);

    if (claim.status !== 'assessed') {
      throw new ValidationError('This claim has no assessment to correct because verification was unavailable.');
    }
    const reason = request.reason.trim();
    if (reason.length < config.correction.minReasonLength) {
      throw new ValidationError(`Explain the correction in at least ${config.correction.minReasonLength} characters.`);
    }
    if (request.evidenceIds.some((id) => !claim.evidenceIds.includes(id))) {
      throw new ValidationError('Corrections can only cite evidence already attached to this claim.');
    }
    const attachments = request.attachments ?? [];
    const shots = config.correction.screenshots;
    const allowedTypes: readonly string[] = shots.types;
    if (attachments.length > shots.maxFiles) {
      throw new ValidationError(`You can attach up to ${shots.maxFiles} screenshots.`);
    }
    if (attachments.some((a) => !allowedTypes.includes(a.type) || !isSafeImageDataUrl(a.dataUrl))) {
      throw new ValidationError('Screenshots must be PNG, JPG, WebP, or GIF images.');
    }
    const freshness = request.citationFreshness ?? {};
    for (const [evidenceId, judgment] of Object.entries(freshness)) {
      if (!request.evidenceIds.includes(evidenceId)) {
        throw new ValidationError('Freshness can only be set for evidence cited in this correction.');
      }
      if (judgment.status === 'outdated' && !judgment.reason?.trim()) {
        throw new ValidationError('Explain why each outdated source no longer applies.');
      }
    }

    if (check.scenario === 'stale_conflict' && !check.conflictSimulated) {
      injectConcurrentRevision(db, check, claimId);
      saveDb(db);
    }

    const revisions = db.revisions[claimId];
    const currentVersion = revisions.at(-1)?.version ?? 0;
    if (request.expectedVersion !== currentVersion) {
      await delay(null);
      throw new VersionConflictError(request.expectedVersion, currentVersion);
    }

    const revision: AssessmentRevision = {
      id: `${claimId}_r${currentVersion + 1}`,
      claimId,
      version: currentVersion + 1,
      kind: 'human_correction',
      verdict: request.verdict,
      rationale: reason,
      citedEvidenceIds: claim.evidenceIds.filter((id) => request.evidenceIds.includes(id)),
      citationFreshness: Object.fromEntries(
        Object.entries(freshness).map(([id, j]) => [id, { status: j.status, ...(j.reason?.trim() ? { reason: j.reason.trim() } : {}) }]),
      ),
      ...(attachments.length > 0
        ? { attachments: attachments.map(({ id, name, type, size, dataUrl }) => ({ id, name, type, size, dataUrl })) }
        : {}),
      author: 'You (demo reviewer)',
      createdAt: new Date().toISOString(),
    };
    revisions.push(revision);
    check.updatedAt = revision.createdAt;
    saveDb(db);
    return delay({ claim: toClaim(db, claimId), revision: clone(revision) });
  },
};
