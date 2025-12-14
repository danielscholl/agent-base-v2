/**
 * Version constant for CLI components.
 * Single source of truth for version string.
 */

// Read version from package.json at build time
// Using a static import ensures bundlers can tree-shake and inline
import pkg from '../../package.json' with { type: 'json' };

/** Application version from package.json */
export const VERSION: string = pkg.version;
