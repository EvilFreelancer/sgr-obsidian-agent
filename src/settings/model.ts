import { DEFAULT_SETTINGS } from "../constants";

import { ChatMode } from "../constants";

export interface AgentSettings {
  baseUrl: string;
  apiKey: string;
  proxy?: string;
  defaultModel: string;
  defaultMode: ChatMode;
  temperature: number;
  maxTokens: number;
  chatHistoryFolder: string;
}

export function getDefaultSettings(): AgentSettings {
  return { ...DEFAULT_SETTINGS };
}

export function validateSettings(settings: Partial<AgentSettings>): string[] {
  const errors: string[] = [];

  if (!settings.baseUrl || settings.baseUrl.trim() === "") {
    errors.push("Base URL is required");
  }

  if (!settings.apiKey || settings.apiKey.trim() === "") {
    errors.push("API Key is required");
  }

  if (settings.temperature !== undefined && (settings.temperature < 0 || settings.temperature > 2)) {
    errors.push("Temperature must be between 0 and 2");
  }

  if (settings.maxTokens !== undefined && settings.maxTokens < 1) {
    errors.push("Max tokens must be greater than 0");
  }

  return errors;
}
