// Mock Obsidian API for testing
import { TFile, TFolder } from './obsidian-mock';

export class MockTFile extends TFile {
  constructor(path: string) {
    super(path);
  }
}

export class MockTFolder extends TFolder {
  constructor(path: string) {
    super(path);
  }
}


export class MockVault {
  private files: Map<string, string> = new Map();
  private folders: Set<string> = new Set();

  getAbstractFileByPath(path: string): MockTFile | MockTFolder | null {
    if (this.files.has(path)) {
      return new MockTFile(path);
    }
    if (this.folders.has(path)) {
      return new MockTFolder(path);
    }
    return null;
  }

  async read(file: MockTFile): Promise<string> {
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

  async modify(file: MockTFile, content: string): Promise<void> {
    if (!this.files.has(file.path)) {
      throw new Error(`File not found: ${file.path}`);
    }
    this.files.set(file.path, content);
  }

  async delete(file: MockTFile): Promise<void> {
    this.files.delete(file.path);
  }

  async createFolder(path: string): Promise<void> {
    this.folders.add(path);
  }

  getFiles(): MockTFile[] {
    const files: MockTFile[] = [];
    for (const path of Array.from(this.files.keys())) {
      files.push(new MockTFile(path));
    }
    return files;
  }

  getMarkdownFiles(): MockTFile[] {
    const files: MockTFile[] = [];
    for (const path of Array.from(this.files.keys())) {
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

export class MockApp {
  vault: MockVault;

  constructor() {
    this.vault = new MockVault();
  }
}
