import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function deploymentOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Set RENDER_API_URL to the public HTTPS origin of your Render service.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('RENDER_API_URL must be an HTTPS origin without a path, query or credentials.');
  return url.origin;
}

export function outputConfig(api) {
  const backend = deploymentOrigin(api);
  const websocket = backend.replace(/^https:/, 'wss:');
  return {
    version: 3,
    routes: [
      {
        src: '/(.*)',
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'X-Frame-Options': 'DENY',
          'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
        },
        continue: true,
      },
      {
        src: '/api/(.*)',
        dest: `${backend}/api/$1`,
        headers: { 'Cache-Control': 'private, no-store' },
      },
      {
        src: '/(.*)',
        headers: {
          'Content-Security-Policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' ${websocket}; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          'Cache-Control': 'no-cache',
        },
        continue: true,
      },
      {
        src: '/sw.js',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Service-Worker-Allowed': '/',
        },
        continue: true,
      },
      {
        src: '/assets/(.*)',
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        continue: true,
      },
      { handle: 'filesystem' },
      { src: '/.*', dest: '/index.html' },
    ],
  };
}

async function build() {
  const api = deploymentOrigin(process.env.RENDER_API_URL);
  execFileSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: '', VITE_WS_URL: api },
  });
  await rm('.vercel/output', { recursive: true, force: true });
  await mkdir('.vercel/output', { recursive: true });
  await cp('frontend/dist', '.vercel/output/static', { recursive: true });
  await writeFile('.vercel/output/config.json', JSON.stringify(outputConfig(api), null, 2) + '\n');
  console.log('Vercel website prepared. HTTP uses the website origin; live updates use Render.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  build().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
