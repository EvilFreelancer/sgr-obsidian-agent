import { App, TFile } from "obsidian";
import { ChatMessage, ChatHistoryMetadata } from "../types";

export class MessageRepository {
  private app: App;
  private folderPath: string;

  constructor(app: App, folderPath: string) {
    this.app = app;
    this.folderPath = folderPath;
  }

  async saveChat(
    messages: ChatMessage[],
    metadata: ChatHistoryMetadata
  ): Promise<string> {
    await this.ensureFolderExists();

    const fileName = `${this.sanitizeFileName(metadata.title)}.json`;
    const filePath = `${this.folderPath}/${fileName}`;

    // Save in OpenAI protocol format (JSON)
    const chatData = {
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      metadata: {
        title: metadata.title,
        createdAt: metadata.createdAt,
        lastAccessedAt: metadata.lastAccessedAt,
        model: metadata.model,
        mode: metadata.mode,
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

  async loadChat(filePath: string): Promise<{ messages: ChatMessage[]; metadata: ChatHistoryMetadata }> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await this.app.vault.read(file);
    
    try {
      const chatData = JSON.parse(content);
      
      if (!chatData.messages || !Array.isArray(chatData.messages)) {
        throw new Error('Invalid chat file format: missing messages array');
      }
      
      if (!chatData.metadata) {
        throw new Error('Invalid chat file format: missing metadata');
      }

      const messages: ChatMessage[] = chatData.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      }));

      return {
        messages,
        metadata: chatData.metadata as ChatHistoryMetadata,
      };
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
          chats.push({ path: file.path, metadata: chatData.metadata as ChatHistoryMetadata });
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
      
      if (!chatData.metadata) {
        throw new Error('Invalid chat file format: missing metadata');
      }

      // Update lastAccessedAt
      chatData.metadata.lastAccessedAt = new Date().toISOString();

      const updatedContent = JSON.stringify(chatData, null, 2);
      await this.app.vault.modify(file, updatedContent);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid chat file format: not valid JSON');
      }
      throw error;
    }
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
