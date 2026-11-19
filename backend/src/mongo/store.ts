import { ensure } from '../errors.ts';
import {
  MongoClient,
  type ClientSession,
  type Document,
  type Filter,
  type IndexDescription,
  type UpdateFilter,
} from 'mongodb';
export class MongoStore {
  constructor(
    readonly client: MongoClient,
    readonly name: string,
    readonly session?: ClientSession,
  ) {}
  static async connect(uri: string, name: string) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      appName: 'venuerelay',
    });
    try {
      await client.connect();
      const store = new MongoStore(client, name);
      await store.initialise();
      return store;
    } catch (error) {
      await client.close();
      throw error;
    }
  }
  collection(name: string) {
    return this.client.db(this.name).collection<Document>(name);
  }
  async get<T = Document>(table: string, filter: Filter<Document>): Promise<T | undefined> {
    return (
      ((await this.collection(table).findOne(filter, {
        session: this.session,
        projection: { _id: 0 },
      })) as T | undefined) ?? undefined
    );
  }
  async all<T = Document>(
    table: string,
    filter: Filter<Document> = {},
    sort: Record<string, 1 | -1> = {},
    limit = 0,
  ): Promise<T[]> {
    return (await this.collection(table)
      .find(filter, { session: this.session, projection: { _id: 0 } })
      .sort(sort)
      .limit(limit)
      .toArray()) as T[];
  }
  insert(table: string, value: Document) {
    return this.collection(table).insertOne({ ...value }, { session: this.session });
  }
  mutable(table: string) {
    ensure(
      !['commands', 'activity', 'account_activity'].includes(table),
      403,
      'APPEND_ONLY',
      'History records cannot be edited or deleted.',
    );
  }
  update(table: string, filter: Filter<Document>, update: UpdateFilter<Document>, upsert = false) {
    this.mutable(table);
    return this.collection(table).updateOne(filter, update, { session: this.session, upsert });
  }
  updateMany(table: string, filter: Filter<Document>, update: UpdateFilter<Document>) {
    this.mutable(table);
    return this.collection(table).updateMany(filter, update, { session: this.session });
  }
  remove(table: string, filter: Filter<Document>) {
    this.mutable(table);
    return this.collection(table).deleteMany(filter, { session: this.session });
  }
  async sequence(name: string) {
    const row = await this.collection('counters').findOneAndUpdate(
      { name },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: 'after', session: this.session },
    );
    return Number(row!.value);
  }
  async transaction<T>(fn: (store: MongoStore) => Promise<T>): Promise<T> {
    if (this.session) return fn(this);
    return this.client.withSession((session) =>
      session.withTransaction(() => fn(new MongoStore(this.client, this.name, session)), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        maxCommitTimeMS: 10000,
      }),
    );
  }
  async ping() {
    await this.client.db(this.name).command({ ping: 1 });
    return true;
  }
  async close() {
    await this.client.close();
  }
  async initialise() {
    const definitions: Record<string, IndexDescription[]> = {
      users: [
        {
          key: { username: 1 },
          unique: true,
          partialFilterExpression: { username: { $type: 'string' } },
        },
        { key: { id: 1 }, unique: true },
        {
          key: { email: 1 },
          unique: true,
          partialFilterExpression: { email: { $type: 'string' } },
        },
      ],
      sessions: [{ key: { token_hash: 1 }, unique: true }, { key: { user_id: 1 } }],
      events: [{ key: { id: 1 }, unique: true }, { key: { owner_id: 1 } }],
      members: [
        { key: { id: 1 }, unique: true },
        { key: { event_id: 1, user_id: 1 }, unique: true },
        { key: { user_id: 1 } },
      ],
      tasks: [
        { key: { id: 1 }, unique: true },
        { key: { event_id: 1, created_at: -1 } },
        { key: { event_id: 1, owner_id: 1 } },
        { key: { event_id: 1, reporter_id: 1 } },
      ],
      commands: [
        { key: { id: 1 }, unique: true },
        { key: { actor_id: 1, request_key: 1 }, unique: true },
        { key: { event_id: 1 } },
      ],
      activity: [
        { key: { command_id: 1 }, unique: true },
        { key: { event_id: 1, id: 1 }, unique: true },
        { key: { entity_id: 1, entity_type: 1 } },
      ],
      notifications: [
        { key: { id: 1 }, unique: true },
        { key: { member_id: 1, command_id: 1 }, unique: true },
        { key: { member_id: 1, created_at: -1 } },
      ],
      invitations: [
        {
          key: { event_id: 1, role: 1 },
          unique: true,
          partialFilterExpression: { reusable: true, revoked_at: null },
        },
        { key: { id: 1 }, unique: true },
        { key: { token_hash: 1 }, unique: true },
        { key: { event_id: 1, expires_at: -1 } },
      ],
      attendee_links: [
        { key: { id: 1 }, unique: true },
        { key: { token_hash: 1 }, unique: true },
        { key: { event_id: 1 } },
      ],
      attendee_receipts: [
        { key: { token_hash: 1 }, unique: true },
        { key: { event_id: 1, request_key: 1 }, unique: true },
      ],
      api_keys: [
        { key: { id: 1 }, unique: true },
        { key: { token_hash: 1 }, unique: true },
        { key: { event_id: 1 } },
      ],
      schedule: [{ key: { id: 1 }, unique: true }, { key: { event_id: 1, starts_at: 1 } }],
      announcements: [{ key: { id: 1 }, unique: true }, { key: { event_id: 1, created_at: -1 } }],
      account_tokens: [
        { key: { id: 1 }, unique: true },
        { key: { token_hash: 1 }, unique: true },
        { key: { user_id: 1, purpose: 1 } },
      ],
      email_outbox: [{ key: { id: 1 }, unique: true }, { key: { status: 1, next_attempt_at: 1 } }],
      account_activity: [{ key: { id: 1 }, unique: true }, { key: { user_id: 1 } }],
      auth_rate_limits: [{ key: { key: 1 }, unique: true }],
      push_subscriptions: [
        { key: { id: 1 }, unique: true },
        { key: { endpoint: 1 }, unique: true },
        { key: { member_id: 1, session_hash: 1 } },
      ],
      push_deliveries: [
        { key: { notification_id: 1, subscription_id: 1 }, unique: true },
        { key: { state: 1, next_attempt_at: 1 } },
      ],
      live_tickets: [
        { key: { token_hash: 1 }, unique: true },
        { key: { expires: 1 }, expireAfterSeconds: 0 },
      ],
      counters: [{ key: { name: 1 }, unique: true }],
      server_settings: [{ key: { key: 1 }, unique: true }],
    };
    const collections = Object.entries(definitions);
    for (let i = 0; i < collections.length; i += 4)
      await Promise.all(
        collections
          .slice(i, i + 4)
          .map(([table, indexes]) => this.collection(table).createIndexes(indexes)),
      );
    const hello = await this.client.db(this.name).admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid')
      throw new Error(
        'MongoDB must be a replica set (Atlas Free is supported) so writes can use transactions.',
      );
  }
}
