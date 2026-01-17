import { App, TFile } from "obsidian";
import { ChatMessage, ChatHistoryMetadata } from "../types";

export interface ChatHistoryData {
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export class MessageRepository {
  private app: App;
  private folderPath: string;

  constructor(app: App, folderPath: string) {
    this.app = app;
    this.folderPath = folderPath;
  }

  getFolderPath(): string {
    return this.folderPath;
  }

  async saveChat(
    messages: ChatMessage[],
    metadata: ChatHistoryMetadata
  ): Promise<string> {
    await this.ensureFolderExists();

    const fileName = `${this.sanitizeFileName(metadata.title)}.json`;
    const filePath = `${this.folderPath}/${fileName}`;

    // Save in OpenAI protocol format (JSON)
    // Model and mode are global settings, not stored in chat file
    const chatData = {
      messages: messages.map(msg => {
        const msgData: any = {
          role: msg.role,
          content: msg.content,
        };
        if (msg.timestamp) {
          msgData.timestamp = msg.timestamp;
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          msgData.toolCalls = msg.toolCalls;
        }
        if (msg.finalAnswer) {
          msgData.finalAnswer = msg.finalAnswer;
        }
        return msgData;
      }),
      metadata: {
        title: metadata.title,
        createdAt: metadata.createdAt,
        lastAccessedAt: metadata.lastAccessedAt,
      },
    };

    const content = JSON.stringify(chatData, null, 2);

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      await this.app.vault.create(filePath, content);
    }

    return filePath;
  }

  async saveChatWithTimestamp(
    messages: ChatMessage[],
    timestamp: number,
    title: string = "New Chat"
  ): Promise<string> {
    await this.ensureFolderExists();

    const fileName = `${timestamp}.json`;
    const filePath = `${this.folderPath}/${fileName}`;

    const now = new Date().toISOString();
    
    // Check if file already exists to preserve created_at
    let created_at = now;
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile instanceof TFile) {
      try {
        const existingContent = await this.app.vault.read(existingFile);
        const existingData = JSON.parse(existingContent) as ChatHistoryData;
        if (existingData.created_at) {
          created_at = existingData.created_at;
        }
      } catch (e) {
        // If we can't read existing file, use current time
      }
    }

    const chatData: ChatHistoryData = {
      title,
      created_at,
      updated_at: now,
      messages: messages.map(msg => {
        const msgData: any = {
          role: msg.role,
          content: msg.content,
        };
        if (msg.timestamp) {
          msgData.timestamp = msg.timestamp;
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          msgData.toolCalls = msg.toolCalls;
        }
        if (msg.finalAnswer) {
          msgData.finalAnswer = msg.finalAnswer;
        }
        return msgData;
      }),
    };

    const content = JSON.stringify(chatData, null, 2);

    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(filePath, content);
    }

    return filePath;
  }

  async loadChat(filePath: string): Promise<{ messages: ChatMessage[]; metadata: ChatHistoryMetadata }> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await this.app.vault.read(file);
    
    try {
      const chatData = JSON.parse(content);
      
      // Support both old format (with metadata) and new format (with title, created_at, updated_at)
      if (chatData.metadata) {
        // Old format
        if (!chatData.messages || !Array.isArray(chatData.messages)) {
          throw new Error('Invalid chat file format: missing messages array');
        }

        const messages: ChatMessage[] = chatData.messages.map((msg: any) => {
          const message: ChatMessage = {
            role: msg.role,
            content: msg.content,
          };
          if (msg.timestamp) {
            message.timestamp = msg.timestamp;
          }
          // Properly restore toolCalls if they exist
          if (msg.toolCalls && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
            message.toolCalls = msg.toolCalls.map((tc: any) => ({
              toolName: tc.toolName,
              arguments: tc.arguments || '{}',
              startTime: tc.startTime || msg.timestamp || Date.now(),
              endTime: tc.endTime,
              duration: tc.duration,
              rawJson: tc.rawJson,
            }));
          }
          if (msg.finalAnswer) {
            message.finalAnswer = msg.finalAnswer;
          }
          return message;
        });

        return {
          messages,
          metadata: chatData.metadata as ChatHistoryMetadata,
        };
      } else if (chatData.title !== undefined && chatData.created_at !== undefined) {
        // New format
        if (!chatData.messages || !Array.isArray(chatData.messages)) {
          throw new Error('Invalid chat file format: missing messages array');
        }

        const messages: ChatMessage[] = chatData.messages.map((msg: any) => {
          const message: ChatMessage = {
            role: msg.role,
            content: msg.content,
          };
          if (msg.timestamp) {
            message.timestamp = msg.timestamp;
          }
          // Properly restore toolCalls if they exist
          if (msg.toolCalls && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
            message.toolCalls = msg.toolCalls.map((tc: any) => ({
              toolName: tc.toolName,
              arguments: tc.arguments || '{}',
              startTime: tc.startTime || msg.timestamp || Date.now(),
              endTime: tc.endTime,
              duration: tc.duration,
              rawJson: tc.rawJson,
            }));
          }
          if (msg.finalAnswer) {
            message.finalAnswer = msg.finalAnswer;
          }
          return message;
        });

        // Model and mode are global settings, not stored in file
        const metadata: ChatHistoryMetadata = {
          title: chatData.title || 'New Chat',
          createdAt: chatData.created_at,
          lastAccessedAt: chatData.updated_at || chatData.created_at,
        };

        return {
          messages,
          metadata,
        };
      } else {
        throw new Error('Invalid chat file format: unknown format');
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid chat file format: not valid JSON');
      }
      throw error;
    }
  }

  async listChats(): Promise<Array<{ path: string; metadata: ChatHistoryMetadata }>> {
    await this.ensureFolderExists();

    const allFiles = this.app.vault.getFiles();
    const jsonFiles = allFiles.filter(
      file => file.path.startsWith(this.folderPath + '/') && file.path.endsWith('.json')
    );

    const chats = [];
    for (const file of jsonFiles) {
      try {
        const content = await this.app.vault.read(file);
        const chatData = JSON.parse(content);
        
        if (chatData.metadata) {
          // Old format
          chats.push({ path: file.path, metadata: chatData.metadata as ChatHistoryMetadata });
        } else if (chatData.title !== undefined && chatData.created_at !== undefined) {
          // New format - model and mode are global settings, not stored
          const metadata: ChatHistoryMetadata = {
            title: chatData.title || 'New Chat',
            createdAt: chatData.created_at,
            lastAccessedAt: chatData.updated_at || chatData.created_at,
          };
          chats.push({ path: file.path, metadata });
        }
      } catch (e) {
        // Skip invalid files
      }
    }

    return chats.sort((a, b) => 
      new Date(b.metadata.lastAccessedAt).getTime() - 
      new Date(a.metadata.lastAccessedAt).getTime()
    );
  }

  async getLastChat(): Promise<{ path: string; metadata: ChatHistoryMetadata } | null> {
    const chats = await this.listChats();
    return chats.length > 0 ? chats[0] : null;
  }

  async deleteChat(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      await this.app.vault.delete(file);
    }
  }

  async updateLastAccessedAt(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await this.app.vault.read(file);
    
    try {
      const chatData = JSON.parse(content);
      
      if (chatData.metadata) {
        // Old format
        chatData.metadata.lastAccessedAt = new Date().toISOString();
      } else if (chatData.title !== undefined && chatData.created_at !== undefined) {
        // New format
        chatData.updated_at = new Date().toISOString();
      } else {
        throw new Error('Invalid chat file format: unknown format');
      }

      const updatedContent = JSON.stringify(chatData, null, 2);
      await this.app.vault.modify(file, updatedContent);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid chat file format: not valid JSON');
      }
      throw error;
    }
  }

  getTimestampFromPath(filePath: string): number | null {
    const fileName = filePath.split('/').pop();
    if (!fileName || !fileName.endsWith('.json')) {
      return null;
    }
    const timestampStr = fileName.replace('.json', '');
    const timestamp = parseInt(timestampStr);
    if (isNaN(timestamp)) {
      return null;
    }
    return timestamp;
  }

  private async ensureFolderExists(): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
    if (!folder) {
      await this.app.vault.createFolder(this.folderPath);
    }
  }


  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .substring(0, 100);
  }
}
