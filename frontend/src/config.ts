// Tunable limits and demo timings. Adjust here rather than in components.
export const config = {
  text: { minLength: 20, maxLength: 5000 },
  url: { maxLength: 2048 },
  /** Plain-text attachments for text checks, read in the browser. */
  files: {
    maxFiles: 3,
    maxBytes: 200 * 1024,
    maxChars: 20_000,
    extensions: ['.txt', '.md', '.markdown'],
    accept: '.txt,.md,.markdown,text/plain,text/markdown',
  },
  history: { pageSize: 5 },
  correction: {
    minReasonLength: 10,
    maxReasonLength: 1000,
    /** Screenshots are shrunk in the browser so demo data fits in localStorage. */
    screenshots: {
      maxFiles: 3,
      maxBytes: 8 * 1024 * 1024,
      maxDimension: 1600,
      maxStoredBytes: 600 * 1024,
      types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      accept: 'image/png,image/jpeg,image/webp,image/gif',
    },
  },
  /** Simulated duration (ms) of each processing stage before advancing. */
  stageDurations: { queued: 900, extracting: 1400, retrieving: 1600, assessing: 1400 },
  /** Simulated network latency (ms) for mock service calls. */
  mockLatency: 180,
  storageKey: 'claimtrace.demo',
  storageSchemaVersion: 3,
} as const;
