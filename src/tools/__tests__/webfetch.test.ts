/**
 * Tests for WebFetch tool (HTTP content fetching).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { webfetchTool } from '../webfetch.js';
import { Tool } from '../tool.js';

// Mock fetch globally
const mockFetch = jest.fn<typeof fetch>();
(globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;

describe('WebFetch Tool', () => {
  const testSessionID = 'test-session-123';

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  function createMockResponse(
    body: string,
    options: { status?: number; contentType?: string | undefined; contentLength?: number } = {}
  ): Response {
    const { status = 200, contentType, contentLength } = options;

    const encoder = new TextEncoder();
    const bodyData = encoder.encode(body);

    // Create a readable stream from the body
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bodyData);
        controller.close();
      },
    });

    const headers = new Headers();
    if (contentType !== undefined) {
      headers.set('content-type', contentType);
    } else if (!('contentType' in options)) {
      // Default to text/html if not explicitly set
      headers.set('content-type', 'text/html');
    }
    // If contentType is explicitly undefined, don't set content-type header
    if (contentLength !== undefined) {
      headers.set('content-length', String(contentLength));
    }

    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers,
      body: stream,
    } as Response;
  }

  describe('webfetchTool', () => {
    it('has correct ID', () => {
      expect(webfetchTool.id).toBe('webfetch');
    });

    it('initializes with description', async () => {
      const initialized = await webfetchTool.init();
      expect(initialized.description).toContain('Fetch');
    });

    it('should fetch URL and return content', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<html><body>Hello World</body></html>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).toContain('Hello World');
      expect(result.metadata.status).toBe(200);
      expect(result.metadata.url).toBe('https://example.com');
    });

    it('should convert HTML to text by default', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<p>Paragraph 1</p><p>Paragraph 2</p>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).toContain('Paragraph 1');
      expect(result.output).toContain('Paragraph 2');
      expect(result.output).not.toContain('<p>');
    });

    it('should return raw HTML when format is html', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<p>Raw HTML</p>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com', format: 'html' }, ctx);

      expect(result.output).toContain('<p>');
      expect(result.metadata.format).toBe('html');
    });

    it('should convert HTML to markdown when format is markdown', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<h1>Title</h1><p>Content</p>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { url: 'https://example.com', format: 'markdown' },
        ctx
      );

      expect(result.output).toContain('# Title');
      expect(result.metadata.format).toBe('markdown');
    });

    it('should remove script tags from HTML', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse('<p>Content</p><script>alert("xss")</script>')
      );

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).not.toContain('script');
      expect(result.output).not.toContain('alert');
    });

    it('should remove style tags from HTML', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse('<p>Content</p><style>.class { color: red; }</style>')
      );

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).not.toContain('style');
      expect(result.output).not.toContain('color');
    });

    it('should decode HTML entities', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse('<p>text &amp; &quot;quoted&quot; with &mdash; dash</p>')
      );

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      // Angle brackets are stripped for security, but other entities are decoded
      expect(result.output).toContain('&');
      expect(result.output).toContain('"quoted"');
      expect(result.output).toContain('—'); // mdash
    });

    it('should throw error for HTTP error status', async () => {
      mockFetch.mockResolvedValue(createMockResponse('Not Found', { status: 404 }));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(
        initialized.execute({ url: 'https://example.com/notfound' }, ctx)
      ).rejects.toThrow('HTTP 404');
    });

    it('should throw error for content too large', async () => {
      const headers = new Headers({
        'content-type': 'text/html',
        'content-length': String(10 * 1024 * 1024), // 10MB
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers,
        body: new ReadableStream(),
      } as Response);

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(initialized.execute({ url: 'https://example.com/large' }, ctx)).rejects.toThrow(
        'Content too large'
      );
    });

    it('should convert links in markdown format', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<a href="https://link.com">Click here</a>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { url: 'https://example.com', format: 'markdown' },
        ctx
      );

      expect(result.output).toContain('[Click here](https://link.com)');
    });

    it('should convert bold and italic in markdown', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<strong>bold</strong> and <em>italic</em>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { url: 'https://example.com', format: 'markdown' },
        ctx
      );

      expect(result.output).toContain('**bold**');
      expect(result.output).toContain('*italic*');
    });

    it('should convert code blocks in markdown', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<pre><code>const x = 1;</code></pre>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { url: 'https://example.com', format: 'markdown' },
        ctx
      );

      expect(result.output).toContain('```');
      expect(result.output).toContain('const x = 1;');
    });

    it('should handle nested script tags', async () => {
      // Security test: nested scripts that might bypass simple regex
      mockFetch.mockResolvedValue(
        createMockResponse('<script><script>malicious</script></script><p>Safe</p>')
      );

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).not.toContain('malicious');
      expect(result.output).not.toContain('script');
      expect(result.output).toContain('Safe');
    });

    it('should stream metadata during fetch', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<p>Content</p>'));

      const initialized = await webfetchTool.init();
      const metadataMock = jest.fn();
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        metadata: metadataMock,
      };

      await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(metadataMock).toHaveBeenCalled();
    });

    it('should include content length in metadata', async () => {
      mockFetch.mockResolvedValue(createMockResponse('Hello World'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.metadata.contentLength).toBeGreaterThan(0);
    });

    it('should handle plain text content', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse('Plain text content', { contentType: 'text/plain' })
      );

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).toBe('Plain text content');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(initialized.execute({ url: 'https://example.com' }, ctx)).rejects.toThrow(
        'Failed to fetch'
      );
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockRejectedValue(new Error('timeout'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(initialized.execute({ url: 'https://example.com' }, ctx)).rejects.toThrow(
        'timed out'
      );
    });

    it('should handle abort errors', async () => {
      mockFetch.mockRejectedValue(new Error('aborted'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(initialized.execute({ url: 'https://example.com' }, ctx)).rejects.toThrow(
        'aborted'
      );
    });

    it('should handle no response body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/html' }),
        body: null,
      } as Response);

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(initialized.execute({ url: 'https://example.com' }, ctx)).rejects.toThrow(
        'No response body'
      );
    });

    it('should cap timeout at max value', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<p>Content</p>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { url: 'https://example.com', timeout: 9999999 },
        ctx
      );

      expect(result.output).toContain('Content');
    });

    it('should handle heading tags in markdown', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse('<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>')
      );

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { url: 'https://example.com', format: 'markdown' },
        ctx
      );

      expect(result.output).toContain('# H1');
      expect(result.output).toContain('## H2');
      expect(result.output).toContain('### H3');
      expect(result.output).toContain('#### H4');
      expect(result.output).toContain('##### H5');
      expect(result.output).toContain('###### H6');
    });

    it('should handle lists in markdown', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<ul><li>Item 1</li><li>Item 2</li></ul>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { url: 'https://example.com', format: 'markdown' },
        ctx
      );

      expect(result.output).toContain('- Item 1');
      expect(result.output).toContain('- Item 2');
    });

    it('should handle inline code in markdown', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse('<p>Use <code>const x = 1</code> for constants</p>')
      );

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { url: 'https://example.com', format: 'markdown' },
        ctx
      );

      expect(result.output).toContain('`const x = 1`');
    });

    it('should handle HTML numeric entities', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<p>&#65;&#66;&#67;</p>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).toContain('ABC');
    });

    it('should handle mdash and ndash entities', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<p>2020&mdash;2024 and 1&ndash;10</p>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).toContain('—');
      expect(result.output).toContain('–');
    });

    it('should handle bull entity', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<p>&bull; item</p>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).toContain('•');
    });

    it('should treat non-HTML content as text', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse('{"key": "value"}', { contentType: 'application/json' })
      );

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).toContain('"key"');
    });

    it('should detect HTML by content when no content-type', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse('<html><body>Test</body></html>', { contentType: undefined })
      );

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).toContain('Test');
      expect(result.output).not.toContain('<html>');
    });

    it('should handle context abort signal', async () => {
      const abortController = new AbortController();

      // Mock a fetch that respects the abort signal
      mockFetch.mockImplementation(async (_url, options) => {
        const signal = options?.signal as AbortSignal | undefined;
        return new Promise<Response>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            resolve(createMockResponse('<p>Content</p>'));
          }, 500);

          signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new Error('aborted'));
          });
        });
      });

      const initialized = await webfetchTool.init();
      const ctx = {
        ...Tool.createNoopContext({ sessionID: testSessionID }),
        abort: abortController.signal,
      };

      // Start the request and abort after a short delay
      const executePromise = initialized.execute({ url: 'https://example.com' }, ctx);
      setTimeout(() => {
        abortController.abort();
      }, 20);

      await expect(executePromise).rejects.toThrow('aborted');
    });

    it('should handle content exceeding size during streaming', async () => {
      // Create a response that streams more than MAX_CONTENT_BYTES
      const largeContent = 'x'.repeat(6 * 1024 * 1024); // 6MB
      const encoder = new TextEncoder();
      const bodyData = encoder.encode(largeContent);

      let chunkIndex = 0;
      const chunkSize = 1024 * 1024; // 1MB chunks
      const stream = new ReadableStream({
        pull(controller) {
          const start = chunkIndex * chunkSize;
          const end = Math.min(start + chunkSize, bodyData.length);
          if (start >= bodyData.length) {
            controller.close();
            return;
          }
          controller.enqueue(bodyData.slice(start, end));
          chunkIndex++;
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/html' }),
        body: stream,
      } as Response);

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(initialized.execute({ url: 'https://example.com' }, ctx)).rejects.toThrow(
        'exceeded'
      );
    });

    it('should handle fetch timeout with custom timeout value', async () => {
      // Mock a fetch that takes longer than the timeout
      mockFetch.mockImplementation(async (_url, options) => {
        const signal = options?.signal as AbortSignal | undefined;
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(resolve, 1000);
          signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new Error('The operation was aborted'));
          });
        });
        return createMockResponse('<p>Content</p>');
      });

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      await expect(
        initialized.execute({ url: 'https://example.com', timeout: 50 }, ctx)
      ).rejects.toThrow('aborted');
    });

    it('should handle markdown conversion for non-HTML content', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse('Plain text content', { contentType: 'text/plain' })
      );

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { url: 'https://example.com', format: 'markdown' },
        ctx
      );

      // Non-HTML content should be returned as-is for markdown format
      expect(result.output).toBe('Plain text content');
    });

    it('should handle empty content-length header', async () => {
      const headers = new Headers({
        'content-type': 'text/html',
        'content-length': '',
      });

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<p>Test</p>'));
          controller.close();
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers,
        body: stream,
      } as Response);

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute({ url: 'https://example.com' }, ctx);

      expect(result.output).toContain('Test');
    });

    it('should handle single quote entity in markdown', async () => {
      mockFetch.mockResolvedValue(createMockResponse('<p>It&#39;s working</p>'));

      const initialized = await webfetchTool.init();
      const ctx = Tool.createNoopContext({ sessionID: testSessionID });

      const result = await initialized.execute(
        { url: 'https://example.com', format: 'markdown' },
        ctx
      );

      expect(result.output).toContain("It's working");
    });
  });
});
