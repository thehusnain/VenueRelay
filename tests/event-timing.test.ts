import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventDay, eventPeriod, orderedEvents } from '../shared/event-timing.ts';
import type { Event } from '../shared/contracts.ts';

test('event groups follow midnight in Pakistan, independently of the viewer timezone', () => {
  const event = { date: '2026-11-18' };
  const before = eventDay(new Date('2026-11-17T18:59:59Z'));
  const after = eventDay(new Date('2026-11-17T19:00:00Z'));
  assert.equal(before, '2026-11-17');
  assert.equal(after, '2026-11-18');
  assert.equal(eventPeriod(event, before), 'upcoming');
  assert.equal(eventPeriod(event, after), 'live');
  assert.equal(eventPeriod(event, '2026-11-19'), 'past');
});

test('ending a future event moves it to Past; reopening uses its scheduled date', () => {
  const event = { date: '2026-12-01', ended_at: '2026-11-17T10:00:00Z' };
  assert.equal(eventPeriod(event, '2026-11-17'), 'past');
  assert.equal(eventPeriod({ ...event, ended_at: null }, '2026-11-17'), 'upcoming');
  const earlier = { date: '2026-11-16', ended_at: null };
  assert.equal(eventPeriod(earlier, '2026-11-17'), 'past');
  assert.equal(earlier.ended_at, null, 'Grouping must not archive an event');
});

test('event list prioritises today, nearest upcoming and most recent past without mutating it', () => {
  const make = (id: string, date: string): Event => ({
    id,
    date,
    name: id,
    owner_id: 'owner',
    venue: 'Hall',
    is_demo: 0,
    created_at: '',
  });
  const events = [
    make('old', '2026-11-01'),
    make('later', '2026-12-01'),
    make('today', '2026-11-17'),
    make('recent', '2026-11-16'),
    make('next', '2026-11-18'),
  ];
  const original = [...events];
  assert.deepEqual(
    orderedEvents(events, '2026-11-17').map((event) => event.id),
    ['today', 'next', 'later', 'recent', 'old'],
  );
  assert.deepEqual(events, original);
});
