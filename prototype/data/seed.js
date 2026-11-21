(function (root) {
  const M = typeof module !== 'undefined' && module.exports ? require('./points.js') : root.CampusModel;
  const TOPICS = ['校园生活', '学习研究', '实习就业', '消费习惯', '身心健康'];
  const AUDIENCES = ['全校同学', '大一', '大二', '大三', '大四', '研究生', '有实习经历', '计算机学院', '经管学院'];
  const samples = [
    ['食堂的哪一餐，最合你的胃口？', '校园生活', 3, 10, 8, '全校同学', '想了解大家对食堂口味、价格和营业时间的看法，用于校园服务设计课程作业。'],
    ['大学生使用 AI 学习工具的习惯', '学习研究', 5, 15, 6, '全校同学', '你会在什么学习场景使用 AI？希望听到真实经历，没有标准答案。'],
    ['你的第一段实习，是怎么找到的', '实习就业', 4, 10, 8, '有实习经历', '面向有过实习经历的同学，了解求职渠道和准备过程，用于就业指导课研究。'],
    ['校园二手交易，你在意什么？', '消费习惯', 3, 10, 7, '全校同学', '围绕闲置物品的定价、交接和信任问题，收集产品设计课的前期反馈。'],
    ['早八前一晚，你通常几点睡', '身心健康', 2, 5, 12, '全校同学', '想了解上课安排与作息的关系。不需要填写姓名、学号或健康诊断信息。'],
    ['选修课，你会如何做选择', '学习研究', 3, 10, 8, '大二', '课程信息、兴趣和考核方式，哪个影响最大？欢迎分享真实的选课过程。'],
    ['校园快递最后一公里体验', '校园生活', 2, 5, 10, '全校同学', '关于取件距离、排队和快递柜的简短调查，用于物流管理课程报告。'],
    ['考研与就业，你正在怎样准备', '实习就业', 6, 15, 5, '大三', '希望了解大三同学对未来方向的考虑，所有回答仅用于课程讨论。'],
    ['图书馆里，你喜欢什么样的座位', '校园生活', 2, 10, 8, '全校同学', '调查座位、插座、采光和预约使用的习惯，协助完成空间设计练习。'],
    ['运动搭子会让你更愿意运动吗', '身心健康', 4, 10, 6, '全校同学', '了解校园运动频率以及结伴运动的体验，可跳过不愿回答的问题。'],
    ['数字笔记与纸笔，你怎么选', '学习研究', 3, 10, 7, '全校同学', '想了解不同课程中的笔记方式，帮助设计学习用品的交互原型。'],
    ['一个月的校园消费如何分配', '消费习惯', 5, 15, 5, '经管学院', '只收集消费区间，不要求提供账单、具体收入或任何支付信息。'],
    ['小组作业里，分工是怎么定的', '学习研究', 4, 10, 8, '全校同学', '关于小组协作和沟通方式的课程调研，欢迎有小组项目经验的同学参与。'],
    ['校园咖啡，你为什么买这一杯', '消费习惯', 2, 5, 12, '全校同学', '口味、距离、价格和提神效果，哪个影响你？用于消费者行为课程作业。'],
    ['编程入门，最让你卡住的是什么', '学习研究', 6, 15, 6, '计算机学院', '面向学过编程课程的同学，了解学习难点和求助渠道。'],
    ['毕业季，你会怎样处理闲置书籍', '校园生活', 3, 10, 8, '大四', '捐赠、转卖还是带走？希望了解毕业生处理教材和课外书的方式。']
  ];
  function seed(timestamp = Date.now(), options = {}) {
    const s = { version: 2, sequence: 0, now: timestamp, timeOffset: 0, currentUserId: 'u1', users: [], tasks: [], submissions: [], ledger: [], notices: [], audit: [] };
    const names = ['小林', '阿哲', '管理员', '许嘉宁', '陈沐', '周雨晴', '陆言', '沈悦', '林可', '吴桐', '郑一凡', '江晴', '顾然', '程语', '苏禾', '方知', '何安', '叶青', '赵予'];
    names.forEach((nickname, i) => {
      const id = 'u' + (i + 1), createdAt = timestamp - (16 + i) * M.DAY;
      s.users.push({ id, nickname, role: i === 2 ? 'admin' : 'user', available: 0, frozen: 0, createdAt, lastActiveAt: timestamp - (i % 5) * M.DAY, banned: false, violations: 0, restrictedUntil: null, sample: i > 2 });
      M.entry(s, id, 100, 0, 'grant', '新用户启动积分', null, null, '演示系统'); s.ledger[s.ledger.length - 1].createdAt = createdAt;
    });
    samples.forEach((a, i) => {
      const t = { id: 'sample-' + i, publisherId: 'u' + (i + 4), title: a[0], topic: a[1], minutes: a[2], reward: a[3], quota: a[4], audience: [a[5]], audienceText: a[5], description: a[6], link: 'https://surveys.example/campus/' + (i + 1), status: 'open', escrow: a[3] * a[4], createdAt: timestamp - (i + 1) * 2 * M.HOUR, deadline: timestamp + (3 + i % 5) * M.DAY, stopped: false, removalReason: '', reports: [] };
      s.tasks.push(t); M.entry(s, t.publisherId, -t.escrow, t.escrow, 'freeze', '发布问卷，冻结招募预算', t.id, null, `任务 ${t.id}`);
      // Sample researchers answered one another. Every visible completion is backed by a real ledger transfer.
      for (let j = 0; j < i % 4; j++) {
        const responder = 'u' + (((i + j + 1) % samples.length) + 4);
        const x = { id: M.clone('seed-' + i + '-' + j), taskId: t.id, userId: responder, status: 'approved', createdAt: t.createdAt, submittedAt: t.createdAt + M.HOUR / 4, resolvedAt: t.createdAt + M.HOUR, final: true, automatic: false, screenshot: null, screenshotDeleted: true, note: '示例历史记录', reminded: [], history: [{ action: '通过', reason: '示例已审核记录', actor: t.publisherId, at: t.createdAt + M.HOUR }] };
        s.submissions.push(x); t.escrow -= t.reward;
        M.entry(s, t.publisherId, 0, -t.reward, 'transfer', '示例问卷审核通过', t.id, x.id, M.user(s, responder).nickname);
        M.entry(s, responder, t.reward, 0, 'reward', '示例问卷审核通过', t.id, x.id, M.user(s, t.publisherId).nickname);
      }
    });
    M.assertState(s); return options.includeResearcher ? withResearcher(s) : s;
  }
  function withResearcher(previous) {
    const s = M.clone(previous);
    if (s.users.some(u => u.isDemoResearcher)) return s;
    const id = 'researcher';
    if (s.users.some(u => u.id === id)) throw new Error('研究者演示账号编号冲突。');
    s.users.push({ id, nickname: '研究者·林老师', role: 'user', isDemoResearcher: true, available: 0, frozen: 0, createdAt: s.now, lastActiveAt: s.now, banned: false, violations: 0, restrictedUntil: null, sample: false });
    M.entry(s, id, 100, 0, 'grant', '研究者演示账号启动积分', null, null, '演示系统');
    M.entry(s, id, 2900, 0, 'adjust', '研究者演示额度补足至 3000 分，不代表真实注册奖励', null, null, '演示系统初始化');
    M.assertState(s); return s;
  }
  const api = { seed, withResearcher, TOPICS, AUDIENCES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CampusSeed = api;
})(globalThis);
