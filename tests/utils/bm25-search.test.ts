import { describe, test, expect } from 'vitest';
import { bm25Search } from '../../src/utils/bm25Search';
import { ChatHistoryMetadata } from '../../src/types';

interface ChatItem {
  path: string;
  metadata: ChatHistoryMetadata;
}

describe('BM25 Search', () => {
  const mockChats: ChatItem[] = [
    {
      path: 'chat1.json',
      metadata: {
        title: 'How to implement authentication',
        createdAt: '2024-01-01T12:00:00Z',
        lastAccessedAt: '2024-01-01T12:00:00Z',
      },
    },
    {
      path: 'chat2.json',
      metadata: {
        title: 'React hooks tutorial',
        createdAt: '2024-01-02T12:00:00Z',
        lastAccessedAt: '2024-01-02T12:00:00Z',
      },
    },
    {
      path: 'chat3.json',
      metadata: {
        title: 'TypeScript best practices',
        createdAt: '2024-01-03T12:00:00Z',
        lastAccessedAt: '2024-01-03T12:00:00Z',
      },
    },
    {
      path: 'chat4.json',
      metadata: {
        title: 'Authentication and authorization',
        createdAt: '2024-01-04T12:00:00Z',
        lastAccessedAt: '2024-01-04T12:00:00Z',
      },
    },
  ];

  test('should return all chats for empty query', () => {
    const results = bm25Search('', mockChats);
    expect(results.length).toBe(mockChats.length);
  });

  test('should filter chats by title', () => {
    const results = bm25Search('authentication', mockChats);
    expect(results.length).toBe(2);
    expect(results[0].metadata.title).toContain('authentication');
  });

  test('should be case-insensitive', () => {
    const results1 = bm25Search('AUTHENTICATION', mockChats);
    const results2 = bm25Search('authentication', mockChats);
    expect(results1.length).toBe(results2.length);
    expect(results1.length).toBe(2);
  });

  test('should handle multiple terms', () => {
    const results = bm25Search('react hooks', mockChats);
    expect(results.length).toBe(1);
    expect(results[0].metadata.title).toBe('React hooks tutorial');
  });

  test('should return empty array for no matches', () => {
    const results = bm25Search('nonexistent term', mockChats);
    expect(results.length).toBe(0);
  });

  test('should handle whitespace', () => {
    const results1 = bm25Search('  authentication  ', mockChats);
    const results2 = bm25Search('authentication', mockChats);
    expect(results1.length).toBe(results2.length);
  });
});
