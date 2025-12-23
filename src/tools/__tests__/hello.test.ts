/**
 * Tests for Hello tools.
 * Tests the new Tool.define() pattern tools.
 */

import { describe, it, expect } from '@jest/globals';
import { helloTool, greetTool } from '../hello.js';
import { Tool } from '../tool.js';

describe('helloTool', () => {
  it('has correct ID', () => {
    expect(helloTool.id).toBe('hello');
  });

  it('initializes with description', async () => {
    const initialized = await helloTool.init();
    expect(initialized.description).toBe('Say hello to someone. Returns greeting message.');
  });

  it('returns greeting for provided name', async () => {
    const initialized = await helloTool.init();
    const ctx = Tool.createNoopContext({ callID: 'test-1' });
    const result = await initialized.execute({ name: 'Alice' }, ctx);

    expect(result.title).toBe('Greeted Alice');
    expect(result.output).toBe('Hello, Alice!');
    expect(result.metadata).toEqual({ name: 'Alice' });
  });

  it('uses default name when not provided', async () => {
    const initialized = await helloTool.init();
    const ctx = Tool.createNoopContext({ callID: 'test-2' });
    // Parse through schema to apply defaults
    const args = initialized.parameters.parse({});
    const result = await initialized.execute(args, ctx);

    expect(result.title).toBe('Greeted World');
    expect(result.output).toBe('Hello, World!');
    expect(result.metadata).toEqual({ name: 'World' });
  });

  it('handles empty string name', async () => {
    const initialized = await helloTool.init();
    const ctx = Tool.createNoopContext({ callID: 'test-3' });
    const result = await initialized.execute({ name: '' }, ctx);

    expect(result.output).toBe('Hello, !');
  });

  it('handles special characters in name', async () => {
    const initialized = await helloTool.init();
    const ctx = Tool.createNoopContext({ callID: 'test-4' });
    const result = await initialized.execute({ name: "O'Brien" }, ctx);

    expect(result.output).toContain("O'Brien");
  });
});

describe('greetTool', () => {
  it('has correct ID', () => {
    expect(greetTool.id).toBe('greet');
  });

  it('initializes with description', async () => {
    const initialized = await greetTool.init();
    expect(initialized.description).toBe(
      'Greet user in different languages (en, es, fr). Returns localized greeting.'
    );
  });

  it('greets in English by default', async () => {
    const initialized = await greetTool.init();
    const ctx = Tool.createNoopContext({ callID: 'test-1' });
    // Parse through schema to apply defaults
    const args = initialized.parameters.parse({ name: 'Alice' });
    const result = await initialized.execute(args, ctx);

    expect(result.output).toBe('Hello, Alice!');
    expect(result.metadata).toEqual({ name: 'Alice', language: 'en' });
  });

  it('greets in Spanish', async () => {
    const initialized = await greetTool.init();
    const ctx = Tool.createNoopContext({ callID: 'test-2' });
    const result = await initialized.execute({ name: 'Bob', language: 'es' }, ctx);

    expect(result.output).toBe('¡Hola, Bob!');
    expect(result.metadata).toEqual({ name: 'Bob', language: 'es' });
  });

  it('greets in French', async () => {
    const initialized = await greetTool.init();
    const ctx = Tool.createNoopContext({ callID: 'test-3' });
    const result = await initialized.execute({ name: 'Claire', language: 'fr' }, ctx);

    expect(result.output).toBe('Bonjour, Claire!');
    expect(result.metadata).toEqual({ name: 'Claire', language: 'fr' });
  });

  it('throws error for unsupported language', async () => {
    const initialized = await greetTool.init();
    const ctx = Tool.createNoopContext({ callID: 'test-4' });

    expect(() => initialized.execute({ name: 'Test', language: 'de' }, ctx)).toThrow(
      "Language 'de' not supported"
    );
  });

  it('includes supported languages in error message', async () => {
    const initialized = await greetTool.init();
    const ctx = Tool.createNoopContext({ callID: 'test-5' });

    expect(() => initialized.execute({ name: 'Test', language: 'xx' }, ctx)).toThrow('en, es, fr');
  });
});
