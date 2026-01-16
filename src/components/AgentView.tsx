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
    contentEl.empty();
    contentEl.addClass("sgr-agent-view");

    const chatManager = this.plugin.getChatManager();
    if (!chatManager) {
      contentEl.createDiv({
        text: "Please configure API settings in plugin settings first.",
        cls: "sgr-error-message",
      });
      return;
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
