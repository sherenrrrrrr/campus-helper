// Optional integration check: set PLAYWRIGHT_MODULE to an installed Playwright module.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const M = require('../prototype/data/points.js');
const root = path.resolve(__dirname, '..');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const click = action => page.locator(`[data-action="${action}"]`).filter({ visible: true }).first().click();
      const switchTo = async id => {
        if (new URL(page.url()).hash.startsWith('#admin')) {
          await click('account'); await click('return-front');
        }
        await click('account'); await page.locator(`[data-action="switch"][data-id="${id}"]`).click();
      };
      const goto = async hash => { await page.goto(base + '/#' + hash); await page.waitForSelector('#main h1', { state: 'attached' }); };
      const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('campus-helper-demo')));
      const submitDialog = () => page.locator('dialog form button[type="submit"]').click();
      await goto('hall');
      await page.locator('#entry-enter').click();
      assert.equal(await page.locator('.survey-card').count(), 8);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(root, 'outputs', mobile ? 'mobile-preview.png' : 'desktop-preview.png'), fullPage: true });
      await goto('hall?q=找不到的词'); await page.getByRole('heading', { name: '暂时没有符合条件的问卷' }).waitFor();
      await goto('publish');
      await page.locator('[name="title"]').fill('浏览器验收问卷记录');
      await page.locator('textarea[name="description"]').fill('仅用于验证演示流程，请勿提供真实个人信息。');
      await page.locator('[name="topic"]').selectOption('学习研究');
      await page.locator('[name="audienceText"]').fill('全校同学');
      await page.locator('[name="link"]').fill('https://surveys.example/browser-' + mobile);
      await page.locator('[name="reward"]').fill('10'); await page.locator('[name="quota"]').fill('8');
      await page.getByRole('button', { name: '确认发布问卷', exact: true }).click();
      await page.getByRole('heading', { name: '浏览器验收问卷记录', exact: true }).waitFor({ timeout: 3000 }).catch(async error => {
        console.log('Publish diagnostics:', await page.locator('#main').innerText(), 'errors:', errors);
        throw error;
      });
      let s = await read(), taskId = s.tasks.at(-1).id;
      assert.equal(M.user(s, 'u1').available, M.toUnits(20)); assert.equal(M.user(s, 'u1').frozen, M.toUnits(80));
      await goto('publish'); await page.locator('[name="quota"]').fill('20'); assert.equal(await page.getByRole('button', { name: '确认发布问卷' }).isDisabled(), true);
      await switchTo('u2'); await goto('detail/' + taskId); await page.locator('#eligible').check(); await click('claim');
      await click('open-survey'); await page.getByRole('heading', { name: '示例问卷页面', exact: true }).waitFor();
      await page.locator('dialog [data-action="proof"]').click(); await click('sample-proof'); await page.locator('[name="privacy"]').check(); await submitDialog();
      s = await read(); const submissionId = s.submissions.at(-1).id; assert.equal(M.sub(s, submissionId).status, 'pending');
      await page.reload(); await page.waitForSelector('#main h1'); assert.equal(await page.locator('[data-action="claim"]').count(), 0);
      await switchTo('u1'); await goto('tasks'); await page.getByText('1 份待审核', { exact: true }).waitFor();
      await goto('review/' + taskId); await click('reject'); await submitDialog(); assert.equal(await page.locator('dialog').evaluate(d => d.open), true);
      await page.locator('dialog [name="reason"]').selectOption('截图不清晰'); await submitDialog();
      s = await read(); assert.equal(M.sub(s, submissionId).status, 'appealed');
      await switchTo('u3'); await goto('admin/appeal/' + submissionId); await click('judge'); await page.locator('dialog input[name="verdict"][value="win"]').check(); await page.locator('dialog textarea[name="reason"]').fill('完成提示清楚，裁决发放'); await submitDialog();
      s = await read(); assert.equal(M.user(s, 'u2').available, M.toUnits(110)); assert.equal(M.user(s, 'u1').frozen, M.toUnits(70)); M.assertState(s);
      // Second responder can be rejected normally, appeal, then receive a reasoned ruling.
      await goto('detail/' + taskId); await page.locator('#eligible').check(); await click('claim'); await click('proof'); await click('sample-proof'); await page.locator('[name="privacy"]').check(); await submitDialog();
      const secondId = (await read()).submissions.at(-1).id;
      await switchTo('u1'); await goto('review/' + taskId); await click('reject'); await page.locator('dialog [name="reason"]').selectOption('看不出完成'); await submitDialog();
      assert.equal(M.sub(await read(), secondId).status, 'rejected');
      await switchTo('u3'); await goto('tasks?tab=joined'); await click('appeal'); await page.locator('dialog textarea[name="reason"]').fill('已完成，申请核查'); await submitDialog();
      await goto('admin/appeal/' + secondId); await click('judge'); await page.locator('dialog input[name="verdict"][value="win"]').check(); await page.locator('dialog textarea[name="reason"]').fill('核查后通过'); await submitDialog();
      M.assertState(await read());
      for (const hash of ['hall', 'publish', 'tasks', 'tasks?tab=joined', 'points', 'admin?tab=appeals', 'admin?tab=tasks', 'admin?tab=users', 'admin?tab=metrics']) {
        await goto(hash); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'overflow: ' + hash);
      }
      await goto('admin?tab=metrics'); await page.getByText('积分守恒校验通过。', { exact: false }).waitFor();
      assert.equal(new URL(page.url()).hash, '#admin/overview');
      for (const target of ['#admin/overview', '#admin/tasks', '#admin/submissions', '#admin/users', '#admin/appeals']) {
        assert.equal(await page.locator(`#desktop-nav a[href="${target}"]`).count(), 1);
        assert.equal(await page.locator(`#mobile-nav a[href="${target}"]`).count(), 1);
      }
      assert.equal(await page.locator('#desktop-nav a[href="#tasks"], #mobile-nav a[href="#tasks"]').count(), 0);
      await goto('admin?tab=tasks'); assert.equal(new URL(page.url()).hash, '#admin/tasks');
      await page.locator('a[href^="#admin/review/"]').first().click();
      assert.ok(new URL(page.url()).hash.startsWith('#admin/review/'));
      await page.locator('a.back[href="#admin/tasks"]').click(); assert.equal(new URL(page.url()).hash, '#admin/tasks');
      await page.reload(); await page.waitForSelector('#main h1'); assert.equal(new URL(page.url()).hash, '#admin/tasks');
      await switchTo('u2'); await goto('detail/sample-0'); await page.locator('#eligible').check(); await click('claim'); await click('proof');
      await page.locator('#proof-file').setInputFiles({ name: 'demo-completion.png', mimeType: 'image/png', buffer: await page.screenshot() });
      await page.getByText('图片已准备好，确认隐私提示后即可提交。', { exact: true }).waitFor();
      await page.locator('[name="privacy"]').check(); await submitDialog();
      const autoId = (await read()).submissions.at(-1).id;
      await click('account'); await click('time'); await page.locator('dialog [name="hours"]').selectOption('49'); await submitDialog();
      s = await read(); assert.equal(M.sub(s, autoId).automatic, true); M.assertState(s);
      await click('account'); await click('reset'); await submitDialog(); s = await read(); assert.equal(M.user(s, 'u1').available, M.toUnits(100)); assert.equal(s.tasks.length, 16);
      assert.deepEqual(errors, []); console.log(`${mobile ? '390px mobile' : '1440px desktop'}: full workflow, routes, persistence, reset and no page errors passed`);
      await context.close();
    }
    const context = await browser.newContext(), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(root, 'outputs/campus-helper-demo.html')).href);
    await page.locator('#entry-enter').click();
    await page.getByRole('heading', { name: '发现问卷' }).waitFor(); assert.equal(await page.locator('.survey-card').count(), 8); assert.deepEqual(errors, []);
    console.log('Standalone file:// artifact opens without network or runtime dependencies'); await context.close();
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
