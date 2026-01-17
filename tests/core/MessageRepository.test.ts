import { describe, test, expect, beforeEach } from 'vitest';
import { MessageRepository } from '../../src/core/MessageRepository';
import { ChatMessage, ChatHistoryMetadata } from '../../src/types';
import { CHAT_MODES } from '../../src/constants';
import { MockApp } from '../mocks/obsidian';

describe('MessageRepository', () => {
  let mockApp: MockApp;
  let messageRepo: MessageRepository;

  beforeEach(() => {
    mockApp = new MockApp();
    messageRepo = new MessageRepository(mockApp as any, 'Chat History');
  });

  describe('saveChat', () => {
    test('should save chat in JSON format', async () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello', timestamp: 1000 },
        { role: 'assistant', content: 'Hi there!', timestamp: 2000 },
      ];

      const metadata: ChatHistoryMetadata = {
        title: 'Test Chat',
        createdAt: '2024-01-01T12:00:00Z',
        lastAccessedAt: '2024-01-01T12:00:00Z',
      };

      const filePath = await messageRepo.saveChat(messages, metadata);

      expect(filePath).toMatch(/\.json$/);
      const content = mockApp.vault.getFileContent(filePath);
      expect(content).toBeDefined();

      const parsed = JSON.parse(content!);
      expect(parsed).toHaveProperty('messages');
      expect(parsed).toHaveProperty('metadata');
    });

    test('should preserve all messages including system messages', async () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant response' },
      ];

      const metadata: ChatHistoryMetadata = {
        title: 'Test Chat',
        createdAt: '2024-01-01T12:00:00Z',
        lastAccessedAt: '2024-01-01T12:00:00Z',
      };

      const filePath = await messageRepo.saveChat(messages, metadata);
      const content = mockApp.vault.getFileContent(filePath);
      const parsed = JSON.parse(content!);

      expect(parsed.messages.length).toBe(3);
      expect(parsed.messages[0].role).toBe('system');
      expect(parsed.messages[1].role).toBe('user');
      expect(parsed.messages[2].role).toBe('assistant');
    });

    test('should preserve metadata', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
      const metadata: ChatHistoryMetadata = {
        title: 'Test Chat Title',
        createdAt: '2024-01-01T12:00:00Z',
        lastAccessedAt: '2024-01-01T13:00:00Z',
      };

      const filePath = await messageRepo.saveChat(messages, metadata);
      const content = mockApp.vault.getFileContent(filePath);
      const parsed = JSON.parse(content!);

      expect(parsed.metadata.title).toBe('Test Chat Title');
      expect(parsed.metadata.createdAt).toBe('2024-01-01T12:00:00Z');
      expect(parsed.metadata.lastAccessedAt).toBe('2024-01-01T13:00:00Z');
    });

    test('should update existing file when saving to same path', async () => {
      const messages1: ChatMessage[] = [{ role: 'user', content: 'First' }];
      const messages2: ChatMessage[] = [{ role: 'user', content: 'Second' }];
      const metadata: ChatHistoryMetadata = {
        title: 'Test Chat',
        createdAt: '2024-01-01T12:00:00Z',
        lastAccessedAt: '2024-01-01T12:00:00Z',
      };

      const filePath1 = await messageRepo.saveChat(messages1, metadata);
      const filePath2 = await messageRepo.saveChat(messages2, metadata);

      expect(filePath1).toBe(filePath2);
      const content = mockApp.vault.getFileContent(filePath2);
      const parsed = JSON.parse(content!);
      expect(parsed.messages[0].content).toBe('Second');
    });
  });

  describe('loadChat', () => {
    test('should load chat from JSON file', async () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User message', timestamp: 1000 },
        { role: 'assistant', content: 'Assistant response', timestamp: 2000 },
      ];

      const metadata: ChatHistoryMetadata = {
        title: 'Test Chat',
        createdAt: '2024-01-01T12:00:00Z',
        lastAccessedAt: '2024-01-01T12:00:00Z',
      };

      const filePath = await messageRepo.saveChat(messages, metadata);
      const loaded = await messageRepo.loadChat(filePath);

      expect(loaded.messages.length).toBe(3);
      expect(loaded.messages[0].role).toBe('system');
      expect(loaded.messages[0].content).toBe('System prompt');
      expect(loaded.messages[1].content).toBe('User message');
      expect(loaded.messages[2].content).toBe('Assistant response');
      expect(loaded.metadata.title).toBe('Test Chat');
    });

    test('should support old format with metadata', async () => {
      const oldFormat = {
        messages: [
          { role: 'user' as const, content: 'Hello', timestamp: 1000 },
        ],
        metadata: {
          title: 'Old Chat',
          createdAt: '2024-01-01T12:00:00Z',
          lastAccessedAt: '2024-01-01T12:00:00Z',
        },
      };

      const filePath = 'Chat History/test.json';
      await mockApp.vault.create(filePath, JSON.stringify(oldFormat, null, 2));

      const loaded = await messageRepo.loadChat(filePath);
      expect(loaded.messages.length).toBe(1);
      expect(loaded.metadata.title).toBe('Old Chat');
    });

    test('should support new format with title and created_at', async () => {
      const newFormat = {
        title: 'New Chat',
        created_at: '2024-01-01T12:00:00Z',
        updated_at: '2024-01-01T13:00:00Z',
        messages: [
          { role: 'user' as const, content: 'Hello', timestamp: 1000 },
        ],
      };

      const filePath = 'Chat History/test.json';
      await mockApp.vault.create(filePath, JSON.stringify(newFormat, null, 2));

      const loaded = await messageRepo.loadChat(filePath);
      expect(loaded.messages.length).toBe(1);
      expect(loaded.metadata.title).toBe('New Chat');
      expect(loaded.metadata.createdAt).toBe('2024-01-01T12:00:00Z');
      expect(loaded.metadata.lastAccessedAt).toBe('2024-01-01T13:00:00Z');
    });

    test('should throw error for invalid file format', async () => {
      const invalidFormat = { invalid: 'data' };
      const filePath = 'Chat History/invalid.json';
      await mockApp.vault.create(filePath, JSON.stringify(invalidFormat, null, 2));

      await expect(messageRepo.loadChat(filePath)).rejects.toThrow();
    });

    test('should throw error for non-existent file', async () => {
      await expect(messageRepo.loadChat('Chat History/nonexistent.json')).rejects.toThrow();
    });
  });

  describe('saveChatWithTimestamp', () => {
    test('should save chat with timestamp as filename', async () => {
      const timestamp = 1704110400000; // 2024-01-01T12:00:00Z
      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

      const filePath = await messageRepo.saveChatWithTimestamp(messages, timestamp, 'Test Chat');

      expect(filePath).toBe('Chat History/1704110400000.json');
      const content = mockApp.vault.getFileContent(filePath);
      const parsed = JSON.parse(content!);
      expect(parsed.title).toBe('Test Chat');
      expect(parsed.created_at).toBeDefined();
      expect(parsed.updated_at).toBeDefined();
    });

    test('should preserve created_at when updating existing file', async () => {
      const timestamp = 1704110400000;
      const messages1: ChatMessage[] = [{ role: 'user', content: 'First' }];
      const messages2: ChatMessage[] = [{ role: 'user', content: 'Second' }];

      const filePath1 = await messageRepo.saveChatWithTimestamp(messages1, timestamp, 'Test Chat');
      const originalCreatedAt = JSON.parse(mockApp.vault.getFileContent(filePath1)!).created_at;

      // Wait a bit to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const filePath2 = await messageRepo.saveChatWithTimestamp(messages2, timestamp, 'Test Chat');
      const updated = JSON.parse(mockApp.vault.getFileContent(filePath2)!);

      expect(filePath1).toBe(filePath2);
      expect(updated.created_at).toBe(originalCreatedAt);
      expect(updated.updated_at).not.toBe(originalCreatedAt);
    });
  });

  describe('listChats', () => {
    test('should list all chats sorted by lastAccessedAt', async () => {
      const chat1 = {
        messages: [{ role: 'user', content: 'Message 1' }],
        metadata: {
          title: 'Chat 1',
          createdAt: '2024-01-01T12:00:00Z',
          lastAccessedAt: '2024-01-01T12:00:00Z',
        },
      };

      const chat2 = {
        messages: [{ role: 'user', content: 'Message 2' }],
        metadata: {
          title: 'Chat 2',
          createdAt: '2024-01-02T12:00:00Z',
          lastAccessedAt: '2024-01-02T12:00:00Z',
        },
      };

      await messageRepo.saveChat(chat1.messages, chat1.metadata);
      await messageRepo.saveChat(chat2.messages, chat2.metadata);

      const chats = await messageRepo.listChats();

      expect(chats.length).toBe(2);
      expect(chats[0].metadata.title).toBe('Chat 2'); // Newest first
      expect(chats[1].metadata.title).toBe('Chat 1');
    });

    test('should return empty array when no chats exist', async () => {
      const chats = await messageRepo.listChats();
      expect(chats).toEqual([]);
    });

    test('should skip invalid JSON files', async () => {
      await mockApp.vault.create('Chat History/invalid.json', 'invalid json');
      await mockApp.vault.create('Chat History/valid.json', JSON.stringify({
        title: 'Valid',
        created_at: '2024-01-01T12:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        messages: [{ role: 'user', content: 'Hello' }],
      }));

      const chats = await messageRepo.listChats();
      expect(chats.length).toBe(1);
      expect(chats[0].metadata.title).toBe('Valid');
    });
  });

  describe('updateLastAccessedAt', () => {
    test('should update lastAccessedAt in old format', async () => {
      const oldFormat = {
        messages: [{ role: 'user', content: 'Hello' }],
        metadata: {
          title: 'Test',
          createdAt: '2024-01-01T12:00:00Z',
          lastAccessedAt: '2024-01-01T12:00:00Z',
        },
      };

      const filePath = 'Chat History/test.json';
      await mockApp.vault.create(filePath, JSON.stringify(oldFormat, null, 2));

      await new Promise(resolve => setTimeout(resolve, 10));
      await messageRepo.updateLastAccessedAt(filePath);

      const updated = JSON.parse(mockApp.vault.getFileContent(filePath)!);
      expect(new Date(updated.metadata.lastAccessedAt).getTime()).toBeGreaterThan(
        new Date(oldFormat.metadata.lastAccessedAt).getTime()
      );
    });

    test('should update updated_at in new format', async () => {
      const newFormat = {
        title: 'Test',
        created_at: '2024-01-01T12:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const filePath = 'Chat History/test.json';
      await mockApp.vault.create(filePath, JSON.stringify(newFormat, null, 2));

      await new Promise(resolve => setTimeout(resolve, 10));
      await messageRepo.updateLastAccessedAt(filePath);

      const updated = JSON.parse(mockApp.vault.getFileContent(filePath)!);
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
        new Date(newFormat.updated_at).getTime()
      );
    });
  });

  describe('getTimestampFromPath', () => {
    test('should extract timestamp from filename', () => {
      const timestamp = messageRepo.getTimestampFromPath('Chat History/1704110400000.json');
      expect(timestamp).toBe(1704110400000);
    });

    test('should return null for invalid filename', () => {
      expect(messageRepo.getTimestampFromPath('Chat History/invalid.json')).toBeNull();
      expect(messageRepo.getTimestampFromPath('Chat History/test.txt')).toBeNull();
    });
  });

  describe('deleteChat', () => {
    test('should delete chat file', async () => {
      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
      const metadata: ChatHistoryMetadata = {
        title: 'Test',
        createdAt: '2024-01-01T12:00:00Z',
        lastAccessedAt: '2024-01-01T12:00:00Z',
      };

      const filePath = await messageRepo.saveChat(messages, metadata);
      expect(mockApp.vault.getFileContent(filePath)).toBeDefined();

      await messageRepo.deleteChat(filePath);
      expect(mockApp.vault.getFileContent(filePath)).toBeUndefined();
    });
  });
});
