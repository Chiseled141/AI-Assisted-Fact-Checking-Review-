// The single place the UI gets its data from: the FastAPI backend when
// VITE_API_URL is set (see services/mode.ts), otherwise the demo fixtures.

import type { CheckService } from './contract';
import { httpCheckService } from './httpCheckService';
import { mockCheckService } from './mock/mockCheckService';

// Written with the env var itself, so that a real build leaves the demo data out of the bundle.
export const checkService: CheckService = import.meta.env.VITE_API_URL ? httpCheckService : mockCheckService;
export { demoMode } from './mode';

export type { CheckService } from './contract';
export { NotFoundError, ValidationError, VersionConflictError } from './errors';
