import QRCode from 'qrcode';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
const mode = [
  'design',
  'pwa',
  'layout',
  'usability',
  'install',
  'account',
  'attendee',
  'mobile',
].includes(process.argv[2])
  ? process.argv[2]
  : 'browser';
const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
const browser = await engine.launch({
  headless: true,
  ...(engine === chromium && process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  ...(engine === chromium ? { args: ['--no-sandbox'] } : {}),
});
try {
  const page = await browser.newPage();
  const scenario = eval(
    '(' +
      readFileSync(new URL(`./${mode}-scenario.js`, import.meta.url), 'utf8')
        .trim()
        .replace(/;$/, '') +
      ')',
  );
  const root = fileURLToPath(new URL('../', import.meta.url));
  mkdirSync(new URL('../test-results/', import.meta.url), { recursive: true });
  if (mode === 'pwa')
    await QRCode.toFile(
      root + '/test-results/qr-task.png',
      (process.env.RALLY_TEST_URL ?? 'http://127.0.0.1:3001') + '/tasks/qr-test-nonexistent',
    );
  const result = await scenario(page, {
    root,
    base: process.env.RALLY_TEST_URL,
    hosted: process.env.RALLY_TEST_MONGO === 'true',
  });
  writeFileSync(
    new URL(`../test-results/${mode}-results.json`, import.meta.url),
    JSON.stringify(result, null, 2) + '\n',
  );
  for (const name of result.passed ??
    result.checks.map((check) => `${check.page} at ${check.width}px`))
    console.log('PASS:', name);
  if (result.error) throw new Error(result.error);
} finally {
  await browser.close();
}
