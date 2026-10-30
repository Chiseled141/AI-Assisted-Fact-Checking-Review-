import type { SubmittedFile } from '../types/models';
import { validateFile, validateFileText } from './validation';

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Validates and reads picked files in the browser. Nothing is uploaded.
 * Returns the files that were accepted plus one message per rejected file.
 */
export async function readTextFiles(
  picked: File[],
  existing: SubmittedFile[],
): Promise<{ added: SubmittedFile[]; errors: string[] }> {
  const added: SubmittedFile[] = [];
  const errors: string[] = [];

  for (const file of picked) {
    const preError = validateFile(file, [...existing, ...added]);
    if (preError) {
      errors.push(preError);
      continue;
    }
    try {
      const text = await readFileText(file);
      const textError = validateFileText(file.name, text);
      if (textError) errors.push(textError);
      else added.push({ name: file.name, size: file.size, text });
    } catch {
      errors.push(`“${file.name}” could not be read.`);
    }
  }
  return { added, errors };
}
