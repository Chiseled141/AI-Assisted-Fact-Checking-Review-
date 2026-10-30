import { describe, expect, it } from 'vitest';
import { formatCalendarDate, safeImageSrc } from './format';
import {
  isSafeImageDataUrl,
  validateFile,
  validateFileText,
  validateScreenshot,
  validateText,
  validateTextSubmission,
  validateUrl,
} from './validation';

describe('validateText', () => {
  const limits = { minLength: 20, maxLength: 100 };

  it('rejects empty and whitespace-only input', () => {
    expect(validateText('', limits)).toMatch(/enter some text/i);
    expect(validateText('   \n  ', limits)).toMatch(/enter some text/i);
  });

  it('rejects text shorter than the minimum', () => {
    expect(validateText('Too short.', limits)).toMatch(/at least 20 characters/i);
  });

  it('rejects text longer than the configured limit', () => {
    expect(validateText('a'.repeat(101), limits)).toMatch(/100 characters or fewer/i);
  });

  it('accepts text within the limits', () => {
    expect(validateText('The bridge opened to traffic in 2021.', limits)).toBeNull();
    expect(validateText('a'.repeat(100), limits)).toBeNull();
  });
});

describe('validateUrl', () => {
  it('accepts http and https URLs', () => {
    expect(validateUrl('https://example.org/news/article')).toBeNull();
    expect(validateUrl('http://example.org')).toBeNull();
    expect(validateUrl('  https://sub.example.org/a?b=c  ')).toBeNull();
  });

  it('requires a value', () => {
    expect(validateUrl('')).toMatch(/enter a url/i);
  });

  it.each(['javascript:alert(1)', 'ftp://example.org/file', 'file:///etc/passwd', 'data:text/html,hi'])(
    'rejects non-http(s) scheme %s',
    (value) => {
      expect(validateUrl(value)).not.toBeNull();
    },
  );

  it('rejects malformed URLs and bare words', () => {
    expect(validateUrl('example.org/article')).toMatch(/http:\/\/ or https:\/\//);
    expect(validateUrl('https://localhost')).toMatch(/complete domain/);
    expect(validateUrl('https://exa mple.org')).toMatch(/spaces/);
  });

  it('rejects embedded credentials', () => {
    expect(validateUrl('https://user:pass@example.org')).toMatch(/username or password/);
  });

  it('rejects URLs over the length limit', () => {
    expect(validateUrl(`https://example.org/${'a'.repeat(40)}`, 30)).toMatch(/too long/);
  });
});

describe('file validation', () => {
  const limits = { maxFiles: 2, maxBytes: 1000, maxChars: 50, extensions: ['.txt', '.md'] };

  it('accepts plain-text files within the limits', () => {
    expect(validateFile({ name: 'notes.TXT', size: 500 }, [], limits)).toBeNull();
    expect(validateFileText('notes.txt', 'Some readable text.', limits)).toBeNull();
  });

  it('rejects unsupported types, oversize, duplicates, and too many files', () => {
    expect(validateFile({ name: 'report.pdf', size: 10 }, [], limits)).toMatch(/not supported/);
    expect(validateFile({ name: 'big.txt', size: 1001 }, [], limits)).toMatch(/too large/);
    expect(validateFile({ name: 'a.txt', size: 10 }, [{ name: 'a.txt' }], limits)).toMatch(/already added/);
    expect(validateFile({ name: 'c.txt', size: 10 }, [{ name: 'a.txt' }, { name: 'b.txt' }], limits)).toMatch(
      /up to 2 files/,
    );
  });

  it('rejects empty, binary, and overlong contents', () => {
    expect(validateFileText('a.txt', '   ', limits)).toMatch(/empty/);
    expect(validateFileText('a.txt', 'abc\u0000def', limits)).toMatch(/not look like a text file/);
    expect(validateFileText('a.txt', 'x'.repeat(51), limits)).toMatch(/too much text/);
  });

  it('lets file content stand in for typed text', () => {
    const textLimits = { minLength: 20, maxLength: 100 };
    expect(validateTextSubmission('', [{ text: 'A claim long enough to check.' }], textLimits)).toBeNull();
    expect(validateTextSubmission('', [{ text: 'Too short' }], textLimits)).toMatch(/at least 20 characters/);
    expect(validateTextSubmission('a'.repeat(101), [{ text: 'File text here.' }], textLimits)).toMatch(/too long/);
  });
});

describe('screenshot validation', () => {
  const limits = { maxFiles: 2, maxBytes: 1000, types: ['image/png', 'image/jpeg'] };

  it('accepts supported images and rejects others', () => {
    expect(validateScreenshot({ name: 'a.png', size: 10, type: 'image/png' }, 0, limits)).toBeNull();
    expect(validateScreenshot({ name: 'a.svg', size: 10, type: 'image/svg+xml' }, 0, limits)).toMatch(/not a supported image/);
    expect(validateScreenshot({ name: 'big.png', size: 1001, type: 'image/png' }, 0, limits)).toMatch(/too large/);
    expect(validateScreenshot({ name: 'c.png', size: 10, type: 'image/png' }, 2, limits)).toMatch(/up to 2 screenshots/);
  });

  it('only treats raster base64 data URLs as safe', () => {
    expect(isSafeImageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isSafeImageDataUrl('https://example.org/a.png')).toBe(false);
    expect(isSafeImageDataUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('evidence date and capture helpers', () => {
  it('formats calendar dates without time-zone drift', () => {
    expect(formatCalendarDate('2024-03-18')).toBe('March 18, 2024');
    expect(formatCalendarDate('not-a-date')).toBe('Unknown date');
  });

  it('allows only same-origin paths and https URLs for captures', () => {
    expect(safeImageSrc('/captures/a.svg')).toBe('/captures/a.svg');
    expect(safeImageSrc('https://cdn.example.org/a.png')).toBe('https://cdn.example.org/a.png');
    expect(safeImageSrc('//evil.example/a.png')).toBeNull();
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('http://example.org/a.png')).toBeNull();
  });
});
