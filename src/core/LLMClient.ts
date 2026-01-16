import { ChatMessage, Model } from "../types";

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class LLMAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public apiError?: any
  ) {
    super(message);
    this.name = 'LLMAPIError';
  }
}

export class InvalidModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidModelError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export class LLMClient {
  private baseUrl: string;
  private apiKey: string;
  private proxy?: string;

  constructor(baseUrl: string, apiKey: string, proxy?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.proxy = proxy;
  }

  async fetchModels(): Promise<Model[]> {
    try {
      const url = this.proxy ? `${this.proxy}/models` : `${this.baseUrl}/models`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new LLMAPIError('Invalid API key', response.status);
        }
        throw new LLMAPIError(`Failed to fetch models: ${response.statusText}`, response.status);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      if (error instanceof LLMAPIError) {
        throw error;
      }
      if (error instanceof TypeError) {
        throw new NetworkError(`Network error: ${error.message}`);
      }
      throw new NetworkError(`Failed to fetch models: ${error}`);
    }
  }

  async sendMessage(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<AsyncIterable<string>> {
    const url = this.proxy 
      ? `${this.proxy}/chat/completions` 
      : `${this.baseUrl}/chat/completions`;

    const requestBody = {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
      stream: options?.stream ?? true,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new LLMAPIError('Invalid API key', response.status);
        }
        if (response.status === 429) {
          throw new RateLimitError('Rate limit exceeded');
        }
        if (response.status === 404) {
          throw new InvalidModelError(`Model not found: ${model}`);
        }
        const errorData = await response.json().catch(() => ({}));
        throw new LLMAPIError(
          `API error: ${response.statusText}`,
          response.status,
          errorData
        );
      }

      if (!response.body) {
        throw new NetworkError('Response body is empty');
      }

      return this.parseSSEStream(response.body);
    } catch (error) {
      if (error instanceof LLMAPIError || error instanceof InvalidModelError || error instanceof RateLimitError) {
        throw error;
      }
      if (error instanceof TypeError) {
        throw new NetworkError(`Network error: ${error.message}`);
      }
      throw new NetworkError(`Failed to send message: ${error}`);
    }
  }

  private async *parseSSEStream(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0]?.delta?.content) {
                yield parsed.choices[0].delta.content;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
