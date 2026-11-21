(function () {
  'use strict';
  const M = CampusModel, S = CampusSeed, KEY = 'campus-helper-demo';
  const fp = value => M.fmtPoints(value);
  const $ = selector => document.querySelector(selector);
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', list: '<path d="M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8V6a3 3 0 0 1 3-3h11M21 11h-5v5h5M17 13.5h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    chevron: '<path d="m7 10 5 5 5-5"/>', bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>', check: '<path d="m5 12 4 4L19 6"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
    reset: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>', shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    book: '<path d="M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3V4Zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5V4Z"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.list}</svg>`;
  const fmt = at => at ? new Date(at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }) : '—';
  const hours = until => Math.max(0, Math.ceil((until - state.now) / M.HOUR));
  const badge = (text, kind = '') => `<span class="badge ${kind}">${e(text)}</span>`;
  const options = (values, current = '', all = null) => (all ? `<option value="">${e(all)}</option>` : '') + values.map(v => `<option value="${e(v)}" ${v === current ? 'selected' : ''}>${e(v)}</option>`).join('');
  const button = (label, action, data = '', kind = 'secondary') => `<button type="button" class="btn ${kind}" data-action="${action}" ${data}>${label}</button>`;
  let storageOK = true, state, draft = {}, pageSize = 8, currentProof = null, toastTimer, recentlyPublishedId = null, reviewFrom = 'tasks';
  const sourceResults = new Map();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { state = M.migrateState(JSON.parse(raw)); M.assertState(state); }
    else state = S.seed(Date.now(), { includeResearcher: true });
  } catch (error) {
    state = S.seed(Date.now(), { includeResearcher: true }); storageOK = false;
    $('#storage-warning').hidden = false;
    $('#storage-warning').innerHTML = `浏览器存储不可用或旧数据无法读取，本次使用临时演示数据，刷新将丢失。${button('清除旧数据并重试', 'repair')}`;
  }
  state = S.withResearcher(state);
  function persist(next) { if (storageOK) localStorage.setItem(KEY, JSON.stringify(next)); }
  function transact(action, message = '', redraw = true) {
    try {
      const next = action.type === 'reset' ? S.seed(Date.now(), { includeResearcher: true }) : M.commit(state, action, Date.now() + state.timeOffset);
      persist(next); state = next;
      if (redraw) render();
      if (message) toast(message);
      return true;
    } catch (error) { toast(error.name === 'QuotaExceededError' ? '本地存储空间不足，操作未保存。请重置演示或清理旧截图后重试。' : error.message, true); return false; }
  }
  function toast(message, error = false) {
    clearTimeout(toastTimer); const node = $('#toast'); node.textContent = message; node.className = 'toast' + (error ? ' error' : ''); node.hidden = false;
    toastTimer = setTimeout(() => { node.hidden = true; }, 5200);
  }
  function route() {
    const raw = location.hash.slice(1) || 'hall', [path, query = ''] = raw.split('?');
    if (path === 'entry') return { name: 'hall', query: new URLSearchParams() };
    const [name, section, recordId] = path.split('/');
    const params = new URLSearchParams(query);
    if (name === 'hall' && params.has('type')) {
      const next = params.get('type') === 'experiment' ? 'experiment' : 'hall';
      params.delete('type');
      window.history.replaceState(null, '', '#' + next + (params.size ? '?' + params : ''));
      return { name: next, query: params };
    }
    if (name === 'publish' && !section && ['survey', 'experiment'].includes(params.get('type'))) {
      const id = params.get('type');
      window.history.replaceState(null, '', '#publish/' + id);
      return { name, id, query: new URLSearchParams() };
    }
    if (name !== 'admin') return { name, id: section, query: params };
    if (section) return { name, section, id: recordId, query: params };
    const legacy = params.get('tab');
    const next = ['tasks', 'users', 'appeals', 'submissions'].includes(legacy) ? legacy : 'overview';
    params.delete('tab');
    window.history.replaceState(null, '', `#admin/${next}${params.size ? '?' + params : ''}`);
    return { name, section: next, query: params };
  }
  function go(hash) { if (location.hash === '#' + hash) render(); else location.hash = hash; }
  function empty(title, description, target = 'hall', label = '去问卷大厅') {
    return `<div class="empty">${icon('book')}<h3>${e(title)}</h3><p>${e(description)}</p><a class="btn" href="#${target}">${e(label)}</a></div>`;
  }
  const taskNames = { open: ['招募中', 'success'], settling: ['待结算', 'warning'], closed: ['已结束', ''], removed: ['已下架', 'error'] };
  const subNames = { locked: ['待提交证明', 'info'], pending: ['审核中', 'warning'], correction: ['待补正', 'warning'], approved: ['已通过', 'success'], rejected: ['已拒绝', 'error'], appealed: ['管理员处理中', 'warning'], expired: ['领取已释放', ''], cancelled: ['已取消', ''], overturned: ['奖励已回滚', 'error'] };
  function taskBadge(t) { return badge(...taskNames[t.status]); }
  function subBadge(x) { return badge(x.automatic && x.status === 'approved' ? (x.history.some(h => h.reason === '超时自动通过') ? '超时自动通过' : '保护自动通过') : subNames[x.status][0], subNames[x.status][1]); }
  function shell(r, u) {
    const adminMode = r.name === 'admin';
    const frontActive = r.name === 'detail' ? (M.taskType(state.tasks.find(t => t.id === r.id)) === 'experiment' ? 'experiment' : 'hall') : ['review', 'edit'].includes(r.name) ? 'tasks' : r.name;
    const nav = [['hall', 'grid', '问卷'], ['experiment', 'grid', '实验'], ['publish', 'plus', '发布'], ['tasks', 'list', '任务'], ['points', 'wallet', '积分']];
    const adminNav = [['overview', 'grid', '看板'], ['tasks', 'list', '任务'], ['submissions', 'book', '参与'], ['users', 'people', '用户'], ['appeals', 'shield', '申诉']];
    const parent = { review: 'tasks', user: 'users', submission: 'submissions', appeal: 'appeals' }[r.section];
    const selected = adminMode ? parent || r.section : frontActive;
    const current = id => selected === id ? 'aria-current="page"' : '';
    const items = adminMode ? (u.role === 'admin' ? adminNav : []) : nav;
    const prefix = adminMode ? 'admin/' : '';
    $('#desktop-nav').innerHTML = items.map(([id, , text]) => `<a href="#${prefix}${id}" ${current(id)}>${text}</a>`).join('') + (!adminMode && u.role === 'admin' ? '<a href="#admin/overview">管理员后台</a>' : '');
    const mobile = $('#mobile-nav');
    mobile.style.display = items.length ? '' : 'none';
    mobile.setAttribute('aria-label', adminMode ? '管理员手机导航' : '手机主导航');
    mobile.innerHTML = items.map(([id, ico, text]) => `<a href="#${prefix}${id}" ${current(id)}>${icon(ico)}${text}</a>`).join('');
    $('.brand').href = adminMode ? '#admin/overview' : '#hall';
    $('.brand').setAttribute('aria-label', adminMode ? '问问，返回管理员看板' : '问问，回到大厅');
    $('.skip').href = adminMode ? location.hash : '#main';
    $('.skip').dataset.action = 'skip-main';
    $('#account-toggle').innerHTML = `<span class="avatar">${e(u.nickname.slice(0, 1))}</span><span>${e(u.nickname)}</span>${icon('chevron')}`;
    updateNoticeBadge();
    $('#account-menu').innerHTML = adminMode
      ? `<p class="small muted">当前身份：${e(u.nickname)}</p><button type="button" data-action="return-front">${icon('back')}返回前台</button>${u.role === 'admin' ? `<button type="button" data-action="reset">${icon('reset')}演示重置</button>` : ''}`
      : `<p class="small muted">模拟账号切换</p>${state.users.filter((v, index) => index < 3 || v.isDemoResearcher).map(v => `<button type="button" data-action="switch" data-id="${v.id}"><span class="avatar">${e(v.nickname.slice(0, 1))}</span>${e(v.nickname)}${v.id === u.id ? icon('check') : ''}</button>`).join('')}<hr>${u.role === 'admin' ? '<a href="#admin/overview">' + icon('shield') + '管理员后台</a>' : ''}<button type="button" data-action="guide">${icon('book')}演示指南</button><button type="button" data-action="time">${icon('clock')}推进演示时间</button><button type="button" data-action="reset">${icon('reset')}重置演示数据</button>`;
    $('#account-menu').insertAdjacentHTML('beforeend', `<hr><button type="button" data-action="logout">${icon('back')}退出登录</button>`);
  }
  function render() {
    const r = route(), u = M.user(state); shell(r, u);
    let html;
    try {
      if (r.name === 'hall' || r.name === 'experiment') html = hall(r);
      else if (r.name === 'publish') html = publish(r.id);
      else if (r.name === 'edit') {
        const t = M.task(state, r.id), { task: error } = M.validateTaskEdit(state, t);
        html = error ? empty('暂时无法编辑', error, 'tasks', '返回我的任务') : publish(t);
      }
      else if (r.name === 'detail') html = detail(M.task(state, r.id));
      else if (r.name === 'tasks') html = tasks(r.query.get('tab') || 'published');
      else if (r.name === 'review') html = review(M.task(state, r.id));
      else if (r.name === 'points') html = points(r.query.get('type') || '');
      else if (r.name === 'admin') html = u.role === 'admin' && !u.banned ? CampusAdmin.render(state, r, helpers) : `<div class="empty">${icon('shield')}<h1>需要管理员权限</h1><p>当前账号无法查看后台。请返回前台后切换模拟管理员。</p></div>`;
      else html = empty('这个页面还没来得及长出来', '返回大厅，看看同学们正在研究什么。');
    } catch (error) { html = r.name === 'admin' ? empty('暂时找不到这条记录', error.message, 'admin/overview', '返回后台看板') : empty('暂时找不到这条记录', error.message); }
    $('#main').dataset.page = r.name;
    $('#main').innerHTML = html;
    if (['publish', 'edit'].includes(r.name) && $('#publish-form')) updateBudget();
    const title = { hall: '问卷大厅', experiment: '实验大厅', publish: '发布', edit: '编辑问卷', tasks: '我的任务', points: '积分中心', detail: frontDetailTitle(r.id), review: '招募管理', admin: '管理员后台' }[r.name] || '页面未找到';
    document.title = `${title} · 问问校园互助`;
  }
  function frontDetailTitle(id) {
    return M.taskType(state.tasks.find(t => t.id === id)) === 'experiment' ? '实验详情' : '问卷详情';
  }
  function campusArt(t) {
    return ['校园生活', '消费习惯', '身心健康'].includes(t.topic) ? 'assets/campus-watercolor-ginkgo.webp' : 'assets/campus-watercolor-hero.webp';
  }
  function lifecycle(t, x) {
    const labels = ['发布', '领取', '提交', '审核', '到账'];
    let done = [0], current = t.status === 'open' ? 1 : null, note = '领取问卷后，在 24 小时内填写并提交完成页证明。';
    if (t.publisherId === state.currentUserId && !x) { current = null; note = '问卷已发布。每位同学完成领取、提交和审核后，奖励从已支出的招募预算中转入对方积分。'; }
    if (x?.status === 'locked') { done = [0, 1]; current = 2; note = `已经领取，还剩约 ${hours(x.claimUntil)} 小时提交证明。`; }
    else if (x?.status === 'pending') { done = [0, 1, 2]; current = 3; note = '证明已收到，等待发布者审核。审核通过后才会发放积分。'; }
    else if (x?.status === 'approved') { done = [0, 1, 2, 3, 4]; current = 4; note = `审核已通过，${fp(t.reward)} 积分已经到账。`; }
    else if (x?.status === 'correction') { done = [0, 1, 2]; current = 3; note = '提交编号待补正，审核倒计时暂停；补正提交后重新开始 48 小时审核。'; }
    else if (['rejected', 'appealed'].includes(x?.status)) { done = [0, 1, 2]; current = 3; note = x.status === 'appealed' ? '管理员复核中，奖励额度继续保留，尚未到账。' : '证明未通过审核，尚未到账。请查看原因与申诉期限。'; }
    else if (x?.status === 'overturned') { done = [0, 1, 2, 3]; current = null; note = '管理员已回滚奖励，本次记录不计作已到账。'; }
    else if (['expired', 'cancelled'].includes(x?.status)) { done = [0]; current = null; note = '本次领取已失效或取消，没有发放奖励。'; }
    else if (t.status !== 'open' && t.publisherId !== state.currentUserId) { current = null; note = '本任务已停止新领取；已有提交请在我的任务查看进度。'; }
    return `<div class="lifecycle-wrap"><ol class="lifecycle" aria-label="问卷任务进度">${labels.map((label, i) => `<li class="lifecycle-step" ${done.includes(i) ? 'data-done' : ''} ${current === i ? 'data-current aria-current="step"' : ''}>${label}</li>`).join('')}</ol><p class="lifecycle-note small muted">${e(note)}</p></div>`;
  }
  function slotText(slot) {
    const start = M.slotStartAt(slot), end = M.slotEndAt(slot);
    const date = new Date(start).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    const finish = new Date(end).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false });
    return `${date}～${finish}`;
  }
  function experimentMessage(x) {
    const t = M.task(state, x.taskId), slot = t.slots.find(q => q.id === x.slotId);
    if (x.status === 'approved') return `已完成，${fp(t.reward)} 积分已到账。${x.automatic ? '场次结束超过 24 小时，系统自动结算。' : '负责人已核销到场。'}`;
    if (x.status === 'pending') return `已预约 ${slot ? e(slotText(slot)) : '该场次'}。待到账 ${fp(t.reward)} 积分；到场由负责人核销后即时到账，未核销将在场次结束 24 小时后自动结算。`;
    return x.status === 'cancelled' ? '本次预约已取消，未发放积分。' : '请查看本次预约的处理记录。';
  }
  function attendanceCodeBlock(t, x) {
    if (x.userId !== state.currentUserId || x.status !== 'pending' || !x.attendanceCode) return '';
    return `<div class="callout info"><p>你的到场码 <strong class="number" style="font-size:24px;letter-spacing:.12em">${e(x.attendanceCode)}</strong> —— 到现场报给负责人</p>${button('复制到场码', 'copy-attendance', `data-id="${e(x.id)}"`)}<p class="small muted">不要提前发给别人，也不要在群里发。只有你在本次预约详情中可见。</p><p data-attendance-copy-status role="status"></p></div>`;
  }
  function experimentCard(t) {
    const q = M.stats(state, t), next = t.slots.filter(slot => M.slotStartAt(slot) > state.now && !slot.closed && M.slotRemaining(state, t, slot) > 0).sort((a, b) => M.slotStartAt(a) - M.slotStartAt(b))[0];
    return `<article class="survey-card compact-card"><img class="card-photo" src="${campusArt(t)}" alt="" width="160" height="180" loading="lazy"><div class="card-content"><div class="row-head" style="text-align:right">${badge('实验', 'info')}</div><h3><a href="#detail/${e(t.id)}">${e(t.title)}</a></h3><div class="card-meta"><span>${next ? e(slotText(next)) : '暂无可预约时段'}</span><span>${next ? next.minutes : t.minutes} 分钟</span><span>剩 ${q.remaining} 位</span><span class="reward">+${fp(t.reward)} 积分</span></div><p class="small muted">${t.format === 'online' ? '线上会议' : '地点'}：${e(t.location)}</p><div class="card-bottom"><span class="tag">${e(t.audience[0] || '全校同学')}</span><a href="#detail/${e(t.id)}">查看实验 ${icon('arrow')}</a></div></div></article>`;
  }
  function experimentDetail(t) {
    const u = M.user(state), mine = t.publisherId === u.id, x = M.taskSubs(state, t.id).find(x => x.userId === u.id), q = M.stats(state, t);
    const slots = t.slots.filter(slot => M.slotStartAt(slot) > state.now && !slot.closed);
    const controls = mine ? `<a class="btn" href="#review/${e(t.id)}">查看报名情况与核销</a>` : x ? `<div class="callout">${experimentMessage(x)}</div>${attendanceCodeBlock(t, x)}` : t.status === 'open' && slots.length ? `<fieldset class="detail-section"><legend>选择预约时段</legend>${slots.map(slot => { const left = M.slotRemaining(state, t, slot); return `<label class="checkbox"><input type="radio" name="bookingSlot" value="${e(slot.id)}" ${left <= 0 ? 'disabled' : ''} style="width:18px;height:18px;min-height:18px;flex-shrink:0;margin-top:4px">${e(slotText(slot))}，剩 ${left} 位${left <= 0 ? '（已满）' : ''}</label>`; }).join('')}</fieldset><label class="checkbox"><input type="checkbox" id="eligible">我已阅读实验要求，确认符合参与条件。</label><div class="detail-action">${button('预约这个时段', 'claim', `data-id="${e(t.id)}"`, '')}</div>` : '<div class="callout warning">暂无可预约时段，或本实验已停止招募。</div>';
    const onlineLocation = t.format === 'online' && /^https?:\/\//i.test(t.location) ? `<a href="${e(t.location)}" target="_blank" rel="noopener noreferrer">${e(t.location)}</a>` : e(t.location);
    return `<div class="narrow"><a class="back" href="#experiment">${icon('back')}返回实验大厅</a><article class="panel"><div class="section-title">${badge('实验 / 访谈', 'info')}${taskBadge(t)}</div><h1>${e(t.title)}</h1><p class="small muted">发布者 ${e(M.user(state, t.publisherId).nickname)}，${t.format === 'online' ? '线上' : '线下'}会面</p><dl class="detail-facts"><div><dt>完成后积分</dt><dd class="gold">+${fp(t.reward)}</dd></div><div><dt>总名额</dt><dd>${t.quota} 位</dd></div><div><dt>剩余可预约</dt><dd>${q.remaining} 位</dd></div></dl><p class="small muted">线下报酬：${e(t.cashNote || '无额外声明')}。平台不经手现金，线下报酬由双方自行结算。</p><section class="detail-section"><h2>实验说明</h2><p>${e(t.description)}</p></section><section class="detail-section"><h2>${t.format === 'online' ? '会议链接' : '会面地点'}</h2><p style="overflow-wrap:anywhere">${onlineLocation}</p></section><section class="detail-section"><h2>被试要求</h2><p>${e(t.requirements || t.audienceText || '请阅读说明，自行确认是否符合。')}</p></section><section class="detail-section"><h2>预约后怎么完成</h2><ol class="steps"><li>选择适合的时段<small>只预约自己能参加的场次</small></li><li>查看本次预约与地点<small>本期不收集或展示联系方式</small></li><li>到场后向负责人报码<small>由负责人输入核销，积分即时到账</small></li><li>查看积分结算<small>未核销时，在场次结束 24 小时后自动结算</small></li></ol></section>${x ? `<p>你的场次：${e(slotText(t.slots.find(slot => slot.id === x.slotId)))}</p>` : ''}${controls}<div class="actions">${button('举报或报告任务问题', 'report', `data-id="${e(t.id)}"`)}</div><p class="small muted">到场奖励从本实验的冻结预算支付。</p></article></div>`;
  }
  function experimentTaskRow(t, x) {
    const roster = M.taskSubs(state, t.id), approved = roster.filter(x => x.status === 'approved').length;
    return `<article class="task-row"><div class="row-head"><h3><a href="#detail/${e(t.id)}">${e(t.title)}</a></h3>${badge('实验', 'info')}</div>${x ? `${verdictBlock(x)}<p>${experimentMessage(x)}</p><p>${e(t.location)}</p><div class="actions"><a class="btn secondary" href="#detail/${e(t.id)}">查看预约详情${x.status === 'pending' ? '与到场码' : ''}</a></div>` : `<p>已预约 ${roster.length} / ${t.quota} 位，已结算 ${approved} 人，冻结 ${fp(t.escrow)} 积分</p><div class="actions"><a class="btn" href="#review/${e(t.id)}">报名情况与现场核销</a></div>`}</article>`;
  }
  function experimentRoster(t, scope) {
    const owner = scope !== 'admin' && t.publisherId === state.currentUserId, admin = scope === 'admin' && M.user(state).role === 'admin' && !M.user(state).banned;
    if (!owner && !admin) return empty('无权查看实验报名情况', '只有本实验发布者可以核销到场。');
    const list = M.taskSubs(state, t.id);
    return `<div class="narrow"><a class="back" href="#${admin ? 'admin/tasks' : 'tasks'}">${icon('back')}返回任务列表</a><div class="page-heading"><div><h1>报名情况与现场核销</h1><p>${e(t.title)}</p></div>${taskBadge(t)}</div><div class="callout info">请参与者到场后口头提供到场码，再输入核销。列表不展示任何人的到场码。核销后即时结算 ${fp(t.reward)} 积分，不支持一键批量核销。</div>${t.slots.map(slot => `<section class="detail-section"><h2>${e(slotText(slot))}</h2><p>总名额 ${slot.capacity}，剩余 ${M.slotRemaining(state, t, slot)} 位</p>${list.filter(x => x.slotId === slot.id).map(x => `<article class="task-row"><div class="row-head"><h3>${e(M.user(state, x.userId).nickname)}</h3>${badge(x.status === 'approved' ? '已到场，积分已到账' : '已预约，待到场', x.status === 'approved' ? 'success' : 'info')}</div><p>到场码：由预约人现场提供</p>${owner && x.status === 'pending' ? button('输入到场码核销', 'check-in', `data-id="${e(x.id)}"`, '') : ''}${history(x)}</article>`).join('') || '<p class="small muted">该场次还没有预约。</p>'}</section>`).join('')}<p class="small muted">可核销时间为开始前 30 分钟至结束后 24 小时；未核销的正常预约在结束 24 小时后自动结算。</p></div>`;
  }
  function experimentPublish() {
    const slots = draft.slots?.length ? draft.slots : [{ startAt: new Date(state.now + M.DAY + 8 * M.HOUR).toISOString().slice(0, 16), minutes: 60, capacity: 1 }];
    const input = (name, label, type = 'text', attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${e(draft[name] ?? '')}" ${attrs} required><small id="error-${name}" aria-live="polite"></small></label>`;
    return `<div class="narrow"><div class="page-heading"><div><h1>发布实验招募</h1><p>约好一个时段，认真完成一次研究互助。</p></div></div><form id="publish-form" novalidate><input type="hidden" name="type" value="experiment"><input type="hidden" name="topic" value="学习研究"><input type="hidden" name="audience" value="全校同学"><div class="panel">${input('title', '实验标题', 'text', 'maxlength="60"')}<label class="field"><span>实验说明</span><textarea name="description" maxlength="1500" required>${e(draft.description || '')}</textarea><small id="error-description"></small></label>${input('audienceText', '目标参与者', 'text', 'maxlength="120"')}<div class="form-grid"><label class="checkbox"><input name="format" type="radio" value="offline" ${draft.format !== 'online' ? 'checked' : ''} style="width:18px;height:18px;min-height:18px;flex-shrink:0">线下</label><label class="checkbox"><input name="format" type="radio" value="online" ${draft.format === 'online' ? 'checked' : ''} style="width:18px;height:18px;min-height:18px;flex-shrink:0">线上</label></div>${input('location', '会面地点或会议链接', 'text', 'maxlength="300" placeholder="东区实验楼 B302，或完整的会议链接"')}<div class="section-title"><h2>预约时段</h2>${button('增加时段', 'add-slot')}</div><p class="small muted">时间采用北京时间。每个时段至少 1 分钟，1～10 人；时段需在招募截止前结束。</p><div id="slot-editor">${slots.map((slot, i) => `<div class="task-row" data-slot-row><h3>时段 ${i + 1}</h3><label class="field"><span>开始时间</span><input type="datetime-local" name="slotStart" value="${e(slot.startAt)}" required></label><div class="form-grid"><label class="field"><span>时长（分钟）</span><input name="slotMinutes" type="number" min="1" step="1" value="${e(slot.minutes)}" required></label><label class="field"><span>人数</span><input name="slotCapacity" type="number" min="1" max="10" value="${e(slot.capacity)}" required></label></div>${slots.length > 1 ? button('移除此时段', 'remove-slot', `data-index="${i}"`) : ''}</div>`).join('')}</div><small class="form-error" id="error-slots" aria-live="polite"></small><p>共 <strong id="experiment-quota">${slots.reduce((n, slot) => n + Number(slot.capacity || 0), 0)}</strong> 个名额，由时段人数自动计算。</p><label class="field"><span>被试要求（选填）</span><textarea name="requirements" maxlength="1000">${e(draft.requirements || '')}</textarea></label><label class="field"><span>线下报酬声明（选填）</span><input name="cashNote" maxlength="150" value="${e(draft.cashNote || '')}" placeholder="如 30 元现金，或一杯咖啡"></label><div class="form-grid">${input('reward', '每人奖励（10～600 积分）', 'number', 'min="10" max="600" step="0.1" inputmode="decimal"')}<label class="field"><span>招募时间（天）</span><input name="days" type="number" min="1" max="60" step="1" inputmode="numeric" value="${e(draft.days || 7)}" required><small id="error-days"></small></label></div><p class="small muted">平台不经手现金。线下报酬由双方自行结算。</p><label class="checkbox"><input type="checkbox" name="ethicsConfirmed" ${draft.ethicsConfirmed ? 'checked' : ''}>本实验已通过必要的伦理审查（涉及人体实验时）</label><label class="checkbox"><input type="checkbox" name="publicPlaceConfirmed" ${draft.publicPlaceConfirmed ? 'checked' : ''}>会面安排在校内公共场所</label><label class="checkbox"><input type="checkbox" name="privacyConfirmed" ${draft.privacyConfirmed ? 'checked' : ''}>我不会向参与者索取与实验无关的个人信息</label><p id="publish-error" class="form-error" role="alert"></p></div><div class="budget" id="budget"></div></form></div>`;
  }
  function card(t) {
    if (M.taskType(t) === 'experiment') return experimentCard(t);
    const q = M.stats(state, t), mine = t.publisherId === state.currentUserId;
    return `<article class="survey-card compact-card"><img class="card-photo" src="${campusArt(t)}" alt="" width="160" height="180" loading="lazy"><div class="card-content"><h3><a href="#detail/${e(t.id)}">${e(t.title)}</a></h3><div class="card-meta"><span>${icon('clock')}预计 ${t.minutes} 分钟</span><span class="reward">${icon('wallet')}+${fp(t.reward)}<small> 积分</small></span></div><div class="progress-row"><span>已收 ${q.approved} / ${t.quota} 份</span><span>${q.remaining ? `剩 ${q.remaining} 份可领` : taskNames[t.status][0]}</span></div><progress value="${q.approved}" max="${t.quota}" aria-label="已收 ${q.approved} 份，共 ${t.quota} 份"></progress><div class="card-bottom"><span class="tag">${e(t.audience[0] || '全校同学')}</span>${mine ? '<span class="small muted">我发布的</span>' : ''}<a class="card-link" href="#detail/${e(t.id)}">看看问卷 ${icon('arrow')}</a></div></div></article>`;
  }
  function hall({ name, query }) {
    const u = M.user(state), experiment = name === 'experiment';
    const type = experiment ? 'experiment' : 'survey', kind = experiment ? '实验' : '问卷';
    const search = query.get('q') || '', topic = query.get('topic') || '', audience = query.get('audience') || '', duration = query.get('duration') || '', ended = query.get('ended') === '1';
    const list = state.tasks.filter(t => M.taskType(t) === type
      && (ended || (t.status === 'open' && M.remaining(state, t) > 0))
      && (!topic || t.topic === topic)
      && (!audience || t.audience.includes(audience))
      && (!search || (t.title + t.description).includes(search))
      && (!duration || (duration === '3' ? t.minutes <= 3 : duration === '5' ? t.minutes > 3 && t.minutes <= 5 : t.minutes > 5)));
    list.sort((a, b) => M.remaining(state, b) - M.remaining(state, a) || b.reward - a.reward || b.createdAt - a.createdAt);
    return `<section class="welcome watercolor-welcome"><div class="welcome-copy"><h1>让互助在<br>校园里流动。</h1><p>答问卷、赴实验，用积分发出你自己的招募。</p></div><img class="welcome-art" src="assets/campus-watercolor-hero.webp" width="1000" height="620" alt="校园亭台与湖面的水彩画"></section><section class="wallet-inline" aria-label="我的积分概览"><a class="wallet-available wallet-balance" href="#points"><span>可用积分</span><strong class="number">${fp(u.available)}<span> 分</span></strong></a><a class="btn wallet-publish publish-link" href="#publish">发布 ${icon('arrow')}</a></section>
      <div class="board-layout"><section aria-labelledby="hall-title"><div class="discovery-toolbar"><div><h2 id="hall-title">发现${kind}</h2>${experiment ? '<p class="small muted">约好一个时段，到场完成一次研究</p>' : ''}</div><label class="search">${icon('search')}<input form="filter-form" name="q" type="search" value="${e(search)}" placeholder="搜索${kind}" aria-label="搜索${kind}标题或说明" autocomplete="off"></label></div>
      <div class="filter-tools"><form class="filters" id="filter-form"><select name="topic" aria-label="筛选主题">${options(S.TOPICS, topic, '所有主题')}</select><select name="audience" aria-label="筛选目标人群">${options(S.AUDIENCES, audience, '所有人群')}</select><select name="duration" aria-label="筛选预计耗时"><option value="">不限耗时</option><option value="3" ${duration === '3' ? 'selected' : ''}>3 分钟以内</option><option value="5" ${duration === '5' ? 'selected' : ''}>3～5 分钟</option><option value="more" ${duration === 'more' ? 'selected' : ''}>5 分钟以上</option></select><button type="submit" class="btn secondary">筛选</button><label class="checkbox"><input type="checkbox" name="ended" value="1" ${ended ? 'checked' : ''}>包含已满、已结束和已下架</label></form></div>
      <div class="result-info"><span>找到 ${list.length} 个任务</span></div>
      ${list.length ? `<div class="survey-grid compact-grid">${list.slice(0, pageSize).map(card).join('')}</div>
        ${list.length > pageSize ? `<div class="load-more">${button('再看看更多' + kind, 'more')}</div>` : `<p class="pagination-text">已经看到全部${kind}了</p>`}`
        : empty('暂时没有符合条件的' + kind, experiment ? '换个筛选条件，或者先发一个招募实验' : '换个筛选条件，或者先发一份自己的问卷', 'publish/' + type, '去发布')}
      </section></div>`;
  }
  function detail(t) {
    if (M.taskType(t) === 'experiment') return experimentDetail(t);
    const q = M.stats(state, t), u = M.user(state), x = state.submissions.find(x => x.taskId === t.id && x.userId === u.id), mine = t.publisherId === u.id;
    let controls = '';
    if (mine) controls = `<a href="#review/${e(t.id)}" class="btn">查看提交与审核${q.pending ? `（${q.pending}）` : ''}</a>`;
    else if (x) controls = (x.code ? `<p class="small muted">本次提交编号 ${e(x.sourceToken || x.code)} · ${x.codeAttached ? '用于发布者核对' : '未附加到问卷链接'}</p>` : '') + submissionActions(x, true);
    else if (u.claimRestrictedUntil > state.now) controls = `<div class="callout warning">因 3 次提交未按要求填写，暂时无法领取新问卷。限制至 ${fmt(u.claimRestrictedUntil)}。</div><button type="button" class="btn secondary" disabled>暂时无法领取</button>`;
    else if (t.status === 'open' && q.remaining) controls = `<label class="checkbox"><input id="eligible" type="checkbox">我已确认符合问卷的目标人群要求</label><div class="detail-action">${button('领取并开始', 'claim', `data-id="${e(t.id)}"`, '')}</div><p class="small muted">领取后可点击打开外部问卷。</p>${M.supportsSurveyCode(t.link) ? '<p class="small muted">打开问卷时，系统会给链接带上一个编号。发布者能通过它知道这份答卷是你提交的，但不知道你的姓名或学号。</p>' : '<p class="small muted">此问卷平台不支持自动传递提交编号。</p>'}`;
    else controls = `<div class="callout warning">${t.status === 'removed' ? `这个任务已被管理员下架：${e(t.removalReason)}` : '这份问卷已经招满或停止招募。'}<p>看看下方其他还在招募的问卷。</p></div>`;
    const similar = state.tasks.filter(k => M.taskType(k) === 'survey' && k.id !== t.id && k.status === 'open' && k.publisherId !== u.id).sort((a, b) => +(b.topic === t.topic) - +(a.topic === t.topic)).slice(0, 3);
    return `<div class="narrow"><a class="back" href="#hall">${icon('back')}返回问卷大厅</a><article class="panel"><div class="detail-head watercolor-detail"><img class="detail-art" src="${campusArt(t)}" alt="" width="1000" height="500"><div class="detail-head-copy"><div class="section-title"><span class="topic">${e(t.topic)}</span>${taskBadge(t)}</div><h1>${e(t.title)}</h1><p class="small muted">${e(M.user(state, t.publisherId).nickname)}发布于 ${fmt(t.createdAt)}，${fmt(t.deadline)}截止</p><div class="tags">${t.audience.map(v => `<span class="tag">${e(v)}</span>`).join('')}</div></div></div>${mine && recentlyPublishedId === t.id ? '<div class="callout publish-success"><strong>问卷已发布，招募开始了。</strong><p>已从可用积分支出招募预算。接下来同学会领取、提交证明，记得在 48 小时内审核。</p></div>' : ''}${lifecycle(t, x)}<dl class="detail-facts"><div><dt>预计耗时</dt><dd>${t.minutes}<small> 分钟</small></dd></div><div><dt>完成后获得</dt><dd class="green">+${fp(t.reward)}<small> 积分</small></dd></div><div><dt>剩余可领取</dt><dd>${q.remaining}<small> 份</small></dd></div></dl><div class="progress-row"><span>已收 ${q.approved} / ${t.quota} 份</span><span>通过后计入进度</span></div><progress value="${q.approved}" max="${t.quota}" aria-label="已收问卷进度"></progress>${mine ? `<div class="callout info">${q.locked} 人已领取等待提交；${q.pending} 份待审核；${q.disputed} 份处于申诉保留或复核中。</div>` : ''}<section class="detail-section"><h2>这份问卷想了解什么</h2><p>${e(t.description)}</p></section><section class="detail-section"><h2>希望由这些同学填写</h2><p>${e(t.audienceText)}</p><p class="small muted">资格由你自行确认，平台不核验院系或年级；发布者会根据要求审核。</p></section><section class="detail-section"><h2>完成这三步，就能获得积分</h2><ol class="steps"><li>领取后，打开外部问卷<small>请在领取后的 24 小时内提交证明</small></li><li>认真填写并提交问卷<small>积分仅用于问卷互助，请按实际情况回答</small></li><li>回来上传完成页截图<small>不包含答案或个人信息，审核通过后到账</small></li></ol></section>${x ? `<div class="callout">${subBadge(x)}<p>${submissionMessage(x)}</p></div>` : ''}${controls}<div class="actions">${button('报告链接失效', 'report', `data-id="${e(t.id)}"`)}</div></article>${similar.length ? `<section class="detail-section"><h2>也可以帮帮这些同学</h2><div class="survey-grid">${similar.map(card).join('')}</div></section>` : ''}</div>`;
  }
  function submissionMessage(x) {
    if (M.taskType(M.task(state, x.taskId)) === 'experiment') return experimentMessage(x);
    if (x.status === 'locked') return `还剩约 ${hours(x.claimUntil)} 小时提交证明。问卷在新页面打开，填完记得回来。`;
    if (x.status === 'correction') return '没找到你的提交编号。请确认问卷已提交成功，或补充说明。待补正期间审核倒计时暂停，只有一次补正机会。';
    if (x.status === 'pending') return `待到账 ${fp(M.task(state, x.taskId).reward)} 积分。发布者通过后到账；如果到 ${fmt(x.reviewUntil)} 仍在等待审核，系统会自动通过并发放。`;
    if (x.status === 'approved') return `已到账 ${fp(M.task(state, x.taskId).reward)} 积分。${x.automatic ? '本次由系统自动通过。' : '谢谢你认真完成问卷。'}`;
    if (x.status === 'rejected') return `拒绝原因：${e(x.rejectReason)}。${!x.final ? `还可在 ${Math.ceil((x.appealUntil - state.now) / M.DAY)} 天内申诉，名额及奖励在此期间保留。` : '申诉已裁决或申诉期已结束。'}`;
    if (x.status === 'appealed') return `已进入管理员队列，奖励额度继续保留。目标在 3 个工作日内处理。${x.appealKind === 'first-review' ? '这是发布者首次提交的保护复核。' : ''}`;
    if (x.status === 'expired') return '领取超过 24 小时未提交，名额已释放。同一任务不可再次领取。';
    if (x.status === 'overturned') return '管理员已回滚这笔奖励，具体原因可在处理记录和积分流水中查看。';
    return '任务下架，未提交的领取已取消，无积分变动。';
  }
  function submissionActions(x, detailPage = false) {
    if (M.taskType(M.task(state, x.taskId)) === 'experiment') return x.status === 'approved' ? '<a class="text-button" href="#points?type=reward">查看积分流水</a>' : '';
    const t = M.task(state, x.taskId);
    if (x.status === 'locked') {
      const warning = !M.supportsSurveyCode(t.link)
        ? '<p class="small muted">本任务未接入来源编号核对。发现异常数据时将无法定位到具体同学。</p>'
        : x.codeAttached ? '' : '<p class="small muted">这次领取未启用链接传参，打开问卷时不会附加编号。</p>';
      const link = detailPage && M.canReviewCode(t, x) ? M.surveyLaunchUrl(t, x) : null;
      const linkDetails = link ? `<details class="history"><summary>核对链接</summary><p><code style="overflow-wrap:anywhere">${e(link)}</code></p><p class="small muted">本次提交编号 ${e(x.sourceToken || x.code)}</p>${button('复制问卷链接', 'copy-survey-link', `data-id="${e(t.id)}"`)}<p data-copy-status role="status"></p></details>` : '';
      return `<div class="actions">${button(icon('external') + '打开问卷', 'open-survey', `data-id="${e(t.id)}"`)}${button(icon('upload') + '去提交证明', 'proof', `data-id="${e(x.id)}"`, '')}</div>${warning}${linkDetails}`;
    }
    if (x.status === 'correction') return button('补充编号说明', 'correct-code', `data-id="${e(x.id)}"`, '');
    if (x.status === 'pending') return '';
    if (x.status === 'rejected' && !x.final && state.now < x.appealUntil) return button('申诉', 'appeal', `data-id="${e(x.id)}"`);
    if (x.status === 'approved' && detailPage) return '<a class="text-button" href="#points?type=reward">查看积分流水</a>';
    return '';
  }
  function publish(typeOrTask) {
    const editing = typeof typeOrTask === 'object' ? typeOrTask : null;
    const type = editing ? 'survey' : typeOrTask;
    if (!type) return `<div class="narrow"><div class="page-heading"><div><h1>发布招募</h1></div></div>
      <div class="publish-options"><a class="panel" href="#publish/survey"><h2>发布问卷 ${icon('arrow')}</h2><p>填一份外部问卷链接，请同学来作答</p></a>
      <a class="panel" href="#publish/experiment"><h2>招募被试 ${icon('arrow')}</h2><p>约一个时段，请同学到场完成实验</p></a></div></div>`;
    if (!['survey', 'experiment'].includes(type)) return empty('找不到这个发布表单', '请选择招募类型。', 'publish', '返回发布');
    if (!editing && draft.type !== type) draft = {};
    if (type === 'experiment') return experimentPublish();
    const values = editing ? M.taskEditValues(state, editing) : { ...draft, days: draft.days || 7 };
    const claimed = editing ? M.taskSubs(state, editing.id).length : 0;
    const editNote = claimed ? `已有 ${claimed} 人领取，奖励、名额、链接和截止时间已锁定，以免已领取的同学遇到不同的招募条件。仍可修改标题、说明和人群等信息。` : '修改奖励或名额会同步调整已冻结的预算。修改招募时间后，从保存时重新计算截止日期。';
    const field = (name, label, type = 'text', placeholder = '', attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${e(values[name] ?? '')}" placeholder="${placeholder}" ${attrs} ${claimed && ['link', 'reward', 'quota', 'days'].includes(name) ? 'disabled' : 'required'}><small id="error-${name}" aria-live="polite"></small></label>`;
    return `<div class="narrow">${editing ? `<a class="back" href="#tasks?tab=published">${icon('back')}返回我发布的任务</a>` : ''}<div class="page-heading"><div><h1>${editing ? '编辑问卷' : '发出你的问卷'}</h1><p>${editing ? editNote : '把需求说清楚，让合适的同学来帮你。'}</p></div></div><form id="publish-form" novalidate><input type="hidden" name="type" value="survey"><div class="panel"><div class="form-heading"><span>1</span><h2>介绍一下你的问卷</h2></div>${field('title', '问卷标题', 'text', '例如：大学生使用 AI 学习工具的习惯', 'maxlength="60" autocomplete="off"') }<label class="field"><span>问卷说明</span><textarea name="description" required maxlength="1500" placeholder="研究用途、填写要求，以及你想告诉答题者的事">${e(values.description || '')}</textarea><small id="error-description" aria-live="polite"></small></label><div class="form-grid"><label class="field"><span>问卷主题</span><select name="topic" required>${options(S.TOPICS, values.topic, '选择主题')}</select><small id="error-topic" aria-live="polite"></small></label>${field('minutes', '预计耗时（分钟）', 'number', '3', 'min="1" max="60" inputmode="numeric"')}</div>${field('audienceText', '目标人群', 'text', '例如：大三及以上，有过实习经历', 'maxlength="120"')}<label class="field"><span>人群标签</span><select name="audience">${options(S.AUDIENCES, values.audience?.[0] || '全校同学')}</select><small>标签用于筛选，不会限制其他同学查看。</small></label>${field('link', '外部问卷链接', 'url', 'https://', 'autocomplete="url"')}<p class="small muted" id="publish-source-hint" aria-live="polite"></p><p class="small muted">请勿收集学号、证件号或账户密码。示例问卷可使用 https://surveys.example/my-study 。</p><div class="form-heading" style="margin-top:32px"><span>2</span><h2>设置你的招募计划</h2></div><div class="form-grid">${field('reward', '单份奖励（积分）', 'number', '10', 'min="5" max="600" step="0.1" inputmode="decimal"')}${field('quota', '招募数量（份）', 'number', '8', 'min="1" max="200" step="1" inputmode="numeric"')}${field('days', '招募时间（天）', 'number', '7', 'min="1" max="60" step="1" inputmode="numeric"')}</div>${editing ? '' : '<div class="callout">每次最多招募 200 份，适合课程和小组研究的小额互助。发布会先冻结积分，未用完的积分在所有提交结清后退回。</div>'}<p id="publish-error" class="form-error" role="alert"></p></div><div class="budget" id="budget"></div></form></div>`;
  }
  function publishInput() {
    const form = $('#publish-form'); if (!form) return null;
    const input = Object.fromEntries(new FormData(form)); input.audience = [input.audience];
    input.type = form.elements.type?.value || 'survey';
    if (route().name === 'edit' && input.days === form.elements.days.defaultValue) delete input.days;
    if (input.type === 'experiment') {
      input.slots = [...form.querySelectorAll('[data-slot-row]')].map(row => ({ startAt: row.querySelector('[name=slotStart]').value, minutes: Number(row.querySelector('[name=slotMinutes]').value), capacity: Number(row.querySelector('[name=slotCapacity]').value) }));
      input.quota = input.slots.reduce((sum, slot) => sum + slot.capacity, 0);
      input.minutes = input.slots[0]?.minutes || 60;
      for (const key of ['ethicsConfirmed', 'publicPlaceConfirmed', 'privacyConfirmed']) input[key] = form.elements[key].checked;
    }
    return input;
  }
  function updateBudget(validateName) {
    const input = publishInput(); if (!input) return;
    const r = route();
    if (r.name === 'edit') {
      const t = M.task(state, r.id);
      const errors = M.validateTaskEdit(state, t, input);
      const claimed = M.taskSubs(state, t.id).length > 0;
      const budget = claimed ? t.escrow : M.toUnits(input.reward) * Number(input.quota);
      const delta = budget - t.escrow;
      const valid = !errors.reward && !errors.quota && Number.isFinite(budget);
      const summary = claimed ? `当前冻结 ${fp(t.escrow)} 分`
        : !valid ? '请输入有效的奖励和招募数量。'
        : `修改后冻结 ${fp(budget)} 分${delta === 0 ? '' : delta > 0 ? `，需补冻结 ${fp(delta)} 分` : `，退回 ${fp(-delta)} 分`}`;
      const budgetMarkup = `<div><strong>${summary}</strong>${errors.budget ? `<p class="red">${e(errors.budget)}</p>` : ''}</div><button type="submit" class="btn" ${errors.task || errors.budget || !valid ? 'disabled' : ''}>保存修改</button>`;
      const node = $('#budget');
      node.classList.toggle('error', !!errors.budget || !valid);
      if (node._markup !== budgetMarkup) { node.innerHTML = budgetMarkup; node._markup = budgetMarkup; }
      if (validateName) showFieldError(validateName, errors);
      return errors;
    }
    if (!input.reward && !('reward' in draft)) input.reward = $('#publish-form [name="reward"]').value = input.type === 'experiment' ? 100 : 10;
    if (input.type !== 'experiment' && !input.quota && !('quota' in draft)) input.quota = $('#publish-form [name="quota"]').value = 8;
    if (input.type !== 'experiment' && !input.minutes && !('minutes' in draft)) input.minutes = $('#publish-form [name="minutes"]').value = 3;
    draft = input;
    const hint = $('#publish-source-hint');
    if (hint) hint.textContent = !input.link ? '填入链接后会显示来源编号核对支持情况。'
      : M.supportsSurveyCode(input.link) ? '问卷星链接会带上来源编号。后台能否记录编号，取决于问卷星账号是否支持自定义链接。'
      : '本任务未接入来源编号核对。发现异常数据时将无法定位到具体同学。';
    const errors = M.validatePublish(state, input), budget = M.toUnits(+input.reward) * +input.quota, balance = M.user(state).available, short = budget - balance;
    const experiment = input.type === 'experiment';
    const validBudget = Number.isFinite(+input.reward) && Math.abs(M.toPoints(M.toUnits(+input.reward)) - +input.reward) < 1e-9 && +input.reward >= (experiment ? 10 : 5) && +input.reward <= 600 && Number.isInteger(+input.quota) && +input.quota >= 1 && (experiment || +input.quota <= 200);
    if ($('#experiment-quota')) $('#experiment-quota').textContent = String(input.quota);
    $('#budget').className = 'budget' + (short > 0 || !validBudget ? ' error' : '');
    const rewards = state.tasks.filter(t => M.taskType(t) === 'survey' && t.status === 'open' && t.publisherId !== state.currentUserId).map(t => t.reward), unit = rewards.length ? Math.max(...rewards) : M.toUnits(10);
    const budgetMarkup = `<div><strong>支出 ${e(input.reward || 0)} × ${e(input.quota || 0)} = ${Number.isFinite(budget) ? fp(budget) : 0} 分</strong><p>当前可用 ${fp(balance)} 分，发布后剩余 ${fp(Math.max(0, balance - budget))} 分</p>${short > 0 && validBudget ? `<p class="red">还差 ${fp(short)} 分。${experiment ? '<a href="#points">查看可用积分</a>，或减少时段人数或每人奖励。' : `<a href="#hall">按每份 ${fp(unit)} 分估算，答约 ${Math.ceil(short / unit)} 份可补足</a>，以实际审核通过为准。`}</p>` : ''}${!validBudget ? '<p class="red">请填写有效的奖励和招募数量。</p>' : ''}</div><button type="submit" class="btn" ${short > 0 || !validBudget ? 'disabled' : ''}>${experiment ? '确认发布实验' : '确认发布问卷'}</button>`;
    // Do not replace the pressed submit button during the input's blur event.
    if ($('#budget')._markup !== budgetMarkup) { $('#budget').innerHTML = budgetMarkup; $('#budget')._markup = budgetMarkup; }
    if (validateName) showFieldError(validateName, errors);
    return errors;
  }
  function showFieldError(name, errors) {
    const node = document.getElementById('error-' + name);
    const field = $('#publish-form')?.elements.namedItem(name);
    if (node) { node.textContent = errors[name] || ''; node.className = errors[name] ? 'error' : ''; }
    field?.setAttribute('aria-invalid', errors[name] ? 'true' : 'false');
  }
  function tasks(tab) {
    const u = M.user(state), published = tab !== 'joined', list = published ? state.tasks.filter(t => t.publisherId === u.id).sort((a, b) => b.createdAt - a.createdAt) : state.submissions.filter(x => x.userId === u.id).sort((a, b) => b.createdAt - a.createdAt);
    return `<div class="narrow"><div class="page-heading"><div><h1>我的任务</h1><p>每一份认真回答，都值得被看见。</p></div><a class="btn" href="#publish">${icon('plus')}发布</a></div><div class="tabs"><a href="#tasks?tab=published" ${published ? 'aria-current="page"' : ''}>我发布的</a><a href="#tasks?tab=joined" ${!published ? 'aria-current="page"' : ''}>我参与的</a></div>${list.length ? list.map(v => {
      const t = published ? v : M.task(state, v.taskId), q = M.stats(state, t);
      if (M.taskType(t) === 'experiment') return experimentTaskRow(t, published ? null : v);
      return `<article class="task-row"><div class="row-head"><h3><a href="#detail/${e(t.id)}">${e(t.title)}</a></h3>${published ? taskBadge(t) : subBadge(v)}</div>${published ? `<p>已收 ${q.approved} / ${t.quota} 份，${q.locked} 人等待提交，${q.disputed} 份申诉保留${q.correction ? `，${q.correction} 份待补正` : ''}</p><p>${q.pending ? badge(`${q.pending} 份待审核`, 'warning') : '暂无待审核证明'}</p><div class="actions"><a class="btn" href="#review/${e(t.id)}">查看提交与审核</a>${t.status === 'open' && !t.stopped && t.deadline > state.now && !u.banned ? `<a class="btn secondary" href="#edit/${e(t.id)}">编辑</a>` : ''}${['open', 'settling'].includes(t.status) && !t.stopped ? button('停止招募', 'stop', `data-id="${e(t.id)}"`) : ''}</div>` : `${verdictBlock(v)}<p>${submissionMessage(v)}</p><div class="actions">${submissionActions(v)}<a class="text-button" href="#detail/${e(t.id)}">查看问卷详情</a></div>${history(v)}${v.code ? `<p class="small muted" style="text-align:end">编号 ${e(v.sourceToken || v.code)}</p>` : ''}`}</article>`;
    }).join('') : empty(published ? '还没有发出第一份问卷' : '你的第一份互助，从这里开始', published ? '启动积分已备好，写下你想了解的问题吧。' : '去大厅找一份感兴趣的问卷，填完赚取发布积分。', published ? 'publish' : 'hall', published ? '发布我的问卷' : '去回答问卷')}</div>`;
  }
  function verdictBlock(x) {
    const verdict = x.verdict;
    const outcome = verdict && M.VERDICTS[verdict.code];
    if (!outcome) return '';
    const administrator = state.users.find(u => u.id === verdict.by)?.nickname || '管理员';
    return `<div class="callout verdict"><p class="verdict-label">裁决结果：${e(outcome.label)}</p><p>影响：${e(outcome.effect)}</p><p class="small muted">${fmt(verdict.at)} · ${e(administrator)} · 理由：${e(verdict.reason)}</p></div>`;
  }
  function history(x) {
    if (!x.history.length) return '';
    return `<details class="history"><summary>查看完整处理记录</summary><ol>${x.history.map(h => `<li>${fmt(h.at)} ${e(h.actor === 'system' ? '系统' : state.users.find(u => u.id === h.actor)?.nickname || '系统')}：${e(h.action)}${h.reason ? '，' + e(h.reason) : ''}</li>`).join('')}</ol></details>`;
  }
  function proofBlock(x) {
    return `<div class="proof">${x.screenshot ? `<button type="button" class="proof-image" data-action="zoom" data-id="${e(x.id)}" aria-label="放大完成页截图"><img src="${e(x.screenshot)}" width="144" height="112" alt="用户提交的问卷完成页截图"></button>` : '<div class="proof-image missing">截图已清理，保留处理记录</div>'}<div><p>${e(M.user(state, x.userId).nickname)} ${subBadge(x)}</p><p class="small muted">提交于 ${fmt(x.submittedAt)}</p><p>${e(x.note || '未填写补充说明')}</p>${x.rejectReason ? `<p class="red">拒绝原因：${e(x.rejectReason)}</p>` : ''}</div></div>`;
  }
  function renderSourceConsole(t, list, metrics) {
    const last = sourceResults.get(state.currentUserId + ':' + t.id);
    const posted = list.filter(x => M.canReviewCode(t, x) && x.sourceToken);
    const matched = posted.filter(x => x.codeVerified && x.codeVerifiedBy === 'paste');
    const missing = posted.filter(x => !matched.includes(x));
    const row = x => `${e(M.user(state, x.userId).nickname)} · ${e(x.sourceToken)}`;
    const foreign = last?.foreign || [];
    const demo = t.isSourceDemo && M.user(state).role === 'admin';
    return `<section class="task-row" aria-labelledby="source-heading">
      <h2 id="source-heading">来源核对</h2><p>把问卷星后台答卷列表的「来源」整列或几行粘贴到这里。只粘贴来源值。</p>
      <form data-source-task="${e(t.id)}">
        <label class="field"><span>问卷星来源值</span><textarea name="sources" rows="4" maxlength="100000" placeholder="例如：T118-W9X5" required></textarea></label>
        <div class="actions"><button type="submit" class="btn">开始核对</button>${demo ? `${button('填入本任务全部编号（演示用）', 'fill-source-demo', `data-id="${e(t.id)}"`)}<span class="small muted">演示辅助 · 不会自动置为已核对</span>` : ''}</div>
      </form>
      <div class="detail-section" aria-live="polite"><p>本任务编号 ${e(M.taskCode(t.id))} · 共 ${metrics.claimedCount} 人领取 · 已提交 ${metrics.submittedCount} 份 · 来源已匹配 ${matched.length} 份</p>
        <p>${badge(`已匹配 ${matched.length} 位`, 'success')}</p>${matched.length ? `<ul>${matched.map(x => `<li>${row(x)}</li>`).join('')}</ul>` : ''}
        <p>${badge(`还没匹配 ${metrics.pasteMissingCount} 位`)}</p>${missing.length ? `<ul>${missing.map(x => `<li>${row(x)}</li>`).join('')}</ul>` : ''}
        ${posted.length < list.length ? `<p class="small muted">${list.length - posted.length} 条领取记录没有复合来源编号，请逐条审核。</p>` : ''}
        ${last ? `<p>${badge(`不属于本任务 ${foreign.length} 个`, 'warning')}</p>${foreign.length ? `<ul>${foreign.map(x => `<li>${e(x.token)}${x.count > 1 ? `（出现 ${x.count} 次）` : ''}</li>`).join('')}</ul>` : ''}${last.unrecognizedLines ? `<p>有 ${last.unrecognizedLines} 行没识别出编号。</p>` : ''}` : ''}
      </div><p class="small muted">这里只比对粘贴的编号。匹配后仍需另行审核，积分才会发放。</p></section>`;
  }
  function reviewSubmission(t, x, owner, admin = false) {
    if (M.taskType(t) === 'experiment') { const slot = t.slots.find(q => q.id === x.slotId); return `<article class="task-row"><h3>${e(M.user(state, x.userId).nickname)}的实验预约</h3><p>${slot ? e(slotText(slot)) : '场次不存在'}，${e(t.location)}</p>${badge(x.status === 'approved' ? '已到场，积分已到账' : '已预约，待到场', x.status === 'approved' ? 'success' : 'info')}<p class="small muted">管理员视图不展示到场码，核销需由本任务发布者完成。</p>${history(x)}</article>`; }
    const canCheck = (owner || admin) && M.canReviewCode(t, x);
    const pasted = x.codeVerified === true && x.codeVerifiedBy === 'paste';
    const manual = x.codeVerified === true && x.codeVerifiedBy === 'manual';
    const identifier = (owner || admin) && x.code ? `<p>编号 <strong class="number">${e(x.sourceToken || x.code)}</strong> ${canCheck ? badge(pasted ? '来源已匹配' : manual ? '手动已核对' : '未匹配', pasted ? 'success' : '') : '<span>未附加到问卷链接</span>'}</p>` : '';
    const checkbox = owner && canCheck ? `<label class="checkbox"><input type="checkbox" data-action="verify-code" data-id="${e(x.id)}" aria-label="手动标记已核对 ${e(x.sourceToken || x.code)}" ${manual ? 'checked' : ''} ${pasted ? 'disabled' : ''}>手动标记已核对（不构成自动匹配证据）</label>` : '';
    const single = canCheck && x.sourceToken && !pasted ? `<form data-source-task="${e(t.id)}" data-source-submission="${e(x.id)}"><label class="field"><span>粘贴该同学的来源值</span><input name="sources" maxlength="1000" required></label><button type="submit" class="btn secondary">核对这一条</button></form>` : '';
    let actions = '';
    if (x.status === 'pending') {
      actions = `<p>还剩约 ${hours(x.reviewUntil)} 小时自动通过。</p>${checkbox}${single}${owner ? `<div class="actions">${button('通过并发放积分', 'approve', `data-id="${e(x.id)}"`, '')}${button(canCheck || x.correctionUsed ? '拒绝或要求补正' : '拒绝', 'reject', `data-id="${e(x.id)}"`)}</div>` : ''}`;
    } else if (x.status === 'correction') {
      actions = '<div class="callout warning">等待答题者补充说明，审核倒计时暂停。</div>';
    } else if (owner && x.status === 'approved' && x.automatic && !x.challenge && state.now < x.resolvedAt + 7 * M.DAY) {
      actions = `<div class="actions">${button('申请管理员介入', 'challenge', `data-id="${e(x.id)}"`)}</div>`;
    }
    return `<article class="task-row"><div class="row-head"><h3>${e(M.user(state, x.userId).nickname)}的提交</h3>${subBadge(x)}</div>${verdictBlock(x)}${x.submittedAt ? proofBlock(x) : `<p>${submissionMessage(x)}</p>`}${identifier}${actions}${x.challenge ? `<p>奖励争议：${x.challenge.status === 'pending' ? '管理员处理中' : '已处理'}</p>` : ''}${history(x)}</article>`;
  }
  function review(t, scope = 'publisher') {
    if (M.taskType(t) === 'experiment') return experimentRoster(t, scope);
    const owner = t.publisherId === state.currentUserId;
    const admin = scope === 'admin';
    if (admin ? M.user(state).role !== 'admin' || M.user(state).banned : !owner) return empty('当前账号无权查看这些记录', '发布者可查看自己任务的审核记录。');
    const list = M.taskSubs(state, t.id).sort((a, b) => +(b.status === 'pending') - +(a.status === 'pending') || b.createdAt - a.createdAt);
    const metrics = M.batchApprovalEligibility(state, t);
    const supported = M.supportsSurveyCode(t.link);
    const codes = owner && supported ? list.filter(x => M.canReviewCode(t, x)) : [];
    const platform = supported ? '问卷星' : '问卷平台';
    const sourceSummary = !owner ? '' : supported
      ? `<p>编号：<strong class="number">${codes.map(x => e(x.sourceToken || x.code)).join(' · ') || '暂无'}</strong></p><p>在问卷星答卷的「来源详情」查找编号。仅领取的编号也列在这里。${codes.length < list.length ? `有 ${list.length - codes.length} 条记录未附加编号，请结合证明审核。` : ''}</p>`
      : '<p>此问卷平台不支持自动核对，可根据证明逐条审核。</p>';
    const batch = owner ? `<section class="task-row"><h3>批量审核本期提交</h3><p>请先在问卷平台核对本期答卷数量。</p><p class="small muted">${e(metrics.eligible ? '数量吻合时可发放全部待审核奖励，无需逐条勾选编号。' : metrics.reason)}</p><button type="button" class="btn" data-action="approve-all" data-id="${e(t.id)}" ${!metrics.eligible ? 'disabled' : ''}>本期数量吻合，全部通过</button></section>` : '';
    const rows = list.length ? list.map(x => reviewSubmission(t, x, owner, admin)).join('') : empty('还没有同学提交证明', '提交证明后，记录会显示在这里。', admin ? 'admin/tasks' : 'tasks', admin ? '返回任务管理' : '返回我的任务');
    const nav = admin ? `<p class="small muted"><a href="#admin/overview">管理员后台</a> / <a href="#admin/tasks">任务管理</a> / 提交记录</p><a class="back" href="#admin/tasks">${icon('back')}返回任务管理</a>` : `<a class="back" href="#tasks">${icon('back')}返回我的任务</a>`;
    return `<div class="narrow">${nav}<div class="page-heading"><div><h1>${admin ? '提交记录 · ' + e(t.title) : '提交与审核'}</h1><p>${admin ? '以管理员身份查看' : e(t.title)}</p></div>${taskBadge(t)}</div>
      <div class="callout info"><strong>共 ${metrics.claimedCount} 人领取，${platform}应收到 ${metrics.claimedCount} 份答卷。本期已提交 ${metrics.submittedCount} 份。</strong>${sourceSummary}<p>待审核 ${metrics.pendingCount} 份，待补正 ${metrics.correctionCount} 份，脏数据标记 ${metrics.dirtyCount} 份。</p></div>
      ${supported ? renderSourceConsole(t, list, metrics) : ''}${metrics.pendingCount ? '<div class="callout warning">每份提交满 48 小时自动通过。待补正期间暂停计时，补正后重开 48 小时。</div>' : ''}${batch}${rows}</div>`;
  }
  function points(type) {
    const u = M.user(state), types = { grant: '启动积分', freeze: '发布支出', reward: '已到账', transfer: '奖励兑付', refund: '已退回', adjust: '调账', reversal: '奖励回滚' };
    const list = state.ledger.filter(l => l.userId === u.id && (!type || l.type === type)).slice().reverse();
    const earned = state.ledger.filter(l => l.userId === u.id && ['grant', 'reward'].includes(l.type)).reduce((sum, l) => sum + l.availableDelta, 0);
    return `<div class="narrow"><div class="page-heading"><div><p class="page-subtitle">My points</p><h1>我的积分</h1><p>参与校园互助，为自己的下一次招募攒积分。</p></div></div><dl class="balance-strip"><div><dt>可用积分</dt><dd>${fp(u.available)}<small>分</small></dd></div><div><dt>累计获得</dt><dd>${fp(earned)}<small>分</small></dd></div></dl><div class="section-title"><h2>每一分，都有来处</h2><button type="button" class="text-button" data-action="rules">积分规则</button></div><div class="tabs"><a href="#points" ${!type ? 'aria-current="page"' : ''}>全部流水</a><a href="#points?type=reward" ${type === 'reward' ? 'aria-current="page"' : ''}>答题获得</a><a href="#points?type=freeze" ${type === 'freeze' ? 'aria-current="page"' : ''}>发布支出</a><a href="#points?type=refund" ${type === 'refund' ? 'aria-current="page"' : ''}>结余退回</a></div>${list.length ? `<div class="panel table-wrap"><table class="ledger"><thead><tr><th>时间</th><th>原因与关联任务</th><th>积分变化</th><th>状态</th></tr></thead><tbody>${list.map(l => `<tr><td>${fmt(l.createdAt)}</td><td>${e(l.type === 'freeze' ? '支出招募预算' : l.note)}${l.taskId ? `<small><a href="#detail/${e(l.taskId)}">${e(M.task(state, l.taskId).title)}</a></small>` : ''}<small>对手方：${e(l.counterparty)}</small></td><td class="amount ${l.availableDelta > 0 ? 'green' : ''}">${l.availableDelta ? (l.availableDelta > 0 ? '+' : '') + fp(l.availableDelta) : '—'}</td><td>${badge(types[l.type] || l.type)}</td></tr>`).join('')}</tbody></table></div>` : empty('这类流水还没有记录', '每次回答、发布和退款，都会在这里留下明细。')}<div class="callout">积分只能用于本平台发布招募，不可提现、转让给个人或兑换实物。任务停止后，需先结清领取、审核和申诉，再退回未用完的招募预算。</div></div>`;
  }
  const helpers = { e, icon, fmt, badge, button, empty, taskBadge, subBadge, proofBlock, history, verdictBlock, review, reviewSubmission };
  function modal(title, content, showCloseIcon = true) {
    const d = $('#dialog'); if (d.open) d.close();
    const closeIcon = showCloseIcon ? `<button type="button" class="icon-button" data-action="close" aria-label="关闭弹窗">${icon('close')}</button>` : '';
    $('#dialog-body').innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${e(title)}</h2>${closeIcon}</div><div class="dialog-content">${content}</div>`;
    d.showModal();
  }
  function updateNoticeBadge() {
    const count = M.unreadCount(state), bell = $('#notice-toggle');
    bell.setAttribute('aria-label', count ? `查看通知，${count} 条未读` : '查看通知');
    bell.innerHTML = icon('bell') + (count ? `<span class="notification-count" aria-hidden="true">${count}</span>` : '');
  }
  function openNotices() {
    const userId = state.currentUserId;
    const wasRead = new Set(state.notices.filter(n => n.userId === userId && n.read).map(n => n.id));
    if (M.unreadCount(state)) transact({ type: 'readNotices' }, '', false);
    updateNoticeBadge();
    const rows = state.notices.filter(n => n.userId === userId).reverse().map(n => {
      const unread = !wasRead.has(n.id);
      const contents = `<span class="notice-copy"><span>${unread ? '<span class="sr-only">未读：</span>' : ''}${e(n.text)}</span>${n.reason ? `<small>理由：${e(n.reason)}</small>` : ''}<small>${fmt(n.at)}</small></span>`;
      const cls = 'notice-row' + (unread ? ' notice-unread' : '');
      return n.href
        ? `<a class="${cls}" href="#${e(n.href)}" data-action="open-notice" data-id="${e(n.id)}">${contents}${icon('arrow')}</a>`
        : `<div class="${cls}">${contents}</div>`;
    });
    const content = rows.length ? `<div class="notice-list">${rows.join('')}</div>` : '<p>还没有通知。审核、到账和裁决结果都会出现在这里。</p>';
    modal('我的通知', `${content}<div class="actions">${button('关闭', 'close')}</div>`, false);
  }
  const dialogForm = (type, id, fields, label, danger = false) => `<form data-dialog-form="${type}" data-id="${e(id)}">${fields}<p class="form-error" role="alert" id="dialog-error"></p><div class="actions">${button('取消', 'close')}<button type="submit" class="btn ${danger ? 'danger' : ''}">${e(label)}</button></div></form>`;
  const reasonField = placeholder => `<label class="field"><span>具体理由（必填）</span><textarea name="reason" maxlength="500" placeholder="${e(placeholder)}" required></textarea></label>`;
  function close() { $('#dialog').close(); currentProof = null; }
  function showProofForm(id) {
    const x = M.sub(state, id); currentProof = null;
    modal('提交完成页证明', dialogForm('submit', id, `<p>截图只用于确认你完成了，不需要显示你填了什么。请只截完成页，保护你自己的隐私。</p><div class="upload-zone"><label for="proof-file">${icon('upload')}上传一张 JPG / PNG，最大 5MB</label><input id="proof-file" name="file" type="file" accept="image/jpeg,image/png"><img id="proof-preview" class="upload-preview" alt="即将提交的完成页截图预览" width="320" height="160" hidden><p id="upload-status" class="small muted" aria-live="polite"></p></div><button type="button" class="text-button" data-action="sample-proof">没有截图？生成一张明确标注的演示证明</button><label class="field"><span>补充说明（选填）</span><textarea name="note" maxlength="500" placeholder="可以说明你的填写情况，不要填写问卷答案。"></textarea></label><label class="checkbox"><input name="privacy" type="checkbox" required>我确认仅上传完成提示，未包含问卷答案和个人信息。</label><p class="small muted">截图压缩后保存在此浏览器，审核结清 7 天后在下次读取时删除。重置会立即清除。</p>`, '提交证明'));
  }
  function showCorrectionForm(id) {
    modal('补充编号说明', dialogForm('correctCode', id, '<div class="callout warning">发布者没有在答卷里找到你的提交编号。请说明问卷是否已提交成功。</div><p class="small muted">只有一次补正机会，提交后重新开始 48 小时审核。</p><label class="field"><span>补正说明（必填）</span><textarea name="note" required maxlength="500" placeholder="例如：我从问问打开问卷并看到提交成功页。"></textarea></label>', '提交补正'));
  }
  async function readFile(file) {
    if (!file) return;
    const status = $('#upload-status');
    currentProof = null; $('#proof-preview').hidden = true;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) { status.textContent = '请选择一张不超过 5MB 的 JPG 或 PNG 图片。'; return; }
    status.textContent = '正在读取并压缩图片…';
    const targetInput = $('#proof-file');
    try {
      const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas');
      const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height)); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const data = canvas.toDataURL('image/jpeg', .72);
      if (targetInput !== $('#proof-file') || !$('#dialog').open) return;
      if (data.length > 900000) throw new Error('压缩后的图片仍过大，请裁剪后重试。');
      currentProof = data; $('#proof-preview').src = currentProof; $('#proof-preview').hidden = false; status.textContent = '图片已准备好，确认隐私提示后即可提交。';
    } catch (error) { if (status.isConnected) status.textContent = error.message || '图片无法读取，请换一张有效图片。'; }
  }
  function sampleProof() {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f2f7f4'; ctx.fillRect(0, 0, 640, 400); ctx.textAlign = 'center'; ctx.fillStyle = '#17674d'; ctx.font = 'bold 34px sans-serif'; ctx.fillText('演示问卷 · 提交成功', 320, 144); ctx.fillStyle = '#394d41'; ctx.font = '22px sans-serif'; ctx.fillText('此图片仅用于演示审核流程', 320, 208); ctx.font = '18px sans-serif'; ctx.fillText('不代表已经完成任何真实问卷', 320, 256); ctx.fillText(fmt(state.now), 320, 306);
    currentProof = canvas.toDataURL('image/png'); $('#proof-preview').src = currentProof; $('#proof-preview').hidden = false; $('#upload-status').textContent = '已生成演示证明，不代表真实答题。';
  }
  document.addEventListener('click', event => {
    const reviewLink = event.target.closest('a[href^="#review/"]');
    if (reviewLink) reviewFrom = route().name === 'admin' ? location.hash.slice(1) : 'tasks';
    const target = event.target.closest('[data-action]'); if (!target) { if (!event.target.closest('.account-wrap')) hideAccount(); return; }
    const action = target.dataset.action, id = target.dataset.id;
    if (action !== 'account') hideAccount();
    try {
      if (action === 'account') { const hidden = !$('#account-menu').hidden; $('#account-menu').hidden = hidden; $('#account-toggle').setAttribute('aria-expanded', String(!hidden)); }
      else if (action === 'close') close();
      else if (action === 'skip-main') { event.preventDefault(); $('#main').focus(); }
      else if (action === 'return-front') go('hall');
      else if (action === 'logout') go('entry');
      else if (action === 'switch') { close(); if (transact({ type: 'switch', userId: id }, `已切换到${M.user(state, id).nickname}`)) { draft = {}; go(M.user(state).role === 'admin' ? 'admin/overview' : 'hall'); } }
      else if (action === 'add-slot' || action === 'remove-slot') {
        draft = publishInput();
        if (action === 'add-slot') draft.slots.push({ startAt: '', minutes: 60, capacity: 1 });
        else if (draft.slots.length > 1) draft.slots.splice(Number(target.dataset.index), 1);
        render();
      } else if (action === 'copy-attendance') {
        const x = M.sub(state, id); if (x.userId !== state.currentUserId || !x.attendanceCode) return;
        const status = target.parentElement.querySelector('[data-attendance-copy-status]');
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(x.attendanceCode).then(() => { status.textContent = '到场码已复制。'; }, () => { status.textContent = '无法自动复制，请手动复制上方到场码。'; });
        else status.textContent = '请手动复制上方到场码。';
      } else if (action === 'check-in') {
        const x = M.sub(state, id), t = M.task(state, x.taskId);
        modal('输入参与者提供的到场码', dialogForm('checkIn', id, `<p>参与者：${e(M.user(state, x.userId).nickname)}。请当面确认到场，再输入对方提供的 4 位到场码。</p><label class="field"><span>到场码</span><input name="attendanceCode" type="text" minlength="4" maxlength="4" autocomplete="off" autocapitalize="characters" required></label><p class="small muted">核销成功后立即发放 ${fp(t.reward)} 积分，请勿提前向参与者索要到场码。</p>`, '确认到场并结算'));
      } else if (action === 'more') { pageSize += 8; render(); }
      else if (action === 'claim') {
        if (transact({ type: 'claim', taskId: id, slotId: $('[name="bookingSlot"]:checked')?.value, eligible: $('#eligible')?.checked }, '', false)) {
          render();
          $('[data-action="open-survey"]')?.focus();
          if (M.taskType(M.task(state, id)) === 'experiment') toast('预约成功，请在详情中查看自己的到场码。');
        }
      } else if (action === 'open-survey' || action === 'copy-survey-link') {
        const t = M.task(state, id), x = state.submissions.find(x => x.taskId === id && x.userId === state.currentUserId);
        if (!x || x.status !== 'locked' || x.claimUntil <= Math.max(state.now, Date.now() + state.timeOffset)) throw new Error('请先领取问卷，或查看你的提交状态。');
        const link = M.surveyLaunchUrl(t, x);
        if (!link) throw new Error('问卷链接格式有误，请联系发布者');
        if (action === 'copy-survey-link') {
          if (!M.canReviewCode(t, x)) return;
          const status = target.closest('details').querySelector('[data-copy-status]');
          if (!navigator.clipboard?.writeText) { status.textContent = '请选中上方链接手动复制。'; return; }
          navigator.clipboard.writeText(link).then(() => {
            target.textContent = '已复制问卷链接';
            status.textContent = '已复制带编号的链接。';
          }, () => { status.textContent = '无法自动复制，请选中上方链接手动复制。'; });
          return;
        }
        if (S.isSourceDemoUrl(link) || new URL(link).hostname.endsWith('.example')) modal('示例问卷页面', `<div class="callout info">这是本地演示，不会收集真实答案。</div><h3>${e(t.title)}</h3><p>正式使用时，这里会在新页面打开发布者提供的第三方问卷。演示时可直接体验完成页证明的提交过程。</p><div class="actions">${button('回到平台，提交演示证明', 'proof', `data-id="${e(x.id)}"`, '')}</div>`);
        else { M.normalizeLink(link); window.open(link, '_blank', 'noopener,noreferrer'); toast('已尝试在新页面打开。填完请回来提交证明；无法打开时可报告链接失效。'); }
      } else if (action === 'proof') showProofForm(id);
      else if (action === 'sample-proof') sampleProof();
      else if (action === 'correct-code') showCorrectionForm(id);
      else if (action === 'verify-code') { if (!transact({ type: 'verifyCode', submissionId: id, verified: target.checked }, '核对结果已保存。')) target.checked = !target.checked; }
      else if (action === 'fill-source-demo') {
        const t = M.task(state, id), actor = M.user(state);
        if (actor.role !== 'admin' || actor.banned || !t.isSourceDemo) return;
        const input = target.form.elements.sources;
        input.value = M.taskSubs(state, id).filter(x => x.submittedAt != null && M.canReviewCode(t, x) && x.sourceToken).map(x => x.sourceToken).join('\n');
        input.focus();
        if (!input.value) toast('当前没有已提交的演示记录。');
      }
      else if (action === 'create-source-demo') {
        const actor = M.user(state);
        if (actor.role !== 'admin' || actor.banned) return;
        const next = S.withSourceDemo(state), demoTask = next.tasks.find(t => t.isSourceDemo);
        if (!demoTask) throw new Error('无法创建示例。请确认小林可发布且可用积分至少为 80 分。');
        persist(next); state = next; go('admin/review/' + demoTask.id);
      }
      else if (action === 'approve-all') {
        const t = M.task(state, id), info = M.batchApprovalEligibility(state, t);
        if (!info.eligible) throw new Error(info.reason);
        modal('确认批量通过本期答卷', dialogForm('approveAll', id, `<p>共 ${info.claimedCount} 人领取，本期已提交 ${info.submittedCount} 份，待审核 ${info.pendingCount} 份。</p>${M.supportsSurveyCode(t.link) ? `<p>已粘贴匹配 ${info.pasteMatchedCount} / 应匹配 ${info.claimedCount} 位。</p>` : ''}<p>确认问卷平台本期答卷数量已核对吻合后，将一次通过全部 ${info.pendingCount} 份待审核证明并发放积分。</p><label class="checkbox"><input name="countConfirmed" type="checkbox" required>我已${t.isSourceDemo ? '核对演示来源' : '到问卷平台核对'}，本期答卷数量吻合。</label>`, '本期数量吻合，全部通过'));
      }
      else if (action === 'zoom') { const x = M.sub(state, id); if (x.screenshot) modal('完成页截图', `<img class="full-proof" src="${e(x.screenshot)}" alt="问卷完成页截图" width="640" height="400">`); }
      else if (action === 'approve') {
        const x = M.sub(state, id); modal('确认审核通过', dialogForm('approve', id, `<p>确认后将从该任务已支出的招募预算中，向${e(M.user(state, x.userId).nickname)}发放 ${fp(M.task(state, x.taskId).reward)} 积分。请先查看截图和说明。</p>`, '通过并发放积分'));
      } else if (action === 'reject') {
        const x = M.sub(state, id), t = M.task(state, x.taskId);
        const canReportMissing = M.canReviewCode(t, x) || x.correctedAt != null;
        const reasons = M.REASONS.filter(reason => reason !== '码对不上' || canReportMissing);
        const reasonOptions = reasons.map(reason => `<option value="${e(reason)}">${e(reason === '码对不上' ? '找不到编号' : reason)}</option>`).join('');
        const correctionHint = canReportMissing ? (x.correctionUsed ? '补正后仍找不到编号，可拒绝这份提交。' : '首次找不到编号时，会先给答题者一次说明机会。') : '';
        const protectedHint = M.firstProtected(state, t, x) ? '首份证明的其他疑问会转交管理员复核。已核对编号且未按要求填写的提交可直接拒绝。' : '';
        modal('说明审核问题', dialogForm('reject', id, `${correctionHint || protectedHint ? `<div class="callout info">${correctionHint}${protectedHint}</div>` : ''}<label class="field"><span>原因（必选）</span><select name="reason" required><option value="">请选择具体原因</option>${reasonOptions}</select></label><label class="field"><span>补充说明（选“其他”时必填）</span><textarea name="note" maxlength="300"></textarea></label>`, '确认处理', true));
      } else if (action === 'appeal') modal('申请复核这次拒绝', dialogForm('appeal', id, reasonField('说明你已完成问卷的依据，不需要提供具体答案。'), '提交申诉'));
      else if (action === 'challenge') modal('申请管理员介入', dialogForm('challenge', id, reasonField('说明自动通过的证明存在什么问题。'), '提交申请'));
      else if (action === 'stop') modal('停止接受新领取', dialogForm('stop', id, '<p>已领取的同学仍可提交证明。待审核、领取和申诉全部结清后，未用完的招募预算才会退回。此操作不可撤销。</p>', '确认停止招募', true));
      else if (action === 'report') modal('报告问卷链接失效', dialogForm('report', id, '<p>报告将进入管理员的任务列表。平台无法自动判断第三方问卷是否可访问，请不要在链接页面输入账户密码。</p>', '确认报告'));
      else if (action === 'judge') CampusAdmin.judgeModal(state, id, { modal, dialogForm, reasonField, ...helpers });
      else if (action === 'admin-remove') modal('强制下架任务', dialogForm('remove', id, reasonField('说明下架原因，发布者可以看到。') + '<p class="small muted">已通过奖励不回滚；未提交领取取消，在途审核和申诉结清后退回余额。</p>', '确认下架', true));
      else if (action === 'admin-extend') modal('延长招募截止时间', dialogForm('extend', id, '<label class="field"><span>延长天数（1～14 天）</span><input name="days" type="number" min="1" max="14" value="3" required></label>', '确认延期'));
      else if (action === 'admin-user') CampusAdmin.userModal(state, id, { modal, dialogForm, reasonField, ...helpers });
      else if (action === 'time') modal('推进演示时间', dialogForm('advance', '', `<p>仅改变本原型的时钟，用来演示领取释放、审核超时和截图清理，不修改电脑时间。</p><p>当前演示时间：${fmt(state.now)}</p><label class="field"><span>向前推进</span><select name="hours"><option value="6">6 小时，查看审核提醒</option><option value="25">25 小时，演示领取释放</option><option value="49">49 小时，演示超时自动通过</option><option value="169">7 天后，演示申诉期满与图片清理</option></select></label>`, '推进时间'));
      else if (action === 'reset') modal('重置整个演示', dialogForm('reset', '', '<p class="small muted">当前界面中的问卷、昵称与进度均为示例数据。</p><p>清除所有自建问卷、截图、积分变动和处理记录，恢复示例数据，小林与阿哲回到 100 分。此操作不可撤销。</p>', '确认重置', true));
      else if (action === 'repair') { try { localStorage.removeItem(KEY); storageOK = true; persist(state); $('#storage-warning').hidden = true; toast('演示存储已恢复。'); } catch { toast('浏览器仍不允许存储，可继续体验临时模式。', true); } }
      else if (action === 'notices') openNotices();
      else if (action === 'open-notice') {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const notice = state.notices.find(n => n.id === id && n.userId === state.currentUserId);
        if (notice?.href) { close(); go(notice.href); }
      }
      else if (action === 'rules') modal('积分怎么转起来', '<ol><li>每个演示账号获得一次性 100 分启动积分。</li><li>发布时从可用积分中一次性支出「奖励 × 名额」作为招募预算，没被领走的部分在任务结清后退回。</li><li>审核通过后，从发布者已支出的招募预算转入答题者可用余额。48 小时未审核自动通过。</li><li>拒绝后保留 7 天申诉额度和名额；申诉中持续保留。全部在途记录结清后才退剩余预算。</li><li>想继续发问卷，就先认真回答同学的问卷。积分不可变现或私下转让。</li></ol><p class="small muted">24 小时提交、48 小时审核、7 天申诉和每日最多提交 5 份，均是待试点验证的原型默认规则。</p>');
      else if (action === 'privacy') modal('这个原型会存什么', '<p>本原型不注册、不上传服务器，不收集邮箱、学号、真实姓名或问卷答案。问卷说明、昵称、提交编号、截图缩略图和模拟积分保存在当前浏览器。打开支持的问卷时，链接会把编号传给问卷平台，发布者可用编号关联这份答卷和你的问问账号。</p><p>截图只允许包含完成提示。审核结清 7 天后，下次读取会清理图片；申诉处理中继续保留。重置立即清除本原型的数据。</p><p>数据在同一浏览器刷新后保留；隐私模式、清理浏览器或更换网址可能丢失。请勿上传真实个人资料。演示账号切换不是真实的身份认证。</p>');
      else if (action === 'guide') modal('三分钟，体验一次校园互助', '<ol><li>用小林发布一份问卷：10 分 × 8 份，支出 80 分，可用积分剩余 20 分。</li><li>从右上角头像切到阿哲，领取小林的问卷，再点击“打开问卷”。</li><li>回来提交证明。没有截图时，可以生成明确标注的演示图片。</li><li>切回小林，进入“我的任务”审核。首份存疑会转交管理员，避免新发布者直接拒绝所有证明。</li><li>切到管理员处理复核，再查看双方积分流水与守恒看板。</li><li>头像菜单里可推进 49 小时演示自动通过，也可一键重置。</li></ol><p class="small muted">预置问卷采用 .example 演示链接，不会跳到陌生的真实问卷；你发布的 http/https 链接会在新页面打开。</p>');
    } catch (error) { toast(error.message, true); }
  });
  function hideAccount() { $('#account-menu').hidden = true; $('#account-toggle').setAttribute('aria-expanded', 'false'); }
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideAccount(); if (event.key === 'Enter' && event.target.matches('input[form="filter-form"]')) { event.preventDefault(); $('#filter-form')?.requestSubmit(); } });
  document.addEventListener('input', event => { if (event.target.closest('#publish-form')) updateBudget(event.target.name); });
  document.addEventListener('focusout', event => {
    const field = event.target;
    if (!field.closest('#publish-form') || !field.name) return;
    const value = Number(field.value);
    const rounded = field.name === 'quota' && field.value !== '' && Number.isFinite(value) && !Number.isInteger(value);
    if (rounded) field.value = Math.round(value);
    updateBudget(field.name);
    if (rounded) { const note = $('#error-quota'); note.textContent = '招募数量必须是整数，已四舍五入为 ' + field.value + ' 份。'; note.className = 'error'; }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'proof-file') readFile(event.target.files[0]);
    if (event.target.closest('#publish-form')) updateBudget(event.target.name);
    if ((event.target.closest('#filter-form') && event.target.tagName !== 'INPUT') || event.target.name === 'ended') $('#filter-form')?.requestSubmit();
    if (event.target.name === 'adminStatus') go('admin/tasks' + (event.target.value ? '?status=' + encodeURIComponent(event.target.value) : ''));
  });
  document.addEventListener('submit', event => {
    event.preventDefault(); const form = event.target;
    if (form.dataset.sourceTask) {
      const taskId = form.dataset.sourceTask, submissionId = form.dataset.sourceSubmission;
      const text = form.elements.sources.value.trim();
      if (!text) return toast('请先粘贴来源值。', true);
      const result = M.matchSources(state, taskId, text);
      if (result.reason) return toast(result.reason, true);
      const single = submissionId && result.matched.find(x => x.submissionId === submissionId);
      if (submissionId && !single) return toast('粘贴的内容没有匹配这位同学的编号。', true);
      if (!transact({ type: 'verifySources', taskId, text: single ? single.token : text }, '', false)) return;
      if (!submissionId) sourceResults.set(state.currentUserId + ':' + taskId, result);
      render();
      $('[data-source-task]:not([data-source-submission]) textarea')?.focus({ preventScroll: true });
      return toast(`本次匹配 ${single ? 1 : result.matched.length} 位。`);
    }
    if (form.id === 'filter-form') { pageSize = 8; const params = new URLSearchParams(new FormData(form)); for (const [k, v] of [...params]) if (!v) params.delete(k); go(route().name + (params.size ? '?' + params : '')); }
    if (form.id === 'publish-form') {
      const errors = updateBudget();
      const r = route();
      if (r.name === 'edit') {
        const input = publishInput();
        for (const key of Object.keys(input)) showFieldError(key, errors);
        if (Object.keys(errors).length) {
          const first = Object.keys(errors)[0];
          $('#publish-error').textContent = errors[first];
          form.elements.namedItem(first)?.focus();
          return;
        }
        if (transact({ type: 'editTask', taskId: r.id, input }, '修改已保存', false)) go('detail/' + r.id);
        return;
      }
      for (const key of Object.keys(draft)) if (key !== 'audience') updateBudget(key);
      if (Object.keys(errors).length) { $('#publish-error').textContent = Object.values(errors)[0]; const first = $(`[name="${Object.keys(errors)[0]}"]`); first?.focus(); return; }
      if (transact({ type: 'publish', input: draft }, draft.type === 'experiment' ? '实验已发布，招募已从可用积分支出招募预算。' : '问卷已发布，招募已从可用积分支出招募预算。', false)) { const t = state.tasks[state.tasks.length - 1]; recentlyPublishedId = t.id; draft = {}; go('detail/' + t.id); }
    }
    if (!form.dataset.dialogForm) return;
    const data = Object.fromEntries(new FormData(form)), type = form.dataset.dialogForm, id = form.dataset.id;
    let action;
    if (type === 'checkIn') { const x = M.sub(state, id); action = { type, taskId: x.taskId, submissionId: id, attendanceCode: data.attendanceCode.trim().toUpperCase() }; }
    else if (type === 'correctCode') action = { type, submissionId: id, note: data.note };
    else if (type === 'approveAll') { if (data.countConfirmed !== 'on') { $('#dialog-error').textContent = '请先确认已核对本期答卷数量。'; return; } action = { type, taskId: id }; }
    else if (type === 'submit') action = { type, submissionId: id, screenshot: currentProof, note: data.note, privacy: data.privacy === 'on' };
    else if (type === 'approve' || type === 'reject') action = { type: 'review', submissionId: id, approve: type === 'approve', reason: data.reason, note: data.note };
    else if (type === 'appeal' || type === 'challenge') action = { type, submissionId: id, reason: data.reason };
    else if (type === 'judge') action = { type, submissionId: id, verdict: data.verdict, reason: data.reason };
    else if (type === 'manageUser') action = { type, userId: id, operation: data.operation, amount: Number(data.amount), days: Number(data.days), reason: data.reason };
    else if (['stop', 'remove', 'report', 'extend'].includes(type)) action = { type, taskId: id, reason: data.reason, days: Number(data.days) };
    else if (type === 'advance') action = { type, hours: Number(data.hours) };
    else if (type === 'reset') action = { type };
    if (!action) return;
    try {
      const adminReset = action.type === 'reset' && route().name === 'admin' && M.user(state).role === 'admin';
      const next = action.type === 'reset' ? S.seed(Date.now(), { includeResearcher: true }) : M.commit(state, action, Date.now() + state.timeOffset);
      if (adminReset) next.currentUserId = state.currentUserId;
      persist(next); state = next; close(); draft = action.type === 'reset' ? {} : draft;
      if (action.type === 'reset') { sourceResults.clear(); pageSize = 8; go(adminReset ? 'admin/overview' : 'hall'); }
      render();
      if (['submit', 'correctCode'].includes(action.type)) {
        const x = M.sub(state, id);
        toast(x.status === 'approved' ? submissionMessage(x) : action.type === 'submit'
          ? '证明已提交，积分待到账。请在「我参与的」查看审核进度。'
          : '补正已提交，重新开始 48 小时审核。');
      } else {
        toast(({ checkIn: '到场核销成功，积分已到账。', approveAll: '本期待审核证明已全部通过。', review: '审核结果已保存。', appeal: '申诉已进入管理员队列。', judge: '裁决已保存，双方可查看处理记录。', reset: '演示已重置，小林与阿哲恢复 100 分。', advance: '演示时间已推进，超时记录已结算。' })[action.type] || '操作已完成。');
      }
    } catch (error) { $('#dialog-error').textContent = error.name === 'QuotaExceededError' ? '浏览器空间不足，操作未保存。请先重置演示或清理存储。' : error.message; }
  });
  window.addEventListener('hashchange', () => { close(); hideAccount(); transact({ type: 'tick' }, '', false); render(); window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); });
  window.addEventListener('storage', event => {
    if (event.key !== KEY || !event.newValue) return;
    try { const next = M.migrateState(JSON.parse(event.newValue)); M.assertState(next); state = next; close(); render(); toast('已同步另一个演示标签页的数据。'); } catch { toast('其他标签页的数据无法读取，请重置演示。', true); }
  });
  window.addEventListener('focus', () => { transact({ type: 'tick' }, '', !$('#dialog').open && !['publish', 'edit'].includes(route().name)); });
  try { state = M.commit(state, { type: 'tick' }, Date.now() + state.timeOffset); persist(state); } catch { toast('演示存储写入失败，本次操作不会持久保存。', true); }
  render();
})();
