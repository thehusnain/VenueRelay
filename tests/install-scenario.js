async (existingPage, options = {}) => {
  const base = options.base ?? 'http://127.0.0.1:3001';
  const root = options.root ?? '/home/sheriff/Desktop/rally';
  const browser = existingPage.context().browser();
  const passed = [],
    errors = [];
  const assert = (value, message) => {
    if (!value) throw new Error(message);
  };
  const configurations = [
    {
      name: 'mobile Chrome',
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      browser: 'Chrome or Edge',
    },
    {
      name: 'mobile Safari',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      browser: 'Safari',
    },
  ];
  for (const configuration of configurations) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: configuration.userAgent,
      reducedMotion: 'reduce',
      bypassCSP: true,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [768, 1024],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width, height });
        await page.goto(base);
        await page.locator('.welcome-copy h1').waitFor();
        assert(
          (await page.title()) === 'VenueRelay',
          'Browser title must contain only the product name',
        );
        assert(
          (await page.locator('.brand-word').innerText()) === 'VenueRelay',
          'Wordmark must have no trailing dot',
        );
        assert(
          (await page.locator('.welcome-copy h1').innerText()).replace(/\s+/g, ' ') ===
            'Every Team. Every Update. One Place.',
          'Motto must remain visible',
        );
        assert(
          await page.getByRole('button', { name: 'Install VenueRelay', exact: true }).isVisible(),
          'Welcome install control must be visible without a native prompt',
        );
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          'Welcome must fit every viewport',
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Install VenueRelay', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Show installation steps', exact: true }).click();
      assert(
        (await dialog.locator('.install-steps').innerText()).includes(configuration.browser),
        'Instructions must match the mobile browser',
      );
      assert(
        await dialog.locator('.install-steps').evaluate((el) => el === document.activeElement),
        'Manual steps should receive keyboard focus',
      );
      assert(
        !/iPhone|iPad|iOS/.test(await dialog.innerText()),
        'Visible copy should use mobile language',
      );
      await page.addScriptTag({ path: root + '/node_modules/axe-core/axe.min.js' });
      const violations = await page.evaluate(async () =>
        (
          await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          })
        ).violations.map((v) => v.id),
      );
      assert(!violations.length, JSON.stringify(violations));
      await page.keyboard.press('Escape');
      passed.push(
        `${configuration.name}: visible access, exact branding, correct manual steps and accessible dialog`,
      );
      await page.goto(base + '/sign-in');
      await page.getByLabel('Email address').waitFor();
      assert(
        await page.getByRole('button', { name: 'Install VenueRelay', exact: true }).isVisible(),
        'Sign-in must retain installation access',
      );
      const login = await context.request.post(base + '/api/v1/auth/login', {
        data: { email: 'demo@rally.local', password: 'RallyDemo2026!' },
      });
      assert(login.ok(), 'Demo login must work');
      await page.goto(base);
      await page.locator('.event-cover h1').waitFor();
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [768, 1024],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width, height });
        const box = await page.locator('.header-install').boundingBox();
        assert(
          box &&
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= width &&
            box.y + box.height <= height &&
            box.height >= 44,
          'Workspace install control must fit on screen and have a 44px target',
        );
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          'Workspace must fit the viewport',
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.header-install').click();
      await dialog.getByRole('button', { name: 'Show installation steps', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
      await page.getByRole('button', {name:'Install VenueRelay',exact:true}).first().waitFor({state:'hidden'});
      assert(
        (await page.locator('.header-install').count()) === 0,
        'Installed apps should hide the install shortcut',
      );
      passed.push(
        `${configuration.name}: account/workspace access at four widths and installed-state cleanup`,
      );
    } catch (error) {
      return { passed, error: error.message, javascriptErrors: errors };
    } finally {
      await context.close();
    }
  }
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    }),
    page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(base);
    await page.locator('.welcome-copy h1').waitFor();
    await page.evaluate(() => {
      window.promptCalls = 0;
      window.fakeInstall = (outcome) => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => {
          window.promptCalls++;
        };
        event.userChoice = Promise.resolve({ outcome });
        window.dispatchEvent(event);
      };
      window.fakeInstall('dismissed');
    });
    await page.getByRole('button', { name: 'Install VenueRelay', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Install VenueRelay', exact: true }).click();
    await dialog.locator('.install-steps').waitFor();
    assert(
      (await page.evaluate(() => window.promptCalls)) === 1,
      'Native prompt must be invoked once',
    );
    await dialog.getByRole('button', { name: 'Show installation steps', exact: true }).click();
    assert(
      (await page.evaluate(() => window.promptCalls)) === 1,
      'Consumed prompt must not be reused',
    );
    await page.evaluate(() => window.fakeInstall('accepted'));
    await dialog.getByRole('button', { name: 'Install VenueRelay', exact: true }).click();
    assert(
      (await page.evaluate(() => window.promptCalls)) === 2,
      'A fresh browser prompt must work',
    );
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
      await page.getByRole('button', {name:'Install VenueRelay',exact:true}).first().waitFor({state:'hidden'});
    assert(
      (await page.getByRole('button', { name: 'Install VenueRelay', exact: true }).count()) === 0,
      'Installation success should remove install actions',
    );
    passed.push(
      'Native prompt lifecycle: dismissal, no duplicate prompt, fresh retry and installation success',
    );
    assert(!errors.length, JSON.stringify(errors));
    return {
      passed,
      javascriptErrors: errors,
      limits:
        'Mobile browser identities and native prompt events are emulated; no physical device installation performed.',
    };
  } catch (error) {
    return { passed, error: error.message, javascriptErrors: errors };
  } finally {
    await context.close();
  }
};
