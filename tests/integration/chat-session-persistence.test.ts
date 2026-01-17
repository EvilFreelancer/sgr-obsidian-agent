import { describe, test, expect, beforeEach } from 'vitest';
import { ChatManager } from '../../src/core/ChatManager';
import { MessageRepository } from '../../src/core/MessageRepository';
import { CHAT_MODES } from '../../src/constants';
import { MockApp } from '../mocks/obsidian';

describe('Chat Session Persistence', () => {
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

  test('should update lastAccessedAt when loading session', async () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
    chatManager.appendAssistantMessage('Hello, how can I help?');

    const timestamp = Date.now();
    const originalSaveTime = new Date('2024-01-01T12:00:00Z').toISOString();
    const filePath = await messageRepo.saveChatWithTimestamp(
      chatManager.getCurrentSession()!.messages,
      timestamp,
      'Test Chat'
    );

    // Manually set created_at to test update
    const file = mockApp.vault.getAbstractFileByPath(filePath);
    const content = mockApp.vault.getFileContent(filePath);
    const parsed = JSON.parse(content!);
    parsed.created_at = originalSaveTime;
    parsed.updated_at = originalSaveTime;
    if (file) {
      await mockApp.vault.modify(file, JSON.stringify(parsed, null, 2));
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    await chatManager.loadSession(filePath);

    const updatedContent = mockApp.vault.getFileContent(filePath);
    const updatedParsed = JSON.parse(updatedContent!);
    
    const newUpdatedAt = updatedParsed.updated_at;
    expect(new Date(newUpdatedAt).getTime()).toBeGreaterThan(
      new Date(originalSaveTime).getTime()
    );
  });

  test('should load messages without system message', async () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
    chatManager.appendAssistantMessage('Hello, how can I help?');

    const timestamp = Date.now();
    const filePath = await messageRepo.saveChatWithTimestamp(
      chatManager.getCurrentSession()!.messages,
      timestamp,
      'Test Chat'
    );

    await chatManager.loadSession(filePath);

    const session = chatManager.getCurrentSession();
    expect(session).toBeDefined();
    expect(session!.messages.length).toBeGreaterThan(0);

    // System messages are no longer added
    const systemMessages = session!.messages.filter(msg => msg.role === 'system');
    expect(systemMessages.length).toBe(0);
  });

  test('should preserve all messages when loading', async () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
    
    // Simulate first user message and response
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: 'First question',
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage('First response');
    
    // Simulate second user message and response
    session.messages.push({
      role: 'user',
      content: 'Second question',
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage('Second response');

    const timestamp = Date.now();
    const filePath = await messageRepo.saveChatWithTimestamp(
      session.messages,
      timestamp,
      'Test Chat'
    );

    await chatManager.loadSession(filePath);

    const loadedSession = chatManager.getCurrentSession();
    expect(loadedSession).toBeDefined();

    // Should have: user + assistant + user + assistant = 4 messages (no system message)
    expect(loadedSession!.messages.length).toBeGreaterThanOrEqual(4);

    const userMessages = loadedSession!.messages.filter(msg => msg.role === 'user');
    const assistantMessages = loadedSession!.messages.filter(msg => msg.role === 'assistant');
    const systemMessages = loadedSession!.messages.filter(msg => msg.role === 'system');

    // System messages are no longer added
    expect(systemMessages.length).toBe(0);
    expect(userMessages.length).toBe(2);
    expect(assistantMessages.length).toBe(2);
  });
});
