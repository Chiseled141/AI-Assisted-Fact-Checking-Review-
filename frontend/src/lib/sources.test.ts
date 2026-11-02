import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceRegistry } from '../data/sourceRegistry';
import { findSource } from './sources';

describe('findSource', () => {
  it('matches a domain, its www form, and its subdomains', () => {
    expect(findSource('https://vnexpress.net/a')?.domain).toBe('vnexpress.net');
    expect(findSource('https://WWW.VNEXPRESS.NET/a')?.domain).toBe('vnexpress.net');
    expect(findSource('https://data.worldbank.org/indicator')?.domain).toBe('worldbank.org');
  });

  it('prefers the most specific entry', () => {
    expect(findSource('https://factcheck.afp.com/x')?.domain).toBe('factcheck.afp.com');
    expect(findSource('https://www.afp.com/x')?.domain).toBe('afp.com');
  });

  it('does not match look-alike domains', () => {
    expect(findSource('https://vnexpress.net.example.com/a')).toBeNull();
    expect(findSource('https://notbbc.com/a')).toBeNull();
    expect(findSource('https://bbc.com@example.org/a')).toBeNull();
  });

  it('returns null for unknown or invalid URLs', () => {
    expect(findSource('https://example.org/a')).toBeNull();
    expect(findSource('not a url')).toBeNull();
    expect(findSource('javascript:alert(1)')).toBeNull();
  });

  it('rates government sites green and known bad sites red', () => {
    expect(findSource('https://chinhphu.vn')?.trust).toBe('green');
    expect(findSource('https://www.kenh14.vn')?.trust).toBe('yellow');
    expect(findSource('https://www.infowars.com/a')?.trust).toBe('red');
  });
});

describe('sourceRegistry', () => {
  it('has unique domains', () => {
    const domains = sourceRegistry.map((entry) => entry.domain);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it('only points at logo files that exist', () => {
    const missing = sourceRegistry.filter(
      (entry) => entry.logo && !existsSync(resolve(process.cwd(), 'public/source-logos', entry.logo)),
    );
    expect(missing).toEqual([]);
  });

  it('describes every source', () => {
    expect(sourceRegistry.filter((entry) => !entry.about)).toEqual([]);
  });

  it('has no logos for red sources', () => {
    expect(sourceRegistry.filter((entry) => entry.trust === 'red' && entry.logo)).toEqual([]);
  });
});
