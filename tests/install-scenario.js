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
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(base);
      await page.locator('.welcome-copy h1').waitFor();
      const installButton = page.getByRole('button', { name: 'Install VenueRelay', exact: true });
      await installButton.click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('heading', { name: 'VenueRelay on your Home Screen' }).waitFor();
      const device = userAgent.includes('iPhone') ? 'iPhone / iPad' : 'Android';
      assert(
        (await dialog
          .getByRole('button', { name: device, exact: true })
          .getAttribute('aria-pressed')) === 'true',
        'Device guidance is selected automatically',
      );
      assert(
        (await dialog.locator('.install-steps li').count()) === 3,
        'Installation has three short steps',
      );
      assert(
        (await dialog.locator('.install-steps').innerText()).includes(
          userAgent.includes('iPhone') ? 'Add to Home Screen' : 'Install and create shortcut',
        ),
        'Correct browser-specific instructions',
      );
      await dialog.getByRole('button', { name: 'Computer', exact: true }).click();
      assert(
        (await dialog.locator('.install-steps').innerText()).includes('Chrome or Edge'),
        'User can select another device',
      );
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Installation does not overflow a phone',
      );
      await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await page.evaluate(() => {
        window.promptCalls = 0;
        window.fakeInstall = (outcome, fail = false) => {
          const event = new Event('beforeinstallprompt');
          event.prompt = async () => {
            window.promptCalls++;
            if (fail) throw new Error('Install prompt unavailable');
          };
          event.userChoice = Promise.resolve({ outcome });
          dispatchEvent(event);
        };
        window.fakeInstall('dismissed');
      });
      await installButton.click();
      assert(
        (await page.evaluate(() => window.promptCalls)) === 1,
        'One click invokes native installation directly',
      );
      assert((await dialog.count()) === 0, 'No intermediary dialog for native prompt');
      await installButton.click();
      await dialog.waitFor();
      assert(
        (await page.evaluate(() => window.promptCalls)) === 1,
        'Consumed prompt is not reused; guidance remains available',
      );
      await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await page.evaluate(() => window.fakeInstall('dismissed', true));
      await installButton.click();
      await dialog.waitFor();
      assert(
        await dialog.locator('.install-steps').isVisible(),
        'Failed native prompt recovers to manual guidance',
      );
      await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await page.evaluate(() => window.fakeInstall('accepted'));
      await installButton.click();
      assert(
        (await page.evaluate(() => window.promptCalls)) === 3,
        'Fresh prompts work after cancellation and failure',
      );
      await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
      await page.evaluate(() => window.fakeInstall('accepted'));
      assert((await installButton.count()) === 0, 'Installed apps do not show install actions');
      assert(errors.length === 0, 'No unhandled errors: ' + errors.join(', '));
      passed.push(
        userAgent.includes('iPhone')
          ? 'iPhone guidance, device selection, prompt cancellation/failure recovery, installed state'
          : 'Android guidance, direct native prompt, consumed prompt safety, installed state',
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
