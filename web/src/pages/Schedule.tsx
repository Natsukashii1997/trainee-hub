import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import {
  Avatar, CardHead, Countdown, DomainTag, Drawer, Empty, Icon, PageHead, Segmented, StatusPill, Tile, useSession, useToast,
  type Domain, type IconName, type Tone,
} from '../components/ui';
import { Gantt, GanttLegend, MiniMonth, WeekGrid, type AllDayItem, type GanttBar, type GanttCol, type GanttRow, type WeekDay, type WeekEvent } from '../components/schedule';
import * as api from '../data/api';
import { STATION_POS_LABEL, type Role, type ScheduleItem, type ScheduleKind, type User } from '../data/types';
import { fmtCn, fmtDate, fmtDue, fmtTime, fmtWeekday, isoWeek } from '../lib/time';
import { addDays, atBj, bjHm, bjYmd, daysBetween, isWorkday, mondayOf, workdaysBetween } from '../lib/workday';

/* 日程（顶栏切面，PRD 3.3、4.5）：我的本周 / 我带的人 / 轮岗排期 / 团队活动。日程项全部从数据层查询，不存。 */

const VIEWS = [
  { to: '/schedule/week', label: '我的本周' },
  { to: '/schedule/mentees', label: '我带的人' },
  { to: '/schedule/rotation', label: '轮岗排期' },
  { to: '/schedule/events', label: '团队活动', tag: '二期' },
];
const DEFAULT_VIEW: Record<Role, string> = { trainee: '/schedule/week', mentor: '/schedule/mentees', admin: '/schedule/rotation', colleague: '/schedule/events' };

/** /schedule：按角色跳到默认视角 */
export function ScheduleIndex() {
  const { role } = useSession();
  return <Navigate to={DEFAULT_VIEW[role]} replace />;
}

// ---------- 共用：日程项的样子与去处 ----------
export const KIND: Record<ScheduleKind, { label: string; domain: Domain; icon: IconName }> = {
  cohort: { label: '期次', domain: 'acc', icon: 'flag' },
  stage: { label: '阶段', domain: 'acc', icon: 'layers' },
  station: { label: '所在站', domain: 'acc', icon: 'route' },
  switch: { label: '换站', domain: 'acc', icon: 'swap' },
  taskOpen: { label: '任务开放期', domain: 'grow', icon: 'pen' },
  taskDue: { label: '路径任务', domain: 'grow', icon: 'pen' },
  reviseDue: { label: '修改截止', domain: 'grow', icon: 'repeat' },
  weekly: { label: '周报', domain: 'week', icon: 'doc' },
  quiz: { label: '轻测', domain: 'exam', icon: 'quiz' },
  material: { label: '营销物料', domain: 'week', icon: 'upload' },
  reviewDue: { label: '点评期限', domain: 'ment', icon: 'pen' },
  handoverDue: { label: '交接要点期限', domain: 'ment', icon: 'route' },
  assessment: { label: '评估节点', domain: 'exam', icon: 'flag' },
  teamEvent: { label: '团队活动', domain: 'team', icon: 'team' },
  holiday: { label: '假期', domain: 'week', icon: 'cal' },
};
const SOURCE_LABEL: Record<ScheduleItem['source'], string> = { derived: '按路径推算', rule: '周期规则展开', feishu: '飞书日历 · 只读' };
const STATUS: Record<NonNullable<ScheduleItem['status']>, [Tone, string]> = {
  overdue: ['due', '已逾期'], missed: ['plain', '未答'], passed: ['ok', '已通过'], submitted: ['info', '已提交'], revise: ['warn', '需修改'], doing: ['acc', '进行中'], todo: ['plain', '未开始'],
};
const isDone = (it: ScheduleItem) => it.status === 'submitted' || it.status === 'passed';

/** 日程项跳回所属对象的家：任务详情 / 站 / 活动 / 路径 */
export function refHref(it: ScheduleItem, viewer: User): string | null {
  switch (it.ref.type) {
    case 'task': return `/growth/tasks/${it.ref.id}`;
    case 'station': { const s = api.stationById(it.ref.id); if (!s) return null; return s.userId === viewer.id ? '/growth/me' : `/team/${s.userId}`; }
    case 'teamEvent': return `/schedule/events?e=${it.ref.id}`;
    case 'stage': case 'path': return it.personId === viewer.id ? '/growth/me' : it.personId ? `/team/${it.personId}` : '/growth/path';
    default: return null;
  }
}
export const REF_LABEL: Record<ScheduleItem['ref']['type'], string> = { task: '打开任务', station: '查看这一站', teamEvent: '查看活动', stage: '查看路径', path: '查看路径', calendar: '查看这一天' };

/** 短标题：多人格子里放得下 */
function shortTitle(it: ScheduleItem): string {
  switch (it.kind) {
    case 'quiz': return '轻测';
    case 'weekly': return '周报';
    case 'reviewDue': return '点评期限';
    case 'handoverDue': return '交接要点';
    case 'switch': return it.title.replace(/^换站 · /, '');
    case 'reviseDue': return '修改截止';
    case 'assessment': return '评估节点';
    case 'material': return '营销物料';
    default: return it.title;
  }
}
const minutesOf = (iso: string) => { const [h, m] = bjHm(iso).split(':').map(Number); return h * 60 + m; };
const today = () => bjYmd(api.now());
/** 某天所在周相对本周的偏移 */
const weekOffsetOf = (ymd: string) => Math.round(daysBetween(mondayOf(today()), mondayOf(ymd)) / 7);
/** 倒计时分段：2 天 4 小时 / 9 小时 36 分 */
export function cdParts(fromIso: string, toIso: string): [number, string][] {
  const min = Math.abs(Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 60000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d ? [[d, '天'], [h, '小时']] : h ? [[h, '小时'], [m, '分']] : [[m, '分']];
}

// ---------- 共用：翻页、页头、无权说明 ----------
function useOffset(key: string) {
  const [sp, setSp] = useSearchParams();
  const v = Number(sp.get(key) ?? 0) || 0;
  const set = (n: number) => setSp(prev => { const next = new URLSearchParams(prev); if (n) next.set(key, String(n)); else next.delete(key); return next; }, { replace: true });
  return [v, set] as const;
}
function Pager({ unit, offset, step = 1, onChange, todayLabel = '今天' }: { unit: string; offset: number; step?: number; onChange: (n: number) => void; todayLabel?: string }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <button type="button" className="btn sec sm" style={{ width: 36, padding: 0 }} aria-label={`上一${unit}`} title={`上一${unit}`} onClick={() => onChange(offset - step)}><Icon name="left" /></button>
      <button type="button" className="btn sec sm" style={{ width: 36, padding: 0 }} aria-label={`下一${unit}`} title={`下一${unit}`} onClick={() => onChange(offset + step)}><Icon name="right" /></button>
      <button type="button" className={offset === 0 ? 'btn sec sm' : 'btn pri sm'} onClick={() => onChange(0)} aria-pressed={offset === 0}>{todayLabel}</button>
    </div>
  );
}
function Shell({ label, children }: { label: string; children: ReactNode }) {
  return <Sheet crumbs={[{ label: '日程', to: '/schedule' }, { label }]} tabs={VIEWS}><style>{SCHEDULE_CSS}</style>{children}</Sheet>;
}
/** 视角对当前角色无权或没有数据时：说清为什么、去哪看 */
function NoAccess({ label, why, to, toLabel }: { label: string; why: ReactNode; to: string; toLabel: string }) {
  return (
    <Shell label={label}>
      <PageHead title={label} />
      <div className="card" style={{ marginTop: 20 }}>
        <Empty size="lg" icon="lock" title={`「${label}」不适用于你当前的身份`} action={<Link className="btn pri" to={to}>{toLabel}<Icon name="right" /></Link>}>{why}</Empty>
      </div>
    </Shell>
  );
}

// ================= 我的本周（管培生） =================
/** 一期「我的本周」只排：所在站与第几周、换站日、任务截止、周报、轻测、团队活动（跟岗、1:1 二期叠加） */
const WEEK_KINDS = new Set<ScheduleKind>(['station', 'switch', 'taskDue', 'reviseDue', 'weekly', 'quiz', 'material', 'teamEvent', 'holiday']);
const TYPE_GROUPS: { key: string; label: string; sub: string; kinds: ScheduleKind[]; domain: Domain }[] = [
  { key: 'task', label: '任务截止', sub: '路径任务与修改截止', kinds: ['taskDue', 'reviseDue', 'material'], domain: 'grow' },
  { key: 'quiz', label: '轻测', sub: '轮岗期每周四 20:00', kinds: ['quiz'], domain: 'exam' },
  { key: 'weekly', label: '周报', sub: '每周日 22:00 机器人收', kinds: ['weekly'], domain: 'week' },
  { key: 'team', label: '团队活动', sub: '飞书日历 · 只读', kinds: ['teamEvent'], domain: 'team' },
  { key: 'station', label: '站与换站', sub: '所在站、换站日', kinds: ['station', 'switch'], domain: 'acc' },
];
const START_H = 9, END_H = 22;

export function ScheduleWeek() {
  api.useDataVersion();
  const { me, role } = useSession();
  const nav = useNavigate();
  const [off, setOff] = useOffset('w');
  const [hidden, setHidden] = useState<string[]>([]);
  const [selId, setSelId] = useState<string | null>(null);

  if (role !== 'trainee' || !api.pathOf(me.id)) {
    return <NoAccess label="我的本周" to={DEFAULT_VIEW[role]} toLabel={role === 'mentor' ? '去看我带的人' : role === 'admin' ? '去看轮岗排期' : '去看团队活动'}
      why={<>「我的本周」按个人培养路径推算：在哪站第几周、哪天交什么、哪天换站。你没有在培的个人路径，所以这里没有内容。</>} />;
  }

  const now = api.now();
  const w = api.myWeek(me.id, me, off);
  const hiddenKinds = new Set(TYPE_GROUPS.filter(g => hidden.includes(g.key)).flatMap(g => g.kinds));
  const all = w.items.filter(i => WEEK_KINDS.has(i.kind));
  const shown = all.filter(i => !hiddenKinds.has(i.kind));
  const dayIdx = (iso: string) => w.days.findIndex(d => d.date === bjYmd(iso));
  /** 在站第几周：按「显示这周里与今天同一个星期几」算，本周与数据层的 weekInStation 一致 */
  const ref = addDays(bjYmd(now), off * 7);
  const weekNo = (startYmd: string, endYmd: string) => Math.max(1, Math.floor(daysBetween(startYmd, ref < endYmd ? ref : endYmd) / 7) + 1);
  const days: WeekDay[] = w.days.map((d, i) => ({ key: d.date, dow: fmtWeekday(d.startAt), date: Number(d.date.slice(8)), today: d.isToday, weekend: i >= 5, off: !d.workday }));

  // 全天行：站条、换站、假期、时间轴放不下的截止（如周日 22:00 周报）
  const allDay: AllDayItem[] = [];
  const events: WeekEvent[] = [];
  const weekStart = bjYmd(w.range[0]);
  for (const it of shown) {
    const k = KIND[it.kind];
    if (it.kind === 'station') {
      const s = api.stationById(it.ref.id);
      const from = Math.max(0, dayIdx(it.startAt)), to = dayIdx(it.endAt ?? it.startAt) < 0 ? 6 : dayIdx(it.endAt!);
      const wk = s ? weekNo(bjYmd(s.startAt), bjYmd(s.endAt)) : 0;
      allDay.push({ id: it.id, from, to, title: `${it.title} · 第 ${wk} 周`, right: `${fmtDate(it.startAt)}–${fmtDate(it.endAt ?? it.startAt)}`, icon: 'route', domain: 'acc' });
    } else if (it.kind === 'holiday') {
      const d = dayIdx(it.startAt);
      if (d >= 0) allDay.push({ id: it.id, from: d, to: d, title: it.title, icon: 'cal', domain: 'week' });
    } else if (it.kind === 'switch') {
      const d = dayIdx(it.startAt);
      if (d >= 0) allDay.push({ id: it.id, from: d, to: d, title: it.title, right: fmtTime(it.startAt), icon: 'swap', domain: 'acc' });
    } else {
      const d = dayIdx(it.startAt);
      if (d < 0) continue;
      const start = minutesOf(it.startAt);
      if (it.shape === 'span' && it.endAt) {
        events.push({ id: it.id, day: d, start, end: Math.min(minutesOf(it.endAt) || END_H * 60, END_H * 60), title: it.title.replace(/^(分享会|读书会|路演)：/, ''), time: `${fmtTime(it.startAt)}–${fmtTime(it.endAt)}`, domain: k.domain });
      } else if (start < START_H * 60 || start >= END_H * 60 - 30) {
        allDay.push({ id: it.id, from: d, to: d, title: `${fmtTime(it.startAt)} ${shortTitle(it)}`, icon: k.icon, domain: k.domain });
      } else {
        const done = isDone(it);
        const soon = !done && Date.parse(it.startAt) > Date.parse(now) && daysBetween(today(), bjYmd(it.startAt)) <= 1;
        events.push({ id: it.id, day: d, start, title: it.title, time: done ? '已提交' : it.status === 'overdue' ? `${fmtTime(it.startAt)} 已逾期` : fmtTime(it.startAt), icon: done ? 'check' : k.icon, domain: k.domain, done, tinted: soon || it.status === 'overdue' });
      }
    }
  }
  const nowDay = w.days.findIndex(d => d.isToday);
  const firstUpcoming = shown.find(i => i.kind !== 'station' && i.kind !== 'holiday' && Date.parse(i.startAt) >= Date.parse(now)) ?? shown.find(i => i.kind !== 'station');
  const sel = shown.find(i => i.id === selId) ?? firstUpcoming ?? null;

  // 左栏迷你月历：显示这一周周四所在的月
  const thu = addDays(weekStart, 3);
  const [y, m] = thu.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextFirst = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const monthItems = [
    ...api.personSchedule(me.id, me, [atBj(first), atBj(nextFirst)]).filter(i => WEEK_KINDS.has(i.kind) && i.shape !== 'span'),
    ...api.teamCalendar(y, m).items.filter(i => i.kind === 'teamEvent'),
  ];
  const cal = api.workdayCalendar();
  const monthDays = Array.from({ length: daysBetween(first, nextFirst) }, (_, i) => addDays(first, i));
  const t = today();
  const gotoMonth = (dir: 1 | -1) => {
    const target = dir === 1 ? nextFirst : `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}-01`;
    setOff(target.slice(0, 7) === t.slice(0, 7) ? 0 : weekOffsetOf(target));
    setSelId(null);
  };

  // 右栏「接下来」：从现在起的三条（含下周）
  const upcoming = [...w.items, ...(off === 0 ? api.myWeek(me.id, me, 1).items : [])]
    .filter(i => WEEK_KINDS.has(i.kind) && i.shape !== 'span' && i.kind !== 'holiday' && Date.parse(i.startAt) > Date.parse(now) && i.id !== sel?.id)
    .filter((i, k, arr) => arr.findIndex(x => x.id === i.id) === k).slice(0, 3);

  const station = w.station;
  const thisWeekNow = station ? weekNo(bjYmd(station.startAt), bjYmd(station.endAt)) : 0;
  const switchIn = all.find(i => i.kind === 'switch');
  const prefix = off === 0 ? '这周' : off === 1 ? '下周' : off === -1 ? '上周' : `第 ${isoWeek(w.range[0])} 周`;

  return (
    <Shell label="我的本周">
      <PageHead
        kicker={<>第 {isoWeek(w.range[0])} 周<i aria-hidden="true" />{fmtDate(w.range[0])} – {fmtDate(atBj(addDays(weekStart, 6)))}{off === 0 ? <><i aria-hidden="true" />本周</> : null}</>}
        title={switchIn ? <>{prefix}{fmtWeekday(switchIn.startAt)}<em>{switchIn.title.replace(/^换站 · /, '换')}</em></> : station ? <>{prefix}在<em>{w.module?.name}站第 {thisWeekNow} 周</em></> : <>{prefix}的安排</>}
        sub={w.nextStation ? <>下一站 <b>{api.moduleById(w.nextStation.moduleId).name}站</b> · {fmtCn(w.nextStation.startAt)} {fmtWeekday(w.nextStation.startAt)}开始，还有 {Math.max(0, workdaysBetween(now, w.nextStation.startAt, cal))} 个工作日</> : undefined}
        right={<Pager unit="周" offset={off} onChange={n => { setOff(n); setSelId(null); }} />}
      />
      <div className="sx-cal" style={{ marginTop: 20 }}>
        <div className="stack">
          <MiniMonth year={y} month={m} today={t.slice(0, 7) === first.slice(0, 7) ? Number(t.slice(8)) : undefined}
            selected={off === 0 ? undefined : Number(thu.slice(8))}
            marks={[...new Set(monthItems.map(i => Number(bjYmd(i.startAt).slice(8))))]}
            off={monthDays.filter(d => !isWorkday(d, cal)).map(d => Number(d.slice(8)))}
            onPick={d => { setOff(weekOffsetOf(`${first.slice(0, 8)}${String(d).padStart(2, '0')}`)); setSelId(null); }}
            onPrev={() => gotoMonth(-1)} onNext={() => gotoMonth(1)} />
          <div className="card tight">
            <div className="sec-l" style={{ marginTop: 0, padding: '0 4px' }}>范围</div>
            <Segmented full value="me" onChange={v => nav(v === 'mt' ? '/schedule/mentees' : '/schedule/events')}
              options={[{ value: 'me', label: '我的' }, { value: 'mt', label: '我带的人', disabled: true, title: '只给带教人和管理员' }, { value: 'all', label: '全团队' }]} />
            <p className="muted" style={{ fontSize: 11.5, margin: '6px 4px 0' }}>「我带的人」只给带教人和管理员</p>
            <div className="sec-l" style={{ padding: '0 4px' }}>类型</div>
            <div className="sx-types">
              {TYPE_GROUPS.map(g => {
                const on = !hidden.includes(g.key);
                const n = all.filter(i => g.kinds.includes(i.kind)).length;
                return (
                  <button key={g.key} type="button" className={`d-${g.domain}${on ? '' : ' off'}`} aria-pressed={on} onClick={() => setHidden(h => (on ? [...h, g.key] : h.filter(x => x !== g.key)))}>
                    <span className="bx">{on && <Icon name="check" />}</span>
                    <span className="grow1"><b>{g.label}</b><small>{g.sub}</small></span>
                    <span className="n">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="divider" style={{ margin: '10px 4px' }} />
            <p className="muted row" style={{ fontSize: 11.5, padding: '0 4px', alignItems: 'flex-start', gap: 6 }}><Icon name="info" size={13} />跟岗、1:1 二期从飞书日历叠加；截止和换站由工作台推算，不写飞书。</p>
          </div>
        </div>
        <WeekGrid label="我的本周" days={days} events={events} allDay={allDay} startHour={START_H} endHour={END_H} hourHeight={40}
          now={nowDay >= 0 ? { day: nowDay, minutes: minutesOf(now), label: fmtTime(now) } : undefined}
          selectedId={sel?.id} onSelect={setSelId} />
        <ItemDetail item={sel} me={me} upcoming={upcoming} onPick={id => { if (shown.some(i => i.id === id)) setSelId(id); }} />
      </div>
    </Shell>
  );
}

/** 右栏：选中日程项的详情 + 接下来 */
function ItemDetail({ item, me, upcoming, onPick }: { item: ScheduleItem | null; me: User; upcoming: ScheduleItem[]; onPick: (id: string) => void }) {
  const now = api.now();
  if (!item) return <aside className="card"><Empty icon="cal" title="这周没有安排">换一周看看，或打开左侧的类型开关。</Empty></aside>;
  const k = KIND[item.kind];
  const href = refHref(item, me);
  const detail = item.ref.type === 'task' ? api.taskDetail(item.ref.id, me) : null;
  const station = item.ref.type === 'station' ? api.stationById(item.ref.id) : detail?.station;
  const ev = item.ref.type === 'teamEvent' ? api.teamEventById(item.ref.id) : undefined;
  const future = Date.parse(item.startAt) > Date.parse(now);
  const st = detail ? (detail.overdue ? ['due', '已逾期'] as [Tone, string] : [isDone(item) ? (item.status === 'passed' ? 'ok' : 'info') : item.status === 'revise' ? 'warn' : item.status === 'doing' ? 'acc' : 'plain', detail.statusLabel] as [Tone, string]) : item.status ? STATUS[item.status] : null;
  let desc: ReactNode = null;
  if (detail) desc = detail.template?.desc ?? detail.task.note;
  else if (ev) desc = <>{ev.topic ?? ev.title}{ev.speakerId && <><br />主讲 {api.userById(ev.speakerId).name} · {ev.place}</>}</>;
  else if (item.kind === 'station' && station) desc = <>站带教 {api.userById(api.stationMentorOf(station)).name}{station.stationMentorId ? '' : '（未指定，由管理员接）'} · 本站任务 {api.stationSettle(station).passed} / {api.stationSettle(station).total} 已通过</>;
  else if (item.kind === 'switch' && station) desc = <>从这天起到{api.moduleById(station.moduleId).name}站，站带教 {api.userById(api.stationMentorOf(station)).name}。开站前 5 个工作日机器人会在飞书提醒你。</>;
  else if (item.kind === 'holiday') desc = '按工作日日历，这天不排截止。';
  const when = item.shape === 'span' && item.endAt
    ? (item.kind === 'teamEvent' ? `${fmtDate(item.startAt)} ${fmtWeekday(item.startAt)} ${fmtTime(item.startAt)}–${fmtTime(item.endAt)}` : `${fmtDate(item.startAt)} – ${fmtDate(item.endAt)}`)
    : `${fmtDue(item.startAt, now)}${item.shape === 'deadline' ? ' 截止' : ''}`;
  return (
    <aside className="card vcol" aria-label="日程详情" style={{ minHeight: 560 }}>
      <div className="row"><Tile icon={k.icon} domain={k.domain} size="lg" /><DomainTag domain={k.domain}>{k.label}</DomainTag><span className="typ" style={{ marginLeft: 'auto' }}>{SOURCE_LABEL[item.source]}</span></div>
      <h2 style={{ marginTop: 14, fontSize: 'var(--fs-xl)', fontWeight: 600, lineHeight: 1.35 }}>{detail?.task.name ?? item.title}</h2>
      <div className="well" style={{ marginTop: 14, padding: 14 }}>
        <div className="row" style={{ fontSize: 12, color: `var(--${k.domain === 'acc' ? 'acc' : k.domain}-ink)`, fontWeight: 500, gap: 6 }}><Icon name="clock" size={13} />{when}</div>
        {item.shape !== 'span' && !isDone(item) && <div style={{ marginTop: 8 }}>{future ? <Countdown label="还剩" parts={cdParts(now, item.startAt)} /> : <Countdown label="已过" parts={cdParts(item.startAt, now)} />}</div>}
        {isDone(item) && <div className="row" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--grow-ink)' }}><Icon name="check" size={14} />已交付，等带教点评</div>}
      </div>
      <div className="dl" style={{ marginTop: 16 }}>
        {desc && <div><span className="k">说明</span><span className="v">{desc}</span></div>}
        {st && <div><span className="k">状态</span><span className="v"><StatusPill tone={st[0]}>{st[1]}</StatusPill></span></div>}
        {station && item.kind !== 'station' && <div><span className="k">关联</span><span className="v"><StatusPill tone="info" icon="link">{api.moduleById(station.moduleId).name}站 · {fmtDate(station.startAt)}–{fmtDate(station.endAt)}</StatusPill></span></div>}
      </div>
      <div className="stack" style={{ marginTop: 18, gap: 8 }}>
        {href && <Link className="btn pri full" to={href}>{detail?.task.completion === 'bot-quiz' ? '查看轻测' : REF_LABEL[item.ref.type]}<Icon name="right" /></Link>}
        {ev?.minutesUrl && <a className="btn sec full" href={ev.minutesUrl} target="_blank" rel="noopener noreferrer"><Icon name="ext" />在飞书中打开回放</a>}
        {detail?.task.completion === 'bot-quiz' && <p className="muted" style={{ fontSize: 11.5, textAlign: 'center' }}>轻测在飞书里由机器人出题，成绩自动写回</p>}
        {detail?.task.completion === 'bot-weekly' && <p className="muted" style={{ fontSize: 11.5, textAlign: 'center' }}>周报发给飞书里的带教机器人，不在网页提交</p>}
      </div>
      <div className="divider" style={{ margin: '18px 0 4px' }} />
      <div className="sec-l" style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>接下来</div>
      {upcoming.length ? (
        <div className="stack" style={{ gap: 6 }}>
          {upcoming.map(u => {
            const uk = KIND[u.kind];
            return (
              <button key={u.id} type="button" className={`sx-next d-${uk.domain}`} onClick={() => onPick(u.id)}>
                <i aria-hidden="true" /><span className="grow1"><b>{u.title}</b><small>{uk.label}</small></span><span className="num">{fmtDue(u.startAt, now)}</span>
              </button>
            );
          })}
        </div>
      ) : <p className="muted" style={{ fontSize: 12 }}>这周后面没有别的安排了。</p>}
    </aside>
  );
}

// ================= 我带的人（带教） =================
type MenteeData = ReturnType<typeof api.myMentees>;
const CELL_SKIP = new Set<ScheduleKind>(['station', 'taskOpen', 'holiday']);

/** 多人周视图：行 = 人（分在带 / 将到 / 刚交接出去），列 = 天；格内是截止、点评期限、换站。首页带教的「我带的人」也用它（compact） */
export function MenteeGrid({ data, viewer, days: nDays, compact, onCell }: { data: MenteeData; viewer: User; days?: number; compact?: boolean; onCell?: (userId: string, date: string) => void }) {
  const days = data.days.slice(0, nDays ?? data.days.length);
  const now = api.now();
  const cols = days.map(d => (d.workday ? '1fr' : compact ? '0.7fr' : '0.8fr')).join(' ');
  const idx = (iso: string) => days.findIndex(d => d.date === bjYmd(iso));
  const groups = (['current', 'incoming', 'handedOff'] as const);
  const GROUP_SUB = { current: '正在你这一站', incoming: '下一站归你，开站前 5 个工作日起能看此前产出', handedOff: '已离开你这站，还有你名下的待办或交接期内' };
  return (
    <div className={`sx-mt${compact ? ' compact' : ''}`} style={{ '--cols': cols } as CSSProperties}>
      <div className="r h">
        <div className="lab">成员</div>
        {days.map(d => <div key={d.date} className={`dh${d.isToday ? ' today' : ''}${d.workday ? '' : ' we'}`}><span>{fmtWeekday(d.startAt)}</span><b>{Number(d.date.slice(8))}</b>{d.holiday && !compact && <small>{d.holiday}</small>}</div>)}
      </div>
      {groups.map(g => {
        const rows = data.groups[g];
        if (compact && !rows.length) return null;
        return (
          <div key={g} className="sx-grp">
            <div className="gh"><b>{api.MENTEE_GROUP_LABEL[g]}</b><span className="num">{rows.length} 人</span>{!compact && <small>{GROUP_SUB[g]}</small>}</div>
            {!rows.length && <div className="none">暂时没有</div>}
            {rows.map(r => {
              const bands = r.items.filter(i => i.kind === 'station');
              return (
                <div key={r.user.id} className="r p">
                  <Link className="lab" to={`/team/${r.user.id}`} title={`打开 ${r.user.name} 的档案`}>
                    <Avatar name={r.user.name} color={r.user.color} size="sm" />
                    <span className="grow1"><b>{r.user.name}</b><small>{r.module.name}站{compact ? '' : ` · ${fmtDate(r.station.startAt)}–${fmtDate(r.station.endAt)}`}</small></span>
                    {r.openTodos > 0 && <span className="todo" title={`你名下有 ${r.openTodos} 条与 ${r.user.name} 有关的待办`}>{r.openTodos}</span>}
                  </Link>
                  {bands.map(b => {
                    const s = api.stationById(b.ref.id);
                    const from = Math.max(0, idx(b.startAt) < 0 ? 0 : idx(b.startAt));
                    const endI = idx(b.endAt ?? b.startAt);
                    const to = endI < 0 ? days.length - 1 : endI;
                    if (Date.parse(b.startAt) >= Date.parse(atBj(addDays(days[days.length - 1].date, 1)))) return null;
                    const mine = s && api.stationMentorOf(s) === viewer.id;
                    return <div key={b.id} className={`bd ${mine ? 'd-ment mine' : 'd-week'}`} style={{ gridColumn: `${from + 2} / ${to + 3}` }} title={`${b.title} ${fmtDate(b.startAt)}–${fmtDate(b.endAt ?? b.startAt)}`}>{b.title}{s && !mine && <small>· {api.userById(api.stationMentorOf(s)).name}</small>}</div>;
                  })}
                  {days.map((d, di) => {
                    const items = r.items.filter(i => !CELL_SKIP.has(i.kind) && bjYmd(i.startAt) === d.date);
                    const cls = `c${d.isToday ? ' today' : ''}${d.workday ? '' : ' we'}`;
                    const chips = items.slice(0, compact ? 2 : 3).map(i => {
                      const k = KIND[i.kind];
                      const late = i.status === 'overdue' || (i.kind === 'reviewDue' && Date.parse(i.startAt) < Date.parse(now));
                      return <span key={i.id} title={`${i.title} · ${fmtTime(i.startAt)}`} className={`sx-chip d-${k.domain}${late ? ' late' : ''}${isDone(i) ? ' done' : ''}`}><Icon name={isDone(i) ? 'check' : k.icon} />{shortTitle(i)}</span>;
                    });
                    const more = items.length - chips.length;
                    return onCell && items.length
                      ? <button key={d.date} type="button" className={cls} style={{ gridColumn: di + 2 }} onClick={() => onCell(r.user.id, d.date)} aria-label={`${r.user.name} ${fmtDate(d.startAt)} 有 ${items.length} 项`}>{chips}{more > 0 && <span className="more">还有 {more} 项</span>}</button>
                      : <div key={d.date} className={cls} style={{ gridColumn: di + 2 }}>{chips}{more > 0 && <span className="more">+{more}</span>}</div>;
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function ScheduleMentees() {
  api.useDataVersion();
  const { me, role } = useSession();
  const say = useToast();
  const [off, setOff] = useOffset('w');
  const [cell, setCell] = useState<{ userId: string; date: string } | null>(null);
  if (role !== 'mentor' && role !== 'admin') {
    return <NoAccess label="我带的人" to={DEFAULT_VIEW[role]} toLabel={role === 'trainee' ? '去看我的本周' : '去看团队活动'}
      why={<>「我带的人」只给带教人和管理员：列出所带管培生谁哪天交、带教哪天要评完、谁下周到站。其他人的任务状态不对你公开。</>} />;
  }
  const now = api.now();
  const data = api.myMentees(me, off);
  const sum = api.mentorSummary(me);
  const total = data.groups.current.length + data.groups.incoming.length + data.groups.handedOff.length;
  const lastDay = data.days[data.days.length - 1];
  const row = cell ? [...data.groups.current, ...data.groups.incoming, ...data.groups.handedOff].find(r => r.user.id === cell.userId) : undefined;
  const cellItems = row && cell ? row.items.filter(i => !CELL_SKIP.has(i.kind) && bjYmd(i.startAt) === cell.date) : [];
  const nudge = (taskId: string) => {
    try { api.nudgeTask(taskId, me); say('已发出催办，机器人会在飞书提醒对方'); } catch (e) { say((e as Error).message); }
  };
  return (
    <Shell label="我带的人">
      <PageHead
        kicker={<>两周 · {fmtDate(data.range[0])} – {fmtDate(lastDay.startAt)}<i aria-hidden="true" />第 {isoWeek(data.range[0])}–{isoWeek(lastDay.startAt)} 周</>}
        title={<>在带 <em>{sum.current} 人</em>{sum.incomingAt ? <> · {fmtDate(sum.incomingAt)} 到站 {sum.incoming} 人</> : null}{sum.leftoverUnreviewed ? <> · 上一站还有 {sum.leftoverUnreviewed} 份没评</> : null}</>}
        sub={role === 'admin' ? '你看到的是没有指定站带教、由你接手的站。各位带教的情况在「轮岗排期 · 按带教」。' : '谁哪天交、你哪天要评完、谁哪天到。点格子看当天详情；人和进度在带教看板。'}
        right={<><Link className="btn sec sm" to="/growth/board"><Icon name="grid" />带教看板</Link><Pager unit="两周" step={2} offset={off} onChange={setOff} todayLabel="本周" /></>}
      />
      <div className="card" style={{ marginTop: 20, padding: '14px 16px 16px' }}>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap', padding: '0 4px 12px' }}>
          {(['taskDue', 'reviewDue', 'switch', 'quiz', 'weekly', 'handoverDue'] as ScheduleKind[]).map(k => <DomainTag key={k} domain={KIND[k].domain} variant="dot">{KIND[k].label}</DomainTag>)}
          <span className="dtag"><i style={{ background: 'var(--due)' }} />已逾期 / 已超时</span>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>只列你有权看的条目</span>
        </div>
        {total ? <MenteeGrid data={data} viewer={me} onCell={(userId, date) => setCell({ userId, date })} />
          : <Empty size="lg" icon="team" title="这两周没有你带的人">往后翻翻，或去轮岗排期看谁什么时候到你这站。</Empty>}
      </div>
      <Drawer open={!!row && !!cell} onClose={() => setCell(null)} width={440}
        title={row ? `${row.user.name} · ${cell ? `${fmtCn(atBj(cell.date))} ${fmtWeekday(atBj(cell.date))}` : ''}` : ''}
        sub={row ? `${api.MENTEE_GROUP_LABEL[row.group]} · ${row.module.name}站 ${fmtDate(row.station.startAt)}–${fmtDate(row.station.endAt)}` : undefined}
        head={row && <div className="row"><Avatar name={row.user.name} color={row.user.color} /><StatusPill tone="info">站带教 {api.userById(api.stationMentorOf(row.station)).name}</StatusPill></div>}
        footer={row && <><Link className="btn ghost" to={`/team/${row.user.id}`}>个人档案</Link><Link className="btn sec" to="/growth/board">带教看板</Link></>}>
        <div className="stack" style={{ gap: 10 }}>
          {cellItems.map(i => {
            const k = KIND[i.kind];
            const href = refHref(i, me);
            const st = i.status ? STATUS[i.status] : null;
            const task = i.ref.type === 'task' ? api.taskById(i.ref.id) : undefined;
            // 能催的人：负责带教、主带教、管理员（数据层 nudgeTask 同口径）
            const canNudge = !!task && i.status === 'overdue' && api.canNudgeNow(task.id) && (api.canReview(me, task) || api.mainMentorOf(task.userId) === me.id);
            return (
              <div key={i.id} className="well" style={{ padding: 12 }}>
                <div className="row"><Tile icon={k.icon} domain={k.domain} size="sm" /><span className="grow1" style={{ fontWeight: 600 }}>{i.title}</span>{st && <StatusPill tone={st[0]}>{st[1]}</StatusPill>}</div>
                <div className="row" style={{ marginTop: 8, fontSize: 12, color: 'var(--mute)' }}>
                  <span>{k.label} · {fmtTime(i.startAt)}{i.kind === 'reviewDue' && Date.parse(i.startAt) < Date.parse(now) ? ' · 已超时' : ''}</span>
                  <span className="row" style={{ marginLeft: 'auto', gap: 6 }}>
                    {canNudge && <button type="button" className="btn sec xs" onClick={() => nudge(i.ref.id)}><Icon name="bell" />飞书催一下</button>}
                    {href && <Link className="btn pri xs" to={href}>{i.kind === 'reviewDue' ? '去点评' : REF_LABEL[i.ref.type]}</Link>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Drawer>
    </Shell>
  );
}

// ================= 轮岗排期（只读） =================
const LINE_DOMAIN: Record<string, Domain> = { 客户线: 'ment', 老师线: 'grow', 市场线: 'team', AIBP: 'ai' };
type RotView = 'person' | 'module' | 'mentor';
type BarInfo = { kind: 'station'; stationId: string } | { kind: 'people'; title: string; sub: string; userIds: string[] };

export function ScheduleRotation() {
  api.useDataVersion();
  const { me, role } = useSession();
  const [view, setView] = useState<RotView>(role === 'mentor' ? 'mentor' : 'person');
  const [pick, setPick] = useState<{ id: string; info: BarInfo } | null>(null);
  const rp = api.rotationPlan();
  const now = api.now();
  const showEval = role === 'admin' || role === 'mentor';
  const rotIds = useMemo(() => new Set(api.rotationModules().map(m => m.id)), []);

  if (!rp.periods.length) return <Shell label="轮岗排期"><PageHead title="轮岗排期" /><div className="card" style={{ marginTop: 20 }}><Empty size="lg" icon="route" title="还没有轮岗安排">期次启动、个人路径生成后，这里会按人排出六站。</Empty></div></Shell>;

  const start = rp.periods[0].from, end = rp.periods[rp.periods.length - 1].to;
  const n = Math.ceil((daysBetween(start, end) + 1) / 7);
  const t = today();
  const cols: GanttCol[] = Array.from({ length: n }, (_, i) => {
    const from = addDays(start, i * 7), to = addDays(from, 6);
    return { key: from, label: fmtDate(atBj(from)), sub: `W${isoWeek(atBj(from))}`, current: from <= t && t <= to, holiday: rp.holidays.some(h => h.date >= from && h.date <= to) };
  });
  const colOf = (ymd: string) => Math.floor(daysBetween(start, ymd) / 7);
  const spanOf = (from: string, to: string) => Math.max(1, Math.ceil((daysBetween(from, to) + 1) / 7));
  const crowdedCols = (pFrom: string, pTo: string) => Array.from({ length: spanOf(pFrom, pTo) }, (_, k) => colOf(pFrom) + k);
  const evalCols = showEval ? rp.assessments.map(a => ({ col: colOf(bjYmd(a.at)), label: `${api.stageById(a.stageId).name}阶段评估节点 · ${fmtDate(a.at)}` })).filter(x => x.col >= 0 && x.col < n) : [];
  const mentorName = (id?: string | null) => (id ? api.userById(id).name : '未指定');

  const personRows: GanttRow[] = rp.byPerson.map(p => {
    const st = p.stations.filter(s => rotIds.has(s.module.id));
    const clashes = rp.stats.crowded.filter(c => c.userIds.includes(p.user.id)).flatMap(c => crowdedCols(c.from, c.to));
    return {
      id: p.user.id, label: p.user.id === me.id ? `${p.user.name}（我）` : p.user.name, sub: `主带教 ${p.mainMentorId ? api.userById(p.mainMentorId).name : `未设（${api.userById(api.adminId()).name}）`}`,
      lead: <Avatar name={p.user.name} color={p.user.color} size="sm" />,
      bars: st.map(s => ({
        id: s.station.id, from: colOf(bjYmd(s.station.startAt)), span: spanOf(bjYmd(s.station.startAt), bjYmd(s.station.endAt)),
        label: s.module.name, sub: mentorName(s.mentorId), domain: LINE_DOMAIN[s.module.line ?? ''] ?? 'acc',
        state: s.pos === 'left' ? 'done' as const : s.pos === 'current' ? 'cur' as const : undefined,
        title: `${p.user.name} · ${s.module.name}站 ${fmtDate(s.station.startAt)}–${fmtDate(s.station.endAt)} · 站带教 ${mentorName(s.mentorId)}`,
      })),
      clashes,
      markers: [
        ...st.filter(s => s.station.order > 0 && colOf(bjYmd(s.station.startAt)) > 0 && Date.parse(s.station.startAt) > Date.parse(now)).map(s => ({ col: colOf(bjYmd(s.station.startAt)), kind: 'switch' as const, label: `${fmtDate(s.station.startAt)} 换到${s.module.name}站` })),
        ...evalCols.map(e => ({ col: e.col, kind: 'eval' as const, label: e.label })),
      ],
    };
  });
  const moduleRows: GanttRow[] = rp.byModule.map(m => ({
    id: m.module.id, label: `${m.module.name}岗`, sub: m.module.line ?? '',
    lead: <Tile icon="route" domain={LINE_DOMAIN[m.module.line ?? ''] ?? 'acc'} size="sm" />,
    bars: m.periods.map(p => ({
      id: `${m.module.id}-${p.from}`, from: colOf(p.from), span: spanOf(p.from, p.to),
      label: p.empty ? '空岗' : `${p.userIds.length} 人`, sub: p.userIds.map(u => api.userById(u).name).join(' '),
      domain: p.crowded ? 'exam' as Domain : LINE_DOMAIN[m.module.line ?? ''] ?? 'acc', state: p.empty ? 'plan' as const : undefined,
      title: `${m.module.name}岗 ${fmtDate(atBj(p.from))}–${fmtDate(atBj(p.to))}：${p.empty ? '空岗' : p.userIds.map(u => api.userById(u).name).join('、')}`,
    })),
    clashes: m.periods.filter(p => p.crowded || p.empty).flatMap(p => crowdedCols(p.from, p.to)),
  }));
  const mentorRows: GanttRow[] = rp.byMentor.map(b => ({
    id: b.mentorId ?? 'none', label: b.mentorId === me.id ? `${b.name}（我）` : b.name, sub: `同时最多带 ${b.max} 人`,
    lead: b.mentorId ? <Avatar name={api.userById(b.mentorId).name} color={api.userById(b.mentorId).color} size="sm" /> : <Tile icon="user" domain="week" size="sm" />,
    bars: b.periods.filter(p => p.userIds.length).map(p => ({
      id: `${b.mentorId ?? 'none'}-${p.from}`, from: colOf(p.from), span: spanOf(p.from, p.to), label: `带 ${p.userIds.length} 人`,
      sub: p.userIds.map(u => api.userById(u).name).join(' '), domain: b.mentorId ? 'ment' as Domain : 'week' as Domain,
      title: `${b.name} ${fmtDate(atBj(p.from))}–${fmtDate(atBj(p.to))}：${p.userIds.map(u => api.userById(u).name).join('、')}`,
    })),
  }));
  const rows = view === 'person' ? personRows : view === 'module' ? moduleRows : mentorRows;
  const onBar = (bar: GanttBar) => {
    if (view === 'person') { setPick({ id: bar.id, info: { kind: 'station', stationId: bar.id } }); return; }
    const src = view === 'module' ? rp.byModule.flatMap(m => m.periods.map(p => ({ id: `${m.module.id}-${p.from}`, title: `${m.module.name}岗`, p }))) : rp.byMentor.flatMap(b => b.periods.map(p => ({ id: `${b.mentorId ?? 'none'}-${p.from}`, title: b.name, p })));
    const hit = src.find(x => x.id === bar.id);
    if (hit) setPick({ id: bar.id, info: { kind: 'people', title: hit.title, sub: `${fmtDate(atBj(hit.p.from))} – ${fmtDate(atBj(hit.p.to))}`, userIds: hit.p.userIds } });
  };

  // 顶部汇总：按段列出挤岗、空岗
  const byPeriod = rp.periods.map(p => ({
    p, crowded: rp.stats.crowded.filter(c => c.from === p.from), empty: rp.stats.empty.filter(c => c.from === p.from),
  })).filter(x => x.crowded.length || x.empty.length);
  const nextSwitch = rp.switches.find(s => Date.parse(s.at) > Date.parse(now));
  const nextEval = rp.assessments.filter(a => Date.parse(a.at) > Date.parse(now)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  const futureIssues = byPeriod.filter(x => x.p.to >= t);

  const station = pick?.info.kind === 'station' ? api.stationById(pick.info.stationId) : undefined;
  const owner = station ? api.userById(station.userId) : undefined;
  const settle = station && api.canSeeTaskStatus(me, station.userId) ? api.stationSettle(station) : null;

  return (
    <Shell label="轮岗排期">
      <PageHead
        kicker={<>{api.cohortsAll()[0]?.name ?? '本期'}<i aria-hidden="true" />{fmtDate(atBj(start))} – {fmtDate(atBj(end))} · 六站 · 每站两周</>}
        title={<>轮岗排期{futureIssues.length ? <> · <em>{futureIssues.reduce((s, x) => s + x.crowded.length + x.empty.length, 0)} 处</em>要调</> : null}</>}
        sub={role === 'admin' ? '这里只读。顺延、换序、换站带教在「期次与排期 · 轮岗排期编辑」里改。' : '排期由管理员维护，你这里只读。'}
        right={role === 'admin' ? <Link className="btn pri" to="/admin/rotation"><Icon name="pen" />去编辑</Link> : <span className="pill"><Icon name="lock" size={13} />只读</span>}
      />
      <div className="bento" style={{ marginTop: 20 }}>
        <div className="card s6 tight" style={{ padding: '14px 16px' }}>
          <div className="row"><Tile icon="alert" domain="exam" size="sm" /><b style={{ fontWeight: 600 }}>挤岗与空岗</b><span className="muted" style={{ fontSize: 12 }}>同一段同一岗位 ≥2 人为挤岗，0 人为空岗</span></div>
          <div className="stack" style={{ gap: 6, marginTop: 10 }}>
            {byPeriod.length ? byPeriod.map(x => (
              <div key={x.p.from} className="row" style={{ fontSize: 12.5, gap: 10, opacity: x.p.to < t ? 0.55 : 1 }}>
                <span className="num" style={{ width: 92, color: 'var(--mute)', flex: 'none' }}>{fmtDate(x.p.startAt)}–{fmtDate(atBj(x.p.to))}</span>
                {x.crowded.map(c => <StatusPill key={c.moduleId} tone="due">{api.moduleById(c.moduleId).name}挤 {c.userIds.length} 人 · {c.userIds.map(u => api.userById(u).name).join('、')}</StatusPill>)}
                {x.empty.map(c => <StatusPill key={c.moduleId} tone="warn">{api.moduleById(c.moduleId).name}空岗</StatusPill>)}
              </div>
            )) : <span className="muted" style={{ fontSize: 12.5 }}>没有挤岗和空岗</span>}
          </div>
        </div>
        <div className="card s3 tight" style={{ padding: '14px 16px' }}>
          <div className="row"><Tile icon="swap" domain="acc" size="sm" /><b style={{ fontWeight: 600 }}>下次换站</b></div>
          {nextSwitch ? <>
            <div className="row" style={{ marginTop: 10, alignItems: 'baseline', gap: 6 }}><span className="bignum">{fmtDate(nextSwitch.at)}</span><span className="muted" style={{ fontSize: 12 }}>{fmtWeekday(nextSwitch.at)} · {nextSwitch.userIds.length} 人</span></div>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>还有 {workdaysBetween(now, nextSwitch.at, api.workdayCalendar())} 个工作日</p>
          </> : <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>轮岗已全部结束</p>}
        </div>
        <div className="card s3 tight" style={{ padding: '14px 16px' }}>
          <div className="row"><Tile icon="flag" domain="exam" size="sm" /><b style={{ fontWeight: 600 }}>评估节点</b></div>
          {showEval ? (nextEval ? <>
            <div className="row" style={{ marginTop: 10, alignItems: 'baseline', gap: 6 }}><span className="bignum">{fmtDate(nextEval.at)}</span><span className="muted" style={{ fontSize: 12 }}>{api.stageById(nextEval.stageId).name}阶段 · {nextEval.userIds.length} 人</span></div>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>评估流程二期上线，一期只标节点</p>
          </> : <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>没有待到的评估节点</p>)
            : <p className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.7 }}>考核相关安排只给本人、带教和管理员，这里不显示。</p>}
        </div>
      </div>
      <div className="card" style={{ marginTop: 'var(--gap)' }}>
        <CardHead title={view === 'person' ? '按人' : view === 'module' ? '按岗位' : '按带教'} sub={view === 'person' ? '每人六站，色块按业务线' : view === 'module' ? '某段某岗位挤了几人、空了几个' : '每位带教同时带几人'}>
          <span className="r">
            <Segmented label="视角" value={view} onChange={v => { setView(v); setPick(null); }} options={[{ value: 'person', label: '按人' }, { value: 'module', label: '按岗位' }, { value: 'mentor', label: '按带教' }]} />
          </span>
        </CardHead>
        <div style={{ margin: '12px 0 10px' }}>
          <GanttLegend items={[
            { label: '客户线', domain: 'ment' }, { label: '老师线', domain: 'grow' }, { label: '市场线', domain: 'team' },
            { label: '在站', domain: 'acc', kind: 'solid' }, { label: '已离站' },
            ...(view === 'module' ? [{ label: '空岗', domain: 'exam' as Domain, kind: 'plan' as const }] : []),
            { label: '下次换站', kind: 'switch' as const }, ...(showEval ? [{ label: '评估节点', kind: 'eval' as const }] : []),
            { label: '假期', kind: 'hol' as const }, { label: view === 'module' ? '挤岗 / 空岗' : '挤岗', kind: 'clash' as const },
          ]} />
        </div>
        <Gantt cols={cols} rows={rows} corner={view === 'person' ? '成员' : view === 'module' ? '岗位' : '带教'} labelWidth={176} colWidth={74} rowHeight={view === 'person' ? 54 : 58}
          selectedId={pick?.id} onBarClick={onBar} />
        <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>列为周（周四开站对齐），本周浅底；点色块看这一站或这一段有谁。{role !== 'admin' && '任务进度只对本人、相关带教和管理员显示。'}</p>
      </div>
      <Drawer open={!!pick} onClose={() => setPick(null)}
        title={station && owner ? `${owner.name} · ${api.moduleById(station.moduleId).name}站` : pick?.info.kind === 'people' ? pick.info.title : ''}
        sub={station ? `${fmtDate(station.startAt)} ${fmtWeekday(station.startAt)} – ${fmtDate(station.endAt)} ${fmtWeekday(station.endAt)}` : pick?.info.kind === 'people' ? pick.info.sub : undefined}
        head={station && <div className="row"><Tile icon="route" domain={LINE_DOMAIN[api.moduleById(station.moduleId).line ?? ''] ?? 'acc'} /><StatusPill tone={api.stationTimePos(station) === 'current' ? 'acc' : api.stationTimePos(station) === 'left' ? 'ok' : 'plain'}>{STATION_POS_LABEL[api.stationTimePos(station)]}</StatusPill></div>}
        footer={<>
          {station && owner && <Link className="btn sec" to={owner.id === me.id ? '/growth/me' : `/team/${owner.id}`}>{owner.id === me.id ? '我的路径' : '个人档案'}</Link>}
          {role === 'admin' ? <Link className="btn pri" to="/admin/rotation"><Icon name="pen" />去编辑</Link> : <button type="button" className="btn ghost" onClick={() => setPick(null)}>关闭</button>}
        </>}>
        {station ? (
          <div className="dl">
            <div><span className="k">站带教</span><span className="v">{station.stationMentorId ? api.userById(station.stationMentorId).name : `未指定（由${api.userById(api.adminId()).name}接）`}</span></div>
            <div><span className="k">业务线</span><span className="v">{api.moduleById(station.moduleId).line ?? '—'}</span></div>
            <div><span className="k">本站进度</span><span className="v">{settle ? `${settle.passed} / ${settle.total} 项已通过${settle.total && settle.passed === settle.total ? ' · 已结清' : ''}` : '只对本人、相关带教和管理员显示'}</span></div>
            {rp.stats.crowded.some(c => c.userIds.includes(station.userId) && c.moduleId === station.moduleId && c.from === bjYmd(station.startAt)) && <div className="note warn" style={{ display: 'flex' }}><Icon name="alert" /><span>这一段{api.moduleById(station.moduleId).name}岗有 <b>2 人以上</b>，管理员可能会调整顺序。</span></div>}
          </div>
        ) : pick?.info.kind === 'people' ? (
          pick.info.userIds.length ? <div className="list">{pick.info.userIds.map(u => { const x = api.userById(u); return <Link key={u} className="li" to={u === me.id ? '/growth/me' : `/team/${u}`}><Avatar name={x.name} color={x.color} size="sm" /><span className="tx"><b>{x.name}</b><span>{api.currentPosition(u)?.module.name ?? ''}站（现在）</span></span><Icon name="right" /></Link>; })}</div>
            : <Empty icon="inbox" title="这一段没有人">空岗：可以在排期编辑里把挤岗的人换过来。</Empty>
        ) : null}
      </Drawer>
    </Shell>
  );
}

// ================= 团队活动（二期占位） =================
export function ScheduleEvents() {
  api.useDataVersion();
  const { me } = useSession();
  const [sp, setSp] = useSearchParams();
  const [off, setOff] = useOffset('m');
  const now = api.now();
  const base = bjYmd(now);
  const by = Number(base.slice(0, 4)), bm = Number(base.slice(5, 7));
  const idx = by * 12 + (bm - 1) + off;
  const y = Math.floor(idx / 12), m = (idx % 12) + 1;
  const tc = api.teamCalendar(y, m);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const gridStart = mondayOf(first);
  const nWeeks = Math.ceil((daysBetween(gridStart, tc.days[tc.days.length - 1].date) + 1) / 7);
  const cells = Array.from({ length: nWeeks * 7 }, (_, i) => addDays(gridStart, i));
  const t = today();
  const cal = api.workdayCalendar();
  const events = tc.items.filter(i => i.kind === 'teamEvent');
  const sync = api.integrationsAll().find(x => x.id === 'int-cal');
  const openId = sp.get('e');
  const ev = openId ? api.teamEventById(openId) : undefined;
  const open = (id: string | null) => setSp(prev => { const next = new URLSearchParams(prev); if (id) next.set('e', id); else next.delete('e'); return next; }, { replace: true });
  return (
    <Shell label="团队活动">
      <PageHead
        kicker={<>{y} 年 {m} 月<i aria-hidden="true" />二期随飞书日历读取</>}
        title={<>团队活动 <span className="chip team" style={{ verticalAlign: 'middle', fontSize: 12 }}>二期</span></>}
        sub="分享会、路演、读书会，谁讲、回放在哪，一张月历看完。下面是用示例数据做的预览。"
        right={<Pager unit="月" offset={off} onChange={setOff} todayLabel="本月" />}
      />
      <div className="bento" style={{ marginTop: 20 }}>
        <section className="card dark s12" style={{ padding: '22px 26px' }} aria-label="二期说明">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 32, alignItems: 'center' }}>
            <div>
              <div className="row" style={{ fontSize: 12, color: '#C9CCE0', gap: 8 }}><span className="tile" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}><Icon name="cal" /></span>二期 · 接入共享飞书日历「管培生活动」</div>
              <h2 style={{ marginTop: 12, fontSize: 21, fontWeight: 500, letterSpacing: '-.01em', lineHeight: 1.4 }}>活动只在飞书日历里维护一次，工作台只读不改</h2>
              <p style={{ marginTop: 8, fontSize: 13, color: '#C9CCE0', lineHeight: 1.75 }}>主讲、主题和回放由管理员在工作台补录；换站日、周报截止由工作台推算后叠加在同一张月历上，不写回飞书，需要提醒的交给带教机器人推送。</p>
            </div>
            <div style={{ display: 'grid', gap: 10, borderLeft: '1px solid rgba(255,255,255,.1)', paddingLeft: 28 }}>
              {[
                { icon: 'sync' as IconName, h: '只读同步', p: '只读一本共享日历，不碰个人日历' },
                { icon: 'mega' as IconName, h: '谁讲、讲什么', p: '主讲记入贡献榜，挂回放后才算' },
                { icon: 'bell' as IconName, h: '机器人提醒', p: '活动前一天在飞书提醒全员' },
              ].map(f => (
                <div key={f.h} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <span className="tile" style={{ background: 'rgba(255,255,255,.08)', color: '#fff' }}><Icon name={f.icon} /></span>
                  <span><b style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{f.h}</b><span style={{ fontSize: 12, color: '#C9CCE0' }}>{f.p}</span></span>
                </div>
              ))}
            </div>
          </div>
        </section>
        {sync && sync.level === 'error' && (
          <div className="note due s12"><Icon name="alert" /><span><b>{sync.name}同步失败</b>：{sync.detail}。{me.role === 'admin' ? '请在待办里处理连接异常。' : '下方是示例数据，不受影响。'}</span></div>
        )}
        <section className="card s8" aria-label="月历预览" style={{ padding: '16px 16px 14px' }}>
          <CardHead title={`${y} 年 ${m} 月`} sub="月历预览"><span className="r"><StatusPill tone="warn" icon="info">示例数据</StatusPill></span></CardHead>
          <div className="sx-month" style={{ marginTop: 12 }}>
            {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(d => <div key={d} className="wd">{d}</div>)}
            {cells.map(d => {
              const inMonth = d.slice(0, 7) === first.slice(0, 7);
              const items = inMonth ? tc.items.filter(i => bjYmd(i.startAt) === d) : [];
              const holiday = items.find(i => i.kind === 'holiday');
              const off2 = !isWorkday(d, cal);
              return (
                <div key={d} className={`dc${inMonth ? '' : ' out'}${d === t ? ' today' : ''}${off2 ? ' off' : ''}`}>
                  <div className="dn"><b>{Number(d.slice(8))}</b>{holiday && <small>{holiday.title}</small>}</div>
                  {items.filter(i => i.kind !== 'holiday').map(i => {
                    const k = KIND[i.kind];
                    return i.kind === 'teamEvent'
                      ? <button key={i.id} type="button" className={`sx-chip d-team ev${openId === i.ref.id ? ' sel' : ''}`} onClick={() => open(i.ref.id)} title={i.title}><Icon name="team" />{fmtTime(i.startAt)} {i.title.replace(/^(分享会|读书会)：/, '')}</button>
                      : <span key={i.id} className={`sx-chip d-${k.domain}`} title={i.title}><Icon name={k.icon} />{i.title}</span>;
                  })}
                </div>
              );
            })}
          </div>
        </section>
        <section className="card s4 vcol stretch" aria-label="这个月的活动">
          <CardHead title="这个月" sub={`${events.length} 场活动`} />
          {events.length ? (
            <div className="list" style={{ marginTop: 8 }}>
              {events.map(i => {
                const e = api.teamEventById(i.ref.id)!;
                return (
                  <button key={i.id} type="button" className="li" style={{ textAlign: 'left', width: '100%' }} onClick={() => open(e.id)}>
                    <span className="sx-date"><small>{fmtWeekday(e.startAt)}</small><b className="num">{fmtDate(e.startAt)}</b></span>
                    <span className="tx"><b>{e.title}</b><span>{e.speakerId ? `主讲 ${api.userById(e.speakerId).name} · ` : ''}{fmtTime(e.startAt)} · {e.place}</span></span>
                    <span className="end">{e.status === 'replayed' ? <StatusPill tone="ok" icon="check">有回放</StatusPill> : e.status === 'ended' ? <StatusPill>待挂回放</StatusPill> : <DomainTag domain="team">{e.type}</DomainTag>}</span>
                  </button>
                );
              })}
            </div>
          ) : <Empty icon="cal" title="这个月没有活动">翻到别的月份看看。</Empty>}
          <div className="divider" style={{ marginTop: 'auto' }} />
          <div className="stack" style={{ gap: 6 }}>
            <DomainTag domain="team" variant="dot">团队活动 · 飞书日历只读</DomainTag>
            <DomainTag domain="acc" variant="dot">换站日 · 工作台推算</DomainTag>
            <DomainTag domain="week" variant="dot">周报截止 · 周期规则</DomainTag>
          </div>
        </section>
      </div>
      <Drawer open={!!ev} onClose={() => open(null)} title={ev?.title ?? ''} sub={ev ? `${fmtCn(ev.startAt)} ${fmtWeekday(ev.startAt)} ${fmtTime(ev.startAt)}–${fmtTime(ev.endAt)}` : undefined}
        head={ev && <div className="row"><Tile icon="team" domain="team" /><DomainTag domain="team">{ev.type}</DomainTag><StatusPill tone="warn">示例</StatusPill></div>}
        footer={ev && <>
          <button type="button" className="btn ghost" onClick={() => open(null)}>关闭</button>
          {ev.minutesUrl ? <a className="btn pri" href={ev.minutesUrl} target="_blank" rel="noopener noreferrer"><Icon name="ext" />在飞书中打开回放</a>
            : <button type="button" className="btn pri" disabled title="二期接入飞书日历后可用">在飞书中打开</button>}
        </>}>
        {ev && (
          <div className="dl">
            {ev.speakerId && <div><span className="k">主讲</span><span className="v"><span className="row"><Avatar name={api.userById(ev.speakerId).name} color={api.userById(ev.speakerId).color} size="sm" />{api.userById(ev.speakerId).name}</span></span></div>}
            {ev.topic && <div><span className="k">主题</span><span className="v">{ev.topic}</span></div>}
            <div><span className="k">地点</span><span className="v">{ev.place}</span></div>
            <div><span className="k">回放</span><span className="v">{ev.status === 'replayed' ? '已挂妙记' : ev.status === 'ended' ? '活动已结束，等管理员挂回放' : '活动结束后挂妙记'}</span></div>
            {ev.assetIds.length > 0 && <div><span className="k">相关资产</span><span className="v stack" style={{ gap: 6 }}>{ev.assetIds.map(a => api.assetById(a)).filter(Boolean).map(a => <Link key={a!.id} className="go" to={`/ai/assets/${a!.id}`}>{a!.title}<Icon name="right" /></Link>)}</span></div>}
            <div><span className="k">来源</span><span className="v">飞书日历「管培生活动」· 只读</span></div>
          </div>
        )}
      </Drawer>
    </Shell>
  );
}

// ---------- 本页样式（只作用于 sx- 前缀；需要时由主会话并入 app.css） ----------
export const SCHEDULE_CSS = `
.sx-cal { display: grid; grid-template-columns: 220px minmax(0, 1fr) 300px; gap: var(--gap); align-items: start; }
.sx-types { display: grid; gap: 2px; margin-top: 4px; }
.sx-types button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 6px; border-radius: 10px; text-align: left; transition: background var(--t); }
.sx-types button:hover { background: rgba(21,25,38,.04); }
.sx-types .bx { width: 16px; height: 16px; border-radius: 5px; display: grid; place-items: center; flex: none; background: var(--c); color: #fff; }
.sx-types .bx .ico { width: 11px; height: 11px; stroke-width: 2.6; }
.sx-types .off .bx { background: transparent; box-shadow: inset 0 0 0 1.5px var(--line2); }
.sx-types .off b { color: var(--mute); }
.sx-types b { display: block; font-size: 12.5px; font-weight: 500; line-height: 1.3; }
.sx-types small { display: block; font-size: 11px; color: var(--mute); }
.sx-types .n { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 7px; display: grid; place-items: center; background: rgba(21,25,38,.05); font-family: var(--num); font-size: 11px; font-weight: 600; color: var(--ink2); }
.sx-next { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px 12px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); transition: box-shadow var(--t); }
.sx-next:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 35%, transparent); }
.sx-next i { width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; }
.sx-next b { display: block; font-size: 12.5px; font-weight: 500; line-height: 1.35; }
.sx-next small { display: block; font-size: 11px; color: var(--mute); }
.sx-next .num { font-size: 11.5px; font-weight: 600; color: var(--ink2); white-space: nowrap; }
.sx-chip { display: flex; align-items: flex-start; gap: 4px; min-height: 20px; padding: 3px 6px; border-radius: 7px; background: var(--cs); color: var(--ci); font-size: 11px; line-height: 14px; font-weight: 500; white-space: normal; overflow-wrap: anywhere; min-width: 0; max-width: 100%; }
.sx-chip .ico { width: 11px; height: 11px; flex: none; stroke-width: 2; }
.sx-chip.late { background: var(--due-soft); color: var(--due-ink); }
.sx-chip.done { background: rgba(21,25,38,.05); color: var(--mute); }
.sx-mt { display: grid; }
.sx-mt .r { display: grid; grid-template-columns: 208px var(--cols); }
.sx-mt.compact .r { grid-template-columns: 150px var(--cols); }
.sx-mt .r.h { height: 44px; box-shadow: 0 1px 0 var(--line); }
.sx-mt .r.h .lab { font-size: 11.5px; color: var(--mute); display: flex; align-items: center; padding-left: 6px; }
.sx-mt .dh { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font-size: 11px; color: var(--mute); min-width: 0; }
.sx-mt .dh b { font-family: var(--num); font-size: 13px; font-weight: 600; color: var(--ink); width: 24px; height: 22px; border-radius: 7px; display: grid; place-items: center; }
.sx-mt .dh small { font-size: 10px; color: var(--faint); white-space: nowrap; }
.sx-mt .dh.today { color: var(--acc-ink); font-weight: 500; }
.sx-mt .dh.today b { background: var(--acc); color: #fff; box-shadow: 0 4px 10px -4px rgba(74,78,216,.6); }
.sx-mt .dh.we b { color: var(--ink2); }
.sx-mt .gh { display: flex; align-items: baseline; gap: 8px; padding: 14px 6px 6px; font-size: 12px; }
.sx-mt .gh b { font-weight: 600; font-size: 12.5px; }
.sx-mt .gh .num { font-weight: 600; color: var(--ink2); }
.sx-mt .gh small { color: var(--mute); font-size: 11.5px; }
.sx-mt.compact .gh { padding: 8px 6px 4px; }
.sx-mt .none { padding: 6px 6px 10px; font-size: 12px; color: var(--faint); }
.sx-mt .r.p { grid-template-rows: 22px minmax(50px, auto); border-radius: 14px; background: rgba(255,255,255,.55); box-shadow: 0 0 0 1px var(--line); margin-bottom: 6px; overflow: hidden; }
.sx-mt.compact .r.p { grid-template-rows: 20px minmax(34px, auto); }
.sx-mt .r.p .lab { grid-column: 1; grid-row: 1 / 3; display: flex; align-items: center; gap: 9px; padding: 0 10px; min-width: 0; box-shadow: 1px 0 0 var(--line); transition: background var(--t); }
.sx-mt .r.p .lab:hover { background: rgba(255,255,255,.7); }
.sx-mt .lab b { display: block; font-size: 13px; font-weight: 600; }
.sx-mt .lab small { display: block; font-size: 11px; color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sx-mt .lab .todo { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 7px; display: grid; place-items: center; background: var(--acc); color: #fff; font-family: var(--num); font-size: 11px; font-weight: 700; }
.sx-mt .bd { grid-row: 1; align-self: end; margin: 0 3px; height: 16px; border-radius: 6px; padding: 0 8px; display: flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 500; background: var(--cs); color: var(--ci); white-space: nowrap; overflow: hidden; z-index: 1; }
.sx-mt .bd small { font-size: 10.5px; opacity: .8; }
.sx-mt .bd.mine { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 30%, transparent); }
.sx-mt .c { grid-row: 1 / 3; display: flex; flex-direction: column; gap: 3px; justify-content: flex-start; padding: 26px 3px 6px; min-width: 0; box-shadow: -1px 0 0 var(--line); text-align: left; }
.sx-mt.compact .c { padding-top: 23px; padding-bottom: 5px; }
.sx-mt .c.we { background: rgba(21,25,38,.025); }
.sx-mt .c.today { background: rgba(74,78,216,.05); }
.sx-mt button.c { cursor: pointer; transition: background var(--t); }
.sx-mt button.c:hover { background: rgba(74,78,216,.08); }
.sx-mt .c .more { font-size: 10.5px; color: var(--mute); padding-left: 4px; }
.sx-month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.sx-month .wd { font-size: 11px; color: var(--mute); text-align: center; padding-bottom: 2px; }
.sx-month .dc { min-height: 92px; border-radius: 12px; padding: 6px; background: rgba(255,255,255,.55); box-shadow: 0 0 0 1px var(--line); display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.sx-month .dc.out { background: transparent; box-shadow: none; opacity: .4; }
.sx-month .dc.off { background: rgba(21,25,38,.025); }
.sx-month .dc.today { box-shadow: 0 0 0 1.5px var(--acc); }
.sx-month .dn { display: flex; align-items: center; gap: 6px; }
.sx-month .dn b { font-family: var(--num); font-size: 12.5px; font-weight: 600; }
.sx-month .dc.today .dn b { color: #fff; background: var(--acc); border-radius: 6px; padding: 0 5px; }
.sx-month .dn small { font-size: 10.5px; color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sx-month .sx-chip.ev { height: auto; min-height: 20px; padding: 3px 6px; white-space: normal; line-height: 1.35; align-items: flex-start; cursor: pointer; text-align: left; }
.sx-month .sx-chip.ev .ico { margin-top: 1px; }
.sx-month .sx-chip.ev.sel, .sx-month .sx-chip.ev:hover { box-shadow: 0 0 0 1.5px var(--c); }
.sx-date { width: 46px; flex: none; display: grid; justify-items: center; padding: 4px 0; border-radius: 10px; background: var(--team-soft); color: var(--team-ink); }
.sx-date small { font-size: 10.5px; }
.sx-date b { font-size: 12.5px; font-weight: 700; }
`;
