const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../prototype/data/points.js');
const { seed } = require('../prototype/data/seed.js');

const start = Date.parse('2026-11-17T08:00:00Z');
const reason = '核对完成页及提交时间后作出裁决';

function dispute({ challenge = false, quota = 8 } = {}) {
  let state = seed(start);
  const run = action => { state = M.commit(state, action); };
  const switchTo = userId => run({ type: 'switch', userId });
  run({ type: 'publish', input: {
    title: '自习习惯调查', description: '仅用于课程研究', topic: '学习研究',
    audienceText: '全校同学', audience: ['全校同学'], minutes: 3,
    link: 'https://surveys.example/verdict', reward: 10, quota, days: 7
  } });
  const taskId = state.tasks.at(-1).id;
  switchTo('u2');
  run({ type: 'claim', taskId, eligible: true });
  const submissionId = state.submissions.at(-1).id;
  run({ type: 'submit', submissionId, screenshot: 'data:image/png;base64,aGVsbG8=', privacy: true });
  if (challenge) run({ type: 'advance', hours: 49 });
  switchTo('u1');
  if (challenge) run({ type: 'challenge', submissionId, reason: '请复核已自动通过的奖励' });
  else run({ type: 'review', submissionId, approve: false, reason: '看不出完成' });
  switchTo('u3');
  return {
    get state() { return state; },
    get submission() { return M.sub(state, submissionId); },
    get task() { return M.task(state, taskId); },
    judge(verdict) { run({ type: 'judge', submissionId, verdict, reason }); }
  };
}

test('verdict options define labels and effects for all five outcomes', () => {
  assert.deepEqual(Object.keys(M.VERDICTS).sort(), ['dismiss', 'remove', 'reverse', 'uphold', 'win']);
  for (const [code, { label, effect }] of Object.entries(M.VERDICTS)) {
    assert.ok(label && effect);
    assert.equal(M.verdictLabel(code), label);
  }
});

test('judgment retains the selected outcome, timestamp, administrator and reason', () => {
  const f = dispute();
  f.judge('uphold');
  assert.deepEqual(f.submission.verdict, { code: 'uphold', at: f.state.now, by: 'u3', reason });
  assert.equal(f.submission.status, 'rejected');
});

test('no-fault removal closes the dispute, refunds the budget and records no violation', () => {
  const f = dispute();
  const violations = f.state.users.map(user => user.violations);
  f.judge('remove');
  assert.equal(f.task.status, 'removed');
  assert.equal(f.submission.status, 'cancelled');
  assert.equal(f.submission.verdict.code, 'remove');
  assert.equal(f.task.escrow, 0);
  assert.deepEqual(f.state.users.map(user => user.violations), violations);
  M.assertState(f.state);
});

test('a favorable judgment pays the respondent and stores win', () => {
  const f = dispute();
  const previous = M.user(f.state, 'u2').available;
  f.judge('win');
  assert.equal(M.user(f.state, 'u2').available - previous, f.task.reward);
  assert.equal(f.submission.verdict.code, 'win');
  M.assertState(f.state);
});

test('reversing a settled automatic reward pays the publisher back and reconciles', () => {
  const f = dispute({ challenge: true, quota: 1 });
  const available = id => M.user(f.state, id).available;
  const publisher = available('u1'), respondent = available('u2');
  assert.equal(f.task.status, 'closed');
  f.judge('reverse');
  assert.equal(available('u1') - publisher, f.task.reward);
  assert.equal(respondent - available('u2'), f.task.reward);
  assert.equal(f.submission.verdict.code, 'reverse');
  M.assertState(f.state);
});

test('the publisher and respondent receive verdict labels with separate reasons', () => {
  const f = dispute({ challenge: true });
  f.judge('dismiss');
  assert.equal(f.submission.verdict.code, 'dismiss');
  const notices = f.state.notices.filter(notice => notice.text.includes('裁决已出'));
  assert.deepEqual(notices.map(notice => notice.userId).sort(), ['u1', 'u2']);
  for (const notice of notices) {
    assert.ok(notice.text.includes(M.verdictLabel('dismiss')));
    assert.ok(!notice.text.includes(reason));
    assert.equal(notice.reason, reason);
    assert.equal(notice.href, `detail/${f.task.id}`);
  }
});
