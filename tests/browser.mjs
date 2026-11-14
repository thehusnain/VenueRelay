import QRCode from 'qrcode';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const mode = ['design', 'pwa', 'layout'].includes(process.argv[2]) ? process.argv[2] : 'browser';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const scenario = eval(
    '(' + readFileSync(new URL(`./${mode}-scenario.js`, import.meta.url), 'utf8') + ')',
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
