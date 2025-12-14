/**
 * Spinner component for loading indicators.
 * Uses Unicode Braille spinner animation.
 */

import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

/** Braille spinner animation frames */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Animation interval in milliseconds */
const FRAME_INTERVAL = 80;

/**
 * Props for Spinner component.
 */
export interface SpinnerProps {
  /** Message to display alongside spinner */
  message?: string;
}

/**
 * Animated spinner component.
 * Displays a Unicode Braille spinner with optional message.
 */
export function Spinner({ message = 'Loading...' }: SpinnerProps): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, FRAME_INTERVAL);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <Text color="cyan">
      {SPINNER_FRAMES[frame]} {message}
    </Text>
  );
}
