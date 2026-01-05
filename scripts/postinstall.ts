/**
 * Cross-platform postinstall script.
 * Only builds if src/ exists and dist/ doesn't (GitHub install scenario).
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const srcExists = existsSync(join(projectRoot, 'src'));
const distExists = existsSync(join(projectRoot, 'dist'));

if (srcExists && !distExists) {
  console.log('Building from source...');
  const result = spawnSync('bun', ['run', 'build'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });
  process.exit(result.status ?? 0);
} else {
  // Already built or npm install (no src)
  process.exit(0);
}
