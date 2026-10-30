import { config } from '../config';

export interface TextLimits {
  minLength: number;
  maxLength: number;
}

/** Returns an error message, or `null` when the value is valid. */
export function validateText(value: string, limits: TextLimits = config.text): string | null {
  const length = value.trim().length;
  if (length === 0) return 'Enter some text to check.';
  if (length < limits.minLength) {
    return `Enter at least ${limits.minLength} characters so there is a claim to check.`;
  }
  if (value.length > limits.maxLength) {
    return `Text is too long. Shorten it to ${limits.maxLength.toLocaleString('en-US')} characters or fewer.`;
  }
  return null;
}

export function validateUrl(value: string, maxLength: number = config.url.maxLength): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter a URL to check.';
  if (trimmed.length > maxLength) return `URL is too long. Use ${maxLength.toLocaleString('en-US')} characters or fewer.`;
  if (/\s/.test(trimmed)) return 'URLs cannot contain spaces.';

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Enter a full URL starting with http:// or https://, for example https://example.org/article.';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http:// and https:// URLs are supported.';
  }
  if (parsed.username || parsed.password) return 'Remove the username or password from the URL.';
  if (!parsed.hostname.includes('.') || parsed.hostname.endsWith('.')) {
    return 'Enter a URL with a complete domain name, for example https://example.org/article.';
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
    return `Text is too long. Shorten it to ${limits.maxLength.toLocaleString('en-US')} characters or fewer.`;
  }
  const total = text.trim().length + files.reduce((sum, file) => sum + file.text.trim().length, 0);
  if (total < limits.minLength) {
    return `Add at least ${limits.minLength} characters of text or file content so there is a claim to check.`;
  }
  return null;
}

/** Checks a picked file before reading it. `existing` are files already attached. */
export function validateFile(
  file: { name: string; size: number },
  existing: { name: string }[],
  limits: FileLimits = config.files,
): string | null {
  if (existing.length >= limits.maxFiles) return `You can add up to ${limits.maxFiles} files.`;
  const lower = file.name.toLowerCase();
  if (!limits.extensions.some((ext) => lower.endsWith(ext))) {
    return `“${file.name}” is not supported. Add a plain-text file (${limits.extensions.join(', ')}).`;
  }
  if (file.size > limits.maxBytes) {
    return `“${file.name}” is too large. Files can be up to ${Math.round(limits.maxBytes / 1024)} KB.`;
  }
  if (existing.some((item) => item.name === file.name)) return `“${file.name}” is already added.`;
  return null;
}

/** Checks a file's contents after reading it. */
export function validateFileText(name: string, text: string, limits: FileLimits = config.files): string | null {
  if (text.includes('\u0000')) return `“${name}” does not look like a text file.`;
  if (text.trim().length === 0) return `“${name}” is empty.`;
  if (text.length > limits.maxChars) {
    return `“${name}” has too much text. Files can contain up to ${limits.maxChars.toLocaleString('en-US')} characters.`;
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
  if (existingCount >= limits.maxFiles) return `You can attach up to ${limits.maxFiles} screenshots.`;
  if (!limits.types.includes(file.type)) return `“${file.name}” is not a supported image. Use PNG, JPG, WebP, or GIF.`;
  if (file.size > limits.maxBytes) {
    return `“${file.name}” is too large. Images can be up to ${Math.round(limits.maxBytes / 1024 / 1024)} MB.`;
  }
  return null;
}

const SAFE_IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

/** Only raster base64 data URLs are rendered or stored — never SVG or remote URLs. */
export function isSafeImageDataUrl(value: string): boolean {
  return SAFE_IMAGE_DATA_URL.test(value);
}
