import { config } from '../config';
import { t } from './i18n';

/** Display name for a judge id, falling back to the id itself. */
export function judgeName(id: string): string {
  return config.judges.options.find((option) => option.id === id)?.name ?? id;
}

/** The lab's logo for a judge's display name, as stored on source analyses. */
export function judgeLogo(name: string): string | undefined {
  return config.judges.options.find((option) => option.name === name)?.logo;
}

/** Returns an error message when the ids are not exactly the configured number of known judges. */
export function validateJudgeIds(ids: readonly string[]): string | null {
  const known = config.judges.options.map((option) => option.id) as readonly string[];
  const unique = new Set(ids);
  if (ids.length !== config.judges.count || unique.size !== ids.length || ids.some((id) => !known.includes(id))) {
    return t('Pick exactly {count} different judges.', { count: config.judges.count });
  }
  return null;
}
