import { config } from '../config';

/** Display name for a judge id, falling back to the id itself. */
export function judgeName(id: string): string {
  return config.judges.options.find((option) => option.id === id)?.name ?? id;
}

/** The lab's logo for a judge's display name, as stored on source analyses. */
export function judgeLogo(name: string): string | undefined {
  return config.judges.options.find((option) => option.name === name)?.logo;
}
