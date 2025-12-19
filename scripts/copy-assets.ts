/**
 * Cross-platform script to copy static assets to dist.
 * Works on both Unix and Windows.
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
];

console.log('Copying static assets to dist...');

for (const { src, dest } of assets) {
  const srcPath = join(projectRoot, src);
  const destPath = join(projectRoot, dest);

  if (!existsSync(srcPath)) {
    console.log(`  Skipping ${src} (not found)`);
    continue;
  }

  // Ensure parent directory exists
  mkdirSync(dirname(destPath), { recursive: true });

  // Copy recursively
  cpSync(srcPath, destPath, { recursive: true });
  console.log(`  Copied ${src} -> ${dest}`);
}

console.log('Done.');
