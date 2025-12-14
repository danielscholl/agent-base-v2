/**
 * Version component.
 * Displays framework version and exits.
 */

import React, { useEffect } from 'react';
import { Text, useApp } from 'ink';
import { VERSION } from '../cli/version.js';

/**
 * Version display component.
 * Shows version and exits the application.
 */
export function Version(): React.ReactElement {
  const { exit } = useApp();

  useEffect(() => {
    // Exit after displaying version (allow render to complete)
    const timer = setTimeout(() => {
      exit();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [exit]);

  return <Text>Agent Framework v{VERSION}</Text>;
}
