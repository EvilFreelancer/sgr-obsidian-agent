import React from "react";
import { createRoot, Root } from "react-dom/client";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_HISTORY } from "../constants";
import { ChatHistory, ChatHistoryRef } from "./ChatHistory";
import { MessageRepository } from "../core/MessageRepository";
import SGRPlugin from "../main";

export class ChatHistoryView extends ItemView {
  plugin: SGRPlugin;
  root: Root | null = null;
  private refreshKey: number = 0;
  private chatHistoryRef: React.RefObject<ChatHistoryRef> | null = null;

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

    // Increment refresh key to trigger list refresh
    this.refreshKey++;
    this.chatHistoryRef = React.createRef<ChatHistoryRef>();
    
    // Refresh list when view becomes active
    const refreshList = () => {
      if (this.chatHistoryRef?.current) {
        this.chatHistoryRef.current.refresh();
      }
    };

    // Register workspace event to refresh when view becomes active
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        const activeLeaf = this.app.workspace.getActiveViewOfType(ChatHistoryView);
        if (activeLeaf === this) {
          refreshList();
        }
      })
    );

    // Register vault event to refresh when chat files are created/modified
    const chatHistoryFolder = this.plugin.settings.chatHistoryFolder;
    const normalizedFolder = chatHistoryFolder.startsWith('/') 
      ? chatHistoryFolder.slice(1) 
      : chatHistoryFolder;
    const folderPath = normalizedFolder.endsWith('/') 
      ? normalizedFolder 
      : normalizedFolder + '/';
    
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
        ref={this.chatHistoryRef}
        messageRepo={messageRepo}
        refreshKey={this.refreshKey}
        onLoadChat={async (filePath: string) => {
          const chatManager = this.plugin.getChatManager();
          if (chatManager) {
            // Use global settings for model and mode
            const mode = this.plugin.settings.defaultMode;
            const model = this.plugin.settings.defaultModel;
            await chatManager.loadSession(filePath, mode, model);
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
              // Update views to show new empty chat
              this.plugin.updateViews();
            }
          }
        }}
        onBack={() => {
          this.plugin.activateView();
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
