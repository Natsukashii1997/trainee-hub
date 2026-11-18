import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import {
  Avatar, CardHead, Countdown, DayStrip, Drawer, Empty, Icon, MetaPill, Metric, PageHead, PhaseBar, ProgressBar,
  StationChain, StatusPill, Tile, useSession, useToast, type Domain, type IconName, type StepState, type Tone,
} from '../components/ui';
import { Timeline, type TimelineItem } from '../components/schedule';
import * as api from '../data/api';
import { command, view } from '../data/server';
import { TODO_RULE_LABEL, type Todo, type User } from '../data/types';
import { daysSince, fmtCn, fmtDate, fmtDue, fmtTime, fmtWeekday, isoWeek } from '../lib/time';
import { addDays, atBj, bjYmd } from '../lib/workday';
import { MenteeGrid, SCHEDULE_CSS, cdParts } from './Schedule';

/* 首页（PRD 3.1）：首屏按角色切换，焦点取自己「待办」里最急的两件；下方放团队动态。 */

const t = (iso: string) => Date.parse(iso);
const Kicker = () => { const now = api.now(); return <>{fmtCn(now)} {fmtWeekday(now)}<i aria-hidden="true" />{fmtTime(now)}</>; };
const say400 = (e: unknown) => (e instanceof Error ? e.message : '没有成功，请稍后再试');

// ---------- 焦点卡 ----------
type FocusAct = { to: string; label: string } | { label: string; run: () => void };
function focusOf(todo: Todo, me: User) {
  const task = todo.subjectType === 'task' ? api.taskById(todo.subjectId) : undefined;
  const station = todo.subjectType === 'station' ? api.stationById(todo.subjectId) : undefined;
  const person = todo.personId ? api.findUser(todo.personId) : undefined;
  const mod = task?.moduleId ? api.moduleById(task.moduleId).name : station ? api.moduleById(station.moduleId).name : '';
  let icon: IconName = 'todo', domain: Domain = 'acc';
  if (task?.completion === 'bot-quiz') { icon = 'quiz'; domain = 'exam'; }
  else if (task?.completion === 'bot-weekly') { icon = 'doc'; domain = 'week'; }
  else if (todo.rule === 'R02') { icon = 'pen'; domain = 'ment'; }
  else if (task) { icon = todo.rule === 'R03' ? 'repeat' : 'pen'; domain = 'grow'; }
  else if (station) { icon = todo.rule === 'R08' ? 'route' : 'swap'; domain = todo.rule === 'R09' ? 'ment' : 'acc'; }
  else if (todo.rule === 'R10' || todo.rule === 'R11') { icon = 'spark'; domain = 'ai'; }
  else if (todo.rule === 'R12') { icon = 'sync'; domain = 'exam'; }
  else if (todo.rule === 'R01') { icon = 'user'; domain = 'week'; }
  const taskKind = task ? (task.kind === 'path' ? `路径任务 · ${mod}岗` : task.completion === 'bot-quiz' ? '周期任务 · 考核' : task.completion === 'bot-weekly' ? '周期任务 · 周报' : '周期任务') : '';
  const kind = me.role === 'trainee' ? (taskKind || TODO_RULE_LABEL[todo.rule]) : `${TODO_RULE_LABEL[todo.rule]}${mod ? ` · ${mod}岗` : ''}`;
  const title = me.role === 'trainee' ? (task?.name ?? todo.title.replace(/^[^·]+ · /, '')) : todo.title;
  return { task, station, person, icon, domain, kind, title };
}

function FocusCard({ todo, me, primary, area }: { todo: Todo; me: User; primary: boolean; area?: string }) {
  const say = useToast();
  const now = api.now();
  const { task, station, icon, domain, kind, title } = focusOf(todo, me);
  const late = api.isTodoLate(todo);
  const dueToday = todo.dueAt ? daysSince(todo.dueAt, now) === 0 : false;
  const run = (fn: () => void, ok: string) => { try { fn(); say(ok); } catch (e) { say(say400(e)); } };
  let act: FocusAct | null = null;
  switch (todo.rule) {
    case 'R02': act = { to: `/growth/tasks/${todo.subjectId}`, label: '去点评' }; break;
    case 'R03': act = { to: `/growth/tasks/${todo.subjectId}`, label: '去修改' }; break;
    case 'R04': act = { to: `/growth/tasks/${todo.subjectId}`, label: task?.completion === 'bot-quiz' ? '查看轻测' : task?.status === 'doing' ? '继续写' : '开始' }; break;
    case 'R05':
      act = task && task.userId === me.id ? { to: `/growth/tasks/${task.id}`, label: '去补交' }
        : task && api.canNudgeNow(task.id) ? { label: '飞书催一下', run: () => run(() => api.nudgeTask(task.id, me), `已催办，机器人会在飞书提醒${api.userById(task.userId).name}`) }
          : { to: `/growth/tasks/${todo.subjectId}`, label: '查看' };
      break;
    case 'R06': act = station?.preparedAt ? { to: '/schedule/mentees', label: '查看' } : { label: '我已准备好', run: () => run(() => api.markStationPrepared(todo.subjectId, me), '已确认准备好，开站当天会通知对方') }; break;
    case 'R07': act = { to: '/growth/me', label: '看下一站' }; break;
    case 'R08': act = { to: `/growth/handoff/${todo.subjectId}`, label: '写交接要点' }; break;
    case 'R09': act = { to: todo.personId ? `/team/${todo.personId}` : '/growth/board', label: '看遗留任务' }; break;
    case 'R10': act = { to: '/admin/review', label: '去审核' }; break;
    case 'R11': act = { to: '/ai/submit', label: '去修改' }; break;
    case 'R12': act = { to: '/todo', label: '去处理' }; break;
    case 'R01': act = { to: '/admin/members', label: '去分配' }; break;
  }
  const cls = primary ? 'btn pri sm' : 'btn sec sm';
  const pill: [Tone, string] = !todo.dueAt ? ['plain', '期限待定'] : late ? ['due', task && me.role === 'trainee' ? '已逾期' : '已超时'] : [dueToday ? 'due' : 'plain', fmtDue(todo.dueAt, now)];
  return (
    <article className="card focus" style={area ? { gridArea: area } : { flex: 1 }}>
      <div className="row1"><Tile icon={icon} domain={domain} /><span className="kind">{kind}</span><StatusPill tone={pill[0]}>{pill[1]}</StatusPill></div>
      <h3>{title}</h3>
      <div className="foot">
        <div>
          {task?.status === 'doing' && task.progress ? <>
            <span className="bignum">{Math.round(task.progress * 100)}<small>%</small></span>
            <div className="lbl row"><ProgressBar value={task.progress * 100} width={110} />已完成</div>
          </> : todo.dueAt && !late ? <>
            <Countdown parts={cdParts(now, todo.dueAt)} />
            <div className="lbl">{todo.rule === 'R06' || todo.rule === 'R07' ? '距开站' : '距截止'}</div>
          </> : todo.dueAt ? <>
            <span style={{ color: 'var(--due-ink)' }}><Countdown parts={cdParts(todo.dueAt, now)} /></span>
            <div className="lbl">已超过期限{todo.cc.length ? ' · 已抄送管理员' : ''}</div>
          </> : <div className="lbl" style={{ marginTop: 0 }}>{fmtDate(todo.appearAt)} 出现 · 期限待定</div>}
        </div>
        {act && ('to' in act ? <Link className={cls} to={act.to}>{act.label}</Link> : <button type="button" className={cls} onClick={act.run}>{act.label}</button>)}
      </div>
    </article>
  );
}
function ClearCard({ area, text }: { area?: string; text: string }) {
  return (
    <article className="card focus" style={area ? { gridArea: area } : { flex: 1 }}>
      <div className="row1"><Tile icon="check" domain="grow" /><span className="kind">今日焦点</span></div>
      <h3>没有更急的事了</h3>
      <div className="foot"><div className="lbl">{text}</div></div>
    </article>
  );
}

// ---------- 共用小卡 ----------
function LeaderBoard({ me, area, className = '', tid = true }: { me?: User; area?: string; className?: string; tid?: boolean }) {
  const lb = api.leaderboard();
  const top = lb.slice(0, 5);
  const mine = me ? lb.findIndex(x => x.user.id === me.id) : -1;
  return (
    <section className={`card vcol ${className}`} style={area ? { gridArea: area } : undefined} aria-label="贡献榜">
      <CardHead title={`${Number(bjYmd(api.now()).slice(5, 7))} 月贡献榜`} sub="按贡献条数" more={{ to: '/incentive', label: '激励' }} />
      <div className="hm-lb">
        {top.map((x, i) => (
          <div key={x.user.id} className={x.user.id === me?.id ? 'lr you' : 'lr'}>
            <span className={`n${i < 3 ? ' hi' : ''}`}>{i + 1}</span><Avatar name={x.user.name} color={x.user.color} size="sm" />
            <span className="grow1">{x.user.id === me?.id ? '你' : x.user.name}</span><span className="num p">{x.count}</span>
          </div>
        ))}
        {me && mine >= 5 && <div className="lr you"><span className="n">{mine + 1}</span><Avatar name={me.name} color={me.color} size="sm" /><span className="grow1">你</span><span className="num p">{lb[mine].count}</span></div>}
        {me && mine < 0 && <div className="lr you"><span className="n">—</span><Avatar name={me.name} color={me.color} size="sm" /><span className="grow1">你还没有贡献</span><Link className="go" to="/ai/submit">去上架<Icon name="right" /></Link></div>}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>资产上架、分享会主讲并挂回放各算一条 · 三期换积分</p>
      {tid && <TidLink />}
    </section>
  );
}
const TidLink = () => (
  <a className="hm-tid" href="https://tidings.natsukashii.cn" target="_blank" rel="noopener noreferrer">
    <Tile icon="spark" domain="ai" /><span className="grow1"><b>外部发现 · Tidings</b><small>今日 Skill 榜与 AI 日报</small></span><Icon name="ext" />
  </a>
);
function Feed({ limit = 4, area, className = '', pin = true }: { limit?: number; area?: string; className?: string; pin?: boolean }) {
  const ev = api.nextTeamEvent();
  return (
    <section className={`card ${className}`} style={area ? { gridArea: area } : undefined} aria-label="团队动态">
      <CardHead title="团队动态" sub="公开内容" more={{ to: '/team', label: '团队' }} />
      <div className={pin && ev ? 'hm-feed' : ''}>
        {pin && ev && (
          <Link className="hm-pin" to={`/schedule/events?e=${ev.id}`}>
            <span className="dt"><small>{fmtWeekday(ev.startAt)}</small><b className="num">{fmtDate(ev.startAt)}</b></span>
            <span className="grow1"><small>下一场 · {ev.type}</small><b>{ev.title.replace(/^(分享会|读书会)：/, '')}</b><span>{fmtTime(ev.startAt)} · {ev.speakerId ? `主讲 ${api.userById(ev.speakerId).name} · ` : ''}{ev.place}</span></span>
          </Link>
        )}
        <div className="list" style={{ marginTop: 0 }}>
          {api.feedList(limit).map(f => {
            const u = api.userById(f.actorId);
            return <div className="li" key={f.id}><Avatar name={u.name} color={u.color} size="sm" /><span className="tx"><b>{u.name} {f.text}</b></span><span className="end" style={{ fontWeight: 500, color: 'var(--mute)' }}>{fmtDue(f.at, api.now()).replace(/ \d\d:\d\d$/, '')}</span></div>;
          })}
        </div>
      </div>
    </section>
  );
}

// ================= 管培生（v3.0 第 5 页，A 版「原位替换」；数据来自后端首页查询 /api/views/home，总纲 6.4） =================
type Step = {
  kind: 'action' | 'milestone'; actionId?: string; actionKind?: 'revise' | 'advance'; content?: string;
  milestoneId: string | null; taskId?: string | null; subjectName: string; projectId: string | null; projectName: string | null;
  dueAt: string | null; milestoneStatus: string | null; reviewerName?: string | null;
};
type WaitReview = { submissionId: string; version: number; submittedAt: string; reviewerName: string; milestoneId: string | null; subjectName: string; projectId: string | null };
type WaitBlocker = { blockerId: string; createdAt: string; handlerName: string | null; milestoneId: string; milestoneName: string; projectId: string };
type FixItem = { id: string; source: 'review' | 'verbal'; content: string; createdByName: string; version: number | null; milestoneId: string | null; milestoneName: string | null; projectId?: string | null };
type WeekItem = { kind: 'milestone' | 'task'; id: string; title: string; dueAt: string; done: boolean; milestoneId: string | null; projectId: string | null };
type StationBrief = { id: string; module: string; startDate: string; endDate: string; pos: 'past' | 'current' | 'future'; settled: boolean };
export interface TraineeHomeView {
  station: { module: string } | null;
  next: { main: Step | null; then: Step | null };
  waiting: { reviews: WaitReview[]; blockers: WaitBlocker[] };
  toFix: { total: number; items: FixItem[] };
  week: { start: string; items: WeekItem[]; switches: { id: string; module: string; startDate: string }[] };
  growth: null | {
    day: number; totalDays: number; tasks: { total: number; due: number; passed: number };
    stages: { no: number; name: string; state: StepState }[];
    rotation: StationBrief[]; current: (StationBrief & { days: number; dayNo: number }) | null; next: StationBrief | null;
  };
}

const STEP_KIND = { revise: '修改再交', advance: '推进后续' } as const;
/** 日期字段（YYYY-MM-DD，北京时间的那一天）转成能交给格式化函数的时刻 */
const dayIso = (d: string) => `${d}T00:00:00+08:00`;
const msHref = (x: { projectId?: string | null; milestoneId?: string | null }) => (x.projectId && x.milestoneId ? `/projects/${x.projectId}/milestones/${x.milestoneId}` : null);
const errText = (e: unknown) => (e instanceof Error ? e.message : '没有成功，请稍后再试');
function waitedText(iso: string, now: string) {
  const h = Math.floor((Date.parse(now) - Date.parse(iso)) / 3_600_000);
  return h < 1 ? '刚交' : h < 24 ? `已等 ${h} 小时` : `已等 ${Math.floor(h / 24)} 天`;
}
const stepTitle = (s: Step) => (s.kind === 'action' ? s.content ?? s.subjectName : s.subjectName);
const stepWhere = (s: Step) => [s.projectName, s.kind === 'action' ? s.subjectName : null].filter(Boolean).join(' · ');
const stepGo = (s: Step) => (s.kind === 'action' && s.actionKind === 'revise' ? '去修改' : '查看里程碑');

/** 深色「下一步」卡：现在最该做的一件事；行动可以就地标记已处理（C09） */
function NextCard({ next, now, reload }: { next: TraineeHomeView['next']; now: string; reload: () => Promise<void> }) {
  const say = useToast();
  const [closing, setClosing] = useState(false);
  const [result, setResult] = useState<'done' | 'dropped'>('done');
  const [note, setNote] = useState('');
  const m = next.main;
  if (!m) {
    return (
      <article className="card dark nx" style={{ gridArea: 'nx' }} aria-label="下一步">
        <div className="r1"><span className="tile d-grow" aria-hidden="true"><Icon name="check" /></span><span>下一步</span></div>
        <h3>现在没有要你动手的事</h3>
        <p className="nx-sub">带教评审后给你的下一步行动、新开始的里程碑，会出现在这里。</p>
      </article>
    );
  }
  const href = msHref(m);
  const waitingReview = m.kind === 'milestone' && m.milestoneStatus === 'submitted';
  const late = m.dueAt ? Date.parse(m.dueAt) < Date.parse(now) : false;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await command('C09', { actionId: m.actionId, result, resolution: note.trim() || undefined });
      say(result === 'done' ? '已标记完成' : '已标记不再需要');
      setClosing(false); setNote('');
      await reload();
    } catch (err) { say(errText(err)); }
  };
  const then = next.then;
  const thenHref = then ? msHref(then) : null;
  return (
    <article className="card dark nx" style={{ gridArea: 'nx' }} aria-label="下一步">
      <div className="r1">
        <span className="tile d-exam" aria-hidden="true"><Icon name={m.kind === 'action' ? 'pen' : 'flag'} /></span>
        <span>{m.kind === 'action' ? `下一步 · ${STEP_KIND[m.actionKind ?? 'revise']}` : '下一步 · 当前里程碑'}{stepWhere(m) && ` · ${stepWhere(m)}`}</span>
        {m.dueAt && <span className={`chip ${late || daysSince(m.dueAt, now) === 0 ? 'due' : 'plain'}`}>{late ? '已过截止' : fmtDue(m.dueAt, now)}</span>}
      </div>
      <h3>{stepTitle(m)}</h3>
      <div className="foot">
        {waitingReview ? (
          <div><div className="nx-state">已交，等 <b>{m.reviewerName ?? '带教'}</b> 评审</div><div className="lbl">评审后的下一步会换到这里</div></div>
        ) : m.dueAt ? (
          <div><div className="cd">{cdParts(now, m.dueAt).map(([n, u]) => <span key={u} style={{ display: 'contents' }}><span className="n">{n}</span><span className="u">{u}</span></span>)}</div><div className="lbl">{late ? '已过截止' : '距截止'}</div></div>
        ) : <div />}
        <div className="row" style={{ gap: 8 }}>
          {m.kind === 'action' && !closing && <button type="button" className="btn ghost sm" onClick={() => setClosing(true)}>标记已处理</button>}
          {href && <Link className="btn pri" to={href}>{stepGo(m)}</Link>}
        </div>
      </div>
      {closing ? (
        <form className="then nx-close" onSubmit={submit} aria-label="处理这条下一步行动">
          <div className="seg" role="group" aria-label="处理结果">
            <button type="button" aria-pressed={result === 'done'} onClick={() => setResult('done')}>已完成</button>
            <button type="button" aria-pressed={result === 'dropped'} onClick={() => setResult('dropped')}>不再需要</button>
          </div>
          <input id="nx-note" className="input grow1" value={note} onChange={e => setNote(e.target.value)} placeholder={result === 'done' ? '完成依据（可不填）' : '不再需要的原因（必填）'} aria-label={result === 'done' ? '完成依据' : '不再需要的原因'} />
          <button type="submit" className="btn sec sm" disabled={result === 'dropped' && !note.trim()}>确认</button>
          <button type="button" className="btn ghost sm" onClick={() => setClosing(false)}>取消</button>
        </form>
      ) : then && (
        <div className="then">
          <span className="tl">做完接着做</span>
          <span className="tile sm d-grow" aria-hidden="true"><Icon name={then.kind === 'action' ? 'pen' : 'flag'} /></span>
          <span className="grow1"><b>{stepTitle(then)}</b><small>{[stepWhere(then), then.dueAt ? fmtDue(then.dueAt, now) : null].filter(Boolean).join(' · ')}</small></span>
          {thenHref && <Link className="btn sec sm" to={thenHref}>{stepGo(then)}</Link>}
        </div>
      )}
    </article>
  );
}

/** 带教点评：左边在等带教的，右边这次要改的（总纲 6.4 第 2、3 件事） */
function MentorNotes({ waiting, toFix, now }: { waiting: TraineeHomeView['waiting']; toFix: TraineeHomeView['toFix']; now: string }) {
  const n = waiting.reviews.length + waiting.blockers.length;
  const row = (key: string, href: string | null, body: ReactNode) => (href ? <Link key={key} className="doc" to={href}>{body}<Icon name="right" /></Link> : <div key={key} className="doc">{body}</div>);
  return (
    <section className="card vcol rvm" style={{ gridArea: 'rv' }} aria-label="带教点评">
      <CardHead title="带教点评" />
      <div className="rvm-b">
        <div className="vcol" aria-label="在等带教的">
          <div className="sec-l"><span>在等带教的</span><span>{n ? `${n} 项` : ''}</span></div>
          {n ? (
            <div className="stack" style={{ gap: 8 }}>
              {waiting.reviews.map(w => row(`r-${w.submissionId}`, msHref(w), <><Tile icon="clock" domain="ment" /><span className="grow1"><b>{w.subjectName} · 第 {w.version} 版</b><small>{w.reviewerName} 评审 · {waitedText(w.submittedAt, now)}</small></span></>))}
              {waiting.blockers.map(b => row(`b-${b.blockerId}`, msHref(b), <><Tile icon="alert" domain="exam" /><span className="grow1"><b>受阻 · {b.milestoneName}</b><small>{b.handlerName ?? '带教'} 响应 · {waitedText(b.createdAt, now)}</small></span></>))}
            </div>
          ) : <Empty icon="inbox" title="没有在等带教的">交的成果都评完了，受阻也都有回应。</Empty>}
          <p className="muted row rvm-note"><Icon name="info" size={13} />带教 2 个工作日内点评，超时抄送管理员</p>
        </div>
        <div className="vcol" aria-label="这次要改的">
          <div className="sec-l"><span>这次要改的</span><span>{toFix.total ? `${toFix.total} 条待验证` : ''}</span></div>
          {toFix.items.length ? (
            <div className="stack" style={{ gap: 8 }}>
              {toFix.items.map(f => {
                const href = msHref({ projectId: f.projectId, milestoneId: f.milestoneId });
                const body = <><span className="tx">{f.content}</span><small>{f.createdByName} · {f.source === 'verbal' ? '口头反馈' : `第 ${f.version} 版评审`}{f.milestoneName ? ` · ${f.milestoneName}` : ''}</small></>;
                return href ? <Link key={f.id} className="hm-fix" to={href}>{body}</Link> : <div key={f.id} className="hm-fix">{body}</div>;
              })}
            </div>
          ) : <Empty icon="check" title="没有待验证的反馈">带教约好下次验证的反馈会出现在这里。</Empty>}
          {toFix.total > toFix.items.length && <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>只列最新 3 条，另有 {toFix.total - toFix.items.length} 条在对应的里程碑页</p>}
        </div>
      </div>
    </section>
  );
}

/** 进度双圆环：外环绿色是路径任务完成（已通过 / 到今天应完成），内环黑色是培养时间 */
function ProgressRings({ passed, due, day, total }: { passed: number; due: number; day: number; total: number }) {
  const done = due ? Math.min(1, passed / due) : 0;
  const time = total ? Math.min(1, Math.max(0, day / total)) : 0;
  const arc = (r: number, p: number, color: string) => {
    const c = 2 * Math.PI * r;
    return <>
      <circle cx="52" cy="52" r={r} fill="none" stroke="rgba(21,25,38,.07)" strokeWidth="10" />
      {p > 0 && <circle cx="52" cy="52" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(c * p).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 52 52)" />}
    </>;
  };
  return (
    <div className="hm-ring">
      <svg viewBox="0 0 104 104" role="img" aria-label={`完成 ${passed}/${due}，时间 ${Math.round(time * 100)}%`}>{arc(44, done, 'var(--grow)')}{arc(30, time, 'var(--ink)')}</svg>
      <div className="lg">
        <div><i style={{ background: 'var(--grow)' }} /><span className="l">完成进度</span><span className="v">{passed}<small>/ {due}</small></span><span className="s">已通过 / 应完成</span></div>
        <div><i style={{ background: 'var(--ink)' }} /><span className="l">时间进度</span><span className="v">{Math.round(time * 100)}<small>%</small></span><span className="s">第 {day} / {total} 天</span></div>
      </div>
    </div>
  );
}

function TraineeHome() {
  const nav = useNavigate();
  const { actor } = useSession();
  const [h, setH] = useState<TraineeHomeView | null>(null);
  const [error, setError] = useState('');
  const who = actor?.id;
  const load = useCallback(async () => {
    if (!who) return;
    try { setH(await view<TraineeHomeView>('home')); setError(''); } catch (e) { setH(null); setError(errText(e)); }
  }, [who]);
  useEffect(() => { setH(null); void load(); }, [load]);
  const now = new Date().toISOString();
  const kicker = <>{fmtCn(now)} {fmtWeekday(now)}<i aria-hidden="true" />{fmtTime(now)}</>;
  const name = actor?.name ?? '';
  if (error) return <><PageHead kicker={kicker} title={`${name}，你好`} /><section className="card" style={{ marginTop: 20 }}><Empty size="lg" icon="alert" title="首页没有加载出来">{error}</Empty></section></>;
  if (!h) return <><PageHead kicker={kicker} title={`${name}，你好`} /><section className="card" style={{ marginTop: 20 }}><p className="muted">加载中…</p></section></>;

  const g = h.growth;
  const main = h.next.main;
  const todoCount = main && !(main.kind === 'milestone' && (main.milestoneStatus === 'submitted' || main.milestoneStatus === 'passed')) ? (h.next.then ? 2 : 1) : 0;

  // 我的本周：本周截止的里程碑与培养任务 + 本周和下周的换站，按时间排，最多 7 条
  const tl: (TimelineItem & { at: number; href: string | null })[] = [
    ...h.week.items.map(i => ({
      id: `${i.kind}:${i.id}`, at: Date.parse(i.dueAt), href: msHref(i),
      start: fmtWeekday(i.dueAt), end: fmtTime(i.dueAt), title: i.title,
      aside: i.done ? '已交' : Date.parse(i.dueAt) < Date.parse(now) ? '已逾期' : i.kind === 'milestone' ? '里程碑' : '培养任务',
      domain: (i.kind === 'milestone' ? 'exam' : 'grow') as Domain, point: true, done: i.done,
    })),
    ...h.week.switches.map(s => ({
      id: `switch:${s.id}`, at: Date.parse(dayIso(s.startDate)), href: null,
      start: fmtDate(dayIso(s.startDate)), end: fmtWeekday(dayIso(s.startDate)), title: `换站 → 到${s.module}`, aside: '换站', domain: 'acc' as Domain, point: true,
    })),
  ].sort((a, b) => a.at - b.at).slice(0, 7);
  const delivered = h.week.items.filter(i => i.done).length;

  // 我的进度
  const gap = g ? g.tasks.passed - g.tasks.due : 0;
  /** 站名链上用短名（客服岗 → 客服），其余地方用全名 */
  const short = (m: string) => m.replace(/岗$/, '');
  const chain = (g?.rotation ?? []).map(s => ({
    name: short(s.module), state: (s.pos === 'past' ? (s.settled ? 'done' : 'due') : s.pos === 'current' ? 'cur' : 'todo') as StepState,
    sub: g?.next && s.id === g.next.id ? fmtDate(dayIso(s.startDate)) : undefined,
    title: `${s.module} ${fmtDate(dayIso(s.startDate))}–${fmtDate(dayIso(s.endDate))} · ${s.pos === 'past' ? (s.settled ? '已结清' : '时间到了，还没结清') : s.pos === 'current' ? '在站' : '待开始'}`,
  }));
  const lateStations = (g?.rotation ?? []).filter(s => s.pos === 'past' && !s.settled).length;
  const cur = g?.current;
  const weekNo = cur ? Math.floor((cur.dayNo - 1) / 7) + 1 : 0;

  return (
    <>
      <PageHead kicker={kicker}
        title={todoCount ? <>{name}，现在有 <em>{todoCount} 件事</em>要做</>
          : main?.kind === 'milestone' && main.milestoneStatus === 'submitted' ? <>{name}，成果在等 <em>{main.reviewerName ?? '带教'}</em> 评审</>
            : <>{name}，现在<em>没有要你动手的事</em></>}
        right={<><MetaPill>第 <b>{isoWeek(now)}</b> 周</MetaPill>{g && <MetaPill>培养第 <b>{g.day}</b> / {g.totalDays} 天</MetaPill>}</>} />
      <div className="hm-t">
        <NextCard next={h.next} now={now} reload={load} />
        <MentorNotes waiting={h.waiting} toFix={h.toFix} now={now} />

        <section className="card vcol" style={{ gridArea: 'week' }} aria-label="我的本周">
          <CardHead title="我的本周" sub={cur ? `${cur.module}站 · 第 ${weekNo} 周` : `${fmtDate(dayIso(h.week.start))} 起`} />
          <div className="vcol grow1" style={{ marginTop: 14 }}>
            {tl.length ? <Timeline fill items={tl} onSelect={id => { const it = tl.find(x => x.id === id); if (it?.href) nav(it.href); }} />
              : <Empty icon="cal" title="这周没有截止">本周截止的里程碑、培养任务和换站会出现在这里。</Empty>}
          </div>
          <div className="divider dash" style={{ margin: '12px 0 0' }} />
          <div className="row" style={{ paddingTop: 10, fontSize: 11.5, color: 'var(--mute)', justifyContent: 'space-between' }}>
            <span>本周 {h.week.items.length} 项 · 已交 {delivered}</span>
            {g?.next && <span>下一站 <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{g.next.module}</b> · {fmtDate(dayIso(g.next.startDate))}</span>}
          </div>
        </section>

        <section className="card vcol" style={{ gridArea: 'prog' }} aria-label="我的进度">
          <CardHead title="我的进度" />
          {g ? <>
            <ProgressRings passed={g.tasks.passed} due={g.tasks.due} day={g.day} total={g.totalDays} />
            <div className="row" style={{ marginTop: 10, gap: 6, fontSize: 12 }}>
              <StatusPill tone={gap < 0 ? 'warn' : 'ok'} icon={gap < 0 ? 'alert' : 'check'}>{gap < 0 ? `落后 ${-gap} 项` : gap > 0 ? `超前 ${gap} 项` : '按计划'}</StatusPill>
              <span className="muted">共 {g.tasks.total} 项路径任务</span>
            </div>
            <div className="sec-l">阶段</div>
            <PhaseBar phases={g.stages} />
            {chain.length > 0 && <>
              <div className="sec-l"><span>轮岗 {chain.length} 站</span><span>{g.rotation.filter(s => s.settled && s.pos === 'past').length} / {chain.length} 已结清{lateStations ? ` · ${lateStations} 站时间到了未结清` : ''}</span></div>
              <div style={{ marginTop: 4 }}><StationChain stations={chain} /></div>
            </>}
            {cur && (
              <div className="well" style={{ marginTop: 'auto' }}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>{cur.module} · 第 {weekNo} 周</b><span className="num muted" style={{ fontSize: 11.5 }}>{fmtDate(dayIso(cur.startDate))}–{fmtDate(dayIso(cur.endDate))}</span></div>
                <div style={{ marginTop: 8 }}><DayStrip total={cur.days} passed={cur.dayNo - 1} /></div>
                <div className="row" style={{ marginTop: 6, justifyContent: 'space-between', fontSize: 11.5, color: 'var(--mute)' }}>
                  <span>第 {cur.dayNo} / {cur.days} 天</span>
                  {g.next ? <span>{cur.days - cur.dayNo + 1} 天后换到{g.next.module}</span> : <span>还剩 {cur.days - cur.dayNo} 天</span>}
                </div>
              </div>
            )}
          </> : <Empty icon="cal" title="还没有个人路径">管理员排好你的培养路径后，这里显示进度。</Empty>}
        </section>

        <section className="card vcol" style={{ gridArea: 'res' }} aria-label="当前岗位资料">
          <CardHead title={h.station ? `${h.station.module}资料` : '岗位资料'} sub="当前站" />
          <Empty icon="book" title="第二阶段接入">按当前轮岗站推送飞书知识库里的资料。</Empty>
        </section>
        <section className="card vcol" style={{ gridArea: 'feed' }} aria-label="团队动态">
          <CardHead title="团队动态" sub="公开内容" />
          <Empty icon="team" title="第二阶段接入">分享会、新上架的方法和公告会出现在这里。</Empty>
        </section>
        <section className="card vcol" style={{ gridArea: 'tid' }} aria-label="AI 发现">
          <CardHead title="AI 发现" />
          <div className="stack" style={{ gap: 8, marginTop: 12 }}><TidLink /></div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 'auto', paddingTop: 10 }}>内部资产库第二阶段接入</p>
        </section>
      </div>
    </>
  );
}

// ================= 带教人 =================
function MentorHome({ me }: { me: User }) {
  const say = useToast();
  const now = api.now();
  const sum = api.mentorSummary(me);
  const focus = api.homeFocus(me);
  const mt = api.myMentees(me);
  const queue = api.pendingReviews(me);
  const mine = api.assetsBy(me.id);

  // 下一个换站节点：这两周里最近的换站日，和我有关的人
  const rows = [...mt.groups.current, ...mt.groups.incoming, ...mt.groups.handedOff];
  const sw = rows.flatMap(r => r.items.filter(i => i.kind === 'switch' && t(i.startAt) > t(now)).map(i => ({ row: r, item: i })));
  const swAt = sw.map(x => x.item.startAt).sort((a, b) => t(a) - t(b))[0];
  const swList = sw.filter(x => x.item.startAt === swAt).map(x => {
    const to = api.stationById(x.item.ref.id)!;
    const from = api.prevStation(to);
    const toMine = api.stationMentorOf(to) === me.id, fromMine = !!from && api.stationMentorOf(from) === me.id;
    return { user: x.row.user, from, to, toMine, fromMine };
  });
  const prepare = (stationId: string) => { try { api.markStationPrepared(stationId, me); say('已确认准备好，机器人会在开站当天通知对方'); } catch (e) { say(say400(e)); } };

  return (
    <>
      <PageHead kicker={<><Kicker /><i aria-hidden="true" />{me.line ? `${me.line}带教` : '带教'}</>}
        title={<>在带 <em>{sum.current} 人</em>{sum.incomingAt ? <> · {fmtDate(sum.incomingAt)} {fmtWeekday(sum.incomingAt)}到站 {sum.incoming} 人</> : null}{sum.leftoverUnreviewed ? <> · 上一站还有 <em>{sum.leftoverUnreviewed} 份</em>没评</> : null}</>}
        right={<><MetaPill>第 <b>{isoWeek(now)}</b> 周</MetaPill><MetaPill>待点评 <b>{queue.length}</b></MetaPill></>} />
      <div className="bento">
        {focus[0] ? <div className="s4 stretch vcol"><FocusCard todo={focus[0]} me={me} primary /></div> : <div className="s4 stretch vcol"><ClearCard text="点评和交接都处理完了。" /></div>}
        {focus[1] ? <div className="s4 stretch vcol"><FocusCard todo={focus[1]} me={me} primary={false} /></div> : <div className="s4 stretch vcol"><ClearCard text="其余待办都不急。" /></div>}
        <section className="card s4 vcol stretch" aria-label="下一个换站节点">
          <div className="row"><Tile icon="swap" domain="acc" /><span className="muted" style={{ fontSize: 12 }}>下一个换站节点</span>{swAt && <StatusPill>{fmtDate(swAt)} {fmtWeekday(swAt)}</StatusPill>}</div>
          {swAt ? <>
            <div className="stack" style={{ gap: 6, marginTop: 10 }}>
              {swList.slice(0, 3).map(x => (
                <div key={x.user.id} className="row" style={{ fontSize: 12.5, gap: 8 }}>
                  <Avatar name={x.user.name} color={x.user.color} size="sm" />
                  <span className="grow1"><b style={{ fontWeight: 600 }}>{x.user.name}</b> <span className="muted">{x.from ? api.moduleById(x.from.moduleId).name : ''} → {api.moduleById(x.to.moduleId).name}</span></span>
                  {x.toMine && !x.fromMine ? (x.to.preparedAt ? <StatusPill tone="ok" icon="check">已准备</StatusPill> : <button type="button" className="btn pri xs" onClick={() => prepare(x.to.id)}>我已准备好</button>)
                    : x.toMine ? <StatusPill tone="info">仍在你这</StatusPill> : <StatusPill>交接出去</StatusPill>}
                </div>
              ))}
            </div>
            <Link className="go" style={{ marginTop: 'auto', paddingTop: 8 }} to="/schedule/mentees">看两周安排<Icon name="right" /></Link>
          </> : <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>这两周没有和你有关的换站。</p>}
        </section>

        <section className="card s8" aria-label="我带的人" style={{ padding: '18px 16px 12px' }}>
          <div style={{ padding: '0 4px' }}><CardHead title="我带的人" sub={`本周 · ${rows.length} 人`} more={{ to: '/schedule/mentees', label: '两周日程' }} /></div>
          <div style={{ marginTop: 10 }}>
            {rows.length ? <MenteeGrid data={mt} viewer={me} days={7} compact /> : <Empty icon="team" title="这周没有你带的人">换站前 5 个工作日，将到你这站的人会出现在这里。</Empty>}
          </div>
        </section>
        <section className="card s4 stretch vcol" aria-label="待点评队列">
          <CardHead title="待点评" sub="按离超时排序" more={{ to: '/growth/board', label: '带教看板' }} />
          {queue.length ? (
            <div className="list">
              {queue.map(q => (
                <Link key={q.todo.id} className="li" to={`/growth/tasks/${q.task.id}`}>
                  <Avatar name={q.owner.name} color={q.owner.color} size="sm" />
                  <span className="tx"><b>{q.task.name}</b><span>{q.owner.name} · {q.task.moduleId ? `${api.moduleById(q.task.moduleId).name}岗 · ` : ''}{fmtDate(q.sub.at)} 提交</span></span>
                  <span className="end">{q.late ? <StatusPill tone="due">超时 {Math.max(1, daysSince(q.dueAt, now))} 天</StatusPill> : <StatusPill tone="info">{fmtDue(q.dueAt, now)}</StatusPill>}</span>
                </Link>
              ))}
            </div>
          ) : <Empty icon="check" title="都评完了">新的提交会按离超时排在这里。</Empty>}
          <p className="muted row" style={{ marginTop: 'auto', paddingTop: 10, fontSize: 11.5, gap: 6 }}><Icon name="info" size={13} />提交后 2 个工作日内点评，再过 3 个工作日抄送管理员</p>
        </section>

        <section className="card s4 vcol" aria-label="我贡献的资产">
          <CardHead title="我贡献的资产" more={{ to: '/ai/assets', label: 'AI 资产库' }} />
          {mine.length ? (
            <div className="list">
              {mine.slice(0, 3).map(a => (
                <Link key={a.id} className="li" to={`/ai/assets/${a.id}`}>
                  <span className="di d-ai"><Icon name="spark" /></span>
                  <span className="tx"><b>{a.title}</b><span>{a.type} · {a.status === 'live' ? '已上架' : a.status === 'pending' ? '审核中' : '已退回'}</span></span>
                  <span className="end">{a.status === 'live' ? `${api.uses(a)} 人用过` : a.status === 'returned' ? <StatusPill tone="warn">待修改</StatusPill> : <StatusPill tone="info">审核中</StatusPill>}</span>
                </Link>
              ))}
            </div>
          ) : <Empty icon="spark" title="还没有上架的资产">把带教中好用的方法沉淀下来，上架后计入贡献。</Empty>}
          <Link className="btn sec sm" style={{ marginTop: 12, alignSelf: 'flex-start' }} to="/ai/submit"><Icon name="plus" />上架一个资产</Link>
        </section>
        <Feed className="s8" limit={3} />
      </div>
    </>
  );
}

// ================= 管理员 =================
function AdminHome({ me }: { me: User }) {
  const say = useToast();
  const nav = useNavigate();
  const now = api.now();
  const todos = api.todosOf(me.id);
  const focus = api.homeFocus(me);
  const ints = api.integrationsAll();
  const broken = ints.filter(x => x.level === 'error');
  const [returning, setReturning] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const rate = api.onTimePassRate();
  const trend = api.onTimePassTrend();
  const prev = trend.length > 1 ? trend[trend.length - 2].rate : null;
  const gap = api.planGap();
  const fresh = api.newAssetsThisMonth();
  const pending = api.listAssets({ status: 'pending' });
  const users = api.listUsers();
  const active = api.weeklyActiveCount();

  // 点评积压按带教人汇总
  const backlog = new Map<string, number>();
  for (const q of api.pendingReviews(me)) backlog.set(q.todo.ownerId, (backlog.get(q.todo.ownerId) ?? 0) + 1);
  const count = (rule: Todo['rule']) => todos.filter(x => x.rule === rule).length;

  // 本周与下周排期
  const rp = api.rotationPlan();
  const weeks = [api.weekRange(0), api.weekRange(1)];
  const inR = (iso: string, r: [string, string]) => t(iso) >= t(r[0]) && t(iso) < t(r[1]);

  const approve = (id: string, title: string) => { try { api.reviewAsset(id, true, '', me); say(`已上架「${title}」，记入作者贡献`); } catch (e) { say(say400(e)); } };
  const doReturn = () => {
    if (!returning) return;
    if (!reason.trim()) { say('请写退回原因，作者会按它修改'); return; }
    try { api.reviewAsset(returning, false, reason, me); say('已退回，作者会收到修改提醒'); setReturning(null); setReason(''); } catch (e) { say(say400(e)); }
  };
  const retAsset = returning ? api.assetById(returning) : undefined;

  return (
    <>
      <PageHead kicker={<><Kicker /><i aria-hidden="true" />{api.cohortsAll()[0]?.name ?? ''} · {api.activeTrainees().length} 人</>}
        title={<>{me.name}，有 <em>{todos.length} 件事</em>待处理</>}
        right={<><MetaPill>第 <b>{isoWeek(now)}</b> 周</MetaPill><Link className="pill" to="/todo">全部待处理<Icon name="right" size={13} /></Link></>} />
      {broken.length > 0 && (
        <div className="note due" style={{ marginTop: 16, alignItems: 'center' }}>
          <Icon name="alert" />
          <span className="grow1"><b>{broken.map(x => x.name).join('、')}</b>：{broken[0].detail}。在恢复前，团队活动停在旧数据。</span>
          <Link className="btn sec xs" to="/todo">去处理</Link>
        </div>
      )}
      <div className="bento" style={{ marginTop: broken.length ? 12 : 20 }}>
        {focus[0] ? <div className="s4 stretch vcol"><FocusCard todo={focus[0]} me={me} primary /></div> : <div className="s4 stretch vcol"><ClearCard text="待处理已清空。" /></div>}
        {focus[1] ? <div className="s4 stretch vcol"><FocusCard todo={focus[1]} me={me} primary={false} /></div> : <div className="s4 stretch vcol"><ClearCard text="其余待处理都不急。" /></div>}
        <section className="card s4 stretch vcol" aria-label="待处理概览">
          <div className="row"><Tile icon="inbox" domain="acc" /><span className="muted" style={{ fontSize: 12 }}>待处理概览</span><Link className="go" style={{ marginLeft: 'auto' }} to="/todo">全部<Icon name="right" /></Link></div>
          <div className="hm-ov">
            <Link to="/admin/review"><span className="num">{count('R10')}</span><small>资产审核</small></Link>
            <Link to="/todo"><span className="num">{count('R05')}</span><small>逾期跟进</small></Link>
            <Link to="/schedule/rotation"><span className="num">{count('R06')}</span><small>换站接人</small></Link>
          </div>
          <div className="row" style={{ marginTop: 'auto', paddingTop: 10, fontSize: 12, gap: 8, flexWrap: 'wrap' }}>
            <span className="muted">点评积压</span>
            {[...backlog].map(([id, n]) => <StatusPill key={id} tone={n > 1 ? 'warn' : 'plain'}>{id === me.id ? '我' : api.userById(id).name} {n}</StatusPill>)}
            {!backlog.size && <span className="muted">无</span>}
          </div>
        </section>

        <div className="metrics s12" style={{ gridTemplateColumns: '1.35fr 1fr 1fr 1fr' }}>
          <Metric label="路径任务按期达标率" value={rate.rate ?? '—'} unit={rate.rate != null ? '%' : undefined} icon="check" domain="grow" right={<StatusPill tone="acc">主指标</StatusPill>}
            delta={prev != null && rate.rate != null ? { text: `${Math.abs(rate.rate - prev)} pt 较上周`, dir: rate.rate > prev ? 'up' : rate.rate < prev ? 'down' : 'flat' } : undefined}
            trend={trend.map(x => x.rate ?? 0)} foot={<span><b className="num">{rate.n} / {rate.N}</b> · 待定 {rate.pending} · 滚动四周</span>} />
          <Metric label="计划进度差距" value={gap.gapTotal > 0 ? `+${gap.gapTotal}` : gap.gapTotal} unit="项" icon="clock" domain="exam" foot={`${gap.behind} 人落后 · 平均时间 ${gap.avgTimePct}% / 完成 ${gap.avgCompletionPct}%`} />
          <Metric label="本月新上架资产" value={fresh.length} unit="个" icon="spark" domain="ai" foot={`待审核 ${pending.length}`} />
          <Metric label="本周活跃" value={active} unit={`/ ${users.length} 人`} icon="team" domain="team" foot={`在培管培生 ${api.activeTrainees().filter(api.isActiveThisWeek).length} / ${api.activeTrainees().length}`} />
        </div>

        <section className="card s8" aria-label="本周与下周排期">
          <CardHead title="本周与下周排期" sub="换站、评估节点、活动" more={{ to: '/schedule/rotation', label: '轮岗排期' }} />
          <div className="hm-2w">
            {weeks.map((r, wi) => {
              const sws = rp.switches.filter(s => inR(s.at, r));
              const evs = rp.assessments.filter(a => inR(a.at, r));
              const tes = api.teamEventsAll().filter(e => inR(e.startAt, r));
              return (
                <div key={r[0]}>
                  <div className="sec-l" style={{ marginTop: 0 }}><span><b style={{ color: 'var(--ink)', fontWeight: 600 }}>{wi === 0 ? '本周' : '下周'}</b> · {fmtDate(r[0])}–{fmtDate(atBj(addDays(bjYmd(r[0]), 6)))}</span><span>W{isoWeek(r[0])}</span></div>
                  {!sws.length && !evs.length && !tes.length && <p className="muted" style={{ fontSize: 12.5, padding: '6px 0' }}>没有换站、评估节点和团队活动</p>}
                  {sws.map(s => (
                    <Link key={s.at} className="hm-ev d-acc" to="/schedule/rotation">
                      <span className="dt"><small>{fmtWeekday(s.at)}</small><b className="num">{fmtDate(s.at)}</b></span>
                      <span className="grow1">
                        <b>{s.userIds.length} 人换站</b>
                        <span className="who">{s.userIds.map(u => {
                          const st = api.stationsOf(u).find(x => x.startAt === s.at);
                          const pv = st ? api.prevStation(st) : undefined;
                          const handover = st && pv && api.stationMentorOf(st) !== api.stationMentorOf(pv);
                          return <span key={u} title={st ? `站带教 ${api.userById(api.stationMentorOf(st)).name}${handover ? (st.preparedAt ? ' · 已准备' : ' · 还没确认准备') : ''}` : ''}>
                            {api.userById(u).name} {pv ? api.moduleById(pv.moduleId).name : ''}→{st ? api.moduleById(st.moduleId).name : ''}{handover && !st?.preparedAt ? <i className="dot" aria-label="接人未确认" /> : null}
                          </span>;
                        })}</span>
                      </span>
                    </Link>
                  ))}
                  {evs.map(a => <div key={a.stageId} className="hm-ev d-exam"><span className="dt"><small>{fmtWeekday(a.at)}</small><b className="num">{fmtDate(a.at)}</b></span><span className="grow1"><b>{api.stageById(a.stageId).name}阶段评估节点</b><span className="who">{a.userIds.length} 人</span></span></div>)}
                  {tes.map(e => <Link key={e.id} className="hm-ev d-team" to={`/schedule/events?e=${e.id}`}><span className="dt"><small>{fmtWeekday(e.startAt)}</small><b className="num">{fmtDate(e.startAt)}</b></span><span className="grow1"><b>{e.title}</b><span className="who">{fmtTime(e.startAt)} · {e.speakerId ? `主讲 ${api.userById(e.speakerId).name}` : e.place}</span></span></Link>)}
                </div>
              );
            })}
          </div>
          <p className="muted row" style={{ fontSize: 11.5, marginTop: 10, gap: 6 }}><i className="hm-dotk" aria-hidden="true" />红点：新站带教还没点「已准备」</p>
        </section>
        <section className="card s4 stretch vcol" aria-label="审核队列">
          <CardHead title="审核队列" sub={`${pending.length} 条`} more={{ to: '/admin/review', label: '全部' }} />
          {pending.length ? (
            <div className="list">
              {pending.slice(0, 4).map(a => (
                <div className="li" key={a.id} style={{ alignItems: 'flex-start' }}>
                  <span className="di d-ai"><Icon name={a.type === 'Skill' ? 'spark' : 'file'} /></span>
                  <span className="tx"><Link to={`/ai/assets/${a.id}`}><b>{a.title}</b></Link><span>{a.type} · {api.userById(a.authorId).name} · {fmtDate(a.submittedAt)} 提交</span>
                    <span className="row" style={{ marginTop: 8, gap: 6 }}>
                      <button type="button" className="btn pri xs" onClick={() => approve(a.id, a.title)}><Icon name="check" />通过上架</button>
                      <button type="button" className="btn danger xs" onClick={() => { setReturning(a.id); setReason(''); }}>退回</button>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty icon="check" title="审核队列已清空">新的提交会出现在这里。</Empty>}
        </section>

        <section className="card s8" aria-label="全员进度">
          <CardHead title="全员进度" sub={`${gap.rows.length} 人 · 时间进度 vs 完成进度`} more={{ to: '/growth/board', label: '带教看板' }} />
          <table className="tbl" style={{ marginTop: 8 }}>
            <thead><tr><th>成员</th><th>当前站</th><th>时间进度</th><th>完成</th><th>状态</th></tr></thead>
            <tbody>
              {[...gap.rows].sort((a, b) => a.progress.gap - b.progress.gap).map(r => {
                const p = api.currentPosition(r.user.id);
                const g = r.progress.gap;
                return (
                  <tr key={r.user.id} className="clickable" onClick={() => nav(`/team/${r.user.id}`)}>
                    <td><span className="row"><Avatar name={r.user.name} color={r.user.color} size="sm" /><b>{r.user.name}</b></span></td>
                    <td>{p ? `${p.module.name} · 第 ${p.week} 周` : '—'}<span className="s">站带教 {p ? api.userById(api.stationMentorOf(p.station)).name : '—'}</span></td>
                    <td><span className="row"><ProgressBar value={r.progress.time.pct} thin width={72} domain="acc" /><span className="num" style={{ fontSize: 12, fontWeight: 600 }}>{r.progress.time.pct}%</span></span></td>
                    <td><span className="num" style={{ fontWeight: 600 }}>{r.progress.completion.passed} / {r.progress.completion.due}</span><span className="s">已通过 / 应完成</span></td>
                    <td>{g < 0 ? <StatusPill tone={g <= -2 ? 'due' : 'warn'}>落后 {-g} 项</StatusPill> : <StatusPill tone="ok">按计划</StatusPill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="card s4 stretch" aria-label="连接状态">
          <CardHead title="连接状态" sub={broken.length ? `${broken.length} 项异常` : '全部正常'} />
          <div className="list">
            {ints.map(s => (
              <div className="li" key={s.id}>
                <span className={`hm-lv ${s.level}`} aria-label={{ ok: '正常', warn: '注意', error: '异常', off: '未接入' }[s.level]} />
                <span className="tx"><b>{s.name}</b><span>{s.detail}</span></span>
                <span className="end" style={{ fontWeight: 500, color: 'var(--mute)' }}>{s.at ? fmtTime(s.at) : '—'}</span>
              </div>
            ))}
          </div>
        </section>
        <AnnouncementCard />
        <LeaderBoard className="s6" />
      </div>
      <Drawer open={!!retAsset} onClose={() => setReturning(null)} title={retAsset ? `退回「${retAsset.title}」` : ''} sub={retAsset ? `${retAsset.type} · ${api.userById(retAsset.authorId).name} 提交` : undefined}
        footer={<><button type="button" className="btn ghost" onClick={() => setReturning(null)}>取消</button><button type="button" className="btn danger" onClick={doReturn}>退回给作者</button></>}>
        <label className="field"><span>退回原因<em className="req">*</em></span>
          <textarea className="textarea" value={reason} onChange={e => setReason(e.target.value)} placeholder="例：请补充一组示例输入和输出，说明适用的岗位" />
          <small>作者会在待办里看到这段话，按它修改后重新提交。</small>
        </label>
      </Drawer>
    </>
  );
}
function AnnouncementCard() {
  const ann = api.latestAnnouncement();
  return (
    <section className="card s6 stretch vcol" aria-label="最近公告">
      <CardHead title="最近公告" sub="发布在二期" />
      {ann ? <>
        <div className="well" style={{ marginTop: 12, padding: 14 }}>
          <b style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>{ann.title}</b>
          <p className="hm-clamp" style={{ marginTop: 6, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.7 }}>{ann.body}</p>
        </div>
        <div className="row muted" style={{ marginTop: 'auto', paddingTop: 10, fontSize: 11.5, justifyContent: 'space-between' }}><span>{fmtDate(ann.at)} 发布</span><span>已读 <b className="num" style={{ color: 'var(--ink)' }}>{ann.readBy}</b> / {api.listUsers().length}</span></div>
      </> : <Empty icon="mega" title="还没有公告" />}
    </section>
  );
}

// ================= 同事 =================
function ColleagueHome({ me }: { me: User }) {
  const top = api.listAssets().slice(0, 4);
  return (
    <>
      <PageHead kicker={<Kicker />} title={<>{me.name}，欢迎来到<em>管培生工作台</em></>}
        sub="这里能浏览团队沉淀的 AI 资产、优秀作品和团队动态，也可以把自己好用的 Prompt、Skill 贡献出来。" />
      <div className="note" style={{ marginTop: 16 }}><Icon name="lock" /><span>培训数据（任务、产出、点评、考核）只对<b>本人、带教人和管理员</b>可见，你在这里看到的都是团队公开的内容。</span></div>
      <div className="bento" style={{ marginTop: 12 }}>
        <section className="card s8" aria-label="热门 AI 资产">
          <CardHead title="热门 AI 资产" sub="按使用人数" more={{ to: '/ai/assets', label: '资产库' }} />
          <div className="hm-assets">
            {top.map(a => (
              <Link key={a.id} className="card link flat" to={`/ai/assets/${a.id}`}>
                <div className="row"><Tile icon="spark" domain="ai" size="sm" /><span className="kbd">{a.type.toUpperCase()}</span><span className="muted num" style={{ marginLeft: 'auto', fontSize: 12 }}>{api.uses(a)} 人用过</span></div>
                <b style={{ display: 'block', marginTop: 10, fontWeight: 600, fontSize: 13.5 }}>{a.title}</b>
                <p className="hm-clamp" style={{ marginTop: 4, fontSize: 12, color: 'var(--mute)', lineHeight: 1.6 }}>{a.summary}</p>
                <span className="row" style={{ marginTop: 8, fontSize: 11.5, color: 'var(--mute)' }}><Avatar name={api.userById(a.authorId).name} color={api.userById(a.authorId).color} size="sm" />{api.userById(a.authorId).name}</span>
              </Link>
            ))}
          </div>
        </section>
        <div className="s4 stack">
          <section className="card dark" aria-label="贡献一个资产" style={{ padding: '20px 22px' }}>
            <div className="row" style={{ fontSize: 12, color: '#C9CCE0' }}><Icon name="plus" />贡献</div>
            <h2 style={{ marginTop: 10, fontSize: 18, fontWeight: 500, lineHeight: 1.4 }}>把好用的方法沉淀下来</h2>
            <p style={{ marginTop: 6, fontSize: 12.5, color: '#C9CCE0', lineHeight: 1.7 }}>Prompt、Skill、工作流都可以提交，管理员审核通过后上架，记入你的贡献。</p>
            <Link className="btn sec sm" style={{ marginTop: 14 }} to="/ai/submit"><Icon name="upload" />提交资产</Link>
          </section>
          <section className="card" aria-label="作品集">
            <CardHead title="作品集" sub="二期" />
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 10 }}>管培生的优秀产出经本人同意后会在这里展示。</p>
            <Link className="go" style={{ marginTop: 8 }} to="/knowledge">先去知识板块看看<Icon name="right" /></Link>
          </section>
        </div>
        <Feed className="s8" limit={4} />
        <LeaderBoard me={me} className="s4" />
      </div>
    </>
  );
}

export default function Home() {
  api.useDataVersion();
  const { role, me } = useSession();
  return (
    <Sheet crumbs={[{ label: '首页' }]}>
      <style>{CSS + SCHEDULE_CSS}</style>
      {role === 'trainee' && <TraineeHome />}
      {role === 'mentor' && <MentorHome me={me} />}
      {role === 'admin' && <AdminHome me={me} />}
      {role === 'colleague' && <ColleagueHome me={me} />}
    </Sheet>
  );
}

// ---------- 本页样式（只作用于 hm- 前缀；需要时由主会话并入 app.css） ----------
const CSS = `
.hm-t { margin-top: 20px; display: grid; gap: var(--gap); grid-template-columns: 1fr 1fr 1.08fr 1.08fr;
  grid-template-areas: "nx nx week prog" "rv rv week prog" "res feed feed tid"; align-items: stretch; }
/* 管培生首页 · 深色「下一步」卡（排法沿用 .reco 与原焦点卡） */
.nx { display: flex; flex-direction: column; padding: 20px 22px; }
.nx .r1 { display: flex; align-items: center; gap: 8px; font-size: 12px; color: rgb(201, 204, 224); min-width: 0; }
.nx .r1 > span:nth-child(2) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nx .r1 .tile { width: 24px; height: 24px; border-radius: 8px; }
.nx .r1 .tile .ico { width: 13px; height: 13px; }
.nx .r1 .chip { margin-left: auto; flex: none; }
.nx .r1 .chip.plain { background: rgba(255, 255, 255, 0.1); color: #fff; }
.nx h3 { margin-top: 14px; font-size: var(--fs-2xl); font-weight: 400; letter-spacing: -0.01em; line-height: 1.25; }
.nx .nx-sub { margin-top: 8px; font-size: 13px; line-height: 1.7; color: rgb(211, 214, 230); }
.nx .foot { margin-top: auto; padding-top: 16px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.nx .cd .n { font-size: var(--fs-3xl); color: #fff; }
.nx .cd .u { color: rgb(201, 204, 224); }
.nx .lbl { font-size: 11.5px; color: rgb(201, 204, 224); margin-top: 6px; }
.nx .nx-state { font-size: 15px; color: #fff; }
.nx .nx-state b { font-weight: 600; }
.nx .btn.ghost { color: rgb(201, 204, 224); }
.nx .btn.ghost:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.nx .then { margin-top: 14px; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: rgba(255, 255, 255, 0.07); box-shadow: rgba(255, 255, 255, 0.08) 0px 0px 0px 1px inset; }
.nx .then .tl { font-size: 11.5px; color: rgb(201, 204, 224); white-space: nowrap; padding-right: 10px; box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.1); }
.nx .then b { display: block; font-size: 13px; font-weight: 500; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nx .then small { display: block; font-size: 11.5px; color: rgb(201, 204, 224); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nx .nx-close .seg { background: rgba(255, 255, 255, 0.1); }
.nx .nx-close .seg button { color: rgb(201, 204, 224); }
.nx .nx-close .seg button[aria-pressed="true"] { color: var(--ink); }
.nx .nx-close .input { height: 32px; min-width: 0; }
/* 带教点评：左边在等带教的，右边这次要改的 */
.rvm-b { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
.rvm .sec-l { margin-top: 14px; }
.rvm .rvm-note { margin-top: auto; padding-top: 10px; font-size: 11.5px; gap: 6px; }
.rvm .empty { padding: 16px 8px; }
.hm-fix { display: grid; gap: 4px; padding: 10px 12px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); transition: background var(--t), box-shadow var(--t); }
a.hm-fix:hover { background: rgb(255, 255, 255); box-shadow: 0 0 0 1px var(--line2), 0 6px 14px -8px rgba(28,36,64,.2); }
.hm-fix .tx { font-size: 13px; line-height: 1.6; color: var(--ink2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.hm-fix small { font-size: 11.5px; color: var(--mute); }
/* 进度：双圆环，外环完成、内环时间 */
.hm-ring { display: flex; align-items: center; gap: 16px; margin-top: 14px; padding: 12px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); }
.hm-ring svg { width: 84px; height: 84px; flex: none; }
.hm-ring .lg { display: grid; gap: 10px; min-width: 0; }
.hm-ring .lg > div { display: grid; grid-template-columns: 8px minmax(0, 1fr); column-gap: 6px; align-items: center; }
.hm-ring .lg i { width: 8px; height: 8px; border-radius: 50%; }
.hm-ring .l { font-size: 11.5px; color: var(--mute); }
.hm-ring .v, .hm-ring .s { grid-column: 2; }
.hm-ring .v { margin-top: 3px; font-family: var(--num); font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
.hm-ring .v small { font-size: 12px; font-weight: 600; color: var(--ink2); margin-left: 2px; }
.hm-ring .s { margin-top: 2px; font-size: 11px; color: var(--mute); }
.hm-clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.hm-lb { margin-top: 8px; display: grid; }
.hm-lb .lr { display: flex; align-items: center; gap: 10px; padding: 7px 6px; border-radius: 10px; font-size: 13px; }
.hm-lb .lr.you { background: var(--acc-soft); color: var(--acc-ink); font-weight: 500; }
.hm-lb .n { width: 18px; text-align: center; font-family: var(--num); font-size: 12px; font-weight: 700; color: var(--faint); }
.hm-lb .n.hi { color: var(--ai-ink); }
.hm-lb .p { font-family: var(--num); font-weight: 700; }
.hm-tid { margin-top: auto; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); transition: box-shadow var(--t); }
.hm-tid:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--ai) 40%, transparent); }
.hm-tid b { display: block; font-size: 12.5px; font-weight: 600; }
.hm-tid small { display: block; font-size: 11px; color: var(--mute); }
.hm-tid > .ico { width: 14px; height: 14px; color: var(--faint); }
.hm-feed { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px; margin-top: 12px; align-items: start; }
.hm-pin { display: flex; gap: 12px; align-items: center; padding: 12px; border-radius: 16px; background: var(--team-soft); transition: box-shadow var(--t); }
.hm-pin:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--team) 40%, transparent); }
.hm-pin .dt, .hm-ev .dt { width: 48px; flex: none; display: grid; justify-items: center; padding: 6px 0; border-radius: 12px; background: #fff; color: var(--ci, var(--team-ink)); box-shadow: 0 0 0 1px var(--line); }
.hm-pin .dt { color: var(--team-ink); }
.hm-pin .dt small, .hm-ev .dt small { font-size: 10.5px; }
.hm-pin .dt b, .hm-ev .dt b { font-size: 13px; font-weight: 700; }
.hm-pin small { display: block; font-size: 11px; color: var(--team-ink); }
.hm-pin b { display: block; font-size: 13px; font-weight: 600; line-height: 1.4; margin-top: 1px; }
.hm-pin span > span { display: block; font-size: 11.5px; color: var(--ink2); margin-top: 2px; }
.hm-ov { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.hm-ov a { display: grid; gap: 2px; padding: 10px 12px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); transition: box-shadow var(--t); }
.hm-ov a:hover { box-shadow: 0 0 0 1px rgba(74,78,216,.35); }
.hm-ov .num { font-size: 22px; font-weight: 700; line-height: 1.1; }
.hm-ov small { font-size: 11.5px; color: var(--mute); }
.hm-2w { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 14px; }
.hm-ev { display: flex; gap: 12px; align-items: flex-start; padding: 10px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); margin-top: 8px; transition: box-shadow var(--t); }
a.hm-ev:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 40%, transparent); }
.hm-ev .dt { background: var(--cs); box-shadow: none; }
.hm-ev b { display: block; font-size: 13px; font-weight: 600; }
.hm-ev .who { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px; font-size: 11.5px; color: var(--ink2); }
.hm-ev .who > span { white-space: nowrap; display: inline-flex; align-items: center; gap: 3px; }
.hm-ev .dot, .hm-dotk { width: 6px; height: 6px; border-radius: 50%; background: var(--due); display: inline-block; }
.hm-lv { width: 10px; height: 10px; border-radius: 50%; flex: none; margin: 0 11px; background: var(--grow); box-shadow: 0 0 0 4px var(--grow-soft); }
.hm-lv.warn { background: var(--warn); box-shadow: 0 0 0 4px var(--warn-soft); }
.hm-lv.error { background: var(--due); box-shadow: 0 0 0 4px var(--due-soft); }
.hm-lv.off { background: var(--faint); box-shadow: 0 0 0 4px rgba(21,25,38,.05); }
.hm-assets { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.hm-assets .card { padding: 14px 16px; }
`;
