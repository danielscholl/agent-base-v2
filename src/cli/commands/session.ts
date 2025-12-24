/**
 * Session management command handlers.
 * Provides /save, /sessions, /resume, and /purge commands.
 */

import type { CommandHandler, CommandResult } from './types.js';
import { SessionManager } from '../../utils/session.js';

// Shared SessionManager instance for CLI commands
// This is initialized lazily on first command use
let sessionManager: SessionManager | null = null;

/**
 * Get or create the SessionManager instance.
 */
function getSessionManager(): SessionManager {
  if (sessionManager === null) {
    sessionManager = new SessionManager();
  }
  return sessionManager;
}

/**
 * Handler for /save command.
 * Saves the current session with an optional name.
 * Usage: /save [name]
 */
export const saveHandler: CommandHandler = (args, context): Promise<CommandResult> => {
  const trimmed = args.trim();
  const name = trimmed !== '' ? trimmed : undefined;

  // Signal to InteractiveShell to perform the save with current messages
  context.onOutput(
    name !== undefined ? `Saving session as "${name}"...` : 'Saving session...',
    'info'
  );

  return Promise.resolve({
    success: true,
    shouldSaveSession: true,
    sessionName: name,
    message: 'Save session requested',
  });
};

/**
 * Handler for /sessions command.
 * Lists all saved sessions.
 * Usage: /sessions
 */
export const sessionsHandler: CommandHandler = async (_args, context): Promise<CommandResult> => {
  const manager = getSessionManager();

  try {
    const sessions = await manager.listSessions();

    if (sessions.length === 0) {
      context.onOutput('No saved sessions found.', 'info');
      context.onOutput('Use /save [name] to save the current session.', 'info');
      return { success: true, message: 'No sessions' };
    }

    context.onOutput(`Found ${String(sessions.length)} saved session(s):`, 'info');
    context.onOutput('', 'info');

    for (const session of sessions) {
      const date = new Date(session.lastActivityAt).toLocaleString();
      const preview = session.firstMessage.slice(0, 50);
      const previewText = preview.length < session.firstMessage.length ? `${preview}...` : preview;

      context.onOutput(`  ${session.id}`, 'success');
      context.onOutput(`    Last active: ${date}`, 'info');
      context.onOutput(`    Messages: ${String(session.messageCount)}`, 'info');
      if (previewText !== '') {
        context.onOutput(`    Preview: "${previewText}"`, 'info');
      }
      context.onOutput('', 'info');
    }

    context.onOutput('Use /resume <id> to resume a session.', 'info');

    return {
      success: true,
      shouldListSessions: true,
      data: sessions,
      message: `Listed ${String(sessions.length)} sessions`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    context.onOutput(`Failed to list sessions: ${message}`, 'error');
    return { success: false, message };
  }
};

/**
 * Handler for /resume command.
 * Resumes a saved session by ID.
 * Usage: /resume <session-id>
 */
export const resumeHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const sessionId = args.trim();

  if (!sessionId) {
    // If no ID provided and we're in interactive mode, show session selector
    const manager = getSessionManager();
    const sessions = await manager.listSessions();

    if (sessions.length === 0) {
      context.onOutput('No saved sessions to resume.', 'warning');
      context.onOutput('Use /save to save the current session first.', 'info');
      return { success: false, message: 'No sessions available' };
    }

    // In interactive mode, trigger the session selector UI
    if (context.isInteractive === true) {
      return {
        success: true,
        shouldShowSessionSelector: true,
        availableSessions: sessions,
        message: 'Showing session selector',
      };
    }

    // Non-interactive mode: show text list
    context.onOutput('Usage: /resume <session-id>', 'info');
    context.onOutput('', 'info');
    context.onOutput('Available sessions:', 'info');
    for (const session of sessions.slice(0, 5)) {
      const date = new Date(session.lastActivityAt).toLocaleString();
      context.onOutput(`  ${session.id} (${date}, ${String(session.messageCount)} msgs)`, 'info');
    }

    if (sessions.length > 5) {
      context.onOutput(
        `  ... and ${String(sessions.length - 5)} more. Use /sessions to see all.`,
        'info'
      );
    }

    return { success: false, message: 'No session ID provided' };
  }

  const manager = getSessionManager();

  try {
    const result = await manager.restoreSession(sessionId);

    if (result === null) {
      context.onOutput(`Session not found: ${sessionId}`, 'error');
      context.onOutput('Use /sessions to see available sessions.', 'info');
      return { success: false, message: 'Session not found' };
    }

    context.onOutput(`Resuming session: ${sessionId}`, 'success');
    context.onOutput(`Restored ${String(result.messages.length)} messages.`, 'info');

    return {
      success: true,
      sessionToResume: sessionId,
      sessionMessages: result.messages,
      sessionContextSummary: result.contextSummary ?? undefined,
      message: `Resumed session ${sessionId}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    context.onOutput(`Failed to resume session: ${message}`, 'error');
    return { success: false, message };
  }
};

/**
 * Handler for /purge command.
 * Deletes old sessions or a specific session.
 * Usage: /purge [count] or /purge <session-id>
 */
export const purgeHandler: CommandHandler = async (args, context): Promise<CommandResult> => {
  const arg = args.trim();
  const manager = getSessionManager();

  // If arg looks like a session ID (not a number), delete specific session
  if (arg && isNaN(parseInt(arg, 10))) {
    try {
      const deleted = await manager.deleteSession(arg);

      if (deleted) {
        context.onOutput(`Deleted session: ${arg}`, 'success');
        return { success: true, message: `Deleted session ${arg}` };
      } else {
        context.onOutput(`Session not found: ${arg}`, 'error');
        return { success: false, message: 'Session not found' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      context.onOutput(`Failed to delete session: ${message}`, 'error');
      return { success: false, message };
    }
  }

  // Otherwise, purge by count
  const keepCount = arg ? parseInt(arg, 10) : undefined;

  try {
    const deletedCount = await manager.purgeSessions(keepCount);

    if (deletedCount === 0) {
      context.onOutput('No sessions to purge.', 'info');
    } else {
      context.onOutput(`Purged ${String(deletedCount)} old session(s).`, 'success');
    }

    return {
      success: true,
      message: `Purged ${String(deletedCount)} sessions`,
      data: { deletedCount },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    context.onOutput(`Failed to purge sessions: ${message}`, 'error');
    return { success: false, message };
  }
};
