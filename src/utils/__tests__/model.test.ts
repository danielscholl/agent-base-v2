/**
 * Tests for model utility functions.
 */

import { describe, it, expect } from '@jest/globals';
import { resolveModelName, isProviderConfigured } from '../model.js';

describe('resolveModelName', () => {
  it('should return deployment name for Azure provider', () => {
    const result = resolveModelName('azure', { deployment: 'my-gpt4' });
    expect(result).toBe('my-gpt4');
  });

  it('should return modelDeployment for Foundry cloud mode', () => {
    const result = resolveModelName('foundry', {
      mode: 'cloud',
      modelDeployment: 'my-deployment',
    });
    expect(result).toBe('my-deployment');
  });

  it('should return modelAlias for Foundry local mode', () => {
    const result = resolveModelName('foundry', { mode: 'local', modelAlias: 'my-model' });
    expect(result).toBe('my-model');
  });

  it('should return model for other providers', () => {
    const result = resolveModelName('openai', { model: 'gpt-4o' });
    expect(result).toBe('gpt-4o');
  });

  it('should return unknown when config is undefined', () => {
    const result = resolveModelName('openai', undefined);
    expect(result).toBe('unknown');
  });

  it('should return unknown when model field is missing', () => {
    const result = resolveModelName('openai', {});
    expect(result).toBe('unknown');
  });
});

describe('isProviderConfigured', () => {
  it('should return false when config is undefined', () => {
    const result = isProviderConfigured('openai', undefined);
    expect(result).toBe(false);
  });

  describe('openai provider', () => {
    it('should return true when apiKey is set', () => {
      const result = isProviderConfigured('openai', { apiKey: 'sk-123' });
      expect(result).toBe(true);
    });

    it('should return true when custom baseUrl is set', () => {
      const result = isProviderConfigured('openai', {
        baseUrl: 'http://localhost:11434/v1',
      });
      expect(result).toBe(true);
    });

    it('should return false when no credentials', () => {
      const result = isProviderConfigured('openai', {});
      expect(result).toBe(false);
    });

    it('should return true when model is set via wizard (API key from env var)', () => {
      const result = isProviderConfigured('openai', { model: 'gpt-4o' });
      expect(result).toBe(true);
    });
  });

  describe('anthropic provider', () => {
    it('should return true when apiKey is set', () => {
      const result = isProviderConfigured('anthropic', { apiKey: 'sk-ant-123' });
      expect(result).toBe(true);
    });

    it('should return false when no apiKey', () => {
      const result = isProviderConfigured('anthropic', {});
      expect(result).toBe(false);
    });

    it('should return true when model is set via wizard (API key from env var)', () => {
      const result = isProviderConfigured('anthropic', { model: 'claude-sonnet-4-20250514' });
      expect(result).toBe(true);
    });
  });

  describe('azure provider', () => {
    it('should return true when endpoint and deployment are set', () => {
      const result = isProviderConfigured('azure', {
        endpoint: 'https://my-azure.openai.azure.com',
        deployment: 'gpt-4',
      });
      expect(result).toBe(true);
    });

    it('should return true when only endpoint is set', () => {
      const result = isProviderConfigured('azure', {
        endpoint: 'https://my-azure.openai.azure.com',
      });
      expect(result).toBe(true);
    });

    it('should return true when only deployment is set (endpoint from env var)', () => {
      const result = isProviderConfigured('azure', { deployment: 'gpt-4' });
      expect(result).toBe(true);
    });

    it('should return false when only apiVersion is set', () => {
      const result = isProviderConfigured('azure', { apiVersion: '2024-06-01' });
      expect(result).toBe(false);
    });

    it('should return false when no Azure fields are set', () => {
      const result = isProviderConfigured('azure', {});
      expect(result).toBe(false);
    });
  });

  describe('foundry provider', () => {
    it('should return true for local mode', () => {
      const result = isProviderConfigured('foundry', { mode: 'local' });
      expect(result).toBe(true);
    });

    it('should return true when cloud mode with projectEndpoint', () => {
      const result = isProviderConfigured('foundry', {
        mode: 'cloud',
        projectEndpoint: 'https://my-foundry.azure.com',
      });
      expect(result).toBe(true);
    });

    it('should return false when cloud mode without projectEndpoint', () => {
      const result = isProviderConfigured('foundry', { mode: 'cloud' });
      expect(result).toBe(false);
    });
  });

  describe('gemini provider', () => {
    it('should return true when apiKey is set', () => {
      const result = isProviderConfigured('gemini', { apiKey: 'AIzaSy123' });
      expect(result).toBe(true);
    });

    it('should return false when no apiKey', () => {
      const result = isProviderConfigured('gemini', {});
      expect(result).toBe(false);
    });

    it('should return true when model is set via wizard (API key from env var)', () => {
      const result = isProviderConfigured('gemini', { model: 'gemini-pro' });
      expect(result).toBe(true);
    });
  });

  describe('github provider', () => {
    it('should return true when token is set', () => {
      const result = isProviderConfigured('github', { token: 'ghp_123' });
      expect(result).toBe(true);
    });

    it('should return false when no token', () => {
      const result = isProviderConfigured('github', {});
      expect(result).toBe(false);
    });

    it('should return true when model is set via wizard (token from env var)', () => {
      const result = isProviderConfigured('github', { model: 'gpt-4o' });
      expect(result).toBe(true);
    });
  });

  describe('local provider', () => {
    it('should return true when baseUrl is set', () => {
      const result = isProviderConfigured('local', {
        baseUrl: 'http://localhost:11434/v1',
      });
      expect(result).toBe(true);
    });

    it('should return false when no baseUrl', () => {
      const result = isProviderConfigured('local', {});
      expect(result).toBe(false);
    });
  });
});
