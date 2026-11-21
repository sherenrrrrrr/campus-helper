const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:4173');
      await page.locator('#entry-enter').waitFor({ state: 'visible' });
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      await page.locator('.entry-theme').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      await page.reload();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      await page.screenshot({ path: `outputs/glass-release/night-entry-${width}.png` });
      await page.locator('.entry-theme').click();
      await page.reload();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      assert.equal(await page.locator('#entry-enter').evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('#main').evaluate(el => el.inert), true);
      assert.equal(await page.locator('.entry-panel').evaluate(el => getComputedStyle(el).animationName), 'none');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('#entry-alt').evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#entry').isVisible(), true);
      await page.screenshot({ path: `outputs/glass-release/entry-${width}.png` });
      await page.locator('#entry-alt').click();
      await page.locator('#account-menu').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#main').evaluate(el => el.inert), false);
      await page.reload();
      assert.equal(await page.locator('#entry').isVisible(), false);
      await page.screenshot({ path: `outputs/glass-release/hall-${width}.png`, fullPage: true });
      // Expand all demo tasks; verify the 8-by-5 motif cycle and performance surface.
      const more = page.locator('[data-action="more"]');
      if (await more.count()) await more.click();
      const motifs = await page.locator('.survey-card').evaluateAll(cards => cards.map(el => {
        const s = getComputedStyle(el), after = getComputedStyle(el, '::after');
        return { mask: after.maskImage, color: s.getPropertyValue('--topic-color'), blur: s.backdropFilter };
      }));
      for (let i = 0; i < motifs.length; i++) {
        assert.equal(motifs[i].blur, 'none');
        if (i) { assert.notEqual(motifs[i].mask, motifs[i-1].mask); assert.notEqual(motifs[i].color, motifs[i-1].color); }
      }
      await page.evaluate(() => localStorage.removeItem('campus-helper-entry'));
      await page.reload();
      assert.equal(await page.locator('#entry').isVisible(), true);
      await page.locator('#entry-enter').click();
      assert.equal(await page.locator('#entry').isVisible(), false);
      await page.locator('#account-toggle').click();
      await page.locator('[data-action="reset"]').click();
      await page.locator('dialog button[type="submit"]').click();
      await page.locator('#entry-enter').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => localStorage.getItem('campus-helper-entry')), null);
      assert.deepEqual(errors, []);
      console.log(`${width}px: entry, focus, identity menu, persistence, re-entry, motifs and overflow passed`);
      await context.close();
    }
    const context = await browser.newContext();
    await context.addInitScript(() => { Storage.prototype.getItem = function () { throw new Error('blocked'); }; Storage.prototype.setItem = function () { throw new Error('blocked'); }; });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173');
    await page.locator('#entry-enter').click();
    assert.equal(await page.locator('#entry').isVisible(), false);
    console.log('Blocked localStorage: entry remains usable');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
