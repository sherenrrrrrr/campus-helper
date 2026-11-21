const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../prototype/data/points.js');
const { seed } = require('../prototype/data/seed.js');

const start = Date.parse('2026-11-21T08:00:00+08:00');
function published() {
  const state = M.commit(seed(start), { type: 'publish', input: {
    title: '课程研究问卷', description: '用于课堂研究。', topic: '学习研究',
    audienceText: '全校同学', audience: ['全校同学'], minutes: 3,
    link: 'https://surveys.example/edit-task', reward: 10, quota: 4, days: 7
  }});
  return { state, task: state.tasks.at(-1) };
}
const edit = (state, task, input, now) => M.commit(state, { type: 'editTask', taskId: task.id, input }, now);
const switchTo = (state, userId) => M.commit(state, { type: 'switch', userId });
function claimed(state, task) {
  const respondent = switchTo(state, 'u2');
  return switchTo(M.commit(respondent, { type: 'claim', taskId: task.id, eligible: true }), 'u1');
}

test('editing reward freezes the additional budget and records the changed fields', () => {
  const { state, task } = published();
  const next = edit(state, task, { reward: 12.5 });
  assert.equal(M.task(next, task.id).escrow, M.toUnits(50));
  assert.equal(M.user(next).available, M.toUnits(50));
  assert.deepEqual(next.ledger.at(-1), {
    ...next.ledger.at(-1), type: 'freeze', availableDelta: -100, frozenDelta: 100, taskId: task.id
  });
  assert.equal(M.task(next, task.id).history.at(-1).reason, '修改了奖励');
  assert.equal(M.assertState(next).total, M.assertState(state).total);
});

test('lowering reward returns the unused difference to the publisher', () => {
  const { state, task } = published();
  const next = edit(state, task, { reward: 7.5 });
  assert.equal(M.task(next, task.id).escrow, M.toUnits(30));
  assert.equal(M.user(next).available, M.toUnits(70));
  assert.equal(next.ledger.at(-1).type, 'refund');
  assert.equal(next.ledger.at(-1).availableDelta, 100);
  assert.equal(next.ledger.at(-1).frozenDelta, -100);
});

test('changing the quota recalculates escrow at the existing reward', () => {
  const { state, task } = published();
  const next = edit(state, task, { quota: 8 });
  assert.equal(M.task(next, task.id).quota, 8);
  assert.equal(M.task(next, task.id).reward, 100);
  assert.equal(M.task(next, task.id).escrow, 800);
});

test('insufficient edit budget shows the additional amount needed and leaves state untouched', () => {
  const { state, task } = published();
  const before = M.clone(state);
  assert.throws(() => edit(state, task, { reward: 25.5 }), /修改后的预算还差 2 分/);
  assert.deepEqual(state, before);
});

test('all four recruitment fields stay locked even after a claim expires', () => {
  const { state, task } = published();
  const withClaim = claimed(state, task);
  const expired = M.commit(withClaim, { type: 'advance', hours: 25 });
  for (const input of [{ link: 'https://surveys.example/another' }, { reward: 12 }, { quota: 5 }, { days: 12 }]) {
    assert.throws(() => edit(expired, task, input), /已有 1 人领取.+已锁定/);
  }
});

test('descriptive fields remain editable after claiming without changing escrow or deadline', () => {
  const { state, task } = published();
  const next = edit(claimed(state, task), task, { title: '新标题', description: '新的填写说明', minutes: 6 });
  const updated = M.task(next, task.id);
  assert.equal(updated.title, '新标题');
  assert.equal(updated.description, '新的填写说明');
  assert.equal(updated.minutes, 6);
  assert.equal(updated.deadline, task.deadline);
  assert.equal(updated.escrow, task.escrow);
});

test('a different account cannot edit the task', () => {
  const { state, task } = published();
  assert.throws(() => edit(switchTo(state, 'u2'), task, { title: '不可改' }), /只有发布者/);
});

test('stopped and expired tasks cannot be edited', () => {
  const { state, task } = published();
  const stopped = M.commit(state, { type: 'stop', taskId: task.id });
  assert.throws(() => edit(stopped, task, { title: '不可改' }), /正在招募/);
  assert.throws(() => edit(state, task, { title: '不可改' }, task.deadline), /正在招募/);
});

test('unchanged link is accepted, duplicate links are rejected and new link support is recalculated', () => {
  const { state, task } = published();
  assert.doesNotThrow(() => edit(state, task, { link: task.link }));
  assert.throws(() => edit(state, task, { link: state.tasks[0].link }), /已经有人/);
  const next = edit(state, task, { link: 'https://www.wjx.cn/vm/aLongToken.aspx' });
  assert.equal(M.task(next, task.id).codeSupported, true);
});

test('changing days starts the new interval at edit time', () => {
  const { state, task } = published();
  const editedAt = start + M.DAY;
  const next = edit(state, task, { days: 12 }, editedAt);
  assert.equal(M.task(next, task.id).deadline, editedAt + 12 * M.DAY);
});
