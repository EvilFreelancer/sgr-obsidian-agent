export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
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
  model: string;
  mode: string;
}
