async (existingPage, options = {}) => {
  const base = options.base ?? 'http://127.0.0.1:3001',
    root = options.root ?? '/home/sheriff/Desktop/rally';
  const browser = existingPage.context().browser(),
    context = await browser.newContext({
      viewport: { width: 320, height: 640 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
      bypassCSP: true,
    });
  await context.addInitScript(() => {
    const Native = window.AudioContext ?? window.webkitAudioContext;
    if (Native) {
      window.AudioContext = class extends Native {
        createOscillator() {
          window.__chimes = (window.__chimes ?? 0) + 1;
          return super.createOscillator();
        }
      };
    }
  });
  const page = await context.newPage(),
    passed = [],
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  const assert = (v, message) => {
    if (!v) throw new Error(message);
  };
  const gate = () => {
    let release;
    const promise = new Promise((resolve) => (release = resolve));
    return { promise, release };
  };
  const readGate = gate(),
    commandGate = gate(),
    snapshotGate = gate();
  let blockSnapshots = false,
    readStarted = false,
    other;
  const audit = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      name + ' overflows',
    );
    await page.addScriptTag({ path: root + '/node_modules/axe-core/axe.min.js' });
    const violations = await page.evaluate(async () =>
      (
        await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        })
      ).violations.map((v) => v.id),
    );
    assert(!violations.length, name + ': ' + JSON.stringify(violations));
    await page.screenshot({ path: root + '/test-results/flow-' + name + '.png' });
  };
  const post = async (path, data, headers = {}) => {
    const r = await context.request.post(base + '/api/v1' + path, { data, headers });
    const result = await r.json();
    assert(r.ok(), path + ': ' + JSON.stringify(result));
    return result;
  };
  try {
    await page.goto(base + '/sign-in', { waitUntil: 'networkidle' });
    const username = 'flow_' + Date.now(),
      password = 'Flow test password 2026!';
    await post('/auth/register', { name: 'Event lead', username, password });
    const eventId = (
      await post('/events', { name: 'Phone flow test', date: '2026-12-01', venue: 'Town hall' })
    ).eventId;
    const link = await post('/events/' + eventId + '/attendee-links', {});
    const guest = async (title) =>
      post(
        '/attendee-events/' + eventId + '/requests',
        {
          title,
          location: 'West entrance',
          receiptKey: await page.evaluate(() =>
            btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
              .replaceAll('+', '-')
              .replaceAll('/', '_')
              .replaceAll('=', ''),
          ),
        },
        {
          'X-VenueRelay-Event-Key': link.token,
          'Idempotency-Key': await page.evaluate(() => crypto.randomUUID()),
        },
      );
    await guest('Water station needs help');
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.event-cover h1').waitFor();
    const state = await (
        await context.request.get(base + '/api/v1/events/' + eventId + '/snapshot')
      ).json(),
      note = state.notifications[0];
    await context.route('**/notifications/read', async (route) => {
      readStarted = true;
      await readGate.promise;
      await route.continue();
    });
    await page.getByRole('button', { name: /Updates, \d+ unread/ }).tap();
    const before = Date.now();
    await page.locator('.inbox-item').first().tap();
    await page
      .locator('.task-view h1')
      .filter({ hasText: 'Water station needs help' })
      .waitFor({ timeout: 1500 });
    const openMs = Date.now() - before;
    assert(
      (await page.getByRole('dialog').count()) === 0,
      'Inbox closes before read acknowledgement',
    );
    await page.getByRole('button', { name: 'Updates, 0 unread', exact: true }).waitFor();
    passed.push(
      'Notification opens its task before a held read acknowledgement (' +
        openMs +
        'ms) and updates the local unread badge',
    );
    await page.locator('.more-menu > summary').tap();
    await page.getByText('Help & settings', { exact: true }).tap();
    await page.getByRole('button', { name: 'Alerts & installation', exact: true }).tap();
    await page.getByRole('button', { name: 'Turn on alert sound', exact: true }).tap();
    await page.getByRole('button', { name: 'Turn off alert sound', exact: true }).waitFor();
    const soundBefore = await page.evaluate(() => window.__chimes ?? 0);
    await audit('alert-settings-320');
    await page.keyboard.press('Escape');
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Tasks', exact: true })
      .tap();
    await guest('Signs needed at the entrance');
    await page.locator('.notification-alert').waitFor();
    assert(
      (await page.evaluate(() => window.__chimes ?? 0)) > soundBefore,
      'New update schedules an audible chime after permission gesture',
    );
    await audit('new-alert-320');
    await page
      .locator('.notification-alert')
      .getByRole('button', { name: 'Open task', exact: true })
      .tap();
    await page
      .locator('.task-view h1')
      .filter({ hasText: 'Signs needed at the entrance' })
      .waitFor();
    readGate.release();
    await page.getByRole('button', { name: 'Updates, 0 unread', exact: true }).waitFor();
    passed.push(
      'A new update shows an actionable banner and schedules sound; pending read status survives a concurrent refresh',
    );
    await context.route('**/commands', async (route) => {
      await commandGate.promise;
      await route.continue();
    });
    await context.route('**/snapshot', async (route) => {
      if (blockSnapshots) await snapshotGate.promise;
      await route.continue();
    });
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Tasks', exact: true })
      .tap();
    await page.getByRole('button', { name: 'Add a task', exact: true }).tap();
    assert(
      !(await page.evaluate(() =>
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName),
      )),
      'Request creation does not force a mobile keyboard open',
    );
    await page
      .getByLabel('What needs to happen?', { exact: true })
      .fill('Prepare the welcome desk');
    await page.getByRole('button', { name: 'Continue', exact: true }).tap();
    await page.getByLabel('Place or area', { exact: true }).fill('North entrance');
    await audit('request-location-320');
    await page.getByRole('button', { name: 'Continue', exact: true }).tap();
    await page.getByLabel('Choose a person', { exact: true }).selectOption(state.me.id);
    await audit('request-review-320');
    await page.getByRole('button', { name: 'Add this task', exact: true }).tap();
    await page.locator('.pending-task').filter({ hasText: 'Prepare the welcome desk' }).waitFor();
    await audit('waiting-request-320');
    passed.push(
      'Creating a request shows its durable waiting row while the server response is held',
    );
    blockSnapshots = true;
    commandGate.release();
    const taskButton = page.getByRole('button', { name: /^Open task: Prepare the welcome desk/ });
    await taskButton.waitFor();
    await taskButton.tap();
    await page.getByRole('button', { name: 'Start task', exact: true }).tap();
    await page.getByRole('button', { name: 'This task is done', exact: true }).waitFor();
    await page.getByRole('button', { name: 'This task is done', exact: true }).tap();
    await page.getByLabel('What did you do?', { exact: true }).waitFor();
    assert(
      !(await page
        .getByLabel('What did you do?', { exact: true })
        .evaluate((el) => el === document.activeElement)),
      'Completion explanation focuses its heading, not the keyboard',
    );
    await page
      .getByLabel('What did you do?', { exact: true })
      .fill('Desk prepared, checked and ready for visitors.');
    await audit('completion-320');
    await page.setViewportSize({ width: 360, height: 420 });
    await audit('completion-short');
    await page.getByRole('button', { name: 'Send for review', exact: true }).tap();
    await page.getByRole('button', { name: 'Confirm it’s done', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Confirm it’s done', exact: true }).tap();
    await page.locator('.task-view-status').filter({ hasText: 'Finished' }).waitFor();
    passed.push(
      'Acknowledged creation and completion update immediately while full snapshot refreshes are held',
    );
    blockSnapshots = false;
    snapshotGate.release();
    await post('/events', {
      name: 'Another newer event',
      date: '2026-12-02',
      venue: 'Other venue',
    });
    other = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    });
    const recipient = await other.newPage();
    await recipient.goto(
      base + '/tasks/' + note.task_id + '?event=' + eventId + '&notification=' + note.id,
    );
    await recipient.getByRole('button', { name: 'Sign in', exact: true }).tap();
    await recipient.getByLabel('Username', { exact: true }).fill(username);
    await recipient.getByLabel('Password', { exact: true }).fill(password);
    await recipient.getByRole('button', { name: 'Sign in', exact: true }).tap();
    await recipient
      .locator('.task-view h1')
      .filter({ hasText: 'Water station needs help' })
      .waitFor();
    assert(
      new URL(recipient.url()).pathname === '/tasks/' + note.task_id,
      'Notification destination survives sign-in',
    );
    passed.push(
      'Notification links survive sign-in and open their event instead of a newer unrelated event',
    );
    const integrity = await (
      await context.request.get(base + '/api/v1/events/' + eventId + '/integrity')
    ).json();
    assert(integrity.ok, 'Records remain correct');
    assert(readStarted, 'Read status must actually reach the server');
    assert(!errors.length, JSON.stringify(errors));
    return {
      passed,
      openMs,
      integrity,
      javascriptErrors: errors,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    await page.screenshot({ path: root + '/test-results/flow-failure.png' });
    return {
      passed,
      error: error.message,
      text: await page.locator('body').innerText(),
      javascriptErrors: errors,
    };
  } finally {
    readGate.release();
    commandGate.release();
    snapshotGate.release();
    await other?.close();
    await context.close();
  }
};
