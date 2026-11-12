// Tunable interface limits. Adjust here rather than in components.
import judges from '../../backend/config/data/judges.json';

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
  history: { pageSize: 20 },
  /** Search settings a reader can save. Bounds match `SearchOptions` in backend/app/api/schemas.py; defaults match settings.py. */
  search: {
    noteMaxLength: 500,
    sourcesPerClaim: { min: 1, max: 8, serverDefault: 5 },
    searchesPerClaim: { min: 1, max: 5, serverDefault: 5 },
    claimsPerCheck: { min: 1, max: 5, serverDefault: 5 },
    maxBlockedDomains: 20,
  },
  /**
   * LLM judges offered in the new-check picker, read from backend/config/data/judges.json, the one list
   * the backend also uses. `defaultIds` is the picker's starting pair; the
   * evaluation pair is frozen separately after a test on about 30 claims.
   */
  judges: {
    count: 2,
    options: Object.entries(judges.options).map(([id, { name, lab, logo, nameColor }]) => ({ id, name, lab, logo, nameColor })),
    defaultIds: judges.default,
    /** Answers follow-up questions unless the reader picks another. Matches `followup` in models.toml. */
    followUpDefaultId: 'claude-haiku',
  },
  correction: {
    /** The "Review assessment" button. Off until there is a new way in; the dialog behind it still works. */
    showReviewButton: false,
    minReasonLength: 10,
    maxReasonLength: 1000,
    /** Screenshots are shrunk in the browser before being sent to the backend. */
    screenshots: {
      maxFiles: 3,
      maxBytes: 8 * 1024 * 1024,
      maxDimension: 1600,
      maxStoredBytes: 600 * 1024,
      types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      accept: 'image/png,image/jpeg,image/webp,image/gif',
    },
  },
} as const;
