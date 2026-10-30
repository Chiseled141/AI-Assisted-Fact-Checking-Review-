import type { CheckStatus, EvidenceRelation, InputType, Verdict } from '../types/models';

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

const exactDateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'long',
});
const calendarDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' });

/** Date, time to the second, and time zone — for retrieval and capture timestamps. */
export function formatExactDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : exactDateTime.format(date);
}

/** Formats a YYYY-MM-DD calendar date without shifting it across time zones. */
export function formatCalendarDate(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return 'Unknown date';
  return calendarDate.format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** Allows same-origin paths and https URLs as image sources. */
export function safeImageSrc(url: string): string | null {
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : dateTime.format(date);
}

export const verdictLabel: Record<Verdict, string> = {
  supported: 'Supported',
  contradicted: 'Contradicted',
  insufficient_evidence: 'Insufficient evidence',
};

export const relationLabel: Record<EvidenceRelation, string> = {
  supporting: 'Supporting',
  contradicting: 'Contradicting',
  contextual: 'Context',
};

export const statusLabel: Record<CheckStatus, string> = {
  queued: 'Queued',
  extracting: 'Extracting claims',
  retrieving: 'Retrieving evidence',
  assessing: 'Assessing claims',
  completed: 'Completed',
  failed: 'Failed',
};

export const inputTypeLabel: Record<InputType, string> = { text: 'Text', url: 'URL' };

/** Only allow http(s) links to be rendered as anchors. */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function deriveTitle(inputType: InputType, value: string): string {
  if (inputType === 'url') {
    try {
      const parsed = new URL(value.trim());
      const path = parsed.pathname === '/' ? '' : parsed.pathname;
      return truncate(`${parsed.hostname}${path}`, 72);
    } catch {
      return truncate(value.trim(), 72);
    }
  }
  const firstSentence = value.trim().split(/(?<=[.!?])\s+/)[0] ?? '';
  return truncate(firstSentence.replace(/\s+/g, ' '), 72);
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}
