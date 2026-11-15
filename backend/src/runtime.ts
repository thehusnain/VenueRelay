export function origin(value: string, production = false) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Set a valid public website origin.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (production && url.protocol !== 'https:')
  )
    throw new Error('Origins must contain only an HTTPS scheme and hostname in production.');
  return url.origin;
}
export function runtimeSettings(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production',
    port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a number between 1 and 65535.');
  if (production && !env.MONGODB_URI)
    throw new Error('Production requires MONGODB_URI. SQLite is for the local demo only.');
  if (env.MONGODB_URI && !/^mongodb(?:\+srv)?:\/\//.test(env.MONGODB_URI))
    throw new Error('MONGODB_URI must be a MongoDB connection string.');
  if (
    production &&
    (!env.MONGODB_URI?.startsWith('mongodb+srv://') ||
      /[?&](?:tls|ssl)=false(?:&|$)/i.test(env.MONGODB_URI))
  )
    throw new Error('Use an Atlas mongodb+srv connection with TLS in production.');
  const name = env.MONGODB_DATABASE ?? 'rally';
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,37}$/.test(name))
    throw new Error('Use a MongoDB database name of 1–38 letters, digits, underscores or hyphens.');
  const appOrigin = origin(env.APP_ORIGIN ?? 'http://127.0.0.1:3001', production);
  if (production && env.COOKIE_SECURE !== 'true')
    throw new Error('Set COOKIE_SECURE=true for HTTPS hosting.');
  const allowed = (
    env.ALLOWED_ORIGINS ?? (production ? appOrigin : 'http://127.0.0.1:5173,http://localhost:5173')
  )
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => origin(x, production));
  return {
    production,
    port,
    host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
    mongoUri: env.MONGODB_URI,
    database: name,
    appOrigin,
    secure: env.COOKIE_SECURE === 'true',
    allowedOrigins: [...new Set([...allowed, appOrigin])],
    apiOnly: env.API_ONLY === 'true',
    demo:
      env.DEMO_ACCOUNT_ENABLED === 'true' || (!production && env.DEMO_ACCOUNT_ENABLED !== 'false'),
  };
}
