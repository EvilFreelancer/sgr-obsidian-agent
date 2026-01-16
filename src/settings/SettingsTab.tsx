import { App, PluginSettingTab, Setting } from "obsidian";
import SGRPlugin from "../main";
import { AgentSettings, validateSettings } from "./model";

export class SettingsTab extends PluginSettingTab {
  plugin: SGRPlugin;

  constructor(app: App, plugin: SGRPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "SGR Obsidian Agent Settings" });

    // Base URL
    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("Base URL for OpenAI-compatible API")
      .addText((text) =>
        text
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value;
            await this.plugin.saveSettings();
            this.plugin.updateLLMClient();
          })
      );

    // API Key
    new Setting(containerEl)
      .setName("API Key")
      .setDesc("API key for authentication")
      .addText((text) => {
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .inputEl.type = "password";
        text.onChange(async (value) => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
          this.plugin.updateLLMClient();
        });
      });

    // Proxy (optional)
    new Setting(containerEl)
      .setName("Proxy URL")
      .setDesc("Optional proxy URL for API requests")
      .addText((text) =>
        text
          .setPlaceholder("https://proxy.example.com")
          .setValue(this.plugin.settings.proxy || "")
          .onChange(async (value) => {
            this.plugin.settings.proxy = value || undefined;
            await this.plugin.saveSettings();
            this.plugin.updateLLMClient();
          })
      );

    // Default Model
    new Setting(containerEl)
      .setName("Default Model")
      .setDesc("Default model to use for chat")
      .addText((text) =>
        text
          .setPlaceholder("gpt-4")
          .setValue(this.plugin.settings.defaultModel)
          .onChange(async (value) => {
            this.plugin.settings.defaultModel = value;
            await this.plugin.saveSettings();
          })
      );

    // Temperature
    new Setting(containerEl)
      .setName("Temperature")
      .setDesc("Temperature for model responses (0-2)")
      .addSlider((slider) =>
        slider
          .setLimits(0, 2, 0.1)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          })
      );

    // Max Tokens
    new Setting(containerEl)
      .setName("Max Tokens")
      .setDesc("Maximum number of tokens in response")
      .addText((text) =>
        text
          .setPlaceholder("2000")
          .setValue(this.plugin.settings.maxTokens.toString())
          .onChange(async (value) => {
            const numValue = parseInt(value);
            if (!isNaN(numValue) && numValue > 0) {
              this.plugin.settings.maxTokens = numValue;
              await this.plugin.saveSettings();
            }
          })
      );

    // Chat History Folder
    new Setting(containerEl)
      .setName("Chat History Folder")
      .setDesc("Folder where chat history will be saved")
      .addText((text) =>
        text
          .setPlaceholder("Chat History")
          .setValue(this.plugin.settings.chatHistoryFolder)
          .onChange(async (value) => {
            this.plugin.settings.chatHistoryFolder = value;
            await this.plugin.saveSettings();
            this.plugin.updateMessageRepository();
          })
      );
  }
}
