import { spawn, spawnSync } from 'node:child_process';
const built = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--config', 'frontend/vite.config.ts'],
  { stdio: 'inherit' },
);
if (built.status !== 0) process.exit(built.status ?? 1);
console.log(
  '\nOpen Rally: http://127.0.0.1:3001\nLive frontend editor: http://127.0.0.1:5173\nThe local database is created automatically.\n',
);
const children = [
  spawn(process.execPath, ['--import', 'tsx', '--watch', 'backend/src/index.ts'], {
    stdio: 'inherit',
  }),
  spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--config', 'frontend/vite.config.ts'],
    { stdio: 'inherit' },
  ),
];
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stopping = true;
    for (const child of children) child.kill(signal);
    process.exit(0);
  });
for (const child of children)
  child.once('exit', (code) => {
    if (!stopping) {
      for (const other of children) if (other !== child) other.kill();
      process.exit(code ?? 1);
    }
  });
