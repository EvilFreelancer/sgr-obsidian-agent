import { LLMClient, NetworkError, LLMAPIError, InvalidModelError, RateLimitError } from "./LLMClient";
import { MessageRepository } from "./MessageRepository";
import { ChatMessage, FileContext } from "../types";
import { ChatMode, SYSTEM_PROMPTS } from "../constants";
import { App, TFile } from "obsidian";

export interface ChatSession {
  messages: ChatMessage[];
  mode: ChatMode;
  model: string;
  fileContexts: FileContext[];
}

export class ChatManager {
  private llmClient: LLMClient | null = null;
  private messageRepo: MessageRepository;
  private app: App;
  private currentSession: ChatSession | null = null;
  private sessionTitle: string | null = null;
  private sessionTimestamp: number | null = null;

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
      mode,
      model,
      fileContexts: [],
    };
    this.sessionTitle = null;
    this.sessionTimestamp = Date.now();

    // Add system message
    const systemPrompt = SYSTEM_PROMPTS[mode];
    this.currentSession.messages.push({
      role: 'system',
      content: systemPrompt,
    });
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

  async sendMessage(userMessage: string): Promise<AsyncIterable<string>> {
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

    // Generate title from first user message if not set
    if (!this.sessionTitle) {
      this.sessionTitle = this.generateTitleFromMessage(userMessage);
    }

    // Build messages for API with file contexts (but don't save to session)
    // Get messages for API (including system message)
    let apiMessages = this.currentSession.messages.filter(
      msg => msg.role !== 'system' || msg.content === SYSTEM_PROMPTS[this.currentSession!.mode]
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
        this.currentSession.model,
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

  clearSession(): void {
    this.currentSession = null;
    this.sessionTimestamp = null;
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
      title,
      this.currentSession.model,
      this.currentSession.mode
    );
  }

  async saveSession(title?: string): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session to save');
    }

    // Use provided title, generated title, or default
    const finalTitle = title || this.sessionTitle || 'Untitled Chat';

    const now = new Date().toISOString();
    const metadata = {
      title: finalTitle,
      createdAt: now,
      lastAccessedAt: now,
      model: this.currentSession.model,
      mode: this.currentSession.mode,
    };

    return await this.messageRepo.saveChat(this.currentSession.messages, metadata);
  }

  async loadSession(filePath: string): Promise<void> {
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
    
    // Add system message to the session
    const systemPrompt = SYSTEM_PROMPTS[metadata.mode as ChatMode];
    const sessionMessages: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages,
    ];
    
    this.currentSession = {
      messages: sessionMessages,
      mode: metadata.mode as ChatMode,
      model: metadata.model,
      fileContexts: [],
    };
  }

  getMessageRepository(): MessageRepository {
    return this.messageRepo;
  }

  getSessionTitle(): string | null {
    return this.sessionTitle;
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
