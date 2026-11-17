import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const fail = (message) => {
  console.error(`\nVenueRelay could not start. ${message}\n`);
  process.exit(1);
};
if (Number(process.versions.node.split('.')[0]) !== 24)
  fail('Use Node.js 24, then run npm install and npm run dev again.');
if (!existsSync('node_modules/vite/bin/vite.js') || !existsSync('node_modules/tsx'))
  fail('Dependencies are missing. Run npm install in the project folder first.');

const apiPort = Number(process.env.PORT ?? 3001);
const webPort = Number(process.env.WEB_PORT ?? 5173);
const apiHost = process.env.HOST ?? '127.0.0.1';
for (const [label, port] of [
  ['PORT', apiPort],
  ['WEB_PORT', webPort],
])
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    fail(`${label} must be a number between 1 and 65535.`);
if (apiPort === webPort) fail('PORT and WEB_PORT must be different. Defaults are 3001 and 5173.');
const localHost = ['0.0.0.0', '::'].includes(apiHost) ? '127.0.0.1' : apiHost;
const appUrl = `http://${localHost.includes(':') ? `[${localHost}]` : localHost}:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
process.env.APP_ORIGIN ??= appUrl;
process.env.ALLOWED_ORIGINS ??= `${webUrl},http://localhost:${webPort}`;

// Fail before building if another dev session is already using either port.
for (const [port, host] of [
  [apiPort, apiHost],
  [webPort, '127.0.0.1'],
]) {
  await new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', (error) =>
      fail(
        error.code === 'EADDRINUSE'
          ? `Port ${port} is already in use. Stop the other server with Ctrl+C, then try again. You can also set PORT and WEB_PORT in an optional .env file.`
          : `Cannot open port ${port}. Check HOST and local network permissions.`,
      ),
    );
    probe.listen(port, host, () => probe.close(resolve));
  });
}

console.log('\nPreparing VenueRelay, including offline support…\n');
const built = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--config', 'frontend/vite.config.ts'],
  { stdio: 'inherit' },
);
if (built.status !== 0) fail('The frontend build failed. Review the error above and try again.');
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
function stop(code, signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill(signal);
  // Give the API time to close its database and connections, including on Ctrl+C.
  const deadline = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  }, 22000);
  deadline.unref();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop(0, signal));
for (const child of children) {
  child.once('error', () => {
    console.error('A development process could not start. Run npm install and try again.');
    stop(1);
  });
  child.once('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
}

let ready = false;
for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
  try {
    const responses = await Promise.all([
      fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(1000) }),
      fetch(webUrl, { signal: AbortSignal.timeout(1000) }),
    ]);
    if (responses.every((response) => response.ok)) {
      ready = true;
      break;
    }
  } catch {}
  await delay(500);
}
if (ready && !stopping)
  console.log(
    `\nVenueRelay is ready.\n\n  Open the app: ${appUrl}\n  Live frontend editor: ${webUrl}\n\nChoose “Explore the demo” to get started.\n${process.env.MONGODB_URI ? 'Using your configured MongoDB database.' : 'Your local database is created automatically in data/.'}\nUse the app URL for installation and offline testing.\nPress Ctrl+C to stop both servers.\n`,
  );
else if (!stopping) {
  console.error(
    'The app did not become ready. Check the startup error above, then run npm run dev again.',
  );
  stop(1);
}
