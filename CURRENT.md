# 当前状态

更新：2026-11-06。需求定稿，一期已拆成 19 张 GitHub issue，未开始编码。唯一下一步：实现 #1 工程骨架（无依赖），用户点名后开工。

## 一期拆票并发布（2026-11-06，Claude，用户同意建私有仓库、建标签、发布 issue；交接未提交、代码未推送、无需发布）

- 时间：开工 `2026-11-06 00:42`（`date '+%F %H:%M'` 记录）。来由：用户要求按 PRD 一期拆 issue 并建仓库。
- 改了哪些文件：本文件；草稿在 `.scratch/phase-1/issues/`（未纳入提交）。外部写入：建私有仓库 `Natsukashii1997/trainee-hub`、5 个分流标签、issue #1–#19（#1–#17 为 ready-for-agent，#18 ready-for-human，#19 needs-info），依赖写在每张 issue 的「Blocked by」。
- 测试：`node --test tests/*.test.mjs` 原样结果 `tests 4 / pass 4 / fail 0`；`node scripts/check-rules.mjs` 未改动代码，未重跑。
- 验证：`gh issue list` 回读 19 张、标签分布 17/1/1；抽查 #14 的依赖为 #6、#8、#13，与草稿一致。
- 截图：无。
- 发布与回读：仓库回读为 PRIVATE；代码未推送。
- 与授权不一致之处、遗留问题、范围外发现：`digital-twin/projects.json` 的登记仍未提交；仓库已存在，可把名册备注里「私有远端待手动创建」一句删掉。
- 本轮新坑：无。

## 项目起步：铺协作骨架并写 PRD（2026-11-06，Claude，用户同意铺骨架、建私有仓库与标签、首次提交；已本地提交、未推送、无需发布）

- 时间：开工 `2026-11-06 00:20`（`date '+%F %H:%M'` 记录）。来由：用「项目起步」（agent-kit 的 `skills/project-starter`）铺协作骨架；需求来自本会话 35 轮问答（grilling）的共识。
- 改了哪些文件：新建 `AGENTS.md`（入口与导航表）、`CURRENT.md`（本文件）、`docs/LESSONS.md`（坑的写法与三级升级）、`docs/OPERATIONS.md`（交接写法、报告与验收）、`docs/templates/handoff.md`（交接骨架）、`docs/agents/`（issue 看板、分流标签、领域文档约定）、`.github/pull_request_template.md`、`tests/handoff-format.test.mjs`（交接格式测试）、`scripts/check-rules.mjs` 与 `tests/check-rules.test.mjs`（通用规则检查及自测）、`docs/PRD.md`（需求与附录 A 视觉规范）、`docs/design/home-01.html`（首页三种角色视觉稿）；目录原本不存在，无已有文件。
- 测试：`node --test tests/*.test.mjs` 原样结果 `tests 4 / pass 4 / fail 0`；`node scripts/check-rules.mjs` 输出 `通用规则检查通过`。
- 验证：只铺文档与测试，无界面代码；视觉稿已在本机 1440×900 预览过三种角色。
- 截图：无。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：GitHub 私有仓库 `Natsukashii1997/trainee-hub` 与 5 个分流标签未建（自动模式权限检查拦截了 `gh repo create`），需常浩手动执行后再加远端；已在 `digital-twin/projects.json` 登记本项目（未提交，该文件原本就有别人的未提交改动）；`scripts/check-rules.mjs` 的 `SCAN` 保持骨架默认的 `src`、`server`，目前没有源码；PRD 第 14 节列了待定事项（维护节奏、积分分值、公司服务器环境、培养路径正式内容、机器人接口字段）。
- 本轮新坑：无。
