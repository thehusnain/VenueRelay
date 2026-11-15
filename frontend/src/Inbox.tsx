import { CheckSquare, Megaphone } from 'lucide-react';
import type { Snapshot } from '../../shared/contracts';
import { Modal, Empty, ago } from './components';
export function Inbox({
  data,
  onClose,
  onTask,
  onRead,
  notify,
}: {
  data: Snapshot;
  onClose: () => void;
  onTask: (id: string) => void;
  onRead: (ids: string[]) => Promise<void>;
  notify: (message: string) => void;
}) {
  const unread = data.notifications.filter((n) => !n.read_at);
  const mark = (ids: string[]) => onRead(ids).catch((error) => notify((error as Error).message));
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
                  if (!n.read_at) void mark([n.id]);
                  if (n.task_id) {
                    onClose();
                    onTask(n.task_id);
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
