import { passwordHash, id, now } from './auth.ts';
import { createEvent, seedDemo, type Context } from './domain.ts';
import type { Store } from './database.ts';
import type { Event, Member } from '../../shared/contracts.ts';
export const demoCredentials = { email: 'demo@rally.local', password: 'RallyDemo2026!' };
export async function ensureDemoAccount(store: Store) {
  if (store.get('SELECT id FROM users WHERE email=?', demoCredentials.email)) return;
  const password = await passwordHash(demoCredentials.password);
  store.transaction(() => {
    const user = {
      id: id(),
      email: demoCredentials.email,
      name: 'Demo organiser',
      email_verified_at: now(),
    };
    store.run(
      'INSERT INTO users (id,email,name,password_hash,created_at,email_verified_at) VALUES (?,?,?,?,?,?)',
      user.id,
      user.email,
      user.name,
      password,
      now(),
      user.email_verified_at,
    );
    const eventId = createEvent(
      store,
      user,
      {
        name: 'Riverside Makers Festival',
        venue: 'Riverside Park, Lahore',
        date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      },
      true,
    );
    const ctx: Context = {
      user,
      event: store.get<Event>('SELECT * FROM events WHERE id=?', eventId)!,
      me: store.get<Member>(
        'SELECT * FROM members WHERE event_id=? AND user_id=?',
        eventId,
        user.id,
      )!,
    };
    seedDemo(store, ctx);
  });
}
