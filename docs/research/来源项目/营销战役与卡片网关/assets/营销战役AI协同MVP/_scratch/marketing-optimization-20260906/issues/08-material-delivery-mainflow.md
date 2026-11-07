# 08｜物料制作、审核与真实交付主流程

状态：in-progress
start_head：8ea10afd51006c816db25992712a987ae2e2086d

## 可观察结果与规格
A 输入正式就绪即可制作，不等待 B；提交当前成果后由本份审核人确认，通过进入待交接。指定交接真实发生并回读一致后完成单份；完整有效应交清单全部交付才完成当前周期唯一 MKT3-005。无需负责人二次签收。依据为 step4-mainflow/review/t5-implementation-plan.md、已确认 business_design_v3.json 与业务设计文档；五任务新口径优先于旧 runtime 的审核即完成。

## 范围及验证边界
新增领域模块、成果适配器、冻结 Engine/Gateway 装配和 launcher；在 MaterialDeliveryFlow 公开接口及既有 handle_callback 上验证 A/B 主流程、审核与交付区别、角色、版本、成果回读和当前周期完整范围。该边界为技术职责，无需重开 Grill。合成测试不外发；真实 UAT 依赖策略生成及用户亲自确认，未验不得声称完成。

## 改动与部署边界
四项既有 dirty 原样保留，hash 见 work/base-ux-20260908/step5-delivery-mainflow/baseline.json。原 Bridge、SQLite 与非 campaign 功能不整包替换。新模块不导入根目录未提交 runtime/config/delivery_contract。实施期间只由根代理准备版本和提交，子任务不部署。未增加新群消息或卡片测试授权。

## 进度
2026-09-09：live 指针复核仍为 .51 launcher；领域模块、成果适配器并行实施，根代理负责 Engine 接线。先正常主流程，特殊测试后移。final_accepted=false；production_ready=false。
