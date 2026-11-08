// Tunable interface limits. Adjust here rather than in components.
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
   * LLM judges offered in the new-check picker. IDs and names must match `[judges]` in
   * backend/config/models.toml, which holds the OpenRouter model IDs.
   * `defaultIds` is the picker's starting pair; the
   * evaluation pair is frozen separately after a test on about 30 claims.
   */
  judges: {
    count: 2,
    options: [
      { id: 'claude-haiku', name: 'Claude Haiku 5.5', lab: 'Anthropic', logo: '/logos/anthropic.svg', nameColor: '#A14B16' },
      { id: 'gpt-luna', name: 'GPT Luna', lab: 'OpenAI', logo: '/logos/openai.svg', nameColor: '#172D61' },
      { id: 'gemini-flash-lite', name: 'Gemini 3.5 Flash-Lite', lab: 'Google', logo: '/source-logos/google-com.png', nameColor: '#7D2A93' },
      { id: 'deepseek-flash', name: 'DeepSeek Flash V4.1', lab: 'DeepSeek', logo: '/logos/deepseek.svg', nameColor: '#006C79' },
      { id: 'glm-5-3-flash', name: 'GLM 5.3 Flash', lab: 'Z.ai', logo: '/logos/zai.svg', nameColor: '#3D6119' },
      { id: 'qwen-flash', name: 'Qwen3.8 Flash', lab: 'Alibaba', logo: '/logos/qwen.svg', nameColor: '#3732B5' },
      { id: 'minimax-flash', name: 'MiniMax M3.1 Flash', lab: 'MiniMax', logo: '/logos/minimax.svg', nameColor: '#A82467' },
      { id: 'mimo-flash', name: 'MiMo v2.6 Flash', lab: 'Xiaomi', logo: '/logos/xiaomi.svg', nameColor: '#4F3700' },
    ],
    defaultIds: ['gpt-luna', 'claude-haiku'],
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
