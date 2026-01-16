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

export const SYSTEM_PROMPTS = {
  [CHAT_MODES.AGENT]: "You are an autonomous AI agent. You can use tools to accomplish tasks. Think step by step and decide which actions to take.",
  [CHAT_MODES.ASK]: "You are a helpful assistant. Answer questions directly and concisely.",
  [CHAT_MODES.PLAN]: "You are a planning assistant. Break down tasks into steps and execute them systematically.",
};
