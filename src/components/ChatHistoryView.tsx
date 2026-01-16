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

    this.root = createRoot(contentEl);
    this.root.render(
      <ChatHistory
        messageRepo={messageRepo}
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
