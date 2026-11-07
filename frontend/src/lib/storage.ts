// Thin, failure-tolerant wrapper around localStorage.
// Private windows, blocked storage, or quota errors fall back to memory.

const memory = new Map<string, string>();

export function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writeItem(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep the preference for the current session when persistent storage is unavailable.
  }
}
