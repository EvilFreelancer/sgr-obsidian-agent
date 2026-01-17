export const VIEW_TYPE = "sgr-agent-chat-view";
export const VIEW_TYPE_HISTORY = "sgr-agent-chat-history-view";

export const CHAT_MODES = {
  AGENT: "agent",
  ASK: "ask",
  PLAN: "plan",
} as const;

export const DEFAULT_SETTINGS = {
  baseUrl: "",
  apiKey: "",
  proxy: "",
  defaultModel: "",
  defaultMode: CHAT_MODES.ASK,
  temperature: 0.7,
  maxTokens: 2000,
  chatHistoryFolder: "Chat History",
};

export type ChatMode = typeof CHAT_MODES[keyof typeof CHAT_MODES];

// System prompts are now handled by the agent library
// Keeping this for backward compatibility if needed elsewhere
export const SYSTEM_PROMPTS = {
  [CHAT_MODES.AGENT]: "",
  [CHAT_MODES.ASK]: "",
  [CHAT_MODES.PLAN]: "",
};
