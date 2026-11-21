const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../prototype/data/points.js');
const { seed } = require('../prototype/data/seed.js');

const initial = () => M.commit(seed(), { type: 'switch', userId: 'u20' });
const survey = { title: '调查', description: '调查说明', audienceText: '全校', topic: '学习研究',
  minutes: 3, link: 'https://surveys.example/reward-boundary', reward: 600, quota: 1, days: 7 };
const experiment = s => ({
  type: 'experiment', title: '访谈', description: '实验说明', format: 'offline', location: '教学楼',
  reward: 600, days: 30, slots: [{ startAt: s.now + M.DAY, minutes: 60, capacity: 1 }],
  ethicsConfirmed: true, publicPlaceConfirmed: true, privacyConfirmed: true
});

test('survey reward accepts 600 but rejects larger rewards without relaxing the budget', () => {
  const s = initial();
  assert.deepEqual(M.validatePublish(s, survey), {});
  for (const reward of [600.5, 601]) assert.match(M.validatePublish(s, { ...survey, reward }).reward, /5～600/);
  assert.match(M.validatePublish(s, { ...survey, quota: 8 }).budget, /1800/);
});

test('experiment accepts 600 and 80.5, but rejects excess precision and rewards below 10', () => {
  const s = initial(), input = experiment(s);
  assert.deepEqual(M.validatePublish(s, input), {});
  const published = M.commit(s, { type: 'publish', input: { ...input, reward: 80.5 } });
  assert.equal(published.tasks.at(-1).escrow, 805);
  for (const reward of [9.9, 600.5]) assert.match(M.validatePublish(s, { ...input, reward }).reward, /10～600/);
  assert.match(M.validatePublish(s, { ...input, reward: 80.55 }).reward, /一位小数/);
});

test('experiment accepts a two-character title and 30 days, with the 60 limits enforced', () => {
  const s = initial(), input = experiment(s);
  assert.deepEqual(M.validatePublish(s, input), {});
  assert.match(M.validatePublish(s, { ...input, title: '长'.repeat(61) }).title, /当前 61/);
  assert.match(M.validatePublish(s, { ...input, days: 61 }).days, /1～60/);
});
