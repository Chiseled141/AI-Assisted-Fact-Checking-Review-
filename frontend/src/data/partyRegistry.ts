import { partyRegistry } from './partyRegistry.generated';

/** Identity only: seats, chart colours and evidence always come from the saved check. */
export interface PartyIdentity {
  country: string;
  id: string;
  name: string;
  aliases: string[];
  asset?: string;
}

const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '')
  .toLocaleLowerCase('en').replace(/đ/g, 'd').replace(/[^\p{L}\p{N}+]+/gu, ' ').trim();

const countries: Record<string, string[]> = {
  US: ['United States', 'United States of America', 'US', 'USA', 'American', 'Hoa Kỳ', 'Mỹ'],
  GB: ['United Kingdom', 'UK', 'British', 'Britain', 'Vương quốc Anh'],
  CA: ['Canada', 'Canadian'],
  FR: ['France', 'French', 'Pháp', 'Assemblée nationale française'],
  DE: ['Germany', 'German', 'Deutschland', 'Đức', 'Bundestag'],
  IT: ['Italy', 'Italian', 'Italia', 'Ý', 'Camera dei deputati'],
  ES: ['Spain', 'Spanish', 'España', 'Tây Ban Nha', 'Congreso de los Diputados'],
  PL: ['Poland', 'Polish', 'Polska', 'Ba Lan', 'Sejm'],
  AU: ['Australia', 'Australian', 'Úc'],
  IN: ['India', 'Indian', 'Ấn Độ', 'Lok Sabha', 'Rajya Sabha'],
  JP: ['Japan', 'Japanese', 'Nhật Bản', 'National Diet', '日本', '衆議院', '参議院'],
  KR: ['South Korea', 'Republic of Korea', 'Hàn Quốc', '대한민국'],
  TW: ['Taiwan', 'Taiwanese', 'Đài Loan', 'Legislative Yuan', '立法院', '臺灣', '台灣'],
  ID: ['Indonesia', 'Indonesian', 'Dewan Perwakilan Rakyat'],
  PH: ['Philippines', 'Philippine', 'Filipino', 'Pilipinas'],
  BR: ['Brazil', 'Brazilian', 'Brasil', 'Câmara dos Deputados'],
  MX: ['Mexico', 'Mexican', 'México', 'Cámara de Diputados'],
  ZA: ['South Africa', 'South African', 'Nam Phi'],
  TR: ['Turkey', 'Turkish', 'Türkiye', 'Thổ Nhĩ Kỳ', 'Grand National Assembly'],
  IL: ['Israel', 'Israeli', 'Knesset', 'כנסת'],
};

const byCountry = new Map<string, Map<string, PartyIdentity | null>>();
const nameCountries = new Map<string, Set<string>>();
for (const party of partyRegistry as PartyIdentity[]) {
  const scoped = byCountry.get(party.country) ?? new Map<string, PartyIdentity | null>();
  for (const name of [party.name, ...party.aliases]) {
    const key = normalize(name);
    if (!key) continue;
    const old = scoped.get(key);
    scoped.set(key, old === undefined || old?.id === party.id ? party : null);
    const owners = nameCountries.get(key) ?? new Set<string>();
    owners.add(party.country);
    nameCountries.set(key, owners);
  }
  byCountry.set(party.country, scoped);
}

/** Never guess between e.g. Canadian and Australian Liberals from the word “Liberal”. */
export function seatChartCountry(body: string, partyNames: string[]): string | null {
  const text = ` ${normalize(body)} `;
  const explicit = Object.entries(countries).filter(([, names]) =>
    names.some((name) => text.includes(` ${normalize(name)} `)));
  if (explicit.length) return explicit.length === 1 ? explicit[0][0] : null;

  const votes = new Map<string, Set<string>>();
  for (const name of partyNames) {
    const key = normalize(name);
    const owners = nameCountries.get(key);
    if (owners?.size !== 1 || key.length < 5) continue;
    const country = [...owners][0];
    const names = votes.get(country) ?? new Set<string>();
    names.add(key);
    votes.set(country, names);
  }
  if (votes.size !== 1) return null;
  const [country, names] = [...votes][0];
  return names.size >= 2 || [...names].some((name) => name.length >= 14) ? country : null;
}

export function findPartyIdentity(name: string, country: string | null): PartyIdentity | null {
  return country ? byCountry.get(country)?.get(normalize(name)) ?? null : null;
}
