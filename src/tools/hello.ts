/**
 * Hello tools - reference implementation for tool development.
 * Demonstrates the createTool pattern with success and error responses.
 */

import { z } from 'zod';
import { createTool, successResponse, errorResponse } from './base.js';
import type { ToolResponse } from './types.js';

// === Hello World Tool ===

const HelloWorldInputSchema = z.object({
  name: z.string().default('World').describe('Name to greet'),
});

interface HelloWorldResult {
  greeting: string;
}

/**
 * Hello World tool - greets a user by name.
 * Demonstrates basic tool pattern with success responses.
 *
 * @example
 * const result = await helloWorldTool.invoke({ name: 'Alice' });
 * // { success: true, result: { greeting: 'Hello, Alice!' }, message: 'Greeted Alice' }
 */
export const helloWorldTool = createTool<typeof HelloWorldInputSchema.shape, HelloWorldResult>({
  name: 'hello_world',
  description: 'Say hello to someone. Returns greeting message.',
  schema: HelloWorldInputSchema,
  execute: (input): Promise<ToolResponse<HelloWorldResult>> => {
    const greeting = `Hello, ${input.name}!`;
    return Promise.resolve(
      successResponse<HelloWorldResult>({ greeting }, `Greeted ${input.name}`)
    );
  },
});

// === Greet User Tool ===

const GreetUserInputSchema = z.object({
  name: z.string().describe("User's name"),
  language: z.string().default('en').describe('Language code (en, es, fr)'),
});

interface GreetUserResult {
  greeting: string;
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
 * Greet User tool - greets in different languages with error handling.
 * Demonstrates error responses for invalid input scenarios.
 *
 * @example
 * // Success case
 * const result = await greetUserTool.invoke({ name: 'Alice', language: 'es' });
 * // { success: true, result: { greeting: '¡Hola, Alice!', language: 'es' }, message: 'Greeted Alice in es' }
 *
 * @example
 * // Error case - unsupported language
 * const result = await greetUserTool.invoke({ name: 'Bob', language: 'de' });
 * // { success: false, error: 'VALIDATION_ERROR', message: "Language 'de' not supported. Use: en, es, fr" }
 */
export const greetUserTool = createTool<typeof GreetUserInputSchema.shape, GreetUserResult>({
  name: 'greet_user',
  description:
    'Greet user in different languages (en, es, fr). Returns localized greeting or error if language unsupported.',
  schema: GreetUserInputSchema,
  execute: (input): Promise<ToolResponse<GreetUserResult>> => {
    const { name, language } = input;

    if (!isSupportedLanguage(language)) {
      const supported = Object.keys(GREETINGS).join(', ');
      return Promise.resolve(
        errorResponse('VALIDATION_ERROR', `Language '${language}' not supported. Use: ${supported}`)
      );
    }

    const greeting = `${GREETINGS[language]}, ${name}!`;
    return Promise.resolve(
      successResponse<GreetUserResult>({ greeting, language }, `Greeted ${name} in ${language}`)
    );
  },
});
