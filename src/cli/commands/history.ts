/**
 * History command handler.
 * Displays conversation history.
 */

import type { CommandHandler, CommandResult } from './types.js';

/**
 * Handler for /history command.
 * Shows recent conversation messages.
 */
export const historyHandler: CommandHandler = (_args, _context): Promise<CommandResult> => {
  // The actual history display is handled by InteractiveShell via shouldShowHistory flag
  // This handler just signals the intent
  return Promise.resolve({
    success: true,
    shouldShowHistory: true,
    message: 'Showing conversation history',
  });
};
