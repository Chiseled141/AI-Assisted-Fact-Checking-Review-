import { config } from '../config';
import { t } from './i18n';

export interface TextLimits {
  minLength: number;
  maxLength: number;
}

/** Returns an error message, or `null` when the value is valid. */
export function validateText(value: string, limits: TextLimits = config.text): string | null {
  const length = value.trim().length;
  if (length === 0) return t('Enter some text to check.');
  if (length < limits.minLength) {
    return t('Enter at least {count} characters so there is a claim to check.', { count: limits.minLength });
  }
  if (value.length > limits.maxLength) {
    return t('Text is too long. Shorten it to {count} characters or fewer.', { count: limits.maxLength.toLocaleString('en-US') });
  }
  return null;
}

export function validateUrl(value: string, maxLength: number = config.url.maxLength): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return t('Enter a URL to check.');
  if (trimmed.length > maxLength) return t('URL is too long. Use {count} characters or fewer.', { count: maxLength.toLocaleString('en-US') });
  if (/\s/.test(trimmed)) return t('URLs cannot contain spaces.');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return t('Enter a full URL starting with http:// or https://, for example https://example.org/article.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return t('Only http:// and https:// URLs are supported.');
  }
  if (parsed.username || parsed.password) return t('Remove the username or password from the URL.');
  if (!parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) {
    return t('Enter a URL with a complete domain name, for example https://example.org/article.');
  }
  return null;
}

export interface FileLimits {
  maxFiles: number;
  maxBytes: number;
  maxChars: number;
  extensions: readonly string[];
}

/** Validates typed text together with any attached files. */
export function validateTextSubmission(
  text: string,
  files: { text: string }[],
  limits: TextLimits = config.text,
): string | null {
  if (files.length === 0) return validateText(text, limits);
  if (text.length > limits.maxLength) {
    return t('Text is too long. Shorten it to {count} characters or fewer.', { count: limits.maxLength.toLocaleString('en-US') });
  }
  const total = text.trim().length + files.reduce((sum, file) => sum + file.text.trim().length, 0);
  if (total < limits.minLength) {
    return t('Add at least {count} characters of text or file content so there is a claim to check.', { count: limits.minLength });
  }
  return null;
}

/** Checks a picked file before reading it. `existing` are files already attached. */
export function validateFile(
  file: { name: string; size: number },
  existing: { name: string }[],
  limits: FileLimits = config.files,
): string | null {
  if (existing.length >= limits.maxFiles) return t('You can add up to {count} files.', { count: limits.maxFiles });
  const lower = file.name.toLowerCase();
  if (!limits.extensions.some((ext) => lower.endsWith(ext))) {
    return t('“{name}” is not supported. Add a plain-text file ({types}).', { name: file.name, types: limits.extensions.join(', ') });
  }
  if (file.size > limits.maxBytes) {
    return t('“{name}” is too large. Files can be up to {size} KB.', { name: file.name, size: Math.round(limits.maxBytes / 1024) });
  }
  if (existing.some((item) => item.name === file.name)) return t('“{name}” is already added.', { name: file.name });
  return null;
}

/** Checks a file's contents after reading it. */
export function validateFileText(name: string, text: string, limits: FileLimits = config.files): string | null {
  if (text.includes('\u0000')) return t('“{name}” does not look like a text file.', { name });
  if (text.trim().length === 0) return t('“{name}” is empty.', { name });
  if (text.length > limits.maxChars) {
    return t('“{name}” has too much text. Files can contain up to {count} characters.', { name, count: limits.maxChars.toLocaleString('en-US') });
  }
  return null;
}

export interface ScreenshotLimits {
  maxFiles: number;
  maxBytes: number;
  types: readonly string[];
}

/** Checks a picked or pasted image before it is read. */
export function validateScreenshot(
  file: { name: string; size: number; type: string },
  existingCount: number,
  limits: ScreenshotLimits = config.correction.screenshots,
): string | null {
  if (existingCount >= limits.maxFiles) return t('You can attach up to {count} screenshots.', { count: limits.maxFiles });
  if (!limits.types.includes(file.type)) return t('“{name}” is not a supported image. Use PNG, JPG, WebP, or GIF.', { name: file.name });
  if (file.size > limits.maxBytes) {
    return t('“{name}” is too large. Images can be up to {size} MB.', { name: file.name, size: Math.round(limits.maxBytes / 1024 / 1024) });
  }
  return null;
}

const SAFE_IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

/** Only raster base64 data URLs are rendered or stored — never SVG or remote URLs. */
export function isSafeImageDataUrl(value: string): boolean {
  return SAFE_IMAGE_DATA_URL.test(value);
}
