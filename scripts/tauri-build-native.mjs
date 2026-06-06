import { spawnSync } from 'node:child_process';

const isMacPushCi = process.platform === 'darwin' && process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true';
const args = ['tauri', 'build'];

if (isMacPushCi) {
  args.push('--no-bundle');
}

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
