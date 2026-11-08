import { describe, expect, it } from 'vitest';
import { findPartyIdentity, seatChartCountry } from './partyRegistry';
import { partyRegistry } from './partyRegistry.generated';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('party identity lookup', () => {
  it('scopes common party names to the country instead of guessing', () => {
    expect(findPartyIdentity('Liberal Party', 'CA')?.name).toBe('Liberal Party of Canada');
    expect(findPartyIdentity('Liberal Party', 'AU')?.name).toBe('Liberal Party of Australia');
    expect(findPartyIdentity('Liberal Party', null)).toBeNull();
    expect(findPartyIdentity('Unknown party', 'CA')).toBeNull();
  });

  it('recognizes chamber country names, abbreviations and local names', () => {
    expect(seatChartCountry('Canadian House of Commons', [])).toBe('CA');
    expect(seatChartCountry('Hạ viện Canada', [])).toBe('CA');
    expect(seatChartCountry('UK House of Commons', [])).toBe('GB');
    expect(seatChartCountry('Bundestag', [])).toBe('DE');
    expect(seatChartCountry('Lok Sabha', [])).toBe('IN');
    expect(findPartyIdentity('Bloc Quebecois', 'CA')?.name).toBe('Bloc Québécois');
    expect(findPartyIdentity('NDP', 'CA')?.name).toBe('New Democratic Party');
    expect(findPartyIdentity('自由民主党', 'JP')?.name).toBe('Liberal Democratic Party');
  });

  it('requires distinguishing parties to resolve an otherwise ambiguous chamber', () => {
    expect(seatChartCountry('House of Commons', ['Conservative', 'Liberal Party'])).toBeNull();
    expect(seatChartCountry('House of Commons', ['Bloc Québécois', 'NDP', 'Conservative'])).toBe('CA');
    expect(seatChartCountry('Canada and United Kingdom', ['NDP'])).toBeNull();
    expect(seatChartCountry('Test chamber', ['Party A', 'Party B'])).toBeNull();
  });

  it('keeps assets local and records provenance across all twenty countries', () => {
    const manifest = JSON.parse(readFileSync(resolve('public/party-logos/manifest.json'), 'utf8'));
    expect(new Set(partyRegistry.map((party) => party.country)).size).toBe(20);
    const records = manifest.parties as { id: string; sourceUrl?: string; asset?: string }[];
    for (const party of partyRegistry) {
      if (!party.asset) continue;
      expect(party.asset).toMatch(/^[a-z0-9-]+\.(png|jpg|gif|svg|ico)$/);
      expect(existsSync(resolve('public/party-logos', party.asset))).toBe(true);
      expect(records.find((row) => row.id === party.id)?.sourceUrl).toMatch(/^https:\/\//);
    }
  });
});
