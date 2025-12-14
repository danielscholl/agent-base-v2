/**
 * Command history management.
 */

/** Maximum history entries to keep */
const MAX_HISTORY_SIZE = 100;

/**
 * Input history manager.
 * Provides history navigation and storage.
 */
export class InputHistory {
  private history: string[] = [];
  private position: number = -1;
  private tempInput: string = '';

  /**
   * Add entry to history.
   * Does not add empty strings or duplicates of the last entry.
   */
  add(input: string): void {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Don't add duplicate of last entry
    if (this.history.length > 0 && this.history[this.history.length - 1] === trimmed) {
      return;
    }

    this.history.push(trimmed);

    // Trim history if too large
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history = this.history.slice(-MAX_HISTORY_SIZE);
    }

    // Reset position for next navigation
    this.reset();
  }

  /**
   * Navigate to previous entry (up arrow).
   * Returns previous entry or undefined if at start.
   */
  previous(currentInput: string): string | undefined {
    if (this.history.length === 0) return undefined;

    // Save current input if starting navigation
    if (this.position === -1) {
      this.tempInput = currentInput;
      this.position = this.history.length;
    }

    // Move up in history
    if (this.position > 0) {
      this.position--;
      return this.history[this.position];
    }

    return undefined;
  }

  /**
   * Navigate to next entry (down arrow).
   * Returns next entry, temp input, or undefined if at end.
   */
  next(): string | undefined {
    if (this.position === -1) return undefined;

    // Move down in history
    if (this.position < this.history.length - 1) {
      this.position++;
      return this.history[this.position];
    }

    // Return to current input
    if (this.position === this.history.length - 1) {
      this.position = -1;
      return this.tempInput;
    }

    return undefined;
  }

  /**
   * Reset navigation position.
   * Call after submitting input.
   */
  reset(): void {
    this.position = -1;
    this.tempInput = '';
  }

  /**
   * Get all history entries.
   */
  getAll(): string[] {
    return [...this.history];
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.history = [];
    this.reset();
  }

  /**
   * Get current position in history (-1 means not navigating).
   */
  getPosition(): number {
    return this.position;
  }
}
