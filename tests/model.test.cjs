const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../prototype/data/points.js');
const { seed } = require('../prototype/data/seed.js');
const start = Date.parse('2026-11-17T08:00:00Z');
const proof = 'data:image/png;base64,aGVsbG8=';
const input = (extra = {}) => ({ title: '大学生学习习惯问卷', description: '用于课堂研究，请根据实际情况填写。', topic: '学习研究', audienceText: '全校同学', audience: ['全校同学'], minutes: 3, link: 'https://surveys.example/test', reward: 10, quota: 8, days: 7, ...extra });
function setup() {
  let s = seed(start);
  const run = action => { s = M.commit(s, action); return s; };
  const publish = (extra) => { run({ type: 'publish', input: input(extra) }); return s.tasks.at(-1); };
  const switchTo = userId => run({ type: 'switch', userId });
  const claim = (t, userId = 'u2') => { switchTo(userId); run({ type: 'claim', taskId: t.id, eligible: true }); return s.submissions.at(-1); };
  const submit = x => run({ type: 'submit', submissionId: x.id, screenshot: proof, privacy: true });
  return { get s() { return s; }, run, publish, switchTo, claim, submit };
}
test('seed balances and all ledger entries reconcile, core users start at 100', () => {
  const s = seed(start); assert.equal(M.assertState(s).total, 1900); assert.equal(M.user(s, 'u1').available, 100); assert.equal(M.user(s, 'u2').frozen, 0); assert.equal(s.tasks.length, 16);
});
test('publish freezes exactly the budget, failed action never mutates input', () => {
  const f = setup(), original = M.clone(f.s); const t = f.publish();
  assert.equal(M.user(f.s).available, 20); assert.equal(M.user(f.s).frozen, 80); assert.equal(t.escrow, 80); assert.equal(M.user(original).available, 100);
  const before = M.clone(f.s); assert.throws(() => f.publish({ link: 'https://surveys.example/over', quota: 20 }), /还差/); assert.deepEqual(f.s, before);
});
test('normalized tracking links are duplicate, meaningful query ids are preserved', () => {
  const f = setup(); f.publish({ link: 'https://wjx.cn/vm/survey.aspx?id=1&utm_source=wx#end' });
  assert.throws(() => f.publish({ link: 'http://www.wjx.cn/vm/survey.aspx?utm_medium=x&id=1' }), /已经有人/);
  assert.notEqual(M.normalizeLink('https://wjx.cn/?id=1'), M.normalizeLink('https://wjx.cn/?id=2'));
  for (const link of ['javascript:alert(1)', 'file:///x', 'https://user:pass@example.com']) assert.throws(() => M.normalizeLink(link));
});
test('claim does not move money, only one record per task even after expiry', () => {
  const f = setup(), t = f.publish(), x = f.claim(t); assert.equal(M.remaining(f.s, M.task(f.s, t.id)), 7); assert.equal(M.user(f.s).available, 100);
  assert.throws(() => f.run({ type: 'claim', taskId: t.id, eligible: true }), /已经领过/);
  f.run({ type: 'advance', hours: 25 }); assert.equal(M.sub(f.s, x.id).status, 'expired'); assert.equal(M.remaining(f.s, M.task(f.s, t.id)), 8);
  assert.throws(() => f.run({ type: 'claim', taskId: t.id, eligible: true }), /已经领过/);
});
test('approve transfers escrow once, submission and approval cannot be repeated', () => {
  const f = setup(), t = f.publish(), x = f.claim(t); f.submit(x);
  assert.equal(M.user(f.s).available, 100); assert.throws(() => f.submit(x), /不能重复/);
  f.switchTo('u1'); f.run({ type: 'review', submissionId: x.id, approve: true });
  assert.equal(M.user(f.s, 'u1').frozen, 70); assert.equal(M.user(f.s, 'u2').available, 110);
  assert.throws(() => f.run({ type: 'review', submissionId: x.id, approve: true }), /待审核/); assert.equal(M.assertState(f.s).total, 1900);
});
test('first submission protection routes suspected evidence to admin, then admin pays', () => {
  const f = setup(), t = f.publish(), x = f.claim(t); f.submit(x); f.switchTo('u1');
  assert.throws(() => f.run({ type: 'review', submissionId: x.id, approve: false }), /选择具体原因/);
  f.run({ type: 'review', submissionId: x.id, approve: false, reason: '截图不清晰' }); assert.equal(M.sub(f.s, x.id).status, 'appealed');
  f.switchTo('u3'); assert.throws(() => f.run({ type: 'judge', submissionId: x.id, verdict: 'win', reason: '' }), /理由/);
  f.run({ type: 'judge', submissionId: x.id, verdict: 'win', reason: '确认完成，予以通过' }); assert.equal(M.user(f.s, 'u2').available, 110);
});
function rejectedFixture() {
  const f = setup(), t = f.publish(), first = f.claim(t); f.submit(first); f.switchTo('u1'); f.run({ type: 'review', submissionId: first.id, approve: true });
  const x = f.claim(t, 'u3'); f.submit(x); f.switchTo('u1'); f.run({ type: 'review', submissionId: x.id, approve: false, reason: '看不出完成' });
  return { f, t, x };
}
test('rejected evidence reserves funds and seat until appeal decision, successful appeal pays once', () => {
  const { f, t, x } = rejectedFixture(); assert.equal(M.remaining(f.s, M.task(f.s, t.id)), 6); assert.equal(M.user(f.s, 'u1').frozen, 70);
  f.switchTo('u3'); f.run({ type: 'appeal', submissionId: x.id, reason: '截图显示提交成功' });
  assert.throws(() => f.run({ type: 'appeal', submissionId: x.id, reason: '再次申诉' }));
  f.run({ type: 'judge', submissionId: x.id, verdict: 'win', reason: '证明有效' }); assert.equal(M.user(f.s, 'u3').available, 110); assert.equal(M.task(f.s, t.id).escrow, 60);
});
test('appeal expiry releases seats, refunds only after closed and no reserved submissions', () => {
  const { f, t, x } = rejectedFixture(); f.run({ type: 'stop', taskId: t.id }); assert.equal(M.task(f.s, t.id).status, 'settling'); assert.equal(M.user(f.s, 'u1').available, 20);
  f.run({ type: 'advance', hours: 169 }); assert.equal(M.task(f.s, t.id).status, 'closed'); assert.equal(M.user(f.s, 'u1').available, 90); assert.equal(M.user(f.s, 'u1').frozen, 0);
  f.switchTo('u3'); assert.throws(() => f.run({ type: 'appeal', submissionId: x.id, reason: '太迟了' }), /7 天内/);
});
test('48h auto approval, reminders and 7-day image cleanup are lazy and idempotent', () => {
  const f = setup(), t = f.publish(), x = f.claim(t); f.submit(x);
  f.run({ type: 'advance', hours: 24 }); assert.equal(f.s.notices.filter(n => n.text.includes('不足 24')).length, 1);
  f.run({ type: 'tick' }); assert.equal(f.s.notices.filter(n => n.text.includes('不足 24')).length, 1);
  f.run({ type: 'advance', hours: 19 }); assert.equal(f.s.notices.filter(n => n.text.includes('不足 6')).length, 1);
  f.run({ type: 'advance', hours: 6 }); assert.equal(M.sub(f.s, x.id).automatic, true); assert.equal(M.user(f.s, 'u2').available, 110);
  f.run({ type: 'tick' }); assert.equal(M.user(f.s, 'u2').available, 110);
  f.run({ type: 'advance', hours: 169 }); assert.equal(M.sub(f.s, x.id).screenshot, null);
});
test('stop with pending or locked claims retains funds; removed task keeps pending but cancels locked', () => {
  const f = setup(), t = f.publish(), x = f.claim(t); f.submit(x); const y = f.claim(t, 'u3');
  f.run({ type: 'remove', taskId: t.id, reason: '发布内容违规' }); assert.equal(M.sub(f.s, y.id).status, 'cancelled'); assert.equal(M.task(f.s, t.id).escrow, 80);
  f.run({ type: 'advance', hours: 49 }); assert.equal(M.user(f.s, 'u2').available, 110); assert.equal(M.user(f.s, 'u1').available, 90); assert.equal(M.task(f.s, t.id).escrow, 0); assert.equal(M.task(f.s, t.id).status, 'removed');
});
test('quota exhaustion settles then closes, no overbooking and no early refund', () => {
  const f = setup(), t = f.publish({ quota: 1 }), x = f.claim(t); assert.equal(M.task(f.s, t.id).status, 'settling');
  f.switchTo('u3'); assert.throws(() => f.run({ type: 'claim', taskId: t.id, eligible: true }), /招满/);
  f.switchTo('u2'); f.submit(x); f.switchTo('u1'); f.run({ type: 'review', submissionId: x.id, approve: true });
  assert.equal(M.task(f.s, t.id).status, 'closed'); assert.equal(M.task(f.s, t.id).escrow, 0);
});
test('daily limit is 5 submissions in Shanghai day and allows next day', () => {
  const f = setup(); const tasks = f.s.tasks.slice(0, 6);
  for (const t of tasks.slice(0, 5)) { const x = f.claim(t); f.submit(x); }
  const x = f.claim(tasks[5]); assert.throws(() => f.submit(x), /今天已提交 5/);
  f.run({ type: 'advance', hours: 12 }); f.submit(x); assert.equal(M.sub(f.s, x.id).status, 'pending');
});
test('restricted/banned users and admin-only operations enforced by model', () => {
  const f = setup(); assert.throws(() => f.run({ type: 'manageUser', userId: 'u2', operation: 'ban', reason: 'test' }), /管理员/);
  f.switchTo('u3'); f.run({ type: 'manageUser', userId: 'u1', operation: 'restrict', days: 7, reason: '限制试用' }); f.switchTo('u1'); assert.throws(() => f.publish(), /限制发布/);
  f.switchTo('u3'); f.run({ type: 'manageUser', userId: 'u2', operation: 'ban', reason: '违反约定' }); f.switchTo('u2'); assert.throws(() => f.run({ type: 'claim', taskId: f.s.tasks[0].id, eligible: true }), /封禁/);
});
test('adjustments reconcile with global total and cannot create negative balances', () => {
  const f = setup(); f.switchTo('u3'); f.run({ type: 'manageUser', userId: 'u1', operation: 'adjust', amount: 23, reason: '演示补偿' }); assert.equal(M.assertState(f.s).total, 1923);
  assert.throws(() => f.run({ type: 'manageUser', userId: 'u1', operation: 'adjust', amount: -124, reason: '扣回' }), /余额不足/); assert.equal(M.user(f.s, 'u1').available, 123);
});
test('high rejection rate auto-pays pending and future submissions', () => {
  const f = setup(), t = f.publish();
  const first = f.claim(t); f.submit(first); f.switchTo('u1'); f.run({ type: 'review', submissionId: first.id, approve: true });
  const later = [];
  for (const u of ['u3', 'u4', 'u5', 'u6']) { const x = f.claim(t, u); f.submit(x); later.push(x); }
  f.switchTo('u1');
  for (const x of later.slice(0, 3)) f.run({ type: 'review', submissionId: x.id, approve: false, reason: '看不出完成' });
  assert.equal(M.publisherRisk(f.s, 'u1').high, true); assert.equal(M.sub(f.s, later[3].id).status, 'approved');
  const x = f.claim(t, 'u7'); f.submit(x); assert.equal(M.sub(f.s, x.id).status, 'approved'); assert.equal(M.publisherRisk(f.s, 'u1').high, true); assert.equal(M.assertState(f.s).valid, true);
});
test('auto reward dispute rolls back only once and restores recruiting escrow', () => {
  const f = setup(), t = f.publish(), x = f.claim(t); f.submit(x); f.run({ type: 'advance', hours: 49 }); f.switchTo('u1'); f.run({ type: 'challenge', submissionId: x.id, reason: '图片无关' });
  f.switchTo('u3'); f.run({ type: 'judge', submissionId: x.id, verdict: 'reverse', reason: '核实无关' }); assert.equal(M.user(f.s, 'u2').available, 100); assert.equal(M.sub(f.s, x.id).status, 'overturned');
  assert.equal(M.task(f.s, t.id).escrow, 80);
  assert.throws(() => f.run({ type: 'judge', submissionId: x.id, verdict: 'reverse', reason: '重复回滚' })); M.assertState(f.s);
});
test('reward reversal cannot make a responder negative and leaves dispute pending on failure', () => {
  const f = setup(), t = f.publish(), x = f.claim(t); f.submit(x); f.run({ type: 'advance', hours: 49 });
  f.switchTo('u1'); f.run({ type: 'challenge', submissionId: x.id, reason: '证明有误' }); f.switchTo('u3');
  f.run({ type: 'manageUser', userId: 'u2', operation: 'adjust', amount: -105, reason: '测试余额不足' });
  const before = M.clone(f.s);
  assert.throws(() => f.run({ type: 'judge', submissionId: x.id, verdict: 'reverse', reason: '核实后回滚' }), /余额不足/);
  assert.deepEqual(f.s, before); assert.equal(M.sub(f.s, x.id).challenge.status, 'pending');
});
test('eligibility, screenshot format, privacy confirmation, title and publication ranges enforced', () => {
  const f = setup(), t = f.publish(); f.switchTo('u2'); assert.throws(() => f.run({ type: 'claim', taskId: t.id }), /确认/);
  const x = f.claim(t); assert.throws(() => f.run({ type: 'submit', submissionId: x.id, screenshot: 'data:text/html;base64,abcd', privacy: true }), /图片|截图/);
  assert.throws(() => f.run({ type: 'submit', submissionId: x.id, screenshot: proof, privacy: false }), /确认截图/);
  f.switchTo('u1'); for (const override of [{ title: '短' }, { reward: 51 }, { quota: 21 }, { minutes: 0 }]) assert.ok(Object.keys(M.validatePublish(f.s, input(override))).length);
});

test('claim generates a four-character completion code and initializes review fields', () => {
  const f = setup(), t = f.publish(), x = f.claim(t);
  assert.equal(t.codeRequired, true);
  assert.equal(t.codeMode, 'manual');
  assert.match(x.completionCode, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  assert.equal(x.codeVerified, false);
  assert.equal(x.correctionUsed, 0);
  assert.equal(x.codeMissingAt, null);
  f.submit(x);
  assert.equal(M.sub(f.s, x.id).completionCode, x.completionCode);
});

test('a collision never reuses the code of a previous claim on the same task', context => {
  context.mock.method(Math, 'random', () => 0);
  const f = setup(), t = f.publish(), first = f.claim(t);
  f.run({ type: 'advance', hours: 25 });
  const second = f.claim(t, 'u3');
  assert.equal(M.sub(f.s, first.id).status, 'expired');
  assert.notEqual(first.completionCode, second.completionCode);
});

test('completion code modes persist and disabled tasks can still be claimed', () => {
  const f = setup(), t = f.publish({ codeRequired: false, quota: 1 });
  const x = f.claim(t);
  assert.equal(t.codeRequired, false);
  assert.equal(t.codeMode, 'none');
  assert.equal(x.completionCode, '');
  f.switchTo('u1');
  const url = f.publish({ codeMode: 'url', quota: 1, link: 'https://surveys.example/url' });
  assert.equal(url.codeRequired, true);
  assert.equal(url.codeMode, 'url');
});

test('legacy submissions gain defaults without inventing codes for previous claims', () => {
  const previous = seed(start);
  const next = M.commit(previous, { type: 'tick' });
  assert.ok(next.tasks.every(t => t.codeRequired && t.codeMode === 'manual'));
  assert.ok(next.submissions.every(x => x.completionCode === '' &&
    x.codeVerified === false && x.correctionUsed === 0 && x.codeMissingAt === null));
  assert.equal(previous.submissions[0].completionCode, undefined);
});

test('a new WJX claim stores a four-character code and attaches it to its launch URL', () => {
  const f = setup(), t = f.publish({ link: 'https://www.wjx.cn/vm/test.aspx?x=1#frag' }), claim = f.claim(t);
  const x = { ...claim };
  delete x.sourceToken; // The original four-character URL is still valid for historical claims.
  assert.equal(t.codeSupported, true);
  assert.match(x.code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  assert.equal(x.codeAttached, true);
  assert.equal(x.codeVerified, false);
  assert.equal(x.correctionUsed, 0);
  assert.equal(M.surveyLaunchUrl(t, x), 'https://www.wjx.cn/vm/test.aspx?x=1&sojumpparm=' + x.code + '#frag');
  assert.equal(M.task(f.s, t.id).link, 'https://www.wjx.cn/vm/test.aspx?x=1#frag');
});

test('task codes are stable, short uppercase identifiers', () => {
  for (const id of ['t3', 'task-12', 'b7f3', 'z', '---', 'sample-101', 'alpha-long']) {
    assert.match(M.taskCode(id), /^[A-Z0-9]{2,4}$/);
    assert.equal(M.taskCode(id), M.taskCode(id));
  }
});
test('task code preserves short IDs and follows the specified examples', () => {
  assert.equal(M.taskCode('t3'), 'T3');
  assert.equal(M.taskCode('task-12'), 'T12');
  assert.equal(M.taskCode('b7f3'), 'B7F3');
  assert.equal(M.taskCode('---'), 'T0');
});
test('submission tokens combine the task and the four-character code', () => {
  assert.equal(M.submissionToken('t3', 'K7P2'), 'T3-K7P2');
  assert.notEqual(M.submissionToken('t4', 'K7P2'), M.submissionToken('t3', 'K7P2'));
});
test('withCode sets a composite token while preserving query and fragment', () => {
  assert.equal(M.withCode('https://v.wjx.cn/vm/demo.aspx?x=1&sojumpparm=OLD#frag', 'T3-K7P2'),
    'https://v.wjx.cn/vm/demo.aspx?x=1&sojumpparm=T3-K7P2#frag');
});
test('a new claim persists exactly the token later used to launch the questionnaire', () => {
  const f = setup(), t = f.publish({ link: 'https://v.wjx.cn/vm/source.aspx' }), x = f.claim(t);
  assert.equal(x.sourceToken, M.submissionToken(t.id, x.code));
  assert.equal(new URL(M.surveyLaunchUrl(t, x)).searchParams.get('sojumpparm'), x.sourceToken);
});
test('two submissions in one task share the task prefix but have distinct tokens', () => {
  const f = setup(), t = f.publish({ link: 'https://wjx.cn/vm/unique.aspx' });
  const a = f.claim(t), b = f.claim(t, 'u3');
  assert.equal(a.sourceToken.split('-')[0], b.sourceToken.split('-')[0]);
  assert.notEqual(a.sourceToken, b.sourceToken);
});
test('an invalid or unsafe questionnaire URL has no launch target', () => {
  for (const link of ['malformed', 'javascript:alert(1)', 'https://user:pass@wjx.cn/vm/a']) {
    assert.equal(M.surveyLaunchUrl({ link }, { code: 'K7P2', sourceToken: 'T3-K7P2', codeAttached: true }), null);
  }
});
test('a composite identifier is never attached to an unrelated hostname', () => {
  const link = 'https://wjx.cn.unrelated.example/abc?x=1';
  assert.equal(M.surveyLaunchUrl({ link }, { code: 'K7P2', sourceToken: 'T3-K7P2', codeAttached: true }), link);
});

test('the new code field stays unique across claims for the same task even on collision', context => {
  context.mock.method(Math, 'random', () => 0);
  const f = setup(), t = f.publish({ link: 'https://wjx.cn/vm/test.aspx' });
  assert.notEqual(f.claim(t, 'u2').code, f.claim(t, 'u3').code);
});

test('withCode adds the first search parameter', () => {
  assert.equal(M.withCode('https://wjx.cn/abc.aspx', 'K7P2'), 'https://wjx.cn/abc.aspx?sojumpparm=K7P2');
});

test('withCode preserves existing query parameters', () => {
  assert.equal(M.withCode('https://wjx.cn/abc.aspx?x=1', 'K7P2'), 'https://wjx.cn/abc.aspx?x=1&sojumpparm=K7P2');
});

test('withCode replaces every old copy of sojumpparm with one new value', () => {
  const url = new URL(M.withCode('https://wjx.cn/abc.aspx?sojumpparm=OLD&x=1&sojumpparm=OTHER', 'K7P2'));
  assert.deepEqual(url.searchParams.getAll('sojumpparm'), ['K7P2']);
  assert.equal(url.searchParams.get('x'), '1');
});

test('withCode puts the parameter before the fragment and rejects invalid links', () => {
  assert.equal(M.withCode('https://wjx.cn/abc.aspx#frag', 'K7P2'), 'https://wjx.cn/abc.aspx?sojumpparm=K7P2#frag');
  assert.equal(M.withCode('not a link', 'K7P2'), null);
  assert.equal(M.withCode('javascript:alert(1)', 'K7P2'), null);
});

test('unsupported and lookalike domains keep the original link while still getting a code', () => {
  const f = setup(), t = f.publish({ link: 'https://wjx.cn.example.com/abc.aspx?x=1', codeRequired: false });
  const x = f.claim(t);
  assert.equal(t.codeSupported, false);
  assert.match(x.code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  assert.equal(x.codeAttached, false);
  assert.equal(M.surveyLaunchUrl(t, x), t.link);
  assert.equal(M.supportsSurveyCode('https://fake-wjx.cn/abc.aspx'), false);
  assert.equal(M.supportsSurveyCode('https://www.wjx.top/abc.aspx'), false);
});
