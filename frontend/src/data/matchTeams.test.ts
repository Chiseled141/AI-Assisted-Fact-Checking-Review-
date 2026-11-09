import { describe, expect, it } from 'vitest';
import { lightMatchTeamLogos, matchTeamImages } from './matchTeams';

describe('matchTeamImages', () => {
  it('resolves both the saved final and the short team names', () => {
    const images = ['fra-1-160.png', 'ita-1-110.png'];
    expect(matchTeamImages({ kind: 'sport', teams: ['Paris Saint-Germain', 'Inter Milan'] })).toEqual(images);
    expect(matchTeamImages({ kind: 'sport', teams: ['PSG', 'Inter'] })).toEqual(images);
  });

  it('recognizes Vietnamese club names and team abbreviations', () => {
    expect(matchTeamImages({ kind: 'sport', teams: ['CLB Hà Nội', 'CAHN'] }))
      .toEqual(['vleague-ha-noi.png', 'vleague-cong-an-ha-noi.png']);
  });

  it('uses flags for national teams in English and Vietnamese', () => {
    expect(matchTeamImages({ kind: 'sport', teams: ['ĐT U23 Việt Nam', 'Nhật Bản U-23'] }))
      .toEqual(['flag-vn.svg', 'flag-jp.svg']);
    expect(matchTeamImages({ kind: 'sport', teams: ['England', 'Pháp'] }))
      .toEqual(['flag-gb-eng.svg', 'flag-fr.svg']);
  });

  it('keeps esports aliases separate from sports', () => {
    expect(matchTeamImages({ kind: 'esport', teams: ['Spirit', 'Mousesports'] }))
      .toEqual(['esport-team-spirit.png', 'esport-mouz.svg']);
    expect(matchTeamImages({ kind: 'sport', teams: ['Spirit', 'Mousesports'] }))
      .toEqual([null, null]);
  });

  it('resolves Vietnamese esports aliases on saved match cards', () => {
    expect(matchTeamImages({ kind: 'esport', teams: ['SGP', 'FPT x Flash'] }))
      .toEqual(['esport-saigon-phantom.png', 'esport-team-flash.png']);
    expect(matchTeamImages({ kind: 'esport', teams: ['1S', 'TSW'] }))
      .toEqual(['esport-one-star-esports.png', 'esport-team-secret-whales.png']);
  });

  it('keeps regional rosters distinct and marks light logos for contrast', () => {
    expect(matchTeamImages({ kind: 'esport', teams: ['ONIC ID', 'ONIC PH'] }))
      .toEqual(['esport-onic-esports.png', 'esport-onic-philippines.png']);
    const [image] = matchTeamImages({ kind: 'esport', teams: ['PRX', 'Sentinels'] });
    expect(image).toBe('esport-paper-rex.png');
    expect(lightMatchTeamLogos).toContain(image);
  });

  it('requires an international fixture to show just one flag', () => {
    const teams: [string, string] = ['Việt Nam', 'Unknown'];
    expect(matchTeamImages({ kind: 'sport', teams, competition: 'FIFA World Cup' }))
      .toEqual(['flag-vn.svg', null]);
    expect(matchTeamImages({ kind: 'sport', teams, competition: 'FIFA Club World Cup' }))
      .toEqual([null, null]);
  });
});
