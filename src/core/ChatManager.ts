import { LLMClient, NetworkError, LLMAPIError, InvalidModelError, RateLimitError } from "./LLMClient";
import { MessageRepository } from "./MessageRepository";
import { AgentManager } from "./AgentManager";
import { ChatMessage, FileContext, ChatHistoryMetadata, ToolCall } from "../types";
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
      // Try to parse JSON from accumulated content
      this.parseAndUpdateToolCalls(lastMessage);
    } else {
      const newMessage: ChatMessage = {
        role: 'assistant',
        content,
        timestamp: Date.now(),
      };
      this.currentSession.messages.push(newMessage);
      // Try to parse JSON from content
      this.parseAndUpdateToolCalls(newMessage);
    }
  }

  private parseAndUpdateToolCalls(message: ChatMessage): void {
    // Try to find JSON objects in the content
    // Pattern: { "reasoningSteps": ..., "function": { "toolName": ..., "arguments": ... } }
    // Use a more robust approach to find complete JSON objects
    const jsonMatches = this.extractJSONObjects(message.content);
    
    if (jsonMatches.length === 0) {
      // If no JSON found but toolCalls exist, they were loaded from history - keep them
      return;
    }

    // Initialize toolCalls array if not exists
    if (!message.toolCalls) {
      message.toolCalls = [];
    }

    // Track which JSON strings we've already processed (by checking rawJson)
    const processedJsonStrings = new Set(message.toolCalls.map(tc => tc.rawJson).filter(Boolean));

    // Process each JSON match
    for (const jsonStr of jsonMatches) {
      // Skip if we've already processed this exact JSON (from saved toolCalls)
      if (processedJsonStrings.has(jsonStr)) {
        continue;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        
        // Check if this is a tool call JSON
        if (parsed.function && parsed.function.toolName) {
          const toolName = parsed.function.toolName;
          const toolArgs = parsed.function.arguments || '{}';
          
          // Check if this tool call already exists (by toolName and similar JSON structure)
          const existingCall = message.toolCalls!.find(
            tc => tc.toolName === toolName && 
            this.isSimilarJSON(tc.rawJson || '', jsonStr)
          );
          
          if (!existingCall) {
            // New tool call - use timestamp from message if available, otherwise current time
            const startTime = message.timestamp || Date.now();
            const toolCall: ToolCall = {
              toolName,
              arguments: typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs),
              startTime,
              rawJson: jsonStr,
            };
            message.toolCalls.push(toolCall);
            processedJsonStrings.add(jsonStr);
          } else {
            // Update existing tool call with latest JSON
            // Preserve original startTime if it exists
            if (!existingCall.startTime) {
              existingCall.startTime = message.timestamp || Date.now();
            }
            existingCall.rawJson = jsonStr;
            existingCall.arguments = typeof toolArgs === 'string' ? toolArgs : JSON.stringify(toolArgs);
            // Only update endTime if it's not already set (from saved data)
            if (!existingCall.endTime) {
              existingCall.endTime = Date.now();
              existingCall.duration = existingCall.endTime - existingCall.startTime;
            }
            processedJsonStrings.add(jsonStr);
          }

          // Extract final answer if this is final_answer tool
          if (toolName === 'final_answer') {
            this.extractFinalAnswer(parsed, message);
          }
        }
      } catch (e) {
        // Skip invalid JSON
        continue;
      }
    }
  }

  private extractJSONObjects(content: string): string[] {
    const results: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        if (depth === 0) {
          start = i;
        }
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const jsonStr = content.substring(start, i + 1);
          // Check if this looks like a tool call JSON
          if (jsonStr.includes('"function"') && jsonStr.includes('"toolName"')) {
            results.push(jsonStr);
          }
          start = -1;
        }
      }
    }

    return results;
  }

  private isSimilarJSON(json1: string, json2: string): boolean {
    try {
      const obj1 = JSON.parse(json1);
      const obj2 = JSON.parse(json2);
      return obj1.function?.toolName === obj2.function?.toolName;
    } catch {
      return false;
    }
  }

  private extractFinalAnswer(parsed: any, message: ChatMessage): void {
    if (!parsed.function) {
      return;
    }

    try {
      // For final_answer, read from currentSituation field at the top level of JSON
      if (parsed.currentSituation && typeof parsed.currentSituation === 'string') {
        message.finalAnswer = parsed.currentSituation;
        return;
      }

      // Fallback: try to read from function.arguments if currentSituation is not available
      if (!parsed.function.arguments) {
        return;
      }

      let args = parsed.function.arguments;
      
      // If arguments is a string, try to parse it
      if (typeof args === 'string') {
        args = JSON.parse(args);
      }

      // If args is an object, look for answer field
      if (typeof args === 'object' && args !== null) {
        if (args.answer) {
          message.finalAnswer = typeof args.answer === 'string' ? args.answer : JSON.stringify(args.answer);
        } else if (args.content) {
          message.finalAnswer = typeof args.content === 'string' ? args.content : JSON.stringify(args.content);
        } else if (args.text) {
          message.finalAnswer = typeof args.text === 'string' ? args.text : JSON.stringify(args.text);
        } else if (args.message) {
          message.finalAnswer = typeof args.message === 'string' ? args.message : JSON.stringify(args.message);
        }
      }
    } catch (e) {
      // Skip extraction errors
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
    
    // Parse toolCalls from messages that don't have them (for backward compatibility)
    // This handles old chat history that was saved before toolCalls were added
    // Also re-parse messages that have toolCalls but might be missing some data
    const processedMessages = messages.map(msg => {
      if (msg.role === 'assistant') {
        const processedMsg = { ...msg };
        // If toolCalls exist but are incomplete, or if content has JSON but no toolCalls,
        // re-parse to ensure toolCalls are complete and up-to-date
        // This handles cases where:
        // 1. Old messages were saved before toolCalls were added
        // 2. toolCalls were partially saved or missing
        // 3. Content has JSON that wasn't parsed into toolCalls
        if (!processedMsg.toolCalls || processedMsg.toolCalls.length === 0 || 
            processedMsg.content.includes('"function"') && processedMsg.content.includes('"toolName"')) {
          this.parseAndUpdateToolCalls(processedMsg);
        }
        return processedMsg;
      }
      return msg;
    });
    
    // System prompts are now handled by the agent library
    // No need to add system message
    this.currentSession = {
      messages: processedMessages,
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
