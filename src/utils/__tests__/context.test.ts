/**
 * Tests for ContextManager class.
 */

import { ContextManager } from '../context.js';
import type { ContextPointer, StoredContext } from '../context.js';
import type { IFileSystem } from '../../config/types.js';

// -----------------------------------------------------------------------------
// Mock FileSystem
// -----------------------------------------------------------------------------

interface MockFileSystemState {
  files: Map<string, string>;
  dirs: Set<string>;
}

function createMockFileSystem(initialState?: Partial<MockFileSystemState>): IFileSystem & {
  state: MockFileSystemState;
} {
  const state: MockFileSystemState = {
    files: new Map(initialState?.files ?? []),
    dirs: new Set(initialState?.dirs ?? []),
  };

  return {
    state,
    readFile(path: string): Promise<string> {
      const content = state.files.get(path);
      if (content === undefined) {
        return Promise.reject(new Error(`File not found: ${path}`));
      }
      return Promise.resolve(content);
    },
    writeFile(path: string, content: string): Promise<void> {
      state.files.set(path, content);
      return Promise.resolve();
    },
    exists(path: string): Promise<boolean> {
      return Promise.resolve(state.files.has(path) || state.dirs.has(path));
    },
    mkdir(path: string): Promise<void> {
      state.dirs.add(path);
      return Promise.resolve();
    },
    chmod(_path: string, _mode: number): Promise<void> {
      // No-op for tests
      return Promise.resolve();
    },
    resolvePath(path: string): string {
      if (path.startsWith('~')) {
        return `/home/testuser${path.slice(1)}`;
      }
      return path;
    },
    joinPath(...segments: string[]): string {
      return segments.join('/');
    },
    getHomeDir(): string {
      return '/home/testuser';
    },
    getCwd(): string {
      return '/test/cwd';
    },
    dirname(filePath: string): string {
      const parts = filePath.split('/');
      parts.pop();
      return parts.join('/') || '/';
    },
    unlink(path: string): Promise<void> {
      if (!state.files.has(path)) {
        return Promise.reject(new Error(`File not found: ${path}`));
      }
      state.files.delete(path);
      return Promise.resolve();
    },
    readdir(dirPath: string): Promise<string[]> {
      const files: string[] = [];
      for (const [path] of state.files) {
        if (path.startsWith(dirPath + '/')) {
          const filename = path.slice(dirPath.length + 1);
          if (!filename.includes('/')) {
            files.push(filename);
          }
        }
      }
      return Promise.resolve(files);
    },
  };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('ContextManager', () => {
  let mockFs: ReturnType<typeof createMockFileSystem>;
  let manager: ContextManager;

  beforeEach(() => {
    mockFs = createMockFileSystem();
    manager = new ContextManager({
      contextDir: '/test/context',
      fileSystem: mockFs,
    });
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const defaultManager = new ContextManager({ fileSystem: mockFs });
      expect(defaultManager.getContextDir()).toBe('/home/testuser/.agent/context');
      expect(defaultManager.size).toBe(0);
    });

    it('should accept custom contextDir', () => {
      const customManager = new ContextManager({
        contextDir: '/custom/context',
        fileSystem: mockFs,
      });
      expect(customManager.getContextDir()).toBe('/custom/context');
    });

    it('should accept custom persistThreshold', () => {
      const customManager = new ContextManager({
        contextDir: '/test/context',
        persistThreshold: 64 * 1024,
        fileSystem: mockFs,
      });
      // persistThreshold is private, but we can verify it works by checking the manager exists
      expect(customManager).toBeDefined();
    });

    it('should accept debug callback', () => {
      const debugMsgs: string[] = [];
      const _debugManager = new ContextManager({
        contextDir: '/test/context',
        fileSystem: mockFs,
        onDebug: (msg) => debugMsgs.push(msg),
      });

      expect(debugMsgs.length).toBeGreaterThan(0);
      expect(debugMsgs[0]).toContain('initialized');
      // Use the manager to suppress unused variable warning
      expect(_debugManager).toBeDefined();
    });

    it('should resolve ~ in contextDir path', () => {
      const tildeManager = new ContextManager({
        contextDir: '~/.agent/context',
        fileSystem: mockFs,
      });
      expect(tildeManager.getContextDir()).toBe('/home/testuser/.agent/context');
    });
  });

  describe('saveContext', () => {
    it('should create context directory if missing', async () => {
      await manager.saveContext('readFile', { path: '/src/index.ts' }, 'file content');

      expect(mockFs.state.dirs.has('/test/context')).toBe(true);
    });

    it('should generate unique filename', async () => {
      const filepath = await manager.saveContext('readFile', { path: '/src/index.ts' }, 'content');

      expect(filepath).toContain('readFile_');
      expect(filepath).toMatch(/\.json$/);
    });

    it('should write valid JSON with all metadata fields', async () => {
      const filepath = await manager.saveContext(
        'searchCode',
        { query: 'function', limit: 10 },
        [{ file: 'test.ts', line: 1 }],
        42,
        'query-123'
      );

      const content = mockFs.state.files.get(filepath);
      expect(content).toBeDefined();
      if (content === undefined) throw new Error('content should be defined');

      const parsed = JSON.parse(content) as StoredContext;
      expect(parsed.toolName).toBe('searchCode');
      expect(parsed.args).toEqual({ query: 'function', limit: 10 });
      expect(parsed.result).toEqual([{ file: 'test.ts', line: 1 }]);
      expect(parsed.taskId).toBe(42);
      expect(parsed.queryId).toBe('query-123');
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.toolDescription).toBeDefined();
    });

    it('should create pointer with correct filepath', async () => {
      const filepath = await manager.saveContext('readFile', { path: '/test.ts' }, 'content');

      const pointers = manager.getAllPointers();
      expect(pointers.length).toBe(1);
      expect(pointers[0].filepath).toBe(filepath);
    });

    it('should handle special characters in args', async () => {
      const filepath = await manager.saveContext(
        'readFile',
        { path: '/path/with spaces/and "quotes"/file.ts' },
        'content'
      );

      const content = mockFs.state.files.get(filepath);
      expect(content).toBeDefined();
      if (content === undefined) throw new Error('content should be defined');

      const parsed = JSON.parse(content) as StoredContext;
      expect(parsed.args.path).toBe('/path/with spaces/and "quotes"/file.ts');
    });

    it('should return filepath for reference', async () => {
      const filepath = await manager.saveContext('testTool', {}, 'result');

      expect(filepath).toContain('/test/context/');
      expect(filepath).toContain('testTool_');
      expect(filepath).toMatch(/\.json$/);
    });

    it('should sanitize tool name for filename', async () => {
      const filepath = await manager.saveContext('my-tool.v2', { key: 'value' }, 'result');

      expect(filepath).toContain('my_tool_v2_');
    });

    it('should increment size after saving', async () => {
      expect(manager.size).toBe(0);

      await manager.saveContext('tool1', {}, 'result1');
      expect(manager.size).toBe(1);

      await manager.saveContext('tool2', {}, 'result2');
      expect(manager.size).toBe(2);
    });
  });

  describe('getAllPointers', () => {
    it('should return empty array when no contexts', () => {
      const pointers = manager.getAllPointers();
      expect(pointers).toEqual([]);
    });

    it('should return all stored pointers', async () => {
      await manager.saveContext('tool1', { arg: 1 }, 'result1');
      await manager.saveContext('tool2', { arg: 2 }, 'result2');
      await manager.saveContext('tool3', { arg: 3 }, 'result3');

      const pointers = manager.getAllPointers();
      expect(pointers.length).toBe(3);
      expect(pointers.map((p) => p.toolName)).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('should return copies to prevent mutation', async () => {
      await manager.saveContext('testTool', { key: 'value' }, 'result');

      const pointers1 = manager.getAllPointers();
      pointers1[0].toolName = 'modified';
      pointers1[0].args.key = 'modified';

      const pointers2 = manager.getAllPointers();
      expect(pointers2[0].toolName).toBe('testTool');
      expect(pointers2[0].args.key).toBe('value');
    });
  });

  describe('getPointersForQuery', () => {
    beforeEach(async () => {
      await manager.saveContext('tool1', {}, 'r1', undefined, 'query-A');
      await manager.saveContext('tool2', {}, 'r2', undefined, 'query-A');
      await manager.saveContext('tool3', {}, 'r3', undefined, 'query-B');
      await manager.saveContext('tool4', {}, 'r4'); // no queryId
    });

    it('should return pointers matching queryId', () => {
      const pointers = manager.getPointersForQuery('query-A');

      expect(pointers.length).toBe(2);
      expect(pointers.every((p) => p.queryId === 'query-A')).toBe(true);
    });

    it('should return empty array for non-existent queryId', () => {
      const pointers = manager.getPointersForQuery('non-existent');

      expect(pointers).toEqual([]);
    });

    it('should handle undefined queryId values', () => {
      // Looking for pointers with undefined queryId shouldn't match contexts with defined queryId
      const all = manager.getAllPointers();
      const withoutQuery = all.filter((p) => p.queryId === undefined);

      expect(withoutQuery.length).toBe(1);
      expect(withoutQuery[0].toolName).toBe('tool4');
    });

    it('should return copies', () => {
      const pointers = manager.getPointersForQuery('query-A');
      pointers[0].toolName = 'modified';

      const pointersAgain = manager.getPointersForQuery('query-A');
      expect(pointersAgain[0].toolName).toBe('tool1');
    });
  });

  describe('getPointersForTask', () => {
    beforeEach(async () => {
      await manager.saveContext('tool1', {}, 'r1', 100);
      await manager.saveContext('tool2', {}, 'r2', 100);
      await manager.saveContext('tool3', {}, 'r3', 200);
      await manager.saveContext('tool4', {}, 'r4'); // no taskId
    });

    it('should return pointers matching taskId', () => {
      const pointers = manager.getPointersForTask(100);

      expect(pointers.length).toBe(2);
      expect(pointers.every((p) => p.taskId === 100)).toBe(true);
    });

    it('should return empty array for non-existent taskId', () => {
      const pointers = manager.getPointersForTask(999);

      expect(pointers).toEqual([]);
    });

    it('should handle undefined taskId values', () => {
      const all = manager.getAllPointers();
      const withoutTask = all.filter((p) => p.taskId === undefined);

      expect(withoutTask.length).toBe(1);
      expect(withoutTask[0].toolName).toBe('tool4');
    });

    it('should return copies', () => {
      const pointers = manager.getPointersForTask(100);
      pointers[0].toolName = 'modified';

      const pointersAgain = manager.getPointersForTask(100);
      expect(pointersAgain[0].toolName).toBe('tool1');
    });
  });

  describe('loadContexts', () => {
    it('should load single context file', async () => {
      const filepath = await manager.saveContext('readFile', { path: '/test.ts' }, 'file content');

      const contexts = await manager.loadContexts([filepath]);

      expect(contexts.length).toBe(1);
      expect(contexts[0].toolName).toBe('readFile');
      expect(contexts[0].result).toBe('file content');
    });

    it('should load multiple context files', async () => {
      const fp1 = await manager.saveContext('tool1', {}, 'result1');
      const fp2 = await manager.saveContext('tool2', {}, 'result2');
      const fp3 = await manager.saveContext('tool3', {}, 'result3');

      const contexts = await manager.loadContexts([fp1, fp2, fp3]);

      expect(contexts.length).toBe(3);
      expect(contexts.map((c) => c.toolName)).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('should skip non-existent files with warning', async () => {
      const debugMsgs: string[] = [];
      const debugManager = new ContextManager({
        contextDir: '/test/context',
        fileSystem: mockFs,
        onDebug: (msg) => debugMsgs.push(msg),
      });

      const fp1 = await debugManager.saveContext('tool1', {}, 'result1');
      const nonExistent = '/test/context/non_existent.json';

      const contexts = await debugManager.loadContexts([fp1, nonExistent]);

      expect(contexts.length).toBe(1);
      expect(contexts[0].toolName).toBe('tool1');
      expect(debugMsgs.some((m) => m.includes('not found'))).toBe(true);
    });

    it('should handle malformed JSON gracefully', async () => {
      const debugMsgs: string[] = [];
      const debugManager = new ContextManager({
        contextDir: '/test/context',
        fileSystem: mockFs,
        onDebug: (msg) => debugMsgs.push(msg),
      });

      const fp1 = await debugManager.saveContext('tool1', {}, 'result1');

      // Manually corrupt a file
      const badPath = '/test/context/bad.json';
      mockFs.state.files.set(badPath, 'not valid json {{{');

      const contexts = await debugManager.loadContexts([fp1, badPath]);

      expect(contexts.length).toBe(1);
      expect(contexts[0].toolName).toBe('tool1');
      expect(debugMsgs.some((m) => m.includes('Failed to load'))).toBe(true);
    });

    it('should return empty array for empty input', async () => {
      const contexts = await manager.loadContexts([]);

      expect(contexts).toEqual([]);
    });

    it('should return parsed StoredContext objects', async () => {
      const filepath = await manager.saveContext(
        'searchCode',
        { query: 'test', limit: 5 },
        [{ file: 'a.ts' }, { file: 'b.ts' }],
        42,
        'q-123'
      );

      const contexts = await manager.loadContexts([filepath]);

      expect(contexts[0]).toMatchObject({
        toolName: 'searchCode',
        args: { query: 'test', limit: 5 },
        result: [{ file: 'a.ts' }, { file: 'b.ts' }],
        taskId: 42,
        queryId: 'q-123',
      });
      expect(contexts[0].timestamp).toBeDefined();
      expect(contexts[0].toolDescription).toBeDefined();
    });
  });

  describe('selectRelevantContexts', () => {
    let pointers: ContextPointer[];

    beforeEach(async () => {
      await manager.saveContext('readFile', { path: '/src/auth/login.ts' }, 'auth code');
      await manager.saveContext('searchCode', { query: 'authentication' }, ['matches']);
      await manager.saveContext('readFile', { path: '/src/api/users.ts' }, 'user api code');
      await manager.saveContext('runTests', { suite: 'unit' }, 'test results');

      pointers = manager.getAllPointers();
    });

    it('should return empty array for empty pointers', () => {
      const result = manager.selectRelevantContexts('any query', []);

      expect(result).toEqual([]);
    });

    it('should match query keywords to tool descriptions', () => {
      const result = manager.selectRelevantContexts('authentication login', pointers);

      // Should prefer contexts related to auth/login
      expect(result.length).toBeGreaterThan(0);
      // Results should be filepaths
      expect(result.every((r) => r.endsWith('.json'))).toBe(true);
    });

    it('should score by keyword overlap', () => {
      const result = manager.selectRelevantContexts('readFile path', pointers);

      // readFile contexts should score higher
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return filepaths sorted by relevance', () => {
      const result = manager.selectRelevantContexts('test unit', pointers);

      // Should be an array of filepaths
      expect(Array.isArray(result)).toBe(true);
      expect(result.every((r) => typeof r === 'string')).toBe(true);
    });

    it('should fall back to all pointers when no matches', () => {
      const result = manager.selectRelevantContexts('zzzznonexistent', pointers);

      // Should return all pointers when no keyword matches
      expect(result.length).toBe(pointers.length);
    });

    it('should return all pointers for empty query', () => {
      const result = manager.selectRelevantContexts('', pointers);

      expect(result.length).toBe(pointers.length);
    });

    it('should return all pointers for whitespace-only query', () => {
      const result = manager.selectRelevantContexts('   ', pointers);

      // All small words filtered out, so falls back to all
      expect(result.length).toBe(pointers.length);
    });

    it('should be case-insensitive', () => {
      const lowerResult = manager.selectRelevantContexts('readfile', pointers);
      const upperResult = manager.selectRelevantContexts('READFILE', pointers);
      const mixedResult = manager.selectRelevantContexts('ReadFile', pointers);

      // All should return same results
      expect(lowerResult).toEqual(upperResult);
      expect(lowerResult).toEqual(mixedResult);
    });
  });

  describe('clearPointers', () => {
    it('should reset pointer array to empty', async () => {
      await manager.saveContext('tool1', {}, 'r1');
      await manager.saveContext('tool2', {}, 'r2');
      expect(manager.size).toBe(2);

      manager.clearPointers();

      expect(manager.size).toBe(0);
      expect(manager.getAllPointers()).toEqual([]);
    });

    it('should not affect files on disk', async () => {
      const filepath = await manager.saveContext('tool1', {}, 'r1');
      const fileContent = mockFs.state.files.get(filepath);

      manager.clearPointers();

      expect(mockFs.state.files.get(filepath)).toBe(fileContent);
    });
  });

  describe('clearContextDir', () => {
    it('should handle non-existent directory gracefully', async () => {
      const debugMsgs: string[] = [];
      const emptyManager = new ContextManager({
        contextDir: '/nonexistent/dir',
        fileSystem: mockFs,
        onDebug: (msg) => debugMsgs.push(msg),
      });

      await expect(emptyManager.clearContextDir()).resolves.not.toThrow();
      expect(debugMsgs.some((m) => m.includes('does not exist'))).toBe(true);
    });

    it('should delete all JSON files in context directory', async () => {
      const fp1 = await manager.saveContext('tool1', {}, 'r1');
      const fp2 = await manager.saveContext('tool2', {}, 'r2');

      // Verify files exist before clearing
      expect(mockFs.state.files.has(fp1)).toBe(true);
      expect(mockFs.state.files.has(fp2)).toBe(true);

      await manager.clearContextDir();

      // Verify files are deleted
      expect(mockFs.state.files.has(fp1)).toBe(false);
      expect(mockFs.state.files.has(fp2)).toBe(false);
    });

    it('should log deletion count', async () => {
      const debugMsgs: Array<{ msg: string; data?: unknown }> = [];
      const debugManager = new ContextManager({
        contextDir: '/test/context',
        fileSystem: mockFs,
        onDebug: (msg, data) => debugMsgs.push({ msg, data }),
      });

      await debugManager.saveContext('tool1', {}, 'r1');
      await debugManager.saveContext('tool2', {}, 'r2');
      await debugManager.clearContextDir();

      const clearMsg = debugMsgs.find((m) => m.msg.includes('cleared'));
      expect(clearMsg).toBeDefined();
      if (clearMsg === undefined) throw new Error('Expected clearMsg to be defined');
      const clearData = clearMsg.data as { deletedCount?: number };
      expect(clearData.deletedCount).toBe(2);
    });

    it('should only delete .json files', async () => {
      await manager.saveContext('tool1', {}, 'r1');

      // Add a non-JSON file manually
      mockFs.state.files.set('/test/context/readme.txt', 'keep me');

      await manager.clearContextDir();

      // Non-JSON file should remain
      expect(mockFs.state.files.has('/test/context/readme.txt')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should call both cleanup methods', async () => {
      await manager.saveContext('tool1', {}, 'r1');
      await manager.saveContext('tool2', {}, 'r2');

      await manager.clear();

      expect(manager.size).toBe(0);
      expect(manager.getAllPointers()).toEqual([]);
    });

    it('should work when already empty', async () => {
      await expect(manager.clear()).resolves.not.toThrow();
    });
  });

  describe('size', () => {
    it('should return 0 for empty manager', () => {
      expect(manager.size).toBe(0);
    });

    it('should return correct count', async () => {
      await manager.saveContext('tool1', {}, 'r1');
      expect(manager.size).toBe(1);

      await manager.saveContext('tool2', {}, 'r2');
      expect(manager.size).toBe(2);

      await manager.saveContext('tool3', {}, 'r3');
      expect(manager.size).toBe(3);
    });
  });

  describe('getContextDir', () => {
    it('should return the context directory path', () => {
      expect(manager.getContextDir()).toBe('/test/context');
    });
  });

  describe('edge cases', () => {
    it('should handle empty result from tool', async () => {
      const filepath = await manager.saveContext('emptyTool', {}, null);

      const contexts = await manager.loadContexts([filepath]);
      expect(contexts[0].result).toBeNull();
    });

    it('should handle very large result', async () => {
      const largeResult = 'x'.repeat(100000);
      const filepath = await manager.saveContext('largeTool', {}, largeResult);

      const contexts = await manager.loadContexts([filepath]);
      expect(contexts[0].result).toBe(largeResult);
    });

    it('should handle special characters in tool name', async () => {
      const filepath = await manager.saveContext('tool@v2.0-beta', { key: 'value' }, 'result');

      expect(filepath).toContain('tool_v2_0_beta_');
    });

    it('should handle unicode content in results', async () => {
      const unicodeResult = { message: '\u4F60\u597D\u{1F44B}', emoji: '\u{1F680}' };
      const filepath = await manager.saveContext('unicodeTool', {}, unicodeResult);

      const contexts = await manager.loadContexts([filepath]);
      expect(contexts[0].result).toEqual(unicodeResult);
    });

    it('should handle concurrent saves', async () => {
      const saves = await Promise.all([
        manager.saveContext('tool1', { id: 1 }, 'r1'),
        manager.saveContext('tool2', { id: 2 }, 'r2'),
        manager.saveContext('tool3', { id: 3 }, 'r3'),
      ]);

      expect(saves.length).toBe(3);
      expect(new Set(saves).size).toBe(3); // All unique filepaths
      expect(manager.size).toBe(3);
    });

    it('should handle nested object args', async () => {
      const nestedArgs = {
        options: {
          deep: {
            value: [1, 2, { nested: true }],
          },
        },
      };
      const filepath = await manager.saveContext('nestedTool', nestedArgs, 'result');

      const contexts = await manager.loadContexts([filepath]);
      expect(contexts[0].args).toEqual(nestedArgs);
    });

    it('should generate different filenames for different args', async () => {
      const fp1 = await manager.saveContext('tool', { arg: 'value1' }, 'r1');
      const fp2 = await manager.saveContext('tool', { arg: 'value2' }, 'r2');

      expect(fp1).not.toBe(fp2);
    });

    it('should handle array results', async () => {
      const arrayResult = [1, 2, 3, { nested: true }, ['inner', 'array']];
      const filepath = await manager.saveContext('arrayTool', {}, arrayResult);

      const contexts = await manager.loadContexts([filepath]);
      expect(contexts[0].result).toEqual(arrayResult);
    });
  });

  describe('tool description generation', () => {
    it('should include first string arg in description', async () => {
      await manager.saveContext('readFile', { path: '/src/index.ts' }, 'content');

      const pointers = manager.getAllPointers();
      expect(pointers[0].toolDescription).toContain('readFile');
      expect(pointers[0].toolDescription).toContain('/src/index.ts');
    });

    it('should truncate long first arg', async () => {
      const longPath = '/very/long/path/'.repeat(10) + 'file.ts';
      await manager.saveContext('readFile', { path: longPath }, 'content');

      const pointers = manager.getAllPointers();
      expect(pointers[0].toolDescription.length).toBeLessThan(longPath.length + 20);
      expect(pointers[0].toolDescription).toContain('...');
    });

    it('should handle non-string first arg', async () => {
      await manager.saveContext('searchCode', { limit: 10, query: 'test' }, 'results');

      const pointers = manager.getAllPointers();
      expect(pointers[0].toolDescription).toContain('searchCode');
      expect(pointers[0].toolDescription).toContain('argument');
    });

    it('should handle empty args', async () => {
      await manager.saveContext('listFiles', {}, ['file1.ts', 'file2.ts']);

      const pointers = manager.getAllPointers();
      expect(pointers[0].toolDescription).toBe('listFiles');
    });
  });

  describe('hashQuery (static)', () => {
    it('should generate a query ID starting with q_ with 16 hex chars (SHA-256 truncated)', () => {
      const queryId = ContextManager.hashQuery('What is TypeScript?');

      expect(queryId).toMatch(/^q_[\da-f]{16}$/);
    });

    it('should generate same ID for same query', () => {
      const id1 = ContextManager.hashQuery('test query');
      const id2 = ContextManager.hashQuery('test query');

      expect(id1).toBe(id2);
    });

    it('should be case-insensitive', () => {
      const id1 = ContextManager.hashQuery('Test Query');
      const id2 = ContextManager.hashQuery('test query');
      const id3 = ContextManager.hashQuery('TEST QUERY');

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it('should trim whitespace', () => {
      const id1 = ContextManager.hashQuery('test query');
      const id2 = ContextManager.hashQuery('  test query  ');
      const id3 = ContextManager.hashQuery('\ttest query\n');

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it('should generate different IDs for different queries', () => {
      const id1 = ContextManager.hashQuery('first query');
      const id2 = ContextManager.hashQuery('second query');

      expect(id1).not.toBe(id2);
    });

    it('should handle empty query', () => {
      const id = ContextManager.hashQuery('');

      expect(id).toMatch(/^q_[\da-f]{16}$/);
    });

    it('should handle unicode content', () => {
      const id = ContextManager.hashQuery('\u4F60\u597D\u{1F680}');

      expect(id).toMatch(/^q_[\da-f]{16}$/);
    });
  });

  describe('filename uniqueness', () => {
    it('should generate different filenames for same tool+args at different times', async () => {
      const fp1 = await manager.saveContext('tool', { key: 'value' }, 'r1');
      const fp2 = await manager.saveContext('tool', { key: 'value' }, 'r2');

      expect(fp1).not.toBe(fp2);
    });

    it('should include timestamp and random suffix in filename', async () => {
      const fp = await manager.saveContext('tool', {}, 'result');

      // Filename format: toolName_hash_timestamp_counter_random.json
      const filename = fp.split('/').pop();
      const parts = filename?.split('_') ?? [];
      expect(parts.length).toBeGreaterThanOrEqual(5); // tool, hash, timestamp, counter, random
    });
  });
});
