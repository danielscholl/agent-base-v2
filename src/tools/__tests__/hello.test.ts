/**
 * Tests for Hello tools.
 */

import { describe, it, expect } from '@jest/globals';
import { helloWorldTool, greetUserTool } from '../hello.js';
import type { ToolResponse } from '../index.js';

// Type helper for test assertions
interface HelloWorldResult {
  greeting: string;
}

interface GreetUserResult {
  greeting: string;
  language: string;
}

describe('helloWorldTool', () => {
  it('returns greeting for provided name', async () => {
    const result = await helloWorldTool.invoke({ name: 'Alice' });

    expect(result).toEqual({
      success: true,
      result: { greeting: 'Hello, Alice!' },
      message: 'Greeted Alice',
    });
  });

  it('uses default name when not provided', async () => {
    const result = await helloWorldTool.invoke({});

    expect(result).toEqual({
      success: true,
      result: { greeting: 'Hello, World!' },
      message: 'Greeted World',
    });
  });

  it('handles empty string name', async () => {
    const result = (await helloWorldTool.invoke({ name: '' })) as ToolResponse<HelloWorldResult>;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.greeting).toBe('Hello, !');
    }
  });

  it('handles special characters in name', async () => {
    const result = (await helloWorldTool.invoke({
      name: "O'Brien",
    })) as ToolResponse<HelloWorldResult>;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.greeting).toContain("O'Brien");
    }
  });

  it('handles unicode characters in name', async () => {
    const result = (await helloWorldTool.invoke({
      name: '日本語',
    })) as ToolResponse<HelloWorldResult>;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.greeting).toBe('Hello, 日本語!');
    }
  });

  it('has correct tool metadata', () => {
    expect(helloWorldTool.name).toBe('hello_world');
    expect(helloWorldTool.description).toBe('Say hello to someone. Returns greeting message.');
  });

  describe('schema validation (LangChain layer)', () => {
    it('throws when invalid type is passed (LangChain validates before execute)', async () => {
      // LangChain's tool() validates input schema BEFORE calling execute().
      // Invalid types cause LangChain to throw, not return a ToolResponse.
      // This is by design - schema validation happens at the LangChain layer.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(helloWorldTool.invoke({ name: 123 as any })).rejects.toThrow();
    });
  });
});

describe('greetUserTool', () => {
  describe('success cases', () => {
    it('greets in English (default)', async () => {
      const result = await greetUserTool.invoke({ name: 'Alice' });

      expect(result).toEqual({
        success: true,
        result: { greeting: 'Hello, Alice!', language: 'en' },
        message: 'Greeted Alice in en',
      });
    });

    it('greets in Spanish', async () => {
      const result = await greetUserTool.invoke({ name: 'Carlos', language: 'es' });

      expect(result).toEqual({
        success: true,
        result: { greeting: '¡Hola, Carlos!', language: 'es' },
        message: 'Greeted Carlos in es',
      });
    });

    it('greets in French', async () => {
      const result = await greetUserTool.invoke({ name: 'Marie', language: 'fr' });

      expect(result).toEqual({
        success: true,
        result: { greeting: 'Bonjour, Marie!', language: 'fr' },
        message: 'Greeted Marie in fr',
      });
    });

    it.each(['en', 'es', 'fr'])('supports language: %s', async (language) => {
      const result = (await greetUserTool.invoke({
        name: 'Test',
        language,
      })) as ToolResponse<GreetUserResult>;

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.language).toBe(language);
      }
    });
  });

  describe('error cases', () => {
    it('returns error for unsupported language', async () => {
      const result = await greetUserTool.invoke({ name: 'Hans', language: 'de' });

      expect(result).toEqual({
        success: false,
        error: 'VALIDATION_ERROR',
        message: "Language 'de' not supported. Use: en, es, fr",
      });
    });

    it('returns error for empty language code', async () => {
      const result = (await greetUserTool.invoke({
        name: 'Test',
        language: '',
      })) as ToolResponse<GreetUserResult>;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('VALIDATION_ERROR');
      }
    });

    it('returns error for invalid language code', async () => {
      const result = (await greetUserTool.invoke({
        name: 'Test',
        language: 'xyz',
      })) as ToolResponse<GreetUserResult>;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('VALIDATION_ERROR');
        expect(result.message).toContain('xyz');
        expect(result.message).toContain('en, es, fr');
      }
    });

    it('rejects prototype keys as language codes (prototype pollution protection)', async () => {
      // 'toString' exists on Object.prototype but should not be treated as a supported language
      const result = (await greetUserTool.invoke({
        name: 'Test',
        language: 'toString',
      })) as ToolResponse<GreetUserResult>;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('VALIDATION_ERROR');
        expect(result.message).toContain('toString');
      }
    });
  });

  describe('edge cases', () => {
    it('handles empty name', async () => {
      const result = (await greetUserTool.invoke({
        name: '',
        language: 'en',
      })) as ToolResponse<GreetUserResult>;

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.greeting).toBe('Hello, !');
      }
    });

    it('handles special characters in name', async () => {
      const result = (await greetUserTool.invoke({
        name: 'José María',
        language: 'es',
      })) as ToolResponse<GreetUserResult>;

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.greeting).toContain('José María');
      }
    });
  });

  it('has correct tool metadata', () => {
    expect(greetUserTool.name).toBe('greet_user');
    expect(greetUserTool.description).toBe(
      'Greet user in different languages (en, es, fr). Returns localized greeting or error if language unsupported.'
    );
  });
});
