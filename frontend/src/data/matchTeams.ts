import { matchTeamAssets as assets } from './matchTeamAssets.generated';
import type { MatchResultData } from '../types/models';

export const lightMatchTeamLogos = new Set(assets.onDark);

const normalize = (name: string) => name.normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/đ/g, 'd').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const teamNames = { sport: new Map<string, string | null>(), esport: new Map<string, string | null>() };
for (const kind of ['sport', 'esport'] as const) {
  for (const [asset, ...names] of assets[kind]) {
    for (const name of names) {
      const key = normalize(name);
      const existing = teamNames[kind].get(key);
      teamNames[kind].set(key, existing === undefined || existing === asset ? asset : null);
    }
  }
}

const flagAliases: Record<string, string[]> = {
  'gb-eng': ['England', 'Anh'],
  'gb-sct': ['Scotland'],
  'gb-wls': ['Wales', 'Xứ Wales'],
  cn: ['China PR', "People's Republic of China"],
  cz: ['Czech Republic', 'CH Séc'],
  ir: ['IR Iran'],
  kr: ['Korea Republic', 'Republic of Korea', 'South Korea', 'Hàn Quốc'],
  us: ['USA', 'US', 'United States of America', 'Mỹ', 'Hoa Kỳ'],
  vn: ['Viet Nam', 'Vietnam'],
};
const countryNames = new Map<string, string>();
const regionNames = ['en', 'vi'].map((language) => new Intl.DisplayNames(language, { type: 'region', fallback: 'none' }));
for (const code of assets.flags) {
  const localized = code.length === 2 ? regionNames.flatMap((names) => names.of(code.toUpperCase()) ?? []) : [];
  for (const name of [...localized, ...(flagAliases[code] ?? [])]) {
    countryNames.set(normalize(name), code);
  }
}

function nationalTeam(name: string): string | undefined {
  const key = normalize(name);
  return countryNames.get(key) ?? countryNames.get(key
    .replace(/^(?:(?:doi tuyen(?: quoc gia)?|dt|u\s?\d{2}) )+/, '')
    .replace(/ (?:u\s?\d{2}|women(?: s)?|men(?: s)?|nu|w)$/, ''));
}

/** Resolve identity images locally, including when an older check only has the teams' names. */
export function matchTeamImages(
  { kind, teams, competition }: Pick<MatchResultData, 'kind' | 'teams' | 'competition'>,
): [string | null, string | null] {
  const [left, right] = teams.map((name) => {
    const key = normalize(name);
    return teamNames[kind].get(key.replace(/^(?:clb|cau lac bo) /, '')) ?? null;
  });
  if (left || right) return [left, right];

  const [first, second] = teams.map(nationalTeam);
  const event = normalize(competition ?? '');
  const nationalEvent = /\b(world cup|euro(?: \d{4})?|asian cup|aff cup|asean championship|copa america|nations league|olympics|sea games)\b/.test(event)
    && !/\b(?:club|esports) world cup\b/.test(event);
  if (!(first && second) && !nationalEvent) return [null, null];
  return [first ? `flag-${first}.svg` : null, second ? `flag-${second}.svg` : null];
}
