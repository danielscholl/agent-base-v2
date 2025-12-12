import React, { useEffect } from 'react';
import { render, useApp } from 'ink';
import { App } from './components/App.js';

/**
 * Wrapper component that exits after initial render (demo mode).
 */
function Main(): React.ReactElement {
  const { exit } = useApp();

  useEffect(() => {
    // Exit cleanly after initial render (non-interactive demo mode)
    exit();
  }, [exit]);

  return <App />;
}

const { waitUntilExit } = render(<Main />);
await waitUntilExit();
