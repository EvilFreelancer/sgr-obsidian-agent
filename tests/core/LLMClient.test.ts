import { describe, test, expect, beforeEach, vi } from 'vitest';
import { LLMClient, NetworkError, LLMAPIError, InvalidModelError, RateLimitError } from '../../src/core/LLMClient';
import { ChatMessage } from '../../src/types';

// Mock fetch globally
global.fetch = vi.fn();

describe('LLMClient', () => {
  let client: LLMClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new LLMClient('https://api.example.com', 'test-key');
  });

  describe('constructor', () => {
    test('should normalize base URL by removing trailing slash', () => {
      const client1 = new LLMClient('https://api.example.com/', 'key');
      const client2 = new LLMClient('https://api.example.com', 'key');
      // Both should work the same way
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
    });

    test('should store proxy URL if provided', () => {
      const clientWithProxy = new LLMClient('https://api.example.com', 'key', 'https://proxy.com');
      expect(clientWithProxy).toBeDefined();
    });
  });

  describe('fetchModels', () => {
    test('should fetch models successfully', async () => {
      const mockResponse = {
        data: [
          { id: 'gpt-4', name: 'GPT-4' },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const models = await client.fetchModels();

      expect(models.length).toBe(2);
      expect(models[0].id).toBe('gpt-4');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key',
          }),
        })
      );
    });

    test('should throw LLMAPIError on 401', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      try {
        await client.fetchModels();
        expect.fail('Should have thrown LLMAPIError');
      } catch (error) {
        expect(error).toBeInstanceOf(LLMAPIError);
        expect((error as LLMAPIError).message).toContain('Invalid API key');
      }
    });

    test('should throw NetworkError on network failure', async () => {
      (global.fetch as any).mockRejectedValueOnce(new TypeError('Network error'));

      await expect(client.fetchModels()).rejects.toThrow(NetworkError);
    });

    test('should use proxy URL if provided', async () => {
      const clientWithProxy = new LLMClient('https://api.example.com', 'key', 'https://proxy.com');

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });

      await clientWithProxy.fetchModels();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://proxy.com/models',
        expect.any(Object)
      );
    });
  });

  describe('sendMessageNonStreaming', () => {
    test('should send message and return response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Hello, how can I help?',
          },
        }],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const response = await client.sendMessageNonStreaming('gpt-4', messages);

      expect(response).toBe('Hello, how can I help?');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key',
          }),
          body: expect.stringContaining('"model":"gpt-4"'),
        })
      );
    });

    test('should throw InvalidModelError on 404', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

      await expect(client.sendMessageNonStreaming('invalid-model', messages))
        .rejects.toThrow(InvalidModelError);
    });

    test('should throw RateLimitError on 429', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

      await expect(client.sendMessageNonStreaming('gpt-4', messages))
        .rejects.toThrow(RateLimitError);
    });

    test('should use default options if not provided', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Response' },
        }],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
      await client.sendMessageNonStreaming('gpt-4', messages);

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(2000);
      expect(body.stream).toBe(false);
    });
  });

  describe('sendMessage (streaming)', () => {
    test('should return async iterable for streaming', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" World"}}]}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: mockStream,
      });

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
      const stream = await client.sendMessage('gpt-4', messages);

      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' World']);
    });

    test('should handle partial SSE chunks', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          // Simulate partial chunk
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"'));
          controller.enqueue(new TextEncoder().encode('choices":[{"delta":{"content":" World"}}]}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: mockStream,
      });

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
      const stream = await client.sendMessage('gpt-4', messages);

      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' World']);
    });

    test('should stop on [DONE] marker', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Should not appear"}}]}\n\n'));
          controller.close();
        },
      });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: mockStream,
      });

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
      const stream = await client.sendMessage('gpt-4', messages);

      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello']);
    });

    test('should throw NetworkError if response body is empty', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: null,
      });

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

      await expect(client.sendMessage('gpt-4', messages)).rejects.toThrow(NetworkError);
    });
  });
});
