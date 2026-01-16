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

    const fileName = `${this.sanitizeFileName(metadata.title)}.md`;
    const filePath = `${this.folderPath}/${fileName}`;

    const frontmatter = `---
title: "${metadata.title}"
createdAt: "${metadata.createdAt}"
lastAccessedAt: "${metadata.lastAccessedAt}"
model: "${metadata.model}"
mode: "${metadata.mode}"
---

`;

    let content = frontmatter;
    for (const message of messages) {
      if (message.role === 'system') continue;
      const roleLabel = message.role === 'user' ? 'User' : 'Assistant';
      content += `## ${roleLabel}\n${message.content}\n\n`;
    }

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
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    
    if (!frontmatterMatch) {
      throw new Error('Invalid chat file format: missing frontmatter');
    }

    const frontmatter = this.parseFrontmatter(frontmatterMatch[1]);
    const body = content.slice(frontmatterMatch[0].length);

    const messages: ChatMessage[] = [];
    const sections = body.split(/^## (User|Assistant)\n/gm).filter(Boolean);

    for (let i = 0; i < sections.length; i += 2) {
      const roleLabel = sections[i];
      const content = sections[i + 1]?.trim() || '';
      
      if (roleLabel === 'User' || roleLabel === 'Assistant') {
        messages.push({
          role: roleLabel.toLowerCase() as 'user' | 'assistant',
          content,
        });
      }
    }

    return {
      messages,
      metadata: frontmatter,
    };
  }

  async listChats(): Promise<Array<{ path: string; metadata: ChatHistoryMetadata }>> {
    await this.ensureFolderExists();

    const files = this.app.vault.getMarkdownFiles().filter(
      file => file.path.startsWith(this.folderPath + '/')
    );

    const chats = [];
    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        if (frontmatterMatch) {
          const metadata = this.parseFrontmatter(frontmatterMatch[1]);
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

  async deleteChat(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      await this.app.vault.delete(file);
    }
  }

  private async ensureFolderExists(): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
    if (!folder) {
      await this.app.vault.createFolder(this.folderPath);
    }
  }

  private parseFrontmatter(frontmatter: string): ChatHistoryMetadata {
    const metadata: any = {};
    for (const line of frontmatter.split('\n')) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const key = match[1];
        const value = match[2].replace(/^["']|["']$/g, '');
        metadata[key] = value;
      }
    }
    return metadata as ChatHistoryMetadata;
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .substring(0, 100);
  }
}
