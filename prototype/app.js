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
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { state = M.migrateState(JSON.parse(raw)); M.assertState(state); }
    else state = S.seed();
  } catch (error) {
    state = S.seed(); storageOK = false;
    $('#storage-warning').hidden = false;
    $('#storage-warning').innerHTML = `浏览器存储不可用或旧数据无法读取，本次使用临时演示数据，刷新将丢失。${button('清除旧数据并重试', 'repair')}`;
  }
  function persist(next) { if (storageOK) localStorage.setItem(KEY, JSON.stringify(next)); }
  function transact(action, message = '', redraw = true) {
    try {
      const next = action.type === 'reset' ? S.seed() : M.commit(state, action, Date.now() + state.timeOffset);
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
    const [name, id] = path.split('/'); return { name, id, query: new URLSearchParams(query) };
  }
  function go(hash) { if (location.hash === '#' + hash) render(); else location.hash = hash; }
  function empty(title, description, target = 'hall', label = '去问卷大厅') {
    return `<div class="empty">${icon('book')}<h3>${e(title)}</h3><p>${e(description)}</p><a class="btn" href="#${target}">${e(label)}</a></div>`;
  }
  const taskNames = { open: ['招募中', 'success'], settling: ['待结算', 'warning'], closed: ['已结束', ''], removed: ['已下架', 'error'] };
  const subNames = { locked: ['待提交证明', 'info'], pending: ['审核中', 'warning'], approved: ['已通过', 'success'], rejected: ['已拒绝', 'error'], appealed: ['管理员处理中', 'warning'], expired: ['领取已释放', ''], cancelled: ['已取消', ''], overturned: ['奖励已回滚', 'error'] };
  function taskBadge(t) { return badge(...taskNames[t.status]); }
  function subBadge(x) { return badge(x.automatic && x.status === 'approved' ? (x.history.some(h => h.reason === '超时自动通过') ? '超时自动通过' : '保护自动通过') : subNames[x.status][0], subNames[x.status][1]); }
  function shell() {
    const u = M.user(state), r = route(), active = r.name === 'review' ? (u.role === 'admin' && reviewFrom.startsWith('admin') ? 'admin' : 'tasks') : r.name === 'detail' ? 'hall' : r.name;
    const nav = [['hall', 'grid', '问卷大厅'], ['publish', 'plus', '发布问卷'], ['tasks', 'list', '我的任务'], ['points', 'wallet', '积分中心']];
    $('#desktop-nav').innerHTML = nav.map(([id, , text]) => `<a href="#${id}" ${active === id ? 'aria-current="page"' : ''}>${text}</a>`).join('') + (u.role === 'admin' ? `<a href="#admin" ${active === 'admin' ? 'aria-current="page"' : ''}>管理员后台</a>` : '');
    $('#mobile-nav').innerHTML = nav.map(([id, ico, text]) => `<a href="#${id}" ${active === id ? 'aria-current="page"' : ''}>${icon(ico)}${text.replace('问卷大厅', '大厅').replace('发布问卷', '发布').replace('积分中心', '积分')}</a>`).join('');
    $('#account-toggle').innerHTML = `<span class="avatar">${e(u.nickname.slice(0, 1))}</span><span>${e(u.nickname)}</span>${icon('chevron')}`;
    const notices = state.notices.filter(n => n.userId === u.id);
    $('#notice-toggle').innerHTML = icon('bell') + (notices.length ? `<span class="notification-count">${notices.length}</span>` : '');
    $('#account-menu').innerHTML = `<p class="small muted">模拟账号切换</p>${state.users.filter(v => ['u1', 'u2', 'u3', 'u20'].includes(v.id) || v.researcher).map(v => `<button type="button" data-action="switch" data-id="${v.id}"><span class="avatar">${e(v.nickname.slice(0, 1))}</span>${e(v.nickname)}${v.id === u.id ? icon('check') : ''}</button>`).join('')}<hr>${u.role === 'admin' ? '<a href="#admin">' + icon('shield') + '管理员后台</a>' : ''}<button type="button" data-action="guide">${icon('book')}演示指南</button><button type="button" data-action="time">${icon('clock')}推进演示时间</button><button type="button" data-action="reset">${icon('reset')}重置演示数据</button>`;
  }
  function render() {
    shell(); const r = route(), u = M.user(state);
    let html;
    try {
      if (r.name === 'hall') html = hall(r.query);
      else if (r.name === 'publish') html = publish();
      else if (r.name === 'detail') html = detail(M.task(state, r.id));
      else if (r.name === 'tasks') html = tasks(r.query.get('tab') || 'published');
      else if (r.name === 'review') html = review(M.task(state, r.id));
      else if (r.name === 'points') html = points(r.query.get('type') || '');
      else if (r.name === 'admin') html = u.role === 'admin' ? CampusAdmin.render(state, r.query, helpers) : `<div class="empty">${icon('shield')}<h1>管理员工作台</h1><p>使用模拟管理员账号，查看申诉、任务、用户与数据看板。</p>${button('切换管理员并进入后台', 'switch', 'data-id="u3"', '')}</div>`;
      else html = empty('这个页面还没来得及长出来', '返回大厅，看看同学们正在研究什么。');
    } catch (error) { html = empty('暂时找不到这条记录', error.message); }
    $('#main').dataset.page = r.name;
    $('#main').innerHTML = html;
    if (r.name === 'publish') updateBudget();
    const title = { hall: '问卷大厅', publish: '发布问卷', tasks: '我的任务', points: '积分中心', detail: '问卷详情', review: '审核证明', admin: '管理员后台' }[r.name] || '页面未找到';
    document.title = `${title} · 问问校园互助`;
  }
  function campusArt(t) {
    return ['校园生活', '消费习惯', '身心健康'].includes(t.topic) ? 'assets/campus-watercolor-ginkgo.webp' : 'assets/campus-watercolor-hero.webp';
  }
  function lifecycle(t, x) {
    const labels = ['发布', '领取', '提交', '审核', '到账'];
    let done = [0], current = t.status === 'open' ? 1 : null, note = '领取问卷后，在 24 小时内填写并提交完成页证明。';
    if (t.publisherId === state.currentUserId && !x) { current = null; note = '问卷已发布。每位同学完成领取、提交和审核后，奖励从冻结预算转入对方积分。'; }
    if (x?.status === 'locked') { done = [0, 1]; current = 2; note = `已经领取，还剩约 ${hours(x.claimUntil)} 小时提交证明。`; }
    else if (x?.status === 'pending') { done = [0, 1, 2]; current = 3; note = `证明已提交，还剩约 ${hours(x.reviewUntil)} 小时自动通过。`; }
    else if (x?.status === 'approved') { done = [0, 1, 2, 3, 4]; current = 4; note = `审核已通过，${fp(t.reward)} 积分已经到账。`; }
    else if (['rejected', 'appealed'].includes(x?.status)) { done = [0, 1, 2]; current = 3; note = x.status === 'appealed' ? '管理员复核中，奖励额度继续保留，尚未到账。' : '证明未通过审核，尚未到账。请查看原因与申诉期限。'; }
    else if (x?.status === 'overturned') { done = [0, 1, 2, 3]; current = null; note = '管理员已回滚奖励，本次记录不计作已到账。'; }
    else if (['expired', 'cancelled'].includes(x?.status)) { done = [0]; current = null; note = '本次领取已失效或取消，没有发放奖励。'; }
    else if (t.status !== 'open' && t.publisherId !== state.currentUserId) { current = null; note = '本任务已停止新领取；已有提交请在我的任务查看进度。'; }
    return `<div class="lifecycle-wrap"><ol class="lifecycle" aria-label="问卷任务进度">${labels.map((label, i) => `<li class="lifecycle-step" ${done.includes(i) ? 'data-done' : ''} ${current === i ? 'data-current aria-current="step"' : ''}>${label}</li>`).join('')}</ol><p class="lifecycle-note small muted">${e(note)}</p></div>`;
  }
  function card(t) {
    const q = M.stats(state, t), mine = t.publisherId === state.currentUserId;
    return `<article class="survey-card compact-card"><img class="card-photo" src="${campusArt(t)}" alt="" width="160" height="180" loading="lazy"><div class="card-content"><h3><a href="#detail/${e(t.id)}">${e(t.title)}</a></h3><div class="card-meta"><span>${icon('clock')}预计 ${t.minutes} 分钟</span><span class="reward">${icon('wallet')}+${fp(t.reward)}<small> 积分</small></span></div><div class="progress-row"><span>已收 ${q.approved} / ${t.quota} 份</span><span>${q.remaining ? `剩 ${q.remaining} 份可领` : taskNames[t.status][0]}</span></div><progress value="${q.approved}" max="${t.quota}" aria-label="已收 ${q.approved} 份，共 ${t.quota} 份"></progress><div class="card-bottom"><span class="tag">${e(t.audience[0] || '全校同学')}</span>${mine ? '<span class="small muted">我发布的</span>' : ''}<a class="card-link" href="#detail/${e(t.id)}">看看问卷 ${icon('arrow')}</a></div></div></article>`;
  }
  function hall(query) {
    const u = M.user(state), search = query.get('q') || '', topic = query.get('topic') || '', audience = query.get('audience') || '', duration = query.get('duration') || '', ended = query.get('ended') === '1';
    let list = state.tasks.filter(t => (ended || t.status === 'open') && (!topic || t.topic === topic) && (!audience || t.audience.includes(audience)) && (!search || (t.title + t.description).includes(search)) && (!duration || (duration === '3' ? t.minutes <= 3 : duration === '5' ? t.minutes > 3 && t.minutes <= 5 : t.minutes > 5)));
    list.sort((a, b) => M.remaining(state, b) - M.remaining(state, a) || b.reward - a.reward || b.createdAt - a.createdAt);
    const topicHref = value => { const q = new URLSearchParams(query); value ? q.set('topic', value) : q.delete('topic'); return '#hall?' + q; };
    return `<section class="welcome watercolor-welcome"><div class="welcome-copy"><h1>让互助在<br>校园里流动。</h1><p>回答问卷赚积分，用积分发布问卷。</p></div><img class="welcome-art" src="assets/campus-watercolor-hero.webp" width="1000" height="620" alt="校园亭台与湖面的水彩画"></section><section class="wallet-inline" aria-label="我的积分概览"><a class="wallet-available wallet-balance" href="#points"><span>可用积分</span><strong class="number">${fp(u.available)}<span> 分</span></strong></a><div class="wallet-frozen"><span>冻结</span><strong class="number">${fp(u.frozen)}<span> 分</span></strong></div><a class="btn wallet-publish publish-link" href="#publish">发布问卷 ${icon('arrow')}</a></section><div class="board-layout"><section aria-labelledby="hall-title"><div class="discovery-toolbar"><h2 id="hall-title">发现问卷</h2><label class="search">${icon('search')}<input form="filter-form" name="q" type="search" value="${e(search)}" placeholder="搜索问卷主题" aria-label="搜索问卷标题或说明" autocomplete="off"></label></div><div class="filter-tools"><nav class="topic-chips" aria-label="快捷主题筛选">${[['', '全部'], ['校园生活', '校园生活'], ['学习研究', '学习研究']].map(([value, label]) => `<a href="${e(topicHref(value))}" ${topic === value ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><details class="filter-details" ${audience || duration || ended || (topic && !['校园生活', '学习研究'].includes(topic)) ? 'open' : ''}><summary>更多筛选${icon('chevron')}</summary><form class="filters" id="filter-form"><select name="topic" aria-label="筛选主题">${options(S.TOPICS, topic, '所有主题')}</select><select name="audience" aria-label="筛选目标人群">${options(S.AUDIENCES, audience, '所有人群')}</select><select name="duration" aria-label="筛选预计耗时"><option value="">不限耗时</option><option value="3" ${duration === '3' ? 'selected' : ''}>3 分钟以内</option><option value="5" ${duration === '5' ? 'selected' : ''}>3～5 分钟</option><option value="more" ${duration === 'more' ? 'selected' : ''}>5 分钟以上</option></select><button type="submit" class="btn secondary">筛选</button><label class="checkbox"><input type="checkbox" name="ended" value="1" ${ended ? 'checked' : ''}>包含已满、已结束和已下架</label></form></details></div><div class="result-info"><span>找到 ${list.length} 份问卷</span><span>可领名额优先，其次奖励</span></div>${list.length ? `<div class="survey-grid compact-grid">${list.slice(0, pageSize).map(card).join('')}</div>${list.length > pageSize ? `<div class="load-more">${button('再看看更多问卷', 'more')}</div>` : '<p class="pagination-text">已经看到全部问卷了</p>'}` : empty('暂时没有符合条件的问卷', '可以换个筛选条件，或者先发布一份自己的问卷。', 'publish', '发布第一份问卷')}</section><aside class="sidebar"><section class="side-panel"><h3>让积分转起来</h3><ol class="steps"><li>找一份感兴趣的问卷<small>确认自己符合目标人群</small></li><li>填完，回来交完成页截图<small>只截完成提示，保护隐私</small></li><li>审核通过，积分到账<small>48 小时未审核会自动通过</small></li><li>用积分，发布你的问卷<small>每次招募最多 200 份</small></li></ol></section><section class="side-panel"><h3>小份问卷，也值得认真</h3><p>这里服务同学之间的小额互助。积分只能用于发布问卷，不可提现、转让或兑换实物。</p><button type="button" class="text-button" data-action="rules">了解积分规则 ${icon('arrow')}</button></section><p class="side-note"><strong>这是一片演示校园</strong>问卷、昵称与进度均为示例数据。</p></aside></div>`;
  }
  function detail(t) {
    const q = M.stats(state, t), u = M.user(state), x = state.submissions.find(x => x.taskId === t.id && x.userId === u.id), mine = t.publisherId === u.id;
    let controls = '';
    if (mine) controls = `<a href="#review/${e(t.id)}" class="btn">查看提交与审核${q.pending ? `（${q.pending}）` : ''}</a>`;
    else if (x) controls = submissionActions(x, true);
    else if (t.status === 'open' && q.remaining) controls = `<label class="checkbox"><input id="eligible" type="checkbox">我已确认符合问卷的目标人群要求</label><div class="detail-action">${button('领取并开始', 'claim', `data-id="${e(t.id)}"`, '')}</div><p class="small muted">领取只占用名额；下一步再打开外部问卷，不会自动跳转。</p>`;
    else controls = `<div class="callout warning">${t.status === 'removed' ? `这个任务已被管理员下架：${e(t.removalReason)}` : '这份问卷已经招满或停止招募。'}<p>看看下方其他还在招募的问卷。</p></div>`;
    const similar = state.tasks.filter(k => k.id !== t.id && k.status === 'open' && k.publisherId !== u.id).sort((a, b) => +(b.topic === t.topic) - +(a.topic === t.topic)).slice(0, 3);
    return `<div class="narrow"><a class="back" href="#hall">${icon('back')}返回问卷大厅</a><article class="panel"><div class="detail-head watercolor-detail"><img class="detail-art" src="${campusArt(t)}" alt="" width="1000" height="500"><div class="detail-head-copy"><div class="section-title"><span class="topic">${e(t.topic)}</span>${taskBadge(t)}</div><h1>${e(t.title)}</h1><p class="small muted">${e(M.user(state, t.publisherId).nickname)}发布于 ${fmt(t.createdAt)}，${fmt(t.deadline)}截止</p><div class="tags">${t.audience.map(v => `<span class="tag">${e(v)}</span>`).join('')}</div></div></div>${mine && recentlyPublishedId === t.id ? '<div class="callout publish-success"><strong>问卷已发布，招募开始了。</strong><p>预算已冻结。接下来同学会领取、提交证明，记得在 48 小时内审核。</p></div>' : ''}${lifecycle(t, x)}<dl class="detail-facts"><div><dt>预计耗时</dt><dd>${t.minutes}<small> 分钟</small></dd></div><div><dt>完成后获得</dt><dd class="green">+${fp(t.reward)}<small> 积分</small></dd></div><div><dt>剩余可领取</dt><dd>${q.remaining}<small> 份</small></dd></div></dl><div class="progress-row"><span>已收 ${q.approved} / ${t.quota} 份</span><span>通过后计入进度</span></div><progress value="${q.approved}" max="${t.quota}" aria-label="已收问卷进度"></progress>${mine ? `<div class="callout info">${q.locked} 人已领取等待提交；${q.pending} 份待审核；${q.disputed} 份处于申诉保留或复核中。</div>` : ''}<section class="detail-section"><h2>这份问卷想了解什么</h2><p>${e(t.description)}</p></section><section class="detail-section"><h2>希望由这些同学填写</h2><p>${e(t.audienceText)}</p><p class="small muted">资格由你自行确认，平台不核验院系或年级；发布者会根据要求审核。</p></section><section class="detail-section"><h2>完成这三步，就能获得积分</h2><ol class="steps"><li>领取后，打开外部问卷<small>请在领取后的 24 小时内提交证明</small></li><li>认真填写并提交问卷<small>积分仅用于问卷互助，请按实际情况回答</small></li><li>回来上传完成页截图<small>不包含答案或个人信息，审核通过后到账</small></li></ol></section>${x ? `<div class="callout">${subBadge(x)}<p>${submissionMessage(x)}</p></div>` : ''}${controls}<div class="actions">${button('报告链接失效', 'report', `data-id="${e(t.id)}"`)}</div></article>${similar.length ? `<section class="detail-section"><h2>也可以帮帮这些同学</h2><div class="survey-grid">${similar.map(card).join('')}</div></section>` : ''}</div>`;
  }
  function submissionMessage(x) {
    if (x.status === 'locked') return `还剩约 ${hours(x.claimUntil)} 小时提交证明。问卷在新页面打开，填完记得回来。`;
    if (x.status === 'pending') return `预计 48 小时内出结果，还剩约 ${hours(x.reviewUntil)} 小时自动通过。`;
    if (x.status === 'approved') return `已到账 ${fp(M.task(state, x.taskId).reward)} 积分。${x.automatic ? '本次由系统自动通过。' : '谢谢你认真完成问卷。'}`;
    if (x.status === 'rejected') return `拒绝原因：${e(x.rejectReason)}。${!x.final ? `还可在 ${Math.ceil((x.appealUntil - state.now) / M.DAY)} 天内申诉，名额及奖励在此期间保留。` : '申诉已裁决或申诉期已结束。'}`;
    if (x.status === 'appealed') return `已进入管理员队列，奖励额度继续保留。目标在 3 个工作日内处理。${x.appealKind === 'first-review' ? '这是发布者首次提交的保护复核。' : ''}`;
    if (x.status === 'expired') return '领取超过 24 小时未提交，名额已释放。同一任务不可再次领取。';
    if (x.status === 'overturned') return '管理员已回滚这笔奖励，具体原因可在处理记录和积分流水中查看。';
    return '任务下架，未提交的领取已取消，无积分变动。';
  }
  function submissionActions(x, detailPage = false) {
    const t = M.task(state, x.taskId);
    if (x.status === 'locked') return `<div class="actions">${button(icon('external') + '打开问卷', 'open-survey', `data-id="${e(t.id)}"`)}${button(icon('upload') + '去提交证明', 'proof', `data-id="${e(x.id)}"`, '')}</div>`;
    if (x.status === 'pending') return '<button type="button" class="btn secondary" disabled>审核中</button>';
    if (x.status === 'rejected' && !x.final && state.now < x.appealUntil) return button('申诉', 'appeal', `data-id="${e(x.id)}"`);
    if (x.status === 'approved' && detailPage) return `<button type="button" class="btn secondary" disabled>已完成，+${fp(t.reward)} 分</button>`;
    return '';
  }
  function publish() {
    const field = (name, label, type = 'text', placeholder = '', attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${e(draft[name] ?? '')}" placeholder="${placeholder}" ${attrs} required><small id="error-${name}" aria-live="polite"></small></label>`;
    return `<div class="narrow"><div class="page-heading"><div><h1>发出你的问卷</h1><p>把需求说清楚，让合适的同学来帮你。</p></div></div><form id="publish-form" novalidate><div class="panel"><div class="form-heading"><span>1</span><h2>介绍一下你的问卷</h2></div>${field('title', '问卷标题', 'text', '例如：大学生使用 AI 学习工具的习惯', 'maxlength="60" autocomplete="off"') }<label class="field"><span>问卷说明</span><textarea name="description" required maxlength="1500" placeholder="研究用途、填写要求，以及你想告诉答题者的事">${e(draft.description || '')}</textarea><small id="error-description" aria-live="polite"></small></label><div class="form-grid"><label class="field"><span>问卷主题</span><select name="topic" required>${options(S.TOPICS, draft.topic, '选择主题')}</select><small id="error-topic" aria-live="polite"></small></label>${field('minutes', '预计耗时（分钟）', 'number', '3', 'min="1" max="60" inputmode="numeric"')}</div>${field('audienceText', '目标人群', 'text', '例如：大三及以上，有过实习经历', 'maxlength="120"')}<label class="field"><span>人群标签</span><select name="audience">${options(S.AUDIENCES, draft.audience?.[0] || '全校同学')}</select><small>标签用于筛选，不会限制其他同学查看。</small></label>${field('link', '外部问卷链接', 'url', 'https://', 'autocomplete="url"')}<p class="small muted">请勿收集学号、证件号或账户密码。示例问卷可使用 https://surveys.example/my-study 。</p><div class="form-heading" style="margin-top:32px"><span>2</span><h2>设置你的招募计划</h2></div><div class="form-grid">${field('reward', '单份奖励（积分）', 'number', '10', 'min="5" max="50" step="0.1" inputmode="decimal"')}${field('quota', '招募数量（份）', 'number', '8', 'min="1" max="200" step="1" inputmode="numeric"')}<label class="field"><span>招募时间（天）</span><input name="days" type="number" min="1" max="60" step="1" inputmode="numeric" value="${e(draft.days || 7)}" required><small id="error-days" aria-live="polite"></small></label></div><div class="callout">每次最多招募 200 份。发布时冻结全部奖励积分，未用完的部分在结清后退回。</div><p id="publish-error" class="form-error" role="alert"></p></div><div class="budget" id="budget"></div></form></div>`;
  }
  function publishInput() {
    const form = $('#publish-form'); if (!form) return null;
    const input = Object.fromEntries(new FormData(form)); input.audience = [input.audience];
    return input;
  }
  function updateBudget(validateName) {
    const input = publishInput(); if (!input) return;
    if (!input.reward && !('reward' in draft)) input.reward = $('#publish-form [name="reward"]').value = 10;
    if (!input.quota && !('quota' in draft)) input.quota = $('#publish-form [name="quota"]').value = 8;
    if (!input.minutes && !('minutes' in draft)) input.minutes = $('#publish-form [name="minutes"]').value = 3;
    draft = input;
    const errors = M.validatePublish(state, input), budget = M.toUnits(+input.reward) * +input.quota, balance = M.user(state).available, short = budget - balance;
    const validBudget = Number.isFinite(+input.reward) && Math.abs(M.toPoints(M.toUnits(+input.reward)) - +input.reward) < 1e-9 && +input.reward >= 5 && +input.reward <= 50 && Number.isInteger(+input.quota) && +input.quota >= 1 && +input.quota <= 200;
    $('#budget').className = 'budget' + (short > 0 || !validBudget ? ' error' : '');
    const rewards = state.tasks.filter(t => t.status === 'open' && t.publisherId !== state.currentUserId).map(t => t.reward), unit = rewards.length ? Math.max(...rewards) : M.toUnits(10);
    const budgetMarkup = `<div><strong>冻结 ${e(input.reward || 0)} × ${e(input.quota || 0)} = ${Number.isFinite(budget) ? fp(budget) : 0} 分</strong><p>当前可用 ${fp(balance)} 分，发布后剩余 ${fp(Math.max(0, balance - budget))} 分</p>${short > 0 && validBudget ? `<p class="red">还差 ${fp(short)} 分。<a href="#hall">按每份 ${fp(unit)} 分估算，答约 ${Math.ceil(short / unit)} 份可补足</a>，以实际审核通过为准。</p>` : ''}${!validBudget ? '<p class="red">请填写有效的奖励和招募数量。</p>' : ''}</div><button type="submit" class="btn" ${short > 0 || !validBudget ? 'disabled' : ''}>确认发布问卷</button>`;
    // Do not replace the pressed submit button during the input's blur event.
    if ($('#budget')._markup !== budgetMarkup) { $('#budget').innerHTML = budgetMarkup; $('#budget')._markup = budgetMarkup; }
    if (validateName) {
      const node = $(`#error-${validateName}`), field = $(`#publish-form [name="${validateName}"]`);
      if (node) { node.textContent = errors[validateName] || ''; node.className = errors[validateName] ? 'error' : ''; }
      field?.setAttribute('aria-invalid', errors[validateName] ? 'true' : 'false');
    }
    return errors;
  }
  function tasks(tab) {
    const u = M.user(state), published = tab !== 'joined', list = published ? state.tasks.filter(t => t.publisherId === u.id).sort((a, b) => b.createdAt - a.createdAt) : state.submissions.filter(x => x.userId === u.id).sort((a, b) => b.createdAt - a.createdAt);
    return `<div class="narrow"><div class="page-heading"><div><h1>我的任务</h1><p>每一份认真回答，都值得被看见。</p></div><a class="btn" href="#publish">${icon('plus')}发布问卷</a></div><div class="tabs"><a href="#tasks?tab=published" ${published ? 'aria-current="page"' : ''}>我发布的</a><a href="#tasks?tab=joined" ${!published ? 'aria-current="page"' : ''}>我参与的</a></div>${list.length ? list.map(v => {
      const t = published ? v : M.task(state, v.taskId), q = M.stats(state, t);
      return `<article class="task-row"><div class="row-head"><h3><a href="#detail/${e(t.id)}">${e(t.title)}</a></h3>${published ? taskBadge(t) : subBadge(v)}</div>${published ? `<p>已收 ${q.approved} / ${t.quota} 份，${q.locked} 人等待提交，${q.disputed} 份申诉保留</p><p>${q.pending ? badge(`${q.pending} 份待审核`, 'warning') : '暂无待审核证明'} 冻结余额 ${fp(t.escrow)} 分</p><div class="actions"><a class="btn" href="#review/${e(t.id)}">查看提交与审核</a>${['open', 'settling'].includes(t.status) && !t.stopped ? button('停止招募', 'stop', `data-id="${e(t.id)}"`) : ''}</div>` : `<p>${submissionMessage(v)}</p><div class="actions">${submissionActions(v)}<a class="text-button" href="#detail/${e(t.id)}">查看问卷详情</a></div>${history(v)}`}</article>`;
    }).join('') : empty(published ? '还没有发出第一份问卷' : '你的第一份互助，从这里开始', published ? '启动积分已备好，写下你想了解的问题吧。' : '去大厅找一份感兴趣的问卷，填完赚取发布积分。', published ? 'publish' : 'hall', published ? '发布我的问卷' : '去回答问卷')}</div>`;
  }
  function history(x) {
    if (!x.history.length) return '';
    return `<details class="history"><summary>查看完整处理记录</summary><ol>${x.history.map(h => `<li>${fmt(h.at)} ${e(h.actor === 'system' ? '系统' : state.users.find(u => u.id === h.actor)?.nickname || '系统')}：${e(h.action)}${h.reason ? '，' + e(h.reason) : ''}</li>`).join('')}</ol></details>`;
  }
  function proofBlock(x) {
    return `<div class="proof">${x.screenshot ? `<button type="button" class="proof-image" data-action="zoom" data-id="${e(x.id)}" aria-label="放大完成页截图"><img src="${e(x.screenshot)}" width="144" height="112" alt="用户提交的问卷完成页截图"></button>` : '<div class="proof-image missing">截图已清理，保留处理记录</div>'}<div><p>${e(M.user(state, x.userId).nickname)} ${subBadge(x)}</p><p class="small muted">提交于 ${fmt(x.submittedAt)}</p><p>${e(x.note || '未填写补充说明')}</p>${x.rejectReason ? `<p class="red">拒绝原因：${e(x.rejectReason)}</p>` : ''}</div></div>`;
  }
  function review(t) {
    if (t.publisherId !== state.currentUserId && M.user(state).role !== 'admin') return empty('这份问卷由其他同学发布', '你只能审核自己发布的问卷。');
    const list = M.taskSubs(state, t.id).sort((a, b) => +(b.status === 'pending') - +(a.status === 'pending') || b.createdAt - a.createdAt), pending = list.filter(x => x.status === 'pending').length;
    return `<div class="narrow"><a class="back" href="#${e(reviewFrom)}">${icon('back')}${reviewFrom.startsWith('admin') ? '返回管理员后台' : '返回我的任务'}</a><div class="page-heading"><div><h1>提交与审核</h1><p>${e(t.title)}</p></div>${taskBadge(t)}</div>${pending ? `<div class="callout warning">还有 ${pending} 份待审核。每份提交满 48 小时自动通过，剩余 24 小时和 6 小时时会在通知中提醒。</div>` : ''}<div class="callout info">首次发布的首份证明受保护：可以直接通过；如果存疑，选择原因转交管理员复核。拒绝后的申诉保留期为 7 天。</div>${list.length ? list.map(x => `<article class="task-row"><div class="row-head"><h3>${e(M.user(state, x.userId).nickname)}的提交</h3>${subBadge(x)}</div>${x.submittedAt ? proofBlock(x) : `<p>${submissionMessage(x)}</p>`}${x.status === 'pending' ? `<p>还剩约 ${hours(x.reviewUntil)} 小时自动通过。</p><div class="actions">${button('通过并发放积分', 'approve', `data-id="${e(x.id)}"`, '')}${button(M.firstProtected(state, t, x) ? '有疑问，转交复核' : '拒绝', 'reject', `data-id="${e(x.id)}"`)}</div>` : ''}${x.status === 'approved' && x.automatic && !x.challenge && state.now < x.resolvedAt + 7 * M.DAY ? `<div class="actions">${button('申请管理员介入', 'challenge', `data-id="${e(x.id)}"`)}</div>` : ''}${x.challenge ? `<p>奖励争议：${x.challenge.status === 'pending' ? '管理员处理中' : '已处理'}</p>` : ''}${history(x)}</article>`).join('') : empty('还没有同学提交证明', '问卷已发布。可以先回大厅体验其他同学的任务。')}</div>`;
  }
  function points(type) {
    const u = M.user(state), types = { grant: '启动积分', freeze: '已冻结', reward: '已到账', transfer: '已支出', refund: '已退回', adjust: '调账', reversal: '奖励回滚' };
    const list = state.ledger.filter(l => l.userId === u.id && (!type || l.type === type)).slice().reverse();
    const earned = state.ledger.filter(l => l.userId === u.id && ['grant', 'reward'].includes(l.type)).reduce((sum, l) => sum + l.availableDelta, 0);
    return `<div class="narrow"><div class="page-heading"><div><p class="page-subtitle">My points</p><h1>我的积分</h1><p>答一份问卷，离自己的下一次招募更近一点。</p></div></div><dl class="balance-strip"><div><dt>可用积分</dt><dd>${fp(u.available)}<small>分</small></dd></div><div><dt>招募冻结</dt><dd>${fp(u.frozen)}<small>分</small></dd></div><div><dt>累计获得</dt><dd>${fp(earned)}<small>分</small></dd></div></dl><div class="section-title"><h2>每一分，都有来处</h2><button type="button" class="text-button" data-action="rules">积分规则</button></div><div class="tabs"><a href="#points" ${!type ? 'aria-current="page"' : ''}>全部流水</a><a href="#points?type=reward" ${type === 'reward' ? 'aria-current="page"' : ''}>答题获得</a><a href="#points?type=freeze" ${type === 'freeze' ? 'aria-current="page"' : ''}>发布冻结</a><a href="#points?type=refund" ${type === 'refund' ? 'aria-current="page"' : ''}>剩余退回</a></div>${list.length ? `<div class="panel table-wrap"><table class="ledger"><thead><tr><th>时间</th><th>原因与关联任务</th><th>积分变化</th><th>状态</th></tr></thead><tbody>${list.map(l => `<tr><td>${fmt(l.createdAt)}</td><td>${e(l.note)}${l.taskId ? `<small><a href="#detail/${e(l.taskId)}">${e(M.task(state, l.taskId).title)}</a></small>` : ''}<small>对手方：${e(l.counterparty)}</small></td><td class="amount ${l.availableDelta > 0 ? 'green' : ''}">${l.availableDelta ? (l.availableDelta > 0 ? '+' : '') + fp(l.availableDelta) + ' 可用' : ''}${l.frozenDelta ? `<small>${l.frozenDelta > 0 ? '+' : ''}${fp(l.frozenDelta)} 冻结</small>` : ''}</td><td>${badge(types[l.type] || l.type)}</td></tr>`).join('')}</tbody></table></div>` : empty('这类流水还没有记录', '每次回答、发布和退款，都会在这里留下明细。')}<div class="callout">积分只能用于本平台发布问卷，不可提现、转让给个人或兑换实物。任务停止后，需先结清领取、审核和申诉，再退剩余冻结积分。</div></div>`;
  }
  const helpers = { e, icon, fmt, badge, button, empty, taskBadge, subBadge, proofBlock, history };
  function modal(title, content) {
    const d = $('#dialog'); if (d.open) d.close();
    $('#dialog-body').innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${e(title)}</h2><button type="button" class="icon-button" data-action="close" aria-label="关闭弹窗">${icon('close')}</button></div><div class="dialog-content">${content}</div>`;
    d.showModal();
  }
  const dialogForm = (type, id, fields, label, danger = false) => `<form data-dialog-form="${type}" data-id="${e(id)}">${fields}<p class="form-error" role="alert" id="dialog-error"></p><div class="actions">${button('取消', 'close')}<button type="submit" class="btn ${danger ? 'danger' : ''}">${e(label)}</button></div></form>`;
  const reasonField = placeholder => `<label class="field"><span>具体理由（必填）</span><textarea name="reason" maxlength="500" placeholder="${e(placeholder)}" required></textarea></label>`;
  function close() { $('#dialog').close(); currentProof = null; }
  function showProofForm(id) {
    const x = M.sub(state, id); currentProof = null;
    modal('提交完成页证明', dialogForm('submit', id, `<p>截图只用于确认你完成了，不需要显示你填了什么。请只截完成页，保护你自己的隐私。</p><div class="upload-zone"><label for="proof-file">${icon('upload')}上传一张 JPG / PNG，最大 5MB</label><input id="proof-file" name="file" type="file" accept="image/jpeg,image/png"><img id="proof-preview" class="upload-preview" alt="即将提交的完成页截图预览" width="320" height="160" hidden><p id="upload-status" class="small muted" aria-live="polite"></p></div><button type="button" class="text-button" data-action="sample-proof">没有截图？生成一张明确标注的演示证明</button><label class="field"><span>补充说明（选填）</span><textarea name="note" maxlength="500" placeholder="可以说明你的填写情况，不要填写问卷答案。"></textarea></label><label class="checkbox"><input name="privacy" type="checkbox" required>我确认仅上传完成提示，未包含问卷答案和个人信息。</label><p class="small muted">截图压缩后保存在此浏览器，审核结清 7 天后在下次读取时删除。重置会立即清除。</p>`, '提交证明'));
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
      else if (action === 'switch') { close(); if (transact({ type: 'switch', userId: id }, `已切换到${M.user(state, id).nickname}`)) { draft = {}; go(M.user(state).role === 'admin' ? 'admin' : 'hall'); } }
      else if (action === 'more') { pageSize += 8; render(); }
      else if (action === 'claim') {
        if (transact({ type: 'claim', taskId: id, eligible: $('#eligible')?.checked }, '', false)) { render(); modal('已为你保留一个名额', `<p>问卷在新页面打开。填完记得回来提交截图。</p><div class="callout">请在 24 小时内回来提交完成页证明；只打开链接不会获得积分。</div><div class="actions">${button('稍后填写', 'close')}${button('打开问卷', 'open-survey', `data-id="${e(id)}"`, '')}</div>`); }
      } else if (action === 'open-survey') {
        const t = M.task(state, id), x = state.submissions.find(x => x.taskId === id && x.userId === state.currentUserId);
        if (!x || x.status !== 'locked') throw new Error('请先领取问卷，或查看你的提交状态。');
        if (new URL(t.link).hostname.endsWith('.example')) modal('示例问卷页面', `<div class="callout info">这是本地演示，不会收集真实答案。</div><h3>${e(t.title)}</h3><p>正式使用时，这里会在新页面打开发布者提供的第三方问卷。演示时可直接体验完成页证明的提交过程。</p><div class="actions">${button('回到平台，提交演示证明', 'proof', `data-id="${e(x.id)}"`, '')}</div>`);
        else { normalizeSafe(t.link); window.open(t.link, '_blank', 'noopener,noreferrer'); close(); toast('已尝试在新页面打开。填完请回来提交证明；无法打开时可报告链接失效。'); }
      } else if (action === 'proof') showProofForm(id);
      else if (action === 'sample-proof') sampleProof();
      else if (action === 'zoom') { const x = M.sub(state, id); if (x.screenshot) modal('完成页截图', `<img class="full-proof" src="${e(x.screenshot)}" alt="问卷完成页截图" width="640" height="400">`); }
      else if (action === 'approve') {
        const x = M.sub(state, id); modal('确认审核通过', dialogForm('approve', id, `<p>确认后将从该任务的冻结预算中，向${e(M.user(state, x.userId).nickname)}发放 ${fp(M.task(state, x.taskId).reward)} 积分。请先查看截图和说明。</p>`, '通过并发放积分'));
      } else if (action === 'reject') {
        const x = M.sub(state, id), protectedFirst = M.firstProtected(state, M.task(state, x.taskId), x);
        modal(protectedFirst ? '首份证明，转交管理员复核' : '说明拒绝原因', dialogForm('reject', id, `${protectedFirst ? '<div class="callout info">首份证明受保护，不会被直接拒绝。疑问将交给管理员，奖励和名额继续保留。</div>' : ''}<label class="field"><span>原因（必选）</span><select name="reason" required>${options(M.REASONS, '', '请选择具体原因')}</select></label><label class="field"><span>补充说明（选“其他”时必填）</span><textarea name="note" maxlength="300"></textarea></label>`, protectedFirst ? '提交复核' : '确认拒绝', true));
      } else if (action === 'appeal') modal('申请复核这次拒绝', dialogForm('appeal', id, reasonField('说明你已完成问卷的依据，不需要提供具体答案。'), '提交申诉'));
      else if (action === 'challenge') modal('申请管理员介入', dialogForm('challenge', id, reasonField('说明自动通过的证明存在什么问题。'), '提交申请'));
      else if (action === 'stop') modal('停止接受新领取', dialogForm('stop', id, '<p>已领取的同学仍可提交证明。待审核、领取和申诉全部结清后，剩余冻结积分才会退回。此操作不可撤销。</p>', '确认停止招募', true));
      else if (action === 'report') modal('报告问卷链接失效', dialogForm('report', id, '<p>报告将进入管理员的任务列表。平台无法自动判断第三方问卷是否可访问，请不要在链接页面输入账户密码。</p>', '确认报告'));
      else if (action === 'judge') CampusAdmin.judgeModal(state, id, { modal, dialogForm, reasonField, ...helpers });
      else if (action === 'admin-remove') modal('强制下架任务', dialogForm('remove', id, reasonField('说明下架原因，发布者可以看到。') + '<p class="small muted">已通过奖励不回滚；未提交领取取消，在途审核和申诉结清后退回余额。</p>', '确认下架', true));
      else if (action === 'admin-extend') modal('延长招募截止时间', dialogForm('extend', id, '<label class="field"><span>延长天数（1～14 天）</span><input name="days" type="number" min="1" max="14" value="3" required></label>', '确认延期'));
      else if (action === 'admin-user') CampusAdmin.userModal(state, id, { modal, dialogForm, reasonField, ...helpers });
      else if (action === 'time') modal('推进演示时间', dialogForm('advance', '', `<p>仅改变本原型的时钟，用来演示领取释放、审核超时和截图清理，不修改电脑时间。</p><p>当前演示时间：${fmt(state.now)}</p><label class="field"><span>向前推进</span><select name="hours"><option value="6">6 小时，查看审核提醒</option><option value="25">25 小时，演示领取释放</option><option value="49">49 小时，演示超时自动通过</option><option value="169">7 天后，演示申诉期满与图片清理</option></select></label>`, '推进时间'));
      else if (action === 'reset') modal('重置整个演示', dialogForm('reset', '', '<p>清除所有自建问卷、截图、积分变动和处理记录，恢复示例数据，小林与阿哲回到 100 分。此操作不可撤销。</p>', '确认重置', true));
      else if (action === 'repair') { try { localStorage.removeItem(KEY); storageOK = true; persist(state); $('#storage-warning').hidden = true; toast('演示存储已恢复。'); } catch { toast('浏览器仍不允许存储，可继续体验临时模式。', true); } }
      else if (action === 'notices') { const list = state.notices.filter(n => n.userId === state.currentUserId).slice().reverse(); modal('我的通知', list.length ? list.map(n => `<div class="detail-section"><p>${e(n.text)}</p><small class="muted">${fmt(n.at)}</small></div>`).join('') + button('清空这些通知', 'read-notices') : '<p>目前没有新通知。审核、到账和管理结果都会出现在这里。</p>'); }
      else if (action === 'read-notices') { if (transact({ type: 'readNotices' }, '通知已清空')) close(); }
      else if (action === 'rules') modal('积分怎么转起来', '<ol><li>普通演示账号获得一次性 100 分启动积分，研究者演示账号预置 3000 分用于大样本演示。</li><li>发布问卷先冻结“奖励 × 名额”。领取和提交不扣答题者积分，也不额外冻结。</li><li>审核通过后，从发布者冻结余额转入答题者可用余额。48 小时未审核自动通过。</li><li>拒绝后保留 7 天申诉额度和名额；申诉中持续保留。全部在途记录结清后才退剩余预算。</li><li>想继续发问卷，就先认真回答同学的问卷。积分不可变现或私下转让。</li></ol><p class="small muted">24 小时提交、48 小时审核、7 天申诉和每日最多提交 5 份，均是待试点验证的原型默认规则。</p>');
      else if (action === 'privacy') modal('这个原型会存什么', '<p>本原型不注册、不上传服务器，不收集邮箱、学号、真实姓名或问卷答案。问卷说明、昵称、截图缩略图和模拟积分保存在当前浏览器。</p><p>截图只允许包含完成提示。审核结清 7 天后，下次读取会清理图片；申诉处理中继续保留。重置立即清除本原型的数据。</p><p>数据在同一浏览器刷新后保留；隐私模式、清理浏览器或更换网址可能丢失。请勿上传真实个人资料。演示账号切换不是真实的身份认证。</p>');
      else if (action === 'guide') modal('三分钟，体验一次校园互助', '<ol><li>用小林发布一份问卷：10 分 × 8 份，100 分变成可用 20、冻结 80。</li><li>从右上角头像切到阿哲，领取小林的问卷，再单独点击“打开问卷”。</li><li>回来提交证明。没有截图时，可以生成明确标注的演示图片。</li><li>切回小林，进入“我的任务”审核。首份存疑会转交管理员，避免新发布者直接拒绝所有证明。</li><li>切到管理员处理复核，再查看双方积分流水与守恒看板。</li><li>头像菜单里可推进 49 小时演示自动通过，也可一键重置。</li></ol><p class="small muted">预置问卷采用 .example 演示链接，不会跳到陌生的真实问卷；你发布的 http/https 链接会在新页面打开。</p>');
    } catch (error) { toast(error.message, true); }
  });
  function hideAccount() { $('#account-menu').hidden = true; $('#account-toggle').setAttribute('aria-expanded', 'false'); }
  function normalizeSafe(link) { M.normalizeLink(link); }
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
    if (event.target.name === 'adminStatus') go('admin?tab=tasks&status=' + encodeURIComponent(event.target.value));
  });
  document.addEventListener('submit', event => {
    event.preventDefault(); const form = event.target;
    if (form.id === 'filter-form') { pageSize = 8; const params = new URLSearchParams(new FormData(form)); for (const [k, v] of [...params]) if (!v) params.delete(k); go('hall?' + params); }
    if (form.id === 'publish-form') {
      const errors = updateBudget();
      for (const key of Object.keys(draft)) if (key !== 'audience') updateBudget(key);
      if (Object.keys(errors).length) { $('#publish-error').textContent = Object.values(errors)[0]; const first = $(`[name="${Object.keys(errors)[0]}"]`); first?.focus(); return; }
      if (transact({ type: 'publish', input: draft }, '问卷已发布，招募预算已冻结。', false)) { const t = state.tasks[state.tasks.length - 1]; recentlyPublishedId = t.id; draft = {}; go('detail/' + t.id); }
    }
    if (!form.dataset.dialogForm) return;
    const data = Object.fromEntries(new FormData(form)), type = form.dataset.dialogForm, id = form.dataset.id;
    let action;
    if (type === 'submit') action = { type, submissionId: id, screenshot: currentProof, note: data.note, privacy: data.privacy === 'on' };
    else if (type === 'approve' || type === 'reject') action = { type: 'review', submissionId: id, approve: type === 'approve', reason: data.reason, note: data.note };
    else if (type === 'appeal' || type === 'challenge') action = { type, submissionId: id, reason: data.reason };
    else if (type === 'judge') action = { type, submissionId: id, verdict: data.verdict, reason: data.reason };
    else if (type === 'manageUser') action = { type, userId: id, operation: data.operation, amount: Number(data.amount), days: Number(data.days), reason: data.reason };
    else if (['stop', 'remove', 'report', 'extend'].includes(type)) action = { type, taskId: id, reason: data.reason, days: Number(data.days) };
    else if (type === 'advance') action = { type, hours: Number(data.hours) };
    else if (type === 'reset') action = { type };
    if (!action) return;
    try {
      const next = action.type === 'reset' ? S.seed() : M.commit(state, action, Date.now() + state.timeOffset);
      persist(next); state = next; close(); draft = action.type === 'reset' ? {} : draft;
      if (action.type === 'reset') { pageSize = 8; go('hall'); }
      render(); toast(({ submit: '证明已提交，等待审核。', review: '审核结果已保存。', appeal: '申诉已进入管理员队列。', judge: '裁决已保存，双方可查看处理记录。', reset: '演示已重置，小林与阿哲恢复 100 分。', advance: '演示时间已推进，超时记录已结算。' })[action.type] || '操作已完成。');
    } catch (error) { $('#dialog-error').textContent = error.name === 'QuotaExceededError' ? '浏览器空间不足，操作未保存。请先重置演示或清理存储。' : error.message; }
  });
  window.addEventListener('hashchange', () => { close(); hideAccount(); transact({ type: 'tick' }, '', false); render(); window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); });
  window.addEventListener('storage', event => {
    if (event.key !== KEY || !event.newValue) return;
    try { const next = M.migrateState(JSON.parse(event.newValue)); M.assertState(next); state = next; close(); render(); toast('已同步另一个演示标签页的数据。'); } catch { toast('其他标签页的数据无法读取，请重置演示。', true); }
  });
  window.addEventListener('focus', () => { transact({ type: 'tick' }, '', !$('#dialog').open && route().name !== 'publish'); });
  try { state = M.commit(state, { type: 'tick' }, Date.now() + state.timeOffset); persist(state); } catch { toast('演示存储写入失败，本次操作不会持久保存。', true); }
  render();
})();
