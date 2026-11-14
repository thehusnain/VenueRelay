import { writeFileSync } from 'node:fs';
const string = { type: 'string' },
  integer = { type: 'integer' },
  nullable = { type: ['string', 'null'] };
const object = (properties, required = []) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
});
const ref = (name) => ({ $ref: '#/components/schemas/' + name });
const schemas = {};
schemas.Error = object(
  { error: object({ code: string, message: string, details: {} }, ['code', 'message']) },
  ['error'],
);
schemas.Task = object(
  {
    ...Object.fromEntries(
      [
        'id',
        'event_id',
        'title',
        'description',
        'location',
        'priority',
        'status',
        'reporter_id',
        'resolution',
        'created_at',
        'updated_at',
      ].map((k) => [k, string]),
    ),
    owner_id: nullable,
    due_at: nullable,
    version: { type: 'integer', minimum: 1 },
  },
  ['id', 'event_id', 'title', 'status', 'version'],
);
schemas.Member = object(
  Object.fromEntries(['id', 'event_id', 'user_id', 'name', 'role', 'team'].map((k) => [k, string])),
);
schemas.Event = object({
  ...Object.fromEntries(
    ['id', 'owner_id', 'name', 'venue', 'date', 'created_at'].map((k) => [k, string]),
  ),
  is_demo: { type: 'integer', enum: [0, 1] },
});
schemas.Activity = object({
  id: integer,
  ...Object.fromEntries(
    [
      'event_id',
      'command_id',
      'actor_id',
      'entity_id',
      'entity_type',
      'action',
      'after_json',
      'created_at',
    ].map((k) => [k, string]),
  ),
  before_json: nullable,
});
schemas.Notification = object({
  ...Object.fromEntries(
    ['id', 'event_id', 'member_id', 'command_id', 'task_id', 'message', 'created_at'].map((k) => [
      k,
      string,
    ]),
  ),
  read_at: nullable,
});
schemas.Schedule = object({
  ...Object.fromEntries(
    ['id', 'event_id', 'title', 'location', 'starts_at', 'ends_at'].map((k) => [k, string]),
  ),
  version: integer,
});
schemas.Announcement = object(
  Object.fromEntries(
    ['id', 'event_id', 'actor_id', 'message', 'created_at'].map((k) => [k, string]),
  ),
);
schemas.User = object({
  id: string,
  email: nullable,
  name: string,
  emailVerified: { type: 'boolean' },
});
schemas.Delivery = object({
  mode: { type: 'string', enum: ['preview', 'smtp', 'disabled'] },
  connected: { type: 'boolean' },
});
schemas.Snapshot = object({
  event: ref('Event'),
  me: ref('Member'),
  user: ref('User'),
  ...Object.fromEntries(
    [
      ['tasks', 'Task'],
      ['members', 'Member'],
      ['events', 'Event'],
      ['activity', 'Activity'],
      ['notifications', 'Notification'],
      ['schedule', 'Schedule'],
      ['announcements', 'Announcement'],
    ].map(([k, v]) => [k, { type: 'array', items: ref(v) }]),
  ),
  serverTime: { type: 'string', format: 'date-time' },
  activityCursor: integer,
  hasMoreActivity: { type: 'boolean' },
});
schemas.Command = object(
  {
    action: {
      type: 'string',
      enum: ['task.create', 'task.assign', 'task.status', 'schedule.create', 'announcement.create'],
    },
    taskId: string,
    expectedVersion: { type: 'integer', minimum: 1 },
    payload: {
      type: 'object',
      additionalProperties: true,
      description: 'See command payload schemas and docs/API.md.',
    },
  },
  ['action', 'payload'],
);
schemas.TaskCreatePayload = object(
  {
    title: { type: 'string', minLength: 3, maxLength: 140 },
    description: { type: 'string', maxLength: 2000 },
    location: { type: 'string', maxLength: 120 },
    priority: { type: 'string', enum: ['normal', 'high', 'urgent'], default: 'normal' },
    ownerId: nullable,
    dueAt: { type: ['string', 'null'], format: 'date-time' },
  },
  ['title', 'location'],
);
schemas.TaskAssignPayload = object(
  { ownerId: string, dueAt: { type: ['string', 'null'], format: 'date-time' } },
  ['ownerId'],
);
schemas.TaskStatusPayload = object(
  {
    status: { type: 'string', enum: ['in_progress', 'blocked', 'resolved', 'closed'] },
    resolution: {
      type: 'string',
      minLength: 5,
      maxLength: 2000,
      description: 'Required for blocked/resolved.',
    },
  },
  ['status'],
);
schemas.CommandResult = object({
  entity: { type: 'object' },
  entityId: string,
  entityType: string,
  replayed: { type: 'boolean' },
});
schemas.Integrity = object({
  ok: { type: 'boolean' },
  ...Object.fromEntries(
    [
      'commands',
      'activity',
      'taskVersionMismatches',
      'missingAuditEntries',
      'foreignKeyViolations',
    ].map((k) => [k, integer]),
  ),
  checkedAt: { type: 'string', format: 'date-time' },
});
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Rally Event Operations API',
    version: '1.0.0',
    description:
      'Node.js API for HS-0130. Operational commands atomically commit state, immutable history and durable in-app notifications. Use authenticated event WebSockets for invalidations and role-filtered snapshots for records. Dates use ISO 8601 UTC.',
  },
  servers: [{ url: '/' }],
  security: [{ session: [] }, { bearer: [] }],
  paths: {},
  components: {
    securitySchemes: {
      session: { type: 'apiKey', in: 'cookie', name: 'rally_session' },
      bearer: {
        type: 'http',
        scheme: 'bearer',
        description:
          'User bearer session or event-scoped rly_ integration token. Integration keys are issued by verified organisers and must be kept server-side.',
      },
    },
    schemas,
  },
};
const json = (schema) => ({ content: { 'application/json': { schema } } });
function add(
  path,
  method,
  summary,
  {
    body,
    response = { type: 'object' },
    description = '',
    parameters = [],
    publicAccess = false,
    status = 200,
  } = {},
) {
  const errors = Object.fromEntries(
    [
      [400, 'Malformed request'],
      [401, 'Authentication required'],
      [403, 'Permission denied'],
      [404, 'Not found'],
      [409, 'Version conflict, used invite or request key mismatch'],
      [410, 'Link expired, consumed or invalid'],
      [422, 'Validation or state transition error'],
      [429, 'Rate limited'],
      [503, 'Email delivery unavailable or temporary DNS failure'],
      [500, 'Outcome unconfirmed. Retry operational commands with the same request key.'],
    ].map(([code, label]) => [code, { description: label, ...json(ref('Error')) }]),
  );
  const operation = {
    summary,
    operationId: method + '_' + path.replace(/[{}]/g, '').replace(/[/-]/g, '_'),
    description,
    responses: { [status]: { description: 'Success', ...json(response) }, ...errors },
  };
  if (path.includes('{eventId}'))
    parameters = [{ name: 'eventId', in: 'path', required: true, schema: string }, ...parameters];
  if (parameters.length) operation.parameters = parameters;
  if (body) operation.requestBody = { required: true, ...json(body) };
  if (publicAccess) operation.security = [];
  (spec.paths['/api/v1' + path] ??= {})[method] = operation;
}
add('/auth/register', 'post', 'Create account', {
  publicAccess: true,
  body: object(
    {
      name: string,
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 10, maxLength: 200 },
    },
    ['name', 'email', 'password'],
  ),
  description:
    'Validates syntax and DNS mail delivery records. Creates an unverified account, session and durable verification email atomically. Verification is required for real events. Default local preview writes a private .eml; it does not send email. Native clients set X-Rally-Client: native and receive sessionToken. No automatic retry.',
});
add('/auth/login', 'post', 'Sign in', {
  publicAccess: true,
  body: object({ email: string, password: string }, ['email', 'password']),
});
add('/auth/verify-email', 'post', 'Confirm email ownership', {
  publicAccess: true,
  body: object({ token: string }, ['token']),
  description:
    'Consumes a single-use hashed proof with 30-minute expiry. Visiting the GET link does not verify anything. Invalid, used or expired proofs return 410.',
});
add('/auth/resend-verification', 'post', 'Replace confirmation link', {
  body: object({}),
  description:
    'Session required. Invalidates previous verification proofs. 60-second cooldown and persistent rate limits.',
});
add('/auth/forgot-password', 'post', 'Request password recovery', {
  publicAccess: true,
  body: object({ email: { type: 'string', format: 'email' } }, ['email']),
  description:
    'Same response for existing and unknown accounts. Enqueues a one-hour, single-use proof for existing accounts. Local previews do not send externally.',
});
add('/auth/reset-password', 'post', 'Set new password and revoke all sessions', {
  publicAccess: true,
  body: object({ token: string, password: { type: 'string', minLength: 10, maxLength: 200 } }, [
    'token',
    'password',
  ]),
  description:
    'Single-use proof. Changes the password and revokes all sessions atomically. Sign in again afterwards.',
});
add('/auth/demo', 'post', 'Open isolated practice session', {
  publicAccess: true,
  body: object({}),
  description:
    'Anonymous demo sessions have no account recovery. Use a registered account for real events.',
});
add('/auth/me', 'get', 'Read signed-in user');
add('/auth/logout', 'post', 'Revoke current session', { body: object({}) });
add('/bootstrap', 'post', 'Open an event or return real-account onboarding', {
  body: object({}),
  response: {
    oneOf: [
      ref('Snapshot'),
      object({ requiresSetup: { const: true }, user: ref('User') }, ['requiresSetup', 'user']),
    ],
  },
  description:
    'Verified real accounts without events get requiresSetup=true; no sample records are added. Explicit anonymous sample sessions seed their private event. Idempotent for existing membership. Session required. Demo-only X-Rally-Persona previews are restricted to the demo owner. Integration tokens cannot bootstrap.',
});
add('/events', 'post', 'Create clean event', {
  body: object({ name: string, venue: string, date: { type: 'string', format: 'date' } }, [
    'name',
    'venue',
    'date',
  ]),
  status: 201,
  description:
    'Verified registered account required; sample-only sessions cannot create real events. Returns eventId. No automatic retry.',
});
add('/events/{eventId}/snapshot', 'get', 'Read role-filtered event snapshot', {
  response: ref('Snapshot'),
  description:
    'Organisers see all tasks. Other roles see their own reports and assignments. Shared schedule and announcements. Most recent activity capped at 200, inbox at 100; use activity pagination or organiser export for full history.',
});
add('/events/{eventId}/commands', 'post', 'Commit operational command', {
  body: ref('Command'),
  response: ref('CommandResult'),
  parameters: [
    {
      name: 'X-Rally-Expected-Actor',
      in: 'header',
      required: false,
      schema: string,
      description:
        'Member ID from the confirmed snapshot. If the session changed, rejects with 409 ACTOR_CHANGED before writing. Recommended for offline queues.',
    },
    {
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{8,100}$' },
    },
  ],
  description:
    'Stable key required per intent. Reuse it after a timeout, retry, crash or reconnect. Keys are unique per actor, retained indefinitely. Replay returns original entity with replayed=true. Same key with different payload: 409 IDEMPOTENCY_MISMATCH. Task updates require expectedVersion; stale writes: 409 VERSION_CONFLICT with details.current. Permissions, transaction, immutable history and notifications apply to every command. Only organisers assign and verify closure. See docs/API.md for transitions and payloads.',
});
add('/events/{eventId}/activity', 'get', 'Read paginated immutable activity', {
  parameters: [
    { name: 'after', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
    {
      name: 'limit',
      in: 'query',
      schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    },
  ],
  response: object({
    items: { type: 'array', items: ref('Activity') },
    nextCursor: { type: ['integer', 'null'] },
  }),
});
add('/events/{eventId}/notifications/read', 'post', 'Acknowledge own notifications', {
  body: object({ ids: { type: 'array', items: string, maxItems: 100 } }, ['ids']),
  description:
    'Naturally idempotent. Preserves the first read time. Never changes another person’s inbox.',
});
add('/events/{eventId}/invitations', 'post', 'Create single-use invitation', {
  body: object(
    { name: string, role: { type: 'string', enum: ['volunteer', 'vendor', 'attendee'] } },
    ['name', 'role'],
  ),
  status: 201,
  description:
    'Signed-in organiser only. Token returned once; hashed in storage, expires in 48 hours. No automatic retry.',
});
add('/invitations/accept', 'post', 'Join invited event', {
  body: object({ token: string }, ['token']),
  description:
    'Session required. Idempotent for the original accepting account. A different account gets 409. Expired or invalid tokens get 410.',
});
add('/events/{eventId}/api-keys', 'get', 'List token metadata', {
  description: 'Organiser only. Raw tokens are never returned.',
});
add('/events/{eventId}/api-keys', 'post', 'Issue integration token', {
  body: object({ name: string }, ['name']),
  status: 201,
  description:
    'Signed-in organiser only. Returned once, stored hashed, event-scoped and revocable. Tokens cannot issue tokens or invitations. No automatic retry.',
});
add('/events/{eventId}/api-keys/{keyId}', 'delete', 'Revoke integration token', {
  parameters: [{ name: 'keyId', in: 'path', required: true, schema: string }],
  description: 'Signed-in organiser only. Naturally idempotent; recorded in immutable history.',
});
add('/events/{eventId}/integrity', 'get', 'Check record invariants', {
  response: ref('Integrity'),
  description: 'Organiser only. Compares commands, activity, task versions and foreign keys.',
});
add('/events/{eventId}/export', 'get', 'Export complete event record', {
  description:
    'Organiser only. Includes all task records and audit before/after snapshots with UTC timestamps.',
});
add('/push/public-key', 'get', 'Browser push capability and VAPID public key', {
  publicAccess: true,
  response: object({ enabled: { type: 'boolean' }, publicKey: nullable }),
});
add(
  '/events/{eventId}/push/subscription',
  'get',
  'Check push registration for the current session',
);
add('/events/{eventId}/push/subscription', 'post', 'Subscribe this browser to event push', {
  body: object(
    { endpoint: string, keys: object({ p256dh: string, auth: string }, ['p256dh', 'auth']) },
    ['endpoint', 'keys'],
  ),
  description:
    'Requires an authenticated own membership, browser permission and configured VAPID keys. Browser provider endpoints only. Subscription is bound to the current session; logout/expiry revokes delivery.',
});
add('/events/{eventId}/push/subscription', 'delete', 'Remove this browser push subscription', {
  body: object({ endpoint: string }, ['endpoint']),
});
add('/events/{eventId}/live', 'get', 'Upgrade to authenticated event WebSocket', {
  status: 101,
  description:
    'Connect with ws/wss using the session cookie and an allowed Origin. Optional persona query is restricted to the owning demo account. Receives connected and event.changed messages containing only eventId. On invalidation refetch the role-filtered snapshot. Reconnect with backoff; polling is a fallback. Auth is rechecked on broadcasts and heartbeat; session revocation closes with 4401. Commands always use HTTP with idempotency keys.',
});
writeFileSync(
  new URL('../docs/openapi.json', import.meta.url),
  JSON.stringify(spec, null, 2) + '\n',
);
console.log(
  `Documented ${Object.values(spec.paths).reduce((sum, p) => sum + Object.keys(p).length, 0)} API operations.`,
);
