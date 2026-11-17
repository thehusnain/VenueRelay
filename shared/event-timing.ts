import type { Event } from './contracts';

export type EventPeriod = 'live' | 'upcoming' | 'past';

const eventCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Karachi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function eventDay(now = new Date()): string {
  const parts = eventCalendar.formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function eventPeriod(
  event: Pick<Event, 'date' | 'ended_at'>,
  today = eventDay(),
): EventPeriod {
  if (event.ended_at || event.date < today) return 'past';
  return event.date === today ? 'live' : 'upcoming';
}

export function orderedEvents(events: Event[], today = eventDay()): Event[] {
  const order = { live: 0, upcoming: 1, past: 2 };
  return [...events].sort((a, b) => {
    const period = eventPeriod(a, today);
    return (
      order[period] - order[eventPeriod(b, today)] ||
      (period === 'past' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
    );
  });
}
