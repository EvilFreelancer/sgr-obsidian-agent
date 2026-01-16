/**
 * Tests for chat session persistence bugs
 * 
 * Bug: When loading a chat session, lastAccessedAt is not updated in the saved file
 * Bug: When loading a chat session, system message is not added to the session
 */

import { ChatManager } from "../core/ChatManager";
import { MessageRepository } from "../core/MessageRepository";
import { CHAT_MODES } from "../constants";
import { ChatHistoryMetadata } from "../types";

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

  getMarkdownFiles(): any[] {
    const files: any[] = [];
    for (const path of this.files.keys()) {
      if (path.endsWith('.md')) {
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
    this.basename = path.substring(path.lastIndexOf('/') + 1).replace('.md', '');
  }
}

class MockTFolder {
  path: string;

  constructor(path: string) {
    this.path = path;
  }
}

describe("Chat Session Persistence Tests", () => {
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

  test("Bug: Loading a chat session should update lastAccessedAt in the saved file", async () => {
    // Create a chat session and save it
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    chatManager.appendAssistantMessage("Hello, how can I help?");
    
    const originalSaveTime = new Date("2024-01-01T12:00:00Z").toISOString();
    const filePath = await messageRepo.saveChat(
      chatManager.getCurrentSession()!.messages,
      {
        title: "Test Chat",
        createdAt: originalSaveTime,
        lastAccessedAt: originalSaveTime,
        model: "gpt-4",
        mode: CHAT_MODES.ASK,
      }
    );

    // Wait a bit to ensure time difference
    await new Promise(resolve => setTimeout(resolve, 10));

    // Load the session
    await chatManager.loadSession(filePath);

    // Read the file and check that lastAccessedAt was updated
    const content = mockApp.vault.getFileContent(filePath);
    expect(content).toBeDefined();
    
    const frontmatterMatch = content!.match(/^---\n([\s\S]*?)\n---\n/);
    expect(frontmatterMatch).toBeDefined();
    
    const frontmatter = frontmatterMatch![1];
    const lastAccessedMatch = frontmatter.match(/lastAccessedAt:\s*"([^"]+)"/);
    expect(lastAccessedMatch).toBeDefined();
    
    const newLastAccessedAt = lastAccessedMatch![1];
    expect(newLastAccessedAt).not.toBe(originalSaveTime);
    expect(new Date(newLastAccessedAt).getTime()).toBeGreaterThan(new Date(originalSaveTime).getTime());
  });

  test("Bug: Loading a chat session should add system message to the session", async () => {
    // Create a chat session and save it
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    chatManager.appendAssistantMessage("Hello, how can I help?");
    
    const filePath = await messageRepo.saveChat(
      chatManager.getCurrentSession()!.messages,
      {
        title: "Test Chat",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        model: "gpt-4",
        mode: CHAT_MODES.ASK,
      }
    );

    // Load the session
    await chatManager.loadSession(filePath);

    // Check that system message is present
    const session = chatManager.getCurrentSession();
    expect(session).toBeDefined();
    expect(session!.messages.length).toBeGreaterThan(0);
    
    const systemMessage = session!.messages.find(msg => msg.role === 'system');
    expect(systemMessage).toBeDefined();
    expect(systemMessage!.content).toBe("You are a helpful assistant. Answer questions directly and concisely.");
  });

  test("Bug: Loading a chat session should preserve all messages", async () => {
    // Create a chat session with multiple messages
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    chatManager.appendAssistantMessage("First response");
    
    // Manually add user message (simulating sendMessage)
    const session = chatManager.getCurrentSession()!;
    session.messages.push({
      role: 'user',
      content: 'Second question',
      timestamp: Date.now(),
    });
    chatManager.appendAssistantMessage("Second response");
    
    const filePath = await messageRepo.saveChat(
      session.messages,
      {
        title: "Test Chat",
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        model: "gpt-4",
        mode: CHAT_MODES.ASK,
      }
    );

    // Load the session
    await chatManager.loadSession(filePath);

    // Check that all messages are preserved (including system message)
    const loadedSession = chatManager.getCurrentSession();
    expect(loadedSession).toBeDefined();
    
    // Should have: system + user + assistant + user + assistant = 5 messages
    expect(loadedSession!.messages.length).toBe(5);
    
    const userMessages = loadedSession!.messages.filter(msg => msg.role === 'user');
    const assistantMessages = loadedSession!.messages.filter(msg => msg.role === 'assistant');
    
    expect(userMessages.length).toBe(2);
    expect(assistantMessages.length).toBe(2);
  });
});

// Manual test runner (for Node.js environment)
if (typeof require !== "undefined" && require.main === module) {
  console.log("Running chat session persistence tests...");
  console.log("These tests require Obsidian API mocks and should be run in a test environment.");
}
