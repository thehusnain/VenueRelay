import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
const folder = resolve(process.env.EMAIL_PREVIEW_DIR ?? 'data/mail-preview'),
  recipient = process.argv[2]?.toLowerCase();
if (!existsSync(folder)) {
  console.log(
    'No local email preview yet. Create an account or request a reset, then wait a few seconds.',
  );
  process.exit(0);
}
const files = readdirSync(folder)
  .filter((name) => name.endsWith('.eml'))
  .map((name) => ({ name, time: statSync(join(folder, name)).mtimeMs }))
  .sort((a, b) => b.time - a.time);
const message = files
  .map((file) => readFileSync(join(folder, file.name), 'utf8'))
  .find((value) => !recipient || value.toLowerCase().startsWith(`to: ${recipient}\n`));
if (!message) {
  console.log('No local preview was found for that email. Wait a few seconds and try again.');
  process.exit(0);
}
console.log('LOCAL EMAIL PREVIEW — no message was sent to an external inbox.\n');
console.log(message);
