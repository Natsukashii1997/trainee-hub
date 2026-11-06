// 日程（PRD 3.3、4.5）：日程项是从路径、任务、待办、团队活动查询时推出来的视图，不存表。
// 四个视角：我的本周（管培生）、我带的人（带教）、轮岗排期（按人 / 按岗位 / 按带教）、团队活动。
import { addDays, atBj, bjYmd, calendarEntry, isWorkday, mondayOf, workdaysBetween } from '../lib/workday';
import { db, now } from './store';
import {
  activeTrainees, adminId, currentStation, effectiveDue, isOverdue, mentors, moduleById, nextStation, pathOf, rotationModules,
  stageById, stationMentorOf, stationTimePos, stationsOf, userById,
} from './model';
import { canSeeAssessment, canSeePrivate, canSeeTaskStatus } from './visibility';
import type { Module, ScheduleItem, ScheduleKind, Station, TaskInstance, TeamEvent, User, WorkdayEntry } from './types';

const t = (iso: string) => Date.parse(iso);
type Range = [string, string];
const overlaps = (a: string, b: string | undefined, [x, y]: Range) => t(a) < t(y) && t(b ?? a) >= t(x);
const inRange = (iso: string, [x, y]: Range) => t(iso) >= t(x) && t(iso) < t(y);

/** 北京时间某周（周一 00:00 到下周一 00:00）；offsetWeeks 相对本周 */
export function weekRange(offsetWeeks = 0, at = now()): Range {
  const mon = addDays(mondayOf(bjYmd(at)), offsetWeeks * 7);
  return [atBj(mon), atBj(addDays(mon, 7))];
}

// ---------- 日程项的推算 ----------
function taskKind(task: TaskInstance): ScheduleKind {
  if (task.completion === 'bot-weekly') return 'weekly';
  if (task.completion === 'bot-quiz') return 'quiz';
  if (task.completion === 'declare') return 'material';
  return task.status === 'revise' ? 'reviseDue' : 'taskDue';
}
function taskItem(task: TaskInstance, due = effectiveDue(task)): ScheduleItem {
  const kind = taskKind(task);
  return {
    id: `si-${kind}-${task.id}`, kind, shape: 'deadline', title: kind === 'reviseDue' ? `修改截止 · ${task.name}` : task.name,
    startAt: due, personId: task.userId, ref: { type: 'task', id: task.id }, source: task.kind === 'path' ? 'derived' : 'rule',
    visibility: kind === 'weekly' ? 'public' : 'restricted',
    status: task.quizResult === '未答' ? 'missed' : isOverdue(task) ? 'overdue' : task.status,
  };
}
const stationLabel = (s: Station) => `${moduleById(s.moduleId).name}站`;
function stationItems(s: Station): ScheduleItem[] {
  const list: ScheduleItem[] = [{
    id: `si-station-${s.id}`, kind: 'station', shape: 'span', title: stationLabel(s), startAt: s.startAt, endAt: s.endAt,
    personId: s.userId, ref: { type: 'station', id: s.id }, source: 'derived', visibility: 'public',
  }];
  if (s.order > 0) list.push({
    id: `si-switch-${s.id}`, kind: 'switch', shape: 'moment', title: `换站 · 到${stationLabel(s)}`, startAt: s.startAt,
    personId: s.userId, ref: { type: 'station', id: s.id }, source: 'derived', visibility: 'public',
  });
  return list;
}
/** 阶段评估节点：每个阶段最后一站的结束时刻（一期只显示节点，流程二期） */
function assessmentItems(userId: string): ScheduleItem[] {
  const byStage = new Map<string, Station>();
  for (const s of stationsOf(userId)) byStage.set(moduleById(s.moduleId).stageId, s);
  return [...byStage].map(([stageId, s]) => ({
    id: `si-assess-${userId}-${stageId}`, kind: 'assessment' as const, shape: 'moment' as const, title: `${stageById(stageId).name}阶段评估节点`,
    startAt: s.endAt, personId: userId, ref: { type: 'stage' as const, id: stageId }, source: 'derived' as const, visibility: 'restricted' as const,
  }));
}
function holidayItems(range: Range): ScheduleItem[] {
  return db.workdays.filter(e => inRange(atBj(e.date, '12:00'), range)).map(e => ({
    id: `si-holiday-${e.date}`, kind: 'holiday' as const, shape: 'span' as const, title: e.workday ? `${e.name}（上班）` : e.name,
    startAt: atBj(e.date), endAt: atBj(addDays(e.date, 1)), ref: { type: 'calendar' as const, id: e.date }, source: 'derived' as const, visibility: 'public' as const,
  }));
}
function teamEventItem(e: TeamEvent): ScheduleItem {
  return {
    id: `si-te-${e.id}`, kind: 'teamEvent', shape: 'span', title: e.title, startAt: e.startAt, endAt: e.endAt,
    ref: { type: 'teamEvent', id: e.id }, source: 'feishu', visibility: 'public',
  };
}

/** 某位管培生在一段时间里、查看人看得到的日程项（看不到的直接不返回） */
export function personSchedule(userId: string, viewer: User, range: Range): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  for (const s of stationsOf(userId)) for (const it of stationItems(s)) if (overlaps(it.startAt, it.endAt, range)) items.push(it);
  const seeStatus = canSeeTaskStatus(viewer, userId);
  for (const task of db.tasks.filter(x => x.userId === userId)) {
    const due = effectiveDue(task);
    if (!inRange(due, range)) continue;
    if (!seeStatus && task.completion !== 'bot-weekly') continue;
    items.push(taskItem(task, due));
  }
  if (seeStatus) {
    // 任务开放期（时段）：路径任务、未交付的
    for (const task of db.tasks.filter(x => x.userId === userId && x.kind === 'path' && (x.status === 'todo' || x.status === 'doing'))) {
      if (overlaps(task.openAt, task.dueAt, range)) items.push({
        id: `si-open-${task.id}`, kind: 'taskOpen', shape: 'span', title: `开放期 · ${task.name}`, startAt: task.openAt, endAt: task.dueAt,
        personId: userId, ref: { type: 'task', id: task.id }, source: 'derived', visibility: 'restricted', status: task.status,
      });
    }
    // 点评期限（R02）给负责带教、管理员和提交的本人看；交接要点期限（R08）给带教和管理员看
    for (const td of db.todos.filter(x => x.status === 'open' && x.personId === userId && (x.rule === 'R02' || x.rule === 'R08') && x.dueAt && inRange(x.dueAt, range))) {
      if (td.rule === 'R08' && viewer.id === userId) continue;
      if (td.rule === 'R02' && !canSeePrivate(viewer, db.tasks.find(y => y.id === td.subjectId)!)) continue;
      items.push({
        id: `si-${td.rule}-${td.id}`, kind: td.rule === 'R02' ? 'reviewDue' : 'handoverDue', shape: 'deadline',
        title: td.rule === 'R02' ? `点评期限 · ${td.title.replace(/^(点评|确认) /, '')}` : `交接要点期限 · ${td.title.replace(/^写交接要点 · /, '')}`,
        startAt: td.dueAt!, personId: userId, ref: td.subjectType === 'task' ? { type: 'task', id: td.subjectId } : { type: 'station', id: td.subjectId },
        source: 'derived', visibility: 'restricted',
      });
    }
    if (canSeeAssessment(viewer, userId) || viewer.role === 'mentor') items.push(...assessmentItems(userId).filter(x => inRange(x.startAt, range)));
  }
  return items.sort((a, b) => t(a.startAt) - t(b.startAt));
}

export interface ScheduleDay { date: string; startAt: string; workday: boolean; holiday?: string; isToday: boolean }
function daysOf(range: Range): ScheduleDay[] {
  const out: ScheduleDay[] = [];
  const today = bjYmd(now());
  for (let d = bjYmd(range[0]); t(atBj(d)) < t(range[1]); d = addDays(d, 1)) {
    out.push({ date: d, startAt: atBj(d), workday: isWorkday(d, db.workdays), holiday: calendarEntry(d, db.workdays)?.name, isToday: d === today });
  }
  return out;
}

// ---------- 视角一：我的本周 ----------
/** 管培生「我的本周」：所在站与第几周、换站日、截止、周报、轻测、团队活动排在一条周时间线上（PRD 3.1、3.3） */
export function myWeek(userId: string, viewer: User = userById(userId), offsetWeeks = 0) {
  const range = weekRange(offsetWeeks);
  const station = currentStation(userId, range[0] > now() ? range[0] : now());
  const items = [
    ...personSchedule(userId, viewer, range),
    ...db.teamEvents.filter(e => overlaps(e.startAt, e.endAt, range)).map(teamEventItem),
    ...holidayItems(range),
  ].sort((a, b) => t(a.startAt) - t(b.startAt));
  const days = daysOf(range).map(d => ({ ...d, items: items.filter(i => bjYmd(i.startAt) === d.date && (i.shape !== 'span' || i.kind === 'teamEvent')) }));
  return {
    range, days, items,
    spans: items.filter(i => i.shape === 'span' && i.kind !== 'teamEvent'),
    station, module: station ? moduleById(station.moduleId) : undefined,
    /** 在本站第几周（从 1 起） */
    weekInStation: station ? Math.floor((t(now()) - t(atBj(bjYmd(station.startAt)))) / (7 * 86400000)) + 1 : 0,
    nextStation: nextStation(userId),
  };
}

// ---------- 视角二：我带的人 ----------
export type MenteeGroup = 'current' | 'incoming' | 'handedOff';
export const MENTEE_GROUP_LABEL: Record<MenteeGroup, string> = { current: '在带', incoming: '将到', handedOff: '刚交接出去' };
export interface MenteeRow { user: User; group: MenteeGroup; station: Station; module: Module; items: ScheduleItem[]; openTodos: number }

/** 站带教关系里，viewer 是否这站的负责人（管理员 = 没有站带教的站） */
const mentorOfStation = (viewer: User, s: Station) => stationMentorOf(s) === viewer.id;

/**
 * 带教「我带的人」：两周视图，行分在带 / 将到 / 刚交接出去（PRD 3.3）。
 * 将到 = 下一站在这两周内开始且归 viewer；刚交接出去 = 上一站归 viewer、已离站，且还有 viewer 名下的未关闭待办或离站不满 5 个工作日。
 */
export function myMentees(viewer: User, offsetWeeks = 0) {
  const range: Range = [weekRange(offsetWeeks)[0], weekRange(offsetWeeks + 1)[1]];
  const rows: MenteeRow[] = [];
  for (const u of activeTrainees()) {
    const cur = currentStation(u.id);
    const nxt = nextStation(u.id);
    let group: MenteeGroup | undefined, station: Station | undefined;
    if (cur && stationTimePos(cur) === 'current' && mentorOfStation(viewer, cur)) { group = 'current'; station = cur; }
    else if (nxt && mentorOfStation(viewer, nxt) && t(nxt.startAt) < t(range[1])) { group = 'incoming'; station = nxt; }
    else {
      const left = stationsOf(u.id).filter(s => stationTimePos(s) === 'left').pop();
      if (left && mentorOfStation(viewer, left)) {
        const pending = db.todos.some(x => x.status === 'open' && x.ownerId === viewer.id && x.personId === u.id);
        if (pending || workdaysBetween(left.endAt, now(), db.workdays) <= 5) { group = 'handedOff'; station = left; }
      }
    }
    if (!group || !station) continue;
    rows.push({
      user: u, group, station, module: moduleById(station.moduleId), items: personSchedule(u.id, viewer, range),
      openTodos: db.todos.filter(x => x.status === 'open' && x.personId === u.id && (x.ownerId === viewer.id || x.cc.includes(viewer.id))).length,
    });
  }
  return {
    range, days: daysOf(range),
    groups: {
      current: rows.filter(r => r.group === 'current'),
      incoming: rows.filter(r => r.group === 'incoming'),
      handedOff: rows.filter(r => r.group === 'handedOff'),
    },
  };
}

/** 带教首页标题用的数：在带 N 人 · 某日到站 N 人 · 上一站还有 N 份没评（PRD 3.1） */
export function mentorSummary(viewer: User) {
  const { groups } = myMentees(viewer);
  const nextAt = groups.incoming.map(r => r.station.startAt).sort((a, b) => t(a) - t(b))[0];
  const leftover = db.todos.filter(x => x.status === 'open' && x.ownerId === viewer.id && x.rule === 'R02' && (() => {
    const task = db.tasks.find(y => y.id === x.subjectId);
    const s = task?.stationId ? stationsOf(task.userId).find(z => z.id === task.stationId) : undefined;
    return !!s && stationTimePos(s) === 'left';
  })()).length;
  return {
    current: groups.current.length,
    incoming: groups.incoming.filter(r => r.station.startAt === nextAt).length,
    incomingAt: nextAt as string | undefined,
    leftoverUnreviewed: leftover,
  };
}

// ---------- 视角三：轮岗排期 ----------
export interface RotationPeriod { startAt: string; endAt: string; from: string; to: string }
export interface RotationCell { moduleId: string; userIds: string[]; crowded: boolean; empty: boolean }

/** 轮岗排期：全部来自个人路径，不单独维护（PRD 4.5）。按人 / 按岗位 / 按带教三个视角，含挤岗、空岗与带教负载统计 */
export function rotationPlan() {
  const rotIds = new Set(rotationModules().map(m => m.id));
  const people = activeTrainees();
  const rot = people.flatMap(u => stationsOf(u.id).filter(s => rotIds.has(s.moduleId)));
  // 断点：每站开始日、结束日次日（北京时间日期）；断点之间在岗情况不变
  const cuts = [...new Set(rot.flatMap(s => [bjYmd(s.startAt), addDays(bjYmd(s.endAt), 1)]))].sort();
  const covers = (s: Station, d: string) => bjYmd(s.startAt) <= d && d <= bjYmd(s.endAt);
  const periods: (RotationPeriod & { cells: RotationCell[]; byMentor: Map<string | null, string[]> })[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i], to = addDays(cuts[i + 1], -1);
    const here = rot.filter(s => covers(s, from));
    if (!here.length) continue;
    const cells = rotationModules().map(m => {
      const userIds = here.filter(s => s.moduleId === m.id).map(s => s.userId);
      return { moduleId: m.id, userIds, crowded: userIds.length >= 2, empty: userIds.length === 0 };
    });
    const byMentor = new Map<string | null, string[]>();
    for (const s of here) { const k = s.stationMentorId ?? null; byMentor.set(k, [...(byMentor.get(k) ?? []), s.userId]); }
    periods.push({ from, to, startAt: atBj(from), endAt: atBj(addDays(to, 1)), cells, byMentor });
  }
  const mentorKeys: (string | null)[] = [...mentors().map(m => m.id), null];
  const first = rot.length ? rot.reduce((a, s) => (t(s.startAt) < t(a) ? s.startAt : a), rot[0].startAt) : now();
  const last = rot.length ? rot.reduce((a, s) => (t(s.endAt) > t(a) ? s.endAt : a), rot[0].endAt) : now();
  const weeks: string[] = [];
  for (let d = mondayOf(bjYmd(first)); d <= bjYmd(last); d = addDays(d, 7)) weeks.push(d);
  const switches = new Map<string, string[]>();
  for (const u of people) for (const s of stationsOf(u.id)) if (s.order > 0) switches.set(s.startAt, [...(switches.get(s.startAt) ?? []), u.id]);
  const assessments = new Map<string, { stageId: string; userIds: string[] }>();
  for (const u of people) for (const it of assessmentItems(u.id)) {
    const k = `${it.ref.id}|${it.startAt}`;
    assessments.set(k, { stageId: it.ref.id, userIds: [...(assessments.get(k)?.userIds ?? []), u.id] });
  }

  return {
    weeks,
    periods: periods.map(({ byMentor: _m, ...p }) => p),
    /** 按人：每人一行，每站一个色块（按业务线着色） */
    byPerson: people.map(u => ({
      user: u, mainMentorId: pathOf(u.id)?.mainMentorId,
      stations: stationsOf(u.id).map(s => ({ station: s, module: moduleById(s.moduleId), mentorId: s.stationMentorId, pos: stationTimePos(s) })),
    })),
    /** 按岗位：每个岗位一行，每段几人 */
    byModule: rotationModules().map(m => ({
      module: m,
      periods: periods.map(p => ({ from: p.from, to: p.to, ...p.cells.find(c => c.moduleId === m.id)! })),
    })),
    /** 按带教：每位带教一行（null = 未指定，由管理员接），每段同时带几人 */
    byMentor: mentorKeys.map(k => {
      const ps = periods.map(p => ({ from: p.from, to: p.to, userIds: p.byMentor.get(k) ?? [] }));
      return { mentorId: k, name: k ? userById(k).name : `未指定（由${userById(adminId()).name}接）`, periods: ps, max: Math.max(0, ...ps.map(x => x.userIds.length)) };
    }),
    stats: {
      crowded: periods.flatMap(p => p.cells.filter(c => c.crowded).map(c => ({ from: p.from, to: p.to, moduleId: c.moduleId, userIds: c.userIds }))),
      empty: periods.flatMap(p => p.cells.filter(c => c.empty).map(c => ({ from: p.from, to: p.to, moduleId: c.moduleId }))),
    },
    /** 换站日：哪天谁换站 */
    switches: [...switches].sort(([a], [b]) => t(a) - t(b)).map(([at, userIds]) => ({ at, userIds })),
    /** 阶段评估节点：集中在哪几周 */
    assessments: [...assessments.values()].map(v => ({ ...v, at: assessmentItems(v.userIds[0]).find(x => x.ref.id === v.stageId)!.startAt })),
    /** 假期灰带 */
    holidays: db.workdays.filter((e: WorkdayEntry) => !e.workday),
  };
}

// ---------- 视角四：团队活动 ----------
export const teamEventsAll = (): TeamEvent[] => [...db.teamEvents].sort((a, b) => t(a.startAt) - t(b.startAt));
export const teamEventById = (id: string) => db.teamEvents.find(e => e.id === id);
/** 下一场团队活动 */
export const nextTeamEvent = (at = now()) => teamEventsAll().find(e => t(e.endAt) > t(at));
/** 一个月（北京时间）的团队活动视角：活动（飞书只读）、换站日、周报截止（公开部分）、假期 */
export function teamCalendar(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const range: Range = [atBj(from), atBj(next)];
  const items: ScheduleItem[] = db.teamEvents.filter(e => overlaps(e.startAt, e.endAt, range)).map(teamEventItem);
  const sw = new Map<string, number>();
  for (const u of activeTrainees()) for (const s of stationsOf(u.id)) if (s.order > 0 && inRange(s.startAt, range)) sw.set(s.startAt, (sw.get(s.startAt) ?? 0) + 1);
  for (const [at, n] of sw) items.push({ id: `si-switchday-${at}`, kind: 'switch', shape: 'moment', title: `换站日 · ${n} 人`, startAt: at, ref: { type: 'calendar', id: bjYmd(at) }, source: 'derived', visibility: 'public' });
  const weekly = new Set(db.tasks.filter(x => x.completion === 'bot-weekly' && inRange(x.dueAt, range)).map(x => x.dueAt));
  for (const at of weekly) items.push({ id: `si-weeklydue-${at}`, kind: 'weekly', shape: 'deadline', title: '周报截止', startAt: at, ref: { type: 'calendar', id: bjYmd(at) }, source: 'rule', visibility: 'public' });
  items.push(...holidayItems(range));
  return { range, days: daysOf(range), items: items.sort((a, b) => t(a.startAt) - t(b.startAt)) };
}
