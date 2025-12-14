/**
 * Exit command handler.
 */

import type { CommandHandler, CommandResult } from './types.js';

export const exitHandler: CommandHandler = (_args, context): Promise<CommandResult> => {
  context.onOutput('Goodbye!', 'info');
  return Promise.resolve({
    success: true,
    shouldExit: true,
  });
};
