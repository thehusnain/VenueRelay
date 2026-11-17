import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { MongoStore } from '../backend/src/mongo/store.ts';
import { demoCredentials } from '../shared/contracts.ts';

const tables = [
  'users',
  'events',
  'members',
  'tasks',
  'commands',
  'activity',
  'notifications',
  'invitations',
  'api_keys',
  'schedule',
  'announcements',
  'account_activity',
  'attendee_links',
  'attendee_receipts',
] as const;
export async function migrate(source: string, target: MongoStore, apply = false) {
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    db.exec('BEGIN');
    const version = db.prepare('PRAGMA user_version').get() as { user_version: number };
    if (![3, 4, 5, 6, 7, 8].includes(version.user_version))
      throw new Error(
        'Open the source with the current local VenueRelay first. Migration expects schema version 3 through 8.',
      );
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Source has invalid references. Migration stopped.');
    const rows: Record<string, Record<string, any>[]> = Object.fromEntries(
      tables.map((table) => [
        table,
        version.user_version < 5 && table.startsWith('attendee_')
          ? []
          : db.prepare(`SELECT * FROM ${table}`).all(),
      ]),
    );
    for (const invitation of rows.invitations) invitation.reusable = !!invitation.reusable;
    for (const user of rows.users) user.is_demo = user.email === demoCredentials.email;
    const counts = Object.fromEntries(tables.map((table) => [table, rows[table].length]));
    if (!apply) return { applied: false, counts };
    await target.transaction(async (tx) => {
      for (const table of [
        ...tables,
        'sessions',
        'account_tokens',
        'email_outbox',
        'push_subscriptions',
        'push_deliveries',
        'counters',
      ])
        if (await tx.get(table, {}))
          throw new Error(
            'Destination must be empty. Stop Render and choose a fresh database name.',
          );
      for (const table of tables) for (const row of rows[table]) await tx.insert(table, row);
      for (const event of rows.events) {
        const maximum = rows.activity
          .filter((row) => row.event_id === event.id)
          .reduce((max, row) => Math.max(max, Number(row.id)), 0);
        await tx.insert('counters', { name: 'activity:' + event.id, value: maximum });
      }
    });
    return { applied: true, counts };
  } finally {
    db.close();
  }
}

async function main() {
  const args = process.argv.slice(2),
    source = args.find((arg) => !arg.startsWith('--'));
  if (!source || args.some((arg) => arg.startsWith('--') && arg !== '--apply'))
    throw new Error('Usage: npm run db:migrate -- /path/to/rally.sqlite [--apply]');
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI privately before migrating.');
  const store = await MongoStore.connect(
    process.env.MONGODB_URI,
    process.env.MONGODB_DATABASE ?? 'rally',
  );
  try {
    console.log(JSON.stringify(await migrate(source, store, args.includes('--apply')), null, 2));
  } finally {
    await store.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      'Migration stopped. Check source schema/references, destination emptiness and database access. Source is unchanged.',
    );
    process.exitCode = 1;
  });
