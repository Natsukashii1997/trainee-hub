# 组件用法（V3「柔光」）

给写页面的 agent 用。样子对照 `/dev/kit`（`web/src/pages/Kit.tsx` 就是全套示例代码），视觉来源 `docs/research/2026-11-06-structure/design/v3-home.html`、`v3-cal.html`。

- `ui.tsx`：图标、头像、胶囊、卡片头、页头、分段控件、空状态、数字与进度、指标卡、抽屉、演示视角、轻提示、复制框。
- `schedule.tsx`：竖向日程时间轴、迷你月历、周视图网格、甘特条。
- `Layout.tsx`：外壳（侧栏）和 `<Sheet>`（顶栏 + 二级标签 + 内容），只有它读 data 层。
- 组件只收 props，不读 data 层；时间先用 `lib/time.ts` 格式化成北京时间字符串（或分钟数）再传，不直接截 ISO 字符串。
- 只做 ≥1280px。动效统一 0.2–0.3s，`prefers-reduced-motion` 时全部关掉（已在 app.css 全局处理）。

## 1. Token 与领域色

| 用途 | 变量 |
|---|---|
| 底色 / 玻璃面 / 高亮面 / 卡内白块 / 卡内凹槽 / 深色强调块 | `--bg` `--glass` `--glass-hi` `--well` `--sunk` `--dark` |
| 墨色三级 + 最淡 | `--ink` `--ink2` `--mute` `--faint` |
| 描边 | `--line` `--line2` |
| 强调色 | `--acc` `--acc-ink` `--acc-soft` |
| 领域（主色 / 浅底 / 深色字） | 成长 `--grow*`、带教/日程 `--ment*`、团队活动 `--team*`、考核 `--exam*`、AI `--ai*`、周期（周报等） `--week*` |
| 语义 | 通过 `--ok*`（=成长绿）、提醒 `--warn*`、逾期 `--due*`、信息 `--info*`（=带教蓝） |
| 圆角 | `--r-xs 7` `--r-sm 9` `--r-md 12`（按钮、导航） `--r-lg 16`（卡内块） `--r-xl 22`（卡片） `--r-2xl 24`（侧栏、深色块、抽屉） |
| 阴影 | `--sh`（卡片）+ `--sh-in`（顶部内高光）、`--sh-sm`（选中项）、`--sh-acc`（主按钮）、`--sh-pop`（抽屉） |
| 字号 | `--fs-xs 11` `--fs-s 12` `--fs-m 13`（正文） `--fs-l 14.5`（卡片标题） `--fs-xl 19`（详情标题） `--fs-2xl 24` `--fs-3xl 30`（页标题，300 细体） |
| 字体 | `--sans` Geist Sans（中文回落苹方）、`--num` Manrope（所有数字，类名 `.num`）、`--mono` Geist Mono（代码、指令） |

**领域类 `d-xxx`**：给任意元素加 `d-grow` / `d-ment` / `d-team` / `d-exam` / `d-ai` / `d-week` / `d-acc`，里面就能用 `var(--c)` 主色、`var(--cs)` 浅底、`var(--ci)` 深色字。组件的 `domain` prop 都是这么实现的。

领域用法约定：成长 = 路径任务；带教 = 跟岗、1:1、带教安排；团队活动 = 分享会、读书会；考核 = 轻测、评估；AI = 资产；周期 = 周报等例行项。领域色只用于小面积（图标方块、标签、事件块），大面积用玻璃白。

## 2. 外壳

```tsx
<Sheet crumbs={[{ label: '成长', to: '/growth' }, { label: '我的路径' }]} tabs={[{ to: '/growth/me', label: '我的路径' }, { to: '/growth/board', label: '带教看板' }]} action={<button className="btn pri">…</button>}>
  …页面内容…
</Sheet>
```

| prop | 说明 |
|---|---|
| `crumbs` | 面包屑，自动在前面补「工作台」 |
| `tabs?` | 二级标签（分段样式），`{ to, label, tag? }`，`tag` 如「二期」 |
| `action?` | 顶栏主按钮。不传 = 角色默认（管培生「提交产出」、带教「去点评」、管理员「处理审核」、同事「提交资产」）；传 `null` = 不显示 |

顶栏固定有：演示视角四角色切换、**日程**（今天的项数）、**待办**（未处理数，>0 时强调色）、通知。侧栏：一级导航 6 个（首页、成长、知识二期、AI、团队、激励三期），角色分组（我的 / 带教 / 管理后台四组），底部当前用户。V3 位置：左侧栏、顶部 44px 一行。

> 计数目前用任务近似推算（`Layout.tsx` 的 `useCounts`），数据层改完后换成「未关闭待办数」「今天的日程项数」。

## 3. 页面骨架类

| 类 | 用途 | V3 位置 |
|---|---|---|
| `<PageHead kicker title sub right />` | 页头：日期小字 + 30px 细体标题（`<em>` 强调色）+ 右侧胶囊/按钮。旧类 `.head` / `.ph` 同样式 | 首页「林夏，今天有 2 件事要处理」、日历页「日历」 |
| `.bento` + `.s3…s12` | 12 栏栅格，间距 12px；`.stretch` 撑满行高 | 首页 Bento |
| `.card` | 玻璃卡片，圆角 22、内边距 18/20。变体：`.tight`（16/14）、`.flush`（无内边距）、`.flat`（凹槽）、`.link`（可点，悬停上浮）、`.dark`（深色强调块） | 所有卡片 |
| `<CardHead title sub more={{to,label}}>右侧</CardHead>` | 卡片头（旧类 `.ch` 同样式） | 「今日日程 11.05 周四 · 日历 >」 |
| `.card.focus` > `.row1` / `h3` / `.foot` / `.lbl` | 今日焦点卡 | 首页左上两张 |
| `.sec-l` | 卡内小节标题（左右两端） | 「阶段」「轮岗六站 2/6 已完成」 |
| `.well` | 卡内浅白块 | 「客服岗 · 第 2 周」块 |
| `.rows` > `.rw` | 任务行列表（列宽默认 `28px 1fr 64px 112px 78px`，可 style 覆盖）；`.rw.hl` 高亮行；内含 `.ck`（勾选框 `.on` / `.half`）、`.nm`（`.done`）、`.due`（`.hot`）、`.end` | 「本周任务」 |
| `table.tbl` | 表格（`th` 小字灰、行悬停浅白、`td .s` 副行、`.num` 右对齐） | 后台各表 |
| `.list` > `.li`（`.di` 图标块 + `.tx` + `.end`） | 简单列表 | 团队动态 |
| `.doc` | 资料行（图标方块 + 标题/小字 + 外链图标） | 「客服岗资料」 |
| `.quote` | 点评气泡 | 「最新点评」 |
| `.kv` / `.dl` | 竖排键值 / 左右键值 | 进度卡右侧、详情「说明 / 关联」 |
| `.note`（`.warn` `.due` `.ok`） | 提示条，前面放 `<Icon name="info" />` | — |
| `.reco` | AI 推荐深色块（`.r1` / `h2` + `.kbd` / `p` / `.how` + `<CopyBox>`） | 首页右下 |
| `.field` > `span` + `.input` / `.select` / `.textarea` + `small` / `.errmsg`；`.input.err`；`.form-grid` 两栏 | 表单 | — |
| `.btn` + `.pri` / `.sec` / `.ghost` / `.dark` / `.danger`，尺寸 `.sm` `.xs` `.full` | 按钮 | 「提交产出」「继续写」「开始轻测」 |
| `.tag`（`.on`）、`.typ`、`.kbd`、`.go`、`.pill` | 筛选标签、类型小字、代号、文字链接、玻璃胶囊 | — |
| `.vcol` `.row` `.grow1` `.stack` `.muted` `.divider`（`.dash`） | 布局小工具 | — |

## 4. 组件

### 胶囊与标签（`ui.tsx`）

```tsx
<StatusPill tone="ok" icon="check">达标</StatusPill>   // tone: ok | warn | due | info | acc | plain；dot 前加圆点；size="lg"
<DomainTag domain="exam" />                              // 浅底胶囊，默认文字为领域名；children 可改字
<DomainTag domain="grow" variant="dot">路径</DomainTag>  // 小圆点 + 灰字（任务表「路径 / 周期」）
<Tile icon="quiz" domain="exam" size="lg" />             // 领域色图标方块，size: sm | lg
<MetaPill>第 <b>45</b> 周</MetaPill>                      // 页头右侧玻璃胶囊
```
状态对应：未开始 plain、进行中 acc、已提交 info、需修改 warn、已通过/达标 ok、已逾期 due。旧接口 `StatusChip({task})`、`GradeChip({grade})` 仍可用。

### 头像
`<Avatar name color size? solid? />`（浅底深字；`solid` 实心）、`<AvatarStack people={[{name,color}]} max={3} />`、旧接口 `<Face user />`。

### 数字与进度
```tsx
<Countdown parts={[[9, '小时'], [36, '分']]} label="还剩" />   // Manrope 26px 粗体
<span className="bignum">50<small>%</small></span>
<ProgressBar value={50} domain="grow" width={118} thin? />
<ProgressRing value={32} plan={31} sub="整体完成" size={128} domain="grow" thickness={13} label? />
<PlanKey><span className="num">31%</span></PlanKey>         // 「按计划」图例，和环上白点对应
<PhaseBar phases={[{ name: '入职', state: 'done' }, { name: '轮岗', state: 'cur' }, { name: '定岗', state: 'todo' }]} />
<StationChain stations={[{ name: '教研', state: 'done' }, { name: '客服', state: 'cur' }, { name: '销售', state: 'todo', sub: '11.09' }]} onPick?={i => …} />
<DayStrip total={14} passed={7} />
```
- `ProgressRing`：粗环 + 领域渐变端点；`plan` 在环上画「按计划」刻度点；`size < 100` 自动缩小字号。V3：「我的进度」大环。
- `StationChain` 的 `state`：`done` 已结清（绿勾）、`due` 时间到了但没结清（绿圈）、`cur` 当前站、`todo` 未开始。PRD 要求区分「时间到了」和「已结清」就用 `due`。V3：「轮岗六站」。
- `PhaseBar` V3：「阶段」四格。`DayStrip` V3：「第 8 / 14 天」小格条。

### 指标卡
```tsx
<div className="metrics">   {/* 默认 4 列，style={{'--n': 3}} 改列数 */}
  <Metric label="路径任务按期达标率" value="86" unit="%" icon="check" domain="grow" delta={{ text: '4 pt', dir: 'up' }} trend={[72, 78, 81, 86]} foot="31 / 36 · 滚动四周" right?={…} />
</div>
```
`Sparkline({ values, domain })` 可单独用。管理员首页指标条用这个。

### 抽屉
```tsx
<Drawer open={open} onClose={() => setOpen(false)} title="林夏 · 销售岗" sub="11.09 起 · 2 周" head={<div className="row"><Tile …/><StatusPill …/></div>} footer={<><button className="btn ghost">取消</button><button className="btn pri">保存</button></>} width={420}>
  …内容（表单、.dl 等）…
</Drawer>
```
右侧滑出，Esc / 点遮罩关闭，打开时焦点进抽屉、关闭还给原元素。轮岗排期点色块编辑、日程点条目看详情都用它。

### 其他
- `<Segmented value onChange options={[{ value, label, disabled?, title? }]} label? full? />`：分段控件（顶栏视角切换、日/周/月、按人/按岗位）。`full` 等分铺满（日历「范围」）。
- `<Empty icon="inbox" title="还没有提交" action={<button …/>} size="lg">说明</Empty>`。
- `<CopyBox text="npx skills add …" />`：复制指令框，放进 `.reco` / `.card.dark` 自动变深色。
- `<Icon name size? />`：与 V3 同一套线性图标。可用名：home grow trend cal todo book spark team award user inbox star bm search bell upload check clock right left up down chev x plus arrow copy quiz pen doc file grid ext sync flag link bot eye alert info q shield route swap repeat layers gear gift mega lock trash heart filter more。

### 时间类（`schedule.tsx`）

**Timeline（竖向日程时间轴）** — V3 首页「今日日程」
```tsx
<Timeline fill onSelect?={id => …} items={[
  { id: 't1', start: '09:30', end: '11:30', title: '客服跟岗', sub: '带教安排 · 周颖', domain: 'ment', now: { nowLabel: '10:24', progress: 45, remain: '进行中 · 还剩 66 分' } },
  { id: 't4', start: '20:00', title: '轻测截止', aside: '考核', domain: 'exam', point: true },
]} />
```
`point` 时刻型（菱形节点、单行）；`done` 置灰划线；`fill` 在定高卡里上下撑开。

**MiniMonth（迷你月历）** — V3 日历页左上
```tsx
<MiniMonth year={2026} month={11} today={5} selected={day} marks={[2, 3, 5]} off={[1, 7, 8]} onPick={setDay} onPrev onNext />
```
周一起；选中日（没有就用今天）所在周整行浅底；`marks` 底部小点；`off` 非工作日变淡。自带卡片外框。

**WeekGrid（周视图网格）** — V3 日历页中间，已按要求修：工作日列 1.25、周末 0.6，标题不截断
```tsx
<WeekGrid
  days={[{ key: 'mon', dow: '周一', date: 2 }, …, { key: 'sat', dow: '周六', date: 7, weekend: true }]}   // today / weekend / off（假期斜纹）
  events={[
    { id: 'e1', day: 0, start: 570, end: 690, title: '客服跟岗', time: '09:30–11:30', sub: '周颖', domain: 'ment' },             // 时段型
    { id: 'e10', day: 3, start: 1200, title: '轻测 · 客服话术与流程', time: '20:00', icon: 'quiz', domain: 'exam', tinted: true }, // 截止型（不填 end）
  ]}
  allDay={[{ id: 'rot', from: 0, to: 6, title: '轮岗 · 客服岗 第 2 周', right: '10.29–11.11', icon: 'swap', domain: 'acc' }]}
  now={{ day: 3, minutes: 624, label: '10:24' }}
  selectedId={sel} onSelect={setSel}
  startHour={9} endHour={21} hourHeight={52} weights?={[1.25, 0.6]}
/>
```
- 时间一律用「距 0 点分钟数」；事件按领域着色；同一天重叠的事件自动分列。
- 截止型默认白底小卡，`tinted` 用领域浅底；`done` 灰底划线。
- 高度 < 36px 只显示标题；< 72px 副标题单行省略；标题始终换行显示不截断。
- 选中态：白底 + 领域色描边 + 柔和外发光。当前时间：左侧时间胶囊 + 横跨淡线 + 今天列的强调线。
- 单日的全天项（如周日 22:00 周报）右对齐并允许向左溢出，不被窄列截断。

**Gantt（甘特条，轮岗排期）**
```tsx
<GanttLegend items={[{ label: '进行中', domain: 'acc', kind: 'solid' }, { label: '已排', domain: 'ment' }, { label: '待确认', domain: 'ment', kind: 'plan' }, { label: '换站', kind: 'switch' }, { label: '评估节点', kind: 'eval' }, { label: '假期', kind: 'hol' }, { label: '冲突', kind: 'clash' }]} />
<Gantt
  cols={[{ key: 'w45', label: 'W45', sub: '11.02', current: true }, { key: 'w53', label: 'W53', sub: '12.28', holiday: true }]}
  rows={[{
    id: 'lin', label: '林夏', sub: '带教 周颖', lead: <Avatar name="林夏" color="#3446E0" size="sm" />,
    bars: [{ id: 'lin-kf', from: 2, span: 2, label: '客服', sub: '第 2 周', domain: 'acc', state: 'cur' }],   // state: done | cur | plan
    clashes: [4, 5],                                              // 冲突格（红描边浅红底）
    markers: [{ col: 4, kind: 'switch', label: '11.09 换站' }, { col: 8, kind: 'eval', label: '中期评估' }],
  }]}
  corner="成员" labelWidth={180} colWidth={64} rowHeight={52}
  selectedId={sel} onBarClick={(bar, row) => openDrawer(bar, row)}
/>
```
- 行可以是人 / 岗位 / 带教；「按岗位」「按带教」视角用 `counts`（每列一个数字，`null` 不显示）代替 `bars`，超员格配 `clashes`。
- 列多时横向滚动，行首标签列吸附在左侧。
- 管理员点色块 → `onBarClick` → 在 `<Drawer>` 里改站带教、顺延、换序；带教、管培生只读就不传 `onBarClick`（色块渲染成 div）。
