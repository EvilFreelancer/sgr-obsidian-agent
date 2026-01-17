import React from "react";
import { createRoot, Root } from "react-dom/client";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE } from "../constants";
import { Chat } from "./Chat";
import { ChatManager } from "../core/ChatManager";
import { MessageRepository } from "../core/MessageRepository";
import SGRPlugin from "../main";

export class AgentView extends ItemView {
  plugin: SGRPlugin;
  root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: SGRPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return "SGR Agent";
  }

  getIcon(): string {
    return "message-square";
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

    const chatManager = this.plugin.getChatManager();
    if (!chatManager) {
      const errorContainer = contentEl.createDiv({
        cls: "sgr-error-message",
      });
      
      errorContainer.createDiv({
        text: "Please configure API settings in plugin settings first.",
      });
      
      const buttonContainer = errorContainer.createDiv({
        cls: "sgr-error-message-actions",
      });
      
      const button = buttonContainer.createEl("button", {
        text: "Open Settings",
        cls: "sgr-button sgr-button-primary",
      });
      
      button.addEventListener("click", () => {
        (this.app as any).setting.open();
        (this.app as any).setting.openTabById(this.plugin.manifest.id);
      });
      
      return;
    }

    // Try to load last chat if exists
    const lastChatPath = this.plugin.settings.lastChatPath;
    if (lastChatPath && this.plugin.messageRepo) {
      try {
        // Check if file exists
        const file = this.app.vault.getAbstractFileByPath(lastChatPath);
        if (file) {
          // Load the last chat
          const mode = this.plugin.settings.defaultMode;
          await chatManager.loadSession(lastChatPath, mode);
        } else {
          // File doesn't exist, clear lastChatPath
          this.plugin.settings.lastChatPath = undefined;
          await this.plugin.saveSettings();
        }
      } catch (error) {
        console.error("Failed to load last chat:", error);
        // Clear invalid lastChatPath
        this.plugin.settings.lastChatPath = undefined;
        await this.plugin.saveSettings();
      }
    }

    this.root = createRoot(contentEl);
    this.root.render(
      <Chat
        chatManager={chatManager}
        app={this.app}
        baseUrl={this.plugin.settings.baseUrl}
        apiKey={this.plugin.settings.apiKey}
        proxy={this.plugin.settings.proxy}
        defaultModel={this.plugin.settings.defaultModel}
        defaultMode={this.plugin.settings.defaultMode}
        onModeChange={async (mode) => {
          this.plugin.settings.defaultMode = mode;
          await this.plugin.saveSettings();
        }}
        onModelChange={async (model) => {
          this.plugin.settings.defaultModel = model;
          await this.plugin.saveSettings();
        }}
        onOpenSettings={() => {
          (this.app as any).setting.open();
          (this.app as any).setting.openTabById(this.plugin.manifest.id);
        }}
        onOpenHistory={async () => {
          await this.plugin.activateHistoryView();
        }}
        onNewChat={async () => {
          // Clear last chat path when starting new chat
          this.plugin.settings.lastChatPath = undefined;
          await this.plugin.saveSettings();
        }}
        onChatFileCreated={async (filePath: string) => {
          // Save last chat path when chat file is created
          this.plugin.settings.lastChatPath = filePath;
          await this.plugin.saveSettings();
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
