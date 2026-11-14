export class RequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

export async function fetchJson<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('Invalid response');
    } catch {
      throw new RequestError(
        response.ok ? 502 : response.status,
        'INVALID_RESPONSE',
        'Rally returned an unreadable response. Try again. Waiting changes remain on this device.',
      );
    }
    if (!response.ok) {
      const retry = response.headers.get('Retry-After');
      const milliseconds =
        retry && /^\d+$/.test(retry)
          ? Number(retry) * 1000
          : retry
            ? Date.parse(retry) - Date.now()
            : 15000;
      throw new RequestError(
        response.status,
        typeof data.error?.code === 'string' ? data.error.code : 'HTTP_ERROR',
        typeof data.error?.message === 'string'
          ? data.error.message
          : 'This action could not be completed. Please try again.',
        data.error?.details,
        response.status === 429
          ? Math.min(300000, Math.max(1000, milliseconds || 15000))
          : undefined,
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (timedOut)
      throw new RequestError(
        0,
        'TIMEOUT',
        'Rally is taking longer than expected. Please retry. Waiting changes are still safe on this device.',
      );
    if (options.signal?.aborted)
      throw new RequestError(
        0,
        'CANCELLED',
        'The request was cancelled. Waiting changes have not been removed.',
      );
    throw new RequestError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the event server. Check your connection and that Rally is running on your computer.',
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
