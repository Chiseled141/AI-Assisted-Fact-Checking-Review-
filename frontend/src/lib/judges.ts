import { config } from '../config';

/** Display name for a judge id, falling back to the id itself. */
export function judgeName(id: string): string {
  return config.judges.options.find((option) => option.id === id)?.name ?? id;
}

/** Returns an error message when the ids are not exactly the configured number of known judges. */
export function validateJudgeIds(ids: readonly string[]): string | null {
  const known = config.judges.options.map((option) => option.id) as readonly string[];
  const unique = new Set(ids);
  if (ids.length !== config.judges.count || unique.size !== ids.length || ids.some((id) => !known.includes(id))) {
    return `Pick exactly ${config.judges.count} different judges.`;
  }
  return null;
}
