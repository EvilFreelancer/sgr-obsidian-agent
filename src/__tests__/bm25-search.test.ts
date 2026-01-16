/**
 * Tests for BM25 search functionality
 * 
 * Feature: Chat history should support BM25 search by title
 * Feature: Search should filter chats in real-time
 * Feature: Search should be case-insensitive
 */

import { ChatHistoryMetadata } from "../types";

// BM25 search implementation for testing
interface ChatItem {
  path: string;
  metadata: ChatHistoryMetadata;
}

function bm25Search(
  query: string,
  chats: ChatItem[],
  field: keyof ChatHistoryMetadata = 'title'
): ChatItem[] {
  if (!query.trim()) {
    return chats;
  }

  const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
  
  if (queryTerms.length === 0) {
    return chats;
  }

  // Simple BM25 scoring (simplified version)
  const k1 = 1.5;
  const b = 0.75;
  const avgFieldLength = chats.reduce((sum, chat) => {
    const fieldValue = String(chat.metadata[field] || '');
    return sum + fieldValue.length;
  }, 0) / (chats.length || 1);

  const scores = chats.map(chat => {
    const fieldValue = String(chat.metadata[field] || '').toLowerCase();
    const fieldLength = fieldValue.length;
    
    let score = 0;
    
    for (const term of queryTerms) {
      const termFrequency = (fieldValue.match(new RegExp(term, 'g')) || []).length;
      
      if (termFrequency > 0) {
        const idf = Math.log((chats.length + 1) / (chats.filter(c => 
          String(c.metadata[field] || '').toLowerCase().includes(term)
        ).length + 1));
        
        const numerator = termFrequency * (k1 + 1);
        const denominator = termFrequency + k1 * (1 - b + b * (fieldLength / avgFieldLength));
        
        score += idf * (numerator / denominator);
      }
    }
    
    return { chat, score };
  });

  // Filter out zero scores and sort by score descending
  return scores
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.chat);
}

describe("BM25 Search Tests", () => {
  const mockChats: ChatItem[] = [
    {
      path: 'chat1.json',
      metadata: {
        title: 'How to implement authentication',
        createdAt: '2024-01-01T12:00:00Z',
        lastAccessedAt: '2024-01-01T12:00:00Z',
        model: 'gpt-4',
        mode: 'ask',
      },
    },
    {
      path: 'chat2.json',
      metadata: {
        title: 'React hooks tutorial',
        createdAt: '2024-01-02T12:00:00Z',
        lastAccessedAt: '2024-01-02T12:00:00Z',
        model: 'gpt-4',
        mode: 'ask',
      },
    },
    {
      path: 'chat3.json',
      metadata: {
        title: 'TypeScript best practices',
        createdAt: '2024-01-03T12:00:00Z',
        lastAccessedAt: '2024-01-03T12:00:00Z',
        model: 'gpt-4',
        mode: 'ask',
      },
    },
    {
      path: 'chat4.json',
      metadata: {
        title: 'Authentication and authorization',
        createdAt: '2024-01-04T12:00:00Z',
        lastAccessedAt: '2024-01-04T12:00:00Z',
        model: 'gpt-4',
        mode: 'ask',
      },
    },
  ];

  test("Feature: Empty query should return all chats", () => {
    const results = bm25Search('', mockChats);
    expect(results.length).toBe(mockChats.length);
  });

  test("Feature: Search should filter by title", () => {
    const results = bm25Search('authentication', mockChats);
    expect(results.length).toBe(2);
    expect(results[0].metadata.title).toContain('authentication');
    expect(results[1].metadata.title).toContain('authentication');
  });

  test("Feature: Search should be case-insensitive", () => {
    const results1 = bm25Search('AUTHENTICATION', mockChats);
    const results2 = bm25Search('authentication', mockChats);
    const results3 = bm25Search('Authentication', mockChats);
    
    expect(results1.length).toBe(results2.length);
    expect(results2.length).toBe(results3.length);
    expect(results1.length).toBe(2);
  });

  test("Feature: Search should handle multiple terms", () => {
    const results = bm25Search('react hooks', mockChats);
    expect(results.length).toBe(1);
    expect(results[0].metadata.title).toBe('React hooks tutorial');
  });

  test("Feature: Search should return empty array for no matches", () => {
    const results = bm25Search('nonexistent term', mockChats);
    expect(results.length).toBe(0);
  });

  test("Feature: Search results should be sorted by relevance", () => {
    const results = bm25Search('authentication', mockChats);
    
    // Results should be sorted by score (most relevant first)
    expect(results.length).toBeGreaterThan(0);
    
    // First result should contain the search term
    expect(results[0].metadata.title.toLowerCase()).toContain('authentication');
  });

  test("Feature: Partial word matches should work", () => {
    const results = bm25Search('auth', mockChats);
    expect(results.length).toBe(2);
    expect(results.every(r => 
      r.metadata.title.toLowerCase().includes('auth')
    )).toBe(true);
  });

  test("Feature: Search should handle special characters", () => {
    const chatsWithSpecial: ChatItem[] = [
      {
        path: 'chat1.json',
        metadata: {
          title: 'C++ programming guide',
          createdAt: '2024-01-01T12:00:00Z',
          lastAccessedAt: '2024-01-01T12:00:00Z',
          model: 'gpt-4',
          mode: 'ask',
        },
      },
    ];
    
    const results = bm25Search('c++', chatsWithSpecial);
    expect(results.length).toBe(1);
  });

  test("Feature: Search should handle whitespace", () => {
    const results1 = bm25Search('  authentication  ', mockChats);
    const results2 = bm25Search('authentication', mockChats);
    
    expect(results1.length).toBe(results2.length);
  });
});

// Manual test runner (for Node.js environment)
if (typeof require !== "undefined" && require.main === module) {
  console.log("Running BM25 search tests...");
  console.log("These tests verify BM25 search functionality for chat history.");
}
