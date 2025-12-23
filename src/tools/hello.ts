/**
 * Hello tools - reference implementation for the new Tool.define() pattern.
 * Demonstrates both simple and complex tool definitions with metadata.
 */

import { z } from 'zod';
import { Tool } from './tool.js';

/**
 * Hello World tool metadata type.
 */
interface HelloMetadata extends Tool.Metadata {
  /** Name that was greeted */
  name: string;
}

/**
 * Hello World tool - demonstrates basic Tool.define() pattern.
 * Greets a user by name with simple metadata.
 */
export const helloTool = Tool.define<
  z.ZodObject<{ name: z.ZodDefault<z.ZodString> }>,
  HelloMetadata
>('hello', {
  description: 'Say hello to someone. Returns greeting message.',
  parameters: z.object({
    name: z.string().default('World').describe('Name to greet'),
  }),
  execute: (args, ctx) => {
    // Stream metadata update for UI
    ctx.metadata({ title: `Greeting ${args.name}...` });

    return {
      title: `Greeted ${args.name}`,
      metadata: { name: args.name },
      output: `Hello, ${args.name}!`,
    };
  },
});

/**
 * Greet User tool metadata type.
 */
interface GreetMetadata extends Tool.Metadata {
  /** Name that was greeted */
  name: string;
  /** Language used */
  language: string;
}

type SupportedLanguage = 'en' | 'es' | 'fr';

const GREETINGS: Record<SupportedLanguage, string> = {
  en: 'Hello',
  es: '¡Hola',
  fr: 'Bonjour',
};

function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return Object.hasOwn(GREETINGS, lang);
}

/**
 * Greet User tool - demonstrates error handling and multiple outputs.
 * Greets in different languages with validation.
 */
export const greetTool = Tool.define<
  z.ZodObject<{ name: z.ZodString; language: z.ZodDefault<z.ZodString> }>,
  GreetMetadata
>('greet', {
  description: 'Greet user in different languages (en, es, fr). Returns localized greeting.',
  parameters: z.object({
    name: z.string().describe("User's name"),
    language: z.string().default('en').describe('Language code (en, es, fr)'),
  }),
  execute: (args, ctx) => {
    const { name, language } = args;

    // Stream progress
    ctx.metadata({ title: `Greeting ${name} in ${language}...` });

    // Validate language
    if (!isSupportedLanguage(language)) {
      const supported = Object.keys(GREETINGS).join(', ');
      throw new Error(`Language '${language}' not supported. Use: ${supported}`);
    }

    const greeting = `${GREETINGS[language]}, ${name}!`;

    return {
      title: `Greeted ${name} in ${language}`,
      metadata: { name, language },
      output: greeting,
    };
  },
});
