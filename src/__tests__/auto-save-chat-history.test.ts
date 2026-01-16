/**
 * Tests for automatic chat history saving
 * 
 * Feature: Chat should be automatically saved when user sends message
 * Feature: Chat should be automatically saved when assistant responds
 * Feature: Chat files should be named with timestamp format: <timestamp>.json
 * Feature: JSON format should be: { title: "New Chat", created_at: "...", updated_at: "...", messages: [...] }
 */

import { ChatManager } from "../core/ChatManager";
import { MessageRepository } from "../core/MessageRepository";
import { CHAT_MODES } from "../constants";
import { ChatMessage } from "../types";

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

  getMarkdownFiles(): any[] {
    return [];
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

// Mock LLMClient that returns a stream
class MockLLMClient {
  async sendMessage(): Promise<AsyncIterable<string>> {
    return this.mockStream();
  }

  private async *mockStream(): AsyncIterable<string> {
    const chunks = ['Hello', ' ', 'world', '!'];
    for (const chunk of chunks) {
      yield chunk;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

describe("Auto-save Chat History Tests", () => {
  let mockApp: MockApp;
  let messageRepo: MessageRepository;
  let chatManager: ChatManager;

  beforeEach(() => {
    mockApp = new MockApp();
    messageRepo = new MessageRepository(mockApp as any, "Chat History");
    chatManager = new ChatManager(
      messageRepo,
      mockApp as any,
      "https://api.example.com",
      "test-key"
    );
  });

  test("Feature: Chat file should be named with timestamp format", async () => {
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    
    // Simulate sending a message
    const userMessage = "Hello";
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    });

    // Auto-save should create file with timestamp
    const filePath = await chatManager.autoSaveSession();
    
    // File should match pattern: Chat History/<timestamp>.json
    expect(filePath).not.toBeNull();
    expect(filePath!).toMatch(/^Chat History\/\d+\.json$/);
    
    // Extract timestamp from filename
    const fileName = filePath!.split('/').pop()!;
    const timestamp = parseInt(fileName.replace('.json', ''));
    expect(timestamp).toBeGreaterThan(0);
    expect(timestamp).toBeLessThanOrEqual(Date.now());
  });

  test("Feature: JSON format should have correct structure", async () => {
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    
    const userMessage = "Hello";
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    });

    const filePath = await chatManager.autoSaveSession();
    const content = mockApp.vault.getFileContent(filePath);
    expect(content).toBeDefined();
    
    const parsed = JSON.parse(content!);
    
    // Check structure
    expect(parsed).toHaveProperty('title');
    expect(parsed).toHaveProperty('created_at');
    expect(parsed).toHaveProperty('updated_at');
    expect(parsed).toHaveProperty('messages');
    
    // Check default title
    expect(parsed.title).toBe('New Chat');
    
    // Check timestamps are ISO strings
    expect(typeof parsed.created_at).toBe('string');
    expect(typeof parsed.updated_at).toBe('string');
    expect(() => new Date(parsed.created_at)).not.toThrow();
    expect(() => new Date(parsed.updated_at)).not.toThrow();
    
    // Check messages array
    expect(Array.isArray(parsed.messages)).toBe(true);
  });

  test("Feature: User message should be saved immediately when sent", async () => {
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    
    const userMessage = "Test question";
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    });

    // Auto-save after user message
    const filePath = await chatManager.autoSaveSession();
    const content = mockApp.vault.getFileContent(filePath);
    const parsed = JSON.parse(content!);
    
    // Should have system message + user message
    expect(parsed.messages.length).toBeGreaterThanOrEqual(2);
    const userMsg = parsed.messages.find((m: ChatMessage) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg.content).toBe(userMessage);
  });

  test("Feature: Assistant response should be saved when received", async () => {
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    
    // Add user message
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: "Hello",
      timestamp: Date.now(),
    });

    // Add assistant response
    chatManager.appendAssistantMessage("Hi there!");
    
    // Auto-save after assistant response
    const filePath = await chatManager.autoSaveSession();
    const content = mockApp.vault.getFileContent(filePath);
    const parsed = JSON.parse(content!);
    
    // Should have system + user + assistant messages
    const assistantMsg = parsed.messages.find((m: ChatMessage) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content).toBe("Hi there!");
  });

  test("Feature: updated_at should change when chat is updated", async () => {
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: "First message",
      timestamp: Date.now(),
    });

    const filePath1 = await chatManager.autoSaveSession();
    const content1 = mockApp.vault.getFileContent(filePath1);
    const parsed1 = JSON.parse(content1!);
    const firstUpdatedAt = parsed1.updated_at;
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Add another message
    chatManager.appendAssistantMessage("Response");
    
    const filePath2 = await chatManager.autoSaveSession();
    const content2 = mockApp.vault.getFileContent(filePath2);
    const parsed2 = JSON.parse(content2!);
    const secondUpdatedAt = parsed2.updated_at;
    
    // Should be the same file (same timestamp in filename)
    expect(filePath1).toBe(filePath2);
    
    // But updated_at should be different
    expect(secondUpdatedAt).not.toBe(firstUpdatedAt);
    expect(new Date(secondUpdatedAt).getTime()).toBeGreaterThan(new Date(firstUpdatedAt).getTime());
  });

  test("Feature: created_at should remain constant for same chat", async () => {
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: "First message",
      timestamp: Date.now(),
    });

    const filePath1 = await chatManager.autoSaveSession();
    const content1 = mockApp.vault.getFileContent(filePath1);
    const parsed1 = JSON.parse(content1!);
    const firstCreatedAt = parsed1.created_at;
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Add another message
    chatManager.appendAssistantMessage("Response");
    
    const filePath2 = await chatManager.autoSaveSession();
    const content2 = mockApp.vault.getFileContent(filePath2);
    const parsed2 = JSON.parse(content2!);
    const secondCreatedAt = parsed2.created_at;
    
    // created_at should remain the same
    expect(secondCreatedAt).toBe(firstCreatedAt);
  });

  test("Feature: Multiple messages should be saved correctly", async () => {
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    
    const session = chatManager.getCurrentSession()!;
    
    // Add multiple user and assistant messages
    session.messages.push({
      role: 'user',
      content: "Question 1",
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage("Answer 1");
    
    session.messages.push({
      role: 'user',
      content: "Question 2",
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage("Answer 2");

    const filePath = await chatManager.autoSaveSession();
    const content = mockApp.vault.getFileContent(filePath);
    const parsed = JSON.parse(content!);
    
    // Should have system + 2 user + 2 assistant = 5 messages
    expect(parsed.messages.length).toBe(5);
    
    const userMessages = parsed.messages.filter((m: ChatMessage) => m.role === 'user');
    const assistantMessages = parsed.messages.filter((m: ChatMessage) => m.role === 'assistant');
    
    expect(userMessages.length).toBe(2);
    expect(assistantMessages.length).toBe(2);
  });
});

// Manual test runner (for Node.js environment)
if (typeof require !== "undefined" && require.main === module) {
  console.log("Running auto-save chat history tests...");
  console.log("These tests require Obsidian API mocks and should be run in a test environment.");
}
