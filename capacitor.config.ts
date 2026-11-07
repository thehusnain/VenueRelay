import type { CapacitorConfig } from '@capacitor/cli';
const serverUrl = process.env.CAPACITOR_SERVER_URL;
const config: CapacitorConfig = {
  appId: 'app.rally.eventops',
  appName: 'Rally',
  webDir: 'frontend/dist',
  android: {
    path: 'mobile/android',
    allowMixedContent: !!process.env.VITE_API_URL?.startsWith('http://'),
  },
  ios: { path: 'mobile/ios', contentInset: 'automatic' },
  server: {
    ...(serverUrl ? { url: serverUrl } : {}),
    cleartext: !!(serverUrl ?? process.env.VITE_API_URL)?.startsWith('http://'),
  },
};
export default config;
