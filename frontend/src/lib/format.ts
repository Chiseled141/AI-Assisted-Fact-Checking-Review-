import type { CheckStatus, EvidenceRelation, Verdict } from '../types/models';
import { getLanguage, locale, t, translated } from './i18n';

const dateTime = () => new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = () => new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' });
const timeOnly = () => new Intl.DateTimeFormat(locale(), { timeStyle: 'short' });

// Vietnamese articles write dates as 6/11/2021, and the long form reads awkwardly mixed with them.
const calendarDate = () =>
  getLanguage() === 'vi'
    ? new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'numeric', year: 'numeric' })
    : new Intl.DateTimeFormat(locale(), { dateStyle: 'long' });

/** Formats a YYYY-MM-DD calendar date without shifting it across time zones. */
export function formatCalendarDate(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return t('Unknown date');
  return calendarDate().format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
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
  return Number.isNaN(date.getTime()) ? t('Unknown time') : dateTime().format(date);
}

/** Date only, for index rows that show the time separately. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? t('Unknown date') : dateOnly().format(date);
}

/** Clock time only, for index rows that already show the date. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : timeOnly().format(date);
}

export const verdictLabel = translated<Verdict>({
  supported: 'Supported',
  contradicted: 'Contradicted',
  insufficient_evidence: 'Insufficient evidence',
  outdated: 'Outdated',
});

export const relationLabel = translated<EvidenceRelation>({
  supporting: 'Supporting',
  contradicting: 'Contradicting',
  contextual: 'Context',
});

export const statusLabel = translated<CheckStatus>({
  queued: 'Queued',
  extracting: 'Extracting claims',
  awaiting_input: 'Waiting for your answer',
  retrieving: 'Retrieving evidence',
  assessing: 'Assessing claims',
  completed: 'Completed',
  failed: 'Failed',
  stopped: 'Stopped',
});

/** Only allow http(s) links to be rendered as anchors. */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}



export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  // Vietnamese nouns don't change with the count.
  if (getLanguage() === 'vi') return `${count} ${t(singular)}`;
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}
