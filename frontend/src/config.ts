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
  history: { pageSize: 20 },
  /**
   * LLM judges offered in the new-check picker. Names are display labels only; real model IDs
   * go here once they are confirmed. `defaultIds` is the picker's starting pair (demo only); the
   * evaluation pair is frozen separately after the candidate test in the plan.
   */
  judges: {
    count: 2,
    options: [
      // `mono` logos are single-colour marks that flip to white in dark mode; the rest keep their brand colour.
      { id: 'claude-haiku', name: 'Claude Haiku 5.5', lab: 'Anthropic', logo: '/logos/anthropic.svg', mono: true },
      { id: 'deepseek-flash', name: 'DeepSeek Flash V4.1', lab: 'DeepSeek', logo: '/logos/deepseek.svg', mono: false },
      { id: 'gpt-luna', name: 'GPT Luna', lab: 'OpenAI', logo: '/logos/openai.svg', mono: true },
      { id: 'glm-5-3-flash', name: 'GLM 5.3 Flash', lab: 'Z.ai', logo: '/logos/zai.svg', mono: false },
      { id: 'qwen-flash', name: 'Qwen3.8 Flash', lab: 'Alibaba', logo: '/logos/qwen.svg', mono: false },
      { id: 'minimax-flash', name: 'MiniMax M3.1 Flash', lab: 'MiniMax', logo: '/logos/minimax.svg', mono: true },
    ],
    defaultIds: ['gpt-luna', 'claude-haiku'],
  },
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
  storageSchemaVersion: 7,
} as const;
