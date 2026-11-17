import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
function pwaShell(): Plugin {
  return {
    name: 'rally-offline-shell',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter(
        (name) => name !== 'sw.js' && !name.endsWith('.map'),
      );
      const manifest = [
        '/index.html',
        '/favicon.svg',
        '/manifest.webmanifest',
        '/icon-192.png',
        '/icon-512.png',
        ...files.filter((name) => name !== 'index.html').map((name) => '/' + name),
      ];
      const fingerprint = createHash('sha256').update(files.join('|'));
      for (const name of ['favicon.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'])
        fingerprint.update(readFileSync(resolve(import.meta.dirname, 'public', name)));
      fingerprint.update(bundle['sw.js']?.type === 'chunk' ? bundle['sw.js'].code : '');
      const version = fingerprint.digest('hex').slice(0, 12);
      const sw = bundle['sw.js'];
      if (sw?.type === 'chunk')
        sw.code = sw.code
          .replace('__RALLY_PRECACHE__', JSON.stringify(manifest).replaceAll('"', '\\"'))
          .replace('__RALLY_VERSION__', version);
    },
  };
}
const apiHost = process.env.HOST ?? '127.0.0.1';
const proxyHost = ['0.0.0.0', '::'].includes(apiHost) ? '127.0.0.1' : apiHost;
export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [react(), pwaShell()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://${proxyHost.includes(':') ? `[${proxyHost}]` : proxyHost}:${process.env.PORT ?? 3001}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        sw: resolve(import.meta.dirname, 'src/sw.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  preview: { host: '127.0.0.1', port: 4173 },
});
