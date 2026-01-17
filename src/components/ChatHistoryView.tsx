import React from "react";
import { createRoot, Root } from "react-dom/client";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_HISTORY } from "../constants";
import { ChatHistory } from "./ChatHistory";
import { MessageRepository } from "../core/MessageRepository";
import SGRPlugin from "../main";

export class ChatHistoryView extends ItemView {
  plugin: SGRPlugin;
  root: Root | null = null;
  private refreshFn: (() => Promise<void>) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: SGRPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_HISTORY;
  }

  getDisplayText(): string {
    return "Chat History";
  }

  getIcon(): string {
    return "history";
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    
    // Clean up existing React root if view is being reopened
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    
    contentEl.empty();
    contentEl.addClass("sgr-agent-view");

    const messageRepo = this.plugin.messageRepo;
    if (!messageRepo) {
      const errorContainer = contentEl.createDiv({
        cls: "sgr-error-message",
      });
      
      errorContainer.createDiv({
        text: "Message repository not initialized.",
      });
      
      return;
    }

    // Normalize folder path for event matching
    const chatHistoryFolder = messageRepo.getFolderPath();
    const normalizedFolder = chatHistoryFolder.startsWith('/') 
      ? chatHistoryFolder.slice(1) 
      : chatHistoryFolder;
    const folderPath = normalizedFolder.endsWith('/') 
      ? normalizedFolder 
      : normalizedFolder + '/';

    const refreshList = () => {
      if (this.refreshFn) {
        this.refreshFn();
      }
    };

    // Register vault events to refresh list when chat files change
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (file.path.startsWith(folderPath) && file.path.endsWith('.json')) {
          refreshList();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file.path.startsWith(folderPath) && file.path.endsWith('.json')) {
          refreshList();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (file.path.startsWith(folderPath) && file.path.endsWith('.json')) {
          refreshList();
        }
      })
    );

    this.root = createRoot(contentEl);
    this.root.render(
      <ChatHistory
        messageRepo={messageRepo}
        onLoadChat={async (filePath: string) => {
          const chatManager = this.plugin.getChatManager();
          if (chatManager) {
            await chatManager.loadSession(filePath);
            // Save last chat path to settings
            this.plugin.settings.lastChatPath = filePath;
            await this.plugin.saveSettings();
          }
          // Switch back to main chat view and update it
          await this.plugin.activateView();
          // Update all open AgentView instances to reflect loaded session
          this.plugin.updateViews();
        }}
        onDeleteChat={async (filePath: string) => {
          const chatManager = this.plugin.getChatManager();
          if (chatManager) {
            const currentChatFilePath = chatManager.getCurrentChatFilePath();
            // If deleting current chat, clear session and start new empty one
            if (currentChatFilePath === filePath) {
              const mode = this.plugin.settings.defaultMode;
              const model = this.plugin.settings.defaultModel;
              chatManager.clearSession();
              if (model) {
                chatManager.startSession(mode, model);
              }
              // Clear last chat path if deleting current chat
              this.plugin.settings.lastChatPath = undefined;
              await this.plugin.saveSettings();
              // Update views to show new empty chat
              this.plugin.updateViews();
            } else if (this.plugin.settings.lastChatPath === filePath) {
              // If deleting the last opened chat, clear lastChatPath
              this.plugin.settings.lastChatPath = undefined;
              await this.plugin.saveSettings();
            }
          }
        }}
        onBack={() => {
          this.plugin.activateView();
        }}
        onRefresh={(refreshFn) => {
          this.refreshFn = refreshFn;
        }}
      />
    );
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }
}
