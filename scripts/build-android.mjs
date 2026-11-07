import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const java = process.env.JAVA_HOME;
if (!sdk || !existsSync(resolve(sdk, 'platforms/android-36/android.jar'))) {
  console.error(
    'Install Android SDK platform 36 and build tools. Set ANDROID_HOME to its folder. See docs/MOBILE.md.',
  );
  process.exit(1);
}
if (
  !java ||
  !existsSync(resolve(java, 'bin/java' + (process.platform === 'win32' ? '.exe' : '')))
) {
  console.error('Install JDK 21 and set JAVA_HOME to its folder. See docs/MOBILE.md.');
  process.exit(1);
}
const env = { ...process.env, VITE_API_URL: process.env.VITE_API_URL || 'http://127.0.0.1:3001' };
function run(command, args, cwd = root, customEnv = env) {
  const result = spawnSync(command, args, { cwd, env: customEnv, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
run(process.execPath, [
  'node_modules/vite/bin/vite.js',
  'build',
  '--config',
  'frontend/vite.config.ts',
]);
run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']);
const gradle =
  process.env.RALLY_GRADLE || (process.platform === 'win32' ? 'gradlew.bat' : './gradlew');
run(gradle, ['--no-daemon', '--console=plain', 'assembleDebug'], resolve(root, 'mobile/android'));
mkdirSync(resolve(root, 'artifacts'), { recursive: true });
copyFileSync(
  resolve(root, 'mobile/android/app/build/outputs/apk/debug/app-debug.apk'),
  resolve(root, 'artifacts/rally-android-debug.apk'),
);
console.log(
  '\nAndroid app: artifacts/rally-android-debug.apk\nKeep npm run dev running. Connect USB, then adb reverse tcp:3001 tcp:3001.',
);
// Restore the browser build; the native project keeps its copied API configuration.
const browserEnv = { ...process.env };
delete browserEnv.VITE_API_URL;
run(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--config', 'frontend/vite.config.ts'],
  root,
  browserEnv,
);
