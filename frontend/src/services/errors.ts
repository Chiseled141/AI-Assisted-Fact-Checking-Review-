// Error types the UI understands. An HTTP service should map
// 404 → NotFoundError, 400/422 → ValidationError, 409 → VersionConflictError.

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class VersionConflictError extends Error {
  readonly expectedVersion: number;
  readonly currentVersion: number;

  constructor(expectedVersion: number, currentVersion: number) {
    super(`Expected version ${expectedVersion}, but the current version is ${currentVersion}.`);
    this.name = 'VersionConflictError';
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}
