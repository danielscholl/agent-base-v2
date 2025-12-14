/**
 * Input handling types and interfaces.
 */

/** Input buffer state */
export interface InputState {
  /** Current input text */
  value: string;
  /** Cursor position (for future use) */
  cursorPosition: number;
  /** Whether currently navigating history */
  isNavigatingHistory: boolean;
}

/** Keyboard shortcut identifiers */
export type KeyboardShortcut =
  | 'escape'
  | 'ctrl+d'
  | 'ctrl+c'
  | 'up'
  | 'down'
  | 'return'
  | 'backspace'
  | 'delete';

/** Result of input processing */
export interface InputResult {
  /** Updated input state */
  state: InputState;
  /** Action to perform */
  action?: 'submit' | 'exit' | 'clear' | 'none';
}
