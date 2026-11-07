# 05：五任务标准化新建

Status: pending-business-validation
Blocked by: None
start_head: 609206f02a3f10f7abd743961541e97e18643447

现行范围以用户已确认五任务、work/base-ux-20260908/step1/business_design_v3.json 与五任务模板与最小字段方案.md 为准。旧01 Ticket的十一任务已被本Ticket取代，保留为历史未完成记录，不迁移历史实例。

可观察结果：战役名称、人工选定负责人、开始时间齐备后，从唯一入口生成五任务并真实回读；重复不重建，部分失败可补齐，人工任务人员和日期不覆盖；初始化成功不推进业务阶段。

- [ ] v3 三项前提和环境校验先于任何锁版/初始化写入，历史空环境不推断正式。
- [ ] 合法新记录空初始化状态不漏队，日常入口自动赋环境不增加人工必填。
- [ ] 十四字段模板内容绑定不可变 Release，5任务/5里程碑/4边/1根。
- [ ] 正确版本、关联、环境、依赖；T3→T4及T3→T5，无T4→T5硬依赖。
- [ ] 缺项零写入；重复、部分失败恢复；已有人/日期/业务阶段保护。
- [ ] 独立候选真实初始化入口UAT、写后回读及隔离验证。
- [ ] 候选提交、Standards/Spec双轴审查、completion commit及不可变bundle证据。

测试 seam：通过网关公开读写、orchestrator.execute及真实serve单轮入口观察Base结果；针对重复/外部失败注入做行为测试。这是技术实现职责，不改变业务规则。

所有权：主代理gateway/配置映射/本Ticket及真实UAT；marketing_scope_review独占orchestrator及v3新测试；report_standards_review独占step3/release-candidate；native_capability_audit独占step3/entry-candidate。既有12个dirty基线见step3/baseline.json，不整包提交；与本Ticket重叠的修改只提交相对此基线的窄差异。

授权边界：受控UAT仅战役与任务，不创建物料、不发群消息或卡片、不调用旧任务回调、不更改Bridge冻结包。初始化与后续业务链验收分开，final_accepted不可继承旧版true。旧云端锁版停用后由独立初始化入口唯一承接；未完成日常入口切换不能宣称上线。

## 当前状态：2026-09-09 r4 工程完成，待业务验证

S1/S2 已修复；工程提交 `18d17364660f077b62e4e5d3cf2a3392f6e978a3` 已受控集成并实际部署，start_head 不变。247 项回归通过；Standards 独立审查通过，Spec 作者复核及独立关键行为核验通过。证据：`step3/fix-r4/final-validation/validation.json`、`step3/code-review-r4/`、`step3/commit-preparation/integration-r4/integration-r4-result.md`。

升级后独立验收 39 项通过，历史账本完整保留，同一战役五任务及字段不变，已装包绑定上述提交。新 worker 五轮自然扫描均未发现待处理项，只证明该窗口运行健康及未重复生成任务，不构成 r4 新建 0→5 或主动重试 5→5 验证。证据：`step3/fix-r4/live-upgrade/independent-acceptance-r4.md`；旧正常流程验收继续只作历史证据。

剩余业务门禁：三题表单真实 API 提交已验，人工浏览器表单体验仍 pending；Ticket 和整个项目不能标记 done。`final_accepted`、`business_workflow_enabled`、`production_ready` 均保持 `false`。第四阶段隔离按钮入口已执行前三案，第四案未开始；最新进度与失败以 `docs/agents/issue-tracker.md` 顶部 run-05 检查点为准，不继承旧锁屏状态。不重建已有表单或战役，不重复集成、部署或 bootstrap。

## 历史检查点：2026-09-09 r3 审查收口（已由上述 r4 状态取代）

以下“未集成／未部署／边界待修／无 completion commit”均为当时快照，不作为当前状态或待执行指令。

候选提交 `ddc5fd8590d343a93b320c7436c0e8777739bf4a`，固定起点不变；独立工作树 `step3/commit-preparation/staging-r3` 干净，主分支尚未集成、无completion commit。冻结39文件变更绑定166项已通过测试，精确证据见 `step3/commit-preparation/staging-r3-commit-verification.json`。不是未提交草稿，也不是最终完成版。

真实正式验收已收齐：`step3/daily-live-r1/acceptance-result.json` 为ok=true，独立审查10项满足；本场0→5→5、完整回读一致、同worker历史9个成功周期、原账本5行逐字段保留且仅新增1条成功操作。表单证据为真实API提交，不是浏览器人工操作；本轮未重做线上验收。日常运行包和服务已经安装启动，不重复操作；历史健康证据不代表当前实时健康。

Standards轴通过，0硬性违规、0需列报smell。待修业务边界：①日常队列发现后环境改为UAT，service未绑定入口环境，orchestrator可能以新UAT作为本轮基准继续初始化；②单条空版本且已有任务的记录在自动锁版时抛错，整轮候选发现退出，阻断其他健康战役。第二项已由真实gateway/poller纯内存反例复现，外部调用0。完整两轴报告位于 `step3/code-review-r3/`；既有166项通过不覆盖这两个新增反例。

Spec轴已收齐，结论changes_required，2项重要且阻塞；作者复核并有独立关键分支核验，不能表述为完全独立Spec审查。状态保留in-progress；完成门被上述缺口阻断，暂不关闭或集成候选。后续在干净候选基础修复并提交，只重开受影响验证、审查与部署对应证据；旧成功验收保留为r3正常流程历史证据。三项业务完成标记继续false。第四阶段尚未实现，本轮仅收口及交接，不新建飞书文档。精简恢复入口：`work/base-ux-20260908/营销战役下一任务交接-20260909.md`。

## 历史记录：日常表单提交及服务启动过程（已完成，不重放）

唯一 UAT `recvuDRBfCGDnB` 两轮真实验收通过，禁止重建；0→5→5、任务 ID 不变、复跑无 create/update。相关213项初始化及13项入口测试既有证据继续有效。五任务/四依赖/一根/五里程碑及人工人员日期保护已通过UAT。

三必填表单 `vewgNU4UI5` 已创建并回读，恰好战役名称、负责人、开始时间三题且全部必填；保留原30字段。分享要求租户登录，匿名关闭。唯一默认值为数据环境=正式，原6条历史记录环境不变。入口：https://vm94j8bzy7.feishu.cn/share/base/shrcnmpmpNFSiOtYEESWHjZzEUe 。

真实表单已成功提交且已回读唯一正式验收记录 `rec2896cZmJu9e`，名称【验收专用】三项表单自动新建·20260908。禁止重复提交。`step3/daily-live-r1/before.json`证明三项前提齐全，环境正式、0任务、版本/Release/初始化状态空。`queue-before-start`完整7条，只此1条正式；其余4 UAT和2空环境不进入日常队列。

日常候选锁 SHA256 `45fb46190c7fd81cd2b0a561b2d4fe8b8de7002312fea64e0da3c2b87944bef5`，与已验UAT同源。2026-09-08已在原唯一安装根完成锁内安装；旧账本quick_check=ok、字节未变，备份在`step3/daily-install/installed-backup-r1/`。安装后静态verify通过。唯一label于UTC 15:50:59启动，回执`step3/daily-live-r1/service-start.json`及`service-bootstrap-result.json`。**已启动，不得再次bootstrap。**

当前正在收集首轮及跨完整周期复跑的正式回读、健康日志与旧账本5条保护证据。随后进行候选提交与Standards/Spec双轴审查。初始化通过不代表业务链完成；final_accepted、business_workflow_enabled、production_ready继续false。旧Workflow保持disabled，不发送消息卡片，不调用旧任务回调、不改Bridge冻结包。所有step3相对路径根为`work/base-ux-20260908/step3`。
