import { describe, test, expect } from 'vitest';
import { getDefaultSettings, validateSettings, AgentSettings } from '../../src/settings/model';
import { DEFAULT_SETTINGS, CHAT_MODES } from '../../src/constants';

describe('Settings Model', () => {
  describe('getDefaultSettings', () => {
    test('should return default settings', () => {
      const settings = getDefaultSettings();

      expect(settings.baseUrl).toBe(DEFAULT_SETTINGS.baseUrl);
      expect(settings.apiKey).toBe(DEFAULT_SETTINGS.apiKey);
      expect(settings.defaultModel).toBe(DEFAULT_SETTINGS.defaultModel);
      expect(settings.temperature).toBe(DEFAULT_SETTINGS.temperature);
      expect(settings.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
      expect(settings.chatHistoryFolder).toBe(DEFAULT_SETTINGS.chatHistoryFolder);
    });

    test('should return new object each time', () => {
      const settings1 = getDefaultSettings();
      const settings2 = getDefaultSettings();

      expect(settings1).not.toBe(settings2);
      expect(settings1).toEqual(settings2);
    });
  });

  describe('validateSettings', () => {
    test('should return empty array for valid settings', () => {
      const validSettings: Partial<AgentSettings> = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 2000,
      };

      const errors = validateSettings(validSettings);
      expect(errors).toEqual([]);
    });

    test('should return error for missing baseUrl', () => {
      const invalidSettings: Partial<AgentSettings> = {
        apiKey: 'test-key',
      };

      const errors = validateSettings(invalidSettings);
      expect(errors).toContain('Base URL is required');
    });

    test('should return error for empty baseUrl', () => {
      const invalidSettings: Partial<AgentSettings> = {
        baseUrl: '   ',
        apiKey: 'test-key',
      };

      const errors = validateSettings(invalidSettings);
      expect(errors).toContain('Base URL is required');
    });

    test('should return error for missing apiKey', () => {
      const invalidSettings: Partial<AgentSettings> = {
        baseUrl: 'https://api.example.com',
      };

      const errors = validateSettings(invalidSettings);
      expect(errors).toContain('API Key is required');
    });

    test('should return error for empty apiKey', () => {
      const invalidSettings: Partial<AgentSettings> = {
        baseUrl: 'https://api.example.com',
        apiKey: '   ',
      };

      const errors = validateSettings(invalidSettings);
      expect(errors).toContain('API Key is required');
    });

    test('should return error for temperature below 0', () => {
      const invalidSettings: Partial<AgentSettings> = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        temperature: -1,
      };

      const errors = validateSettings(invalidSettings);
      expect(errors).toContain('Temperature must be between 0 and 2');
    });

    test('should return error for temperature above 2', () => {
      const invalidSettings: Partial<AgentSettings> = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        temperature: 3,
      };

      const errors = validateSettings(invalidSettings);
      expect(errors).toContain('Temperature must be between 0 and 2');
    });

    test('should accept temperature at boundaries', () => {
      const settings1: Partial<AgentSettings> = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        temperature: 0,
      };

      const settings2: Partial<AgentSettings> = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        temperature: 2,
      };

      expect(validateSettings(settings1)).toEqual([]);
      expect(validateSettings(settings2)).toEqual([]);
    });

    test('should return error for maxTokens less than 1', () => {
      const invalidSettings: Partial<AgentSettings> = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        maxTokens: 0,
      };

      const errors = validateSettings(invalidSettings);
      expect(errors).toContain('Max tokens must be greater than 0');
    });

    test('should return error for negative maxTokens', () => {
      const invalidSettings: Partial<AgentSettings> = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        maxTokens: -1,
      };

      const errors = validateSettings(invalidSettings);
      expect(errors).toContain('Max tokens must be greater than 0');
    });

    test('should return multiple errors', () => {
      const invalidSettings: Partial<AgentSettings> = {
        baseUrl: '',
        apiKey: '',
        temperature: 5,
        maxTokens: -1,
      };

      const errors = validateSettings(invalidSettings);
      expect(errors.length).toBeGreaterThan(1);
      expect(errors).toContain('Base URL is required');
      expect(errors).toContain('API Key is required');
      expect(errors).toContain('Temperature must be between 0 and 2');
      expect(errors).toContain('Max tokens must be greater than 0');
    });

    test('should not validate undefined optional fields', () => {
      const partialSettings: Partial<AgentSettings> = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-key',
        // temperature and maxTokens are undefined
      };

      const errors = validateSettings(partialSettings);
      expect(errors).toEqual([]);
    });
  });
});
