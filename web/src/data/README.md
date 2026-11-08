# 数据层接口说明（给重写页面的 agent）

页面**只从 `data/api.ts` import**（类型从 `data/types.ts`），不要直接 import `store.ts`、`mock.ts`、`rules.ts` 等内部文件。依据 `docs/PRD.md` v1.1，下表「PRD」列是对应小节。

## 先读这几条

1. **时间**：所有时间字段都是 ISO（UTC）字符串。页面显示一律用 `lib/time.ts`（`fmtDate`、`fmtTime`、`fmtDateTime`、`fmtDue`、`fmtCountdown`、`fmtFull`、`fmtCn`、`fmtWeekday`），不要截取 ISO 字符串（`scripts/check-rules.mjs` 会查）。工作日相关用 `lib/workday.ts`（见文末）。
2. **现在**：`now()` 固定为演示时刻北京时间 2026-11-05 周四 10:24。所有「今天」「逾期」「本周」都按它算。
3. **重渲染**：组件里先调 `useDataVersion()`，任何写操作之后页面自动重算。读函数返回的是内存里的活对象，**页面不要直接改它们**，一律走写操作。
4. **写操作**：失败时 `throw new Error('中文提示')`，页面 `try/catch` 后把 `e.message` 直接给用户看（toast）。成功后会自动追加事件、重新推算待办。
5. **身份**：原型没有登录，用 `demoUserFor(role)` 取演示身份：管培生 = 林夏、带教 = 周颖、管理员 = 常浩、同事 = 何安。每个读函数凡是需要按权限裁剪的都要传 `viewer: User`。
6. **可见性**（PRD 4.4）：多人视图里看不到的条目由数据层**直接不返回**，不是置灰；页面不要自己再判断一遍角色，按返回结果画即可。需要按钮显隐时用 `canReview`、`canSeePrivate` 等。
7. **日程项、待办、指标都是查询**：页面不存、不缓存，直接调函数。
8. **A 级数据走后端**（PRD v2.0）：`api.ts` 转出 `server.ts`——`view('todo')` 等查询（`GET /api/views/…`）、`command('C02', {...})` 等命令（`POST /api/commands/:id`）、演示登录 `fetchMe` / `fetchIdentities` / `demoLogin` / `demoLogout`。失败抛 `ServerError`（`message` 是后端给的中文原因，`status` 区分 401 / 403 / 404）。登录身份从 `useSession()` 的 `actor` 取，不再用第 5 条的 `demoUserFor`（只留给 B 级旧页面）。

## 示例数据要点（mock.ts，全部是示例）

| 项 | 内容 |
|---|---|
| 期次 | 2026 秋季班（`c-2026a`），模板 `pt-1` v1.0（已绑定，只读），09-10 开学 → 2027-03-19 |
| 管培生 | 林夏 `u-lin`、许诺 `u-xu`、赵一然 `u-zhao`、陈默 `u-chen`、孟川 `u-meng`、宋知 `u-song` |
| 带教 | 周颖 `u-zhou`（客户线：客服、销售站带教）、吴桐 `u-wu`（老师线：教研、教学站带教）；**市场线（内容、投放）故意不设站带教 → 落给管理员** |
| 主带教 | 只有林夏设（周颖）；其他人不设 = 管理员常浩 `u-chang` 担任 |
| 其他人 | 何安 `u-he`（同事，已分配）；白露 `u-bai`（新登录、未分配 → R01） |
| 路径 | 入职 09-10—09-16；通识 09-17—10-14（跨中秋、国庆）；轮岗 6 段，每段两周、周四开站：10-15、10-29、**11-12**、11-26、12-10、12-24；定岗 2027-01-07 起 |
| 轮岗冲突 | 第 3 段销售挤 2 人（林夏、赵一然）、内容空岗；第 5 段内容挤 2、教学空；第 6 段教学挤 2、销售空 |
| 日历 | 2026 中秋 09-25、国庆 10-01—10-07 放假；09-27（日）、10-10（六）调休上班；2027 元旦 |
| 周期任务 | 周报每周日 22:00（机器人收）；轻测轮岗期每周四 20:00（机器人写成绩）；月度营销物料每月末 22:00（本人声明 + 管理员确认）；日报规则存在但停用 |
| 团队活动 | 4 条，来自共享「管培生活动」飞书日历（只读）：10-29 读书会（已挂回放）、11-12 陈默分享会、11-19 周颖分享会、11-26 轮岗中期路演 |
| 连接状态 | 飞书日历同步出错（演示 R12）；知识库二期；多维表格迁移过渡期 |

演示时刻的典型局面：林夏今天有轻测、明天交「一周来电归因复盘」、话术录音等周颖点评、11-12 换到销售站；孟川试讲复盘已逾期、上一站客服岗小结周颖还没评（刚交接出去）；许诺第 44 周周报没交；陈默推文需修改（修改截止 11-06）；吴桐欠一份许诺教研站的交接要点；管理员有 13 条待办。

## 类型（types.ts）

| 类型 | 说明 | PRD |
|---|---|---|
| `Role`、`ROLE_LABEL` | 管培生 / 带教人 / 管理员 / 同事 | 2 |
| `User` | 人。`mentorId` 是**兼容字段**（当前站的站带教，推算填入）；新页面用 `currentStation()` / `mainMentorOf()`。`stoppedAt` = 中止培养 | 2、9 |
| `Cohort`、`COHORT_STATUS_LABEL`、`RosterEntry` | 期次与预置名单 | 4.1 |
| `PathTemplate`、`Stage`、`Module`、`TaskTemplate`、`DeadlineRule` | 路径模板（带版本、`frozen` 只读）、阶段、模块（岗位，`line` 业务线）、任务模板（`deadline` 截止规则、`days` 建议用时·工作日） | 4.1 |
| `PersonalPath`、`Station`、`StationTimePos`、`STATION_POS_LABEL` | 个人路径（`mainMentorId` 可空）与站（`stationMentorId` 可空，带教关系唯一来源；`preparedAt` 换站接人已准备） | 4.1 |
| `RecurringRule`、`Frequency`、`CompletionMode`、`COMPLETION_LABEL` | 周期任务规则与四种完成方式：`link` 提交链接、`bot-weekly` 机器人收周报、`bot-quiz` 机器人写成绩、`declare` 本人声明 + 管理员确认 | 4.2 |
| `TaskInstance`、`TaskStatus`、`STATUS_LABEL` | 任务实例。`openAt` 开放日、`dueAt` 截止（调整后）、`originalDueAt` 原截止、`reviseDueAt` 修改截止、`quizResult` 轻测成绩或「未答」。**逾期不是状态**，用 `isOverdue()`；**负责带教不存**，用 `responsibleMentorId()` | 4.2 |
| `Submission` | 提交（`version`、`channel` 网页/机器人、`changeNote` 再交说明） | 4.2 |
| `Review`、`Grade`、`GRADES` | 点评三档 | 4.2 |
| `HandoverNote` | 交接要点（最多 3 条） | 4.3 |
| `EventLog`、`EventType`、`EventSource`、`Visibility` | 事件日志（只追加） | 9 |
| `Todo`、`TodoRule`、`TODO_RULE_LABEL`、`TodoStatus` | 待办；`cc` 抄送，`escalated` 超时转管理员 | 3.4 |
| `ScheduleItem`、`ScheduleKind`、`ScheduleShape` | 日程项（时段 `span` / 截止 `deadline` / 时刻 `moment`），`ref` 指回所属对象，`source` 推算/规则/飞书 | 3.3 |
| `TeamEvent`、`TeamEventType` | 团队活动（飞书只读） | 7 |
| `Asset`、`AssetType`、`AssetStatus` | AI 资产 | 6 |
| `Announcement`、`Resource`、`Integration`、`IntegrationLevel`、`FeedItem`、`Contribution` | 公告、资料卡、连接状态、动态、贡献 | 3.1、5、7、8 |
| `WorkdayEntry` | 工作日日历的一天（假期或调休） | 4.1 |

## 读：人、期次、模板

| 函数 | 用途 | PRD |
|---|---|---|
| `useDataVersion(): number` | 组件订阅数据变化 | — |
| `now(): string` | 当前时间（演示时刻） | — |
| `demoUserFor(role: Role): User` | 演示身份 | — |
| `userById(id): User` / `findUser(id?): User \| undefined` | 取人 | 2 |
| `listUsers()` / `trainees()` / `activeTrainees()` / `mentors()` | 全部人 / 管培生（含已中止）/ 在培管培生 / 带教 | 2 |
| `adminId(): string` | 管理员 id（负责人为空时落给他） | 3.4 |
| `isStopped(userId): boolean` | 是否中止培养 | 3.4 |
| `isActiveThisWeek(u: User): boolean` | 本周是否活跃 | 13 |
| `cohortsAll()` / `cohortById(id?)` | 期次 | 4.1 |
| `pathTemplatesAll()` | 路径模板各版本 | 4.1 |
| `stagesAll()` / `stageById(id)` | 阶段（按序） | 4.1 |
| `modulesAll()` / `moduleById(id)` / `modulesOf(stageId)` / `rotationModules()` | 模块；轮岗六个岗位 | 4.1 |
| `templateById(id?)` / `templatesOf(moduleId)` | 任务模板 | 4.1 |
| `recurringRulesAll()` / `ruleById(id?)` | 周期任务规则 | 4.2 |
| `workdayCalendar(): WorkdayEntry[]` | 工作日日历（假期、调休） | 4.1 |
| `totalDays(): number` | 模板全程天数（191） | 3.1 |

## 读：路径与站

| 函数 | 用途 | PRD |
|---|---|---|
| `pathOf(userId): PersonalPath \| undefined` | 个人路径 | 4.1 |
| `stationsOf(userId): Station[]` / `stationById(id?)` / `allStations()` | 站 | 4.1 |
| `currentStation(userId, at?)` / `nextStation(userId, at?)` | 当前所在站 / 下一站 | 3.1 |
| `prevStation(s)` / `nextStationOf(s)` / `stageOfStation(s)` | 相邻站、所属阶段 | 4.1 |
| `stationTimePos(s, at?): 'upcoming' \| 'current' \| 'left'` | 站的时间位置（待开始 / 在站 / 已离站） | 9 |
| `stationSettle(s): { passed, total }` | 站结清（本站路径任务已通过 / 总数） | 9 |
| `stationMentorOf(s): string` | 站的负责带教（空 = 管理员） | 4.1 |
| `mainMentorOf(userId): string` | 主带教（空 = 管理员） | 2 |
| `currentPosition(userId)` | `{ station, module, stage, rotation, rotIndex, week, next, stationMentorId, mainMentorId }`：首页、看板用的当前位置 | 3.1 |
| `stationsProgress(userId)` | `{ stations: [{ station, module, pos, settle, settled }], next }`：轮岗六站区分「时间到了」和「已结清」 | 3.1 |

## 读：任务、提交、点评

| 函数 | 用途 | PRD |
|---|---|---|
| `taskById(id)` / `tasksOf(userId)` / `stationTasks(stationId)` | 任务（按截止排序）。`tasksOf` 不做权限裁剪，给本人页面用 | 4.2 |
| `visibleTasksOf(viewer, userId)` | 查看人看得到的任务；其他管培生、同事拿到空数组 | 4.4 |
| `weekTasksOf(userId, offset = 0)` | 某周（按生效截止）的任务 | 3.1 |
| `taskDetail(taskId, viewer)` | 任务详情：`{ task, owner, station, module, template, rule, statusLabel, quizResult, overdue, effectiveDueAt, responsibleMentorId, canSee, canReview, readOnly, submissions, reviews, dueAdjustments, lastNudge, canNudge, assets, resources }`；无权看任务状态时返回 `null`，私密部分已裁掉 | 4.2、4.4 |
| `stationOfTask(task)` | 任务所属站（周期任务取截止那天的站） | 4.2 |
| `responsibleMentorId(task)` | 负责带教：路径 = 站带教，周期 = 主带教，物料 = 管理员，空都落管理员 | 4.2 |
| `effectiveDue(task)` | 生效截止（需修改看修改截止） | 4.2 |
| `isOpen(task)` / `isDelivered(task)` / `isOverdue(task, at?)` | 未结 / 已交 / 逾期标记（轻测未答不算逾期） | 4.2 |
| `taskStatusLabel(task)` | 按完成方式的状态文字：周报「已交 / 未交 / 逾期未交」、轻测「待作答 / 85 分 / 未答」、物料「未声明 / 待确认 / 已确认 / 已退回」 | 4.2 |
| `submissionsOf(taskId)` / `latestSubmission(taskId)` / `reviewsOf(taskId)` | 提交、点评（新的在前）。不裁剪，详情页用 `taskDetail` | 4.2 |
| `latestReviewOf(userId, viewer?)` | 最近一条点评（传 viewer 则按可见性过滤） | 3.1 |
| `pendingReviews(viewer)` | 等待点评队列 = 名下未关闭的 R02（管理员看全部）：`[{ todo, task, owner, sub, dueAt, late }]`，按离超时排序 | 3.1 |
| `dueAdjustmentsOf(taskId)` | 截止调整留痕（事件，`payload` 含 `from`、`to`、`reason`） | 4.2 |
| `lastNudge(taskId)` / `canNudgeNow(taskId)` | 最近一次催办 / 24 小时内能否再催 | 3.4 |
| `FEISHU_DOC: RegExp` | 飞书链接校验（表单即时提示用） | 4.2 |

## 读：可见性（PRD 4.4）

| 函数 | 用途 |
|---|---|
| `canSeePrivate(viewer, taskOrUser, at?)` | 产出与点评能不能看：本人、管理员、主带教全看；站带教自开站前 5 个工作日起看本站和此前各站，离站后保留，看不到之后的站 |
| `canReview(viewer, task)` | 能不能点评、改截止（负责带教或管理员） |
| `isReadOnlyFor(viewer, task, at?)` | 看得到但只读（此前各站） |
| `canSeeTaskStatus(viewer, userId, at?)` | 任务名称、状态、逾期标记：本人、相关带教、管理员；其他人只看站级 |
| `canSeeAssessment(viewer, userId)` | 考核（轻测成绩等）：本人、主带教、管理员 |
| `canSeeHandover(viewer, note, at?)` | 交接要点：相关带教、管理员（不给本人） |
| `isRelatedMentor(viewer, userId, at?)` / `stationWindowStart(s)` | 是否相关带教人 / 站带教可见窗口起点（开站前 5 个工作日） |
| `canSeeEvent(viewer, e)` | 事件能不能看（时间线用） |

## 读：待办（PRD 3.4）

| 函数 | 用途 |
|---|---|
| `todosOf(userId, status = 'open')` | 某人的待办（负责的 + 抄送的），按优先级、期限排序；`status` 可传 `'done' \| 'cancelled' \| 'all'` |
| `allTodos(status = 'open')` | 全部待办（管理员「待处理」全局视图） |
| `todoById(id)` / `isTodoLate(todo, at?)` | 取一条 / 是否过期限 |
| `homeFocus(viewer): Todo[]` | 首页焦点两条：管培生按「已逾期 > 需修改 > 今天的测验 > 今明截止 > 换站预告」；带教、管理员先已超时，再按期限 |

待办字段：`rule`（R01–R12，文字用 `TODO_RULE_LABEL`）、`title`（已拼好的中文）、`subjectType` + `subjectId`（点开跳回：`task` → 任务详情，`station` → 轮岗排期抽屉或个人档案，`asset` → 资产审核，`user` → 成员与角色，`integration` → 连接状态）、`personId`、`ownerId`、`dueAt`（R01、R10、R11 期限待定，为空）、`cc`、`escalated`。

一期 12 条规则怎么生成、谁负责、期限、何时关闭，见 PRD 3.4 表；实现在 `rules.ts` 的 `deriveCandidates`。负责人为空落管理员；同一 rule + subject + owner 只一条未关闭；站带教更换时这一站未关闭的 R02、R06、R08、R09 改派。

## 读：日程（PRD 3.3、4.5）

| 函数 | 用途 |
|---|---|
| `weekRange(offsetWeeks = 0, at?)` | 北京时间某周 `[周一 00:00, 下周一 00:00)` |
| `myWeek(userId, viewer = 本人, offsetWeeks = 0)` | **我的本周**：`{ range, days: [{ date, startAt, workday, holiday, isToday, items }], items, spans, station, module, weekInStation, nextStation }`。`days[].items` 是落在当天的截止和时刻（含团队活动）；`spans` 是站、任务开放期、假期等横条 |
| `myMentees(viewer, offsetWeeks = 0)` | **我带的人**（两周）：`{ range, days, groups: { current, incoming, handedOff } }`，每行 `{ user, group, station, module, items, openTodos }`；组名文字用 `MENTEE_GROUP_LABEL` |
| `mentorSummary(viewer)` | 带教首页标题的数：`{ current, incoming, incomingAt, leftoverUnreviewed }`（在带 N 人 · 某日到站 N 人 · 上一站还有 N 份没评） |
| `rotationPlan()` | **轮岗排期**：`{ weeks, periods, byPerson, byModule, byMentor, stats: { crowded, empty }, switches, assessments, holidays }`。`byPerson` 每人每站色块（`module.line` 着色）；`byModule` 每岗每段几人（`crowded` 挤岗、`empty` 空岗）；`byMentor` 每位带教每段带几人（`mentorId: null` = 未指定，由管理员接）、`max` 峰值；`switches` 换站日；`assessments` 阶段评估节点；`holidays` 假期灰带 |
| `personSchedule(userId, viewer, range)` | 某人一段时间内查看人看得到的日程项（上面几个视角的底层） |
| `teamCalendar(year, month)` | **团队活动**月视角：飞书活动、换站日（`换站日 · N 人`）、周报截止、假期 |
| `teamEventsAll()` / `teamEventById(id)` / `nextTeamEvent(at?)` | 团队活动列表（飞书只读） |

日程项点开跳回 `ref`：`task` → 任务详情，`station` → 站，`teamEvent` → 活动（「在飞书中打开」），`stage` → 阶段，`calendar` → 那一天。颜色看 `kind` 和 `status`（`overdue`、`missed`、任务状态）。

## 读：指标（PRD 13）

| 函数 | 用途 |
|---|---|
| `onTimePassRate({ asOf?, weeks = 4 }?)` | **路径任务按期达标率**：`{ n, N, rate, pending, firstRoundN, adjusted: { count, by }, rows, windowStart, windowEnd }`。`rate` 为整数百分比，`N = 0` 时 `null`；显示「n/N」与「待定 pending」；`rows[].verdict` 为 `hit / miss / pending` 供明细 |
| `onTimePassTrend(count = 4)` | 滚动四周趋势点 `[{ asOf, n, N, rate }]`，最后一点是现在 |
| `classify(task, asOf?)` | 单条任务的判定（明细用） |
| `progressOf(userId)` | 两个进度数：`{ time: { day, total, pct }, completion: { passed, due, all, pct }, gap }`；`gap` = 已通过 − 应完成（负数表示落后几条） |
| `planGap()` | 计划进度差距（全员）：`{ rows, avgTimePct, avgCompletionPct, behind, gapTotal }` |
| `weeklyActiveCount()` / `newAssetsThisMonth()` / `assetNonAuthorUsers()` | 本周活跃人数 / 本月新上架资产 / 资产被非作者使用的人数（按「我用过」自报） |

## 读：看板、档案、动态、贡献

| 函数 | 用途 | PRD |
|---|---|---|
| `boardRows(viewer)` | 带教看板：`[{ user, station, module, stationMentorId, mainMentorId, progress, weekDone, weekTotal, lastReview, overdue, myTodos, prevHandover }]`；带教只看相关的人，管理员看全部 | 3.3 |
| `handoverCard(userId, viewer)` | 档案顶部交接卡：历次站的交接要点 `[{ station, module, note }]` | 3.2 |
| `handoverOf(stationId)` / `handoverDueAt(stationId)` | 某站的交接要点 / 交接要点期限（站后 2 个工作日） | 4.3 |
| `timelineOf(userId, viewer)` | 成长时间线：`[{ event, text }]`，按查看人权限过滤 | 3.2 |
| `feedList(limit = 20): FeedItem[]` | 团队动态 = 事件日志的公开投影（资产上架、公告等） | 7 |
| `eventText(e)` | 事件的中文描述 | 9 |
| `contributionsOf(userId)` / `leaderboard()` | 贡献（资产上架、主讲且已挂回放）/ 贡献榜（一期按条数） | 8 |
| `announcementsAll()` / `latestAnnouncement()` | 公告 | 7 |
| `resourcesAll()` / `resourcesForModule(moduleId?)` | 资料卡 | 5 |
| `integrationsAll()` | 连接状态（`level: ok / warn / error / off`） | 3.1 |

## 读：AI 资产（PRD 6）

`ASSET_TYPES`、`ASSET_TAGS`、`assetById(id)`、`uses(asset)`（使用人数）、`listAssets({ type?, tag?, q?, status? })`（默认只列上架的，按使用人数排序）、`assetsBy(userId)`、`assetsForTemplate(tpl?)`（任务推荐资产）、`tasksUsingAsset(assetId)`、`validateSkillMd(text): string | null`（SKILL.md 校验，返回错误文字）。

## 读：AI 接入（PRD 15，`aiAccess.ts`）

管理后台「AI 与接入」页的配置，工作台自己不调用 AI，所以全是说明性常量：`AI_DEFAULT_EXECUTOR`（`null` = 不调用 AI，页面不出切换）、`AI_EXECUTORS`（Claude、Codex，状态「未启用」）、`AI_FEATURES`（功能清单：读什么 / 谁做 / 写到哪 / 谁能看到，`outside` 标工作台外的一段）、`AI_OPEN_APIS`（带教机器人接口，密钥只有 `keyConfigured`）、`AI_DATA_OBJECTS`。改这里要同步 PRD 第 15 节和 AGENTS.md「AI 接入」，`aiAccess.test.ts` 会查功能名。

## 写操作（每个都会追加事件日志、重新推算待办）

| 函数 | 谁能做 / 校验 | PRD |
|---|---|---|
| `startTask(taskId, actor)` | 本人点「开始」（到开放日也会自动转进行中） | 4.2 |
| `submitTask(taskId, { url?, note?, changeNote? }, actor)` | 本人；只收飞书链接；**再交必须写 `changeNote`**；周报、轻测不能在网页交；物料声明链接可选 | 4.2 |
| `reviewTask(taskId, grade, comment, actor)` | 负责带教或管理员；物料只管理员确认；评「需改进」自动给修改截止（+3 个工作日） | 4.2 |
| `adjustDue(taskId, newDueAt, reason, actor)` | 负责带教或管理员；**必须写原因**，留原截止；需修改时改的是修改截止 | 4.2 |
| `undoDueAdjust(taskId, actor)` | 管理员撤销最近一次调整 | 4.2 |
| `nudgeTask(taskId, actor)` | 负责带教、主带教或管理员；同一任务 24 小时内只能催一次 | 3.4 |
| `writeHandover(stationId, points, actor)` | 原站带教或管理员；1–3 条，再写覆盖 | 4.3 |
| `markStationPrepared(stationId, actor)` | 新站带教点「已准备」（关闭 R06） | 3.4 |
| `postponeStation(stationId, workdays, reason, actor)` | 管理员；已开始的站只顺延结束日，之后各站一起后移；未开始的任务按新日期重排、留痕 | 4.1、4.5 |
| `swapStations(stationIdA, stationIdB, reason, actor)` | 管理员；两站都未开始，交换时间段，任务随站重排 | 4.1、4.5 |
| `changeStationMentor(stationId, mentorId \| undefined, reason, actor)` | 管理员；换站带教或后补，未关闭的 R02、R06、R08、R09 改派 | 4.2 |
| `setMainMentor(userId, mentorId \| undefined, actor)` | 管理员；空 = 管理员担任 | 2 |
| `stopTraining(userId, reason, actor)` | 管理员；中止培养，待办撤销、指标剔除 | 3.4、13 |
| `setRole(userId, role, actor?)` | 管理员指定角色（关闭 R01） | 2 |
| `firstLogin(openId, name): User` | 模拟首次飞书登录：预置名单里的人直接成为管培生，否则是同事（进 R01） | 2 |
| `submitAsset(input, author)` / `resubmitAsset(assetId, patch, author)` | 提交资产（Skill 校验 SKILL.md）/ 退回后修改再交 | 6 |
| `reviewAsset(assetId, approve, reason?, actor?)` | 管理员审核：通过上架（写公开事件、记贡献）/ 退回要写原因 | 6 |
| `toggleFav(assetId, user)` / `toggleUsed(assetId, user)` | 收藏 / 「我用过」 | 6 |
| `publishAnnouncement(title, body, actor)` | 管理员发公告 | 7 |
| `setIntegrationStatus(id, level, detail)` | 连接状态变化（出错 → R12，恢复 → 关闭） | 3.4 |
| `botReceiveWeekly(taskId, url?)` / `botWriteQuiz(taskId, result)` | 模拟机器人写回周报、轻测成绩（含「未答」） | 10 |
| `addTemplate` / `updateTemplate` / `removeTemplate` / `moveTemplate` | 编辑任务模板；**已绑定期次的版本只读会报错**，先另存新版本 | 4.1 |
| `saveTemplateAsNewVersion(templateId, actor)` | 另存新版本（阶段、模块、任务模板一起复制，可编辑） | 4.1 |
| `setNow(iso)` / `resetDemo()` | 演示与测试用：改「现在」/ 恢复示例数据 | — |

## 内部函数（页面不要调）

`syncAll`、`syncTodos`、`syncDerived`、`deriveCandidates`、`reassignStationTodos`、`seedEvents`：写操作内部会自动调用。

## 兼容（components/Layout.tsx、ui.tsx 正在用，名字和行为保持不变）

`useDataVersion`、`userById`、`demoUserFor`、`listAssets`、`pendingReviews(viewer)`（返回数组，元素多了 `todo`、`dueAt`、`late`）、`tasksOf`、`isOpen`、`isOverdue`、`weekTasksOf`、`STATUS_LABEL`、`ROLE_LABEL`、`User.mentorId`。

## 已移除的旧导出（旧页面里还在用，重写时换成新的）

| 旧 | 新 |
|---|---|
| `timeProgress(userId)` | `progressOf(userId).time` |
| `moduleState(userId, moduleId)` | `stationTimePos(station)` + `stationSettle(station)`，或 `stationsProgress(userId)` |
| `onTimeRate(offset)` | `onTimePassRate()`（口径已改为 PRD 13 新口径） |
| `setMentor(userId, mentorId)` | `changeStationMentor` / `setMainMentor` |
| `assignRotation(...)` | `postponeStation` / `swapStations` / `changeStationMentor` |
| `calendarOf(userId)` | 跟岗、1:1 一期不进工作台；用 `myWeek` / `myMentees` |
| `nextEvent` | `nextTeamEvent()` |
| `botStatus` | `integrationsAll()` |
| `canSeePrivate(viewer, owner, mentorIds)`（types.ts） | `canSeePrivate(viewer, taskOrUser)`（api） |
| `PersonalPath.modules`、`TaskInstance.mentorId` | `PersonalPath.stations`、`responsibleMentorId(task)` |

## lib/workday.ts（工作日工具，页面也可用）

`bjYmd(iso)` 北京时间日期 `YYYY-MM-DD`；`bjHm(iso)`；`atBj(ymd, 'HH:mm')` 转 ISO；`isWorkday(ymd, cal)`；`addWorkdays(iso, n, cal)`（保留时分，n 可为负）；`shiftWorkdays(ymd, n, cal)`；`workdaysBetween(fromIso, toIso, cal)`；`rollToWorkday(ymd, ±1, cal)`；`addDays`、`daysBetween`、`weekdayOf`、`mondayOf`、`calendarEntry(ymd, cal)`。`cal` 传 `workdayCalendar()`。
