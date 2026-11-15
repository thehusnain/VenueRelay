async (existingPage, options = {}) => {
  const browser = existingPage.context().browser();
  const base = options.base ?? 'http://127.0.0.1:3001';
  const passed = [];
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  for (const userAgent of [
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  ]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent,
      serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      await page.goto(base);
      await page.locator('.welcome-copy h1').waitFor();
      assert(
        (await page.getByRole('button', { name: 'Install VenueRelay', exact: true }).count()) === 0,
        'No unsupported install action',
      );
      assert(
        !/Safari|installation steps/.test(await page.locator('body').innerText()),
        'No browser-specific manual installation instructions',
      );
      await page.evaluate(() => {
        window.promptCalls = 0;
        window.fakeInstall = (outcome) => {
          const event = new Event('beforeinstallprompt');
          event.prompt = async () => {
            window.promptCalls++;
          };
          event.userChoice = Promise.resolve({ outcome });
          dispatchEvent(event);
        };
        window.fakeInstall('dismissed');
      });
      await page.getByRole('button', { name: 'Install VenueRelay', exact: true }).click();
      assert(
        (await page.evaluate(() => window.promptCalls)) === 1,
        'One click must invoke native installation directly',
      );
      assert((await page.getByRole('dialog').count()) === 0, 'No intermediary instruction dialog');
      assert(
        (await page.getByRole('button', { name: 'Install VenueRelay', exact: true }).count()) === 0,
        'Consumed prompt is removed',
      );
      await page.evaluate(() => window.fakeInstall('accepted'));
      await page.getByRole('button', { name: 'Install VenueRelay', exact: true }).click();
      assert(
        (await page.evaluate(() => window.promptCalls)) === 2,
        'Fresh prompts work after cancellation',
      );
      await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
      await page.evaluate(() => window.fakeInstall('accepted'));
      assert(
        (await page.getByRole('button', { name: 'Install VenueRelay', exact: true }).count()) === 0,
        'Installed apps do not show install actions',
      );
      passed.push(
        userAgent.includes('iPhone')
          ? 'iPhone identity: no unsupported prompt or Safari instructions; native event lifecycle'
          : 'Android identity: direct native prompt, cancellation, fresh retry and installed state',
      );
    } finally {
      await context.close();
    }
  }
  return {
    passed,
    limits:
      'Browser identities and prompt events are emulated. Physical device installation is not tested.',
  };
};
