/**
 * Cross-platform script to copy static assets to dist.
 * Works on both Unix and Windows.
 *
 * Note: This script uses synchronous fs operations (cpSync, mkdirSync, existsSync)
 * instead of async operations. This is intentional because:
 * 1. This is a build-time script that runs once, not runtime code
 * 2. Synchronous operations are simpler and more reliable for sequential build steps
 * 3. Build processes are typically synchronous and blocking by nature
 * 4. No performance penalty since we're not blocking user interactions
 */

import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

interface AssetMapping {
  src: string;
  dest: string;
}

const assets: AssetMapping[] = [
  { src: 'src/_bundled_skills', dest: 'dist/_bundled_skills' },
  { src: 'src/prompts', dest: 'dist/prompts' },
  { src: 'src/commands', dest: 'dist/commands' },
];

console.log('Copying static assets to dist...');

try {
  for (const { src, dest } of assets) {
    const srcPath = join(projectRoot, src);
    const destPath = join(projectRoot, dest);

    if (!existsSync(srcPath)) {
      console.log(`  Skipping ${src} (not found)`);
      continue;
    }

    try {
      // Ensure parent directory exists
      mkdirSync(dirname(destPath), { recursive: true });

      // Copy recursively
      cpSync(srcPath, destPath, { recursive: true });
      console.log(`  Copied ${src} -> ${dest}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Failed to copy ${src}: ${message}`);
      process.exit(1);
    }
  }

  console.log('Done.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Asset copying failed: ${message}`);
  process.exit(1);
}
