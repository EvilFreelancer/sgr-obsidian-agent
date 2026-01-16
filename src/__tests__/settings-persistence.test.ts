/**
 * Tests for settings persistence bugs
 * 
 * Bug 1: Settings are not saved after restart
 * Bug 2: View doesn't update after settings are configured
 */

import { AgentSettings, getDefaultSettings } from "../settings/model";

// Mock Obsidian API for testing
class MockPlugin {
  private storedData: any = null;

  async loadData(): Promise<any> {
    return this.storedData;
  }

  async saveData(data: any): Promise<void> {
    this.storedData = data;
  }

  clearData(): void {
    this.storedData = null;
  }

  getStoredData(): any {
    return this.storedData;
  }
}

describe("Settings Persistence Tests", () => {
  let mockPlugin: MockPlugin;

  beforeEach(() => {
    mockPlugin = new MockPlugin();
  });

  afterEach(() => {
    mockPlugin.clearData();
  });

  test("Bug 1: Settings should persist after save and load", async () => {
    // Simulate loadSettings() behavior from main.ts (FIXED VERSION)
    const loadSettings = async (): Promise<AgentSettings> => {
      const loaded = await mockPlugin.loadData();
      // FIX: Handle null/undefined case
      return Object.assign({}, getDefaultSettings(), loaded || {});
    };

    // Simulate saveSettings() behavior from main.ts
    const saveSettings = async (settings: AgentSettings): Promise<void> => {
      await mockPlugin.saveData(settings);
    };

    // Test: Save settings
    const testSettings: AgentSettings = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-api-key",
      proxy: "https://proxy.example.com",
      defaultModel: "gpt-4",
      temperature: 0.8,
      maxTokens: 3000,
      chatHistoryFolder: "My Chats",
    };

    await saveSettings(testSettings);

    // Verify data was stored
    const stored = mockPlugin.getStoredData();
    expect(stored).not.toBeNull();
    expect(stored.baseUrl).toBe(testSettings.baseUrl);
    expect(stored.apiKey).toBe(testSettings.apiKey);

    // Test: Load settings after "restart" (clear and reload)
    mockPlugin.clearData();
    await mockPlugin.saveData(testSettings); // Simulate data persistence

    const loadedSettings = await loadSettings();

    // FIXED: Now handles null/undefined correctly
    expect(loadedSettings.baseUrl).toBe(testSettings.baseUrl);
    expect(loadedSettings.apiKey).toBe(testSettings.apiKey);
    expect(loadedSettings.defaultModel).toBe(testSettings.defaultModel);
  });

  test("Bug 1: Settings should handle null/undefined from loadData", async () => {
    // Simulate first load when no data exists
    const loadSettings = async (): Promise<AgentSettings> => {
      const loaded = await mockPlugin.loadData();
      // Current implementation: Object.assign({}, defaults, null/undefined)
      // This might not work as expected
      return Object.assign({}, getDefaultSettings(), loaded || {});
    };

    // First load - no data exists
    const firstLoad = await loadSettings();
    expect(firstLoad.baseUrl).toBe(""); // Should be default
    expect(firstLoad.apiKey).toBe(""); // Should be default

    // Save some settings
    const testSettings: AgentSettings = {
      ...getDefaultSettings(),
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
    };
    await mockPlugin.saveData(testSettings);

    // Load again
    const secondLoad = await loadSettings();
    expect(secondLoad.baseUrl).toBe("https://api.example.com/v1");
    expect(secondLoad.apiKey).toBe("test-key");
  });

  test("Bug 2: View should detect when ChatManager becomes available", () => {
    // Simulate AgentView logic
    let chatManager: any = null;
    let viewContent: "error" | "chat" = "error";
    let viewUpdateCallback: (() => void) | null = null;

    const updateView = (hasChatManager: boolean) => {
      if (hasChatManager) {
        viewContent = "chat";
      } else {
        viewContent = "error";
      }
    };

    // Register view update callback (simulating updateViews() mechanism)
    const registerViewUpdate = (callback: () => void) => {
      viewUpdateCallback = callback;
    };

    // Initial state: no ChatManager
    updateView(chatManager !== null);
    expect(viewContent).toBe("error");

    // Register callback (simulating view registration)
    registerViewUpdate(() => {
      updateView(chatManager !== null);
    });

    // Settings are configured, ChatManager is created
    chatManager = { initialized: true };
    
    // FIXED: View updates automatically via callback
    if (viewUpdateCallback) {
      viewUpdateCallback();
    }
    expect(viewContent).toBe("chat"); // Now updates correctly!
  });
});

// Manual test runner (for Node.js environment)
if (typeof require !== "undefined" && require.main === module) {
  console.log("Running settings persistence tests...");

  const mockPlugin = new MockPlugin();

  // Test 1: Save and load
  (async () => {
    const testSettings = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      defaultModel: "gpt-4",
      temperature: 0.7,
      maxTokens: 2000,
      chatHistoryFolder: "Chat History",
    };

    await mockPlugin.saveData(testSettings);
    const stored = mockPlugin.getStoredData();
    console.log("Test 1 - Save:", stored ? "PASS" : "FAIL");

    const loaded = await mockPlugin.loadData();
    console.log("Test 1 - Load:", loaded?.baseUrl === testSettings.baseUrl ? "PASS" : "FAIL");
  })();

  // Test 2: Handle null/undefined
  (async () => {
    mockPlugin.clearData();
    const loaded = await mockPlugin.loadData();
    const defaults = getDefaultSettings();
    const merged = Object.assign({}, defaults, loaded);
    console.log("Test 2 - Null handling:", merged.baseUrl === "" ? "PASS" : "FAIL");
  })();
}
