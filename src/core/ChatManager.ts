import { LLMClient, NetworkError, LLMAPIError, InvalidModelError, RateLimitError } from "./LLMClient";
import { MessageRepository } from "./MessageRepository";
import { ChatMessage, FileContext, ChatHistoryMetadata } from "../types";
import { ChatMode, SYSTEM_PROMPTS } from "../constants";
import { App, TFile } from "obsidian";

export interface ChatSession {
  messages: ChatMessage[];
  fileContexts: FileContext[];
}

export class ChatManager {
  private llmClient: LLMClient | null = null;
  private messageRepo: MessageRepository;
  private app: App;
  private currentSession: ChatSession | null = null;
  private sessionTitle: string | null = null;
  private sessionTimestamp: number | null = null;
  private currentChatFilePath: string | null = null;

  constructor(
    messageRepo: MessageRepository,
    app: App,
    baseUrl: string,
    apiKey: string,
    proxy?: string
  ) {
    this.messageRepo = messageRepo;
    this.app = app;
    this.updateClient(baseUrl, apiKey, proxy);
  }

  updateClient(baseUrl: string, apiKey: string, proxy?: string): void {
    if (baseUrl && apiKey) {
      this.llmClient = new LLMClient(baseUrl, apiKey, proxy);
    } else {
      this.llmClient = null;
    }
  }

  startSession(mode: ChatMode, model: string): void {
    this.currentSession = {
      messages: [],
      fileContexts: [],
    };
    this.sessionTitle = null;
    this.sessionTimestamp = Date.now();
    this.currentChatFilePath = null;

    // Add system message
    const systemPrompt = SYSTEM_PROMPTS[mode];
    this.currentSession.messages.push({
      role: 'system',
      content: systemPrompt,
    });
  }

  updateMode(newMode: ChatMode): void {
    if (!this.currentSession) {
      return;
    }

    // Update system message (first message should be system)
    const systemPrompt = SYSTEM_PROMPTS[newMode];
    const systemMessageIndex = this.currentSession.messages.findIndex(
      msg => msg.role === 'system'
    );
    
    if (systemMessageIndex >= 0) {
      // Update existing system message
      this.currentSession.messages[systemMessageIndex].content = systemPrompt;
    } else {
      // Add system message if it doesn't exist (shouldn't happen, but just in case)
      this.currentSession.messages.unshift({
        role: 'system',
        content: systemPrompt,
      });
    }
  }

  addFileContext(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.currentSession) {
        reject(new Error('No active session'));
        return;
      }

      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        reject(new Error(`File not found: ${filePath}`));
        return;
      }

      this.app.vault.read(file).then(content => {
        const fileContext: FileContext = {
          path: filePath,
          content,
          metadata: {
            title: file.basename,
          },
        };

        // Check if file already in context
        if (!this.currentSession!.fileContexts.some(fc => fc.path === filePath)) {
          this.currentSession!.fileContexts.push(fileContext);
        }
        resolve();
      }).catch(reject);
    });
  }

  removeFileContext(filePath: string): void {
    if (!this.currentSession) return;
    this.currentSession.fileContexts = this.currentSession.fileContexts.filter(
      fc => fc.path !== filePath
    );
  }

  async sendMessage(userMessage: string, model: string, mode: ChatMode): Promise<AsyncIterable<string>> {
    if (!this.llmClient) {
      throw new Error('LLM client not initialized. Please check your settings.');
    }

    if (!this.currentSession) {
      throw new Error('No active session');
    }

    // Save original user message with @ mentions to session (for display)
    const userMsg: ChatMessage = {
      role: 'user',
      content: userMessage, // Keep original message with @ mentions
      timestamp: Date.now(),
    };
    this.currentSession.messages.push(userMsg);

    // Check if this is the first user message (only system message exists)
    const isFirstMessage = this.currentSession.messages.filter(m => m.role === 'user').length === 1;

    // Generate title from first user message if not set
    if (!this.sessionTitle) {
      this.sessionTitle = await this.generateTitle(userMessage, model);
    }

    // Create file immediately for first message
    if (isFirstMessage) {
      await this.createChatFile();
    }

    // Build messages for API with file contexts (but don't save to session)
    // Get messages for API (including system message)
    let apiMessages = this.currentSession.messages.filter(
      msg => msg.role !== 'system' || msg.content === SYSTEM_PROMPTS[mode]
    );

    // If files are attached, modify the last user message for API only
    if (this.currentSession.fileContexts.length > 0) {
      const fileContextsText = this.currentSession.fileContexts
        .map(fc => `[File: ${fc.path}]\n${fc.content}\n[/File]`)
        .join('\n\n');
      
      // Create modified message for API (with file contexts)
      // but keep original in session
      apiMessages = apiMessages.map((msg, index) => {
        // Modify only the last user message (the one we just added)
        if (msg.role === 'user' && index === apiMessages.length - 1) {
          return {
            ...msg,
            content: `${fileContextsText}\n\n${userMessage}`,
          };
        }
        return msg;
      });
    }

    try {
      const stream = await this.llmClient.sendMessage(
        model,
        apiMessages,
        {
          temperature: 0.7,
          maxTokens: 2000,
          stream: true,
        }
      );

      return stream;
    } catch (error) {
      if (error instanceof NetworkError || error instanceof LLMAPIError || 
          error instanceof InvalidModelError || error instanceof RateLimitError) {
        throw error;
      }
      throw new Error(`Failed to send message: ${error}`);
    }
  }

  appendAssistantMessage(content: string): void {
    if (!this.currentSession) return;

    const lastMessage = this.currentSession.messages[this.currentSession.messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      lastMessage.content += content;
    } else {
      this.currentSession.messages.push({
        role: 'assistant',
        content,
        timestamp: Date.now(),
      });
    }
  }

  getCurrentSession(): ChatSession | null {
    return this.currentSession;
  }

  removeMessagesAfterIndex(messageIndex: number): void {
    if (!this.currentSession) {
      return;
    }

    // Find the actual index in messages array (accounting for system message)
    // messageIndex is the index in displayMessages (without system), so we need to add 1
    const actualIndex = messageIndex + 1; // +1 for system message
    
    // Keep system message and messages up to and including the selected message
    this.currentSession.messages = this.currentSession.messages.slice(0, actualIndex + 1);
    
    // Clear file contexts when editing (user can re-add them if needed)
    this.currentSession.fileContexts = [];
  }

  clearSession(): void {
    this.currentSession = null;
    this.sessionTimestamp = null;
    this.currentChatFilePath = null;
  }

  async autoSaveSession(): Promise<string | null> {
    if (!this.currentSession) {
      return null;
    }

    if (!this.sessionTimestamp) {
      this.sessionTimestamp = Date.now();
    }

    const title = this.sessionTitle || 'New Chat';
    
    return await this.messageRepo.saveChatWithTimestamp(
      this.currentSession.messages,
      this.sessionTimestamp,
      title
    );
  }

  async saveSession(title?: string): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session to save');
    }

    // Use provided title, generated title, or default
    const finalTitle = title || this.sessionTitle || 'Untitled Chat';

    const now = new Date().toISOString();
    const metadata: ChatHistoryMetadata = {
      title: finalTitle,
      createdAt: now,
      lastAccessedAt: now,
    };

    return await this.messageRepo.saveChat(this.currentSession.messages, metadata);
  }

  async loadSession(filePath: string, mode: ChatMode): Promise<void> {
    const { messages, metadata } = await this.messageRepo.loadChat(filePath);
    
    // Update lastAccessedAt in the saved file
    await this.messageRepo.updateLastAccessedAt(filePath);
    
    // Restore session title from metadata
    this.sessionTitle = metadata.title;
    
    // Extract timestamp from file path
    this.sessionTimestamp = this.messageRepo.getTimestampFromPath(filePath);
    if (!this.sessionTimestamp) {
      // If we can't extract timestamp, use current time
      this.sessionTimestamp = Date.now();
    }
    
    // Restore current chat file path
    this.currentChatFilePath = filePath;
    
    // Add system message to the session using global mode
    const systemPrompt = SYSTEM_PROMPTS[mode];
    const sessionMessages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages,
    ];
    
    this.currentSession = {
      messages: sessionMessages,
      fileContexts: [],
    };
  }

  getMessageRepository(): MessageRepository {
    return this.messageRepo;
  }

  getSessionTitle(): string | null {
    return this.sessionTitle;
  }

  getCurrentChatFilePath(): string | null {
    return this.currentChatFilePath;
  }

  async updateChatFile(): Promise<void> {
    if (!this.currentSession || !this.currentChatFilePath) {
      return;
    }

    if (!this.sessionTimestamp) {
      this.sessionTimestamp = Date.now();
    }

    const title = this.sessionTitle || 'New Chat';
    
    await this.messageRepo.saveChatWithTimestamp(
      this.currentSession.messages,
      this.sessionTimestamp,
      title
    );
  }

  private async createChatFile(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    if (!this.sessionTimestamp) {
      this.sessionTimestamp = Date.now();
    }

    const title = this.sessionTitle || 'New Chat';
    
    this.currentChatFilePath = await this.messageRepo.saveChatWithTimestamp(
      this.currentSession.messages,
      this.sessionTimestamp,
      title
    );
  }

  private async generateTitle(userMessage: string, model: string): Promise<string> {
    // Clean message from markdown, file mentions, etc.
    let cleanMessage = userMessage
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links
      .replace(/`([^`]+)`/g, '$1') // Remove inline code
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/@\[\[([^\]]+)\]\]/g, '$1') // Remove file mentions
      .replace(/\[File: [^\]]+\][\s\S]*?\[\/File\]/g, '') // Remove file context blocks
      .trim();

    // Count words
    const words = cleanMessage.split(/\s+/).filter(w => w.length > 0);
    
    // If 1-2 words, use them directly
    if (words.length <= 2) {
      let title = words.join(' ');
      // Remove problematic characters for filenames
      title = title.replace(/[<>:"/\\|?*]/g, '');
      // Capitalize first letter
      if (title.length > 0) {
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }
      return title || 'Untitled Chat';
    }

    // For longer messages, use LLM to generate title
    if (!this.llmClient || !this.currentSession) {
      // Fallback to simple extraction if LLM not available
      return this.generateTitleFromMessage(userMessage);
    }

    try {
      const prompt = `Summarize the following user request in 2-5 words. Return only the summary, nothing else:\n\n${cleanMessage}`;
      const title = await this.llmClient.sendMessageNonStreaming(
        model,
        [
          {
            role: 'user',
            content: prompt,
          }
        ],
        {
          temperature: 0.3,
          maxTokens: 20,
          stream: false,
        }
      );

      // Clean and validate title
      let cleanTitle = title.trim();
      // Remove quotes if present
      cleanTitle = cleanTitle.replace(/^["']|["']$/g, '');
      // Remove problematic characters
      cleanTitle = cleanTitle.replace(/[<>:"/\\|?*]/g, '');
      // Limit length
      if (cleanTitle.length > 60) {
        cleanTitle = cleanTitle.substring(0, 57) + '...';
      }
      // Capitalize first letter
      if (cleanTitle.length > 0) {
        cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      }

      return cleanTitle || 'Untitled Chat';
    } catch (error) {
      // Fallback to simple extraction on error
      console.error('Failed to generate title with LLM:', error);
      return this.generateTitleFromMessage(userMessage);
    }
  }

  private generateTitleFromMessage(message: string): string {
    // Remove markdown links, code blocks, file mentions, etc.
    let cleanMessage = message
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove markdown links
      .replace(/`([^`]+)`/g, '$1') // Remove inline code
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/@\[\[([^\]]+)\]\]/g, '$1') // Remove file mentions
      .replace(/\[File: [^\]]+\][\s\S]*?\[\/File\]/g, '') // Remove file context blocks
      .replace(/User question:\s*/g, '') // Remove "User question:" prefix
      .trim();

    // Take first sentence or first 60 characters
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
}
