const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../prototype/data/points.js');
const { seed } = require('../prototype/data/seed.js');
const START = Date.parse('2026-11-21T02:00:00Z');
const IMAGE = 'data:image/png;base64,aGVsbG8=';

function fixture() {
  let state = seed(START), serial = 0;
  const apply = action => { state = M.commit(state, action); return state; };
  const as = userId => apply({ type: 'switch', userId });
  const publish = (publisherId = 'u1', extra = {}) => {
    as(publisherId);
    apply({ type: 'publish', input: { title: '完成码回归验收问卷', description: '独立回归测试，不收集真实信息。', topic: '学习研究', audienceText: '全校同学', audience: ['全校同学'], minutes: 3, link: `https://www.wjx.cn/vm/code-regression-${++serial}`, reward: 10, quota: 3, days: 14, codeRequired: true, codeMode: 'manual', ...extra } });
    return state.tasks.at(-1).id;
  };
  const claim = (taskId, userId = 'u2', submit = true) => {
    as(userId); apply({ type: 'claim', taskId, eligible: true }); const id = state.submissions.at(-1).id;
    if (submit) apply({ type: 'submit', submissionId: id, screenshot: IMAGE, privacy: true, note: '已提交外部问卷' });
    return id;
  };
  const verify = (id, verified = true) => { as(M.task(state, M.sub(state, id).taskId).publisherId); return apply({ type: 'verifyCode', submissionId: id, verified }); };
  const reject = (id, reason) => { as(M.task(state, M.sub(state, id).taskId).publisherId); return apply({ type: 'review', submissionId: id, approve: false, reason }); };
  const correct = (id, extra = {}) => { as(M.sub(state, id).userId); return apply({ type: 'correctCode', submissionId: id, note: '已检查并补充相应完成码，请再次核对。', ...extra }); };
  return { get state() { return state; }, apply, as, publish, claim, verify, reject, correct };
}

test('an internal number on an unsupported platform cannot be checked or reported missing', () => {
  const f = fixture(), taskId = f.publish('u1', { link: 'https://surveys.example/no-source-code' }), id = f.claim(taskId);
  f.as('u1');
  const before = M.clone(f.state);
  assert.match(M.sub(f.state, id).code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
  assert.throws(() => f.apply({ type: 'verifyCode', submissionId: id, verified: true }), /没有通过链接传递/);
  assert.throws(() => f.apply({ type: 'review', submissionId: id, approve: false, reason: '码对不上' }), /没有通过链接传递/);
  assert.deepEqual(f.state, before);
});

test('first mismatching completion code enters correction, reserves reward, pauses automatic payout', () => {
  const f = fixture(), taskId = f.publish(), id = f.claim(taskId);
  const beforeBalance = M.user(f.state, 'u2').available;
  f.reject(id, '码对不上');
  assert.equal(M.sub(f.state, id).status, 'correction');
  assert.equal(M.sub(f.state, id).correctionUsed, 1);
  assert.equal(M.task(f.state, taskId).escrow, M.toUnits(30));
  assert.equal(M.remaining(f.state, M.task(f.state, taskId)), 2);
  f.apply({ type: 'advance', hours: 49 });
  assert.equal(M.sub(f.state, id).status, 'correction');
  assert.equal(M.user(f.state, 'u2').available, beforeBalance);
  M.assertState(f.state);
});

test('correction belongs to respondent, requires an explanation, resets review deadline and can be used once', () => {
  const f = fixture(), taskId = f.publish(), id = f.claim(taskId);
  f.reject(id, '码对不上');
  const before = M.clone(f.state);
  assert.throws(() => f.apply({ type: 'correctCode', submissionId: id, note: '补正' }));
  assert.deepEqual(f.state, before);
  f.as('u2');
  assert.throws(() => f.apply({ type: 'correctCode', submissionId: id, note: '   ' }));
  f.apply({ type: 'advance', hours: 12 });
  f.correct(id);
  assert.equal(M.sub(f.state, id).status, 'pending');
  assert.equal(M.sub(f.state, id).codeVerified, false);
  assert.equal(M.sub(f.state, id).reviewUntil, f.state.now + 48 * M.HOUR);
  const saved = M.clone(f.state);
  assert.throws(() => f.correct(id));
  assert.deepEqual(f.state, saved);
});

test('optional replacement correction screenshot uses the same image and privacy requirements', () => {
  const f = fixture(), taskId = f.publish(), id = f.claim(taskId);
  f.reject(id, '码对不上'); f.as('u2');
  assert.throws(() => f.apply({ type: 'correctCode', submissionId: id, note: '补充图片', screenshot: 'data:text/html;base64,eA==', privacy: true }));
  assert.throws(() => f.apply({ type: 'correctCode', submissionId: id, note: '补充图片', screenshot: IMAGE, privacy: false }));
  f.correct(id, { screenshot: IMAGE, privacy: true });
  assert.equal(M.sub(f.state, id).status, 'pending');
  assert.equal(M.sub(f.state, id).screenshot, IMAGE);
});

test('a second code mismatch follows refusal and appeal safeguards, with no second correction window', () => {
  const f = fixture();
  const taskId = f.publish(), first = f.claim(taskId);
  f.verify(first); f.apply({ type: 'review', submissionId: first, approve: true });
  const id = f.claim(taskId, 'u3'); f.reject(id, '码对不上'); f.correct(id); f.reject(id, '码对不上');
  assert.equal(M.sub(f.state, id).status, 'rejected');
  assert.equal(M.sub(f.state, id).correctionUsed, 1);
  assert.equal(M.sub(f.state, id).final, false);
  assert.equal(M.task(f.state, taskId).escrow, M.toUnits(20));
  assert.equal(M.remaining(f.state, M.task(f.state, taskId)), 1);
  f.as('u3'); const before = M.clone(f.state);
  assert.throws(() => f.correct(id));
  assert.deepEqual(f.state, before);
  M.assertState(f.state);
});

test('publisher-only code verification accepts booleans only for pending records', () => {
  const f = fixture(), taskId = f.publish(), id = f.claim(taskId, 'u2', false);
  f.as('u1'); assert.throws(() => f.apply({ type: 'verifyCode', submissionId: id, verified: true }));
  f.as('u2'); f.apply({ type: 'submit', submissionId: id, screenshot: IMAGE, privacy: true });
  assert.throws(() => f.apply({ type: 'verifyCode', submissionId: id, verified: true }));
  f.as('u3'); assert.throws(() => f.apply({ type: 'verifyCode', submissionId: id, verified: true }));
  f.as('u1'); assert.throws(() => f.apply({ type: 'verifyCode', submissionId: id, verified: 'yes' }));
  f.verify(id, true); assert.equal(M.sub(f.state, id).codeVerified, true);
  f.verify(id, false); assert.equal(M.sub(f.state, id).codeVerified, false);
  f.verify(id, true); f.apply({ type: 'review', submissionId: id, approve: true });
  assert.throws(() => f.apply({ type: 'verifyCode', submissionId: id, verified: false }));
});

test('batch review may approve unverified clean submissions on unsupported platforms, transfers each reward exactly once', () => {
  const f = fixture(), taskId = f.publish('u1', { link: 'https://surveys.example/legacy-batch' }), a = f.claim(taskId, 'u2'), b = f.claim(taskId, 'u3');
  f.as('u1'); f.apply({ type: 'approveAll', taskId });
  assert.equal(M.sub(f.state, a).status, 'approved'); assert.equal(M.sub(f.state, b).status, 'approved');
  assert.equal(M.user(f.state, 'u2').available, M.toUnits(110)); assert.equal(M.user(f.state, 'u3').available, M.toUnits(110));
  assert.equal(M.task(f.state, taskId).escrow, M.toUnits(10));
  const before = M.clone(f.state);
  assert.throws(() => f.apply({ type: 'approveAll', taskId }));
  assert.deepEqual(f.state, before); M.assertState(f.state);
});

test('unsubmitted historical claim blocks whole batch without partially paying eligible submissions', () => {
  const f = fixture(), taskId = f.publish(), a = f.claim(taskId, 'u2'), b = f.claim(taskId, 'u3', false);
  f.as('u1'); const before = M.clone(f.state);
  assert.throws(() => f.apply({ type: 'approveAll', taskId }));
  assert.deepEqual(f.state, before); assert.equal(M.sub(f.state, a).status, 'pending');
  f.apply({ type: 'advance', hours: 25 });
  assert.equal(M.sub(f.state, b).status, 'expired');
  assert.throws(() => f.apply({ type: 'approveAll', taskId }));
  assert.equal(M.sub(f.state, a).status, 'pending');
});

test('active correction blocks batch, and another user or administrator cannot batch-review someone else’s task', () => {
  const f = fixture(), taskId = f.publish(), a = f.claim(taskId, 'u2'), b = f.claim(taskId, 'u3');
  f.reject(a, '码对不上'); const before = M.clone(f.state);
  assert.throws(() => f.apply({ type: 'approveAll', taskId })); assert.deepEqual(f.state, before);
  assert.equal(M.sub(f.state, b).status, 'pending');
  f.as('u2'); assert.throws(() => f.apply({ type: 'approveAll', taskId }));
  f.as('u3'); assert.throws(() => f.apply({ type: 'approveAll', taskId }));
});

function actuallyReject(f, taskId, userId, reason) {
  const first = f.claim(taskId, 'u3'); f.verify(first); f.apply({ type: 'review', submissionId: first, approve: true });
  const id = f.claim(taskId, userId); f.reject(id, reason); return id;
}

test('dirty-data refusal history blocks batch even when the remaining record is clean', () => {
  const f = fixture(), taskId = f.publish();
  const rejected = actuallyReject(f, taskId, 'u2', '未按要求填写');
  assert.equal(M.sub(f.state, rejected).status, 'rejected');
  const pending = f.claim(taskId, 'u4'); f.as('u1'); const before = M.clone(f.state);
  assert.throws(() => f.apply({ type: 'approveAll', taskId })); assert.deepEqual(f.state, before);
  assert.equal(M.sub(f.state, pending).status, 'pending');
});

test('three actual dirty-data refusals restrict claims for seven days, without blocking after expiry', () => {
  const f = fixture();
  for (const owner of ['u1', 'u5', 'u6']) {
    const taskId = f.publish(owner, { quota: 2 }); actuallyReject(f, taskId, 'u2', '未按要求填写');
  }
  assert.equal(M.user(f.state, 'u2').claimRestrictedUntil, f.state.now + 7 * M.DAY);
  f.as('u2'); const target = f.state.tasks.find(t => t.publisherId !== 'u2' && t.status === 'open' && !f.state.submissions.some(x => x.userId === 'u2' && x.taskId === t.id));
  assert.ok(target); assert.throws(() => f.apply({ type: 'claim', taskId: target.id, eligible: true }));
  f.apply({ type: 'advance', hours: 169 });
  const newTask = f.publish('u1', { quota: 1, reward: 5 }); f.claim(newTask, 'u2', false);
  assert.equal(f.state.submissions.at(-1).status, 'locked'); M.assertState(f.state);
});

test('first protected dirty-data suspicion and other refusal reasons do not trigger claim restriction', () => {
  const f = fixture(), protectedTask = f.publish('u1', { quota: 1 });
  const first = f.claim(protectedTask); f.reject(first, '未按要求填写');
  assert.equal(M.sub(f.state, first).status, 'appealed');
  for (const owner of ['u5', 'u6', 'u7']) {
    const taskId = f.publish(owner, { quota: 2 }); actuallyReject(f, taskId, 'u2', '截图不清晰');
  }
  assert.ok(!M.user(f.state, 'u2').claimRestrictedUntil || M.user(f.state, 'u2').claimRestrictedUntil <= f.state.now);
  M.assertState(f.state);
});

test('a corrected first submission can be genuinely rejected for a second mismatch, without reopening correction', () => {
  const f = fixture(), taskId = f.publish('u1', { quota: 1 }), id = f.claim(taskId);
  f.reject(id, '码对不上'); f.correct(id); f.reject(id, '码对不上');
  const x = M.sub(f.state, id);
  assert.equal(x.status, 'rejected'); assert.equal(x.correctionUsed, 1);
  assert.equal(x.final, false); assert.equal(M.task(f.state, taskId).escrow, M.toUnits(10));
  assert.ok(!M.user(f.state, 'u2').claimRestrictedUntil);
  f.as('u2'); assert.throws(() => f.apply({ type: 'correctCode', submissionId: id, note: '再次补正' }));
  f.apply({ type: 'appeal', submissionId: id, reason: '请求人工复核' });
  assert.equal(M.sub(f.state, id).status, 'appealed'); M.assertState(f.state);
});

test('verified code permits first dirty-data refusal and increments only the actual offender', () => {
  const f = fixture(), taskId = f.publish('u1', { quota: 1 }), id = f.claim(taskId);
  const offenderBefore = M.user(f.state, 'u2').violations, publisherBefore = M.user(f.state, 'u1').violations;
  f.verify(id); f.reject(id, '未按要求填写');
  assert.equal(M.sub(f.state, id).status, 'rejected');
  assert.equal(M.user(f.state, 'u2').violations, offenderBefore + 1);
  assert.equal(M.user(f.state, 'u1').violations, publisherBefore);
  assert.equal(M.task(f.state, taskId).escrow, M.toUnits(10)); M.assertState(f.state);
});
