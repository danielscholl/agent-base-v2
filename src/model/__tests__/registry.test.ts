/**
 * Unit tests for provider registry.
 */

import { describe, it, expect } from '@jest/globals';
import {
  PROVIDER_REGISTRY,
  getProviderFactory,
  isProviderSupported,
  getSupportedProviders,
} from '../registry.js';

describe('Provider Registry', () => {
  describe('PROVIDER_REGISTRY', () => {
    it('has openai provider registered', () => {
      expect(PROVIDER_REGISTRY.openai).toBeDefined();
    });

    it('has anthropic provider registered', () => {
      expect(PROVIDER_REGISTRY.anthropic).toBeDefined();
    });

    it('has gemini provider registered', () => {
      expect(PROVIDER_REGISTRY.gemini).toBeDefined();
    });

    it('has azure provider registered', () => {
      expect(PROVIDER_REGISTRY.azure).toBeDefined();
    });

    it('has local provider registered', () => {
      expect(PROVIDER_REGISTRY.local).toBeDefined();
    });

    it('has foundry provider registered', () => {
      expect(PROVIDER_REGISTRY.foundry).toBeDefined();
    });

    it('all registered factories are functions', () => {
      expect(typeof PROVIDER_REGISTRY.openai).toBe('function');
      expect(typeof PROVIDER_REGISTRY.anthropic).toBe('function');
      expect(typeof PROVIDER_REGISTRY.gemini).toBe('function');
      expect(typeof PROVIDER_REGISTRY.azure).toBe('function');
      expect(typeof PROVIDER_REGISTRY.local).toBe('function');
      expect(typeof PROVIDER_REGISTRY.foundry).toBe('function');
    });
  });

  describe('getProviderFactory', () => {
    it('returns factory for openai provider', () => {
      const factory = getProviderFactory('openai');
      expect(factory).toBeDefined();
      expect(typeof factory).toBe('function');
    });

    it('returns factory for anthropic provider', () => {
      const factory = getProviderFactory('anthropic');
      expect(factory).toBeDefined();
      expect(typeof factory).toBe('function');
    });

    it('returns factory for gemini provider', () => {
      const factory = getProviderFactory('gemini');
      expect(factory).toBeDefined();
      expect(typeof factory).toBe('function');
    });

    it('returns factory for azure provider', () => {
      const factory = getProviderFactory('azure');
      expect(factory).toBeDefined();
      expect(typeof factory).toBe('function');
    });

    it('returns factory for local provider', () => {
      const factory = getProviderFactory('local');
      expect(factory).toBeDefined();
      expect(typeof factory).toBe('function');
    });

    it('returns factory for foundry provider', () => {
      const factory = getProviderFactory('foundry');
      expect(factory).toBeDefined();
      expect(typeof factory).toBe('function');
    });

    it('returns undefined for unsupported provider', () => {
      const factory = getProviderFactory('github');
      expect(factory).toBeUndefined();
    });
  });

  describe('isProviderSupported', () => {
    it('returns true for openai', () => {
      expect(isProviderSupported('openai')).toBe(true);
    });

    it('returns true for anthropic', () => {
      expect(isProviderSupported('anthropic')).toBe(true);
    });

    it('returns true for gemini', () => {
      expect(isProviderSupported('gemini')).toBe(true);
    });

    it('returns true for azure', () => {
      expect(isProviderSupported('azure')).toBe(true);
    });

    it('returns true for local', () => {
      expect(isProviderSupported('local')).toBe(true);
    });

    it('returns true for foundry', () => {
      expect(isProviderSupported('foundry')).toBe(true);
    });

    it('returns false for github (not yet implemented)', () => {
      expect(isProviderSupported('github')).toBe(false);
    });
  });

  describe('getSupportedProviders', () => {
    it('returns array of supported provider names', () => {
      const providers = getSupportedProviders();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('gemini');
      expect(providers).toContain('azure');
      expect(providers).toContain('local');
      expect(providers).toContain('foundry');
    });

    it('does not include unregistered providers', () => {
      const providers = getSupportedProviders();
      expect(providers).not.toContain('github');
    });

    it('returns six providers', () => {
      const providers = getSupportedProviders();
      expect(providers.length).toBe(6);
    });
  });
});
