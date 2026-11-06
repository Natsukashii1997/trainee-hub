# 管培生工作台（trainee-hub） 协作约定（Codex / Claude 必读）

管培生团队的工作台：把培养路径、飞书资料、AI 资产与贡献聚合在一处，给管培生、带教人和管理员日常使用，以后可扩展到全公司。进入顺序：本文件 → [CURRENT.md](CURRENT.md)（当前状态与唯一下一步）。需求以 [docs/PRD.md](docs/PRD.md) 为准。所有面向用户的文字用简体中文。本文件只放怎么开始和做什么事之前读哪份；操作细节在 [docs/OPERATIONS.md](docs/OPERATIONS.md)，按需读对应一节。

## 做什么事之前读哪份

| 要做的事 | 先读 |
|---|---|
| 改需求、加功能 | [docs/PRD.md](docs/PRD.md) |
| 做界面、新页面 | [docs/PRD.md](docs/PRD.md) 附录 A 视觉规范（V3 柔光）；[web/src/components/README.md](web/src/components/README.md) 组件用法与示例页 `/dev/kit`；视觉基准 [v3-home.html](docs/research/2026-11-06-structure/design/v3-home.html) |
| 改数据、加规则或查询 | [web/src/data/README.md](web/src/data/README.md)（全部导出与对应 PRD 小节） |
| 排障、改脚本、装 launchd 或定时任务 | 先 `grep -n 关键词 docs/LESSONS.md`，再搜全局坑 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/LESSONS.md` |
| 开需求、拆任务、实现、审查 | 下面「Agent skills」一节 |
| 写交接、验收别人的交接 | [docs/templates/handoff.md](docs/templates/handoff.md) 骨架；[OPERATIONS](docs/OPERATIONS.md)「交接写法」「报告与验收」 |

项目长出接口、样式、发布等文档后，在这张表里加一行。

## 分工

- 以用户每轮明确授权的范围为准；授权外的不做。
- 一次只做一件授权的事；范围外的问题记进交接，不顺手修。
- 并行的会话各开独立 worktree，不在同一目录改代码；做不到时照全局坑 G-04，只提交自己的改动。

## 运行

```sh
npm install                      # 首次装依赖
npm run dev:all                  # 一条命令：数据库（没建就建、没起就起）→ 迁移 → 后端 127.0.0.1:5325 + 前端 127.0.0.1:5320；Ctrl-C 停后端和前端
npm run dev                      # 只起前端（127.0.0.1:5320，/api 代理到后端；后端没起时顶栏显示「后端连不上」）
npm run dev:server               # 只起后端（改代码自动重启）
npm run db:up                    # 建库并启动开发库（幂等）；db:stop 停止；db:migrate 执行迁移（幂等）
npm test                         # vitest + 后端测试（连真测试库，会先 db:up）+ 交接格式 + 通用规则，提交前跑
npm run typecheck                # 前端与后端（server/tsconfig.json）的 tsc --noEmit
node --test tests/*.test.mjs     # 交接格式 + 通用规则（含自测）
node scripts/check-rules.mjs     # 只跑通用规则检查
```

数据库：本机 Homebrew PostgreSQL 16（`brew install postgresql@16`），但不用 Homebrew 的默认实例，`scripts/db.mjs` 给本项目单独建一个：

- 数据目录、日志、连接串都在仓库外的 `~/Library/Application Support/trainee-hub/`（`pgdata/`、`postgres.log`、`db.env`）；首次 `db:up` 时 `initdb` 建库、生成随机密码，建开发库 `trainee_hub` 和测试库 `trainee_hub_test`。
- 只监听 127.0.0.1:5433，不建 Unix 套接字，不装开机自启；电脑重启后再跑一次 `npm run dev:all` 或 `npm run db:up`。
- 连接串从环境变量 `DATABASE_URL`、`TEST_DATABASE_URL` 读；`node scripts/db.mjs exec -- <命令>` 会从 `db.env` 读入后再执行（环境里已设的不覆盖）。手工连库：`node scripts/db.mjs exec -- sh -c 'psql "$DATABASE_URL"'`。
- 迁移放 `server/migrations/NNNN_名称.sql`，按文件名顺序执行，执行过的记在 `schema_migrations`；已执行的迁移不再改，要改表就新加一条。
- 后端测试每次会清空测试库再从头迁移，只对库名以 `_test` 结尾的库这么做。
- Docker Compose 打包留到部署时再做（issue #19、PRD 第 11 节）。

## 结构

```
AGENTS.md            入口（本文件）
CURRENT.md           当前状态与唯一下一步；每轮交接写在顶部
docs/
  PRD.md             需求（共识清单、页面、数据模型、机器人接口、分期；附录 A 是视觉规范）
  design/home-01.html  v1.0 的视觉稿（01 器，已被 V3 柔光取代，仅存档）
  research/          需求研究归档（2026-11-06 结构重排报告、走查、视觉候选稿）
  agents/            Matt Pocock 技能读的约定：issue 看板、分流标签、领域文档
  LESSONS.md         本项目的坑（排障、改脚本前先搜）
  OPERATIONS.md      操作手册：交接写法、报告与验收
  templates/handoff.md  交接一节的骨架
server/              后端（Node + TypeScript，Node 直接跑 .ts，不编译）
  src/               入口 index.ts、HTTP 与来源校验 app.ts、连接池 db.ts、迁移 migrate.ts、测试 *.test.ts
  migrations/        数据库迁移（NNNN_名称.sql）
scripts/
  check-rules.mjs    通用规则检查（只查机器能判定的）
  db.mjs             本机开发库：建、启、停、带连接串执行命令
  dev.mjs            npm run dev:all 一条命令起数据库、后端、前端
tests/               node:test 测试
```

## Agent skills

开发流程用 Matt Pocock skills（`~/.agents/skills/`）：大活走 `to-spec` → `to-tickets` → `implement` / `tdd` → `code-review` → PR；小改（一张 issue、一天内做完）跳过 `to-spec`。Claude 用 `/技能名`，Codex 用 `$技能名`；这几个技能只在点名时加载，不会自动触发。

### Issue tracker

需求、规格与任务用本仓库 GitHub Issues。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个默认分流标签。见 `docs/agents/triage-labels.md`。

### Domain docs

single-context：根目录 `GLOSSARY.md` 与 `docs/adr/`，用到时再建。见 `docs/agents/domain.md`。

改动怎么走、分支怎么起名、交接写在哪、怎么合并：见 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/工程流程.md`。

## 规则

- 验证用的备份、日志等证据放 `~/Library/Application Support/trainee-hub/evidence/`，不放 `/tmp`（全局坑 G-01）；私人数据与完整日志不进仓库。
- 本机服务只监听 127.0.0.1；新增依赖先改 `scripts/check-rules.mjs` 的 `ALLOWED_DEPS`，并在交接里说明理由（`check-rules` 会查）。
- 只做电脑版（≥1280px），不做窄屏适配；要加手机版须用户明确提出。
- 可见性规则（产出、点评、考核只给本人、带教人、管理员）在服务端执行，不能只靠前端隐藏。
- 页面上的时间经统一的格式化函数按北京时间显示，不直接截取 ISO 字符串（全局坑 G-02，`check-rules` 会查）。

## 交接格式

每轮完成后，在 CURRENT.md 顶部新增一节（旧节保留在下面，过长时归档到 `docs/history/`），骨架照抄 [docs/templates/handoff.md](docs/templates/handoff.md)；`tests/handoff-format.test.mjs` 会检查顶部一节有没有日期、「时间：开工」「测试：」「本轮新坑：」三行，新坑编号在 LESSONS 里要存在。每一行怎么写、报告与验收的防伪造五条见 [OPERATIONS](docs/OPERATIONS.md)「交接写法」「报告与验收」；没做就写「未做」。
