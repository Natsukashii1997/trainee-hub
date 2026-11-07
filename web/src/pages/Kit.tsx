import { useState } from 'react';
import { Sheet } from '../components/Layout';
import {
  Avatar, AvatarStack, CardHead, CopyBox, Countdown, DayStrip, DomainTag, Drawer, Empty, Icon, MetaPill, Metric, PageHead, PhaseBar, PlanKey,
  ProgressBar, ProgressRing, Segmented, StationChain, StatusPill, Tile, useToast, type Domain,
} from '../components/ui';
import { Gantt, GanttLegend, MiniMonth, Timeline, WeekGrid, type GanttBar, type GanttCol, type GanttRow, type WeekDay, type WeekEvent } from '../components/schedule';

/* /dev/kit：通用组件示例页。全部用页内假数据，不读 data 层。给页面开发对照 V3 稿用。 */

const H = (hh: number, mm = 0) => hh * 60 + mm;

const DAYS: WeekDay[] = [
  { key: 'mon', dow: '周一', date: 2 }, { key: 'tue', dow: '周二', date: 3 }, { key: 'wed', dow: '周三', date: 4 },
  { key: 'thu', dow: '周四', date: 5, today: true }, { key: 'fri', dow: '周五', date: 6 },
  { key: 'sat', dow: '周六', date: 7, weekend: true }, { key: 'sun', dow: '周日', date: 8, weekend: true },
];
const EVENTS: WeekEvent[] = [
  { id: 'e1', day: 0, start: H(9, 30), end: H(11, 30), title: '客服跟岗', time: '09:30–11:30', sub: '周颖', domain: 'ment' },
  { id: 'e2', day: 0, start: H(18), title: '话术演练录音', time: '已提交', icon: 'check', domain: 'grow', done: true },
  { id: 'e3', day: 1, start: H(10), end: H(11), title: '客服组晨会旁听', time: '10:00–11:00', domain: 'ment' },
  { id: 'e4', day: 1, start: H(15), end: H(16), title: '与周颖 1:1', time: '15:00–16:00', domain: 'ment' },
  { id: 'e5', day: 2, start: H(9, 30), end: H(11, 30), title: '客服跟岗', time: '09:30–11:30', sub: '周颖', domain: 'ment' },
  { id: 'e6', day: 2, start: H(19), end: H(20, 30), title: '读书会', sub: '《非暴力沟通》', time: '19:00–20:30', domain: 'team' },
  { id: 'e7', day: 3, start: H(9, 30), end: H(11, 30), title: '客服跟岗', time: '09:30–11:30', sub: '周颖', domain: 'ment' },
  { id: 'e8', day: 3, start: H(14), end: H(14, 30), title: '与周颖 1:1', time: '14:00–14:30', domain: 'ment' },
  { id: 'e9', day: 3, start: H(16), end: H(17), title: '分享会', sub: '用 Claude 做行业研究', time: '16:00–17:00', domain: 'team' },
  { id: 'e10', day: 3, start: H(20), title: '轻测 · 客服话术与流程', time: '20:00', icon: 'quiz', domain: 'exam', tinted: true },
  { id: 'e11', day: 4, start: H(9, 30), end: H(11, 30), title: '客服跟岗', time: '09:30–11:30', sub: '周颖', domain: 'ment' },
  { id: 'e12', day: 4, start: H(18), title: '一周来电归因复盘', time: '18:00', icon: 'flag', domain: 'grow', tinted: true },
];

const WEEKS: GanttCol[] = ['10.12', '10.19', '10.26', '11.02', '11.09', '11.16', '11.23', '11.30', '12.07', '12.14', '12.21', '12.28'].map((sub, i) => ({
  key: `w${42 + i}`, label: `W${42 + i}`, sub, current: i === 3, holiday: i === 11,
}));
const STATIONS = ['教研', '教学', '客服', '销售', '内容', '投放'];
const bars = (who: string, order: number[], startCol: number, curIdx: number): GanttBar[] =>
  order.map((s, i) => {
    const from = startCol + i * 2;
    const state: GanttBar['state'] = i < curIdx ? 'done' : i === curIdx ? 'cur' : i === order.length - 1 ? 'plan' : undefined;
    return { id: `${who}-${s}`, from, span: 2, label: STATIONS[s], sub: i === curIdx ? '第 2 周' : undefined, domain: (state === 'cur' ? 'acc' : 'ment') as Domain, state };
  }).filter(b => b.from + b.span > 0 && b.from < WEEKS.length).map(b => (b.from < 0 ? { ...b, span: b.span + b.from, from: 0 } : b));
const PEOPLE: GanttRow[] = [
  { id: 'lin', label: '林夏', sub: '带教 周颖', lead: <Avatar name="林夏" color="#3446E0" size="sm" />, bars: bars('lin', [1, 2, 3, 4, 5], -2, 1), markers: [{ col: 4, kind: 'switch', label: '11.09 换站：客服 → 销售' }, { col: 8, kind: 'eval', label: '12.07 轮岗中期评估' }] },
  { id: 'xu', label: '许诺', sub: '带教 周颖', lead: <Avatar name="许诺" color="#5A6577" size="sm" />, bars: bars('xu', [3, 2, 4, 5, 0], 0, 1), clashes: [4, 5], markers: [{ col: 4, kind: 'switch', label: '11.09 换站：客服 → 内容' }] },
  { id: 'zhao', label: '赵一然', sub: '带教 周颖', lead: <Avatar name="赵一然" color="#8A6A3B" size="sm" />, bars: bars('zhao', [4, 2, 3, 5, 0], 0, 1), clashes: [4, 5] },
  { id: 'chen', label: '陈默', sub: '带教 吴桐', lead: <Avatar name="陈默" color="#2E5B4E" size="sm" />, bars: bars('chen', [5, 0, 1, 2, 3], 0, 1), markers: [{ col: 8, kind: 'eval', label: '12.07 轮岗中期评估' }] },
  { id: 'meng', label: '孟川', sub: '带教 吴桐', lead: <Avatar name="孟川" color="#6B4E8A" size="sm" />, bars: bars('meng', [0, 1, 2, 3, 4], 0, 1) },
];
const BY_STATION: GanttRow[] = STATIONS.map((s, i) => ({
  id: s, label: `${s}岗`, sub: '容量 1 人', counts: WEEKS.map((_, w) => ((i + w) % 3 === 0 ? 2 : (i + w) % 3 === 1 ? 1 : 0) || null),
  clashes: WEEKS.map((_, w) => w).filter(w => (i + w) % 3 === 0),
}));

const TASKS = [
  { name: '话术演练录音', dom: 'grow' as Domain, ty: '路径', due: '昨天 18:00', ck: 'on', st: <StatusPill tone="ok">已提交</StatusPill> },
  { name: '轻测 · 客服话术与流程', dom: 'week' as Domain, ty: '周期', due: '今天 20:00', hot: true, hl: true, st: <StatusPill tone="plain">未开始</StatusPill> },
  { name: '一周来电归因复盘', dom: 'grow' as Domain, ty: '路径', due: '明天 18:00', ck: 'half', st: <StatusPill tone="acc">进行中</StatusPill> },
  { name: '第 45 周周报', dom: 'week' as Domain, ty: '周期', due: '11.08 周日', st: <StatusPill tone="plain">未开始</StatusPill> },
  { name: '客服岗小结', dom: 'grow' as Domain, ty: '路径', due: '11.11 周三', st: <StatusPill tone="plain">未开始</StatusPill> },
];

function Sec({ title, code, children }: { title: string; code?: string; children: React.ReactNode }) {
  return <section className="kit-sec"><h2>{title}{code && <code>{code}</code>}</h2>{children}</section>;
}

export default function Kit() {
  const say = useToast();
  const [sel, setSel] = useState('e10');
  const [day, setDay] = useState(5);
  const [ganttView, setGanttView] = useState<'person' | 'station' | 'mentor'>('person');
  const [bar, setBar] = useState<{ bar: GanttBar; row: GanttRow } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [seg, setSeg] = useState<'d' | 'w' | 'm'>('w');
  const selected = EVENTS.find(e => e.id === sel);

  return (
    <Sheet crumbs={[{ label: '开发' }, { label: '组件示例' }]}>
      <PageHead
        kicker={<>11 月 5 日 周四<i aria-hidden="true" />10:24</>}
        title={<>林夏，今天有 <em>2 件事</em>要处理</>}
        right={<><MetaPill>第 <b>45</b> 周</MetaPill><MetaPill>培养第 <b>57</b> / 180 天</MetaPill></>}
      />

      {/* ① 首页卡片组合，对照 v3-home */}
      <div className="bento kit-home">
        <article className="card focus" style={{ gridArea: 'f1' }}>
          <div className="row1"><Tile icon="quiz" domain="exam" /><span className="kind">周期任务 · 考核</span><StatusPill tone="due">今天 20:00</StatusPill></div>
          <h3>轻测 · 客服话术与流程</h3>
          <div className="foot">
            <div><Countdown parts={[[9, '小时'], [36, '分']]} /><div className="lbl">距截止</div></div>
            <button type="button" className="btn pri sm">开始</button>
          </div>
        </article>
        <article className="card focus" style={{ gridArea: 'f2' }}>
          <div className="row1"><Tile icon="pen" domain="grow" /><span className="kind">路径任务</span><StatusPill>明天 18:00</StatusPill></div>
          <h3>一周来电归因复盘</h3>
          <div className="foot">
            <div><span className="bignum">50<small>%</small></span><div className="lbl row"><ProgressBar value={50} width={118} />已完成</div></div>
            <button type="button" className="btn sec sm">继续写</button>
          </div>
        </article>
        <section className="card vcol" style={{ gridArea: 'sch' }} aria-label="今日日程">
          <CardHead title="今日日程" sub="11.05 周四" more={{ to: '/schedule', label: '日程' }} />
          <div className="vcol grow1" style={{ marginTop: 16 }}>
            <Timeline fill items={[
              { id: 't1', start: '09:30', end: '11:30', title: '客服跟岗', sub: '带教安排 · 周颖', domain: 'ment', now: { nowLabel: '10:24', progress: 45, remain: '进行中 · 还剩 66 分' } },
              { id: 't2', start: '14:00', end: '14:30', title: '与周颖 1:1', sub: '带教安排', domain: 'ment' },
              { id: 't3', start: '16:00', end: '17:00', title: '分享会「用 Claude 做行业研究」', sub: '主讲 陈默 · 团队活动 · 飞书日历', domain: 'team' },
              { id: 't4', start: '20:00', title: '轻测截止', aside: '考核', domain: 'exam', point: true },
            ]} />
          </div>
          <div className="divider dash" style={{ margin: '10px 0 0' }} />
          <div className="row" style={{ paddingTop: 12, fontSize: 11.5, color: 'var(--mute)', justifyContent: 'space-between' }}><span>共 4 项 · 已同步飞书日历</span><span>明天 18:00 复盘截止</span></div>
        </section>
        <section className="card vcol" style={{ gridArea: 'prog' }} aria-label="我的进度">
          <CardHead title="我的进度" more={{ to: '/growth/me', label: '成长' }} />
          <div className="row" style={{ marginTop: 14, gap: 14 }}>
            <ProgressRing value={32} plan={31} sub="整体完成" />
            <div className="kv">
              <div><span>按计划</span><b><PlanKey><span className="num">31%</span></PlanKey></b></div>
              <div><span>当前阶段</span><b>轮岗 · 第 3 站</b></div>
              <div><span>下一站</span><b>销售岗</b></div>
            </div>
          </div>
          <div className="sec-l">阶段</div>
          <PhaseBar phases={[{ name: '入职', state: 'done' }, { name: '通识', state: 'done' }, { name: '轮岗', state: 'cur' }, { name: '定岗', state: 'todo' }]} />
          <div className="sec-l"><span>轮岗六站</span><span>2 / 6 已完成</span></div>
          <div style={{ marginTop: 10 }}>
            <StationChain stations={[{ name: '教研', state: 'done' }, { name: '教学', state: 'done' }, { name: '客服', state: 'cur' }, { name: '销售', state: 'todo' }, { name: '内容', state: 'todo' }, { name: '投放', state: 'todo' }]} />
          </div>
          <div className="well" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>客服岗 · 第 2 周</b><span className="num muted" style={{ fontSize: 11.5 }}>10.29–11.11</span></div>
            <div style={{ marginTop: 8 }}><DayStrip total={14} passed={7} /></div>
            <div className="row" style={{ marginTop: 6, justifyContent: 'space-between', fontSize: 11.5, color: 'var(--mute)' }}><span>第 8 / 14 天</span><span>还剩 6 天</span></div>
          </div>
        </section>
        <section className="card" style={{ gridArea: 'tasks', padding: '18px 12px 12px' }} aria-label="本周任务">
          <div style={{ padding: '0 8px' }}><CardHead title="本周任务" sub="W45 · 5 项，已完成 1" more={{ to: '/todo', label: '全部任务' }} /></div>
          <div className="rows" role="table">
            {TASKS.map(t => (
              <div key={t.name} className={t.hl ? 'rw hl' : 'rw'} role="row">
                <span className={t.ck ? `ck ${t.ck}` : 'ck'}>{t.ck === 'on' && <Icon name="check" />}</span>
                <span className={t.ck === 'on' ? 'nm done' : 'nm'}>{t.name}</span>
                <DomainTag domain={t.dom} variant="dot">{t.ty}</DomainTag>
                <span className={t.hot ? 'due hot' : 'due'}>{t.due}</span>
                <span className="end">{t.st}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card" style={{ gridArea: 'rev' }} aria-label="最新点评">
          <CardHead title="最新点评" more={{ to: '/growth/me', label: '全部' }} />
          <div className="row" style={{ marginTop: 14, gap: 10 }}>
            <Avatar name="周颖" color="#8A68DE" />
            <span className="grow1"><b style={{ display: 'block', fontWeight: 600 }}>周颖</b><small className="muted" style={{ fontSize: 11.5 }}>教学岗 · 试讲复盘</small></span>
            <StatusPill tone="ok" icon="check">达标</StatusPill>
          </div>
          <p className="quote">结构清楚，节奏也稳。下次把学生反馈的数据放到最前面，结论会更有说服力。</p>
        </section>
        <section className="card vcol" style={{ gridArea: 'res' }} aria-label="客服岗资料">
          <CardHead title="客服岗资料" sub="当前站" />
          <div style={{ marginTop: 12 }}>
            <a href="#kit" className="doc"><Tile icon="doc" domain="ment" /><span><b>客服 SOP（第 3 版）</b><small>管培生知识库 · 10.21 更新</small></span><Icon name="ext" /></a>
            <a href="#kit" className="doc"><Tile icon="grid" domain="ment" /><span><b>来电问题分类标准</b><small>管培生知识库 · 10.12 更新</small></span><Icon name="ext" /></a>
          </div>
          <div className="row muted" style={{ marginTop: 'auto', paddingTop: 12, fontSize: 11.5, gap: 6 }}><Icon name="sync" size={13} />按当前轮岗站推送</div>
        </section>
        <section className="reco" style={{ gridArea: 'ai' }} aria-label="这一步可以用">
          <div className="r1"><span className="tile"><Icon name="spark" /></span>这一步可以用 · 推荐 AI 资产<span className="for">适合你正在写的<b>一周来电归因复盘</b></span></div>
          <div className="row" style={{ alignItems: 'flex-end', gap: 24 }}>
            <div className="grow1">
              <h2>通话记录归因<span className="kbd">SKILL</span></h2>
              <p>按问题类型、课程、时段归类一周来电，给出前三大原因和原话样例。</p>
            </div>
            <div style={{ borderLeft: '1px solid rgba(255,255,255,.1)', paddingLeft: 20, display: 'grid', gap: 10, width: 188 }}>
              <div className="row" style={{ fontSize: 12, color: '#C9CCE0' }}><Avatar name="陈默" color="#2E5B4E" solid size="sm" />作者 <b style={{ color: '#fff', fontWeight: 500 }}>陈默</b></div>
              <div className="row"><span className="bignum">23</span><small style={{ fontSize: 12, color: '#C9CCE0' }}>人用过</small><span style={{ marginLeft: 'auto' }}><AvatarStack people={[{ name: '赵', color: '#8A6A3B' }, { name: '许', color: '#3C6FB8' }, { name: '周', color: '#7C4FC0' }]} /></span></div>
            </div>
          </div>
          <div className="how">用法：在 Claude Code 里安装后，把导出的来电记录表格拖进对话，说<b>「按问题类型归因」</b></div>
          <CopyBox text="npx skills add trainee-hub/call-attribution" />
        </section>
      </div>

      {/* ② 胶囊、标签、按钮 */}
      <Sec title="状态胶囊（语义色）· 领域标签 · 图标方块 · 按钮" code="StatusPill / DomainTag / Tile / .btn">
        <div className="card stack">
          <div className="kit-row">
            <StatusPill tone="ok" icon="check">已通过</StatusPill><StatusPill tone="info">已提交</StatusPill><StatusPill tone="acc">进行中</StatusPill>
            <StatusPill tone="warn">需修改</StatusPill><StatusPill tone="due">已逾期</StatusPill><StatusPill tone="plain">未开始</StatusPill>
            <StatusPill tone="ok" dot>正常</StatusPill><StatusPill tone="due" dot>同步失败</StatusPill>
          </div>
          <div className="kit-row">
            {(['grow', 'ment', 'team', 'exam', 'ai', 'week'] as Domain[]).map(x => <DomainTag key={x} domain={x} />)}
            <span style={{ width: 12 }} />
            {(['grow', 'ment', 'team', 'exam', 'ai', 'week'] as Domain[]).map(x => <DomainTag key={x} domain={x} variant="dot" />)}
          </div>
          <div className="kit-row">
            <Tile icon="grow" domain="grow" /><Tile icon="cal" domain="ment" /><Tile icon="team" domain="team" /><Tile icon="quiz" domain="exam" /><Tile icon="spark" domain="ai" /><Tile icon="doc" domain="week" />
            <span style={{ width: 12 }} />
            <button type="button" className="btn pri"><Icon name="upload" />提交产出</button>
            <button type="button" className="btn sec">在飞书中打开</button>
            <button type="button" className="btn ghost">取消</button>
            <button type="button" className="btn dark">深色</button>
            <button type="button" className="btn danger">退回</button>
            <button type="button" className="btn pri sm">小号</button>
            <button type="button" className="btn sec xs"><Icon name="plus" />超小</button>
            <button type="button" className="btn pri" disabled>不可用</button>
          </div>
          <div className="kit-row">
            <Segmented label="视图" value={seg} onChange={setSeg} options={[{ value: 'd', label: '日' }, { value: 'w', label: '周' }, { value: 'm', label: '月' }]} />
            <button type="button" className="tag on">全部</button><button type="button" className="tag">行研</button><button type="button" className="tag">客服</button>
            <span className="typ">Skill</span><span className="kbd">SKILL</span><a className="go" href="#kit">查看全部<Icon name="right" /></a>
            <MetaPill>第 <b>45</b> 周</MetaPill>
          </div>
        </div>
      </Sec>

      {/* ③ 指标卡 */}
      <Sec title="指标卡" code="Metric">
        <div className="metrics">
          <Metric label="路径任务按期达标率" value="86" unit="%" icon="check" domain="grow" delta={{ text: '4 pt', dir: 'up' }} trend={[72, 78, 81, 86]} foot="31 / 36 · 滚动四周" />
          <Metric label="计划进度差距" value="-1" unit="天" icon="clock" domain="exam" delta={{ text: '较上周 2 天', dir: 'down' }} foot="6 人平均" />
          <Metric label="本月新上架资产" value="5" unit="个" icon="spark" domain="ai" trend={[1, 2, 2, 4, 5]} foot="待审核 2" />
          <Metric label="本周活跃" value="9" unit="/ 10 人" icon="team" domain="team" delta={{ text: '持平', dir: 'flat' }} />
        </div>
      </Sec>

      {/* ④ 日程：迷你月历 + 周视图 + 详情，对照 v3-cal（周视图工作日 1.25 : 周末 0.6，标题不截断） */}
      <Sec title="迷你月历 · 周视图网格 · 详情" code="MiniMonth / WeekGrid">
        <div className="kit-cal">
          <div className="stack">
            <MiniMonth year={2026} month={11} today={5} selected={day} marks={[2, 3, 4, 5, 6, 8, 11]} off={[1, 7, 8]} onPick={setDay} onPrev={() => say('上个月')} onNext={() => say('下个月')} />
            <div className="card tight">
              <div className="sec-l" style={{ marginTop: 0, padding: '0 4px' }}>范围</div>
              <div style={{ marginTop: 8 }}><Segmented full value="me" onChange={() => {}} options={[{ value: 'me', label: '我的' }, { value: 'mt', label: '我带的人', disabled: true, title: '仅带教人可用' }, { value: 'all', label: '全团队' }]} /></div>
              <div className="sec-l" style={{ padding: '0 4px' }}>图例</div>
              <div className="stack" style={{ gap: 6, marginTop: 8, padding: '0 4px' }}>
                <DomainTag domain="grow" variant="dot">任务截止</DomainTag><DomainTag domain="ment" variant="dot">带教安排</DomainTag><DomainTag domain="team" variant="dot">团队活动</DomainTag><DomainTag domain="exam" variant="dot">考核</DomainTag><DomainTag domain="week" variant="dot">周报</DomainTag>
              </div>
            </div>
          </div>
          <WeekGrid
            days={DAYS} events={EVENTS} selectedId={sel} onSelect={setSel} now={{ day: 3, minutes: H(10, 24), label: '10:24' }}
            allDay={[{ id: 'rot', from: 0, to: 6, title: '轮岗 · 客服岗 第 2 周', right: '10.29–11.11', icon: 'swap', domain: 'acc' }, { id: 'wr', from: 6, to: 6, title: '22:00 周报', icon: 'doc', domain: 'week' }]}
          />
          <aside className="card vcol" aria-label="事件详情">
            {selected ? <>
              <div className="row"><Tile icon={selected.icon ?? 'cal'} domain={selected.domain} size="lg" /><DomainTag domain={selected.domain} /><button type="button" className="btn ghost xs" style={{ marginLeft: 'auto' }} onClick={() => setDrawer(true)}>抽屉中打开</button></div>
              <h2 style={{ marginTop: 14, fontSize: 19, fontWeight: 600, lineHeight: 1.35 }}>{selected.title}</h2>
              <div className="well" style={{ marginTop: 14, padding: 14 }}>
                <div className="row" style={{ fontSize: 12, color: 'var(--exam-ink)', fontWeight: 500, gap: 6 }}><Icon name="clock" size={13} />{selected.time}</div>
                <div style={{ marginTop: 8 }}><Countdown label="还剩" parts={[[9, '小时'], [36, '分']]} /></div>
              </div>
              <div className="dl" style={{ marginTop: 16 }}>
                <div><span className="k">说明</span><span className="v">机器人出题，20 道选择题，限时 15 分钟，成绩自动写回。</span></div>
                <div><span className="k">关联</span><span className="v"><StatusPill tone="info" icon="link">客服岗 · 话术库</StatusPill></span></div>
              </div>
              <div className="stack" style={{ marginTop: 20, gap: 8 }}><button type="button" className="btn pri full">开始轻测</button><button type="button" className="btn sec full"><Icon name="ext" />在飞书中打开</button></div>
            </> : <Empty icon="cal" title="选一条日程">点周视图里的色块看详情</Empty>}
          </aside>
        </div>
      </Sec>

      {/* ⑤ 甘特条：轮岗排期 */}
      <Sec title="甘特条（轮岗排期）· 抽屉" code="Gantt / Drawer">
        <div className="card">
          <CardHead title="轮岗排期" sub="2026 秋季班 · W42–W53">
            <Segmented value={ganttView} onChange={setGanttView} options={[{ value: 'person', label: '按人' }, { value: 'station', label: '按岗位' }, { value: 'mentor', label: '按带教', disabled: true, title: '示例略' }]} />
          </CardHead>
          <div style={{ margin: '12px 0 10px' }}>
            <GanttLegend items={[{ label: '进行中', domain: 'acc', kind: 'solid' }, { label: '已排', domain: 'ment' }, { label: '待确认', domain: 'ment', kind: 'plan' }, { label: '已结束' }, { label: '换站', kind: 'switch' }, { label: '评估节点', kind: 'eval' }, { label: '假期', kind: 'hol' }, { label: '冲突', kind: 'clash' }]} />
          </div>
          {ganttView === 'person'
            ? <Gantt cols={WEEKS} rows={PEOPLE} selectedId={bar?.bar.id} onBarClick={(b, r) => setBar({ bar: b, row: r })} />
            : <Gantt cols={WEEKS} rows={BY_STATION} corner="岗位" />}
        </div>
      </Sec>

      {/* ⑥ 表单、表格、列表 */}
      <Sec title="表单 · 表格 · 列表 · 提示" code=".field .input .select .textarea table.tbl .li .note">
        <div className="bento top0">
          <div className="card s5 stack" style={{ gap: 16 }}>
            <label className="field"><span>标题<em className="req">*</em></span><input className="input" placeholder="例：通话记录归因" /></label>
            <label className="field"><span>类型</span><select className="select" defaultValue="Skill"><option>Skill</option><option>Prompt</option><option>工作流</option></select></label>
            <label className="field"><span>链接</span><input className="input err" defaultValue="https://example.com" /><small className="errmsg">请填飞书文档链接</small></label>
            <label className="field"><span>说明</span><textarea className="textarea" placeholder="一句话说明它解决什么问题" /><small>点评人会先看这里</small></label>
            <div className="note"><Icon name="info" /><span>提交后由<b>管理员</b>审核，一般一个工作日内有结果。</span></div>
            <div className="note warn"><Icon name="alert" /><span>知识库同步 <b>3 小时前</b>失败，资料可能不是最新。</span></div>
          </div>
          <div className="card s7">
            <CardHead title="全员进度" sub="6 人" more={{ to: '/growth/board', label: '带教看板' }} />
            <table className="tbl">
              <thead><tr><th>成员</th><th>当前站</th><th>完成</th><th>状态</th><th className="num">逾期</th></tr></thead>
              <tbody>
                {[['林夏', '#3446E0', '客服 · 第 2 周', 32, <StatusPill tone="ok">按计划</StatusPill>, 0], ['许诺', '#5A6577', '客服 · 第 2 周', 28, <StatusPill tone="warn">落后 2 天</StatusPill>, 1], ['陈默', '#2E5B4E', '教学 · 第 1 周', 35, <StatusPill tone="ok">按计划</StatusPill>, 0], ['孟川', '#6B4E8A', '教学 · 第 2 周', 22, <StatusPill tone="due">逾期 2 项</StatusPill>, 2]].map(([n, c, s, p, st, o]) => (
                  <tr key={n as string} className="clickable">
                    <td><span className="row"><Avatar name={n as string} color={c as string} size="sm" /><b>{n as string}</b></span></td>
                    <td>{s as string}</td>
                    <td><span className="row"><ProgressBar value={p as number} thin width={84} domain="acc" /><span className="num" style={{ fontSize: 12, fontWeight: 600 }}>{p as number}%</span></span></td>
                    <td>{st}</td>
                    <td className="num"><span className="num" style={{ fontWeight: 600 }}>{o as number}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="divider" />
            <CardHead title="团队动态" />
            <div className="list">
              <a className="li" href="#kit"><span className="di d-ai"><Icon name="spark" /></span><span className="tx"><b>陈默上架了「通话记录归因」</b><span>AI 资产 · Skill</span></span><span className="end">10:02</span></a>
              <a className="li" href="#kit"><span className="di d-grow"><Icon name="check" /></span><span className="tx"><b>林夏提交了「话术演练录音」</b><span>路径任务 · 客服岗</span></span><span className="end">昨天</span></a>
            </div>
          </div>
        </div>
      </Sec>

      {/* ⑦ 空状态与小件 */}
      <Sec title="空状态 · 小环 · 头像" code="Empty / ProgressRing size / Avatar">
        <div className="bento top0">
          <div className="card s4"><Empty icon="inbox" title="还没有提交" action={<button type="button" className="btn sec sm">去提交</button>}>交了第一份产出后，点评会出现在这里。</Empty></div>
          <div className="card s4"><Empty icon="search" title="没有符合条件的资产">换个标签，或清空筛选。</Empty></div>
          <div className="card s4 stack">
            <div className="row" style={{ gap: 16 }}>
              <ProgressRing value={68} size={72} thickness={10} domain="acc" sub="完成" />
              <ProgressRing value={45} plan={60} size={72} thickness={10} domain="exam" sub="落后" />
              <ProgressRing value={100} size={72} thickness={10} domain="team" label="6/6" sub="到站" />
            </div>
            <div className="row"><Avatar name="林夏" color="#3446E0" /><Avatar name="周颖" color="#B0875A" /><Avatar name="常浩" color="#14161A" size="lg" /><AvatarStack people={[{ name: '赵', color: '#8A6A3B' }, { name: '许', color: '#3C6FB8' }, { name: '周', color: '#7C4FC0' }]} /></div>
          </div>
        </div>
      </Sec>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={selected?.title ?? ''} sub={selected?.time} head={selected && <div className="row"><Tile icon={selected.icon ?? 'cal'} domain={selected.domain} /><DomainTag domain={selected.domain} /></div>}
        footer={<><button type="button" className="btn ghost" onClick={() => setDrawer(false)}>关闭</button><button type="button" className="btn pri">开始轻测</button></>}>
        <div className="dl"><div><span className="k">说明</span><span className="v">抽屉用于在当前页查看或编辑一条对象，不离开上下文。Esc 或点遮罩关闭。</span></div></div>
      </Drawer>
      <Drawer open={!!bar} onClose={() => setBar(null)} title={bar ? `${bar.row.label as string} · ${bar.bar.label}岗` : ''} sub={bar ? `${WEEKS[bar.bar.from].sub} 起 · ${bar.bar.span} 周` : undefined}
        head={bar && <div className="row"><Tile icon="swap" domain="acc" /><StatusPill tone={bar.bar.state === 'cur' ? 'acc' : bar.bar.state === 'done' ? 'ok' : 'plain'}>{bar.bar.state === 'cur' ? '进行中' : bar.bar.state === 'done' ? '已结束' : '未开始'}</StatusPill></div>}
        footer={<><button type="button" className="btn ghost" onClick={() => setBar(null)}>取消</button><button type="button" className="btn pri" onClick={() => { setBar(null); say('已保存（示例）'); }}>保存并重排</button></>}>
        <div className="stack" style={{ gap: 16 }}>
          <label className="field"><span>站带教</span><select className="select" defaultValue="周颖"><option>周颖</option><option>吴桐</option></select></label>
          <label className="field"><span>开始周</span><select className="select" defaultValue={bar ? WEEKS[bar.bar.from].key : undefined}>{WEEKS.map(w => <option key={w.key} value={w.key}>{w.label} · {w.sub}</option>)}</select></label>
          <div className="field"><span>顺延</span><div className="row"><button type="button" className="btn sec sm">顺延 1 周</button><button type="button" className="btn sec sm">与下一站换序</button></div></div>
          <div className="note warn"><Icon name="alert" /><span>W46–W47 客服岗已有 <b>2 人</b>，超出容量 1 人。</span></div>
        </div>
      </Drawer>
    </Sheet>
  );
}
