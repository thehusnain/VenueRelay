async (existingPage, options = {}) => {
  const base = options.base ?? 'http://127.0.0.1:3001';
  const root = options.root ?? '/home/sheriff/Desktop/rally';
  const context = await existingPage
    .context()
    .browser()
    .newContext({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
      bypassCSP: true,
      serviceWorkers: 'block',
    });
  const page = await context.newPage();
  const passed = [];
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const audit = async () => {
    await page.addScriptTag({ path: root + '/node_modules/axe-core/axe.min.js' });
    const issues = await page.evaluate(async () =>
      (
        await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        })
      ).violations.map((x) => x.id),
    );
    assert(!issues.length, JSON.stringify(issues));
  };
  try {
    const email = 'mobile_' + Date.now();
    await page.goto(base + '/create-account');
    await page.getByLabel('Your name', { exact: true }).fill('Mobile event lead');
    await page.getByLabel('Choose a username', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('mobile password 2026');
    await page.getByRole('button', { name: 'Create my account', exact: true }).click();
    await page.getByRole('heading', { name: 'Your account is ready.', exact: true }).waitFor();
    assert(
      await page
        .getByRole('heading', { name: 'Your account is ready.', exact: true })
        .evaluate((el) => el === document.activeElement),
      'Signup must focus the recovery result',
    );
    await page.screenshot({
      path: root + '/test-results/signup-recovery-final.png',
      fullPage: true,
    });
    const code = await page.getByLabel('Your recovery code', { exact: true }).inputValue();
    assert(code.length > 30, 'Recovery code must be shown');
    await audit();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download recovery code', exact: true }).click();
    assert(
      (await download).suggestedFilename() === 'venuerelay-recovery.txt',
      'Recovery download must work',
    );
    await page.getByRole('button', { name: 'Continue to my event', exact: true }).click();
    await page.getByRole('heading', { name: 'Create your event', exact: true }).waitFor();
    await page.getByLabel('Event name', { exact: true }).fill('Mobile community day');
    await page.getByLabel('Event date', { exact: true }).fill('2026-12-01');
    await page.getByLabel('Venue or place', { exact: true }).fill('Town hall');
    await page.getByRole('button', { name: 'Create my event', exact: true }).click();
    await page.locator('.event-cover h1').waitFor();
    assert(
      (await page.locator('main').innerText()).includes('Invite your team'),
      'Empty event must guide the organiser',
    );
    passed.push('Mobile signup without email, recovery download and empty event setup');
    await page.locator('.more-menu summary').click();
    await page.getByRole('button', { name: 'Account security', exact: true }).click();
    await page.getByLabel('Current password', { exact: true }).fill('mobile password 2026');
    await page.getByRole('button', { name: 'Create replacement code', exact: true }).click();
    const replacement = page.getByRole('dialog').getByLabel('Your recovery code', { exact: true });
    await replacement.waitFor();
    const freshCode = await replacement.inputValue();
    assert(
      await page
        .getByRole('heading', { name: 'Recovery code replaced', exact: true })
        .evaluate((el) => el === document.activeElement),
      'Code replacement must focus its result',
    );
    await page.screenshot({
      path: root + '/test-results/security-recovery-final.png',
      fullPage: true,
    });
    assert(freshCode !== code, 'Security screen must replace the code');
    await audit();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.locator('.more-menu summary').click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.goto(base + '/forgot-password');
    await page.getByLabel('Username', { exact: true }).fill(email);
    await page.getByLabel('Recovery code', { exact: true }).fill(freshCode);
    await page.getByLabel('New password', { exact: true }).fill('new mobile password 2026');
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await page.getByRole('heading', { name: 'You’re back in control.', exact: true }).waitFor();
    assert(
      await page
        .getByRole('heading', { name: 'You’re back in control.', exact: true })
        .evaluate((el) => el === document.activeElement),
      'Password recovery must focus its result',
    );
    await page.screenshot({
      path: root + '/test-results/password-recovery-final.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Sign in with new password', exact: true }).click();
    await page.getByLabel('Username', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('new mobile password 2026');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Mobile community day', exact: true }).waitFor();
    passed.push('Account security rotation and no-email password reset return to the same event');
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Account journey must fit mobile',
    );
    return { passed };
  } finally {
    await context.close();
  }
};
