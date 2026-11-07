import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  const scenario = eval(
    '(' + readFileSync(new URL('./browser-scenario.js', import.meta.url), 'utf8') + ')',
  );
  const root = fileURLToPath(new URL('../', import.meta.url));
  mkdirSync(new URL('../test-results/', import.meta.url), { recursive: true });
  const result = await scenario(page, { root, base: process.env.RALLY_TEST_URL });
  writeFileSync(
    new URL('../test-results/browser-results.json', import.meta.url),
    JSON.stringify(result, null, 2) + '\n',
  );
  for (const name of result.passed) console.log('PASS:', name);
  if (result.error) throw new Error(result.error);
} finally {
  await browser.close();
}
