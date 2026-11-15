async (existingPage, options = {}) => {
  const root = options.root ?? '/home/sheriff/Desktop/rally';
  const base = options.base ?? 'http://127.0.0.1:3001';
  const browser = existingPage.context().browser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', bypassCSP: true });
  const page = await context.newPage();
  const checks = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const capture = async (name, width, screenshot = true) => {
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({ path: `${root}/node_modules/axe-core/axe.min.js` });
    const result = await page.evaluate(async () => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      violations: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))
    }));
    assert(!result.overflow, `${name} overflows at ${width}px`);
    assert(!result.violations.length, `${name} at ${width}px: ${JSON.stringify(result.violations)}`);
    if (screenshot) await page.screenshot({ path: `${root}/test-results/reference-${name}-${width}.png`, fullPage: true });
    checks.push({ page: name, width, overflow: false, axeViolations: 0 });
  };
  try {
    for (const width of [1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 812 });
      for (const [name, route] of [['welcome', '/'], ['sign-in', '/sign-in'], ['register', '/create-account'], ['recovery', '/forgot-password'], ['confirm-email', '/verify-email?token=invalid-preview'], ['reset-password', '/reset-password?token=invalid-preview']]) {
        await page.goto(base + route);
        await page.locator('main h1').waitFor();
        await capture(name, width);
      }
    }
    await page.goto(base);
    const fixture = await context.request.post(base + (options.hosted ? '/api/v1/auth/login' : '/api/v1/auth/demo'), {data: options.hosted ? {email:'demo@rally.local',password:'RallyDemo2026!'} : {}}); assert(fixture.ok(), 'Create isolated test fixture'); await page.evaluate(()=>sessionStorage.setItem('rally:demo','yes')); await page.goto(base);
    await page.locator('.event-cover h1').waitFor();
    for (const width of [1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 812 });
      for (const [name, route] of [['home', '/'], ['tasks', '/tasks'], ['programme', '/schedule'], ['team', '/team'], ['journal', '/history'], ['integrations', '/connections'], ['connection-help', '/connection-help']]) {
        await page.goto(base + route);
        await page.locator('.rally-app main h1').waitFor();
        await capture(name, width);
      }
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Tasks', exact: true }).click();
      await page.getByRole('button', { name: /^Open task:/ }).first().click();
      await capture('task-detail', width);
      await page.getByRole('button', { name: 'Back to tasks', exact: true }).click();
      await page.getByRole('button', { name: 'Add a task', exact: true }).click();
      await capture('new-task-1', width);
      await page.getByLabel('What needs to happen?', { exact: true }).fill('Prepare the welcome desk');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await capture('new-task-2', width);
      await page.getByLabel('Place or area', { exact: true }).fill('Main entrance');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await capture('new-task-3', width);
      await page.getByRole('button', { name: 'Back to tasks', exact: true }).click();
      await page.getByRole('button', { name: /Updates, \d+ unread/ }).click();
      await capture('updates', width);
      await page.keyboard.press('Escape');
    }
    await context.clearCookies();
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base);
    await page.locator('.welcome-copy h1').waitFor();
    const typography = await page.locator('.welcome-copy h1').evaluate(el => ({font: getComputedStyle(el).fontFamily, color: getComputedStyle(el).color, background: getComputedStyle(document.body).backgroundColor}));
    assert(typography.font.includes('Manrope'), 'Manrope must be used for readable event headings');
    assert(typography.background === 'rgb(245, 247, 246)', 'Requested background must be white');
    assert(typography.color === 'rgb(28, 48, 43)', 'Headline must use readable dark ink');
    assert(!await page.locator('video,.welcome-example').count(), 'Reference interpretation must not add video or the rejected poster card');
    await page.route('https://db.onlinewebfonts.com/**', route => route.abort());
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('https://fonts.gstatic.com/**', route => route.abort());
    await page.reload();
    await page.locator('.welcome-copy h1').waitFor();
    await page.evaluate(() => Promise.all([document.fonts.load('16px Manrope')]));
    assert(await page.evaluate(() => document.fonts.check('16px Manrope')), 'Manrope must load locally with external fonts blocked');
    const bodyFont = await page.locator('.welcome-copy > p').first().evaluate(el => getComputedStyle(el).fontFamily);
    assert(bodyFont.includes('Manrope'), 'Caption must use locally hosted Manrope');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert(await page.locator('.page-scene,.entry-public-content').first().evaluate(el=>getComputedStyle(el).animationName==='none'), 'Reduced-motion preference must suppress page animation');
    assert(!errors.length, JSON.stringify(errors));
    return { checkedAt: new Date().toISOString(), checks, referenceTypography: true, localFontsAvailable: true, fonts: {heading:'Manrope',body:'Manrope'}, noVideo: true, reducedMotionRespected: true, javascriptErrors: errors };
  } catch (error) {
    await page.screenshot({ path: `${root}/test-results/design-failure.png`, fullPage: true });
    return { checks, error: error.message, url: page.url() };
  } finally { await context.close(); }
}
