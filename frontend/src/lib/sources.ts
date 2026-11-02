import type { SourceEntry, SourceTrust } from '../types/models';
import { sourceRegistry } from '../data/sourceRegistry';
import { translated } from './i18n';

export const sourceTrustLabel = translated<SourceTrust>({
  green: 'Trusted source',
  yellow: 'Mixed source',
  red: 'Unreliable source',
});

export const sourceTrustDescription = translated<SourceTrust>({
  green: 'Official, established, or peer-reviewed. Can be cited as evidence.',
  yellow: 'Reliable for some things, but non-primary, advocacy, or user-generated. Use it to corroborate.',
  red: 'Known for fabricated, deceptive, or scam content. Does not count as evidence.',
});

const byDomain = new Map(sourceRegistry.map((entry) => [entry.domain, entry]));

/** Vietnamese-language pages on Vietnamese news and government sites. English editions don't count. */
export function isVietnameseSource(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return (hostname.endsWith('.vn') && !hostname.startsWith('en.')) || hostname === 'vnexpress.net';
  } catch {
    return false;
  }
}

/**
 * Finds the registry entry for a URL. Walks from the full hostname up through its
 * parent domains, so the most specific entry wins and whole labels must match:
 * vnexpress.net.example.com and notbbc.com do not match vnexpress.net or bbc.com.
 */
export function findSource(url: string): SourceEntry | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
  const labels = hostname.split('.');
  for (let i = 0; i < labels.length - 1; i += 1) {
    const entry = byDomain.get(labels.slice(i).join('.'));
    if (entry) return entry;
  }
  return null;
}
