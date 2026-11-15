export type Role = 'organiser' | 'volunteer' | 'vendor' | 'attendee';
export const demoCredentials = { email: 'demo@rally.local', password: 'RallyDemo2026!' };
export type Status = 'open' | 'assigned' | 'in_progress' | 'blocked' | 'resolved' | 'closed';
export interface Event {
  id: string;
  owner_id: string;
  name: string;
  venue: string;
  date: string;
  is_demo: number;
  created_at: string;
}
export interface Member {
  id: string;
  event_id: string;
  user_id: string;
  name: string;
  role: Role;
  team: string;
  is_guest?: boolean;
}
export interface Invitation {
  id: string;
  name: string;
  role: Role;
  expiresAt: string;
  createdAt: string | null;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
}
export interface InvitationPage {
  items: Invitation[];
  pendingCount: number;
  nextOffset: number | null;
}
export interface Task {
  id: string;
  event_id: string;
  title: string;
  description: string;
  location: string;
  priority: 'urgent' | 'high' | 'normal';
  status: Status;
  owner_id: string | null;
  reporter_id: string;
  due_at: string | null;
  resolution: string;
  version: number;
  created_at: string;
  updated_at: string;
}
export interface Activity {
  id: number;
  event_id: string;
  command_id: string;
  actor_id: string;
  entity_id: string;
  entity_type: string;
  action: string;
  before_json: string | null;
  after_json: string;
  created_at: string;
}
export interface Notification {
  id: string;
  member_id: string;
  task_id: string;
  message: string;
  read_at: string | null;
  created_at: string;
}
export interface Snapshot {
  event: Event;
  me: Member;
  members: Member[];
  tasks: Task[];
  activity: Activity[];
  notifications: Notification[];
  events: Event[];
  schedule: Schedule[];
  announcements: Announcement[];
  user: { id: string; name: string; email: string | null; username?: string | null };
  serverTime: string;
  activityCursor: number;
  hasMoreActivity: boolean;
}
export interface Pending {
  key: string;
  eventId: string;
  persona: string;
  action: string;
  taskId?: string;
  expectedVersion?: number;
  payload: Record<string, unknown>;
  createdAt: string;
  conflict?: string;
}
export const statusLabels: Record<Status, string> = {
  open: 'Needs someone to help',
  assigned: 'Ready to start',
  in_progress: 'Being worked on',
  blocked: 'Needs help',
  resolved: 'Waiting for a check',
  closed: 'Finished',
};
export interface Schedule {
  id: string;
  event_id: string;
  title: string;
  location: string;
  starts_at: string;
  ends_at: string;
  version: number;
}
export interface Announcement {
  id: string;
  event_id: string;
  actor_id: string;
  message: string;
  created_at: string;
}

export interface Account {
  id: string;
  name: string;
  email: string | null;
  username?: string | null;
  emailVerified: boolean;
  accessGranted?: boolean;
}
export interface AttendeeEvent {
  id: string;
  name: string;
  venue: string;
  date: string;
}
export interface AttendeeRequestInput {
  name?: string;
  title: string;
  location: string;
  description?: string;
  priority?: 'normal' | 'high' | 'urgent';
  receiptKey: string;
}
export interface AttendeeRequestView {
  event: AttendeeEvent;
  request: Pick<
    Task,
    | 'id'
    | 'title'
    | 'description'
    | 'location'
    | 'priority'
    | 'status'
    | 'resolution'
    | 'created_at'
    | 'updated_at'
  >;
  updates: { status: Status; createdAt: string }[];
}
export interface Delivery {
  mode: 'smtp' | 'brevo' | 'preview' | 'disabled';
  connected: boolean;
}
