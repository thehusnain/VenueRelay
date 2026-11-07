import { CheckSquare, Megaphone } from 'lucide-react';
import type { Snapshot } from '../../shared/contracts';
import { Modal, Empty, ago } from './components';
import { request } from './use-rally';
export function Inbox({
  data,
  onClose,
  onTask,
  onRefresh,
  notify,
}: {
  data: Snapshot;
  onClose: () => void;
  onTask: (id: string) => void;
  onRefresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const unread = data.notifications.filter((n) => !n.read_at),
    persona = data.event.is_demo ? data.me.role : 'self';
  const mark = async (ids: string[]) => {
    await request(
      `/events/${data.event.id}/notifications/read`,
      { method: 'POST', body: JSON.stringify({ ids }) },
      persona,
    );
    await onRefresh();
  };
  return (
    <Modal title="Updates for you" onClose={onClose}>
      <div className="inbox-toolbar">
        <p>
          {unread.length
            ? `${unread.length} new ${unread.length === 1 ? 'update' : 'updates'}`
            : 'You’ve read all your updates.'}
        </p>
        {unread.length ? (
          <button
            className="text-link"
            onClick={async () => {
              try {
                await mark(unread.map((n) => n.id));
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            Mark all as read
          </button>
        ) : null}
      </div>
      {data.notifications.length ? (
        <div className="inbox-list">
          {data.notifications.map((n) => (
            <button
              key={n.id}
              className={`inbox-item ${!n.read_at ? 'unread' : ''}`}
              onClick={async () => {
                try {
                  await mark([n.id]);
                  if (n.task_id) {
                    onClose();
                    if (data.tasks.some((t) => t.id === n.task_id)) onTask(n.task_id);
                    else notify('This task is no longer assigned to you.');
                  }
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <span className="inbox-icon">
                {n.task_id ? <CheckSquare size={20} /> : <Megaphone size={20} />}
              </span>
              <span>
                <strong>{n.message}</strong>
                <time>{ago(n.created_at)}</time>
              </span>
              {!n.read_at ? <span className="unread-dot" aria-label="Unread" /> : null}
            </button>
          ))}
        </div>
      ) : (
        <Empty title="You’re all caught up">
          Task updates and messages from your organiser will appear here.
        </Empty>
      )}
    </Modal>
  );
}
