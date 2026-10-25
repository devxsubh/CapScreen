/**
 * Desktop app: a single local user, no sign-in. The flag keeps its historical
 * name because the no-auth code paths were first built as "preview mode".
 */
export const UI_PREVIEW_MODE = true;

export const PREVIEW_USER = {
  id: "local-user",
  email: "you@capscreen.local",
};

export const PREVIEW_PROFILE = {
  displayName: "You",
  organisation: "This computer",
  // Model keys live in the AI Control Center; the legacy per-user key UI is unused.
  apiKeys: {
    claude: { configured: true, source: "user" as const },
    gemini: { configured: false, source: null },
    openai: { configured: false, source: null },
  },
};
