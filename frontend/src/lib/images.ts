import { config } from '../config';
import type { Attachment } from '../types/models';
import { isSafeImageDataUrl, validateScreenshot } from './validation';

const limits = config.correction.screenshots;

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}

/** Downscales large images to JPEG so they fit in demo storage. Small images are kept as-is. */
async function shrink(dataUrl: string, file: File): Promise<{ dataUrl: string; type: string }> {
  if (file.size <= limits.maxStoredBytes / 2 || file.type === 'image/gif') return { dataUrl, type: file.type };
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, limits.maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl, type: file.type };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const resized = canvas.toDataURL('image/jpeg', 0.82);
  // Re-encoding can grow some images; keep the original when it needed no scaling and is smaller.
  if (scale === 1 && resized.length >= dataUrl.length) return { dataUrl, type: file.type };
  return { dataUrl: resized, type: 'image/jpeg' };
}

function newAttachmentId(): string {
  return `att_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Validates, reads, and (if needed) shrinks images in the browser. Nothing is uploaded.
 * Returns accepted attachments plus one message per rejected file.
 */
export async function readScreenshots(
  picked: File[],
  existingCount: number,
): Promise<{ added: Attachment[]; errors: string[] }> {
  const added: Attachment[] = [];
  const errors: string[] = [];

  for (const file of picked) {
    const name = file.name || 'Pasted screenshot';
    const error = validateScreenshot({ name, size: file.size, type: file.type }, existingCount + added.length);
    if (error) {
      errors.push(error);
      continue;
    }
    try {
      const { dataUrl, type } = await shrink(await readDataUrl(file), file);
      const size = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
      if (!isSafeImageDataUrl(dataUrl)) errors.push(`“${name}” could not be read as an image.`);
      else if (size > limits.maxStoredBytes) errors.push(`“${name}” is still too large after resizing. Try cropping it.`);
      else added.push({ id: newAttachmentId(), name, type, size, dataUrl });
    } catch {
      errors.push(`“${name}” could not be read as an image.`);
    }
  }
  return { added, errors };
}
