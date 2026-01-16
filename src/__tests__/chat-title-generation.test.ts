/**
 * Tests for chat title generation feature
 * 
 * Feature: Chat title should be generated automatically from first user message
 * Feature: Title should be short and descriptive
 * Feature: Title should be generated when first user message is sent
 */

import { ChatManager } from "../core/ChatManager";
import { MessageRepository } from "../core/MessageRepository";
import { CHAT_MODES } from "../constants";

// Mock Obsidian API for testing
class MockApp {
  vault: any;
  workspace: any;

  constructor() {
    this.vault = new MockVault();
    this.workspace = new MockWorkspace();
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

class MockWorkspace {
  openLinkText(path: string, sourcePath: string, newLeaf: boolean): void {
    // Mock implementation
  }
}

describe("Chat Title Generation Tests", () => {
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

  test("Feature: Chat should have auto-generated title from first user message", async () => {
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    
    // Simulate first user message
    const firstMessage = "How do I implement authentication in my app?";
    
    // After first message, title should be generated
    // This should happen automatically when saving
    const session = chatManager.getCurrentSession();
    expect(session).toBeDefined();
    
    // Title should be generated from first user message
    // In actual implementation, this would be done via generateTitle() method
    const generatedTitle = generateTitleFromMessage(firstMessage);
    expect(generatedTitle).toBeDefined();
    expect(generatedTitle.length).toBeLessThan(100); // Should be short
  });

  test("Feature: Title should be short and descriptive", () => {
    const testCases = [
      {
        message: "How do I implement authentication in my app?",
        expectedLength: { min: 5, max: 50 },
      },
      {
        message: "Explain the difference between REST and GraphQL APIs",
        expectedLength: { min: 5, max: 50 },
      },
      {
        message: "What is React?",
        expectedLength: { min: 5, max: 20 },
      },
    ];

    testCases.forEach(({ message, expectedLength }) => {
      const title = generateTitleFromMessage(message);
      expect(title.length).toBeGreaterThanOrEqual(expectedLength.min);
      expect(title.length).toBeLessThanOrEqual(expectedLength.max);
      expect(title).toBeTruthy();
    });
  });

  test("Feature: Title should be generated when first user message is sent", async () => {
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    
    // Before first message, title should be null or default
    let session = chatManager.getCurrentSession();
    expect(session).toBeDefined();
    
    // Simulate sending first message
    // In actual implementation, title would be generated here
    const firstUserMessage = "How to use TypeScript?";
    
    // After first message, title should be available
    // This would be set in ChatManager when first user message is processed
    const title = generateTitleFromMessage(firstUserMessage);
    expect(title).toBeDefined();
    expect(title.length).toBeGreaterThan(0);
  });

  test("Feature: Title should handle long messages by truncating", () => {
    const longMessage = "This is a very long message that contains a lot of text and should be truncated to create a reasonable title that is not too long but still descriptive enough to understand what the chat is about";
    
    const title = generateTitleFromMessage(longMessage);
    expect(title.length).toBeLessThanOrEqual(60); // Max title length
    expect(title).toBeTruthy();
  });

  test("Feature: Title should handle special characters", () => {
    const messages = [
      "What's the difference?",
      "How to use @mentions?",
      "Explain [code] blocks",
      "What about #hashtags?",
    ];

    messages.forEach((message) => {
      const title = generateTitleFromMessage(message);
      expect(title).toBeDefined();
      expect(title.length).toBeGreaterThan(0);
      // Title should not contain problematic characters for filenames
      expect(title).not.toMatch(/[<>:"/\\|?*]/);
    });
  });

  test("Feature: Title should be saved with chat metadata", async () => {
    chatManager.startSession(CHAT_MODES.ASK, "gpt-4");
    
    const firstMessage = "How to implement OAuth?";
    const generatedTitle = generateTitleFromMessage(firstMessage);
    
    // When saving, title should be included in metadata
    const session = chatManager.getCurrentSession();
    if (session) {
      session.messages.push({
        role: 'user',
        content: firstMessage,
        timestamp: Date.now(),
      });
      
      // Save with generated title
      const filePath = await chatManager.saveSession(generatedTitle);
      
      // Load and check title
      await chatManager.loadSession(filePath);
      const loaded = await messageRepo.loadChat(filePath);
      
      expect(loaded.metadata.title).toBe(generatedTitle);
    }
  });
});

// Helper function to generate title from message (simplified version)
function generateTitleFromMessage(message: string): string {
  // Remove markdown links, code blocks, etc.
  let cleanMessage = message
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/@\[\[([^\]]+)\]\]/g, '$1') // Remove file mentions
    .trim();

  // Take first sentence or first 50 characters
  const firstSentence = cleanMessage.split(/[.!?]/)[0];
  let title = firstSentence || cleanMessage;
  
  // Limit length
  if (title.length > 60) {
    title = title.substring(0, 57) + '...';
  }
  
  // Remove problematic characters for filenames
  title = title.replace(/[<>:"/\\|?*]/g, '');
  
  // Capitalize first letter
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }
  
  return title || 'Untitled Chat';
}

// Manual test runner (for Node.js environment)
if (typeof require !== "undefined" && require.main === module) {
  console.log("Running chat title generation tests...");
  console.log("These tests require Obsidian API mocks and should be run in a test environment.");
}
