import { ApiError } from './errors.ts';

export function startupError(error: unknown): string {
  const chain: {
    name?: string;
    code?: unknown;
    message?: string;
    codeName?: string;
    syscall?: string;
  }[] = [];
  let item = error;
  for (let n = 0; item && typeof item === 'object' && n < 5; n++) {
    chain.push(item);
    item = (item as { cause?: unknown }).cause;
  }
  const matches = (codes: unknown[], names: string[] = []) =>
    chain.some((e) => codes.includes(e.code) || names.includes(e.name ?? ''));
  const messages = chain.map((e) => (typeof e.message === 'string' ? e.message : '')).join(' ');
  if (
    matches([18], ['MongoAuthenticationError']) ||
    /bad auth|authentication failed|auth failed/i.test(messages)
  )
    return 'MONGODB_AUTH: Atlas rejected the database credentials. Check the Database User username/password, URI password encoding and authSource=admin.';
  if (matches([13]) || chain.some((e) => e.codeName === 'Unauthorized'))
    return 'MONGODB_PERMISSIONS: Atlas denied database access. Grant this database user readWrite on the MONGODB_DATABASE database, including index creation.';
  if (matches([], ['MongoParseError', 'MongoInvalidArgumentError']))
    return 'MONGODB_URI_FORMAT: Check the Atlas driver URI. Replace password placeholders, percent-encode special characters and remove quotes or spaces around the URI.';
  if (
    chain.some((e) => String(e.syscall ?? '').startsWith('query')) ||
    matches(['ENOTFOUND', 'EAI_AGAIN', 'ENODATA', 'ESERVFAIL'])
  )
    return 'MONGODB_DNS: The Atlas hostname could not be resolved. Copy a fresh connection string from the correct active cluster and check DNS connectivity.';
  if (
    /certificate|tls|ssl/i.test(messages) ||
    matches(['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID'])
  )
    return 'MONGODB_TLS: The encrypted Atlas connection failed. Check certificates and network connectivity; keep TLS certificate validation enabled.';
  if (
    matches(
      ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'],
      ['MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError'],
    )
  )
    return 'MONGODB_NETWORK: Could not reach Atlas. Check cluster availability, the Atlas IP access list and outbound connectivity from Render.';
  if (chain.some((e) => e.name?.startsWith('Mongo')))
    return 'MONGODB_STARTUP: Database initialisation failed. Check database-user permissions, cluster compatibility and index configuration.';
  if (
    error instanceof ApiError ||
    (error instanceof Error &&
      error.name === 'Error' &&
      /^(Set a valid public website origin|Origins must contain|PORT must be|Production requires MONGODB_URI|MONGODB_URI must be|Use an Atlas mongodb|Use a MongoDB database name|Set COOKIE_SECURE=true|MongoDB must be a replica set|This database needs a newer version)/.test(
        error.message,
      ))
  )
    return error.message.replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[private MongoDB URI]');
  return 'STARTUP_FAILED: Check the deployment configuration and database availability.';
}
