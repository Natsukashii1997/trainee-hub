# 当前状态

更新：2026-11-06。原型已按 PRD v1.1 和 V3 柔光重做并推送（PR #20 待合并）；GitHub issue 已按 v1.1 更新（#1、#3–#10、#14–#17 改验收，新开 #21–#26）。唯一下一步：常浩过一遍原型并合并 PR #20，然后从 #1 工程骨架开始逐票接后端（已有会话卡片「后端工程骨架」）。

## 并入 AIBP Desk 资料与三个旧协同项目的提取（2026-11-07，Claude，常浩说「先按我说的做这个调整」：aibp-desk 和工作台合并，三个旧协同项目提取后删除；已提交、PR 待常浩合并、无需发布）

- 时间：开工 `2026-11-07 17:20`（按会话记录估计）。★ 来由：常浩做全量项目盘点后定了去留，aibp-desk 的课件和调研就是工作台「我的」板块的内容；「管培生带教-AI协同」「营销战役AI协同MVP」「营销战役卡片网关」是工作台的一部分。
- 改了哪些文件：`materials/aibp/`（aibp-desk main `b9e76cc` 的内容结构 V3、PR #2 的课件、讲稿、练习册、待补清单、PR #1 的留学行业 AI 全景调研，原样导入，README 写明来源和「未审」状态）；`docs/research/来源项目/`（两份提取.md 和 84 份资产，README 是索引，列出三个待常浩定的缺口）。没改代码，也没改 PRD 正文。
- 测试：`npm test` 原样结果 vitest `Tests 85 passed (85)`、`ℹ pass 4` / `ℹ fail 0`、`通用规则检查通过`（放入全部资料并写完本节后重跑，结果相同）。
- 验证：`内容结构-V3.md` 与 aibp-desk main 逐字节一致（`cmp`）；两份提取由子 agent 写，主会话审过结构，并用 grep 复查 open_id、手机号、secret、sk- 密钥都没有命中，只剩一个测试群 chat_id 和一个机器人 App ID（都是标识，不是凭据）。原项目里的 `.scratch/` 被本仓库 `.gitignore` 忽略，复制时改名为 `assets/_scratch/`。
- 截图：无。
- 发布与回读：无需发布。aibp-desk 的 PR #1、#2 已关闭并留言指向这里，GitHub 仓库已归档，本地目录移到 `~/Archive/repos/待删/aibp-desk`。
- 与授权不一致之处、遗留问题、范围外发现：三个旧项目的目录还没删，因为 ai.lark-channel-bridge.bot.codex（机械邪龙兽 Bridge）和 ai.trainee-collab.worker.codex 正在从那里运行，停不停等常浩定。两份提取都指出了 PRD 的缺口：第 9 节没有「项目」对象；第 10 节的机器人路径指向要删的项目。这两处等常浩定，本票不改。
- 本轮新坑：无。


## GitHub issue 按 PRD v1.1 更新（2026-11-06，Claude，用户同意「现在更新 issue」；交接已本地提交、未推送、无需发布）

- 时间：开工 `2026-11-06 15:20`（`date '+%F %H:%M'` 记录）。来由：PRD v1.1 第 12 节要求改现有票验收、另开新票；#1 还写着 01 器视觉。
- 改了哪些文件：本文件。外部写入：改 issue #1、#3–#10、#14–#17 正文（开头加「v1.1 修订：」一行，#5 改标题为「个人路径、带教关系与「我的路径」」）；新开 #21 工作日日历、#22 期次与期次启动、#23 事件日志与待办、#24 交接要点、#25 日程：我的本周与我带的人、#26 轮岗排期（均 ready-for-agent），旧票「Blocked by」补上新票号。未动 #2、#11–#13、#18、#19。
- 测试：未改代码，未跑。
- 验证：子 agent 起草后写入，`gh issue view` 逐张回读与草稿逐字一致、依赖无环；主会话回读 issue 列表与 #1 正文抽查通过。草稿与原正文备份在 scratchpad（未入库）。
- 截图：无。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：依赖主线由子 agent 定：#3 → #4，#21 → #22 → #23 → #5 → #7 → #6、#8；#25 依赖 #6、#7，#24、#26 依赖 #5。#23 一并承担资产审核的待办规则（R10、R11，因 #11 不在授权范围）。PRD 第 10 节「入库的 FAQ」写接口属二期，未进 #17。
- 本轮新坑：无。

## 原型按 PRD v1.1 与 V3 柔光重做（2026-11-06，Claude，用户选 V3 并同意分批计划「按计划开工」；已提交并推送、PR #20 已更新、无需发布）

- 时间：开工 `2026-11-06 13:40`（`date '+%F %H:%M'` 记录）。来由：常浩选定视觉 V3 柔光，要求按 PRD v1.1 重做原型并补新页面。
- 改了哪些文件：数据层按 v1.1 本体重建（`web/src/data/` 拆成 model、store、generate、rules、visibility、schedule、metrics、actions 等，`README.md` 列全部导出；`web/src/lib/workday.ts` 工作日推算）；V3 设计系统与外壳（`web/src/styles/app.css` 重写、`fonts.css` 加 Manrope、`components/ui.tsx`、`components/schedule.tsx`、`components/Layout.tsx`、`components/README.md`、`pages/Kit.tsx` 组件示例页 `/dev/kit`）；页面全部重写（`pages/Home.tsx`、`Schedule.tsx`、`Todo.tsx`、`Growth.tsx`、`Admin.tsx`、`Team.tsx`、`AI.tsx`、`Misc.tsx`）；`main.tsx` 路由（删 `/admin/assign`，新增 `/schedule/*`、`/todo`、`/growth/handoff/:stationId`、`/admin/cohort|rotation|calendar|rules`、`/dev/kit`）；`ui.tsx` 演示视角支持地址参数 `?as=`；`package.json` 新增 `@fontsource/manrope`（`scripts/check-rules.mjs` 已登记，理由：V3 数字字体）；`docs/PRD.md` 附录 A 改为 V3 柔光规范、文首视觉说明；`AGENTS.md` 导航表与结构；本文件。
- 测试：`npm test` 原样结果：vitest `Tests  85 passed (85)`；`node --test` 为 `ℹ pass 4` / `ℹ fail 0`；`通用规则检查通过`。`npx tsc --noEmit` 无报错；`npm run build` 通过（验证后已删 `dist/`）。
- 验证：分 4 批做，第 1、2 批和第 3 批三组页面由子 agent 并行（文件互不重叠），各自无头截图自检。主会话复核：组件示例页、各组关键截图逐张看过；写了无头 Chrome + 调试协议的扫描脚本，四视角 × 30 个路由共 120 页，查横向溢出、文字溢出、截断、错误边界和控制台报错，修完后只剩登录页装饰光晕超出（不撑宽页面，忽略）。修了「我带的人」和带教首页标签被省略号截断（改为换行）。首页在 1440×900 与 1440×1250 下外壳正常。交互：各组用脚本或 jsdom 测试触发写操作（提交、点评、改截止、交接要点、已准备、催办、审核、轮岗顺延与换带教），`pages/Growth.test.tsx` 收进仓库；主会话未逐个手点。
- 截图：在 scratchpad，未入库。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：①第 1、2 批原说由主会话做数据层，实际也交给子 agent，主会话负责接口约定与审查；②各页面自带 `<style>`（前缀 hm-、sx-、ad-、tm-、ai-、lg-、sn-），建议以后并入 app.css；③数据层建议补：`canSeeHandoverOf`、`reviewDueOf`、`canNudge`、`rotationPlan` 按查看人过滤、建期次与日历与周期规则的写函数（向导「发布」现在只演示）；④带教首页焦点卡「5 天 16 小时」与待点评队列「超时 6 天」取整口径不一致；⑤甘特按周对齐，顺延后不在周四的站显示是近似；⑥改 GitHub issue（PRD 第 12 节）仍未做，待用户同意；⑦用户同意后已推送（e1bf790）并更新 PR #20 标题与说明。
- 本轮新坑：无。

## 需求结构重排与视觉重选（2026-11-06，Claude，用户要求用三步法深挖需求、出新视觉，拍板「B1–B10 全部按推荐」；未提交、未发布代码、报告与视觉稿已发布为 Artifact）

- 时间：开工 `2026-11-06 01:10`（`date '+%F %H:%M'` 记录）。来由：常浩认为原型「不够高级、不够有质感」，且需求结构没理透（例：没有日历视图），要求用落地三步法、开子 agent 自问自答深挖，并优化视觉。
- 改了哪些文件：`docs/PRD.md` 升 v1.1（站带教 / 主带教、期次、顶栏日程与待办、3.3 日程、3.4 十九条待办规则、轮岗排期进一期、任务时间规则、交接要点、跨站可见性、主指标改「路径任务按期达标率」、数据模型 37 个对象、分期与待定事项；附录 A 只加一句「视觉重选中」）；新建 `docs/research/2026-11-06-structure/`（报告、修订提案、对照表、分析脚本、四份角色走查、审查意见、视觉稿 V1/V3/V4/V5/V6 与切换页，README 说明）；本文件。代码未改。
- 测试：`node --test tests/*.test.mjs` 原样结果 `ℹ pass 4` / `ℹ fail 0`；`node scripts/check-rules.mjs` 通过。前端代码未改动，vitest 与 tsc 未重跑。
- 验证：四个子 agent 做角色走查与数据本体（推演，全部标注）；报告 agent 按三步法第二步合成报告；独立审查 agent 抽查 PRD 行号 46 处、代码行号 38 处全部对上，提出必须改 7 条（已改完，主会话抽查唯一约束、对象数 37、颜色变量化通过）。视觉稿六版均由各自 agent 用无头 Chrome 1440×900 截图迭代，主会话逐张看过截图。PRD v1.1 由子 agent 修订，主会话通读第 1–3.4 节和第 12–14 节核对与拍板一致。
- 截图：视觉稿截图未入库，预览见 Artifact：视觉 https://claude.ai/artifact/8gykFkYwrCWXF4gRHNWyfu ，报告 https://claude.ai/artifact/NazBqQ9Y3JNLpjsQeKwegd （仅本人可见）。
- 发布与回读：无需发布（Artifact 为预览）。
- 与授权不一致之处、遗留问题、范围外发现：①业务判断全部来自推演，最需验证的是「每站一位站带教」（PRD 第 14 节已列）；②PRD 第 12 节写了「#3–#10、#14–#17 改验收、另开 6 张新票」，改 GitHub issue 是外部写入，未做，待用户同意；③暗色 V2 已按用户要求撤下；④本机 `.claude/launch.json` 不入库；⑤报告审查建议 S13（站带教一天时间线）、S16.5（热力图）未做，已写进报告局限。
- 本轮新坑：无。

## UI 原型收尾：修自测、逐页核对、修字体与排序行（2026-11-06，Claude，用户同意按三批计划开工、端口改 5320 并开 PR；已提交、已推送分支、无需发布）

- 时间：开工 `2026-11-06 00:55`（`date '+%F %H:%M'` 记录）。来由：上一节遗留的 ①②③④，用户确认「按计划开工」。
- 改了哪些文件：`tests/check-rules.test.mjs`（违规样本从 `src/a.js` 改到 `web/src/a.js`，跟随 `SCAN`）；`web/src/styles/app.css`（`.order-row` 最后一列 64px 改 `auto`，上移/下移两个按钮要 74px，原来溢出）；新建 `web/src/styles/fonts.css`、改 `web/src/main.tsx`（不再直接 import `@fontsource/*` 的 CSS，自写带 `unicode-range` 的 `@font-face`，见 L-01）；`vite.config.ts`（开发端口 5310 改 5320、预览 5311 改 5321，5310 被本机 github-center 常驻服务占用）；`AGENTS.md`「运行」补 `npm install`、`npm run dev`、`npm test`、`npm run typecheck`；`docs/LESSONS.md` 新增 L-01；本文件。本机另建 `.claude/launch.json`（预览用，未纳入提交）。
- 测试：`npm test` 原样结果：vitest `Tests  5 passed (5)`；`node --test` 为 `ℹ pass 4` / `ℹ fail 0`；`通用规则检查通过`。`npx tsc --noEmit` 无报错。`npm run build` 通过，`dist/assets` 含 5 个 woff2（验证后已删 `dist/`）。
- 验证：5310 被占，先用 `npm run dev -- --port 5320` 起服务、改端口后用 `npm run dev` 复核能起，在内置浏览器 1440×900 下核对。四种演示视角 × 24 个路由（含任务、资产、档案详情）加登录页，用脚本查页面横向滚动、元素超出视口、内容溢出和控制台报错：修完后全部为零。排行榜「你」一行宽出 16px 是视觉稿有意的高亮出血，安装命令截断带「复制」按钮也与视觉稿一致，不算问题。交互各点一次：管培生提交产出（空链接被拦下，合法链接提交后状态变「已提交」）、带教人点评「达标」（状态变「已通过」）、管理员审核通过上架、退回（空原因被拦，填原因后退回）、收藏资产（AI 首页出现在收藏里），均有提示、无报错。可见性：同事视角打开林夏的任务只看到「提交内容和点评只对 林夏 本人、带教人和管理员可见」，非管理员进后台看到拦截说明。首页三角色与 `docs/design/home-01.html` 同为 1440×900 截图对照：布局、卡片、配色一致，差别只在示例数据（6 人对 12 人、标题随数据变化）。
- 截图：只在会话里看过，未保存。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：①端口：本机 `cn.github-center.web` 常驻服务占着 5310，用户同意改 5320；②只核对了 1440 宽，1280 下限未专门看；③PR 未合并，等用户确认原型。
- 本轮新坑：L-01。

## UI 先行：一期前端原型（2026-11-06，Claude，用户选「UI 先行」「开发库用本机 PostgreSQL」；未提交、未推送、无需发布）

- 时间：开工 `2026-11-06 00:55`（`date '+%F %H:%M'` 记录）。来由：用户要求先把一期所有页面用前端加示例数据做出来，确认后再逐张票接后端（偏离了 issue 的纵向切法，用户已知情）。
- 改了哪些文件：新建 `package.json`（单包，前端在 `web/`）、`package-lock.json`、`vite.config.ts`（只监听 127.0.0.1:5310）、`tsconfig.json`、`.gitignore`、`web/index.html`、`web/src/`（`styles/app.css` 视觉规范、`lib/time.ts` 北京时间格式化及测试、`data/types.ts` 领域类型与可见性规则、`data/mock.ts` 示例数据、`data/api.ts` 数据访问层、`components/ui.tsx`、`components/Layout.tsx`、`pages/` 下首页三角色加同事、成长四页、AI 四页、团队两页、后台四页、登录与二三期占位页、`main.tsx` 路由）；改 `scripts/check-rules.mjs`（`SCAN` 改为 `web/src`、`server`，`ALLOWED_DEPS` 登记 13 个依赖，理由写在注释里）。
- 测试：`npm test` 原样结果：vitest `Tests 5 passed`；`node --test` 为 `pass 3 / fail 1`，失败项是「通用规则能抓到违规样本，合规样本不误报」，推测是自测仍把违规样本放在 `src/`、而 `SCAN` 已改成 `web/src`，未核实；`check-rules` 对仓库本身通过。`tsc --noEmit` 无报错。
- 验证：未启动开发服务器，未在浏览器核对任何页面。
- 截图：无。
- 发布与回读：无需发布。
- 与授权不一致之处、遗留问题、范围外发现：上下文到 50% 按规定停在干净断点；遗留：①修 `tests/check-rules.test.mjs` 的自测；②`npm run dev` 后在 1440×900 逐页核对（对照 `docs/design/home-01.html`），切四种演示视角；③AGENTS.md「运行」补 `npm run dev` / `npm test`；④提交并开 PR（关联 #1，说明 UI 先行）。示例数据是 6 位管培生，不是视觉稿里的 12 人。
- 本轮新坑：无。

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
