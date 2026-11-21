# 本地演示模型 v3

所有状态变动进入 `CampusModel.commit(previous, action, timestamp)`，返回新状态，失败抛出明确错误，原状态不变。页面仅在成功写入 localStorage 后替换内存状态。

状态包含 users、tasks、submissions、ledger、notices、audit、currentUserId、now、timeOffset、sequence、version。账号仅为模拟，不提供真实鉴权。

- User：id、nickname、role、available、frozen、createdAt、lastActiveAt、restrictedUntil、banned、violations。
- Task：id、publisherId、title、description、topic、audienceText、audience、minutes、link、reward、quota、escrow、deadline、createdAt、stopped、status、reports、removalReason。
- Submission：id、taskId、userId、status、createdAt、claimUntil、submittedAt、reviewUntil、resolvedAt、appealUntil、screenshot、note、history、final、automatic、reminded、challenge。
- Ledger：id、userId、availableDelta、frozenDelta、delta（可用变动兼容字段）、type、taskId、submissionId、counterparty、note、createdAt。

任务状态：open、settling、closed、removed。提交状态：locked、pending、approved、rejected、appealed、expired、cancelled、overturned。流水同时记录两个口袋，不能只把一列 delta 相加解释为总资产变化。

金额内部使用整数最小单位（1分=10单位）；余额、奖励、任务escrow和流水变动均为单位。发布reward与管理员adjust amount的action输入是显示分，由模型边界校验一位小数后转换一次。显示统一使用fmtPoints。

守恒（单位）：所有可用余额 + 所有冻结余额 = 1000 × 用户数 + 管理员调账净额。研究者初始3000分由100分启动及2900分演示调账组成，均有流水。每个用户余额等于其流水对应口袋之和；每个发布者冻结余额等于其任务 escrow 之和；在途提交的奖励必须被 escrow 覆盖；名额不能超卖。每次 commit 后都检查。

原型 action：switch、tick、advance、publish、claim、submit、review、appeal、challenge、judge、stop、remove、extend、manageUser、report、readNotices。reset 由存储边界重新生成 seed，保证只清除本原型的 key。正式版需要把这些操作迁移到服务端事务，不能直接上线本地模型处理真实数据。

## 对 v2 文档冲突的明确处理

1. 首次发布的首份证明保护优先于验收示例里的“第一份直接拒绝”。首次疑问转交管理员复核，不直接判无效。要演示普通拒绝，先通过首份，再提交第二位同学的证明。
2. 拒绝立即回流名额与“申诉期间保留额度”会产生超卖和申诉赔付缺口。这里拒绝后 7 天保留额度与名额；期满未申诉或管理员维持拒绝才释放。申诉中一直保留。任务停止后也必须等待结清，不提前退款。
3. 下架只取消未提交领取；已通过不回滚，待审和申诉继续处理，之后退剩余积分。“双方退回”指未使用的预算退回，不回收已经有效支付的劳动报酬。
4. localStorage 截图在刷新后保留，界面如实说明；结清 7 天后下次读取惰性删除。申诉未结清不删除。与文档“刷新即消失”的矛盾说法相比，选择可重现、可审核的本地持久化。
5. 模拟时钟只前进，不修改系统时间。3 个工作日是运营处理目标，原型显示已等待时长，不伪装成自动裁决规则；49 小时按钮用于自动审核演示。
6. 自动通过奖励可在 7 天内由发布者提请介入。回滚若遇答题者可用不足则原子失败，保留待处理，不强制制造负余额。管理员需说明调账依据后另行处理，调账始终留痕。
7. 链接只检查格式和规范化查重；原型不声称能检测第三方服务器可达性。提供链接失效报告。

## 新范围与旧数据兼容

标题1～60字，招募数量1～200整数，招募天数1～60整数，奖励5～50分最多一位小数。卡片标题最多两行，详情保留全文。M.migrateState将version2的金额字段乘10，保留任务、身份、证明及历史，version3重复读取不再换算。旧数据不注入研究者账号，避免无提示改变旧账；需要研究者时可重置演示（会清除已有演示数据）。管理员进入审核页时记住后台筛选来源，保留审核权限检查。
