import { describe, test, expect, beforeEach } from 'vitest';
import { ChatManager } from '../../src/core/ChatManager';
import { MessageRepository } from '../../src/core/MessageRepository';
import { CHAT_MODES } from '../../src/constants';
import { MockApp } from '../mocks/obsidian';

describe('Message Editing', () => {
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

  test('should replace edited message instead of adding duplicate', () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
    
    // Simulate a chat with user message and assistant response
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: 'о чём файл @[[GPT2 на Engram.md]] ?',
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage('Response 1');
    
    // Simulate editing the first user message (index 0 in displayMessages)
    // This should remove the old message and all subsequent messages
    chatManager.removeMessagesAfterIndex(0);
    
    // Add the edited message
    session.messages.push({
      role: 'user',
      content: 'о чём файл @[[GPT2 на Engram.md]]  ?', // Edited version
      timestamp: Date.now(),
    });
    
    // Check that we don't have duplicate user messages
    const userMessages = session.messages.filter(msg => msg.role === 'user');
    expect(userMessages.length).toBe(1);
    expect(userMessages[0].content).toBe('о чём файл @[[GPT2 на Engram.md]]  ?');
    
    // Check that assistant response was removed
    const assistantMessages = session.messages.filter(msg => msg.role === 'assistant');
    expect(assistantMessages.length).toBe(0);
  });

  test('should remove edited message and all subsequent messages', () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
    
    // Create a chat with multiple messages
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: 'First question',
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage('First response');
    session.messages.push({
      role: 'user',
      content: 'Second question',
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage('Second response');
    
    // Edit the first user message (index 0)
    chatManager.removeMessagesAfterIndex(0);
    
    // Check that only messages before the edited one remain
    // Since we're editing index 0, all messages should be removed
    expect(session.messages.length).toBe(0);
  });

  test('should handle editing middle message correctly', () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
    
    // Create a chat with multiple messages
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: 'First question',
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage('First response');
    session.messages.push({
      role: 'user',
      content: 'Second question',
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage('Second response');
    session.messages.push({
      role: 'user',
      content: 'Third question',
      timestamp: Date.now(),
    });
    
    // Edit the second user message (index 2 in displayMessages: user, assistant, user)
    chatManager.removeMessagesAfterIndex(2);
    
    // Should keep first user and first assistant, remove second user and second assistant
    expect(session.messages.length).toBe(2);
    expect(session.messages[0].content).toBe('First question');
    expect(session.messages[1].content).toBe('First response');
    
    // Add edited second message
    session.messages.push({
      role: 'user',
      content: 'Second question edited',
      timestamp: Date.now(),
    });
    
    // Check no duplicates
    const userMessages = session.messages.filter(msg => msg.role === 'user');
    expect(userMessages.length).toBe(2);
    expect(userMessages[0].content).toBe('First question');
    expect(userMessages[1].content).toBe('Second question edited');
  });

  test('should restore removed messages when editing is cancelled', () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
    
    // Create a chat with multiple messages
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: 'First question',
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage('First response');
    session.messages.push({
      role: 'user',
      content: 'Second question',
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage('Second response');
    
    // Simulate editing the first user message (index 0)
    // This removes the message and all after it
    chatManager.removeMessagesAfterIndex(0);
    
    // Check that messages were removed
    expect(session.messages.length).toBe(0);
    
    // Restore removed messages
    chatManager.restoreRemovedMessages();
    
    // Check that all messages were restored
    expect(session.messages.length).toBe(4);
    expect(session.messages[0].content).toBe('First question');
    expect(session.messages[1].content).toBe('First response');
    expect(session.messages[2].content).toBe('Second question');
    expect(session.messages[3].content).toBe('Second response');
  });

  test('should clear removed messages when session is cleared', () => {
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
    
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: 'Question',
      timestamp: Date.now(),
    });
    
    // Remove messages
    chatManager.removeMessagesAfterIndex(0);
    
    // Clear session
    chatManager.clearSession();
    
    // Start new session
    chatManager.startSession(CHAT_MODES.ASK, 'gpt-4');
    
    // Try to restore - should do nothing since messages were cleared
    chatManager.restoreRemovedMessages();
    
    const newSession = chatManager.getCurrentSession();
    expect(newSession!.messages.length).toBe(0);
  });
});
