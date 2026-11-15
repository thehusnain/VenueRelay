import type { Task, Member, Event } from '../../shared/contracts.ts';
import type { CommandInput } from './mutations.ts';
export function* demoScript(
  event: Event,
  members: Member[],
): Generator<{ key: string; input: CommandInput }, void, { entity: unknown }> {
  const volunteer = members.find((m) => m.role === 'volunteer')!,
    vendor = members.find((m) => m.role === 'vendor')!;
  const rows = [
    [
      'Clear the accessible entrance',
      'A delivery crate is blocking the step-free route. Move it and check the full path.',
      'North entrance',
      'urgent',
      volunteer.id,
      'blocked',
    ],
    [
      'Set up the welcome desk',
      'Put out wristbands, printed maps and the lost property sign.',
      'Welcome tent',
      'high',
      volunteer.id,
      'in_progress',
    ],
    [
      'Confirm power for food stalls',
      'Check the supply with the site electrician before switching on equipment.',
      'Food court',
      'high',
      vendor.id,
      'assigned',
    ],
    [
      'Restock drinking water',
      'The refill station needs two more water containers.',
      'Garden zone',
      'normal',
      vendor.id,
      'assigned',
    ],
    [
      'Add signs to the quiet space',
      'Directional signs are missing at the main junction.',
      'East pavilion',
      'normal',
      null,
      'open',
    ],
    [
      'Check the main stage sound',
      'Complete the final microphone and monitor check.',
      'Main stage',
      'normal',
      volunteer.id,
      'resolved',
    ],
    [
      'Place recycling stations',
      'Put labelled bins at each exit and along the food court.',
      'All zones',
      'normal',
      volunteer.id,
      'closed',
    ],
  ];
  for (let n = 0; n < rows.length; n++) {
    const [title, description, location, priority, ownerId, status] = rows[n];
    const result = yield {
      key: `seed-task-${n}`,
      input: {
        action: 'task.create',
        payload: {
          title,
          description,
          location,
          priority,
          ownerId,
          dueAt: new Date(Date.now() + (n - 1) * 35 * 60000).toISOString(),
        },
      },
    };
    let task = result.entity as Task;
    if (['in_progress', 'blocked', 'resolved', 'closed'].includes(String(status))) {
      task = (yield {
        key: `seed-start-${n}`,
        input: {
          action: 'task.status',
          taskId: task.id,
          expectedVersion: task.version,
          payload: { status: 'in_progress' },
        },
      }).entity as Task;
    }
    if (['blocked', 'resolved', 'closed'].includes(String(status))) {
      task = (yield {
        key: `seed-finish-${n}`,
        input: {
          action: 'task.status',
          taskId: task.id,
          expectedVersion: task.version,
          payload: {
            status: status === 'blocked' ? 'blocked' : 'resolved',
            resolution:
              status === 'blocked'
                ? 'Waiting for the delivery driver to move the crate.'
                : 'Checked on site. Everything is ready.',
          },
        },
      }).entity as Task;
    }
    if (status === 'closed')
      yield {
        key: `seed-close-${n}`,
        input: {
          action: 'task.status',
          taskId: task.id,
          expectedVersion: task.version,
          payload: { status: 'closed' },
        },
      };
  }
  for (const [i, title, location, start, end] of [
    [0, 'Crew briefing', 'Welcome tent', '08:30', '09:00'],
    [1, 'Gates open', 'North entrance', '10:00', '10:30'],
    [2, 'Meet the makers', 'Main stage', '11:00', '12:00'],
    [3, 'Lunch & local flavours', 'Food court', '12:30', '14:00'],
    [4, 'Acoustic garden session', 'Garden zone', '16:00', '17:00'],
  ])
    yield {
      key: `seed-schedule-${i}`,
      input: {
        action: 'schedule.create',
        payload: {
          title,
          location,
          startsAt: `${event.date}T${start}:00+05:00`,
          endsAt: `${event.date}T${end}:00+05:00`,
        },
      },
    };
}
