(function (root) {
  'use strict';
  const M = root.CampusModel;
  function userActivity(s, u, h) {
    const { e, fmt, taskBadge } = h;
    const published = s.tasks.filter(t => t.publisherId === u.id).sort((a, b) => b.createdAt - a.createdAt);
    const completed = s.submissions.filter(x => x.userId === u.id && x.status === 'approved').sort((a, b) => b.resolvedAt - a.resolvedAt);
    const publishedRows = published.map(t => `<li><a href="#admin/review/${e(t.id)}">${e(t.title)}</a> ${taskBadge(t)}<p>发布于 ${fmt(t.createdAt)}，${M.taskType(t) === 'experiment' ? `已预约 ${M.taskSubs(s, t.id).length} / ${t.quota} 位` : `已通过 ${M.approved(s, t)} / ${t.quota} 份`}</p></li>`);
    const completedRows = completed.map(x => {
      const t = M.task(s, x.taskId);
      return `<li><a href="#admin/submission/${e(x.id)}">${e(t.title)}</a><p>${fmt(x.resolvedAt)} ${M.taskType(t) === 'experiment' ? '已结算' : '审核通过'}，到账 ${M.fmtPoints(t.reward)} 积分</p></li>`;
    });
    return `<details class="history"><summary>发布的任务（${published.length}）</summary>${publishedRows.length ? `<ul>${publishedRows.join('')}</ul>` : '<p>暂无发布记录。</p>'}</details>
      <details class="history"><summary>完成的任务（${completed.length}）</summary>${completedRows.length ? `<ul>${completedRows.join('')}</ul>` : '<p>暂无已结算的任务。</p>'}</details>`;
  }
  function internalPage(back, label, title, body, h) {
    return `<div class="narrow"><a class="back" href="#admin/${back}">${h.icon('back')}返回${label}</a><div class="page-heading"><div><h1>${h.e(title)}</h1><p>以管理员身份查看</p></div></div>${body}</div>`;
  }
  function submissionList(s, submissions, h) {
    const { e, fmt, subBadge, badge } = h;
    if (!submissions.length) return '<div class="callout">暂无参与记录。</div>';
    return submissions.slice().sort((a, b) => (b.submittedAt ?? b.createdAt) - (a.submittedAt ?? a.createdAt)).map(x => {
      const t = M.task(s, x.taskId);
      const experiment = M.taskType(t) === 'experiment';
      const status = experiment && x.status === 'pending' ? badge('已预约，待到场', 'info') : subBadge(x);
      return `<article class="task-row"><div class="row-head"><h3><a href="#admin/submission/${e(x.id)}">${e(t.title)}</a></h3>${status}</div><p>${e(M.user(s, x.userId).nickname)} · ${x.submittedAt == null ? (experiment ? '预约于 ' : '领取于 ') + fmt(x.createdAt) : '提交于 ' + fmt(x.submittedAt)}</p></article>`;
    }).join('');
  }
  function appealCard(s, x, h, detail = false) {
    const { e, fmt, badge, button, proofBlock, history, verdictBlock } = h;
    const t = M.task(s, x.taskId), at = x.challenge?.at ?? x.appealedAt;
    const pending = x.status === 'appealed' || x.challenge?.status === 'pending';
    const title = detail ? e(t.title) : `<a href="#admin/appeal/${e(x.id)}">${e(t.title)}</a>`;
    const info = `<p>发布者：${e(M.user(s, t.publisherId).nickname)}，答题者：${e(M.user(s, x.userId).nickname)}</p>${at ? `<p>申请时间 ${fmt(at)}${pending ? `，已等待 ${Math.floor((s.now - at) / M.HOUR)} 小时` : ''}</p>` : ''}`;
    const decision = `${proofBlock(x)}<div class="callout">${e(x.challenge?.reason || x.appealReason || '未记录申请理由')}</div>${history(x)}${pending ? `<div class="actions">${button('查看并作出裁决', 'judge', `data-id="${e(x.id)}"`, '')}</div>` : ''}`;
    const status = pending ? badge(x.challenge ? '自动通过争议' : x.appealKind === 'first-review' ? '首份证明复核' : '拒绝申诉', 'warning') : badge('已裁决', 'success');
    return `<article class="task-row"><div class="row-head"><h3>${title}</h3>${status}</div>${detail ? verdictBlock(x) : ''}${info}${detail ? decision : `<a class="text-button" href="#admin/appeal/${e(x.id)}">查看申诉详情</a>`}</article>`;
  }
  function render(s, { section: tab, id, query }, h) {
    const { e, icon, fmt, badge, button, taskBadge, empty, proofBlock, history } = h;

    const queue = s.submissions.filter(x => x.status === 'appealed' || x.challenge?.status === 'pending');
    if (tab === 'review') return h.review(M.task(s, id), 'admin');
    if (tab === 'user') {
      const u = M.user(s, id), risk = M.publisherRisk(s, id);
      const body = `<article class="task-row"><p>可用积分 ${M.fmtPoints(u.available)}</p><p>发布审核拒绝率 ${risk.reviewed ? Math.round(risk.rate * 100) + '%' : '暂无审核记录'}，违规 ${u.violations} 次</p>${userActivity(s, u, h)}${u.role !== 'admin' ? button('管理权限与积分', 'admin-user', `data-id="${e(u.id)}"`) : ''}</article><h2>参与记录</h2>${submissionList(s, s.submissions.filter(x => x.userId === id), h)}`;
      return internalPage('users', '用户管理', u.nickname, body, h);
    }
    if (tab === 'appeal') {
      const x = s.submissions.find(entry => entry.id === id && (entry.status === 'appealed' || entry.challenge?.status === 'pending' || entry.verdict));
      return internalPage('appeals', '申诉队列', '申诉详情', x ? appealCard(s, x, h, true) : '<div class="callout">此申诉已处理或不存在。</div>', h);
    }
    if (tab === 'submission') {
      const x = M.sub(s, id), t = M.task(s, x.taskId);
      const body = `<p><a href="#admin/review/${e(t.id)}">查看本任务全部提交</a></p>${h.reviewSubmission(t, x, t.publisherId === s.currentUserId, true)}`;
      return internalPage('submissions', '全部提交', '提交记录 · ' + t.title, body, h);
    }
    const check = M.assertState(s);
    let body = '';
    if (tab === 'appeals') {
      const resolved = s.submissions.filter(x => x.verdict).sort((a, b) => b.verdict.at - a.verdict.at);
      body = (queue.length ? queue.map(x => appealCard(s, x, h)).join('') : empty('当前没有待处理申诉', '这里会显示拒绝申诉、首份证明复核和自动通过争议。', 'admin/tasks', '查看全部任务'))
        + (resolved.length ? `<h2>已裁决</h2>${resolved.map(x => appealCard(s, x, h)).join('')}` : '');
    }
    else if (tab === 'submissions') body = submissionList(s, s.submissions.filter(x => x.submittedAt != null || x.type === 'experiment'), h);
    else if (tab === 'tasks') {
      const status = query.get('status') || '';
      const rows = s.tasks.filter(t => !status || t.status === status).slice().reverse();
      body = `<div class="filters"><label for="admin-status">任务状态</label><select id="admin-status" name="adminStatus"><option value="">全部状态</option>${[['open', '招募中'], ['settling', '待结算'], ['closed', '已结束'], ['removed', '已下架']].map(([value, label]) => `<option value="${value}" ${value === status ? 'selected' : ''}>${label}</option>`).join('')}</select></div>${rows.map(t => `<article class="task-row"><div class="row-head"><h3><a href="#admin/review/${e(t.id)}">${e(t.title)}</a></h3>${taskBadge(t)}</div><p>发布者 ${e(M.user(s, t.publisherId).nickname)}，${M.taskType(t) === 'experiment' ? `已预约 ${M.taskSubs(s, t.id).length} / ${t.quota} 位` : `已收 ${M.approved(s, t)} / ${t.quota} 份`}，剩余招募预算 ${M.fmtPoints(t.escrow)} 分</p><p>截止 ${fmt(t.deadline)}，${M.taskType(t) === 'experiment' ? '任务报告' : '链接报告'} ${t.reports.length} 次</p>${t.removalReason ? `<p>下架原因：${e(t.removalReason)}</p>` : ''}<div class="actions">${t.status !== 'removed' ? button('强制下架', 'admin-remove', `data-id="${e(t.id)}"`, 'danger') : ''}${['open', 'settling'].includes(t.status) && !t.stopped ? button('延长截止时间', 'admin-extend', `data-id="${e(t.id)}"`) : ''}<a class="text-button" href="#admin/review/${e(t.id)}">${M.taskType(t) === 'experiment' ? '查看预约记录' : '查看提交记录'}</a></div></article>`).join('') || empty('这个状态下没有任务', '换一个状态查看。', 'admin/tasks', '查看全部任务')}`;
    } else if (tab === 'users') {
      const users = s.users.slice().sort((a, b) => +M.publisherRisk(s, b.id).high - +M.publisherRisk(s, a.id).high);
      body = `<p class="small muted">发布审核拒绝率 = 该用户发布的问卷中曾被拒绝的提交数 ÷ 曾通过或被拒绝的提交数。待审不计入；申诉改判后仍保留历史拒绝记录。高于 50% 且至少拒绝 3 份时，触发发布者风险保护。</p>${users.map(u => {
        const risk = M.publisherRisk(s, u.id);
        return `<article class="task-row"><div class="row-head"><h3><a href="#admin/user/${e(u.id)}">${e(u.nickname)}${u.sample ? '（示例同学）' : ''}</a></h3>${badge(u.banned ? '已封禁' : risk.high ? '高风险发布者' : u.restrictedUntil > s.now ? '限制发布中' : '正常', u.banned ? 'error' : risk.high ? 'warning' : '')}</div><p>可用 ${M.fmtPoints(u.available)}</p><p>发布审核拒绝率 ${risk.reviewed ? Math.round(risk.rate * 100) + '%（' + risk.rejected + ' / ' + risk.reviewed + ' 份）' : '暂无审核记录'}，违规 ${u.violations} 次；注册 ${fmt(u.createdAt)}</p>${u.claimRestrictedUntil > s.now ? `<p>限制领取至 ${fmt(u.claimRestrictedUntil)} · 因 3 次提交未按要求填写，暂时无法领取新问卷</p>` : ''}${userActivity(s, u, h)}${u.role !== 'admin' ? `<div class="actions">${button('管理权限与积分', 'admin-user', `data-id="${e(u.id)}"`)}</div>` : ''}</article>`;
      }).join('')}<h2>管理员操作留痕</h2>${s.audit.slice().reverse().map(a => `<p class="small muted">${fmt(a.at)} ${e(M.user(s, a.userId).nickname)}：${e(a.operation)}，${e(a.reason)}</p>`).join('') || '<p class="small muted">暂无用户管理操作。</p>'}`;
    } else if (tab === 'overview') {
      const submitted = s.submissions.filter(x => x.submittedAt), approved = submitted.filter(x => x.status === 'approved'), rejected = submitted.filter(x => x.history.some(h => h.action === '拒绝')), appeals = submitted.filter(x => x.history.some(h => h.action === '申诉')), reviewed = submitted.filter(x => x.history.some(h => ['通过', '拒绝', '管理员裁决'].includes(h.action))), completed = s.tasks.filter(t => t.status === 'closed' && M.approved(s, t) > 0).length;
      const mean = reviewed.length ? reviewed.reduce((sum, x) => sum + Math.max(0, (x.history.find(h => ['通过', '拒绝', '管理员裁决'].includes(h.action))?.at || x.resolvedAt) - x.submittedAt), 0) / reviewed.length / M.HOUR : null;
      const rate = (n, d) => d ? Math.round(n / d * 100) + '%' : '暂无样本';
      const data = [['注册 / 7 日活跃', `${s.users.length} / ${s.users.filter(u => u.lastActiveAt >= s.now - 7 * M.DAY).length}`, '示例账户纳入统计'], ['发布 / 已闭环', `${s.tasks.length} / ${completed}`, `闭环率 ${rate(completed, s.tasks.length)}；结束且至少通过一份`], ['平均首次审核', mean === null ? '暂无样本' : mean.toFixed(1) + ' 小时', '从提交到首次处理'], ['拒绝率 / 申诉率', `${rate(rejected.length, reviewed.length)} / ${rate(appeals.length, submitted.length)}`, '全站拒绝率 = 曾被拒绝 ÷ 已审核（含管理员裁决）；申诉率 = 曾申诉 ÷ 已提交'], ['系统积分 / 应有总量', `${M.fmtPoints(check.total)} / ${M.fmtPoints(check.expected)}`, '系统在账积分（可用 + 未结清招募预算）= 启动积分 + 调账净额'], ['领取未提交', rate(s.submissions.filter(x => !x.submittedAt).length, s.submissions.length), '含等待提交、超时释放及取消'], ['发布后无人领取', rate(s.tasks.filter(t => !s.submissions.some(x => x.taskId === t.id)).length, s.tasks.length), '用于定位冷启动卡点']];
      const sourceDemo = s.tasks.find(t => t.isSourceDemo);
      const demo = sourceDemo ? `<a class="btn secondary" href="#admin/review/${e(sourceDemo.id)}">查看来源核对示例</a>` : button('添加来源核对示例', 'create-source-demo');
      body = `<section class="task-row"><h2>来源核对演示</h2><p>按需添加一份本地示例，占用小林 80 分演示招募预算。</p>${demo}</section><div class="callout">积分守恒校验通过。以下全部由当前演示记录计算，不代表真实用户运营数据。</div><dl class="stats-grid">${data.map(([label, value, note]) => `<div class="stat ${label.includes('系统积分') ? 'stat-healthy' : label.includes('拒绝率') || label.includes('领取未提交') ? 'stat-attention' : ''}"><dt>${label}</dt><dd class="number">${e(value)}</dd><small>${note}</small></div>`).join('')}</dl><div class="panel"><h3>先验证三个问题</h3><ol><li>20 人一周内是否至少完成 5 个任务闭环？</li><li>审核纠纷率是否低于 20%，且没有人因此退出？</li><li>新用户能否在 30 秒内理解“答题赚积分，再发问卷”？</li></ol><p class="small muted">真实访谈与试用需由团队组织；此处仅提供观察框架，不伪造验证结果。</p></div>`;
    } else body = empty('没有这个管理页面', '请选择上方管理功能。', 'admin/overview', '返回后台看板');
    return `<div class="admin-workspace"><div class="page-heading"><div><h1>管理员工作台</h1><p>让每一次互助，都有一个公平的结果。</p></div>${badge('模拟管理员', 'info')}</div><div class="time-bar"><span>${icon('clock')} 演示时间：${fmt(s.now)}（相对现实前移 ${s.timeOffset / M.HOUR} 小时）</span>${button('推进时间', 'time')}</div><nav class="tabs admin-tabs" aria-label="管理员工作区">${[['overview', '数据看板'], ['appeals', '申诉队列' + (queue.length ? `（${queue.length}）` : '')], ['tasks', '任务管理'], ['users', '用户管理'], ['submissions', '全部提交']].map(([value, text]) => `<a href="#admin/${value}" ${tab === value ? 'aria-current="page"' : ''}>${text}</a>`).join('')}</nav><p class="admin-caption small muted">申诉裁决、任务下架、权限与积分管理、运行数据，都在这里处理。当前为本地演示，不涉及真实账户。</p>${body}</div>`;
  }
  function judgeModal(s, id, h) {
    const x = M.sub(s, id), challenge = x.challenge?.status === 'pending';
    if (!challenge && x.status !== 'appealed') return;
    const { e, fmt } = h;
    const t = M.task(s, x.taskId);
    const at = challenge ? x.challenge.at : x.appealedAt;
    const reason = challenge ? x.challenge.reason : x.appealReason;
    const status = challenge ? '发布者对自动通过申请介入' : x.appealKind === 'first-review' ? '首份证明等待管理员复核' : '答题者申诉中';
    const summary = `<div class="callout verdict-summary"><dl><div><dt>任务</dt><dd>${e(t.title)}</dd></div><div><dt>奖励</dt><dd>${M.fmtPoints(t.reward)} 分</dd></div><div><dt>发布者</dt><dd>${e(M.user(s, t.publisherId).nickname)}</dd></div><div><dt>答题者</dt><dd>${e(M.user(s, x.userId).nickname)}</dd></div><div class="verdict-summary-wide"><dt>当前状态</dt><dd>${status}${at ? `（${fmt(at)} 申请）` : ''}</dd></div><div class="verdict-summary-wide"><dt>申请理由</dt><dd>${e(reason || '未记录')}</dd></div></dl></div>`;
    const choices = (challenge ? ['dismiss', 'reverse'] : ['win', 'uphold', 'remove']).map(code => {
      const { label, effect } = M.VERDICTS[code];
      return `<label class="verdict-choice"><input type="radio" name="verdict" value="${code}" required><span><strong>${e(label)}</strong><small class="muted">${e(effect)}</small></span></label>`;
    }).join('');
    h.modal('作出管理员裁决', h.dialogForm('judge', id, `${summary}<fieldset class="verdict-options"><legend>裁决结果</legend>${choices}</fieldset>${h.reasonField('写清依据，答题者和发布者都会看到这句话。')}`, '确认裁决'));
  }
  function userModal(s, id, h) {
    h.modal('管理' + M.user(s, id).nickname, h.dialogForm('manageUser', id, `<label class="field"><span>管理操作</span><select name="operation"><option value="restrict">限制发布</option><option value="ban">封禁账号</option><option value="restore">解除封禁和发布限制</option><option value="flag">记录一次违规</option><option value="adjust">积分调账</option></select></label><label class="field"><span>限制天数（限制发布时生效）</span><input type="number" name="days" min="1" max="30" value="7"></label><label class="field"><span>调账积分（可保留一位小数，正数增加，负数扣除）</span><input type="number" name="amount" value="0" min="-10000" max="10000" step="0.1" inputmode="decimal"></label>${h.reasonField('说明依据，此操作将保留管理员记录。')}`, '确认管理操作'));
  }
  root.CampusAdmin = { render, judgeModal, userModal };
})(globalThis);
