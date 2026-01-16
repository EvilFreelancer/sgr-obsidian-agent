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

    // Build context message if files are attached
    let messageContent = userMessage;
    if (this.currentSession.fileContexts.length > 0) {
      const fileContextsText = this.currentSession.fileContexts
        .map(fc => `[File: ${fc.path}]\n${fc.content}\n[/File]`)
        .join('\n\n');
      messageContent = `${fileContextsText}\n\nUser question: ${userMessage}`;
    }

    // Add user message
    const userMsg: ChatMessage = {
      role: 'user',
      content: messageContent,
      timestamp: Date.now(),
    };
    this.currentSession.messages.push(userMsg);

    // Get messages for API (including system message)
    const apiMessages = this.currentSession.messages.filter(
      msg => msg.role !== 'system' || msg.content === SYSTEM_PROMPTS[this.currentSession!.mode]
    );

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
  }

  async saveSession(title: string): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session to save');
    }

    const now = new Date().toISOString();
    const metadata = {
      title,
      createdAt: now,
      lastAccessedAt: now,
      model: this.currentSession.model,
      mode: this.currentSession.mode,
    };

    return await this.messageRepo.saveChat(this.currentSession.messages, metadata);
  }

  async loadSession(filePath: string): Promise<void> {
    const { messages, metadata } = await this.messageRepo.loadChat(filePath);
    
    this.currentSession = {
      messages,
      mode: metadata.mode as ChatMode,
      model: metadata.model,
      fileContexts: [],
    };
  }

  getMessageRepository(): MessageRepository {
    return this.messageRepo;
  }
}
