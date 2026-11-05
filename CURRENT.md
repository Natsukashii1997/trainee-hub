# 当前状态

更新：2026-11-06。UI 先行：分支 `feat/ui-prototype` 上一期全部页面的前端原型已核对完（示例数据），`npm test`、类型检查、构建都通过，开发端口改为 5320，已提交并开 PR（关联 #1）。唯一下一步：用户在浏览器里过一遍原型，确认后按票逐张接后端。

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
