const value = process.argv[2];
try {
  const origin = new URL(value);
  if (
    !['https:', 'http:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/'
  )
    throw new Error('Supply the website origin.');
  for (const [path, check] of [
    [
      '/api/health',
      async (response) => {
        const data = await response.json();
        return data.status === 'ok' && data.storage === 'mongodb';
      },
    ],
    ['/api/openapi.json', async (response) => (await response.json()).openapi === '3.1.0'],
    ['/manifest.webmanifest', async (response) => (await response.json()).display === 'standalone'],
    [
      '/sw.js',
      async (response) =>
        response.headers.get('content-type')?.includes('javascript') &&
        !(await response.text()).startsWith('<!'),
    ],
    ['/sign-in', async (response) => (await response.text()).includes('id="root"')],
  ]) {
    const response = await fetch(new URL(path, origin), {
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
    if (!response.ok || !(await check(response)))
      throw new Error(`${path} did not pass. Check routing and service logs.`);
    console.log(`Passed ${path}`);
  }
  console.log(
    'Routing and MongoDB health passed. Complete the sign-in, phone installation and failure checks in docs/DEPLOYMENT.md.',
  );
} catch (error) {
  console.error(
    error.message === 'Invalid URL'
      ? 'Usage: npm run check:deployment -- https://your-project.vercel.app'
      : error.message,
  );
  process.exitCode = 1;
}
