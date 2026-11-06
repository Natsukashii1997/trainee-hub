# 开发实录与坑

踩过的坑记在这里，Claude 和 Codex 都读。排障、发布、改脚本之前，先搜一遍：`grep -n 关键词 docs/LESSONS.md`；换个项目也成立的坑在全局 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/LESSONS.md`（G-xx），也搜一遍。

## 怎么写

- 每轮交接时自问「本轮踩到新坑了吗」：有就在下面追加一条，并在 CURRENT.md 的交接里写「本轮新坑：L-xx」；没有就写「无」。
- 一条一个坑，编号只增不改。写现象、根因、正确做法、证据。证据写到能查的程度（提交号、文件与章节、证据目录）；查不到就写「未核实」，不编。
- 结论被推翻时改条目并注明日期，不删。

## 怎么升级

- 同类坑第 2 次出现：把正确做法写进 AGENTS.md 或 docs/OPERATIONS.md（一句话硬约束进 AGENTS.md，操作细节进 OPERATIONS.md），条目的「升级」改成写到了哪里。
- 能用机器判定的：写成测试或脚本（如 `scripts/check-rules.mjs`），条目注明。
- 换个项目也成立的（不依赖本项目的业务、页面、发布脚本）：提议提升到全局坑 `/Users/nat/Documents/ChatGPT/个人/work/agent-kit/LESSONS.md`，写成 G-xx；原条目保留，末尾加一行「提升：已提升为全局 G-xx（日期）」。只出提案，用户批准才写。
- 条目超过约 30 条时整理一次：已升级、且之后没再犯的，归档到 `docs/history/`。

---

还没有条目，第一条从 L-01 起，格式：

```markdown
## L-01 <一句话现象>（<YYYY-MM-DD>）

- 现象：
- 根因：
- 正确做法：
- 证据：
- 升级：未升级。
```

## L-01 自托管 Geist 后，中文全角标点变成半角宽（2026-11-06）

- 现象：首页标题「常浩，本周…」里的「，」只有 6px 宽，视觉稿里是 29px；`tsc`、测试、溢出扫描都看不出来，只有对照视觉稿才发现。
- 根因：`@fontsource/geist-sans` 的 `@font-face` 不带 `unicode-range`，Geist 自带一套窄版全角标点（，。：等），在 `--sans` 里排在苹方前面，就把苹方的标点挡住了。视觉稿用的 Google Fonts 只下发 latin 子集，带了 `unicode-range`，所以没这个问题。
- 正确做法：不直接 import `@fontsource/*/400.css`，改在 `web/src/styles/fonts.css` 自写 `@font-face`，`unicode-range` 照 Google Fonts 的 latin 子集限定，让中文和全角标点回落到系统中文字体。以后换西文字体也照这个做。
- 证据：浏览器里量「，」的宽度，修前 6.06px、修后 29.25px，与视觉稿一致；`npm run build` 后 `dist/assets` 里有 5 个 woff2。
- 升级：未升级。

## L-02 macOS 上自起 PostgreSQL，pg_ctl 启动即退出「postmaster became multithreaded during startup」（2026-11-06）

- 现象：`initdb` 成功，`pg_ctl start` 报「无法启动服务器进程」；日志只有 `FATAL: postmaster became multithreaded during startup`，提示设 `LC_ALL`。
- 根因：从 AI 会话、脚本里起的进程 `LANG`、`LC_ALL` 都是空的；postmaster 按空区域设置初始化时会调用系统框架、拉起额外线程，PostgreSQL 检测到多线程就自杀。终端里 `LANG` 通常有值，手动起不出问题。
- 正确做法：脚本启动 `pg_ctl` / `postgres` 时显式传 `LC_ALL`（`scripts/db.mjs` 的 `PG_ENV`，环境里没有就用 `en_US.UTF-8`）。以后装成 launchd 常驻时，plist 的 `EnvironmentVariables` 里也要写 `LC_ALL`。
- 证据：`~/Library/Application Support/trainee-hub/evidence/issue1-工程骨架-20261106/postgres-启动失败.log`；修后 `npm run db:up` 正常启动。
- 升级：未升级（换个项目也成立，可提议提升为全局坑）。
