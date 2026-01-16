import { Plugin, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE } from "./constants";
import { AgentSettings, getDefaultSettings } from "./settings/model";
import { SettingsTab } from "./settings/SettingsTab";
import { AgentView } from "./components/AgentView";
import { ChatManager } from "./core/ChatManager";
import { MessageRepository } from "./core/MessageRepository";

export default class SGRPlugin extends Plugin {
  settings: AgentSettings;
  private chatManager: ChatManager | null = null;
  private messageRepo: MessageRepository | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new SettingsTab(this.app, this));

    this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new AgentView(leaf, this));

    this.addRibbonIcon("message-square", "Open SGR Agent", () => {
      this.activateView();
    });

    this.initializeServices();
  }

  async onunload(): Promise<void> {
    // Cleanup if needed
  }

  async loadSettings(): Promise<void> {
    const loadedData = await this.loadData();
    // Handle case when no data exists (first load or after clear)
    this.settings = Object.assign({}, getDefaultSettings(), loadedData || {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  initializeServices(): void {
    this.messageRepo = new MessageRepository(
      this.app,
      this.settings.chatHistoryFolder
    );

    if (this.settings.baseUrl && this.settings.apiKey) {
      this.chatManager = new ChatManager(
        this.messageRepo,
        this.app,
        this.settings.baseUrl,
        this.settings.apiKey,
        this.settings.proxy
      );
    }
  }

  updateLLMClient(): void {
    if (this.settings.baseUrl && this.settings.apiKey) {
      if (!this.chatManager) {
        this.initializeServices();
      } else {
        this.chatManager.updateClient(
          this.settings.baseUrl,
          this.settings.apiKey,
          this.settings.proxy
        );
      }
    } else {
      this.chatManager = null;
    }
    // Update all open views when ChatManager state changes
    this.updateViews();
  }

  updateMessageRepository(): void {
    this.messageRepo = new MessageRepository(
      this.app,
      this.settings.chatHistoryFolder
    );
    if (this.chatManager) {
      // Update chat manager's message repo reference
      (this.chatManager as any).messageRepo = this.messageRepo;
    }
  }

  getChatManager(): ChatManager | null {
    return this.chatManager;
  }

  private updateViews(): void {
    // Update all open AgentView instances when ChatManager state changes
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      if (leaf.view instanceof AgentView) {
        // Re-open the view to refresh its content
        leaf.view.onOpen();
      }
    }
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
