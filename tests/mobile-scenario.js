async (existingPage, options = {}) => {
  const base = options.base ?? 'http://127.0.0.1:3001',
    root = options.root ?? '/home/sheriff/Desktop/rally';
  const browser = existingPage.context().browser();
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    bypassCSP: true,
    acceptDownloads: true,
  });
  const page = await context.newPage(),
    passed = [],
    errors = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  let workerContext;
  const audit = async (name, screenshot = true) => {
    if (name !== 'loading') await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    const size = page.viewportSize();
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${name} overflows at ${size.width}`,
    );
    const dialog = page.getByRole('dialog');
    if (await dialog.count()) {
      const rect = await dialog.boundingBox();
      assert(
        rect.x >= 0 &&
          rect.x + rect.width <= size.width + 1 &&
          rect.y >= -1 &&
          rect.y + rect.height <= size.height + 1,
        `${name} dialog is outside the viewport`,
      );
      assert(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `${name} dialog clips content horizontally`,
      );
    }
    await page.addScriptTag({ path: root + '/node_modules/axe-core/axe.min.js' });
    const violations = await page.evaluate(async () =>
      (
        await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        })
      ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    );
    assert(!violations.length, `${name}: ${JSON.stringify(violations)}`);
    if (screenshot)
      await page.screenshot({ path: root + `/test-results/mobile-${name}-${size.width}.png` });
    passed.push(`${name} at ${size.width}×${size.height}: no overflow or accessibility violations`);
  };
  let release;
  try {
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await context.route('**/api/v1/auth/me', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.opening').waitFor();
    for (const size of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(size);
      const rect = await page.locator('.opening').boundingBox();
      assert(
        Math.abs(rect.x + rect.width / 2 - size.width / 2) < 3 &&
          Math.abs(rect.y + rect.height / 2 - size.height / 2) < 24,
        'Loading group must stay centered in both orientations',
      );
      assert(
        await page.locator('.opening-motto').isVisible(),
        'Motto belongs beside the loading indicator',
      );
      assert(
        !(await page.locator('.entry-footer').isVisible()),
        'Loading must not leave a detached motto at the bottom',
      );
      await audit('loading');
    }
    release();
    await page.locator('.welcome-copy h1').waitFor();
    await context.unroute('**/api/v1/auth/me', undefined, { behavior: 'wait' });
    await page.setViewportSize({ width: 360, height: 740 });
    const person = 'Nadia mobile ' + Date.now(),
      username = 'mobile_' + Date.now();
    await page.goto(base + '/create-account');
    await page.getByLabel('Your name', { exact: true }).fill('Mobile event lead');
    await page.getByLabel('Choose a username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill('Mobile signup password 2026!');
    await page.getByRole('button', { name: 'Create my account', exact: true }).tap();
    await page.getByRole('heading', { name: 'Your account is ready.', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Download recovery code', exact: true }).tap();
    await page.getByRole('button', { name: 'Continue to my event', exact: true }).tap();
    await page.getByLabel('Event name', { exact: true }).fill('Mobile invitation checks');
    await page.getByLabel('Event date', { exact: true }).fill('2026-12-01');
    await page.getByLabel('Venue or place', { exact: true }).fill('Town hall');
    await page.getByRole('button', { name: 'Create my event', exact: true }).tap();
    await page.locator('.event-cover h1').waitFor();
    await page.getByRole('button', { name: 'Invite a teammate', exact: true }).tap();
    assert(
      !(await page.evaluate(() =>
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName),
      )),
      'Opening a mobile dialog must not force the keyboard open',
    );
    await page.setViewportSize({ width: 320, height: 568 });
    await audit('invitation-form');
    await page.getByLabel('Person’s name').fill(person);
    await page.getByRole('button', { name: 'Create invitation', exact: true }).tap();
    await page.getByRole('heading', { name: 'Your invitation is ready', exact: true }).waitFor();
    const originalLink = await page.getByLabel('Invitation link', { exact: true }).inputValue();
    await audit('invitation-ready');
    const copy = page.getByRole('button', { name: 'Copy invitation', exact: true });
    const copyRect = await copy.boundingBox();
    assert(
      copyRect.y >= 0 && copyRect.y + copyRect.height <= 568,
      'Copy invitation must be visible without scrolling',
    );
    await copy.tap();
    await page.getByText('Invitation link copied.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'View pending invitations', exact: true }).tap();
    await page.locator('.invitation-row').filter({ hasText: person }).waitFor();
    await audit('pending-invitations');
    await page.getByRole('button', { name: 'Invite a teammate', exact: true }).tap();
    await page.getByLabel('Person’s name').fill('  ' + person.toUpperCase() + ' ');
    await page.getByRole('button', { name: 'Create invitation', exact: true }).tap();
    await page.getByRole('alert').filter({ hasText: 'already pending' }).waitFor();
    await audit('duplicate-invitation');
    await page.getByRole('button', { name: 'View your team & invitations', exact: true }).tap();
    await page.waitForLoadState('networkidle');
    await page.reload({ waitUntil: 'networkidle' });
    const row = page.locator('.invitation-row').filter({ hasText: person });
    await row.getByRole('button', { name: 'Replace link', exact: true }).tap();
    await page.getByRole('button', { name: 'Create replacement link', exact: true }).tap();
    await page.getByRole('heading', { name: 'Your invitation is ready', exact: true }).waitFor();
    const replacement = await page.getByLabel('Invitation link', { exact: true }).inputValue();
    assert(replacement !== originalLink, 'Replacing a lost link must rotate the token');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error('Clipboard denied');
          },
        },
      });
      const original = document.execCommand.bind(document);
      document.execCommand = (...args) => {
        window.__fallbackCopyUsed = args[0] === 'copy';
        return original(...args);
      };
    });
    await page.getByRole('button', { name: 'Copy invitation', exact: true }).tap();
    await page.getByText('Invitation link copied.', { exact: true }).waitFor();
    assert(
      await page.evaluate(() => window.__fallbackCopyUsed),
      'Denied clipboard access must exercise the actual selection-based copy fallback',
    );
    await page.setViewportSize({ width: 360, height: 420 });
    await page.getByLabel('Invitation link', { exact: true }).focus();
    await audit('short-viewport-dialog');
    await page.setViewportSize({ width: 360, height: 740 });
    await page.getByRole('button', { name: 'View pending invitations', exact: true }).tap();
    workerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    });
    const registered = await workerContext.request.post(base + '/api/v1/auth/register', {
      data: {
        name: person,
        username: 'worker_' + Date.now(),
        password: 'Worker mobile password 2026!',
      },
    });
    assert(registered.ok(), 'Separate staff account must register');
    const ownEvent = await workerContext.request.post(base + '/api/v1/events', {
      data: { name: 'Their other event', venue: 'Other hall', date: '2026-12-02' },
    });
    assert(ownEvent.ok(), 'Invitee can already organise a different event');
    const oldToken = new URL(originalLink).searchParams.get('invite');
    const rejected = await workerContext.request.post(base + '/api/v1/invitations/accept', {
      data: { token: oldToken },
    });
    assert(rejected.status() === 410, 'Replaced link must no longer grant access');
    const worker = await workerContext.newPage();
    await worker.goto(replacement);
    await worker.locator('.event-cover h1').waitFor();
    assert(
      (await worker.locator('.event-cover h1').innerText()) === 'Mobile invitation checks',
      'An existing account must land in the invited event, even when it has a newer event',
    );
    assert(
      (await worker.locator('.cover-meta').innerText()).includes('Volunteer'),
      'Recipient must join with the invited role',
    );
    await page.getByRole('button', { name: 'Refresh invitations', exact: true }).tap();
    await page.locator('.invitation-empty').waitFor();
    await page.getByText('Previous invitations (1)', { exact: true }).tap();
    await row.getByText('Joined', { exact: true }).waitFor();
    passed.push(
      'Fresh-account onboarding, native/fallback copy, pending reload, duplicate protection, link rotation and separate-account acceptance',
    );
    await page.getByRole('button', { name: 'Invite a teammate', exact: true }).tap();
    await page.getByLabel('Person’s name').fill('Hamza mobile');
    await page.getByRole('button', { name: 'Create invitation', exact: true }).tap();
    await page.getByRole('button', { name: 'View pending invitations', exact: true }).tap();
    await page
      .locator('.invitation-row')
      .filter({ hasText: 'Hamza mobile' })
      .getByRole('button', { name: 'Cancel invitation', exact: true })
      .tap();
    await page.locator('.invitation-empty').waitFor();
    await page.waitForLoadState('networkidle');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Previous invitations (2)', { exact: true }).tap();
    await page
      .locator('.invitation-row')
      .filter({ hasText: 'Hamza mobile' })
      .getByText('Cancelled', { exact: true })
      .waitFor();
    await audit('invitation-history');
    for (const size of [
      { width: 320, height: 568 },
      { width: 360, height: 740 },
      { width: 390, height: 844 },
      { width: 414, height: 896 },
      { width: 844, height: 390 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(size);
      for (const [name, route] of [
        ['home', '/'],
        ['tasks', '/tasks'],
        ['team', '/team'],
        ['plan', '/schedule'],
        ['history', '/history'],
        ['new-task', '/new-task'],
      ]) {
        const navigation = page.getByRole('navigation', { name: 'Main navigation' });
        if (route === '/history') {
          await page.locator('.more-menu > summary').tap();
          await page
            .locator('.more-panel')
            .getByRole('button', { name: 'What changed', exact: true })
            .tap();
        } else if (route === '/new-task') {
          await navigation.getByRole('button', { name: 'Tasks', exact: true }).tap();
          await page.getByRole('button', { name: 'Add a task', exact: true }).tap();
        } else {
          const label = {
            '/': 'Home',
            '/tasks': 'Tasks',
            '/team': 'Your team',
            '/schedule': 'Event plan',
          }[route];
          await navigation.getByRole('button', { name: label, exact: true }).tap();
        }
        await page.waitForURL((url) => url.pathname === route);
        await page.locator('main h1').waitFor();
        await audit(name, size.width === 360 || size.width === 844);
      }
    }
    assert(!errors.length, JSON.stringify(errors));
    return { passed, javascriptErrors: errors, checkedAt: new Date().toISOString() };
  } catch (error) {
    await page.screenshot({ path: root + '/test-results/mobile-failure.png' });
    return { passed, error: error.message, text: await page.locator('body').innerText() };
  } finally {
    release?.();
    await workerContext?.close();
    await context.close();
  }
};
