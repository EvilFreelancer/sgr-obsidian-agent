import { describe, test, expect, beforeEach } from 'vitest';
import { ChatManager } from '../../src/core/ChatManager';
import { MessageRepository } from '../../src/core/MessageRepository';
import { CHAT_MODES } from '../../src/constants';
import { MockApp } from '../mocks/obsidian';

describe('Auto-save Chat History', () => {
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

  test('should save chat file with timestamp format', async () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');

    const userMessage = 'Hello';
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    });

    const filePath = await chatManager.autoSaveSession();

    expect(filePath).not.toBeNull();
    expect(filePath!).toMatch(/^Chat History\/\d+\.json$/);

    const fileName = filePath!.split('/').pop()!;
    const timestamp = parseInt(fileName.replace('.json', ''));
    expect(timestamp).toBeGreaterThan(0);
    expect(timestamp).toBeLessThanOrEqual(Date.now());
  });

  test('should save chat in correct JSON format', async () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');

    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: 'Hello',
      timestamp: Date.now(),
    });

    const filePath = await chatManager.autoSaveSession();
    const content = mockApp.vault.getFileContent(filePath);
    expect(content).toBeDefined();

    const parsed = JSON.parse(content!);

    expect(parsed).toHaveProperty('title');
    expect(parsed).toHaveProperty('created_at');
    expect(parsed).toHaveProperty('updated_at');
    expect(parsed).toHaveProperty('messages');

    expect(parsed.title).toBe('New Chat');
    expect(typeof parsed.created_at).toBe('string');
    expect(typeof parsed.updated_at).toBe('string');
    expect(Array.isArray(parsed.messages)).toBe(true);
  });

  test('should update updated_at when chat is modified', async () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');

    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: 'First message',
      timestamp: Date.now(),
    });

    const filePath1 = await chatManager.autoSaveSession();
    const content1 = mockApp.vault.getFileContent(filePath1);
    const parsed1 = JSON.parse(content1!);
    const firstUpdatedAt = parsed1.updated_at;

    await new Promise(resolve => setTimeout(resolve, 10));

    chatManager.appendAssistantMessage('Response');

    const filePath2 = await chatManager.autoSaveSession();
    const content2 = mockApp.vault.getFileContent(filePath2);
    const parsed2 = JSON.parse(content2!);
    const secondUpdatedAt = parsed2.updated_at;

    expect(filePath1).toBe(filePath2);
    expect(secondUpdatedAt).not.toBe(firstUpdatedAt);
    expect(new Date(secondUpdatedAt).getTime()).toBeGreaterThan(
      new Date(firstUpdatedAt).getTime()
    );
  });

  test('should preserve created_at when updating', async () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');

    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: 'First message',
      timestamp: Date.now(),
    });

    const filePath1 = await chatManager.autoSaveSession();
    const content1 = mockApp.vault.getFileContent(filePath1);
    const parsed1 = JSON.parse(content1!);
    const firstCreatedAt = parsed1.created_at;

    await new Promise(resolve => setTimeout(resolve, 10));

    chatManager.appendAssistantMessage('Response');

    const filePath2 = await chatManager.autoSaveSession();
    const content2 = mockApp.vault.getFileContent(filePath2);
    const parsed2 = JSON.parse(content2!);
    const secondCreatedAt = parsed2.created_at;

    expect(secondCreatedAt).toBe(firstCreatedAt);
  });
});
