// Demo persistence: a single versioned JSON document in localStorage.
// Malformed or outdated data is discarded and the seed is rebuilt.

import { config } from '../../config';
import { readJson, removeItem, writeJson } from '../../lib/storage';
import { deriveTitle } from '../../lib/format';
import type { AssessmentRevision, Check, ClaimStatus, EvidenceSnapshot } from '../../types/models';
import { seedChecks } from '../../mocks/fixtures';

export interface StoredCheck extends Check {
  /** Seeded history entries include a saved human correction. */
  seeded: boolean;
  /** Stale-conflict scenario: the concurrent edit is injected only once. */
  conflictSimulated?: boolean;
}

export interface StoredClaim {
  id: string;
  checkId: string;
  position: number;
  text: string;
  timeContext?: string;
  status: ClaimStatus;
  evidenceIds: string[];
  unavailableReason?: string;
}

export interface DemoDb {
  schemaVersion: number;
  checks: Record<string, StoredCheck>;
  claims: Record<string, StoredClaim>;
  evidence: Record<string, EvidenceSnapshot>;
  /** Keyed by claim id, oldest first. */
  revisions: Record<string, AssessmentRevision[]>;
}

const STORAGE_KEY = `${config.storageKey}.v${config.storageSchemaVersion}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDemoDb(value: unknown): value is DemoDb {
  if (!isRecord(value) || value.schemaVersion !== config.storageSchemaVersion) return false;
  if (![value.checks, value.claims, value.evidence, value.revisions].every(isRecord)) return false;
  return Object.values(value.checks as Record<string, unknown>).every(
    (check) => isRecord(check) && typeof check.id === 'string' && typeof check.createdAt === 'string',
  );
}

export function createSeedDb(now = Date.now()): DemoDb {
  const db: DemoDb = { schemaVersion: config.storageSchemaVersion, checks: {}, claims: {}, evidence: {}, revisions: {} };
  for (const seed of seedChecks) {
    const createdAt = new Date(now - seed.hoursAgo * 3_600_000).toISOString();
    db.checks[seed.id] = {
      id: seed.id,
      title: deriveTitle(seed.inputType, seed.value),
      inputType: seed.inputType,
      ...(seed.inputType === 'text' ? { inputText: seed.value } : { inputUrl: seed.value }),
      status: 'queued',
      createdAt,
      updatedAt: createdAt,
      scenario: seed.scenario,
      seeded: true,
    };
  }
  return db;
}

let cache: DemoDb | null = null;

/** Older schema versions are discarded rather than migrated; remove them so they don't linger. */
function removeOldVersions(): void {
  for (let version = 1; version < config.storageSchemaVersion; version += 1) {
    removeItem(`${config.storageKey}.v${version}`);
  }
}

export function loadDb(): DemoDb {
  if (cache) return cache;
  removeOldVersions();
  cache = readJson(STORAGE_KEY, isDemoDb) ?? createSeedDb();
  return cache;
}

export function saveDb(db: DemoDb): void {
  cache = db;
  writeJson(STORAGE_KEY, db);
}

export function resetDb(): void {
  removeItem(STORAGE_KEY);
  cache = null;
}

/** Drop the in-memory cache so the next load re-reads storage (used by tests). */
export function clearDbCache(): void {
  cache = null;
}
