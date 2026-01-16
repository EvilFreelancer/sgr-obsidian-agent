/**
 * Tests for JSON chat history format
 * 
 * Feature: Chat history should be saved in JSON format using OpenAI protocol
 * Feature: Chat history should include all messages (including system messages)
 * Feature: Chat history should be easily restorable on app restart
 */

import { MessageRepository } from "../core/MessageRepository";
import { ChatMessage, ChatHistoryMetadata } from "../types";
import { CHAT_MODES } from "../constants";

// Mock Obsidian API for testing
class MockApp {
  vault: any;
  constructor() {
    this.vault = new MockVault();
  }
}

class MockVault {
  private files: Map<string, string> = new Map();
  private folders: Set<string> = new Set();

  getAbstractFileByPath(path: string): any {
    if (this.files.has(path)) {
      return new MockTFile(path);
    }
    if (this.folders.has(path)) {
      return new MockTFolder(path);
    }
    return null;
  }

  async read(file: any): Promise<string> {
    const content = this.files.get(file.path);
    if (!content) {
      throw new Error(`File not found: ${file.path}`);
    }
    return content;
  }

  async create(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, content);
    // Ensure parent folder exists
    const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
    if (folderPath) {
      this.folders.add(folderPath);
    }
  }

  async modify(file: any, content: string): Promise<void> {
    this.files.set(file.path, content);
  }

  async delete(file: any): Promise<void> {
    this.files.delete(file.path);
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  getFiles(): any[] {
    const files: any[] = [];
    for (const path of this.files.keys()) {
      if (path.endsWith('.json')) {
        files.push(new MockTFile(path));
      }
    }
    return files;
  }

  getFileContent(path: string): string | undefined {
    return this.files.get(path);
  }
}

class MockTFile {
  path: string;
  basename: string;

  constructor(path: string) {
    this.path = path;
    this.basename = path.substring(path.lastIndexOf('/') + 1).replace('.json', '');
  }
}

class MockTFolder {
  path: string;

  constructor(path: string) {
    this.path = path;
  }
}

describe("JSON Chat History Tests", () => {
  let mockApp: MockApp;
  let messageRepo: MessageRepository;

  beforeEach(() => {
    mockApp = new MockApp();
    messageRepo = new MessageRepository(mockApp as any, "Chat History");
  });

  test("Feature: Chat should be saved in JSON format", async () => {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
      },
      {
        role: 'user',
        content: 'Hello',
        timestamp: 1000,
      },
      {
        role: 'assistant',
        content: 'Hi there!',
        timestamp: 2000,
      },
    ];

    const metadata: ChatHistoryMetadata = {
      title: 'Test Chat',
      createdAt: '2024-01-01T12:00:00Z',
      lastAccessedAt: '2024-01-01T12:00:00Z',
      model: 'gpt-4',
      mode: CHAT_MODES.ASK,
    };

    const filePath = await messageRepo.saveChat(messages, metadata);

    // Check that file was created with .json extension
    expect(filePath).toMatch(/\.json$/);
    
    const content = mockApp.vault.getFileContent(filePath);
    expect(content).toBeDefined();
    
    // Check that content is valid JSON
    const parsed = JSON.parse(content!);
    expect(parsed).toBeDefined();
  });

  test("Feature: JSON format should follow OpenAI protocol structure", async () => {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
      },
      {
        role: 'user',
        content: 'Hello',
        timestamp: 1000,
      },
      {
        role: 'assistant',
        content: 'Hi there!',
        timestamp: 2000,
      },
    ];

    const metadata: ChatHistoryMetadata = {
      title: 'Test Chat',
      createdAt: '2024-01-01T12:00:00Z',
      lastAccessedAt: '2024-01-01T12:00:00Z',
      model: 'gpt-4',
      mode: CHAT_MODES.ASK,
    };

    const filePath = await messageRepo.saveChat(messages, metadata);
    const content = mockApp.vault.getFileContent(filePath);
    const parsed = JSON.parse(content!);

    // Check OpenAI protocol structure
    expect(parsed).toHaveProperty('messages');
    expect(parsed).toHaveProperty('metadata');
    
    // Check messages array format (OpenAI protocol)
    expect(Array.isArray(parsed.messages)).toBe(true);
    expect(parsed.messages.length).toBe(3);
    
    // Check message format
    expect(parsed.messages[0]).toHaveProperty('role');
    expect(parsed.messages[0]).toHaveProperty('content');
    expect(parsed.messages[0].role).toBe('system');
    expect(parsed.messages[0].content).toBe('You are a helpful assistant.');
  });

  test("Feature: All messages including system should be saved", async () => {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'System prompt',
      },
      {
        role: 'user',
        content: 'User message 1',
      },
      {
        role: 'assistant',
        content: 'Assistant response 1',
      },
      {
        role: 'user',
        content: 'User message 2',
      },
      {
        role: 'assistant',
        content: 'Assistant response 2',
      },
    ];

    const metadata: ChatHistoryMetadata = {
      title: 'Test Chat',
      createdAt: '2024-01-01T12:00:00Z',
      lastAccessedAt: '2024-01-01T12:00:00Z',
      model: 'gpt-4',
      mode: CHAT_MODES.ASK,
    };

    const filePath = await messageRepo.saveChat(messages, metadata);
    const content = mockApp.vault.getFileContent(filePath);
    const parsed = JSON.parse(content!);

    // All messages should be saved, including system
    expect(parsed.messages.length).toBe(5);
    expect(parsed.messages[0].role).toBe('system');
    expect(parsed.messages[1].role).toBe('user');
    expect(parsed.messages[2].role).toBe('assistant');
  });

  test("Feature: Metadata should be preserved in JSON", async () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: 'Hello',
      },
    ];

    const metadata: ChatHistoryMetadata = {
      title: 'Test Chat Title',
      createdAt: '2024-01-01T12:00:00Z',
      lastAccessedAt: '2024-01-01T13:00:00Z',
      model: 'gpt-4',
      mode: CHAT_MODES.AGENT,
    };

    const filePath = await messageRepo.saveChat(messages, metadata);
    const content = mockApp.vault.getFileContent(filePath);
    const parsed = JSON.parse(content!);

    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.title).toBe('Test Chat Title');
    expect(parsed.metadata.createdAt).toBe('2024-01-01T12:00:00Z');
    expect(parsed.metadata.lastAccessedAt).toBe('2024-01-01T13:00:00Z');
    expect(parsed.metadata.model).toBe('gpt-4');
    expect(parsed.metadata.mode).toBe(CHAT_MODES.AGENT);
  });

  test("Feature: Chat should be loadable from JSON format", async () => {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'System prompt',
      },
      {
        role: 'user',
        content: 'User message',
        timestamp: 1000,
      },
      {
        role: 'assistant',
        content: 'Assistant response',
        timestamp: 2000,
      },
    ];

    const metadata: ChatHistoryMetadata = {
      title: 'Test Chat',
      createdAt: '2024-01-01T12:00:00Z',
      lastAccessedAt: '2024-01-01T12:00:00Z',
      model: 'gpt-4',
      mode: CHAT_MODES.ASK,
    };

    const filePath = await messageRepo.saveChat(messages, metadata);
    
    // Load the chat
    const loaded = await messageRepo.loadChat(filePath);

    // Check that all messages are loaded correctly
    expect(loaded.messages.length).toBe(3);
    expect(loaded.messages[0].role).toBe('system');
    expect(loaded.messages[0].content).toBe('System prompt');
    expect(loaded.messages[1].role).toBe('user');
    expect(loaded.messages[1].content).toBe('User message');
    expect(loaded.messages[2].role).toBe('assistant');
    expect(loaded.messages[2].content).toBe('Assistant response');

    // Check metadata
    expect(loaded.metadata.title).toBe('Test Chat');
    expect(loaded.metadata.model).toBe('gpt-4');
  });

  test("Feature: File contexts should be preserved in saved format", async () => {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'System prompt',
      },
      {
        role: 'user',
        content: '[File: test.md]\nFile content\n[/File]\n\nUser question',
        timestamp: 1000,
      },
      {
        role: 'assistant',
        content: 'Response with file context',
        timestamp: 2000,
      },
    ];

    const metadata: ChatHistoryMetadata = {
      title: 'Test Chat',
      createdAt: '2024-01-01T12:00:00Z',
      lastAccessedAt: '2024-01-01T12:00:00Z',
      model: 'gpt-4',
      mode: CHAT_MODES.ASK,
    };

    const filePath = await messageRepo.saveChat(messages, metadata);
    const loaded = await messageRepo.loadChat(filePath);

    // File context should be preserved in user message
    expect(loaded.messages[1].content).toContain('[File: test.md]');
    expect(loaded.messages[1].content).toContain('File content');
    expect(loaded.messages[1].content).toContain('User question');
  });

  test("Feature: listChats should work with JSON files", async () => {
    // Save multiple chats
    const chat1 = {
      messages: [{ role: 'user' as const, content: 'Message 1' }],
      metadata: {
        title: 'Chat 1',
        createdAt: '2024-01-01T12:00:00Z',
        lastAccessedAt: '2024-01-01T12:00:00Z',
        model: 'gpt-4',
        mode: CHAT_MODES.ASK,
      },
    };

    const chat2 = {
      messages: [{ role: 'user' as const, content: 'Message 2' }],
      metadata: {
        title: 'Chat 2',
        createdAt: '2024-01-02T12:00:00Z',
        lastAccessedAt: '2024-01-02T12:00:00Z',
        model: 'gpt-4',
        mode: CHAT_MODES.ASK,
      },
    };

    await messageRepo.saveChat(chat1.messages, chat1.metadata);
    await messageRepo.saveChat(chat2.messages, chat2.metadata);

    const chats = await messageRepo.listChats();

    expect(chats.length).toBe(2);
    expect(chats[0].metadata.title).toBe('Chat 2'); // Newest first
    expect(chats[1].metadata.title).toBe('Chat 1');
  });
});

// Manual test runner (for Node.js environment)
if (typeof require !== "undefined" && require.main === module) {
  console.log("Running JSON chat history tests...");
  console.log("These tests require Obsidian API mocks and should be run in a test environment.");
}
