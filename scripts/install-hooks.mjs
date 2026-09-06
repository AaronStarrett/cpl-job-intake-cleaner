import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (existsSync('.git')) {
  const result = spawnSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
