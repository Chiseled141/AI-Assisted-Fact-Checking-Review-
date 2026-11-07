// Every check, result, correction and history entry comes from the FastAPI backend.

import type { CheckService } from './contract';
import { httpCheckService } from './httpCheckService';

export const checkService: CheckService = httpCheckService;

export type { CheckService } from './contract';
export { NotFoundError, ValidationError, VersionConflictError } from './errors';
