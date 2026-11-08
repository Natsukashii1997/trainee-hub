# 07｜主题节奏、应交清单与制作输入正式提交

状态：in-progress
start_head：c41d07dfe42510595e88933cb2e0dc845bfaafd5

## 可观察结果与规格
负责人正式提交整场主题节奏后完成 T3；人工独立提交完整应交清单；逐份制作输入由本份提需人或对接人提交，A 就绪即可制作，全部清单输入就绪才完成 T4。沿用五任务与现有表，不调用 AI 生成主题或物料，不新增群消息。业务依据为交付文档/营销战役协同_业务设计与完成路径_v1_20260908.md、work/base-ux-20260908/step4-mainflow/review/t3-t4-next-slice.md。

## 范围与验证边界
human_submission_flow.py 的 process、StrategyWorker.run_once 和安装器公开 install 接口分别验证提交事实、同一消费者分流、真实按钮配置。该验证边界属于代理技术职责。完整主题和关联数据是处理时固化的版本，不能称为点击瞬间的多行快照。保留策略事实及角色分工；编号由系统生成，用户只填每行一个物料名。

用户已明确主流程优先。可并行实现本切片；在线顺序仍需 Ticket06 的策略真实生成及人工确认。连点、第二账户、平台时间落窗及特殊恢复移后；当前不能代用户批准真实策略，也不能用预置策略绕过模型连接。

## 改动归属
新增人工提交流程、安装器及对应测试；修改 strategy_worker.py、test_strategy_worker.py、manage_strategy_worker.py 以复用同一请求消费者和部署。保留 CONTEXT.md、config.json、v4_runtime.py、test_automation_install.py 原有 dirty，不纳入本次提交。

## 验收状态
代码已提交，消费者已升级，三 Workflow 已启用并绑定回读通过。工程 HEAD 8ea10afd51006c816db25992712a987ae2e2086d；运行包 build b3c14a82cc17df2da4898de935790b26e3a9dbf956579fcf422ad5470b109f8e。证据：work/base-ux-20260908/step4-mainflow/human-enable-live-20260909/manifest.json。相关测试与既有全量异常说明见 review/ticket07-test-assessment.md。视图恢复收口中；真实 T3/T4 纵向业务验收依赖 T2 人工确认，尚未完成。final_accepted=false；production_ready=false。
