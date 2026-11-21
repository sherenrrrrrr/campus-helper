const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../prototype/data/points.js');
const { seed, withSourceDemo, isSourceDemoUrl } = require('../prototype/data/seed.js');
const IMAGE = 'data:image/png;base64,aGVsbG8=';
function fixture(link = 'https://www.wjx.cn/vm/source-verification.aspx') {
  let state = seed(Date.parse('2026-11-21T02:00:00Z'));
  const run = action => { state = M.commit(state, action); return state; };
  run({ type: 'publish', input: { title: '来源核对独立验证问卷', description: '仅用于本地测试', topic: '学习研究', audienceText: '全校同学', minutes: 3, link, reward: 10, quota: 3, days: 14 } });
  const taskId = state.tasks.at(-1).id;
  for (const userId of ['u2', 'u3']) {
    run({ type: 'switch', userId }); run({ type: 'claim', taskId, eligible: true });
    run({ type: 'submit', submissionId: state.submissions.at(-1).id, screenshot: IMAGE, privacy: true });
  }
  run({ type: 'switch', userId: 'u1' });
  return { get state() { return state; }, taskId, run, get entries() { return M.taskSubs(state, taskId); }, get tokens() { return M.taskSubs(state, taskId).map(x => M.submissionToken(taskId, x.code)); } };
}
test('extracts globally from headers, quoted tabular rows and noise with occurrence counts', () => {
  const result = M.parseSourceTokens('来源\t用户\n"T118-W9X5"\t阿哲\n备注: T118-M3X9 和 T118-W9X5\n纯文字\n\n');
  assert.deepEqual(result.tokens, [{ token: 'T118-W9X5', count: 2 }, { token: 'T118-M3X9', count: 1 }]);
  assert.equal(result.unrecognizedLines, 2);
});
test('URL-encoded and lowercase source identifiers normalize without losing duplicate counts', () => {
  assert.deepEqual(M.parseSourceTokens('t118%2Dw9x5\nhttps://www.wjx.cn/?sojumpparm=T118-M3X9').tokens, [{ token: 'T118-W9X5', count: 1 }, { token: 'T118-M3X9', count: 1 }]);
  assert.deepEqual(M.parseSourceTokens('%74%31%31%38%2d%77%39%78%35').tokens, [{ token: 'T118-W9X5', count: 1 }]);
});
test('malformed URL escaping preserves readable identifiers and invalid alphabets are not tokens', () => {
  const parsed = M.parseSourceTokens('broken%ZZ T118-W9X5\nT118-0000\nT118-O1IL');
  assert.deepEqual(parsed.tokens, [{ token: 'T118-W9X5', count: 1 }]); assert.equal(parsed.unrecognizedLines, 2);
  assert.deepEqual(M.parseSourceTokens('  \n\t'), { tokens: [], unrecognizedLines: 0 });
});
test('complete matching resolves all participants and leaves no missing entries', () => {
  const f = fixture(), result = M.matchSources(f.state, f.taskId, f.tokens.join('\n'));
  assert.equal(result.matched.length, 2); assert.equal(result.missing.length, 0); assert.deepEqual(result.foreign, []);
  assert.deepEqual(new Set(result.matched.map(x => x.nickname)), new Set(['阿哲', '管理员']));
});
test('mixed case and whitespace match strictly generated composite identifiers, not a bare code', () => {
  const f = fixture(), result = M.matchSources(f.state, f.taskId, '  ' + f.tokens[0].toLowerCase() + '\t ');
  assert.equal(result.matched.length, 1); assert.equal(result.missing.length, 1);
  assert.equal(M.matchSources(f.state, f.taskId, f.entries[0].code).matched.length, 0);
  const legacy = M.clone(f.state); M.sub(legacy, f.entries[0].id).sourceToken = f.entries[0].code;
  assert.equal(M.matchSources(legacy, f.taskId, f.tokens[0]).matched.length, 0);
});
test('administrator can explicitly add the local demo without altering the original seed fixture', () => {
  const before = seed(Date.parse('2026-11-21T02:00:00Z'));
  const next = withSourceDemo(before), demo = next.tasks.find(t => t.isSourceDemo);
  assert.equal(before.tasks.length, 16);
  assert.equal(next.tasks.length, 17);
  assert.equal(isSourceDemoUrl(M.withCode(demo.link, 'T118-W9X5')), true);
  assert.equal(M.user(before, 'u1').available - M.user(next, 'u1').available, M.toUnits(80));
  assert.equal(M.assertState(next).total, M.assertState(before).total);
  assert.deepEqual(withSourceDemo(next), next);
});
test('foreign identifiers retain counts and duplicates match a participant only once', () => {
  const f = fixture(), token = f.tokens[0];
  const result = M.matchSources(f.state, f.taskId, `${token}\n${token}\nZZ99-W9X5\nZZ99-W9X5`);
  assert.equal(result.matched.length, 1); assert.equal(result.matched[0].count, 2);
  assert.deepEqual(result.foreign, [{ token: 'ZZ99-W9X5', count: 2 }]); assert.equal(result.missing.length, 1);
});
test('pasted verification persists evidence and audit without awarding points or approving', () => {
  const f = fixture(), balances = f.state.users.map(u => [u.available, u.frozen]), ledger = M.clone(f.state.ledger);
  f.run({ type: 'verifySources', taskId: f.taskId, text: f.tokens.join('\n') });
  for (const x of f.entries) { assert.equal(x.codeVerified, true); assert.equal(x.codeVerifiedBy, 'paste'); assert.equal(x.sourceMatchedAt, f.state.now); assert.equal(x.status, 'pending'); assert.equal(x.history.at(-1).action, '来源核对'); }
  assert.deepEqual(f.state.users.map(u => [u.available, u.frozen]), balances); assert.deepEqual(f.state.ledger, ledger); M.assertState(f.state);
});
test('identical pasted verification is idempotent and unrelated input does not erase evidence', () => {
  const f = fixture(), text = f.tokens.join('\n'); f.run({ type: 'verifySources', taskId: f.taskId, text });
  const before = M.clone(f.entries); f.run({ type: 'verifySources', taskId: f.taskId, text }); assert.deepEqual(f.entries, before);
  f.run({ type: 'verifySources', taskId: f.taskId, text: '无可识别内容' }); assert.deepEqual(f.entries, before);
});
test('manual checks are distinct and insufficient paste evidence blocks batch with an explicit reason', () => {
  const f = fixture();
  for (const x of f.entries) f.run({ type: 'verifyCode', submissionId: x.id, verified: true });
  assert.ok(f.entries.every(x => x.codeVerifiedBy === 'manual' && x.sourceMatchedAt === null));
  assert.equal(M.batchApprovalEligibility(f.state, f.taskId).eligible, false);
  assert.match(M.batchApprovalEligibility(f.state, f.taskId).reason, /2.*没有.*匹配/);
  f.run({ type: 'verifySources', taskId: f.taskId, text: f.tokens[0] });
  assert.equal(M.batchApprovalEligibility(f.state, f.taskId).pasteMissingCount, 1);
  assert.throws(() => f.run({ type: 'approveAll', taskId: f.taskId }), /没有.*匹配/);
  f.run({ type: 'verifySources', taskId: f.taskId, text: f.tokens[1] });
  assert.equal(M.batchApprovalEligibility(f.state, f.taskId).eligible, true);
  f.run({ type: 'approveAll', taskId: f.taskId }); assert.ok(f.entries.every(x => x.status === 'approved')); M.assertState(f.state);
});
test('only owner or administrator can inspect and persist source matching', () => {
  const f = fixture(), text = f.tokens.join('\n'); f.run({ type: 'switch', userId: 'u2' });
  assert.equal(M.matchSources(f.state, f.taskId, text).matched.length, 0); assert.match(M.matchSources(f.state, f.taskId, text).reason, /发布者或管理员/);
  assert.throws(() => f.run({ type: 'verifySources', taskId: f.taskId, text }), /发布者或管理员/);
  f.run({ type: 'switch', userId: 'u3' }); f.run({ type: 'verifySources', taskId: f.taskId, text }); assert.ok(f.entries.every(x => x.codeVerifiedBy === 'paste'));
});
test('unsupported surveys preserve original batch rules, experiments return an empty explanatory result', () => {
  const f = fixture('https://surveys.example/no-parameter');
  assert.equal(M.matchSources(f.state, f.taskId, 'T1-W9X5').matched.length, 0);
  assert.equal(M.batchApprovalEligibility(f.state, f.taskId).eligible, true);
  assert.throws(() => f.run({ type: 'verifySources', taskId: f.taskId, text: 'T1-W9X5' }), /仅支持传参/);
  const experiment = M.clone(f.state); M.task(experiment, f.taskId).type = 'experiment';
  const result = M.matchSources(experiment, f.taskId, 'T1-W9X5'); assert.deepEqual(result.matched, []); assert.ok(result.reason);
});
test('manual cancellation removes paste evidence and correction clears prior evidence', () => {
  const f = fixture(); f.run({ type: 'verifySources', taskId: f.taskId, text: f.tokens.join('\n') }); const id = f.entries[0].id;
  f.run({ type: 'verifyCode', submissionId: id, verified: false }); assert.equal(M.sub(f.state, id).codeVerifiedBy, 'manual'); assert.equal(M.sub(f.state, id).sourceMatchedAt, null);
  f.run({ type: 'verifySources', taskId: f.taskId, text: f.tokens[0] });
  f.run({ type: 'review', submissionId: id, approve: false, reason: '码对不上' }); assert.equal(M.sub(f.state, id).codeVerifiedBy, null);
});
