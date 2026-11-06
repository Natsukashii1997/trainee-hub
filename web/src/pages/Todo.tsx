import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import { Avatar, CardHead, Empty, Icon, MetaPill, PageHead, StatusPill, Tile, useSession, useToast, type Domain, type IconName, type Tone } from '../components/ui';
import * as api from '../data/api';
import type { Todo as TodoItem, TodoRule, User } from '../data/types';
import { TODO_RULE_LABEL } from '../data/types';
import { daysSince, fmtCn, fmtCountdown, fmtDate, fmtDateTime, fmtDue, fmtTime, fmtWeekday } from '../lib/time';
import { bjYmd } from '../lib/workday';

/* 待办（顶栏切面，PRD 3.4）：待办 = 事件 × 规则。页面只查询、分组和跳转；生成、关闭、改派都在数据层。
   管理员另有「汇总」：有逾期的人、点评积压（按带教人），是汇总查询，不是待办。 */

const LOOK: Record<TodoRule, { icon: IconName; domain: Domain }> = {
  R01: { icon: 'user', domain: 'acc' }, R02: { icon: 'pen', domain: 'grow' }, R03: { icon: 'sync', domain: 'grow' }, R04: { icon: 'clock', domain: 'grow' },
  R05: { icon: 'alert', domain: 'exam' }, R06: { icon: 'swap', domain: 'ment' }, R07: { icon: 'swap', domain: 'ment' }, R08: { icon: 'doc', domain: 'ment' },
  R09: { icon: 'inbox', domain: 'ment' }, R10: { icon: 'shield', domain: 'ai' }, R11: { icon: 'spark', domain: 'ai' }, R12: { icon: 'sync', domain: 'acc' },
};
/** 每条规则什么时候关闭（PRD 3.4 表的说明文字） */
const CLOSE: Record<TodoRule, string> = {
  R01: '指定角色或分配路径后关闭', R02: '写入点评后关闭；提交后 2 个工作日内评完，再超 3 个工作日抄送管理员', R03: '再次提交后关闭',
  R04: '完成后关闭；截止被调走会撤销', R05: '提交后关闭；截止调到未来会撤销', R06: '点「已准备」后关闭；开站日仍未确认会提示管理员',
  R07: '开站当天自动关闭', R08: '写入交接要点后关闭', R09: '遗留任务都有结论后关闭；站后 3 个工作日未评完转管理员',
  R10: '通过或退回后关闭', R11: '重新提交后关闭', R12: '连接恢复正常后关闭',
};

type Group = 'late' | 'today' | 'week' | 'later';
const GROUPS: { key: Group; title: string; hint: string; tone: Tone; color: string }[] = [
  { key: 'late', title: '已逾期', hint: '过了期限还没关闭', tone: 'due', color: 'var(--due)' },
  { key: 'today', title: '今天', hint: '今天之内到期', tone: 'warn', color: 'var(--warn)' },
  { key: 'week', title: '本周', hint: '本周日 24:00 前到期', tone: 'acc', color: 'var(--acc)' },
  { key: 'later', title: '以后', hint: '下周及以后，或期限待定', tone: 'plain', color: 'var(--faint)' },
];

const nameOf = (id?: string) => (id ? api.findUser(id)?.name ?? '—' : '—');
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

function groupOf(x: TodoItem, now: string, weekEnd: string): Group {
  if (!x.dueAt) return 'later';
  if (api.isTodoLate(x, now)) return 'late';
  if (bjYmd(x.dueAt) === bjYmd(now)) return 'today';
  return Date.parse(x.dueAt) < Date.parse(weekEnd) ? 'week' : 'later';
}

/** 对象：这条待办说的是谁、哪站、哪个东西 */
function subjectLine(x: TodoItem): string {
  switch (x.subjectType) {
    case 'task': {
      const t = api.taskById(x.subjectId);
      const s = t ? api.stationOfTask(t) : undefined;
      return [nameOf(x.personId), s && `${api.moduleById(s.moduleId).name}站`, t && (t.kind === 'path' ? '路径任务' : '周期任务')].filter(Boolean).join(' · ');
    }
    case 'station': {
      const s = api.stationById(x.subjectId);
      return s ? `${nameOf(s.userId)} · ${api.moduleById(s.moduleId).name}站 · ${fmtDate(s.startAt)}–${fmtDate(s.endAt)}` : '';
    }
    case 'user': { const u = api.findUser(x.subjectId); return u ? `${u.team}${u.firstLoginAt ? ` · ${fmtDate(u.firstLoginAt)} 首次登录` : ''}` : ''; }
    case 'asset': { const a = api.assetById(x.subjectId); return a ? `${a.type} · 作者 ${nameOf(a.authorId)} · ${a.version}` : ''; }
    case 'integration': return api.integrationsAll().find(i => i.id === x.subjectId)?.detail ?? '';
  }
}

/** 点了跳到能完成它的页面 */
function target(x: TodoItem, me: User): { to: string; label: string } {
  switch (x.rule) {
    case 'R01': return { to: '/admin/members', label: '去分配' };
    case 'R02': return { to: `/growth/tasks/${x.subjectId}`, label: x.ownerId === me.id ? '去点评' : '看任务' };
    case 'R03': return { to: `/growth/tasks/${x.subjectId}`, label: '去修改' };
    case 'R04': return { to: `/growth/tasks/${x.subjectId}`, label: x.title.startsWith('今天的测验') ? '看轻测' : '去完成' };
    case 'R05': return { to: `/growth/tasks/${x.subjectId}`, label: x.personId === me.id ? '去补交' : '看任务' };
    case 'R06': return { to: x.personId ? `/team/${x.personId}` : '/schedule/mentees', label: '看档案' };
    case 'R07': return { to: '/schedule/week', label: '看本周' };
    case 'R08': return { to: `/growth/handoff/${x.subjectId}`, label: '去写' };
    case 'R09': {
      const left = api.stationTasks(x.subjectId).find(t => t.status !== 'passed');
      return { to: left ? `/growth/tasks/${left.id}` : `/growth/handoff/${x.subjectId}`, label: '去处理' };
    }
    case 'R10': return { to: '/admin/review', label: '去审核' };
    case 'R11': return { to: `/ai/assets/${x.subjectId}`, label: '去修改' };
    case 'R12': return { to: '/', label: '看连接' };
  }
}

const COLS = '36px minmax(0,1fr) 132px 118px 156px';

function TodoRow({ x, closed }: { x: TodoItem; closed?: boolean }) {
  const { me } = useSession();
  const say = useToast();
  const now = api.now();
  const look = LOOK[x.rule];
  const late = !closed && api.isTodoLate(x, now);
  const go = target(x, me);
  const ownerIsMe = x.ownerId === me.id;
  const owner = api.findUser(x.ownerId);
  const canPrepare = !closed && x.rule === 'R06' && ownerIsMe;
  const canNudge = !closed && x.rule === 'R05' && ownerIsMe && x.personId !== me.id;
  const nudgeOk = canNudge && api.canNudgeNow(x.subjectId);
  const last = canNudge ? api.lastNudge(x.subjectId) : undefined;
  const prepare = () => { try { api.markStationPrepared(x.subjectId, me); say(`已确认准备好接 ${nameOf(x.personId)}，这条待办已关闭`); } catch (e) { say(err(e)); } };
  const nudge = () => { try { api.nudgeTask(x.subjectId, me); say(`已催办，带教机器人会推到 ${nameOf(x.personId)} 的飞书`); } catch (e) { say(err(e)); } };
  return (
    <div className="rw" style={{ gridTemplateColumns: COLS, minHeight: 64, padding: '10px 8px', alignItems: 'center', opacity: closed ? 0.72 : 1 }}>
      <Tile icon={look.icon} domain={look.domain} />
      <span style={{ minWidth: 0, paddingRight: 12 }}>
        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>{TODO_RULE_LABEL[x.rule]}</span>
          {x.escalated && <StatusPill tone="due">已转管理员</StatusPill>}
          {!ownerIsMe && x.cc.includes(me.id) && <StatusPill tone="info">抄送给我</StatusPill>}
          {ownerIsMe && x.cc.length > 0 && !x.escalated && <StatusPill tone="warn">已抄送管理员</StatusPill>}
        </span>
        <Link to={go.to} style={{ display: 'block', marginTop: 2, fontWeight: 500, lineHeight: 1.45, textDecoration: closed ? 'line-through' : undefined, color: closed ? 'var(--mute)' : undefined }}>{x.title}</Link>
        <small style={{ display: 'block', fontSize: 11.5, color: 'var(--mute)', marginTop: 2 }}>{subjectLine(x)}</small>
      </span>
      <span style={{ fontSize: 12 }}>
        {closed
          ? <><span>{x.status === 'done' ? '已完成' : '已撤销'}</span><small style={{ display: 'block', color: 'var(--mute)', fontSize: 11.5 }}>{x.closedAt ? fmtDateTime(x.closedAt) : '—'}</small></>
          : x.dueAt
            ? <><span style={{ fontWeight: 600, color: late ? 'var(--due-ink)' : groupOf(x, now, api.weekRange()[1]) === 'today' ? 'var(--exam-ink)' : 'var(--ink2)' }}>{fmtDue(x.dueAt, now)}</span>
              <small style={{ display: 'block', color: late ? 'var(--due-ink)' : 'var(--mute)', fontSize: 11.5 }}>{late ? (daysSince(x.dueAt, now) > 0 ? `已过 ${daysSince(x.dueAt, now)} 天` : '今天已过期限') : `还剩 ${fmtCountdown(x.dueAt, now)}`}</small></>
            : <span className="muted">期限待定</span>}
      </span>
      <span className="row" style={{ gap: 6, minWidth: 0, fontSize: 12.5 }}>
        {owner && <Avatar name={owner.name} color={owner.color} size="sm" />}
        <span style={{ minWidth: 0 }}>{ownerIsMe ? '我' : owner?.name ?? '—'}<small style={{ display: 'block', fontSize: 11, color: 'var(--mute)' }}>负责人</small></span>
      </span>
      <span className="end row" style={{ gap: 6 }}>
        {canPrepare && <button type="button" className="btn sec xs" onClick={prepare} title="告诉系统你已准备好接人，关闭这条待办"><Icon name="check" />已准备</button>}
        {canNudge && <button type="button" className="btn sec xs" disabled={!nudgeOk} onClick={nudge} title={nudgeOk ? '通过带教机器人推到飞书；同一任务 24 小时只能催一次' : `24 小时内已催过${last ? `（${fmtDateTime(last.at)}）` : ''}`}><Icon name="bell" />{nudgeOk ? '催一下' : '已催过'}</button>}
        <Link className="go" to={go.to}>{go.label}<Icon name="right" /></Link>
      </span>
    </div>
  );
}

function GroupCard({ g, list }: { g: typeof GROUPS[number]; list: TodoItem[] }) {
  return (
    <section className="card" aria-label={g.title} style={{ padding: '16px 14px 10px' }}>
      <div style={{ padding: '0 8px' }}>
        <CardHead title={<span className="row" style={{ gap: 8 }}><i style={{ width: 8, height: 8, borderRadius: 4, background: g.color }} />{g.title}<span className="num" style={{ color: 'var(--mute)', fontWeight: 600 }}>{list.length}</span></span>} sub={g.hint} />
      </div>
      {list.length
        ? <div className="rows" role="list">{list.map(x => <TodoRow key={x.id} x={x} />)}</div>
        : <p className="muted" style={{ padding: '10px 8px 6px', fontSize: 12.5 }}>{g.key === 'late' ? '没有逾期的，保持住。' : '这一段没有待办。'}</p>}
    </section>
  );
}

function AdminSummary() {
  const now = api.now();
  const overdue = api.activeTrainees()
    .map(u => ({ u, list: api.tasksOf(u.id).filter(t => api.isOverdue(t)) }))
    .filter(x => x.list.length)
    .sort((a, b) => b.list.length - a.list.length);
  const backlog = new Map<string, { n: number; late: number; oldest: string }>();
  for (const x of api.allTodos('open')) {
    if (x.rule !== 'R02' || !x.dueAt) continue;
    const b = backlog.get(x.ownerId) ?? { n: 0, late: 0, oldest: x.dueAt };
    b.n += 1; if (api.isTodoLate(x, now)) b.late += 1;
    if (Date.parse(x.dueAt) < Date.parse(b.oldest)) b.oldest = x.dueAt;
    backlog.set(x.ownerId, b);
  }
  const rows = [...backlog.entries()].sort((a, b) => b[1].late - a[1].late || b[1].n - a[1].n);
  return (
    <>
      <div className="note"><Icon name="info" /><span>下面两块是<b>汇总查询</b>，不是待办：不指定负责人，也不会自动关闭。具体的跟进待办落在各自带教名下。</span></div>
      <section className="card" aria-label="有逾期的人">
        <CardHead title="有逾期的人" sub={`${overdue.length} 人`} more={{ to: '/growth/board', label: '带教看板' }} />
        {overdue.length ? (
          <div className="list">
            {overdue.map(({ u, list }) => (
              <Link className="li" key={u.id} to={`/team/${u.id}`}>
                <Avatar name={u.name} color={u.color} size="sm" />
                <span className="tx"><b>{u.name}</b><span title={list.map(t => t.name).join('、')}>{list.slice(0, 2).map(t => t.name).join('、')}{list.length > 2 ? ` 等 ${list.length} 项` : ''}</span></span>
                <span className="end"><StatusPill tone="due">{list.length} 项</StatusPill></span>
              </Link>
            ))}
          </div>
        ) : <Empty icon="check" title="没有人逾期" />}
      </section>
      <section className="card" aria-label="点评积压">
        <CardHead title="点评积压" sub="按带教人" more={{ to: '/growth/board#review', label: '待点评' }} />
        {rows.length ? (
          <div className="list">
            {rows.map(([id, b]) => {
              const u = api.findUser(id);
              return (
                <div className="li" key={id}>
                  <Avatar name={u?.name ?? '—'} color={u?.color} size="sm" />
                  <span className="tx"><b>{u?.name ?? '—'}{id === api.adminId() ? '（无站带教的站）' : ''}</b><span>最早一份 {fmtDue(b.oldest, now)} 到期</span></span>
                  <span className="end">{b.late > 0 && <StatusPill tone="due">超时 {b.late}</StatusPill>}<StatusPill tone="plain">{b.n} 份</StatusPill></span>
                </div>
              );
            })}
          </div>
        ) : <Empty icon="check" title="没有积压" />}
      </section>
      <Link className="card link" to="/schedule/rotation" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Tile icon="cal" domain="ment" size="lg" />
        <span className="grow1"><b style={{ fontWeight: 600, display: 'block' }}>本周排期</b><small className="muted" style={{ fontSize: 12 }}>谁换站、评估节点、挤岗空岗，看轮岗排期</small></span>
        <Icon name="right" />
      </Link>
    </>
  );
}

function RuleGuide({ list }: { list: TodoItem[] }) {
  const rules = [...new Set(list.map(x => x.rule))].sort();
  return (
    <section className="card" aria-label="这些待办从哪来">
      <CardHead title="这些待办从哪来" sub="由规则生成，做完自动关闭" />
      {rules.length ? (
        <div className="list">
          {rules.map(r => (
            <div className="li" key={r} style={{ alignItems: 'flex-start' }}>
              <Tile icon={LOOK[r].icon} domain={LOOK[r].domain} size="sm" />
              <span className="tx"><b>{TODO_RULE_LABEL[r]} <em className="num muted" style={{ fontWeight: 500, fontStyle: 'normal' }}>× {list.filter(x => x.rule === r).length}</em></b><span style={{ lineHeight: 1.6 }}>{CLOSE[r]}</span></span>
            </div>
          ))}
        </div>
      ) : <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>现在没有待办。</p>}
      <div className="note" style={{ marginTop: 12 }}><Icon name="bot" /><span>人不在电脑前时，快到期的提醒由<b>带教机器人</b>推到飞书；这里看全部。</span></div>
    </section>
  );
}

export function Todo() {
  api.useDataVersion();
  const { me, role } = useSession();
  const [showClosed, setShowClosed] = useState(false);
  const now = api.now();
  const weekEnd = api.weekRange()[1];
  const open = api.todosOf(me.id);
  const done = api.todosOf(me.id, 'done');
  const cancelled = api.todosOf(me.id, 'cancelled');
  const closed = [...done, ...cancelled].sort((a, b) => Date.parse(b.closedAt ?? b.appearAt) - Date.parse(a.closedAt ?? a.appearAt));
  const by = (k: Group) => open.filter(x => groupOf(x, now, weekEnd) === k);
  const groups = GROUPS.map(g => ({ g, list: by(g.key) }));
  const lateN = groups[0].list.length, todayN = groups[1].list.length;
  const isAdmin = role === 'admin';
  return (
    <Sheet crumbs={[{ label: '待办' }]}>
      <PageHead
        kicker={<>{fmtCn(now)} {fmtWeekday(now)}<i aria-hidden="true" />{fmtTime(now)}</>}
        title={open.length ? <>{me.name}，有 <em>{open.length} 件待办</em>{lateN ? `，${lateN} 件已逾期` : ''}</> : <>{me.name}，<em>没有待办</em></>}
        sub="按紧急度排好了；点一条直接去能完成它的页面。待办由规则生成，做完会自动关闭，不用手动勾。"
        right={<>{GROUPS.slice(0, 3).map((g, i) => <MetaPill key={g.key}>{g.title} <b>{groups[i].list.length}</b></MetaPill>)}</>}
      />
      <div className="bento">
        <div className="stack s8">
          {open.length === 0 && <div className="card"><Empty size="lg" icon="check" title="手上没有待办">新的待办由规则生成：比如有人交了产出、快到截止、要换站。来了会出现在这里，首页焦点也取最急的两件。</Empty></div>}
          {open.length > 0 && groups.filter(x => x.list.length || x.g.key === 'late' || x.g.key === 'today').map(x => <GroupCard key={x.g.key} g={x.g} list={x.list} />)}
          <section className="card" aria-label="已完成和已撤销" style={{ padding: '14px 14px 10px' }}>
            <button type="button" className="row" style={{ width: '100%', padding: '0 8px', gap: 8 }} aria-expanded={showClosed} onClick={() => setShowClosed(v => !v)}>
              <Icon name={showClosed ? 'down' : 'right'} size={14} />
              <b style={{ fontWeight: 600, fontSize: 14 }}>已完成和已撤销</b>
              <span className="muted" style={{ fontSize: 12 }}>已完成 <span className="num">{done.length}</span> · 已撤销 <span className="num">{cancelled.length}</span></span>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{showClosed ? '收起' : '展开看'}</span>
            </button>
            {showClosed && (closed.length
              ? <div className="rows" role="list" style={{ marginTop: 8 }}>{closed.map(x => <TodoRow key={x.id} x={x} closed />)}</div>
              : <p className="muted" style={{ padding: '10px 8px 4px', fontSize: 12.5 }}>还没有关闭的待办。</p>)}
          </section>
        </div>
        <div className="stack s4">
          {isAdmin ? <AdminSummary /> : <RuleGuide list={open} />}
          {lateN + todayN > 0 && !isAdmin && (
            <div className="note warn"><Icon name="alert" /><span>先处理<b>已逾期</b>和<b>今天</b>的 {lateN + todayN} 件；首页「今日焦点」取的也是这几件里最急的两件。</span></div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
