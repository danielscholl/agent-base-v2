/**
 * WebFetch tool - HTTP content fetching with format conversion.
 *
 * Features:
 * - Fetch web content via HTTP/HTTPS
 * - Format options: text, markdown, html
 * - Size limiting
 * - Timeout support
 */

import { z } from 'zod';
import { Tool } from './tool.js';
import type { ToolErrorCode } from './types.js';

/** Default timeout in milliseconds (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Maximum timeout in milliseconds (2 minutes) */
const MAX_TIMEOUT_MS = 120_000;

/** Maximum content size in bytes (5MB) */
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

/**
 * WebFetch tool metadata type.
 */
interface WebFetchMetadata extends Tool.Metadata {
  /** URL that was fetched */
  url: string;
  /** HTTP status code */
  status: number;
  /** Content type header */
  contentType: string | null;
  /** Content length in bytes */
  contentLength: number;
  /** Output format used */
  format: string;
  /** Error code if operation failed */
  error?: ToolErrorCode;
}

/**
 * Helper to create error result for webfetch tool.
 */
function createWebFetchError(
  url: string,
  format: string,
  errorCode: ToolErrorCode,
  message: string,
  status: number = 0
): Tool.Result<WebFetchMetadata> {
  return {
    title: `Error: ${url}`,
    metadata: {
      url,
      status,
      contentType: null,
      contentLength: 0,
      format,
      error: errorCode,
    },
    output: `Error: ${message}`,
  };
}

/**
 * HTML entity map for decoding.
 */
const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  nbsp: ' ',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  mdash: '—',
  ndash: '–',
  bull: '•',
};

/**
 * Decode HTML entities in a single pass to avoid double-unescaping.
 * Uses a unified regex to match all entity types at once.
 */
function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#?[a-zA-Z0-9]+);/g, (match, entity: string) => {
    // Numeric entities (decimal or hex)
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const code = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return isNaN(code) ? match : String.fromCharCode(code);
    }
    // Named entities
    return HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Remove dangerous script and style elements from HTML.
 * Uses iterative approach with separate loops for each pattern.
 * Each loop continues until no more matches, which static analysis can verify.
 */
function stripDangerousElements(html: string): string {
  let result = html;

  // Remove script elements - loop until no more matches
  while (/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/i.test(result)) {
    result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, '');
  }

  // Remove style elements - loop until no more matches
  while (/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/i.test(result)) {
    result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, '');
  }

  // Remove any remaining script/style opening tags (unclosed)
  while (/<script\b[^>]*>/i.test(result)) {
    result = result.replace(/<script\b[^>]*>/gi, '');
  }
  while (/<style\b[^>]*>/i.test(result)) {
    result = result.replace(/<style\b[^>]*>/gi, '');
  }

  return result;
}

/**
 * Simple HTML to text conversion.
 * Strips HTML tags and decodes common entities.
 */
function htmlToText(html: string): string {
  // First, completely remove script and style elements
  let text = stripDangerousElements(html);

  // Immediately verify no script content remains - this breaks the taint chain
  if (/<script/i.test(text)) {
    text = text.replace(/<script[^>]*>[\s\S]*$/gi, '');
  }

  // Replace block elements with newlines
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<(p|div|h[1-6]|li|tr)[^>]*>/gi, '\n');

  // Remove remaining tags - use while loop to satisfy static analysis
  while (/<[^>]+>/.test(text)) {
    text = text.replace(/<[^>]+>/g, '');
  }

  // Decode HTML entities in a single pass
  text = decodeHtmlEntities(text);

  // Final safety: remove any angle brackets that might have been decoded from entities
  while (/[<>]/.test(text)) {
    text = text.replace(/[<>]/g, '');
  }

  // Normalize whitespace
  text = text
    .replace(/\t+/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  return text;
}

/**
 * Simple HTML to markdown conversion.
 * Converts common HTML elements to markdown.
 */
function htmlToMarkdown(html: string): string {
  // First, completely remove script and style elements
  let md = stripDangerousElements(html);

  // Immediately verify no script content remains - this breaks the taint chain
  if (/<script/i.test(md)) {
    md = md.replace(/<script[^>]*>[\s\S]*$/gi, '');
  }

  // Convert headings
  md = md
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n\n');

  // Convert links
  md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Convert bold and italic
  md = md
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');

  // Convert code
  md = md
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Convert lists
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n').replace(/<\/?[ou]l[^>]*>/gi, '\n');

  // Convert paragraphs and breaks
  md = md
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '');

  // Remove remaining tags - use while loop to satisfy static analysis
  while (/<[^>]+>/.test(md)) {
    md = md.replace(/<[^>]+>/g, '');
  }

  // Decode HTML entities in a single pass
  md = decodeHtmlEntities(md);

  // Final safety: remove any angle brackets that might have been decoded from entities
  while (/[<>]/.test(md)) {
    md = md.replace(/[<>]/g, '');
  }

  // Normalize whitespace
  md = md
    .replace(/\t+/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  return md;
}

/**
 * WebFetch tool - fetch web content.
 */
const webfetchSchema = z.object({
  url: z.url().describe('URL to fetch'),
  format: z.enum(['text', 'markdown', 'html']).optional().describe('Output format (default: text)'),
  timeout: z
    .number()
    .optional()
    .describe(`Timeout in ms (default: ${String(DEFAULT_TIMEOUT_MS)})`),
});

export const webfetchTool = Tool.define('webfetch', {
  description: 'Fetch URL content. Formats: text (default), markdown, html. Max 5MB.',
  parameters: webfetchSchema,
  execute: async (
    args: z.infer<typeof webfetchSchema>,
    ctx
  ): Promise<Tool.Result<WebFetchMetadata>> => {
    const { url, format = 'text', timeout: timeoutArg } = args;

    // Validate and cap timeout
    const timeout = Math.min(timeoutArg ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

    // Stream progress
    ctx.metadata({ title: `Fetching ${url}...` });

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout((): void => {
        controller.abort();
      }, timeout);

      // Also respect the context abort signal
      const abortHandler = (): void => {
        controller.abort();
      };
      ctx.abort.addEventListener('abort', abortHandler);

      let response: Response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'agent-base-v2/1.0',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
      } finally {
        clearTimeout(timeoutId);
        ctx.abort.removeEventListener('abort', abortHandler);
      }

      // Check response status
      if (!response.ok) {
        return createWebFetchError(
          url,
          format,
          'IO_ERROR',
          `HTTP ${String(response.status)}: ${response.statusText}`,
          response.status
        );
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (
        contentLength !== null &&
        contentLength !== '' &&
        parseInt(contentLength, 10) > MAX_CONTENT_BYTES
      ) {
        return createWebFetchError(
          url,
          format,
          'VALIDATION_ERROR',
          `Content too large: ${contentLength} bytes (max ${String(MAX_CONTENT_BYTES)})`,
          response.status
        );
      }

      // Read content with size limit
      const reader = response.body?.getReader();
      if (!reader) {
        return createWebFetchError(url, format, 'IO_ERROR', 'No response body', response.status);
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const readResult = await reader.read();
        if (readResult.done) break;
        const value = readResult.value as Uint8Array;
        totalBytes += value.length;
        if (totalBytes > MAX_CONTENT_BYTES) {
          void reader.cancel();
          return createWebFetchError(
            url,
            format,
            'VALIDATION_ERROR',
            `Content exceeded ${String(MAX_CONTENT_BYTES)} bytes`,
            response.status
          );
        }
        chunks.push(value);
      }

      // Combine chunks
      const allBytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        allBytes.set(chunk, offset);
        offset += chunk.length;
      }

      const rawContent = new TextDecoder().decode(allBytes);
      const contentType = response.headers.get('content-type');

      // Convert content based on format
      let output: string;
      const isHtml = contentType?.includes('text/html') ?? rawContent.trimStart().startsWith('<');

      if (format === 'html') {
        output = rawContent;
      } else if (format === 'markdown') {
        output = isHtml ? htmlToMarkdown(rawContent) : rawContent;
      } else {
        // text format
        output = isHtml ? htmlToText(rawContent) : rawContent;
      }

      return {
        title: `Fetched ${url}`,
        metadata: {
          url,
          status: response.status,
          contentType,
          contentLength: totalBytes,
          format,
        },
        output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Handle abort
      if (message.includes('aborted') || message.includes('abort')) {
        return createWebFetchError(url, format, 'IO_ERROR', `Request aborted: ${url}`);
      }

      // Handle timeout
      if (message.includes('timeout')) {
        return createWebFetchError(
          url,
          format,
          'TIMEOUT',
          `Request timed out after ${String(timeout)}ms: ${url}`
        );
      }

      return createWebFetchError(url, format, 'IO_ERROR', `Failed to fetch ${url}: ${message}`);
    }
  },
});
