import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import {
  Avatar, AvatarStack, CardHead, CopyBox, Countdown, DayStrip, Drawer, Empty, Icon, MetaPill, Metric, PageHead, PhaseBar, ProgressBar,
  StationChain, StatusPill, Tile, useSession, useToast, type Domain, type IconName, type StepState, type Tone,
} from '../components/ui';
import { Timeline, type TimelineItem } from '../components/schedule';
import * as api from '../data/api';
import { TODO_RULE_LABEL, type ScheduleItem, type ScheduleKind, type Todo, type User } from '../data/types';
import { daysSince, fmtCn, fmtDate, fmtDue, fmtTime, fmtWeekday, isoWeek } from '../lib/time';
import { addDays, atBj, bjYmd, daysBetween, workdaysBetween } from '../lib/workday';
import { KIND, MenteeGrid, SCHEDULE_CSS, cdParts, refHref } from './Schedule';

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
function TidCard({ area }: { area: string }) {
  return (
    <section className="card vcol" style={{ gridArea: area }} aria-label="AI 发现">
      <CardHead title="AI 发现" more={{ to: '/ai', label: 'AI' }} />
      <div className="stack" style={{ gap: 8, marginTop: 12 }}>
        <TidLink />
        <Link className="hm-tid" to="/ai/assets"><Tile icon="grid" domain="ai" /><span className="grow1"><b>内部资产库</b><small>本月新上架 {api.newAssetsThisMonth().length} 个 · 按岗位筛选</small></span><Icon name="right" /></Link>
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 'auto', paddingTop: 10 }}>好用的方法上架后计入贡献榜</p>
    </section>
  );
}
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

// ================= 管培生 =================
/** 「我的本周」切片只放：所在站与第几周、换站日、截止、周报、轻测、团队活动 */
const SLICE = new Set<ScheduleKind>(['switch', 'taskDue', 'reviseDue', 'weekly', 'quiz', 'material', 'teamEvent']);
const isDone = (i: ScheduleItem) => i.status === 'submitted' || i.status === 'passed';

function TraineeHome({ me }: { me: User }) {
  const nav = useNavigate();
  const now = api.now();
  const focus = api.homeFocus(me);
  const urgent = api.todosOf(me.id).filter(x => x.dueAt && daysSince(x.dueAt, now) >= -1).length;
  const pos = api.currentPosition(me.id);
  const prog = api.progressOf(me.id);
  const week = api.myWeek(me.id);
  const next = api.myWeek(me.id, me, 1);
  const cal = api.workdayCalendar();

  // 我的本周：本周的条目 + 下周到下一次换站为止的换站、活动
  const slice = [...week.items.filter(i => SLICE.has(i.kind)), ...next.items.filter(i => i.kind === 'switch' || i.kind === 'teamEvent')].slice(0, 7);
  const tl: TimelineItem[] = slice.map(i => {
    const k = KIND[i.kind];
    const thisWeek = t(i.startAt) < t(week.range[1]);
    const past = t(i.startAt) < t(now);
    return {
      id: i.id, start: thisWeek ? fmtWeekday(i.startAt) : fmtDate(i.startAt), end: fmtTime(i.startAt),
      title: i.kind === 'switch' ? i.title.replace('换站 · ', '换站 → ') : i.title.replace(/^(分享会|读书会)：/, ''),
      aside: isDone(i) ? '已提交' : i.status === 'overdue' ? '已逾期' : k.label,
      domain: k.domain, point: true, done: isDone(i) || (past && i.status !== 'overdue'),
    };
  });
  const delivered = week.items.filter(i => SLICE.has(i.kind) && isDone(i)).length;
  const weekTotal = week.items.filter(i => SLICE.has(i.kind)).length;

  // 我的进度
  const sp = api.stationsProgress(me.id);
  const rotIds = new Set((pos?.rotation ?? []).map(s => s.id));
  const rot = sp.stations.filter(s => rotIds.has(s.station.id));
  const chain = rot.map(s => ({
    name: s.module.name, state: (s.settled && s.pos === 'left' ? 'done' : s.pos === 'left' ? 'due' : s.pos === 'current' ? 'cur' : 'todo') as StepState,
    sub: sp.next && s.station.id === sp.next.id ? fmtDate(s.station.startAt) : undefined,
    title: `${s.module.name}站 ${fmtDate(s.station.startAt)}–${fmtDate(s.station.endAt)} · ${s.settled ? '已结清' : s.pos === 'left' ? '时间到了，还没结清' : s.pos === 'current' ? '在站' : '待开始'}（${s.settle.passed}/${s.settle.total}）`,
  }));
  const phases = api.stagesAll().map(st => {
    const ss = sp.stations.filter(s => s.module.stageId === st.id);
    const state: StepState = ss.length && ss.every(s => s.pos === 'left') ? 'done' : ss.some(s => s.pos === 'current') ? 'cur' : 'todo';
    return { name: st.name.split('：')[0], state };
  });
  const cur = pos?.station;
  const curDays = cur ? daysBetween(bjYmd(cur.startAt), bjYmd(cur.endAt)) + 1 : 0;
  const curPassed = cur ? Math.min(curDays, daysBetween(bjYmd(cur.startAt), bjYmd(now))) : 0;
  const gap = prog?.gap ?? 0;

  // 点评
  const rv = api.latestReviewOf(me.id, me);
  const rvTask = rv ? api.taskById(rv.taskId) : undefined;
  const waiting = api.tasksOf(me.id).filter(x => x.status === 'submitted' && x.completion === 'link').map(x => {
    const td = api.allTodos().find(y => y.rule === 'R02' && y.subjectId === x.id);
    return { task: x, mentor: api.userById(api.responsibleMentorId(x)), dueAt: td?.dueAt };
  });

  // AI 推荐：给正在做的路径任务
  const working = api.tasksOf(me.id).filter(x => x.kind === 'path' && api.isOpen(x)).sort((a, b) => Number(b.status === 'doing') - Number(a.status === 'doing'))[0];
  const rec = api.assetsForTemplate(api.templateById(working?.templateId))[0] ?? api.listAssets()[0];
  const recFor = rec && working && api.assetsForTemplate(api.templateById(working.templateId)).includes(rec) ? working.name : null;
  const res = api.resourcesForModule(pos?.module.id).slice(0, 3);
  const say = useToast();

  return (
    <>
      <PageHead kicker={<Kicker />}
        title={urgent ? <>{me.name}，今天有 <em>{urgent} 件事</em>要处理</> : <>{me.name}，今明两天<em>没有要赶的事</em></>}
        right={<><MetaPill>第 <b>{isoWeek(now)}</b> 周</MetaPill>{prog && <MetaPill>培养第 <b>{prog.time.day}</b> / {prog.time.total} 天</MetaPill>}</>} />
      <div className="hm-t">
        {focus[0] ? <FocusCard todo={focus[0]} me={me} primary area="f1" /> : <ClearCard area="f1" text="待办都处理完了，看看这周后面的安排。" />}
        {focus[1] ? <FocusCard todo={focus[1]} me={me} primary={false} area="f2" /> : <ClearCard area="f2" text="其余待办都不急。" />}

        <section className="card vcol" style={{ gridArea: 'week' }} aria-label="我的本周">
          <CardHead title="我的本周" sub={week.module ? `${week.module.name}站 · 第 ${week.weekInStation} 周` : fmtDate(week.range[0])} more={{ to: '/schedule/week', label: '日程' }} />
          <div className="vcol grow1" style={{ marginTop: 14 }}>
            {tl.length ? <Timeline fill items={tl} onSelect={id => { const it = slice.find(x => x.id === id); const h = it && refHref(it, me); if (h) nav(h); }} />
              : <Empty icon="cal" title="这周没有截止">下一站和活动会出现在这里。</Empty>}
          </div>
          <div className="divider dash" style={{ margin: '12px 0 0' }} />
          <div className="row" style={{ paddingTop: 10, fontSize: 11.5, color: 'var(--mute)', justifyContent: 'space-between' }}>
            <span>本周 {weekTotal} 项 · 已交 {delivered}</span>
            {week.nextStation && <span>下一站 <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{api.moduleById(week.nextStation.moduleId).name}</b> · {fmtDate(week.nextStation.startAt)}</span>}
          </div>
        </section>

        <section className="card vcol" style={{ gridArea: 'prog' }} aria-label="我的进度">
          <CardHead title="我的进度" more={{ to: '/growth/me', label: '成长' }} />
          {prog ? <>
            <div className="hm-two">
              <div><span className="l">时间进度</span><span className="v">{prog.time.pct}<small>%</small></span><ProgressBar value={prog.time.pct} domain="acc" thin /><span className="s">第 {prog.time.day} / {prog.time.total} 天</span></div>
              <div><span className="l">完成进度</span><span className="v">{prog.completion.passed}<small>/ {prog.completion.due}</small></span><ProgressBar value={prog.completion.pct} domain="grow" thin /><span className="s">已通过 / 应完成</span></div>
            </div>
            <div className="row" style={{ marginTop: 10, gap: 6, fontSize: 12 }}>
              <StatusPill tone={gap < 0 ? 'warn' : 'ok'} icon={gap < 0 ? 'alert' : 'check'}>{gap < 0 ? `落后 ${-gap} 项` : gap > 0 ? `超前 ${gap} 项` : '按计划'}</StatusPill>
              <span className="muted">共 {prog.completion.all} 项路径任务</span>
            </div>
          </> : null}
          <div className="sec-l">阶段</div>
          <PhaseBar phases={phases} />
          {chain.length > 0 && <>
            <div className="sec-l"><span>轮岗六站</span><span>{rot.filter(s => s.settled).length} / {rot.length} 已结清{rot.some(s => s.pos === 'left' && !s.settled) ? ` · ${rot.filter(s => s.pos === 'left' && !s.settled).length} 站时间到了未结清` : ''}</span></div>
            <div style={{ marginTop: 4 }}><StationChain stations={chain} /></div>
          </>}
          {cur && pos && (
            <div className="well" style={{ marginTop: 'auto' }}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>{pos.module.name}岗 · 第 {pos.week} 周</b><span className="num muted" style={{ fontSize: 11.5 }}>{fmtDate(cur.startAt)}–{fmtDate(cur.endAt)}</span></div>
              <div style={{ marginTop: 8 }}><DayStrip total={curDays} passed={curPassed} /></div>
              <div className="row" style={{ marginTop: 6, justifyContent: 'space-between', fontSize: 11.5, color: 'var(--mute)' }}>
                <span>第 {curPassed + 1} / {curDays} 天</span>
                {sp.next ? <span>{workdaysBetween(now, sp.next.startAt, cal)} 个工作日后换到{api.moduleById(sp.next.moduleId).name}</span> : <span>还剩 {curDays - curPassed - 1} 天</span>}
              </div>
            </div>
          )}
        </section>

        <section className="card" style={{ gridArea: 'rv' }} aria-label="最新点评">
          <CardHead title="最新点评" more={{ to: '/growth/me', label: '全部' }} />
          {rv && rvTask ? (() => { const m = api.userById(rv.mentorId); return <>
            <div className="row" style={{ marginTop: 14, gap: 10 }}>
              <Avatar name={m.name} color={m.color} />
              <Link className="grow1" to={`/growth/tasks/${rvTask.id}`}><b style={{ display: 'block', fontWeight: 600 }}>{m.name}</b><small className="muted" style={{ fontSize: 11.5 }}>{rvTask.moduleId ? `${api.moduleById(rvTask.moduleId).name}岗 · ` : ''}{rvTask.name}</small></Link>
              <StatusPill tone={rv.grade === '需改进' ? 'warn' : 'ok'} icon={rv.grade === '需改进' ? undefined : 'check'}>{rv.grade}</StatusPill>
            </div>
            <p className="quote hm-clamp">{rv.comment}</p>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>{fmtDate(rv.at)} 点评</p>
          </>; })() : <Empty icon="pen" title="还没有点评">交了产出后，带教的点评会出现在这里。</Empty>}
        </section>

        <section className="card vcol" style={{ gridArea: 'wait' }} aria-label="等待点评">
          <CardHead title="等待点评" sub={`${waiting.length} 份`} />
          {waiting.length ? (
            <div className="stack" style={{ gap: 8, marginTop: 12 }}>
              {waiting.map(w => {
                const late = w.dueAt ? t(w.dueAt) < t(now) : false;
                return (
                  <Link key={w.task.id} className="doc" to={`/growth/tasks/${w.task.id}`}>
                    <Tile icon="clock" domain="ment" />
                    <span className="grow1"><b>{w.task.name}</b><small>{w.mentor.name} 点评 · {w.dueAt ? `${fmtDue(w.dueAt, now)} 前` : '期限待定'}</small></span>
                    {late ? <StatusPill tone="due">已超时</StatusPill> : <Icon name="right" />}
                  </Link>
                );
              })}
            </div>
          ) : <Empty icon="inbox" title="没有在等的点评">交的产出都评完了。</Empty>}
          <p className="muted row" style={{ marginTop: 'auto', paddingTop: 10, fontSize: 11.5, gap: 6 }}><Icon name="info" size={13} />带教 2 个工作日内点评，超时抄送管理员</p>
        </section>

        <section className="card vcol" style={{ gridArea: 'res' }} aria-label="当前岗位资料">
          <CardHead title={pos ? `${pos.module.name}岗资料` : '岗位资料'} sub="当前站" />
          <div style={{ marginTop: 12 }}>
            {res.length ? res.map(r => (
              <button key={r.id} type="button" className="doc" style={{ width: '100%', textAlign: 'left' }} onClick={() => say('知识库二期接入，届时点开直接跳到飞书文档')}>
                <Tile icon={r.source.startsWith('FAQ') ? 'q' : 'doc'} domain="ment" /><span className="grow1"><b>{r.title}</b><small>{r.source} · {fmtDate(r.updatedAt)} 更新</small></span><Icon name="ext" />
              </button>
            )) : <Empty icon="book" title="这一站还没有资料" />}
          </div>
          <div className="row muted" style={{ marginTop: 'auto', paddingTop: 12, fontSize: 11.5, gap: 6 }}><Icon name="sync" size={13} />按当前轮岗站推送</div>
        </section>

        {rec ? (
          <section className="reco" style={{ gridArea: 'ai' }} aria-label="这一步可以用">
            <div className="r1"><span className="tile"><Icon name="spark" /></span>这一步可以用 · AI 推荐{recFor ? <span className="for">适合你正在写的<b>{recFor}</b></span> : <span className="for">团队里用得最多</span>}</div>
            <div className="row" style={{ alignItems: 'flex-end', gap: 24 }}>
              <div className="grow1">
                <h2><Link to={`/ai/assets/${rec.id}`} style={{ color: 'inherit' }}>{rec.title}</Link><span className="kbd">{rec.type.toUpperCase()}</span></h2>
                <p>{rec.summary}</p>
              </div>
              <div style={{ borderLeft: '1px solid rgba(255,255,255,.1)', paddingLeft: 20, display: 'grid', gap: 10, width: 188, flex: 'none' }}>
                <div className="row" style={{ fontSize: 12, color: '#C9CCE0' }}><Avatar name={api.userById(rec.authorId).name} color={api.userById(rec.authorId).color} solid size="sm" />作者 <b style={{ color: '#fff', fontWeight: 500 }}>{api.userById(rec.authorId).name}</b></div>
                <div className="row"><span className="bignum">{api.uses(rec)}</span><small style={{ fontSize: 12, color: '#C9CCE0' }}>人用过</small>
                  <span style={{ marginLeft: 'auto' }}><AvatarStack people={rec.usedBy.slice(0, 3).map(u => api.userById(u)).map(u => ({ name: u.name, color: u.color }))} /></span></div>
              </div>
            </div>
            {rec.usage && <div className="how">用法：{rec.usage}</div>}
            {rec.installCmd ? <CopyBox text={rec.installCmd} /> : <Link className="btn sec sm" style={{ marginTop: 12 }} to={`/ai/assets/${rec.id}`}>查看用法</Link>}
          </section>
        ) : <section className="card" style={{ gridArea: 'ai' }}><Empty icon="spark" title="这一步还没有推荐">去 AI 资产库看看大家在用什么。</Empty></section>}

        <Feed area="feed" />
        <LeaderBoard me={me} area="board" tid={false} />
        <TidCard area="tid" />
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
      {role === 'trainee' && <TraineeHome me={me} />}
      {role === 'mentor' && <MentorHome me={me} />}
      {role === 'admin' && <AdminHome me={me} />}
      {role === 'colleague' && <ColleagueHome me={me} />}
    </Sheet>
  );
}

// ---------- 本页样式（只作用于 hm- 前缀；需要时由主会话并入 app.css） ----------
const CSS = `
.hm-t { margin-top: 20px; display: grid; gap: var(--gap); grid-template-columns: 1fr 1fr 1.08fr 1.08fr; grid-template-rows: 176px 292px auto auto;
  grid-template-areas: "f1 f2 week prog" "rv wait week prog" "res ai ai board" "feed feed feed tid"; align-items: stretch; }
.hm-two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
.hm-two > div { display: grid; gap: 6px; padding: 12px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); }
.hm-two .l { font-size: 11.5px; color: var(--mute); }
.hm-two .v { font-family: var(--num); font-size: 26px; font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.hm-two .v small { font-size: 13px; font-weight: 600; color: var(--ink2); margin-left: 2px; }
.hm-two .s { font-size: 11px; color: var(--mute); }
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
