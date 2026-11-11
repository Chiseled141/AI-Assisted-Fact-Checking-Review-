// Source ratings, read from the one list the backend also uses. Logos live in public/source-logos.
// `logo` is left out where there is no usable image for that source, so the UI shows a monogram.
// Red sources were never fetched, so they have no logo.

import ratings from '../../../backend/config/data/source_ratings.json';
import type { SourceEntry } from '../types/models';

export const sourceRegistry: SourceEntry[] = Object.entries(
  ratings.sources as unknown as Record<string, Omit<SourceEntry, 'domain'>>,
).map(([domain, entry]) => ({ domain, ...entry }));
