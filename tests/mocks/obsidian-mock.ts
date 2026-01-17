// Virtual module for obsidian - provides type-safe mocks
// This file is used as an alias for 'obsidian' in tests

export class App {
  vault: any;
  workspace: any;
  constructor() {
    this.vault = {} as any;
    this.workspace = {} as any;
  }
}

export class Plugin {
  app: App;
  constructor(app: App) {
    this.app = app;
  }
}

export class TFile {
  path: string;
  basename: string;
  extension: string;
  constructor(path: string) {
    this.path = path;
    const parts = path.split('/');
    const fileName = parts[parts.length - 1];
    const dotIndex = fileName.lastIndexOf('.');
    this.basename = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;
    this.extension = dotIndex > 0 ? fileName.substring(dotIndex + 1) : '';
  }
}

export class TFolder {
  path: string;
  constructor(path: string) {
    this.path = path;
  }
}

export class ItemView {
  // Minimal implementation for tests
}

export class PluginSettingTab {
  // Minimal implementation for tests
}

// Export other commonly used types as empty classes/interfaces
export type WorkspaceLeaf = any;
export type Component = any;
export type MarkdownView = any;
export type Editor = any;
