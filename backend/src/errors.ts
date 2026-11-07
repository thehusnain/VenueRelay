export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export function ensure(
  condition: unknown,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): asserts condition {
  if (!condition) throw new ApiError(status, code, message, details);
}
export function text(value: unknown, label: string, max = 200, min = 1) {
  ensure(
    typeof value === 'string' && value.trim().length >= min && value.length <= max,
    422,
    'VALIDATION_ERROR',
    `${label} must be ${min}–${max} characters.`,
  );
  return value.trim();
}
export function choice<T extends string>(value: unknown, options: readonly T[], label: string): T {
  ensure(
    typeof value === 'string' && options.includes(value as T),
    422,
    'VALIDATION_ERROR',
    `${label} must be one of: ${options.join(', ')}.`,
  );
  return value as T;
}
export function date(value: unknown, label: string) {
  const v = text(value, label, 40);
  ensure(
    /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)),
    422,
    'VALIDATION_ERROR',
    `${label} must be an ISO date-time.`,
  );
  return new Date(v).toISOString();
}
