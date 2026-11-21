// Regression coverage for publication bounds, fractional points and review provenance.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const M = require('../prototype/data/points.js');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('campus-helper-demo')));
      const action = name => page.locator(`[data-action="${name}"]`).filter({ visible: true }).first().click();
      const go = async hash => { await page.goto(base + '/#' + hash); await page.locator('#main h1').waitFor({ state: 'attached' }); };
      const switchTo = async id => { await page.locator('#account-toggle').click(); await page.locator(`[data-action="switch"][data-id="${id}"]`).click(); };
      const submitDialog = () => page.locator('dialog button[type="submit"]').click();
      await go('hall'); await page.locator('#entry-enter').click();
      assert.equal(M.user(await read(), 'u20').available, M.toUnits(3000));
      await switchTo('u20'); await go('publish');
      for (const [name, value] of Object.entries({ title: '研', description: '小数积分与大样本招募的浏览器验证，数据仅用于演示。', minutes: '3', audienceText: '全校同学', link: `https://surveys.example/fractional-${width}`, reward: '7.5', quota: '8', days: '37' })) await page.locator(`#publish-form [name="${name}"]`).fill(value);
      await page.locator('[name="topic"]').selectOption('学习研究');
      assert.match(await page.locator('#budget').innerText(), /60/);
      await page.locator('[name="quota"]').fill('3.5');
      await page.locator('[name="quota"]').blur();
      assert.equal(await page.locator('[name="quota"]').inputValue(), '4');
      assert.match(await page.locator('#error-quota').innerText(), /必须是整数/);
      await page.locator('[name="reward"]').fill('7.55');
      assert.equal(await page.getByRole('button', { name: '确认发布问卷', exact: true }).isDisabled(), true);
      await page.locator('[name="reward"]').blur();
      assert.match(await page.locator('#error-reward').innerText(), /一位小数/);
      await page.locator('[name="reward"]').fill('7.5');
      await page.locator('[name="title"]').fill('研'.repeat(60));
      await page.locator('[name="title"]').blur();
      assert.equal(await page.locator('#error-title').innerText(), '');
      // The actual publication exercises a one-character title, 200 seats and 37 days.
      await page.locator('[name="title"]').fill('研');
      await page.locator('[name="quota"]').fill('200');
      await page.getByRole('button', { name: '确认发布问卷', exact: true }).click();
      await page.locator('#main h1').filter({ hasText: '研' }).waitFor();
      let s = await read(), task = s.tasks.at(-1);
      assert.equal(task.quota, 200); assert.equal(task.reward, 75);
      assert.equal(task.deadline - task.createdAt, 37 * M.DAY);
      assert.equal(M.user(s, 'u20').available, 15000); assert.equal(M.user(s, 'u20').frozen, 15000);
      await go('points');
      assert.match(await page.locator('.balance-strip').innerText(), /1500/);
      await switchTo('u2'); await go('detail/' + task.id);
      await page.locator('#eligible').check(); await action('claim'); await action('proof');
      await action('sample-proof'); await page.locator('[name="privacy"]').check(); await submitDialog();
      const submissionId = (await read()).submissions.at(-1).id;
      await switchTo('u20'); await go('tasks');
      await page.locator(`a[href="#review/${task.id}"]`).click();
      await page.getByRole('heading', { name: '提交与审核', exact: true }).waitFor();
      assert.equal(await page.locator('a.back').getAttribute('href'), '#tasks');
      await action('approve'); await submitDialog();
      s = await read(); assert.equal(M.sub(s, submissionId).status, 'approved');
      assert.equal(M.user(s, 'u2').available, 1075); assert.equal(M.user(s, 'u20').frozen, 14925); M.assertState(s);
      await switchTo('u2'); await go('points');
      assert.match(await page.locator('.ledger').innerText(), /7\.5/);
      assert.doesNotMatch(await page.locator('.ledger').innerText(), /7\.5000/);
      await switchTo('u3'); await go('admin?tab=tasks');
      await page.getByRole('link', { name: '查看提交记录', exact: true })
        .and(page.locator(`a[href="#admin/review/${task.id}"]`)).click();
      await page.getByRole('heading', { name: '提交记录 · ' + task.title, exact: true }).waitFor();
      assert.equal(await page.locator('#desktop-nav a[href="#tasks"][aria-current="page"], #mobile-nav a[href="#tasks"][aria-current="page"]').count(), 0);
      assert.match(await page.locator('a.back').getAttribute('href'), /^#admin/);
      await page.locator('a.back').click();
      assert.match(new URL(page.url()).hash, /^#admin/);
      await go('admin?tab=users');
      await page.locator('[data-action="admin-user"][data-id="u2"]').click();
      await page.locator('dialog [name="operation"]').selectOption('adjust');
      await page.locator('dialog [name="amount"]').fill('7.5');
      await page.locator('dialog textarea[name="reason"]').fill('小数调账验收'); await submitDialog();
      s = await read(); assert.equal(M.user(s, 'u2').available, 1150); M.assertState(s);
      await go('admin?tab=metrics');
      assert.match(await page.locator('#main').innerText(), /积分守恒校验通过/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`${width}px: 200-seat publication, fractional budget/payout/adjustment, 37 days, short/long titles and admin/personal review provenance passed`);
      await context.close();
    }
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
