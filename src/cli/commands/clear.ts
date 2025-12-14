/**
 * Clear command handler.
 */

import type { CommandHandler, CommandResult } from './types.js';

export const clearHandler: CommandHandler = (_args, _context): Promise<CommandResult> => {
  return Promise.resolve({
    success: true,
    shouldClear: true,
    shouldClearHistory: true,
    message: 'Screen and history cleared',
  });
};
