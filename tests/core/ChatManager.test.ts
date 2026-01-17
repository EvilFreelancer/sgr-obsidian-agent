import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ChatManager } from '../../src/core/ChatManager';
import { MessageRepository } from '../../src/core/MessageRepository';
import { CHAT_MODES, SYSTEM_PROMPTS } from '../../src/constants';
import { MockApp, MockTFile } from '../mocks/obsidian';

describe('ChatManager', () => {
  let mockApp: MockApp;
  let messageRepo: MessageRepository;
  let chatManager: ChatManager;

  beforeEach(() => {
    mockApp = new MockApp();
    messageRepo = new MessageRepository(mockApp as any, 'Chat History');
    chatManager = new ChatManager(
      messageRepo,
      mockApp as any,
      'https://api.example.com',
      'test-key',
      undefined,
      'gpt-4',
      0.7,
      2000
    );
  });

  describe('startSession', () => {
    test('should create new session without system message', () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');

      const session = chatManager.getCurrentSession();
      expect(session).not.toBeNull();
      expect(session!.messages.length).toBe(0); // No system message anymore
    });

    test('should initialize file contexts as empty array', () => {
      chatManager.startSession(CHAT_MODES.AGENT, 'gpt-4');

      const session = chatManager.getCurrentSession();
      expect(session!.fileContexts).toEqual([]);
    });
  });

  describe('updateMode', () => {
    test('should not throw when mode changes', () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      expect(() => chatManager.updateMode(CHAT_MODES.AGENT)).not.toThrow();
    });

    test('should not update if no session exists', () => {
      expect(() => chatManager.updateMode(CHAT_MODES.AGENT)).not.toThrow();
    });
  });

  describe('addFileContext', () => {
    test('should add file context to session', async () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      await mockApp.vault.create('test.md', 'File content');

      await chatManager.addFileContext('test.md');

      const session = chatManager.getCurrentSession();
      expect(session!.fileContexts.length).toBe(1);
      expect(session!.fileContexts[0].path).toBe('test.md');
      expect(session!.fileContexts[0].content).toBe('File content');
    });

    test('should not add duplicate file contexts', async () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      await mockApp.vault.create('test.md', 'File content');

      await chatManager.addFileContext('test.md');
      await chatManager.addFileContext('test.md');

      const session = chatManager.getCurrentSession();
      expect(session!.fileContexts.length).toBe(1);
    });

    test('should throw error if file not found', async () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');

      await expect(chatManager.addFileContext('nonexistent.md')).rejects.toThrow();
    });

    test('should throw error if no session exists', async () => {
      await mockApp.vault.create('test.md', 'File content');

      await expect(chatManager.addFileContext('test.md')).rejects.toThrow('No active session');
    });
  });

  describe('removeFileContext', () => {
    test('should remove file context from session', async () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      await mockApp.vault.create('test.md', 'File content');
      await chatManager.addFileContext('test.md');

      chatManager.removeFileContext('test.md');

      const session = chatManager.getCurrentSession();
      expect(session!.fileContexts.length).toBe(0);
    });

    test('should not throw if file context does not exist', () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      expect(() => chatManager.removeFileContext('nonexistent.md')).not.toThrow();
    });
  });

  describe('appendAssistantMessage', () => {
    test('should append content to existing assistant message', () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      chatManager.appendAssistantMessage('Hello');
      chatManager.appendAssistantMessage(' World');

      const session = chatManager.getCurrentSession();
      const assistantMessage = session!.messages.find(msg => msg.role === 'assistant');
      expect(assistantMessage).toBeDefined();
      expect(assistantMessage!.content).toBe('Hello World');
    });

    test('should create new assistant message if none exists', () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      chatManager.appendAssistantMessage('Hello');

      const session = chatManager.getCurrentSession();
      const assistantMessages = session!.messages.filter(msg => msg.role === 'assistant');
      expect(assistantMessages.length).toBe(1);
      expect(assistantMessages[0].content).toBe('Hello');
    });

    test('should not do anything if no session exists', () => {
      expect(() => chatManager.appendAssistantMessage('Hello')).not.toThrow();
    });
  });

  describe('removeMessagesAfterIndex', () => {
    test('should remove messages after specified index', () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      chatManager.appendAssistantMessage('Response 1');
      // Simulate user message
      const session = chatManager.getCurrentSession()!;
      session.messages.push({ role: 'user', content: 'Question 2', timestamp: Date.now() });
      chatManager.appendAssistantMessage('Response 2');

      // Remove after first assistant message (index 0 in displayMessages)
      // Should keep: assistant (0) = 1 message
      chatManager.removeMessagesAfterIndex(0);

      const updatedSession = chatManager.getCurrentSession();
      expect(updatedSession!.messages.length).toBe(1); // first assistant
      expect(updatedSession!.fileContexts.length).toBe(0); // Should clear file contexts
    });

    test('should remove messages correctly', () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      chatManager.appendAssistantMessage('Response');
      // Remove after index 0 (first assistant in displayMessages)
      chatManager.removeMessagesAfterIndex(0);

      const session = chatManager.getCurrentSession();
      expect(session!.messages.length).toBe(1); // assistant
    });
  });

  describe('clearSession', () => {
    test('should clear current session', () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      chatManager.appendAssistantMessage('Response');

      chatManager.clearSession();

      expect(chatManager.getCurrentSession()).toBeNull();
    });
  });

  describe('saveSession', () => {
    test('should save session to repository', async () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      chatManager.appendAssistantMessage('Response');

      const filePath = await chatManager.saveSession('Test Chat');

      expect(filePath).toBeDefined();
      const content = mockApp.vault.getFileContent(filePath);
      const parsed = JSON.parse(content!);
      expect(parsed.messages.length).toBeGreaterThan(0);
      expect(parsed.metadata.title).toBe('Test Chat');
    });

    test('should throw error if no session exists', async () => {
      await expect(chatManager.saveSession()).rejects.toThrow('No active session');
    });
  });

  describe('loadSession', () => {
    test('should load session from repository', async () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      chatManager.appendAssistantMessage('Response');
      const filePath = await chatManager.saveSession('Test Chat');

      await chatManager.loadSession(filePath);

      const session = chatManager.getCurrentSession();
      expect(session).not.toBeNull();
      expect(session!.messages.length).toBeGreaterThan(0);
      expect(chatManager.getSessionTitle()).toBe('Test Chat');
    });

    test('should load messages without system message', async () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      chatManager.appendAssistantMessage('Response');
      const filePath = await chatManager.saveSession('Test Chat');

      await chatManager.loadSession(filePath);

      const session = chatManager.getCurrentSession();
      // System messages are no longer added
      const systemMessages = session!.messages.filter(msg => msg.role === 'system');
      expect(systemMessages.length).toBe(0);
    });
  });

  describe('updateClient', () => {
    test('should update LLM client with new credentials', () => {
      chatManager.updateClient('https://new-api.com', 'new-key', 'https://proxy.com');

      // Client should be updated (we can't directly test, but it shouldn't throw)
      expect(() => chatManager.updateClient('https://new-api.com', 'new-key')).not.toThrow();
    });

    test('should set client to null if credentials are empty', async () => {
      chatManager.updateClient('', '', undefined, undefined, undefined, undefined, undefined);

      // Should throw when trying to use null client
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      await expect(chatManager.sendMessage('Hello', 'gpt-4', CHAT_MODES.ASK, false)).rejects.toThrow();
    });
  });

  describe('getSessionTitle', () => {
    test('should return null for new session', () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      expect(chatManager.getSessionTitle()).toBeNull();
    });

    test('should return title after loading session', async () => {
      chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
      chatManager.appendAssistantMessage('Response');
      const filePath = await chatManager.saveSession('Test Chat');

      await chatManager.loadSession(filePath);

      expect(chatManager.getSessionTitle()).toBe('Test Chat');
    });
  });
});
