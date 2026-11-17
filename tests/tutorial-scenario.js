async (existingPage, options = {}) => {
  const base = options.base ?? 'http://127.0.0.1:3001';
  const browser = existingPage.context().browser();
  const passed = [];
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    bypassCSP: true,
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.addScriptTag({ path: `${options.root}/node_modules/axe-core/axe.min.js` });
    const launch = page.getByRole('button', { name: 'New here? Take the six-step tutorial' });
    await launch.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Create your event', exact: true }).waitFor();
    assert(
      await page.locator('#quick-start-heading').evaluate((el) => el === document.activeElement),
      'Opening the tutorial focuses its first step',
    );
    const titles = [
      'Create your event',
      'Invite a volunteer',
      'Bring your vendors in',
      'Let attendees ask for help',
      'Take a task all the way to done',
      'Keep your event close',
    ];
    for (let step = 0; step < titles.length; step++) {
      await dialog.getByRole('heading', { name: titles[step], exact: true }).waitFor();
      const violations = await page.evaluate(async () =>
        (
          await axe.run(document.querySelector('dialog'), {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          })
        ).violations.map((item) => item.id),
      );
      assert(violations.length === 0, `Tutorial step ${step + 1}: ${violations.join(', ')}`);
      assert(
        await dialog.getByText(`Step ${step + 1} of 6`, { exact: true }).isVisible(),
        'Progress reflects the current step',
      );
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [844, 390],
        [1280, 800],
      ]) {
        await page.setViewportSize({ width, height });
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `Tutorial fits ${width}px`,
        );
        const bounds = await dialog.boundingBox();
        assert(
          bounds && bounds.width <= width && bounds.height <= height,
          'Dialog fits the visible viewport',
        );
      }
      if (step < titles.length - 1)
        await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
    await dialog.getByRole('heading', { name: titles[4], exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert(
      await launch.evaluate((el) => el === document.activeElement),
      'Escape returns focus to the launching control',
    );
    await launch.click();
    await dialog.getByRole('heading', { name: titles[4], exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog.getByRole('button', { name: 'Finish tutorial', exact: true }).click();
    await launch.click();
    await dialog.getByRole('heading', { name: titles[0], exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Skip for now', exact: true }).click();
    passed.push(
      'Six steps cover event setup, volunteers, vendors, attendees, task completion and installation',
    );
    passed.push('Next, Back, Skip, resume, completion replay and Escape focus return work');
    passed.push('Every tutorial step fits phone, landscape, tablet and desktop viewports');
    passed.push('All six tutorial steps pass axe WCAG A/AA checks');
    const fixture = await context.request.post(base + '/api/v1/auth/demo', { data: {} });
    assert(fixture.ok(), 'Create isolated tutorial event');
    await page.evaluate(() => sessionStorage.setItem('rally:demo', 'yes'));
    await page.goto(base);
    await page.getByRole('button', { name: 'Start tutorial', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Dismiss tutorial invitation' }).click();
    await page.reload();
    await page.locator('.event-cover h1').waitFor();
    assert(
      (await page.getByRole('button', { name: 'Start tutorial', exact: true }).count()) === 0,
      'Dismissal survives reload for this account',
    );
    await page.locator('.more-menu > summary').click();
    await page.getByText('Help & settings', { exact: true }).click();
    await page.getByRole('button', { name: 'Step-by-step tutorial', exact: true }).click();
    await dialog.getByRole('heading', { name: titles[0], exact: true }).waitFor();
    passed.push('First workspace offers the tutorial; dismissal persists and More can replay it');
    assert(errors.length === 0, errors.join('; '));
  } finally {
    await context.close();
  }
  const restricted = await browser.newContext();
  try {
    await restricted.addInitScript(() => {
      const originalGet = Storage.prototype.getItem;
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) {
        if (key.startsWith('venuerelay:tutorial:'))
          throw new DOMException('Storage blocked', 'SecurityError');
        return originalGet.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('venuerelay:tutorial:'))
          throw new DOMException('Storage blocked', 'QuotaExceededError');
        return originalSet.call(this, key, value);
      };
    });
    const page = await restricted.newPage();
    await page.goto(base);
    await page.getByRole('button', { name: 'New here? Take the six-step tutorial' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('heading', { name: 'Invite a volunteer', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByRole('button', { name: 'New here? Take the six-step tutorial' }).click();
    await page.getByRole('heading', { name: 'Invite a volunteer', exact: true }).waitFor();
    passed.push('Tutorial remains usable and resumes in memory when browser storage is blocked');
  } finally {
    await restricted.close();
  }
  return { passed };
};
