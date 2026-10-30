// The single place the UI gets its data from.
// To use the Spring Boot API, implement CheckService with fetch calls
// (see README) and export that implementation here instead.

import type { CheckService } from './contract';
import { mockCheckService } from './mock/mockCheckService';

export const checkService: CheckService = mockCheckService;

export type { CheckService, PublishCorrectionResult } from './contract';
export { NotFoundError, ValidationError, VersionConflictError } from './errors';
