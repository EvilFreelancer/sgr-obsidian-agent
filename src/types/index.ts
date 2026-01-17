export interface ToolCall {
  toolName: string;
  arguments: string;
  startTime: number;
  endTime?: number;
  duration?: number; // in milliseconds
  rawJson?: string; // Full JSON response from agent
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  toolCalls?: ToolCall[]; // Tool calls metadata for assistant messages
  finalAnswer?: string; // Extracted final answer from final_answer tool
}

export interface FileContext {
  path: string;
  content: string;
  metadata?: {
    title?: string;
    tags?: string[];
  };
}

export interface Model {
  id: string;
  name?: string;
  provider?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatHistoryMetadata {
  title: string;
  createdAt: string;
  lastAccessedAt: string;
}
