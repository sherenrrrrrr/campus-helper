/* Pure demo domain model. No browser APIs, network calls, or mutable shared state. */
(function (root) {
  'use strict';
  const HOUR = 3600000, DAY = 24 * HOUR;
  const RULES = Object.freeze({ grant: 100, claimHours: 24, reviewHours: 48, appealDays: 7, dailyLimit: 5 });
  const REASONS = ['码对不上', '截图不清晰', '看不出完成', '未按要求填写', '不符合目标人群', '其他'];
  const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const CODE_LENGTH = 4;
  const CODE_SPACE = ALPHABET.length ** CODE_LENGTH;
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const ensure = (condition, message) => { if (!condition) fail(message); };
  const byId = (items, id) => items.find(x => x.id === id) || fail('记录不存在，请返回列表重试。');
  function uid(s, prefix) { return `${prefix}${++s.sequence}`; }
  function now(s) { return s.now; }
  function user(s, id = s.currentUserId) { return byId(s.users, id); }
  function task(s, id) { return byId(s.tasks, id); }
  function sub(s, id) { return byId(s.submissions, id); }
  function taskSubs(s, id) { return s.submissions.filter(x => x.taskId === id); }
  function taskType(t) { return t?.type === 'experiment' ? 'experiment' : 'survey'; }
  function slotStartAt(slot) {
    const value = slot?.startAt;
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return NaN;
    return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) ? value + '+08:00' : value);
  }
  function slotEndAt(slot) { return slotStartAt(slot) + Number(slot?.minutes) * 60000; }
  function experimentSlot(t, value) { return typeof value === 'string' ? byId(t.slots || [], value) : value; }
  function slotRemaining(s, t, value) {
    const slot = experimentSlot(t, value);
    if (!slot || slot.closed || slotStartAt(slot) <= s.now) return 0;
    const used = taskSubs(s, t.id).filter(x => x.slotId === slot.id && (x.status === 'approved' || isReserved(x, s.now))).length;
    return Math.max(0, slot.capacity - used);
  }
  function completionSettings({ codeRequired, codeMode } = {}) {
    if (codeRequired === false || codeMode === 'none') return { codeRequired: false, codeMode: 'none' };
    return { codeRequired: true, codeMode: codeMode === 'url' ? 'url' : 'manual' };
  }
  function encodeCompletionCode(index) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code = ALPHABET[index % ALPHABET.length] + code;
      index = Math.floor(index / ALPHABET.length);
    }
    return code;
  }
  function createCompletionCode(s, taskId, candidates) {
    const used = new Set(taskSubs(s, taskId).map(x => x.attendanceCode || x.code || x.completionCode).filter(Boolean));
    // A short task prefix may collide across distinct task ids; never reuse a full issued survey token.
    if (taskType(task(s, taskId)) === 'survey') {
      const prefix = taskCode(taskId) + '-';
      for (const x of s.submissions) if (x.sourceToken?.startsWith(prefix)) used.add(x.sourceToken.slice(prefix.length));
    }
    ensure(used.size < CODE_SPACE, '这份问卷的完成码已用完。');
    let index = 0;
    for (const candidate of candidates) {
      index = candidate;
      const code = encodeCompletionCode(index);
      if (!used.has(code)) return code;
    }
    // A bounded random retry followed by a scan also works in a crowded code space.
    for (let i = 1; i <= used.size; i++) {
      const code = encodeCompletionCode((index + i) % CODE_SPACE);
      if (!used.has(code)) return code;
    }
    fail('这份问卷的完成码已用完。');
  }
  function supportsSurveyCode(link) {
    try {
      const url = new URL(link);
      return ['http:', 'https:'].includes(url.protocol) &&
        !url.username && !url.password && /(^|\.)wjx\.cn\.?$/.test(url.hostname);
    } catch { return false; }
  }
  function withCode(link, code) {
    try {
      const url = new URL(link);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      url.searchParams.delete('sojumpparm');
      url.searchParams.set('sojumpparm', code);
      return url.toString();
    } catch { return null; }
  }
  function taskCode(taskId) {
    const value = String(taskId ?? '').toUpperCase();
    const compact = value.replace(/[^A-Z0-9]/g, '');
    if (!compact) return 'T0';
    if (compact.length === 1) return 'T' + compact;
    if (compact.length <= 4) return compact;
    const numericSuffix = value.match(/\d+$/)?.[0];
    return numericSuffix ? 'T' + numericSuffix.slice(-3) : compact.slice(-3);
  }
  function submissionToken(taskId, code) {
    return taskCode(taskId) + '-' + code;
  }
  function surveyLaunchUrl(t, x) {
    try { normalizeLink(t.link); } catch { return null; }
    return canReviewCode(t, x) ? withCode(t.link, x.sourceToken || x.code) : t.link;
  }
  function canReviewCode(t, x) {
    return x.codeAttached === true && !!x.code && supportsSurveyCode(t.link);
  }
  function isReserved(x, at) {
    return ['locked', 'pending', 'correction', 'appealed'].includes(x.status) || (x.status === 'rejected' && !x.final && at < x.appealUntil);
  }
  function approved(s, t) { return taskSubs(s, t.id).filter(x => x.status === 'approved').length; }
  function remaining(s, t) { return taskType(t) === 'experiment' ? (t.slots || []).reduce((sum, slot) => sum + slotRemaining(s, t, slot), 0) : Math.max(0, t.quota - taskSubs(s, t.id).filter(x => x.status === 'approved' || isReserved(x, s.now)).length); }
  function stats(s, t) {
    const entries = taskSubs(s, t.id);
    return { approved: approved(s, t), remaining: remaining(s, t), locked: entries.filter(x => x.status === 'locked').length,
      pending: entries.filter(x => x.status === 'pending').length, correction: entries.filter(x => x.status === 'correction').length, disputed: entries.filter(x => x.status === 'appealed' || (x.status === 'rejected' && isReserved(x, s.now))).length };
  }
  function hasDirtyData(x) {
    return x.dirtyData === true || x.history.some(h =>
      ['拒绝', '转交复核'].includes(h.action) && /^未按要求填写(?:：|$)/.test(h.reason || ''));
  }
  function batchApprovalEligibility(s, value) {
    const t = typeof value === 'string' ? task(s, value) : value;
    const entries = taskSubs(s, t.id);
    const result = { eligible: false, reason: '', claimedCount: entries.length,
      submittedCount: entries.filter(x => x.submittedAt != null).length,
      pendingCount: entries.filter(x => x.status === 'pending').length,
      correctionCount: entries.filter(x => x.status === 'correction').length,
      dirtyCount: entries.filter(hasDirtyData).length };
    if (taskType(t) === 'experiment') result.reason = '实验必须逐条输入到场码核销，不能批量通过。';
    else if (result.correctionCount) result.reason = '还有待补正记录，不能一键通过。';
    else if (result.dirtyCount) result.reason = '任务曾有未按要求填写的脏数据，不能一键通过，请逐条审核。';
    else if (result.submittedCount < result.claimedCount) result.reason = '已提交数尚未达到领取数，不能一键通过。';
    else if (!result.pendingCount) result.reason = '没有待审核的提交，无需一键通过。';
    else { result.eligible = true; result.reason = '已提交数达到领取数，且无脏数据或待补正记录，可以通过全部待审核提交。'; }
    return result;
  }
  function markDirtyData(s, x) {
    x.dirtyData = true;
    const respondent = user(s, x.userId);
    respondent.violations = (respondent.violations || 0) + 1;
    if (respondent.violations >= 3) {
      respondent.claimRestrictedUntil = Math.max(respondent.claimRestrictedUntil || 0, s.now + 7 * DAY);
      notice(s, respondent.id, '因 3 次提交未按要求填写，暂时无法领取新问卷，限制 7 天。已有领取仍可完成。');
    }
  }
  function normalizeLink(value) {
    let url;
    try { url = new URL(String(value).trim()); } catch { fail('请输入完整的 http 或 https 问卷链接。'); }
    ensure(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, '链接必须以 http:// 或 https:// 开头，且不能包含账号密码。');
    ensure(url.hostname.includes('.') || url.hostname === 'localhost', '请输入有效的问卷网址。');
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|spm$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    // HTTP and HTTPS point to the same survey identity; preserve meaningful query ids.
    return url.hostname.toLowerCase().replace(/^www\./, '') + (url.port ? ':' + url.port : '') + url.pathname.replace(/\/+$/, '') + url.search;
  }
  function platform(link) {
    try {
      const host = new URL(link).hostname;
      if (/(^|\.)wjx\.(cn|top)$/.test(host)) return '问卷星';
      if (/(^|\.)qq\.com$/.test(host)) return '腾讯问卷';
      if (/(^|\.)jinshuju\.(net|com)$/.test(host)) return '金数据';
      if (host === 'forms.gle' || host === 'docs.google.com') return 'Google Forms';
      if (/(^|\.)credamo\.com$/.test(host)) return 'Credamo';
      if (host.endsWith('.example')) return '演示问卷';
    } catch { /* Validation owns the error. */ }
    return '外部问卷';
  }
  function entry(s, userId, availableDelta, frozenDelta, type, note, taskId = null, submissionId = null, counterparty = '系统') {
    const u = user(s, userId);
    ensure(Number.isSafeInteger(availableDelta) && Number.isSafeInteger(frozenDelta), '积分必须为整数。');
    ensure(u.available + availableDelta >= 0 && u.frozen + frozenDelta >= 0, '余额不足，操作未保存。');
    u.available += availableDelta; u.frozen += frozenDelta;
    s.ledger.push({ id: uid(s, 'l'), userId, delta: availableDelta, availableDelta, frozenDelta, type, note, taskId, submissionId, counterparty, createdAt: s.now });
  }
  function record(s, x, action, reason, actor = s.currentUserId) {
    x.history.push({ action, reason, actor, at: s.now });
  }
  function notice(s, userId, text) { s.notices.push({ id: uid(s, 'n'), userId, text, at: s.now }); }
  function payout(s, t, x, reason, automatic = false) {
    ensure(x.status !== 'approved', '这份提交已经发放过奖励。');
    ensure(t.escrow >= t.reward, '该任务保留额度不足，操作未保存。');
    entry(s, t.publisherId, 0, -t.reward, 'transfer', reason, t.id, x.id, user(s, x.userId).nickname);
    entry(s, x.userId, t.reward, 0, 'reward', reason, t.id, x.id, user(s, t.publisherId).nickname);
    t.escrow -= t.reward; x.status = 'approved'; x.resolvedAt = s.now; x.automatic = automatic; x.final = true;
    record(s, x, '通过', reason, automatic ? 'system' : s.currentUserId);
    notice(s, x.userId, `「${t.title}」已通过，${t.reward} 积分已到账。`);
  }
  function publisherRisk(s, publisherId) {
    const ids = new Set(s.tasks.filter(t => t.publisherId === publisherId && taskType(t) === 'survey').map(t => t.id));
    const reviewed = s.submissions.filter(x => ids.has(x.taskId) && x.history.some(h => ['通过', '拒绝'].includes(h.action)));
    const rejected = reviewed.filter(x => x.history.some(h => h.action === '拒绝')).length;
    return { reviewed: reviewed.length, rejected, rate: reviewed.length ? rejected / reviewed.length : 0, high: !!user(s, publisherId).highRisk || (rejected >= 3 && rejected / reviewed.length > .5) };
  }
  function firstProtected(s, t, x) {
    const firstTask = s.tasks.filter(q => q.publisherId === t.publisherId && taskType(q) === 'survey').sort((a, b) => a.createdAt - b.createdAt)[0];
    if (firstTask?.id !== t.id) return false;
    const first = taskSubs(s, t.id).filter(q => q.submittedAt).sort((a, b) => a.submittedAt - b.submittedAt)[0];
    return first?.id === x.id;
  }
  function refund(s, t) {
    if (t.escrow > 0) { entry(s, t.publisherId, t.escrow, -t.escrow, 'refund', '招募结束，剩余积分退回', t.id, null, `任务 ${t.id}`); t.escrow = 0; }
  }
  function updateTask(s, t) {
    if (t.status === 'closed') return;
    if (t.deadline <= s.now) t.stopped = true;
    if (taskType(t) === 'experiment' && t.slots.every(slot => slotEndAt(slot) <= s.now)) t.stopped = true;
    const reserved = taskSubs(s, t.id).some(x => isReserved(x, s.now));
    if (t.status === 'removed') { if (!reserved) refund(s, t); return; }
    if (t.stopped || approved(s, t) === t.quota) {
      t.status = reserved ? 'settling' : 'closed';
      if (!reserved) { t.closedAt = s.now; refund(s, t); }
    } else t.status = remaining(s, t) === 0 ? 'settling' : 'open';
  }
  function processTime(s) {
    for (const x of s.submissions) {
      const t = task(s, x.taskId);
      if (taskType(t) === 'experiment') {
        const slot = experimentSlot(t, x.slotId);
        const disputed = (x.hostClaim && x.hostClaim !== 'none') || (x.guestClaim && x.guestClaim !== 'none');
        if (x.status === 'pending' && x.attendance === 'pending' && !disputed && s.now >= slotEndAt(slot) + DAY) {
          x.attendance = 'attended'; payout(s, t, x, `实验到场结算：${t.title}（场次结束 24 小时自动结算）`, true);
        }
        continue;
      }
      if (x.status === 'locked' && s.now >= x.claimUntil) { x.status = 'expired'; x.resolvedAt = s.now; record(s, x, '释放', '领取超过 24 小时未提交', 'system'); }
      if (x.status === 'pending') {
        const left = x.reviewUntil - s.now;
        if (left <= 0) payout(s, t, x, '超时自动通过', true);
        else for (const hours of [24, 6]) if (left <= hours * HOUR && !x.reminded.includes(hours)) {
          notice(s, t.publisherId, `「${t.title}」有待审核证明，距离自动通过不足 ${hours} 小时。`); x.reminded.push(hours);
        }
      }
      if (x.status === 'rejected' && s.now >= x.appealUntil) x.final = true;
      if (x.screenshot && x.resolvedAt && ['approved', 'rejected', 'overturned', 'cancelled'].includes(x.status) && x.final && s.now >= x.resolvedAt + 7 * DAY) { x.screenshot = null; x.screenshotDeleted = true; }
    }
    for (const t of s.tasks) updateTask(s, t);
  }
  function validatePublish(s, input) {
    if (input.type && !['survey', 'experiment'].includes(input.type)) return { type: '任务类型必须为问卷或实验。' };
    if (taskType(input) === 'experiment') return validateExperimentPublish(s, input);
    const errors = {}, n = key => Number(input[key]);
    const len = [...String(input.title || '').trim()].length;
    if (len < 5 || len > 30) errors.title = '标题需要 5～30 个字。';
    if (!String(input.description || '').trim()) errors.description = '请说明问卷用途和填写要求。';
    if (!String(input.audienceText || '').trim()) errors.audienceText = '请说明希望哪些同学填写。';
    if (!input.topic) errors.topic = '请选择问卷主题。';
    if (!Number.isInteger(n('minutes')) || n('minutes') < 1 || n('minutes') > 60) errors.minutes = '预计耗时需要为 1～60 分钟。';
    if (!Number.isInteger(n('reward')) || n('reward') < 5 || n('reward') > 50) errors.reward = '单份奖励为 5～50 分。';
    if (!Number.isInteger(n('quota')) || n('quota') < 1 || n('quota') > 20) errors.quota = '单次招募 1～20 份，大样本需求请联系管理员。';
    try { const normalized = normalizeLink(input.link); if (s.tasks.some(t => taskType(t) === 'survey' && normalizeLink(t.link) === normalized)) errors.link = '这个问卷已经有人发过了，请勿重复发布。'; } catch (e) { errors.link = e.message; }
    if (!Number.isInteger(n('days')) || n('days') < 1 || n('days') > 14) errors.days = '招募时间为 1～14 天。';
    if (n('reward') * n('quota') > user(s).available) errors.budget = `还差 ${n('reward') * n('quota') - user(s).available} 分。`;
    return errors;
  }
  function validateExperimentPublish(s, i) {
    const errors = {}, titleLength = [...String(i.title || '').trim()].length;
    if (titleLength < 5 || titleLength > 30) errors.title = '实验标题需要 5～30 个字。';
    if (!String(i.description || '').trim()) errors.description = '请说明实验用途和参与安排。';
    if (!['offline', 'online'].includes(i.format)) errors.format = '请选择线下或线上实验。';
    if (!String(i.location || '').trim()) errors.location = '请填写实验地点或会议链接。';
    else if (i.format === 'online') try { normalizeLink(i.location); } catch { errors.location = '线上实验需要有效的 http/https 会议链接。'; }
    if (!Number.isInteger(+i.reward) || +i.reward < 10 || +i.reward > 200) errors.reward = '实验单人奖励为 10～200 分。';
    if (!Number.isInteger(+i.days) || +i.days < 1 || +i.days > 14) errors.days = '招募时间为 1～14 天。';
    if (!Array.isArray(i.slots) || !i.slots.length) errors.slots = '实验至少需要一个未来时段。';
    else i.slots.forEach((slot, index) => {
      const prefix = `第 ${index + 1} 个时段：`;
      if (!Number.isFinite(slotStartAt(slot)) || slotStartAt(slot) <= s.now) errors.slots ||= prefix + '开始时间必须在未来，按北京时间计算。';
      else if (!Number.isInteger(+slot.minutes) || +slot.minutes < 15 || +slot.minutes > 240) errors.slots ||= prefix + '时长应为 15～240 分钟。';
      else if (!Number.isInteger(+slot.capacity) || +slot.capacity < 1 || +slot.capacity > 10) errors.slots ||= prefix + '人数应为 1～10 人。';
      else if (slotEndAt(slot) > s.now + Number(i.days) * DAY) errors.slots ||= prefix + '结束时间不能超过招募截止时间。';
    });
    for (const field of ['ethicsConfirmed', 'publicPlaceConfirmed', 'privacyConfirmed']) if (i[field] !== true) errors[field] = '发布实验前，请勾选全部伦理、安全与隐私确认。';
    const quota = Array.isArray(i.slots) ? i.slots.reduce((sum, slot) => sum + Number(slot.capacity), 0) : 0;
    if (+i.reward * quota > user(s).available) errors.budget = `实验预算还差 ${+i.reward * quota - user(s).available} 分。`;
    return errors;
  }
  function assertState(s) {
    const total = s.users.reduce((sum, u) => sum + u.available + u.frozen, 0);
    const expected = s.users.length * RULES.grant + s.ledger.filter(x => x.type === 'adjust').reduce((sum, x) => sum + x.availableDelta + x.frozenDelta, 0);
    ensure(total === expected, '积分守恒校验失败，操作未保存。');
    for (const u of s.users) {
      ensure(Number.isSafeInteger(u.available) && Number.isSafeInteger(u.frozen) && u.available >= 0 && u.frozen >= 0, '余额校验失败。');
      ensure(u.frozen === s.tasks.filter(t => t.publisherId === u.id).reduce((sum, t) => sum + t.escrow, 0), '任务冻结余额校验失败。');
      ensure(u.available === s.ledger.filter(x => x.userId === u.id).reduce((sum, x) => sum + x.availableDelta, 0), '可用积分流水校验失败。');
      ensure(u.frozen === s.ledger.filter(x => x.userId === u.id).reduce((sum, x) => sum + x.frozenDelta, 0), '冻结积分流水校验失败。');
    }
    ensure(new Set(s.submissions.map(x => `${x.taskId}:${x.userId}`)).size === s.submissions.length, '重复领取校验失败。');
    for (const t of s.tasks) {
      const required = taskSubs(s, t.id).filter(x => isReserved(x, s.now)).length * t.reward;
      ensure(t.escrow >= required, '在途提交的保留额度不足。');
      ensure(taskSubs(s, t.id).filter(x => isReserved(x, s.now) || x.status === 'approved').length <= t.quota, '名额校验失败。');
      if (taskType(t) === 'experiment') {
        ensure(Array.isArray(t.slots) && t.slots.length && t.quota === t.slots.reduce((sum, slot) => sum + slot.capacity, 0), '实验时段总名额校验失败。');
        ensure(new Set(t.slots.map(slot => slot.id)).size === t.slots.length, '实验时段编号重复。');
        for (const slot of t.slots) {
          const entries = taskSubs(s, t.id).filter(x => x.slotId === slot.id);
          ensure(entries.filter(x => isReserved(x, s.now) || x.status === 'approved').length <= slot.capacity, '实验时段超额预约。');
          ensure(Array.isArray(slot.booked) && new Set(slot.booked).size === slot.booked.length && entries.length === slot.booked.length && entries.every(x => slot.booked.includes(x.id)), '实验预约索引校验失败。');
        }
        ensure(taskSubs(s, t.id).every(x => t.slots.some(slot => slot.id === x.slotId)), '预约关联的实验时段不存在。');
      }
    }
    return { total, expected, valid: true };
  }
  function commit(previous, action, timestamp = previous.now) {
    const s = clone(previous);
    for (const t of s.tasks) Object.assign(t, completionSettings(t), { codeSupported: supportsSurveyCode(t.link) });
    for (const x of s.submissions) {
      x.completionCode ??= '';
      x.code ??= x.completionCode;
      x.codeAttached ??= false;
      x.codeVerified ??= false;
      x.correctionUsed ??= 0;
      x.codeMissingAt ??= null;
      x.correctedAt ??= null;
    }
    s.now = Math.max(s.now, timestamp); processTime(s);
    const actor = user(s), admin = () => ensure(actor.role === 'admin' && !actor.banned, '只有管理员可以执行此操作。');
    const active = () => ensure(!actor.banned, '该演示账号已被封禁，请联系管理员。');
    if (action.type === 'switch') { user(s, action.userId); s.currentUserId = action.userId; }
    else if (action.type === 'tick') { /* Lazy transitions were applied above. */ }
    else if (action.type === 'advance') {
      ensure(Number.isFinite(action.hours) && action.hours > 0 && action.hours <= 720, '请选择有效的演示时间跨度。');
      s.now += action.hours * HOUR; s.timeOffset += action.hours * HOUR; processTime(s);
    } else if (action.type === 'publish') {
      active(); ensure(!actor.restrictedUntil || actor.restrictedUntil <= s.now, '该账号暂时被限制发布，请在到期后重试。');
      const errors = validatePublish(s, action.input); ensure(!Object.keys(errors).length, Object.values(errors)[0]);
      const i = action.input;
      const experiment = taskType(i) === 'experiment', quota = experiment ? i.slots.reduce((sum, slot) => sum + Number(slot.capacity), 0) : +i.quota;
      const t = { id: uid(s, 't'), publisherId: actor.id, type: experiment ? 'experiment' : 'survey', title: i.title.trim(), description: i.description.trim(), topic: i.topic || '学习研究', audienceText: String(i.audienceText || i.requirements || '全校同学').trim(), audience: [...new Set(i.audience || ['全校同学'])], minutes: experiment ? +i.slots[0].minutes : +i.minutes, link: experiment ? '' : i.link.trim(), reward: +i.reward, quota, status: 'open', escrow: +i.reward * quota, createdAt: s.now, deadline: s.now + +i.days * DAY, stopped: false, removalReason: '', reports: [] };
      Object.assign(t, completionSettings(i), { codeSupported: supportsSurveyCode(t.link) });
      if (experiment) Object.assign(t, { format: i.format, location: i.location.trim(), slots: i.slots.map(slot => ({ id: uid(s, 'slot'), startAt: new Date(slotStartAt(slot)).toISOString(), minutes: +slot.minutes, capacity: +slot.capacity, booked: [], closed: false })), requirements: String(i.requirements || '').trim().slice(0, 1500), cashNote: String(i.cashNote || '').trim().slice(0, 200), ethicsConfirmed: true, publicPlaceConfirmed: true, privacyConfirmed: true, codeRequired: false, codeMode: 'none', codeSupported: false });
      entry(s, actor.id, -t.escrow, t.escrow, 'freeze', experiment ? '发布实验，冻结招募预算' : '发布问卷，冻结招募预算', t.id, null, `任务 ${t.id}`); s.tasks.push(t);
    } else if (action.type === 'claim') {
      active(); const t = task(s, action.taskId);
      ensure(taskType(t) !== 'survey' || !actor.claimRestrictedUntil || actor.claimRestrictedUntil <= s.now, '因 3 次提交未按要求填写，暂时无法领取新问卷，请在限制到期后重试。');
      ensure(t.publisherId !== actor.id, '不能领取自己发布的问卷。');
      ensure(!s.submissions.some(x => x.taskId === t.id && x.userId === actor.id), '你已经领过这份问卷了，请查看我的任务。');
      ensure(t.status === 'open' && !t.stopped && t.deadline > s.now && remaining(s, t) > 0, '这份问卷已招满或停止招募，请选择其他问卷。');
      ensure(action.eligible === true, '请先确认自己符合目标人群要求。');
      if (taskType(t) === 'experiment') {
        const slot = experimentSlot(t, action.slotId);
        ensure(slot && slotRemaining(s, t, slot) > 0, '该实验时段已满、关闭或已经开始，请选择其他时段。');
        const attendanceCode = createCompletionCode(s, t.id, Array.from({ length: 8 }, () => Math.floor(Math.random() * CODE_SPACE)));
        const x = { id: uid(s, 's'), taskId: t.id, userId: actor.id, type: 'experiment', slotId: slot.id, attendanceCode, attendance: 'pending', status: 'pending', createdAt: s.now, screenshot: null, note: '', history: [], reminded: [], final: false, hostClaim: 'none', guestClaim: 'none' };
        s.submissions.push(x); slot.booked.push(x.id); record(s, x, '预约实验', '已保留该时段的座位与奖励额度'); updateTask(s, t);
      } else {
      const candidates = Array.from({ length: 8 }, () => Math.floor(Math.random() * CODE_SPACE));
      const code = createCompletionCode(s, t.id, candidates);
      const sourceToken = submissionToken(t.id, code);
      const codeAttached = t.codeSupported && withCode(t.link, sourceToken) !== null;
      const completionCode = t.codeRequired ? code : ''; // Legacy review fields remain readable.
      s.submissions.push({ id: uid(s, 's'), taskId: t.id, userId: actor.id, status: 'locked', createdAt: s.now, claimUntil: s.now + DAY, screenshot: null, note: '', history: [], reminded: [], final: false,
        code, sourceToken, codeAttached, completionCode, codeVerified: false, correctionUsed: 0, codeMissingAt: null, correctedAt: null });
      updateTask(s, t);
      }
    } else if (action.type === 'checkIn') {
      active(); const t = task(s, action.taskId), x = sub(s, action.submissionId);
      ensure(taskType(t) === 'experiment' && x.taskId === t.id && x.type === 'experiment', '到场码必须属于本实验的预约。');
      ensure(t.publisherId === actor.id, '只有该实验的发布者可以核销，参与者不能自行核销。');
      ensure(x.status === 'pending' && x.attendance === 'pending', '该预约已经结算或不在待到场状态，不能重复核销。');
      ensure((!x.hostClaim || x.hostClaim === 'none') && (!x.guestClaim || x.guestClaim === 'none'), '有争议的预约需要管理员处理。');
      const slot = experimentSlot(t, x.slotId);
      ensure(s.now >= slotStartAt(slot) - HOUR / 2 && s.now <= slotEndAt(slot) + DAY, '只能在场次开始前 30 分钟至结束后 24 小时内核销。');
      ensure(typeof action.attendanceCode === 'string' && action.attendanceCode.trim().toUpperCase() === x.attendanceCode, '到场码不匹配，请由参与者现场报出自己的到场码。');
      x.attendance = 'attended'; payout(s, t, x, `实验到场结算：${t.title}`); updateTask(s, t);
    } else if (action.type === 'submit') {
      active(); const x = sub(s, action.submissionId), t = task(s, x.taskId);
      ensure(taskType(t) === 'survey', '实验预约请使用到场码核销，不走问卷提交和审核流程。');
      ensure(x.userId === actor.id && x.status === 'locked', '该领取已失效或已提交，不能重复提交。');
      ensure(t.status !== 'removed', '任务已下架，不能再提交证明。');
      ensure(s.submissions.filter(q => q.userId === actor.id && q.submittedAt && new Date(q.submittedAt + 8 * HOUR).toISOString().slice(0, 10) === new Date(s.now + 8 * HOUR).toISOString().slice(0, 10)).length < RULES.dailyLimit, '今天已提交 5 份问卷，请明天再来。');
      ensure(typeof action.screenshot === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(action.screenshot) && action.screenshot.length <= 1000000, '请上传一张有效的 JPG 或 PNG 完成页截图。');
      ensure(action.privacy === true, '请确认截图仅包含完成提示，不包含答案或个人信息。');
      x.screenshot = action.screenshot; x.note = String(action.note || '').trim().slice(0, 500); x.submittedAt = s.now; x.reviewUntil = s.now + 48 * HOUR; x.status = 'pending';
      record(s, x, '提交证明', x.note);
      if (publisherRisk(s, t.publisherId).high) payout(s, t, x, '高风险发布者保护，自动通过', true);
      else notice(s, t.publisherId, `「${t.title}」有一份新证明等待审核。`);
      updateTask(s, t);
    } else if (action.type === 'verifyCode') {
      active(); const x = sub(s, action.submissionId), t = task(s, x.taskId);
      ensure(taskType(t) === 'survey', '实验预约请使用到场码核销，不走问卷提交和审核流程。');
      ensure(t.publisherId === actor.id && x.status === 'pending', '只能核对自己任务中待审核提交的完成码。');
      ensure(canReviewCode(t, x), '这份记录没有通过链接传递的编号。');
      ensure(typeof action.verified === 'boolean', '请明确设置完成码是否已核对。');
      if (x.codeVerified !== action.verified) {
        x.codeVerified = action.verified;
        record(s, x, '编号核对', action.verified ? '发布者确认来源编号一致' : '发布者取消编号核对标记');
      }
    } else if (action.type === 'correctCode') {
      active(); const x = sub(s, action.submissionId), t = task(s, x.taskId);
      ensure(taskType(t) === 'survey', '实验预约请使用到场码核销，不走问卷提交和审核流程。');
      ensure(x.userId === actor.id && x.status === 'correction' && x.correctionUsed === 1 && x.correctedAt == null, '只有待补正记录的答题者可以补正一次。');
      const note = String(action.note || '').trim().slice(0, 500);
      ensure(note, '请填写完成码补正说明。');
      if (action.screenshot != null && action.screenshot !== '') {
        ensure(typeof action.screenshot === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(action.screenshot) && action.screenshot.length <= 1000000, '请上传一张有效的 JPG 或 PNG 完成页截图。');
        ensure(action.privacy === true, '请确认截图仅包含完成提示，不包含答案或个人信息。');
        x.screenshot = action.screenshot;
      }
      x.note = note; x.correctedAt = s.now; x.reviewUntil = s.now + RULES.reviewHours * HOUR;
      x.codeVerified = false; x.reminded = []; x.status = 'pending';
      record(s, x, '补充编号说明', note);
      if (publisherRisk(s, t.publisherId).high) payout(s, t, x, '高风险发布者保护，补正后自动通过', true);
      else notice(s, t.publisherId, `「${t.title}」有一份完成码补正，已重新开始 48 小时审核。`);
      updateTask(s, t);
    } else if (action.type === 'approveAll') {
      active(); const t = task(s, action.taskId);
      ensure(t.publisherId === actor.id, '只能一键通过自己发布任务的提交。');
      const eligibility = batchApprovalEligibility(s, t);
      ensure(eligibility.eligible, eligibility.reason);
      for (const x of taskSubs(s, t.id).filter(x => x.status === 'pending')) payout(s, t, x, '发布者一键通过全部待审核提交');
      updateTask(s, t);
    } else if (action.type === 'review') {
      active(); const x = sub(s, action.submissionId), t = task(s, x.taskId);
      ensure(taskType(t) === 'survey', '实验预约请使用到场码核销，不走问卷提交和审核流程。');
      ensure(t.publisherId === actor.id && x.status === 'pending', '只能审核自己任务中待审核的证明。');
      if (action.approve) payout(s, t, x, '完成问卷，审核通过');
      else {
        ensure(REASONS.includes(action.reason), '拒绝必须选择具体原因。');
        ensure(action.reason !== '其他' || String(action.note || '').trim(), '选择其他时，请填写具体原因。');
        const label = action.reason === '码对不上' ? '找不到编号' : action.reason;
        const reason = label + (action.note ? `：${String(action.note).trim().slice(0, 300)}` : '');
        if (action.reason === '码对不上' && x.correctionUsed === 0) {
          ensure(canReviewCode(t, x), '这份记录没有通过链接传递的编号，不能以找不到编号要求补正。');
          x.status = 'correction'; x.correctionUsed = 1; x.codeMissingAt = s.now; x.codeVerified = false;
          x.reviewUntil = null;
          record(s, x, '要求补正编号', reason);
          notice(s, x.userId, `「${t.title}」找不到你的提交编号。请补充说明，补正期间名额和奖励保留，审核计时暂停。`);
        } else if (action.reason === '码对不上' && x.correctedAt == null) {
          fail('请先给予答题者一次完成码补正机会，补正后才能再次处理码不符。');
        } else if (firstProtected(s, t, x)
          && action.reason !== '码对不上'
          && !(action.reason === '未按要求填写' && x.codeVerified === true)) {
          x.status = 'appealed'; x.appealKind = 'first-review'; x.appealReason = `首份证明保护：发布者申请复核，${reason}`; x.appealedAt = s.now;
          record(s, x, '转交复核', reason); notice(s, x.userId, `「${t.title}」的首份证明已转交管理员复核，奖励继续保留。`);
        } else {
          x.status = 'rejected'; x.rejectReason = reason; x.resolvedAt = s.now; x.appealUntil = s.now + 7 * DAY;
          record(s, x, '拒绝', reason); notice(s, x.userId, `「${t.title}」未通过：${reason}。可在 7 天内申诉。`);
          if (action.reason === '未按要求填写') markDirtyData(s, x);
          if (publisherRisk(s, actor.id).high) {
            actor.highRisk = true;
            notice(s, actor.id, '拒绝率超过 50% 且拒绝数达到 3，已标记高风险，待审核及后续提交将自动通过。');
            for (const q of s.submissions.filter(q => s.tasks.some(k => k.id === q.taskId && k.publisherId === actor.id) && q.status === 'pending' && taskType(task(s, q.taskId)) === 'survey')) payout(s, task(s, q.taskId), q, '高风险发布者保护，自动通过', true);
          }
        }
      }
      for (const q of s.tasks) updateTask(s, q);
    } else if (action.type === 'appeal') {
      active(); const x = sub(s, action.submissionId);
      ensure(x.userId === actor.id && x.status === 'rejected' && !x.final && s.now < x.appealUntil, '只能在拒绝后的 7 天内申诉一次。');
      ensure(String(action.reason || '').trim(), '请填写申诉理由。');
      x.status = 'appealed'; x.appealKind = 'rejection'; x.appealReason = String(action.reason).trim().slice(0, 500); x.appealedAt = s.now; record(s, x, '申诉', x.appealReason);
    } else if (action.type === 'challenge') {
      active(); const x = sub(s, action.submissionId), t = task(s, x.taskId);
      ensure(t.publisherId === actor.id && x.status === 'approved' && x.automatic && !x.challenge && s.now < x.resolvedAt + 7 * DAY, '仅自动通过后 7 天内可以申请一次管理员介入。');
      ensure(String(action.reason || '').trim(), '请填写申请介入的理由。');
      x.challenge = { status: 'pending', reason: String(action.reason).trim().slice(0, 500), at: s.now }; record(s, x, '申请介入', x.challenge.reason);
    } else if (action.type === 'judge') {
      admin(); ensure(String(action.reason || '').trim(), '裁决必须填写理由。');
      const x = sub(s, action.submissionId), t = task(s, x.taskId), reason = String(action.reason).trim().slice(0, 500);
      ensure(['win', 'uphold', 'remove', 'reverse', 'dismiss'].includes(action.verdict), '请选择有效的裁决结果。');
      if (x.challenge?.status === 'pending') {
        ensure(['reverse', 'dismiss'].includes(action.verdict), '请选择维持通过或回滚奖励。');
        if (action.verdict === 'reverse') {
          entry(s, x.userId, -t.reward, 0, 'reversal', '管理员回滚奖励：' + reason, t.id, x.id, user(s, t.publisherId).nickname);
          const keepRecruiting = ['open', 'settling'].includes(t.status) && !t.stopped && t.deadline > s.now;
          entry(s, t.publisherId, keepRecruiting ? 0 : t.reward, keepRecruiting ? t.reward : 0, 'reversal', '管理员退回已支付奖励：' + reason, t.id, x.id, user(s, x.userId).nickname);
          if (keepRecruiting) t.escrow += t.reward;
          x.status = 'overturned'; x.final = true;
        }
        x.challenge.status = 'resolved'; x.challenge.verdict = action.verdict; x.challenge.resolvedAt = s.now;
      } else {
        ensure(x.status === 'appealed', '这条申诉已处理或不在申诉中。');
        if (action.verdict === 'win') payout(s, t, x, '管理员裁决通过：' + reason);
        else if (action.verdict === 'uphold' || action.verdict === 'remove') {
          x.status = action.verdict === 'remove' ? 'cancelled' : 'rejected'; x.final = true; x.resolvedAt = s.now; x.rejectReason = reason;
          if (action.verdict === 'remove') removeTask(s, t, reason);
        } else fail('请选择有效的申诉裁决。');
      }
      record(s, x, '管理员裁决', reason); notice(s, t.publisherId, `「${t.title}」的裁决已出：${reason}`); notice(s, x.userId, `「${t.title}」的裁决已出：${reason}`); updateTask(s, t);
    } else if (action.type === 'stop') {
      active(); const t = task(s, action.taskId); ensure(t.publisherId === actor.id && ['open', 'settling'].includes(t.status), '只能停止自己的在招任务。');
      t.stopped = true; updateTask(s, t); notice(s, actor.id, '已停止新领取；已有领取、审核及申诉结清后自动退款。');
    } else if (action.type === 'remove') {
      admin(); ensure(String(action.reason || '').trim(), '下架必须填写原因。'); removeTask(s, task(s, action.taskId), String(action.reason).trim().slice(0, 500));
    } else if (action.type === 'extend') {
      admin(); const t = task(s, action.taskId); ensure(['open', 'settling'].includes(t.status) && !t.stopped, '已停止、已结束或已下架的任务不能延期。');
      ensure(Number.isInteger(action.days) && action.days >= 1 && action.days <= 14, '延期天数为 1～14。'); t.deadline = Math.max(t.deadline, s.now) + action.days * DAY; updateTask(s, t); notice(s, t.publisherId, `「${t.title}」截止时间已延长 ${action.days} 天。`);
    } else if (action.type === 'manageUser') {
      admin(); const u = user(s, action.userId); ensure(u.role !== 'admin', '演示管理员账号不能被限制。');
      ensure(String(action.reason || '').trim(), '管理操作必须填写原因。');
      if (action.operation === 'adjust') { ensure(Number.isSafeInteger(action.amount) && action.amount !== 0 && Math.abs(action.amount) <= 10000, '调账请输入非零整数，单次不超过 10000 分。'); entry(s, u.id, action.amount, 0, 'adjust', '管理员调账：' + String(action.reason).trim(), null, null, actor.nickname); }
      else if (action.operation === 'restrict') { ensure(Number.isInteger(action.days) && action.days >= 1 && action.days <= 30, '限制天数为 1～30。'); u.restrictedUntil = s.now + action.days * DAY; }
      else if (action.operation === 'ban') { u.banned = true; u.violations++; }
      else if (action.operation === 'restore') { u.banned = false; u.restrictedUntil = null; }
      else if (action.operation === 'flag') u.violations++;
      else fail('未知的管理操作。');
      s.audit.push({ id: uid(s, 'a'), actor: actor.id, userId: u.id, operation: action.operation, reason: String(action.reason).trim(), at: s.now }); notice(s, u.id, `管理员操作：${action.reason}`);
    } else if (action.type === 'report') {
      active(); const t = task(s, action.taskId); ensure(!t.reports.some(q => q.userId === actor.id), '你已报告过此问卷链接，管理员会查看。'); t.reports.push({ userId: actor.id, at: s.now, reason: '报告链接失效' });
    } else if (action.type === 'readNotices') s.notices = s.notices.filter(n => n.userId !== actor.id);
    else fail('未知操作。');
    actor.lastActiveAt = s.now;
    if (action.type === 'switch') user(s).lastActiveAt = s.now;
    assertState(s); return s;
  }
  function removeTask(s, t, reason) {
    ensure(t.status !== 'removed', '任务已经下架。');
    t.status = 'removed'; t.stopped = true; t.removalReason = reason;
    for (const x of taskSubs(s, t.id).filter(x => x.status === 'locked')) { x.status = 'cancelled'; x.final = true; x.resolvedAt = s.now; record(s, x, '下架取消领取', reason); }
    notice(s, t.publisherId, `「${t.title}」已下架：${reason}。已有通过不回滚，在途审核及申诉仍需结算。`); updateTask(s, t);
  }
  const api = { RULES, REASONS, HOUR, DAY, clone, user, task, sub, taskSubs, stats, remaining, approved, normalizeLink, platform, validatePublish, publisherRisk, firstProtected, isReserved, assertState, commit, entry, hasDirtyData, batchApprovalEligibility, supportsSurveyCode, withCode, surveyLaunchUrl, canReviewCode, taskCode, submissionToken, taskType, slotStartAt, slotEndAt, slotRemaining };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CampusModel = api;
})(globalThis);
