async (existingPage, options = {}) => {
  const base = options.base ?? 'http://127.0.0.1:3004';
  const root = options.root ?? '/home/sheriff/Desktop/rally';
  const browser = existingPage.context().browser();
  const staff = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    bypassCSP: true,
    reducedMotion: 'reduce',
  });
  const guests = await browser.newContext({
    viewport: { width: 320, height: 700 },
    bypassCSP: true,
    reducedMotion: 'reduce',
  });
  const page = await staff.newPage(),
    guest = await guests.newPage(),
    passed = [],
    errors = [];
  page.setDefaultTimeout(15000);
  guest.setDefaultTimeout(15000);
  for (const p of [page, guest]) p.on('pageerror', (e) => errors.push(e.message));
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const audit = async (p, name) => {
    await p.addScriptTag({ path: root + '/node_modules/axe-core/axe.min.js' });
    const violations = await p.evaluate(async () =>
      (
        await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        })
      ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    );
    assert(!violations.length, name + ': ' + JSON.stringify(violations));
    assert(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      name + ' must fit',
    );
  };
  try {
    const username = 'event_' + Date.now(),
      title = options.longContent
        ? 'Help' + 'X'.repeat(118) + Date.now()
        : 'Guest entrance help ' + Date.now();
    const signup = await staff.request.post(base + '/api/v1/auth/register', {
      data: { username, name: 'Event lead', password: 'staff password 2026' },
    });
    assert(signup.ok(), 'Username signup should work');
    const created = await staff.request.post(base + '/api/v1/events', {
      data: {
        name: 'Community event',
        venue: options.longContent ? 'Venue' + 'Z'.repeat(115) : 'Town hall',
        date: '2026-12-01',
      },
    });
    const eventId = (await created.json()).eventId;
    await page.goto(base + '/team');
    await page.getByRole('button', { name: 'Share attendee QR', exact: true }).click();
    await page.getByRole('button', { name: 'Create attendee QR & link', exact: true }).click();
    const linkField = page.getByLabel('Attendee help link', { exact: true });
    await linkField.waitFor();
    const link = await linkField.inputValue();
    await page.locator('.qr-image').waitFor();
    await audit(page, 'attendee sharing');
    await page.screenshot({
      path:
        root +
        '/test-results/attendee-sharing-desktop' +
        (options.longContent ? '-long' : '') +
        '.png',
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    passed.push('Organiser creates an audited, revocable attendee QR/link');
    let guestSignups = 0;
    guest.on('request', (request) => {
      if (request.method() === 'POST' && /\/auth\/(register|login|demo)$/.test(request.url()))
        guestSignups++;
    });
    await guest.goto(link);
    await guest.getByLabel('What do you need?', { exact: true }).waitFor();
    await guest.evaluate(() => navigator.serviceWorker.ready);
    await guest.waitForFunction(() => !!navigator.serviceWorker.controller);
    await guest.waitForLoadState('networkidle');
    await audit(guest, '320px attendee form');
    await guest.screenshot({
      path:
        root + '/test-results/attendee-form-mobile' + (options.longContent ? '-long' : '') + '.png',
      fullPage: true,
    });
    await guest.getByLabel('What do you need?', { exact: true }).fill(title);
    await guest
      .getByLabel('Where are you?', { exact: true })
      .fill(options.longContent ? 'Gate' + 'Y'.repeat(116) : 'North entrance');
    let dropped = false;
    await guests.route('**/attendee-events/*/requests', async (route) => {
      if (!dropped) {
        dropped = true;
        const response = await route.fetch();
        assert(response.ok(), 'Request should commit before response loss');
        await guests.setOffline(true);
        await route.abort('failed');
      } else await route.continue();
    });
    await guest.getByRole('button', { name: 'Send request', exact: true }).click();
    await guest.getByRole('heading', { name: 'Waiting for confirmation', exact: true }).waitFor();
    await guest.reload();
    await guest.getByRole('heading', { name: 'Waiting for confirmation', exact: true }).waitFor();
    if (options.longContent) {
      await audit(guest, '320px long-word pending request');
      await guest.screenshot({
        path: root + '/test-results/attendee-pending-long.png',
        fullPage: true,
      });
    }
    await guests.setOffline(false);
    await guest.getByRole('heading', { name: 'Your help request', exact: true }).waitFor();
    await guest.getByRole('heading', { name: title, exact: true }).waitFor();
    const tracking = guest.url();
    assert(tracking.includes('/request#key='), 'Private key stays in URL fragment');
    assert(guestSignups === 0, 'Guest must never register or log in');
    assert(
      !(await guests.cookies()).some((c) => c.name === 'rally_session'),
      'Guest flow must not create a staff session',
    );
    await audit(guest, 'private tracking');
    await guest.screenshot({
      path:
        root +
        '/test-results/attendee-tracking-mobile' +
        (options.longContent ? '-long' : '') +
        '.png',
      fullPage: true,
    });
    const savedUrl = guest.url();
    await guest.getByRole('link', { name: 'Skip to content', exact: true }).focus();
    await guest.keyboard.press('Enter');
    assert(guest.url() === savedUrl, 'Skip navigation must preserve the private tracking key');
    assert(
      await guest.locator('main').evaluate((el) => el === document.activeElement),
      'Skip navigation must focus main',
    );
    await guest.evaluate(() => {
      location.hash = 'key=' + 'A'.repeat(43);
    });
    await guest.getByRole('alert').waitFor({ timeout: 3000 });
    assert(
      !(await guest.getByRole('heading', { name: title, exact: true }).count()),
      'Changing a private key must remove the previous request immediately',
    );
    await guest.goBack();
    await guest.getByRole('heading', { name: title, exact: true }).waitFor({ timeout: 3000 });
    const snapshot = await (
      await staff.request.get(base + `/api/v1/events/${eventId}/snapshot`)
    ).json();
    const tasks = snapshot.tasks.filter((t) => t.title === title);
    assert(tasks.length === 1, 'Lost acknowledgement and reload must create one request');
    passed.push(
      'No-signup request survives a committed response loss, offline reload and reconnect exactly once',
    );
    const task = tasks[0];
    let version = task.version;
    for (const [action, payload] of [
      ['task.assign', { ownerId: snapshot.me.id }],
      ['task.status', { status: 'in_progress' }],
      [
        'task.status',
        { status: 'resolved', resolution: 'Cleared the route and guided the attendee.' },
      ],
      ['task.status', { status: 'closed' }],
    ]) {
      const response = await staff.request.post(base + `/api/v1/events/${eventId}/commands`, {
        headers: { 'Idempotency-Key': 'staff-step-' + Date.now() + '-' + version },
        data: { action, taskId: task.id, expectedVersion: version, payload },
      });
      const result = await response.json();
      assert(response.ok(), JSON.stringify(result));
      version = result.entity.version;
    }
    await guest.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await guest.getByRole('status').filter({ hasText: 'Finished' }).waitFor();
    await guest.reload();
    await guest.getByRole('status').filter({ hasText: 'Finished' }).waitFor();
    assert(
      !(await guest.getByRole('button', { name: 'Confirm it’s done', exact: true }).count()),
      'Guest cannot change ownership or status',
    );
    passed.push(
      'Staff assign, complete and confirm work; the private guest link shows the saved result after reload',
    );
    await page.getByRole('button', { name: 'Share attendee QR', exact: true }).click();
    await page.getByRole('button', { name: 'Disable link', exact: true }).click();
    await page.keyboard.press('Escape');
    const denied = await guests.newPage();
    await denied.goto(link);
    await denied.getByRole('alert').waitFor();
    assert(
      (await denied.locator('main').innerText()).includes('disabled'),
      'Revoked public link is rejected',
    );
    await denied.close();
    await guest.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await guest.getByRole('status').filter({ hasText: 'Finished' }).waitFor();
    const integrity = await (
      await staff.request.get(base + `/api/v1/events/${eventId}/integrity`)
    ).json();
    assert(integrity.ok && integrity.commands === integrity.activity, JSON.stringify(integrity));
    passed.push(
      'Revoking the shared QR stops new access while existing private tracking and audit records remain correct',
    );
    assert(!errors.length, JSON.stringify(errors));
    return { passed, integrity, guestSignups, javascriptErrors: errors };
  } finally {
    await staff.close();
    await guests.close();
  }
};
