import type { IncomingMessage, Server, ServerResponse } from 'node:http';
export interface ApplicationBackend {
  readonly storage: string;
  health(): Promise<boolean>;
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    method: string | undefined,
    body: () => Promise<Record<string, unknown>>,
    send: (value: unknown, status?: number) => void,
  ): Promise<void>;
  attach(
    server: Server,
    allowedOrigins: Set<string>,
    secure: boolean,
  ): { invalidate(): void | Promise<void> };
}
