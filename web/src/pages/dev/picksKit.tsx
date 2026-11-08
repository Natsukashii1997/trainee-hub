import type { CSSProperties, ReactNode } from 'react';
import { Avatar, CardHead, CopyBox, Countdown, DayStrip, Empty, Icon, PhaseBar, ProgressBar, StationChain, StatusPill, Tile, type IconName, type StepState, type Tone } from '../../components/ui';
import { Timeline } from '../../components/schedule';
import { fmtCn, fmtDate, fmtDateTime, fmtDue, fmtTime, fmtWeekday } from '../../lib/time';
import { cdParts } from '../Schedule';
import { ASSET, COLOR, ITEMS, STATIONS, TRAIN_TOTAL, type Grade, type Milestone, type MsStatus, type Project, type World } from './picksData';

/* 挑版页的公共积木：只用现有组件和 app.css 的类名拼，必要的补充样式在 PK_CSS（pk- 前缀）。 */

export const more = (label: string) => ({ to: '#', label });
export const MS_TONE: Record<MsStatus, Tone> = { 未开始: 'plain', 进行中: 'acc', 待评审: 'info', 需修改: 'warn', 已通过: 'ok', 已取消: 'plain' };
export const PJ_TONE: Record<Project['status'], Tone> = { 草拟: 'plain', 推进中: 'acc', 已结束: 'ok' };
export function GradePill({ g }: { g: Grade }) { return <StatusPill tone={g === '需改进' ? 'warn' : 'ok'} icon={g === '需改进' ? undefined : 'check'}>{g}</StatusPill>; }
export function MsPill({ m, size }: { m: Milestone; size?: 'lg' }) {
  return <>
    <StatusPill tone={MS_TONE[m.status]} size={size}>{m.status}</StatusPill>
    {m.blocker && m.blocker.status !== '已解除' && <StatusPill tone="due" icon="alert" size={size}>受阻</StatusPill>}
  </>;
}
export const Kicker = ({ now, extra }: { now: string; extra?: ReactNode }) => <>{fmtCn(now)} {fmtWeekday(now)}<i aria-hidden="true" />{fmtTime(now)}{extra && <><i aria-hidden="true" />{extra}</>}</>;
export const Av = ({ name, size }: { name: string; size?: 'sm' | 'md' | 'lg' }) => <Avatar name={name} color={COLOR[name] ?? '#7A869C'} size={size} />;
export function Person({ name, sub }: { name: string; sub: ReactNode }) {
  return <div className="row" style={{ gap: 10 }}><Av name={name} /><span className="grow1"><b style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{name}</b><small className="muted" style={{ fontSize: 11.5 }}>{sub}</small></span></div>;
}
export const area = (a?: string): CSSProperties | undefined => (a ? { gridArea: a } : undefined);

/** 当前节点：第一个没通过、没取消的；都通过了取最后一个 */
export const curNode = (p: Project) => p.milestones.find(m => m.status !== '已通过' && m.status !== '已取消') ?? p.milestones[p.milestones.length - 1];
export function nodeChain(p: Project) {
  const c = curNode(p);
  return p.milestones.map(m => ({ name: m.name, sub: fmtDate(m.dueAt), state: (m.status === '已通过' ? 'done' : m === c && m.status !== '未开始' ? 'cur' : 'todo') as StepState, title: `${m.name} · ${m.status} · 截止 ${fmtDateTime(m.dueAt)}` }));
}
export const latestVersion = (m: Milestone) => m.versions[m.versions.length - 1];

// ---------- 管培生首页积木 ----------
/** 最重要的下一步：未完成的下一步行动；没有时退到需要协调的事 */
export function nextStep(w: World) {
  const a = w.actions[0];
  const blocked = w.coord.find(c => c.kind === '受阻');
  if (a) return { kind: `下一步行动 · ${a.kind}`, title: a.text, from: `来自 ${a.from}${blocked ? ` · 「${blocked.title}」受阻，等周颖响应` : ''}`, dueAt: a.dueAt, dueLabel: '距节点截止', btn: a.kind === '修改再交' ? '去修改再交' : '去处理', tone: 'acc' as const };
  const c = w.coord[0];
  if (c?.kind === '待评审') return { kind: '在等带教评审', title: `${c.title} 已提交，等周颖评审`, from: `${fmtDateTime(c.at)} 提交 · 评审后这里会出现下一步`, dueAt: undefined, dueLabel: '', btn: '看提交记录', tone: 'info' as const };
  if (c?.kind === '待确认立项') return { kind: '在等带教确认立项', title: '来电归因优化 等周颖确认立项', from: '确认后就能建关键节点、开始推进', dueAt: undefined, dueLabel: '', btn: '看项目', tone: 'info' as const };
  return { kind: '没有未完成的行动', title: w.pj1.status === '已结束' ? '来电归因优化已结项，可以补记业务验证' : '没有等你推进的事', from: w.pj1.status === '已结束' ? '12.08 周颖确认结项 · 交付达成，业务未验证' : '', dueAt: undefined, dueLabel: '', btn: w.pj1.status === '已结束' ? '补记业务验证' : '新建项目', tone: 'ok' as const };
}

/** 深色强调块里的倒计时 + 白色按钮一行 */
export function DarkFoot({ dueAt, now, label, btn, left }: { dueAt?: string; now: string; label?: string; btn: string; left?: ReactNode }) {
  return (
    <div className="pk-dfoot">
      <div>{dueAt ? <><Countdown parts={cdParts(now, dueAt)} /><div className="pk-dl">{label} · {fmtDue(dueAt, now)}</div></> : left}</div>
      <button type="button" className="btn sec sm">{btn}<Icon name="right" /></button>
    </div>
  );
}

const COORD_LOOK = { 待评审: { icon: 'clock', d: 'ment', tone: 'info' }, 受阻: { icon: 'alert', d: 'exam', tone: 'due' }, 待确认立项: { icon: 'flag', d: 'week', tone: 'plain' } } as const;
export function CoordCard({ w, a, title = '需要协调的事' }: { w: World; a?: string; title?: string }) {
  return (
    <section className="card vcol" style={area(a)} aria-label={title}>
      <CardHead title={title} sub={`${w.coord.length} 件`} />
      {w.coord.length ? (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          {w.coord.map(c => (
            <div key={c.title + c.kind} className="doc">
              <Tile icon={COORD_LOOK[c.kind].icon} domain={COORD_LOOK[c.kind].d} />
              <span className="grow1"><b>{c.title}</b><small>{c.meta}</small></span>
              <StatusPill tone={COORD_LOOK[c.kind].tone}>{c.kind}</StatusPill>
            </div>
          ))}
        </div>
      ) : <Empty icon="check" title="没有要协调的事">受阻的节点和在等评审的成果会出现在这里。</Empty>}
      <p className="muted row" style={{ marginTop: 'auto', paddingTop: 10, fontSize: 11.5, gap: 6 }}><Icon name="info" size={13} />评审 2 个工作日内；受阻找项目带教</p>
    </section>
  );
}

export function FeedbackCard({ w, a, n = 1, title = '最新评审' }: { w: World; a?: string; n?: number; title?: string }) {
  const list = w.feedback.slice(0, n);
  return (
    <section className="card vcol" style={area(a)} aria-label={title}>
      <CardHead title={title} more={more('全部')} />
      {list.length ? list.map((f, i) => (
        <div key={f.target} style={{ marginTop: i ? 16 : 14 }}>
          <div className="row" style={{ gap: 10 }}>
            <Av name={f.by} />
            <span className="grow1"><b style={{ display: 'block', fontWeight: 600 }}>{f.by}</b><small className="muted" style={{ fontSize: 11.5 }}>{f.target}</small></span>
            <GradePill g={f.grade} />
          </div>
          <p className="quote hm-clamp">{f.judge ? <><b style={{ fontWeight: 600, color: 'var(--ink)' }}>关键问题：</b>{f.text}</> : f.text}</p>
          {f.judge && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>带教判断：{f.judge}</p>}
          {i === list.length - 1 && <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>{fmtDate(f.at)} 评审</p>}
        </div>
      )) : <Empty icon="pen" title="还没有评审">第一次提交成果后，带教的反馈会出现在这里。</Empty>}
    </section>
  );
}

export function WeekCard({ w, a }: { w: World; a?: string }) {
  const weekEnd = Date.parse(w.now) + 6 * 86400000;
  const items = w.week.map(i => ({
    id: i.id, start: Date.parse(i.at) < weekEnd ? fmtWeekday(i.at) : fmtDate(i.at), end: fmtTime(i.at), title: i.title, aside: i.aside,
    domain: i.domain, point: true, done: i.done,
  }));
  return (
    <section className="card vcol" style={area(a)} aria-label="我的本周">
      <CardHead title="我的本周" sub={`${w.station.name}站 · 第 ${Math.ceil(w.station.day / 7)} 周`} more={more('日程')} />
      <div className="vcol grow1" style={{ marginTop: 14 }}><Timeline fill items={items} /></div>
      <div className="divider dash" style={{ margin: '12px 0 0' }} />
      <div className="row" style={{ paddingTop: 10, fontSize: 11.5, color: 'var(--mute)', justifyContent: 'space-between' }}>
        <span>{w.week.length} 项 · 已完成 {w.week.filter(i => i.done).length}</span>
        {w.curStation < 4 && <span>下一站 <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{STATIONS[w.curStation + 1].name}</b> · {STATIONS[w.curStation + 1].start.slice(5).replace('-', '.') /* 北京时间日期串 */}</span>}
      </div>
    </section>
  );
}

export function stationChain(w: World) {
  return STATIONS.map((s, i) => ({ name: s.name, state: (i < w.curStation ? 'done' : i === w.curStation ? 'cur' : 'todo') as StepState, sub: i === w.curStation + 1 ? s.start.slice(5).replace('-', '.') /* 北京时间日期串 */ : undefined }));
}
export function phases(w: World) {
  const cur = STATIONS[w.curStation].stage;
  const order = ['入职', '通识', '轮岗', '定岗'];
  return order.map((n, i) => ({ name: n, state: (i < order.indexOf(cur) ? 'done' : n === cur ? 'cur' : 'todo') as StepState }));
}
export function ProgressCard({ w, a }: { w: World; a?: string }) {
  const pct = Math.round((w.trainDay / TRAIN_TOTAL) * 100);
  return (
    <section className="card vcol" style={area(a)} aria-label="我的进度">
      <CardHead title="我的进度" more={more('成长档案')} />
      <div className="hm-two">
        <div><span className="l">时间进度</span><span className="v">{pct}<small>%</small></span><ProgressBar value={pct} domain="acc" thin /><span className="s">第 {w.trainDay} / {TRAIN_TOTAL} 天</span></div>
        <div><span className="l">能力证据</span><span className="v">{w.coverage}<small>/ 5 项</small></span><ProgressBar value={w.coverage * 20} domain="grow" thin /><span className="s">共 {w.evidence.length} 条证据</span></div>
      </div>
      <div className="row" style={{ marginTop: 10, gap: 6, fontSize: 12 }}>
        <StatusPill tone="ok" icon="check">任务 {w.tasksDue[0]} / {w.tasksDue[1]} 已通过</StatusPill><span className="muted">按计划</span>
      </div>
      <div className="sec-l">阶段</div>
      <PhaseBar phases={phases(w)} />
      <div className="sec-l"><span>培养五站</span><span>{w.curStation} / 5 已结束</span></div>
      <div style={{ marginTop: 4 }}><StationChain stations={stationChain(w)} /></div>
      <div className="well" style={{ marginTop: 'auto' }}>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>{w.station.name} · 第 {w.station.no} 站</b><span className="num muted" style={{ fontSize: 11.5 }}>{w.station.start.slice(5).replace('-', '.')}–{w.station.end.slice(5).replace('-', '.') /* 北京时间日期串 */}</span></div>
        <div style={{ marginTop: 8 }}><DayStrip total={Math.min(w.station.days, 28)} passed={Math.min(w.station.day - 1, 27)} /></div>
        <div className="row" style={{ marginTop: 6, justifyContent: 'space-between', fontSize: 11.5, color: 'var(--mute)' }}>
          <span>第 {w.station.day} / {w.station.days} 天</span><span>{w.curStation < 4 ? `${w.station.days - w.station.day + 1} 天后换到${STATIONS[w.curStation + 1].name}` : '定岗到 03.19'}</span>
        </div>
      </div>
    </section>
  );
}

/** 我的项目（浅色）：节点链 + 当前节点 */
export function ProjectCard({ w, a, title = '我的项目' }: { w: World; a?: string; title?: string }) {
  const p = w.pj1;
  const m = p.milestones.length ? curNode(p) : undefined;
  return (
    <section className="card vcol" style={area(a)} aria-label={title}>
      <CardHead title={title} sub="主责 1 个" more={more('项目详情')} />
      <div className="row" style={{ marginTop: 14, gap: 10 }}>
        <Tile icon="flag" domain="grow" />
        <span className="grow1"><b style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{p.name}</b><small className="muted" style={{ fontSize: 11.5 }}>{p.goal}</small></span>
        <StatusPill tone={PJ_TONE[p.status]}>{p.status}</StatusPill>
      </div>
      {m ? <>
        <div className="sec-l"><span>关键节点</span><span>{p.milestones.filter(x => x.status === '已通过').length} / {p.milestones.length} 已通过</span></div>
        <div style={{ padding: '0 18%' }}><StationChain stations={nodeChain(p)} /></div>
        <div className="well" style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 6, fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>{p.status === '已结束' ? '项目结论' : `当前节点 · ${m.name}`}</b><span style={{ marginLeft: 'auto' }} className="row">{p.status === '已结束' ? <StatusPill tone="ok" icon="check">交付达成</StatusPill> : <MsPill m={m} />}</span></div>
          <p style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.7, color: 'var(--ink2)' }}>{p.status === '已结束' ? `业务验证：${p.conclusion!.verify} · ${p.conclusion!.lessons}` : <>验收标准：{m.accept}</>}</p>
          {p.status !== '已结束' && <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>截止 {fmtDue(m.dueAt, w.now)} · 项目带教 {p.mentor}</p>}
        </div>
      </> : (
        <div className="well" style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 6, fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>还没有关键节点</b><StatusPill tone="plain" >等周颖确认立项</StatusPill></div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.7 }}>确认立项后，在项目详情里新建关键节点（目标、验收标准、截止）。</p>
        </div>
      )}
    </section>
  );
}

const JUDGE_LV: Record<string, number> = { 尚未观察到充分证据: 1, 有指导下完成: 2, 可独立完成: 3 };
export function judgeOf(w: World, item: number) {
  const list = w.evidence.filter(e => e.item === item);
  const best = list.reduce((m, e) => Math.max(m, JUDGE_LV[e.judge]), 0);
  return { list, best, label: best === 3 ? '可独立完成' : best === 2 ? '有指导下完成' : best === 1 ? '尚未观察到充分证据' : '还没有证据' };
}
export function Meter({ lv }: { lv: number }) {
  return <span className="pk-meter" aria-label={`判断 ${lv} / 3`}>{[1, 2, 3].map(i => <i key={i} className={i <= lv ? 'on' : ''} />)}</span>;
}
export function CoverageCard({ w, a }: { w: World; a?: string }) {
  return (
    <section className="card vcol" style={area(a)} aria-label="能力证据">
      <CardHead title="能力证据" sub={`${w.coverage} / 5 项有证据`} more={more('档案')} />
      <div className="stack" style={{ gap: 2, marginTop: 10 }}>
        {ITEMS.map((n, i) => { const j = judgeOf(w, i + 1); return (
          <div key={n} className="pk-cov">
            <span className="num">{i + 1}</span><span className="grow1" style={{ color: j.list.length ? 'var(--ink)' : 'var(--mute)' }}>{n}</span>
            <Meter lv={j.best} /><span className="num pk-cn">{j.list.length}</span>
          </div>
        ); })}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 'auto', paddingTop: 10 }}>格子 = 判断等级：有指导下 / 可独立</p>
    </section>
  );
}

/** 「这一步可以用」：降为普通卡（建议的附录 A 改法） */
export function AssetCard({ a, compact }: { a?: string; compact?: boolean }) {
  return (
    <section className="card vcol" style={area(a)} aria-label="这一步可以用">
      <CardHead title="这一步可以用" sub="规则推荐" more={more('AI')} />
      <div className="row" style={{ marginTop: 12, gap: 10, alignItems: 'flex-start' }}>
        <Tile icon="spark" domain="ai" />
        <span className="grow1"><b style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{ASSET.title}<span className="kbd" style={{ marginLeft: 6 }}>{ASSET.type}</span></b>
          {!compact && <small className="muted" style={{ display: 'block', fontSize: 12, lineHeight: 1.65, marginTop: 4 }}>{ASSET.summary}</small>}</span>
      </div>
      <div style={{ marginTop: 'auto' }}><CopyBox text={ASSET.cmd} /></div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>作者 {ASSET.author} · {ASSET.uses} 人用过 · 适合「问题定义」这类归类节点</p>
    </section>
  );
}

// ---------- 带教首页积木 ----------
export function SwitchCard({ w, a, cls }: { w: World; a?: string; cls?: string }) {
  return (
    <section className={`card vcol ${cls ?? ''}`} style={area(a)} aria-label="下一个换站节点">
      <div className="row"><Tile icon="swap" domain="acc" /><span className="muted" style={{ fontSize: 12 }}>{w.sw.today ? '今天换站' : '下一个换站节点'}</span><StatusPill>{fmtDate(w.sw.at)} {fmtWeekday(w.sw.at)}</StatusPill></div>
      <div className="stack" style={{ gap: 8, marginTop: 12 }}>
        {w.sw.list.map(x => (
          <div key={x.who} className="row" style={{ fontSize: 12.5, gap: 8 }}>
            <Av name={x.who} size="sm" /><span className="grow1"><b style={{ fontWeight: 600 }}>{x.who}</b> <span className="muted">{x.from} → {x.to}</span></span>
            <StatusPill tone="info">仍由你带</StatusPill>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 'auto', paddingTop: 10 }}>两人的默认带教都是你；项目跨站不关闭</p>
    </section>
  );
}

export function BoardCard({ w, a, cls, wide }: { w: World; a?: string; cls?: string; wide?: boolean }) {
  return (
    <section className={`card vcol ${cls ?? ''}`} style={area(a)} aria-label="决策看板">
      <CardHead title="决策看板" sub="管理者可见 · 基础计数"><StatusPill tone="info" icon="shield">管理</StatusPill></CardHead>
      <div className={wide ? 'pk-sig wide' : 'pk-sig'}>
        <div><span className="l">连续两次未通过同一节点的项目</span><span className="v num">{w.board.repeatFail.length}<small>个</small></span><span className="s">{w.board.repeatFail.length ? '' : '暂无'} · 口径：同一节点连续两版「需改进」</span></div>
        <div><span className="l">各带教当前待评审</span>
          <span className="pk-bars">{w.board.pending.map(p => <span key={p.mentor}><Av name={p.mentor} size="sm" />{p.mentor}<b className="num">{p.n}</b><small>份</small></span>)}</span>
          <span className="s">口径：评审负责人是本人、还没评的成果版本</span></div>
      </div>
    </section>
  );
}

export const RISK_TONE: Record<string, Tone> = { 受阻: 'due', 连续需改进: 'warn' };
export function MenteeTable({ w, a, cls }: { w: World; a?: string; cls?: string }) {
  return (
    <section className={`card ${cls ?? ''}`} style={area(a)} aria-label="我带的人">
      <CardHead title="我带的人" sub={`${w.mentees.length} 人 · 每人一行`} more={more('我带的人')} />
      <table className="tbl" style={{ marginTop: 10 }}>
        <thead><tr><th>成员</th><th>在哪站</th><th>当前项目与节点</th><th>最近反馈</th><th>风险</th></tr></thead>
        <tbody>
          {w.mentees.map(r => (
            <tr key={r.name}>
              <td><span className="row" style={{ gap: 10 }}><Avatar name={r.name} color={r.color} size="sm" /><b>{r.name}</b></span></td>
              <td>{r.station}</td>
              <td><b>{r.project}</b>{r.node && <span className="s"><StatusPill tone={r.nodeTone}>{r.node}</StatusPill></span>}</td>
              <td>{r.lastGrade && <GradePill g={r.lastGrade} />}<span className="s">{r.last}</span></td>
              <td>{r.risks.length ? r.risks.map(x => <StatusPill key={x} tone={RISK_TONE[x]} icon="alert">{x}</StatusPill>) : <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** 待我判断：三类 */
export function judgeGroups(w: World) {
  return [
    { key: '评审', icon: 'pen' as IconName, items: w.toReview.map(r => ({ who: r.who, title: r.title, meta: `${r.deep ? '深反馈 · ' : ''}${r.scope} · ${r.ctx} · ${fmtDateTime(r.at)} 提交`, due: r.dueAt, btn: '去评审' })), empty: '没有等你评审的成果' },
    { key: '立项', icon: 'flag' as IconName, items: w.toConfirm.map(c => ({ who: c.who, title: c.project, meta: `${fmtDateTime(c.at)} 创建 · ${c.goal}`, due: undefined as string | undefined, btn: '确认立项' })), empty: '没有待确认的立项' },
    { key: '受阻', icon: 'alert' as IconName, items: w.blockers.map(b => ({ who: b.who, title: `${b.project} · ${b.node}`, meta: `${b.reason} · 需要${b.decider}决定`, due: undefined as string | undefined, btn: '去响应' })), empty: '没有未响应的受阻' },
  ];
}
export const judgeCount = (w: World) => w.toReview.length + w.toConfirm.length + w.blockers.length;

export const PK_CSS = `
.pk-t { margin-top: 20px; display: grid; gap: var(--gap); grid-template-columns: 1fr 1fr 1.08fr 1.08fr; align-items: stretch; }
.reco .r1 .tile.pk-acc { background: #A5A9FF; color: #1A1D2C; }
.reco .r1 .tile.pk-ok { background: #7FD1A6; color: #0E3B24; }
.reco .r1 .tile.pk-info { background: #8DBCEE; color: #0F2F57; }
.reco .cd .n { color: #fff; } .reco .cd .u, .reco .cd .lbl { color: #C9CCE0; }
.reco h2 { font-size: 22px; }
.pk-dfoot { margin-top: auto; padding-top: 14px; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.pk-dl { margin-top: 6px; font-size: 11.5px; color: #A9ADC4; }
.pk-in { margin-top: 14px; padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
.pk-in .l { font-size: 11.5px; color: #A9ADC4; }
.pk-in b { color: #fff; font-weight: 600; }
.pk-in p { margin-top: 4px; font-size: 12.5px; line-height: 1.7; color: #D3D6E6; }
.reco .stations::before { background: rgba(255,255,255,.14); }
.reco .st { color: #A9ADC4; } .reco .st.done, .reco .st.cur { color: #fff; }
.reco .st i { background: #262A3D; box-shadow: 0 0 0 1.5px rgba(255,255,255,.22); color: #C9CCE0; }
.reco .st.done i { background: var(--grow); box-shadow: none; color: #fff; }
.reco .st.cur i { background: #A5A9FF; color: #1A1D2C; box-shadow: 0 0 0 4px rgba(165,169,255,.18); }
.reco .st small { color: #8A90A0; }
.reco .chip.plain { background: rgba(255,255,255,.1); color: #E4E6F3; }
.pk-cov { display: flex; align-items: center; gap: 10px; padding: 7px 4px; font-size: 12.5px; box-shadow: inset 0 -1px 0 var(--line); }
.pk-cov:last-child { box-shadow: none; }
.pk-cov > .num:first-child { width: 14px; text-align: center; font-size: 11.5px; font-weight: 700; color: var(--faint); }
.pk-cn { width: 16px; text-align: right; font-size: 12px; font-weight: 700; color: var(--ink2); }
.pk-meter { display: inline-flex; gap: 3px; }
.pk-meter i { width: 14px; height: 6px; border-radius: 3px; background: rgba(21,25,38,.08); }
.pk-meter i.on { background: var(--grow); }
.pk-sig { display: grid; gap: 8px; margin-top: 12px; }
.pk-sig.wide { grid-template-columns: 1fr 1fr; }
.pk-sig > div { display: grid; gap: 6px; padding: 12px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); }
.pk-sig .l { font-size: 11.5px; color: var(--mute); }
.pk-sig .v { font-size: 24px; font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.pk-sig .v small { font-size: 12px; font-weight: 600; color: var(--ink2); margin-left: 3px; }
.pk-sig .s { font-size: 11px; color: var(--faint); }
.pk-bars { display: grid; gap: 6px; }
.pk-bars > span { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.pk-bars b { margin-left: auto; font-size: 16px; font-weight: 700; }
.pk-bars small { font-size: 11px; color: var(--mute); }
`;
