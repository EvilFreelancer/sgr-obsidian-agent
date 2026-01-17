import { LLMClient, NetworkError, LLMAPIError, InvalidModelError, RateLimitError } from "./LLMClient";
import { MessageRepository } from "./MessageRepository";
import { AgentManager } from "./AgentManager";
import { ChatMessage, FileContext, ChatHistoryMetadata } from "../types";
import { ChatMode } from "../constants";
import { App, TFile } from "obsidian";

export interface ChatSession {
  messages: ChatMessage[];
  fileContexts: FileContext[];
}

export class ChatManager {
  private llmClient: LLMClient | null = null;
  private agentManager: AgentManager | null = null;
  private messageRepo: MessageRepository;
  private app: App;
  private currentSession: ChatSession | null = null;
  private sessionTitle: string | null = null;
  private sessionTimestamp: number | null = null;
  private currentChatFilePath: string | null = null;
  private currentModel: string = "";
  private currentTemperature: number = 0.7;
  private currentMaxTokens: number = 2000;
  private currentTavilyApiKey: string | undefined = undefined;

  constructor(
    messageRepo: MessageRepository,
    app: App,
    baseUrl: string,
    apiKey: string,
    proxy?: string,
    model?: string,
    temperature?: number,
    maxTokens?: number,
    tavilyApiKey?: string
  ) {
    this.messageRepo = messageRepo;
    this.app = app;
    this.currentModel = model || "";
    this.currentTemperature = temperature ?? 0.7;
    this.currentMaxTokens = maxTokens ?? 2000;
    this.currentTavilyApiKey = tavilyApiKey;
    this.updateClient(baseUrl, apiKey, proxy, model, temperature, maxTokens, tavilyApiKey);
  }

  updateClient(
    baseUrl: string,
    apiKey: string,
    proxy?: string,
    model?: string,
    temperature?: number,
    maxTokens?: number,
    tavilyApiKey?: string
  ): void {
    if (baseUrl && apiKey) {
      this.llmClient = new LLMClient(baseUrl, apiKey, proxy);
      this.currentModel = model || this.currentModel || "";
      this.currentTemperature = temperature ?? this.currentTemperature;
      this.currentMaxTokens = maxTokens ?? this.currentMaxTokens;
      this.currentTavilyApiKey = tavilyApiKey;
      this.agentManager = new AgentManager(
        baseUrl,
        apiKey,
        proxy,
        this.currentModel,
        this.currentTemperature,
        this.currentMaxTokens,
        this.currentTavilyApiKey,
        false // enableWebSearch - will be set per request
      );
    } else {
      this.llmClient = null;
      this.agentManager = null;
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
    // System prompts are now handled by the agent library
  }

  updateMode(newMode: ChatMode): void {
    // Mode is used when executing agent, no need to update system message
    // System prompts are now handled by the agent library
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

  async sendMessage(
    userMessage: string,
    model: string,
    mode: ChatMode,
    enableWebSearch: boolean = false
  ): Promise<AsyncIterable<string>> {
    if (!this.agentManager) {
      throw new Error('Agent not initialized. Please check your settings.');
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

    // Check if this is the first user message
    const isFirstMessage = this.currentSession.messages.filter(m => m.role === 'user').length === 1;

    // Generate title from first user message if not set
    if (!this.sessionTitle) {
      this.sessionTitle = await this.generateTitle(userMessage, model);
    }

    // Create file immediately for first message
    if (isFirstMessage) {
      await this.createChatFile();
    }

    try {
      // Use AgentManager to execute agent
      const stream = await this.agentManager.executeAgent(
        userMessage,
        mode,
        this.currentSession.fileContexts,
        enableWebSearch,
        this.currentTavilyApiKey
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

    // messageIndex is the index in displayMessages (without system)
    // No system message anymore, so use index directly
    const actualIndex = messageIndex;
    
    // Keep messages up to and including the selected message
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
    
    // Restore current chat file path
    this.currentChatFilePath = filePath;
    
    // System prompts are now handled by the agent library
    // No need to add system message
    this.currentSession = {
      messages: messages,
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
