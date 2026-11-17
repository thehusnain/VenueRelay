async (existingPage, options = {}) => {
  const base = options.base ?? 'http://127.0.0.1:3001';
  const root = options.root ?? '/home/sheriff/Desktop/rally';
  const context = await existingPage
    .context()
    .browser()
    .newContext({
      viewport: { width: 390, height: 844 },
      bypassCSP: true,
    });
  const page = await context.newPage(),
    passed = [],
    errors = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const api = async (path, data, headers = {}) => {
    const response = await context.request.post(base + '/api/v1' + path, { data, headers });
    const result = await response.json();
    assert(response.ok(), path + ': ' + JSON.stringify(result));
    return result;
  };
  const menu = async () => {
    if (!(await page.locator('.more-menu').evaluate((el) => el.open)))
      await page.locator('.more-menu > summary').click();
  };
  const history = async () => {
    await menu();
    await page.getByRole('button', { name: 'My events & history', exact: true }).click();
  };
  const filter = (name) =>
    page
      .getByRole('group', { name: 'Filter my events' })
      .getByRole('button', { name: new RegExp('^' + name + ' \\d+$') });
  const names = () => page.locator('.account-event h3').allTextContents();
  const audit = async (name) => {
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      name + ' overflow',
    );
    await page.addScriptTag({ path: root + '/node_modules/axe-core/axe.min.js' });
    const violations = await page.evaluate(async () =>
      (
        await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        })
      ).violations.map((v) => v.id),
    );
    assert(!violations.length, name + ': ' + violations.join(', '));
    await page.screenshot({
      path: root + '/test-results/events-' + name + '.png',
      fullPage: !(await page.getByRole('dialog').count()),
    });
  };
  try {
    await page.goto(base);
    await api('/auth/register', {
      name: 'TEST Event organiser',
      username: 'events_' + Date.now(),
      password: 'Test events password 2026!',
    });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
    const date = (offset) =>
      new Date(Date.parse(today + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
    const fixtures = {};
    for (const [name, offset] of [
      ['Live test event', 0],
      ['Next test event', 1],
      ['Later test event', 7],
      ['Earlier test event', -1],
      ['Ended test event', 4],
    ]) {
      fixtures[name] = (
        await api('/events', { name, date: date(offset), venue: 'TEST Hall' })
      ).eventId;
    }
    await api('/events/' + fixtures['Ended test event'] + '/lifecycle', { ended: true });
    const id = fixtures['Live test event'];
    await page.goto(base + '/?event=' + id);
    await page.locator('.event-cover h1').waitFor();
    await history();
    assert((await names()).length === 5, 'All five account events are visible');
    await filter('Live').click();
    assert(
      JSON.stringify(await names()) === JSON.stringify(['Live test event']),
      'Live only shows today',
    );
    await filter('Upcoming').click();
    assert(
      JSON.stringify(await names()) === JSON.stringify(['Next test event', 'Later test event']),
      'Upcoming uses nearest-date order',
    );
    await filter('Past').click();
    assert((await names()).length === 2, 'Past includes earlier and manually ended events');
    await page.getByText('Past date · still open', { exact: true }).waitFor();
    await page.getByText('Ended · read-only', { exact: true }).waitFor();
    passed.push(
      'All/Live/Upcoming/Past separate events correctly, order future events and distinguish past dates from archived records',
    );
    for (const [width, height] of [
      [320, 568],
      [390, 420],
      [844, 390],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await audit('history-' + width + 'x' + height);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await filter('Live').click();
    await page.getByRole('button', { name: 'End this event', exact: true }).click();
    await page.getByRole('button', { name: 'End event & keep history', exact: true }).click();
    await page.getByRole('heading', { name: 'No live events', exact: true }).waitFor();
    await page.getByRole('button', { name: 'View all events', exact: true }).click();
    await page.getByRole('button', { name: 'Reopen this event', exact: true }).click();
    await filter('Live').click();
    await page.locator('.account-event h3').filter({ hasText: 'Live test event' }).waitFor();
    await filter('Upcoming').click();
    await page.getByRole('button', { name: 'Open Next test event', exact: true }).click();
    await page.locator('.event-cover h1').filter({ hasText: 'Next test event' }).waitFor();
    passed.push(
      'Ending/reopening updates the filters, empty Live view recovers to All, and opening another event switches workspace',
    );
    await page.goto(base + '/?event=' + id);
    await page.locator('.event-cover h1').waitFor();
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Tasks', exact: true })
      .click();
    await page.getByRole('button', { name: 'Add a task', exact: true }).click();
    assert(
      !(await page.locator('.main-navigation').isVisible()),
      'Task form hides mobile navigation',
    );
    assert(
      !(await page.locator('.header-actions').isVisible()),
      'Task form hides extra header options',
    );
    await page.getByLabel('What needs to happen?', { exact: true }).fill('TEST Focused task');
    const link = await api('/events/' + id + '/attendee-links', {});
    await api(
      '/attendee-events/' + id + '/requests',
      {
        title: 'TEST Incoming request during form',
        location: 'TEST Gate',
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
    await page.waitForFunction(
      () => Number(document.querySelector('.updates-count')?.textContent) > 0,
    );
    assert(
      !(await page.locator('.notification-alert').isVisible()),
      'Incoming alert does not obstruct the form',
    );
    await audit('focused-task-390');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Place or area', { exact: true }).fill('TEST Hall');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    assert(
      (await page.getByLabel('What needs to happen?', { exact: true }).inputValue()) ===
        'TEST Focused task',
      'Back preserves task title',
    );
    await page.getByRole('button', { name: 'Back to tasks', exact: true }).click();
    await page.locator('.notification-alert').waitFor();
    await menu();
    assert(
      !(await page.locator('.notification-alert').isVisible()),
      'Open menu is not covered by alert',
    );
    await audit('compact-menu-390');
    await page.getByText('Help & settings', { exact: true }).click();
    await page.getByRole('button', { name: 'Alerts & installation', exact: true }).click();
    await page.getByRole('heading', { name: 'Alerts & installation', exact: true }).waitFor();
    passed.push(
      'Mobile task flow keeps its draft, hides extra controls and defers banners; the compact menu retains installation/settings access',
    );
    assert(!errors.length, errors.join(', '));
    return { passed, javascriptErrors: errors };
  } catch (error) {
    await page.screenshot({ path: root + '/test-results/events-failure.png', fullPage: true });
    return { passed, error: error.message, text: await page.locator('body').innerText() };
  } finally {
    await context.close();
  }
};
