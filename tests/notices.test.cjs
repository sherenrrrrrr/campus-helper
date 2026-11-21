const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../prototype/data/points.js');
const { seed } = require('../prototype/data/seed.js');

function withSubmittedProof() {
  let s = seed(Date.parse('2026-11-17T08:00:00Z'));
  const run = action => { s = M.commit(s, action); };
  run({ type: 'publish', input: {
    title: '学习习惯调查', description: '调查日常学习习惯。', topic: '学习研究',
    audienceText: '全校同学', audience: ['全校同学'], minutes: 3,
    link: 'https://surveys.example/notices', reward: 10, quota: 8, days: 7
  } });
  const taskId = s.tasks.at(-1).id;
  run({ type: 'switch', userId: 'u2' });
  run({ type: 'claim', taskId, eligible: true });
  const submissionId = s.submissions.at(-1).id;
  run({ type: 'submit', submissionId, screenshot: 'data:image/png;base64,aGVsbG8=', privacy: true });
  run({ type: 'switch', userId: 'u1' });
  return { s, taskId, submissionId };
}

test('a submitted proof leaves an unread notification for the publisher', () => {
  const { s, taskId } = withSubmittedProof();
  const notice = s.notices.find(n => n.taskId === taskId);
  assert.equal(notice.userId, 'u1');
  assert.equal(notice.read, false);
  assert.equal(M.unreadCount(s, 'u1'), 1);
});

test('pending proof links to the matching task review, and reward links to points', () => {
  const { s, taskId, submissionId } = withSubmittedProof();
  const pending = s.notices.find(n => n.text.includes('等待审核'));
  assert.equal(pending.href, 'review/' + taskId);
  const approved = M.commit(s, { type: 'review', submissionId, approve: true });
  const reward = approved.notices.find(n => n.text.includes('积分已到账'));
  assert.equal(reward.userId, 'u2');
  assert.equal(reward.taskId, taskId);
  assert.equal(reward.href, 'points');
});

test('marking notifications read retains their content and count', () => {
  const { s } = withSubmittedProof();
  const read = M.commit(s, { type: 'readNotices' });
  assert.deepEqual(read.notices, s.notices.map(n => ({ ...n, read: true })));
  assert.equal(s.notices[0].read, false);
});

test('marking notifications read does not touch other accounts', () => {
  const { s, submissionId } = withSubmittedProof();
  const approved = M.commit(s, { type: 'review', submissionId, approve: true });
  const read = M.commit(approved, { type: 'readNotices' });
  assert.equal(read.notices.find(n => n.userId === 'u2').read, false);
  assert.equal(M.unreadCount(read, 'u2'), 1);
});

test('the current account unread count becomes zero on read', () => {
  const { s } = withSubmittedProof();
  assert.equal(M.unreadCount(s), 1);
  assert.equal(M.unreadCount(M.commit(s, { type: 'readNotices' })), 0);
});

test('marking notifications read repeatedly is idempotent', () => {
  const { s } = withSubmittedProof();
  const read = M.commit(s, { type: 'readNotices' });
  assert.deepEqual(M.commit(read, { type: 'readNotices' }).notices, read.notices);
});

test('older notifications without metadata are retained and initially unread', () => {
  const s = seed(Date.parse('2026-11-17T08:00:00Z'));
  s.notices.push({ id: 'notice-old', userId: 'u1', text: '旧通知', at: s.now });
  const migrated = M.migrateState(s);
  assert.deepEqual(migrated.notices[0], { ...s.notices[0], read: false, taskId: null, href: null });
  assert.equal(M.unreadCount(migrated), 1);
  assert.equal(s.notices[0].read, undefined);
});
