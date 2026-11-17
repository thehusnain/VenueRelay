async (existingPage, options = {}) => {
  const base = options.base ?? 'http://127.0.0.1:3001',
    root = options.root ?? '/home/sheriff/Desktop/rally';
  const browser = existingPage.context().browser();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    bypassCSP: true,
  });
  const workerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    const Native = window.AudioContext ?? window.webkitAudioContext;
    if (Native)
      window.AudioContext = class extends Native {
        createOscillator() {
          window.__chimes = (window.__chimes ?? 0) + 1;
          return super.createOscillator();
        }
      };
  });
  const page = await context.newPage(),
    worker = await workerContext.newPage(),
    passed = [],
    errors = [];
  for (const p of [page, worker]) {
    p.setDefaultTimeout(15000);
    p.on('pageerror', (error) => errors.push(error.message));
  }
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const nav = (name) =>
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name, exact: true });
  const audit = async (name) => {
    await page.addScriptTag({ path: root + '/node_modules/axe-core/axe.min.js' });
    const result = await page.evaluate(async () => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      violations: (
        await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        })
      ).violations.map((v) => v.id),
    }));
    assert(!result.overflow && !result.violations.length, name + JSON.stringify(result));
    await page.screenshot({ path: root + '/test-results/team-' + name + '.png' });
  };
  try {
    await page.goto(base);
    const response = await context.request.post(base + '/api/v1/auth/register', {
      data: {
        name: 'Team lead',
        username: 'lead_' + Date.now(),
        password: 'Team test password 2026!',
      },
    });
    assert(response.ok(), 'Register organiser');
    await page.reload();
    await page.getByLabel('Event name', { exact: true }).fill('Joining and history test');
    await page.getByLabel('Event date', { exact: true }).fill('2026-12-01');
    await page.getByLabel('Venue or place', { exact: true }).fill('Community hall');
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      const fits = await page.getByLabel('Event date', { exact: true }).evaluate((el) => {
        const a = el.getBoundingClientRect(),
          b = el.parentElement.getBoundingClientRect();
        return (
          a.left >= b.left - 1 &&
          a.right <= b.right + 1 &&
          getComputedStyle(el).appearance === 'none'
        );
      });
      assert(fits, 'Event date must fit its label at ' + width);
    }
    await page.getByRole('button', { name: 'Create my event', exact: true }).click();
    await page.locator('.event-cover h1').waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await nav('Event plan').click();
    await page.getByRole('button', { name: 'Add a session', exact: true }).click();
    await page.getByLabel('Starts at').fill('2026-12-01T09:30');
    await page.getByLabel('Ends at').fill('2026-12-01T10:30');
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [390, 420],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      for (const label of ['Starts at', 'Ends at'])
        assert(
          await page.getByLabel(label).evaluate((el) => {
            const a = el.getBoundingClientRect(),
              b = el.parentElement.getBoundingClientRect();
            return a.left >= b.left - 1 && a.right <= b.right + 1;
          }),
          label + ' fits ' + width,
        );
      await audit('dates-' + width + '-' + height);
    }
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    passed.push(
      'Event date and schedule date/time inputs stay inside their containers on phones, landscape and short viewports',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await nav('Your team').click();
    await page.getByRole('button', { name: 'Create volunteer link', exact: true }).click();
    await page.getByRole('button', { name: 'Create join link', exact: true }).click();
    const link = await page.getByLabel('Invitation link', { exact: true }).inputValue();
    assert(link.includes('?invite='), 'Shared invitation produced');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Share join link', exact: true }).click();
    assert(
      (await page.getByLabel('Invitation link', { exact: true }).inputValue()) === link,
      'Same link survives tab reload',
    );
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Enable notification sound', exact: true }).click();
    const before = await page.evaluate(() => window.__chimes ?? 0);
    await worker.goto(link);
    await worker.getByRole('button', { name: 'Create an account', exact: true }).click();
    await worker.getByLabel('Your name', { exact: true }).fill('New volunteer');
    await worker.getByLabel('Choose a username', { exact: true }).fill('volunteer_' + Date.now());
    await worker.getByLabel('Password', { exact: true }).fill('Volunteer password 2026!');
    await worker.getByRole('button', { name: 'Create my account', exact: true }).click();
    await worker.getByRole('button', { name: 'Continue to my event', exact: true }).click();
    await worker.locator('.event-cover h1').waitFor();
    assert(
      (await worker.locator('.event-cover h1').innerText()) === 'Joining and history test',
      'Volunteer joins invited event',
    );
    await page.getByText('New volunteer joined as a volunteer.', { exact: true }).waitFor();
    assert(
      (await page.evaluate(() => window.__chimes ?? 0)) > before,
      'Join update schedules real alert sound',
    );
    await audit('joined');
    passed.push(
      'One volunteer link survives reload and leads through signup into the right event, with a named organiser alert and sound',
    );
    await page.getByRole('button', { name: 'Dismiss update alert' }).click();
    await page.getByText('More', { exact: true }).click();
    await page.getByRole('button', { name: 'My events & history', exact: true }).click();
    await page.getByRole('button', { name: 'End this event', exact: true }).click();
    await page.getByRole('button', { name: 'End event & keep history', exact: true }).click();
    await page.getByRole('button', { name: 'Reopen this event', exact: true }).waitFor();
    await audit('event-history');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.getByText('This event has ended', { exact: true }).waitFor();
    await nav('Event plan').click();
    assert(
      await page.getByRole('button', { name: 'Add a session' }).isDisabled(),
      'Ended event is read-only',
    );
    await page.getByRole('button', { name: 'My events & history', exact: true }).click();
    await page.getByRole('button', { name: 'Reopen this event', exact: true }).click();
    await page.getByRole('button', { name: 'End this event', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close dialog' }).click();
    assert(
      await page.getByRole('button', { name: 'Add a session' }).isEnabled(),
      'Reopened event is editable',
    );
    passed.push(
      'Creator ends and reopens the event from account history while retaining team records',
    );
    assert(!errors.length, JSON.stringify(errors));
    return { passed, javascriptErrors: errors };
  } catch (error) {
    await page.screenshot({ path: root + '/test-results/team-failure.png', fullPage: true });
    return { passed, error: error.message };
  } finally {
    await workerContext.close();
    await context.close();
  }
};
