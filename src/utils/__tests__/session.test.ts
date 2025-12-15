/**
 * Tests for SessionManager class.
 */

import { SessionManager } from '../session.js';
import type { SessionIndex, StoredSession } from '../session.js';
import type { StoredMessage } from '../message-history.js';
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
    rename(oldPath: string, newPath: string): Promise<void> {
      const content = state.files.get(oldPath);
      if (content === undefined) {
        return Promise.reject(new Error(`File not found: ${oldPath}`));
      }
      state.files.delete(oldPath);
      state.files.set(newPath, content);
      return Promise.resolve();
    },
  };
}

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createTestMessages(count: number): StoredMessage[] {
  const messages: StoredMessage[] = [];
  for (let i = 0; i < count; i++) {
    const isUser = i % 2 === 0;
    messages.push({
      role: isUser ? 'user' : 'assistant',
      content: isUser ? `User message ${String(i)}` : `Assistant response ${String(i)}`,
      id: `msg-${String(i)}`,
      timestamp: new Date().toISOString(),
      turnIndex: Math.floor(i / 2),
    });
  }
  return messages;
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('SessionManager', () => {
  let mockFs: ReturnType<typeof createMockFileSystem>;
  let manager: SessionManager;

  beforeEach(() => {
    mockFs = createMockFileSystem();
    manager = new SessionManager({
      sessionDir: '/test/sessions',
      fileSystem: mockFs,
    });
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const defaultManager = new SessionManager({ fileSystem: mockFs });
      expect(defaultManager.getSessionDir()).toBe('/home/testuser/.agent/sessions');
    });

    it('should accept custom sessionDir', () => {
      const customManager = new SessionManager({
        sessionDir: '/custom/sessions',
        fileSystem: mockFs,
      });
      expect(customManager.getSessionDir()).toBe('/custom/sessions');
    });

    it('should accept custom maxSessions', () => {
      const customManager = new SessionManager({
        sessionDir: '/test/sessions',
        maxSessions: 10,
        fileSystem: mockFs,
      });
      expect(customManager).toBeDefined();
    });

    it('should accept debug callback', () => {
      const debugMsgs: string[] = [];
      const _debugManager = new SessionManager({
        sessionDir: '/test/sessions',
        fileSystem: mockFs,
        onDebug: (msg) => debugMsgs.push(msg),
      });

      expect(debugMsgs.length).toBeGreaterThan(0);
      expect(debugMsgs[0]).toContain('initialized');
      expect(_debugManager).toBeDefined();
    });

    it('should resolve ~ in sessionDir path', () => {
      const tildeManager = new SessionManager({
        sessionDir: '~/.agent/sessions',
        fileSystem: mockFs,
      });
      expect(tildeManager.getSessionDir()).toBe('/home/testuser/.agent/sessions');
    });
  });

  describe('saveSession', () => {
    it('should create session directory if missing', async () => {
      const messages = createTestMessages(4);
      await manager.saveSession(messages);

      expect(mockFs.state.dirs.has('/test/sessions')).toBe(true);
    });

    it('should generate unique session ID from timestamp with milliseconds and random suffix', async () => {
      const messages = createTestMessages(2);
      const meta = await manager.saveSession(messages);

      // Format: YYYY-MM-DD-HH-MM-SS-mmm-rrrr (milliseconds + 4-char random suffix)
      // Random suffix uses base64url encoding (alphanumeric, hyphen, underscore)
      expect(meta.id).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-[A-Za-z0-9_-]{4}$/);
    });

    it('should accept custom session name', async () => {
      const messages = createTestMessages(2);
      const meta = await manager.saveSession(messages, { name: 'my-session' });

      expect(meta.id).toBe('my-session');
      expect(meta.name).toBe('my-session');
    });

    it('should sanitize session name', async () => {
      const messages = createTestMessages(2);
      const meta = await manager.saveSession(messages, { name: 'My Session With Spaces!' });

      expect(meta.id).toBe('my-session-with-spaces');
    });

    it('should write valid JSON with all metadata fields', async () => {
      const messages = createTestMessages(4);
      const meta = await manager.saveSession(messages, {
        name: 'test-session',
        description: 'Test description',
        provider: 'openai',
        model: 'gpt-4o',
      });

      const filepath = `/test/sessions/${meta.id}.json`;
      const content = mockFs.state.files.get(filepath);
      expect(content).toBeDefined();
      if (content === undefined) throw new Error('content should be defined');

      const parsed = JSON.parse(content) as StoredSession;
      expect(parsed.metadata.id).toBe('test-session');
      expect(parsed.metadata.name).toBe('test-session');
      expect(parsed.metadata.description).toBe('Test description');
      expect(parsed.metadata.provider).toBe('openai');
      expect(parsed.metadata.model).toBe('gpt-4o');
      expect(parsed.metadata.messageCount).toBe(4);
      expect(parsed.messages.length).toBe(4);
      expect(parsed.contextSummary).toBeDefined();
    });

    it('should update session index', async () => {
      const messages = createTestMessages(2);
      const meta = await manager.saveSession(messages, { name: 'indexed-session' });

      const indexContent = mockFs.state.files.get('/test/sessions/index.json');
      expect(indexContent).toBeDefined();
      if (indexContent === undefined) throw new Error('indexContent should be defined');

      const index = JSON.parse(indexContent) as SessionIndex;
      expect(index.sessions[meta.id]).toBeDefined();
      expect(index.sessions[meta.id].id).toBe('indexed-session');
    });

    it('should update last session pointer', async () => {
      const messages = createTestMessages(2);
      const meta = await manager.saveSession(messages, { name: 'latest-session' });

      const lastSessionContent = mockFs.state.files.get('/test/sessions/last_session');
      expect(lastSessionContent).toBe(meta.id);
    });

    it('should capture first user message preview', async () => {
      const messages: StoredMessage[] = [
        {
          role: 'user',
          content: 'Hello, this is my first message',
          id: '1',
          timestamp: new Date().toISOString(),
        },
        { role: 'assistant', content: 'Hi there!', id: '2', timestamp: new Date().toISOString() },
      ];
      const meta = await manager.saveSession(messages);

      expect(meta.firstMessage).toBe('Hello, this is my first message');
    });

    it('should return session metadata', async () => {
      const messages = createTestMessages(6);
      const meta = await manager.saveSession(messages, {
        name: 'return-test',
        provider: 'anthropic',
        model: 'claude-3',
      });

      expect(meta.id).toBe('return-test');
      expect(meta.messageCount).toBe(6);
      expect(meta.provider).toBe('anthropic');
      expect(meta.model).toBe('claude-3');
      expect(meta.createdAt).toBeDefined();
      expect(meta.lastActivityAt).toBeDefined();
    });

    it('should enforce max sessions limit', async () => {
      const limitedManager = new SessionManager({
        sessionDir: '/test/sessions',
        maxSessions: 3,
        fileSystem: mockFs,
      });

      const messages = createTestMessages(2);
      // Sessions saved in rapid succession may have same timestamp
      // Sorting uses id as secondary key (descending), so higher ids are "newer"
      await limitedManager.saveSession(messages, { name: 'session-1' });
      await limitedManager.saveSession(messages, { name: 'session-2' });
      await limitedManager.saveSession(messages, { name: 'session-3' });
      await limitedManager.saveSession(messages, { name: 'session-4' });

      const sessions = await limitedManager.listSessions();
      expect(sessions.length).toBe(3);

      // With same timestamps, sorted by id descending: session-4, session-3, session-2
      // So session-1 (lowest id) should be deleted
      expect(sessions.map((s) => s.id).sort()).toEqual(['session-2', 'session-3', 'session-4']);
    });
  });

  describe('loadSession', () => {
    it('should load valid session file', async () => {
      const messages = createTestMessages(4);
      const meta = await manager.saveSession(messages, { name: 'load-test' });

      const session = await manager.loadSession(meta.id);

      expect(session).not.toBeNull();
      expect(session?.metadata.id).toBe('load-test');
      expect(session?.messages.length).toBe(4);
    });

    it('should return null for missing session', async () => {
      const session = await manager.loadSession('non-existent');

      expect(session).toBeNull();
    });

    it('should handle corrupted JSON gracefully', async () => {
      const debugMsgs: string[] = [];
      const debugManager = new SessionManager({
        sessionDir: '/test/sessions',
        fileSystem: mockFs,
        onDebug: (msg) => debugMsgs.push(msg),
      });

      // Create a corrupted session file
      mockFs.state.files.set('/test/sessions/corrupted.json', 'not valid json {{{');

      const session = await debugManager.loadSession('corrupted');

      expect(session).toBeNull();
      expect(debugMsgs.some((m) => m.includes('Failed to load'))).toBe(true);
    });
  });

  describe('listSessions', () => {
    it('should return empty array for no sessions', async () => {
      const sessions = await manager.listSessions();

      expect(sessions).toEqual([]);
    });

    it('should return sorted list (newest first)', async () => {
      const messages = createTestMessages(2);

      await manager.saveSession(messages, { name: 'oldest' });
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      await manager.saveSession(messages, { name: 'middle' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await manager.saveSession(messages, { name: 'newest' });

      const sessions = await manager.listSessions();

      expect(sessions.length).toBe(3);
      expect(sessions[0].id).toBe('newest');
      expect(sessions[2].id).toBe('oldest');
    });

    it('should load from index file', async () => {
      const messages = createTestMessages(2);
      await manager.saveSession(messages, { name: 'session-a' });
      await manager.saveSession(messages, { name: 'session-b' });

      const sessions = await manager.listSessions();

      expect(sessions.length).toBe(2);
    });
  });

  describe('deleteSession', () => {
    it('should delete session file', async () => {
      const messages = createTestMessages(2);
      const meta = await manager.saveSession(messages, { name: 'to-delete' });

      const filepath = `/test/sessions/${meta.id}.json`;
      expect(mockFs.state.files.has(filepath)).toBe(true);

      const result = await manager.deleteSession(meta.id);

      expect(result).toBe(true);
      expect(mockFs.state.files.has(filepath)).toBe(false);
    });

    it('should remove from index', async () => {
      const messages = createTestMessages(2);
      const meta = await manager.saveSession(messages, { name: 'indexed-delete' });

      await manager.deleteSession(meta.id);

      const indexContent = mockFs.state.files.get('/test/sessions/index.json');
      if (indexContent === undefined) throw new Error('index should exist');
      const index = JSON.parse(indexContent) as SessionIndex;
      expect(index.sessions[meta.id]).toBeUndefined();
    });

    it('should return false for non-existent session', async () => {
      const result = await manager.deleteSession('non-existent');

      expect(result).toBe(false);
    });

    it('should update last session if deleted session was last', async () => {
      const messages = createTestMessages(2);
      await manager.saveSession(messages, { name: 'first-session' });
      const lastMeta = await manager.saveSession(messages, { name: 'last-session' });

      // Verify last session is set
      let lastSession = await manager.getLastSession();
      expect(lastSession).toBe(lastMeta.id);

      // Delete last session
      await manager.deleteSession(lastMeta.id);

      // Should update to next most recent
      lastSession = await manager.getLastSession();
      expect(lastSession).toBe('first-session');
    });
  });

  describe('getLastSession', () => {
    it('should return session ID when set', async () => {
      const messages = createTestMessages(2);
      const meta = await manager.saveSession(messages, { name: 'tracked-session' });

      const lastSession = await manager.getLastSession();

      expect(lastSession).toBe(meta.id);
    });

    it('should return null when not set', async () => {
      const lastSession = await manager.getLastSession();

      expect(lastSession).toBeNull();
    });

    it('should return null if last session file is missing', async () => {
      // Create session then delete the last_session file
      const messages = createTestMessages(2);
      await manager.saveSession(messages, { name: 'test' });
      mockFs.state.files.delete('/test/sessions/last_session');

      const lastSession = await manager.getLastSession();

      expect(lastSession).toBeNull();
    });

    it('should return null if last session no longer exists', async () => {
      const messages = createTestMessages(2);
      const meta = await manager.saveSession(messages, { name: 'deleted-session' });

      // Manually remove the session file but keep last_session pointer
      mockFs.state.files.delete(`/test/sessions/${meta.id}.json`);

      const lastSession = await manager.getLastSession();

      expect(lastSession).toBeNull();
    });
  });

  describe('purgeSessions', () => {
    it('should keep specified count', async () => {
      const messages = createTestMessages(2);
      await manager.saveSession(messages, { name: 'keep-1' });
      await manager.saveSession(messages, { name: 'keep-2' });
      await manager.saveSession(messages, { name: 'delete-1' });
      await manager.saveSession(messages, { name: 'delete-2' });

      const deleted = await manager.purgeSessions(2);

      expect(deleted).toBe(2);
      const sessions = await manager.listSessions();
      expect(sessions.length).toBe(2);
    });

    it('should delete oldest first', async () => {
      const messages = createTestMessages(2);
      await manager.saveSession(messages, { name: 'oldest' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await manager.saveSession(messages, { name: 'middle' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await manager.saveSession(messages, { name: 'newest' });

      await manager.purgeSessions(2);

      const sessions = await manager.listSessions();
      expect(sessions.find((s) => s.id === 'oldest')).toBeUndefined();
      expect(sessions.find((s) => s.id === 'newest')).toBeDefined();
    });

    it('should return count deleted', async () => {
      const messages = createTestMessages(2);
      await manager.saveSession(messages, { name: 's1' });
      await manager.saveSession(messages, { name: 's2' });
      await manager.saveSession(messages, { name: 's3' });

      const deleted = await manager.purgeSessions(1);

      expect(deleted).toBe(2);
    });

    it('should return 0 if under limit', async () => {
      const messages = createTestMessages(2);
      await manager.saveSession(messages, { name: 's1' });
      await manager.saveSession(messages, { name: 's2' });

      const deleted = await manager.purgeSessions(5);

      expect(deleted).toBe(0);
    });

    it('should use maxSessions if keepCount not specified', async () => {
      const limitedManager = new SessionManager({
        sessionDir: '/test/sessions',
        maxSessions: 2,
        fileSystem: mockFs,
      });

      const messages = createTestMessages(2);
      await limitedManager.saveSession(messages, { name: 's1' });
      await limitedManager.saveSession(messages, { name: 's2' });
      await limitedManager.saveSession(messages, { name: 's3' });
      await limitedManager.saveSession(messages, { name: 's4' });

      // maxSessions enforced during save, so already at 2
      const sessions = await limitedManager.listSessions();
      expect(sessions.length).toBe(2);
    });
  });

  describe('restoreSession', () => {
    it('should return messages and context summary', async () => {
      const messages = createTestMessages(4);
      const meta = await manager.saveSession(messages, {
        name: 'restore-test',
        description: 'A test session',
      });

      const result = await manager.restoreSession(meta.id);

      expect(result).not.toBeNull();
      expect(result?.messages.length).toBe(4);
      expect(result?.contextSummary).toBeDefined();
      expect(result?.contextSummary).toContain('resuming');
    });

    it('should return null if session not found', async () => {
      const result = await manager.restoreSession('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('sessionExists', () => {
    it('should return true for existing session', async () => {
      const messages = createTestMessages(2);
      const meta = await manager.saveSession(messages, { name: 'exists-test' });

      const exists = await manager.sessionExists(meta.id);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const exists = await manager.sessionExists('non-existent');

      expect(exists).toBe(false);
    });
  });

  describe('session name validation', () => {
    it('should accept valid names', async () => {
      const messages = createTestMessages(2);

      await expect(manager.saveSession(messages, { name: 'valid-name' })).resolves.toBeDefined();
      await expect(manager.saveSession(messages, { name: 'valid_name' })).resolves.toBeDefined();
      await expect(manager.saveSession(messages, { name: 'valid.name' })).resolves.toBeDefined();
      await expect(manager.saveSession(messages, { name: 'valid123' })).resolves.toBeDefined();
    });

    it('should reject path traversal attempts', async () => {
      const messages = createTestMessages(2);

      await expect(manager.saveSession(messages, { name: '../etc/passwd' })).rejects.toThrow(
        'invalid characters'
      );
      await expect(manager.saveSession(messages, { name: 'test/../parent' })).rejects.toThrow(
        'invalid characters'
      );
    });

    it('should reject reserved names', async () => {
      const messages = createTestMessages(2);

      await expect(manager.saveSession(messages, { name: 'index' })).rejects.toThrow('reserved');
      await expect(manager.saveSession(messages, { name: 'metadata' })).rejects.toThrow('reserved');
      await expect(manager.saveSession(messages, { name: 'con' })).rejects.toThrow('reserved');
      await expect(manager.saveSession(messages, { name: 'nul' })).rejects.toThrow('reserved');
    });

    it('should enforce length limits', async () => {
      const messages = createTestMessages(2);
      const longName = 'a'.repeat(100);

      const meta = await manager.saveSession(messages, { name: longName });

      expect(meta.id.length).toBeLessThanOrEqual(64);
    });
  });

  describe('index management', () => {
    it('should create index if not exists', async () => {
      const messages = createTestMessages(2);
      await manager.saveSession(messages);

      const indexContent = mockFs.state.files.get('/test/sessions/index.json');
      expect(indexContent).toBeDefined();
    });

    it('should rebuild index from files if corrupted', async () => {
      const debugMsgs: string[] = [];
      const debugManager = new SessionManager({
        sessionDir: '/test/sessions',
        fileSystem: mockFs,
        onDebug: (msg) => debugMsgs.push(msg),
      });

      // Create a session first
      const messages = createTestMessages(2);
      await debugManager.saveSession(messages, { name: 'existing-session' });

      // Corrupt the index
      mockFs.state.files.set('/test/sessions/index.json', 'corrupted');

      // Accessing sessions should rebuild index
      const sessions = await debugManager.listSessions();

      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe('existing-session');
    });

    it('should handle invalid index structure', async () => {
      const messages = createTestMessages(2);
      await manager.saveSession(messages, { name: 'test-session' });

      // Set invalid index structure
      mockFs.state.files.set('/test/sessions/index.json', JSON.stringify({ invalid: true }));

      const sessions = await manager.listSessions();

      // Should rebuild and find the session
      expect(sessions.length).toBe(1);
    });
  });

  describe('context summary generation', () => {
    it('should include session metadata', async () => {
      const messages = createTestMessages(4);
      const meta = await manager.saveSession(messages, {
        name: 'summary-test',
        description: 'Test session for summary',
      });

      const session = await manager.loadSession(meta.id);

      expect(session?.contextSummary).toContain('resuming');
      expect(session?.contextSummary).toContain('summary-test');
      expect(session?.contextSummary).toContain('Test session for summary');
    });

    it('should include message counts', async () => {
      const messages = createTestMessages(6);
      const meta = await manager.saveSession(messages);

      const session = await manager.loadSession(meta.id);

      expect(session?.contextSummary).toContain('6');
      expect(session?.contextSummary).toContain('3 from user');
      expect(session?.contextSummary).toContain('3 from assistant');
    });

    it('should include first topic preview', async () => {
      const messages: StoredMessage[] = [
        {
          role: 'user',
          content: 'Help me with TypeScript generics',
          id: '1',
          timestamp: new Date().toISOString(),
        },
        { role: 'assistant', content: 'Sure!', id: '2', timestamp: new Date().toISOString() },
      ];
      const meta = await manager.saveSession(messages);

      const session = await manager.loadSession(meta.id);

      expect(session?.contextSummary).toContain('TypeScript generics');
    });
  });

  describe('edge cases', () => {
    it('should handle empty session (no messages)', async () => {
      const meta = await manager.saveSession([]);

      expect(meta.messageCount).toBe(0);
      expect(meta.firstMessage).toBe('');
    });

    it('should handle very long session', async () => {
      const messages = createTestMessages(1000);
      const meta = await manager.saveSession(messages);

      expect(meta.messageCount).toBe(1000);

      const session = await manager.loadSession(meta.id);
      expect(session?.messages.length).toBe(1000);
    });

    it('should handle special characters in messages', async () => {
      const messages: StoredMessage[] = [
        {
          role: 'user',
          content: 'Test with "quotes" and \'apostrophes\'',
          id: '1',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: 'Response with <tags> & entities',
          id: '2',
          timestamp: new Date().toISOString(),
        },
      ];
      const meta = await manager.saveSession(messages);

      const session = await manager.loadSession(meta.id);
      expect(session?.messages[0].content).toBe('Test with "quotes" and \'apostrophes\'');
      expect(session?.messages[1].content).toBe('Response with <tags> & entities');
    });

    it('should handle unicode content', async () => {
      const messages: StoredMessage[] = [
        {
          role: 'user',
          content: '\u4F60\u597D\u{1F44B}',
          id: '1',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: '\u{1F680} Rocket!',
          id: '2',
          timestamp: new Date().toISOString(),
        },
      ];
      const meta = await manager.saveSession(messages);

      const session = await manager.loadSession(meta.id);
      expect(session?.messages[0].content).toBe('\u4F60\u597D\u{1F44B}');
    });

    it('should handle concurrent saves', async () => {
      const messages = createTestMessages(2);

      const saves = await Promise.all([
        manager.saveSession(messages, { name: 'concurrent-1' }),
        manager.saveSession(messages, { name: 'concurrent-2' }),
        manager.saveSession(messages, { name: 'concurrent-3' }),
      ]);

      expect(saves.length).toBe(3);
      expect(new Set(saves.map((s) => s.id)).size).toBe(3);
    });

    it('should handle session with only assistant messages', async () => {
      const messages: StoredMessage[] = [
        { role: 'assistant', content: 'Hello!', id: '1', timestamp: new Date().toISOString() },
        {
          role: 'assistant',
          content: 'How can I help?',
          id: '2',
          timestamp: new Date().toISOString(),
        },
      ];
      const meta = await manager.saveSession(messages);

      expect(meta.firstMessage).toBe('');
      expect(meta.messageCount).toBe(2);
    });

    it('should handle tool messages', async () => {
      const messages: StoredMessage[] = [
        { role: 'user', content: 'Read file', id: '1', timestamp: new Date().toISOString() },
        {
          role: 'tool',
          content: 'file contents',
          id: '2',
          timestamp: new Date().toISOString(),
          name: 'readFile',
          toolCallId: 'tc-1',
        },
        {
          role: 'assistant',
          content: 'Here is the file',
          id: '3',
          timestamp: new Date().toISOString(),
        },
      ];
      const meta = await manager.saveSession(messages);

      const session = await manager.loadSession(meta.id);
      expect(session?.messages.length).toBe(3);
      expect(session?.messages[1].role).toBe('tool');
    });
  });

  describe('getSessionDir', () => {
    it('should return the session directory path', () => {
      expect(manager.getSessionDir()).toBe('/test/sessions');
    });
  });
});
