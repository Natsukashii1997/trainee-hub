// 待办 = 事件 × 规则（PRD 3.4）：一期 12 条规则 R01–R12。
// syncTodos() 按当前数据和当前时间推出「应有的未关闭待办」，与已存的待办对账：新出现的生成（并写来源事件），
// 条件不再成立的关闭（完成或撤销）。同一 rule + subject + owner 只有一条未关闭的待办；重复执行结果不变。
import { addDays, addWorkdays, atBj, bjYmd } from '../lib/workday';
import { fmtDate } from '../lib/time';
import { db, logEvent, newId, now } from './store';
import { recurringTasksFor } from './generate';
import {
  activeTrainees, adminId, effectiveDue, handoverOf, isOpen, isOverdue, isStopped, latestSubmission, moduleById,
  nextStationOf, pathOf, responsibleMentorId, reviewsOf, ruleById, stationById, stationMentorOf, userById,
  currentStation,
} from './model';
import type { EventLog, Todo, TodoRule, User } from './types';

const t = (iso: string) => Date.parse(iso);
const cal = () => db.workdays;

type Cand = Omit<Todo, 'id' | 'status' | 'eventId' | 'closedAt' | 'closedByEventId'> & { event: () => EventLog };
const key = (x: { rule: TodoRule; subjectId: string; ownerId: string }) => `${x.rule}|${x.subjectId}|${x.ownerId}`;

/** 首页焦点与排序用的优先级（PRD 3.1：已逾期 > 需修改 > 今天的测验 > 今明截止 > 换站预告） */
const PRIORITY: Record<TodoRule, number> = { R12: 0, R05: 1, R03: 2, R02: 2, R09: 2, R04: 4, R06: 3, R08: 3, R11: 3, R07: 5, R10: 4, R01: 4 };

/** 推出当前应有的全部未关闭待办 */
export function deriveCandidates(at = now()): Cand[] {
  const out: Cand[] = [];
  const admin = adminId();
  const nowMs = t(at);
  const today = bjYmd(at), tomorrow = addDays(today, 1);
  const name = (uid: string) => userById(uid).name;
  const ccAdmin = (owner: string) => (owner === admin ? [] : [admin]);

  // R01 新成员待分配：首次登录、角色为同事、不在任何期次预置名单、管理员还没指定角色
  const roster = new Set(db.cohorts.flatMap(c => c.roster.map(r => r.openId)));
  for (const u of db.users) {
    if (u.role !== 'colleague' || u.roleAssignedAt || !u.firstLoginAt || (u.feishuOpenId && roster.has(u.feishuOpenId))) continue;
    out.push({
      rule: 'R01', subjectType: 'user', subjectId: u.id, ownerId: admin, title: `分配角色 · ${u.name}（${u.team}）`,
      appearAt: u.firstLoginAt, priority: PRIORITY.R01, cc: [],
      event: () => logEvent({ type: 'user.firstLogin', subjectType: 'user', subjectId: u.id, actorId: u.id, source: 'feishu', visibility: 'admin', at: u.firstLoginAt, dedupKey: `user.firstLogin:${u.id}` }),
    });
  }

  for (const task of db.tasks) {
    if (isStopped(task.userId) || t(task.openAt) > nowMs + 2 * 86400000) continue;
    const who = name(task.userId);
    const rule = ruleById(task.ruleId);

    // R02 待点评：路径任务或要求点评的周期任务已提交 → 负责带教（空 = 管理员），2 个工作日；再过 3 个工作日抄送管理员
    if (task.status === 'submitted' && (task.kind === 'path' || rule?.needsReview)) {
      const sub = latestSubmission(task.id);
      if (sub) {
        const owner = responsibleMentorId(task);
        const due = addWorkdays(sub.at, 2, cal());
        out.push({
          rule: 'R02', subjectType: 'task', subjectId: task.id, personId: task.userId, ownerId: owner,
          title: `${task.completion === 'declare' ? '确认' : '点评'} ${who} · ${task.name}`, appearAt: sub.at, dueAt: due, priority: PRIORITY.R02,
          cc: nowMs > t(addWorkdays(due, 3, cal())) ? ccAdmin(owner) : [],
          event: () => logEvent({ type: 'submission.created', subjectType: 'submission', subjectId: sub.id, personId: task.userId, actorId: task.userId, source: sub.channel, visibility: 'restricted', at: sub.at, payload: { taskId: task.id, version: sub.version }, dedupKey: `submission.created:${sub.id}` }),
        });
      }
    }

    // R03 修改再交：点评为需改进 → 本人，修改截止
    if (task.status === 'revise') {
      const rv = reviewsOf(task.id)[0];
      out.push({
        rule: 'R03', subjectType: 'task', subjectId: task.id, personId: task.userId, ownerId: task.userId,
        title: `修改再交 · ${task.name}`, appearAt: rv?.at ?? at, dueAt: effectiveDue(task), priority: PRIORITY.R03, cc: [],
        event: () => logEvent({ type: 'review.created', subjectType: 'review', subjectId: rv?.id ?? task.id, personId: task.userId, actorId: rv?.mentorId, source: 'web', visibility: 'restricted', at: rv?.at, payload: { taskId: task.id, grade: rv?.grade }, dedupKey: `review.created:${rv?.id ?? task.id}` }),
      });
    }

    const due = effectiveDue(task);
    // R04 今明截止：截止在今天或明天、还没到、未完成（需修改的已由 R03 管）；轻测只算今天的
    if (isOpen(task) && task.status !== 'revise' && t(due) >= nowMs && (bjYmd(due) === today || (bjYmd(due) === tomorrow && task.completion !== 'bot-quiz'))) {
      const quiz = task.completion === 'bot-quiz';
      const dayStart = atBj(addDays(bjYmd(due), -1));
      out.push({
        rule: 'R04', subjectType: 'task', subjectId: task.id, personId: task.userId, ownerId: task.userId,
        title: quiz ? `今天的测验 · ${task.name}` : `${bjYmd(due) === today ? '今天' : '明天'}截止 · ${task.name}`,
        appearAt: t(task.openAt) > t(dayStart) ? task.openAt : dayStart, dueAt: due, priority: quiz ? 3 : PRIORITY.R04, cc: [],
        event: () => logEvent({ type: 'task.dueSoon', subjectType: 'task', subjectId: task.id, personId: task.userId, source: 'system', visibility: 'restricted', payload: { taskId: task.id, dueAt: due }, dedupKey: `task.dueSoon:${task.id}:${due}` }),
      });
    }

    // R05 逾期跟进：本人补交一条；负责带教（路径 = 站带教，周期 = 主带教，空 = 管理员）跟进一条。轻测未答不算
    if (isOverdue(task, at)) {
      const ev = () => logEvent({ type: 'task.overdue', subjectType: 'task', subjectId: task.id, personId: task.userId, source: 'system', visibility: 'restricted', at: due, payload: { taskId: task.id, dueAt: due }, dedupKey: `task.overdue:${task.id}:${due}` });
      out.push({ rule: 'R05', subjectType: 'task', subjectId: task.id, personId: task.userId, ownerId: task.userId, title: `补交 · ${task.name}`, appearAt: due, dueAt: due, priority: PRIORITY.R05, cc: [], event: ev });
      const mentor = responsibleMentorId(task);
      out.push({ rule: 'R05', subjectType: 'task', subjectId: task.id, personId: task.userId, ownerId: mentor, title: `跟进逾期 · ${who} · ${task.name}`, appearAt: due, dueAt: due, priority: PRIORITY.R05, cc: [], event: ev });
    }
  }

  for (const u of activeTrainees()) {
    const p = pathOf(u.id);
    if (!p) continue;
    for (const s of p.stations) {
      const mod = moduleById(s.moduleId).name;
      const prev = p.stations.find(x => x.order === s.order - 1);
      // R06 换站接人 / R07 换站预告：开站前 5 个工作日出现
      if (prev) {
        const appear = addWorkdays(s.startAt, -5, cal());
        const switchEv = () => logEvent({ type: 'station.switching', subjectType: 'station', subjectId: s.id, personId: u.id, source: 'system', visibility: 'public', at: appear, payload: { stationId: s.id, startAt: s.startAt }, dedupKey: `station.switching:${s.id}:${s.startAt}` });
        if (nowMs >= t(appear) && nowMs < t(s.startAt)) {
          out.push({ rule: 'R07', subjectType: 'station', subjectId: s.id, personId: u.id, ownerId: u.id, title: `换站预告 · ${fmtDate(s.startAt)} 起到${mod}站`, appearAt: appear, dueAt: s.startAt, priority: PRIORITY.R07, cc: [], event: switchEv });
        }
        const owner = stationMentorOf(s);
        if (nowMs >= t(appear) && nowMs <= t(s.endAt) && !s.preparedAt && owner !== stationMentorOf(prev)) {
          out.push({
            rule: 'R06', subjectType: 'station', subjectId: s.id, personId: u.id, ownerId: owner, title: `换站接人 · ${u.name} ${fmtDate(s.startAt)} 到${mod}站`,
            appearAt: appear, dueAt: s.startAt, priority: PRIORITY.R06, cc: nowMs >= t(s.startAt) ? ccAdmin(owner) : [], event: switchEv,
          });
        }
      }
      if (nowMs <= t(s.endAt)) continue;
      const owner = stationMentorOf(s);
      const next = nextStationOf(s);
      const endEv = () => logEvent({ type: 'station.ended', subjectType: 'station', subjectId: s.id, personId: u.id, source: 'system', visibility: 'public', at: s.endAt, payload: { stationId: s.id }, dedupKey: `station.ended:${s.id}` });
      // R08 写交接要点：站结束且下一站带教不是本站带教 → 原站带教，站后 2 个工作日
      if (next && stationMentorOf(next) !== owner && !handoverOf(s.id)) {
        out.push({ rule: 'R08', subjectType: 'station', subjectId: s.id, personId: u.id, ownerId: owner, title: `写交接要点 · ${u.name} ${mod}站`, appearAt: s.endAt, dueAt: addWorkdays(s.endAt, 2, cal()), priority: PRIORITY.R08, cc: [], event: endEv });
      }
      // R09 站末遗留未评：离站仍有未通过的任务 → 原站带教，站后 3 个工作日；超时转管理员（抄送并标记）
      const left = db.tasks.filter(x => x.stationId === s.id && x.status !== 'passed');
      if (left.length) {
        const due = addWorkdays(s.endAt, 3, cal());
        const late = nowMs > t(due);
        out.push({
          rule: 'R09', subjectType: 'station', subjectId: s.id, personId: u.id, ownerId: owner, title: `站末遗留未评 · ${u.name} ${mod}站 ${left.length} 项`,
          appearAt: s.endAt, dueAt: due, priority: PRIORITY.R09, cc: late ? ccAdmin(owner) : [], escalated: late || undefined,
          event: () => logEvent({ type: 'station.leftUnsettled', subjectType: 'station', subjectId: s.id, personId: u.id, source: 'system', visibility: 'restricted', at: s.endAt, payload: { stationId: s.id, taskIds: left.map(x => x.id) }, dedupKey: `station.leftUnsettled:${s.id}` }),
        });
      }
    }
  }

  // R10 资产审核 / R11 资产退回修改
  for (const a of db.assets) {
    if (a.status === 'pending') out.push({
      rule: 'R10', subjectType: 'asset', subjectId: a.id, ownerId: admin, title: `审核 ${a.type}「${a.title}」`, appearAt: a.submittedAt, priority: PRIORITY.R10, cc: [],
      event: () => logEvent({ type: 'asset.submitted', subjectType: 'asset', subjectId: a.id, actorId: a.authorId, source: 'web', visibility: 'admin', at: a.submittedAt, payload: { version: a.version }, dedupKey: `asset.submitted:${a.id}:${a.submittedAt}` }),
    });
    if (a.status === 'returned') out.push({
      rule: 'R11', subjectType: 'asset', subjectId: a.id, ownerId: a.authorId, title: `修改后重新提交「${a.title}」`, appearAt: a.updatedAt, priority: PRIORITY.R11, cc: [],
      event: () => logEvent({ type: 'asset.returned', subjectType: 'asset', subjectId: a.id, actorId: admin, source: 'web', visibility: 'owner', at: a.updatedAt, payload: { reason: a.returnReason }, dedupKey: `asset.returned:${a.id}:${a.updatedAt}` }),
    });
  }

  // R12 接口或同步异常
  for (const i of db.integrations) {
    if (i.level !== 'error') continue;
    const at0 = i.at ?? at;
    out.push({
      rule: 'R12', subjectType: 'integration', subjectId: i.id, ownerId: admin, title: `处理连接异常 · ${i.name}`, appearAt: at0, dueAt: at0, priority: PRIORITY.R12, cc: [],
      event: () => logEvent({ type: 'integration.error', subjectType: 'integration', subjectId: i.id, source: 'system', visibility: 'admin', at: at0, payload: { detail: i.detail }, dedupKey: `integration.error:${i.id}:${at0}` }),
    });
  }
  return out;
}

/** 关闭时找最近一条相关事件作为关闭事件 */
function closingEvent(todo: Todo): string | undefined {
  const hit = [...db.events].reverse().find(e => e.subjectId === todo.subjectId || e.payload?.taskId === todo.subjectId || e.payload?.stationId === todo.subjectId);
  return hit?.id;
}

/** 对账：生成新待办、更新期限与抄送、关闭不再成立的 */
export function syncTodos(at = now()) {
  const cands = deriveCandidates(at);
  const want = new Map<string, Cand>();
  for (const c of cands) if (!want.has(key(c))) want.set(key(c), c);
  const open = new Map(db.todos.filter(x => x.status === 'open').map(x => [key(x), x]));
  for (const [k, c] of want) {
    const { event, ...rest } = c;
    const ex = open.get(k);
    if (ex) { Object.assign(ex, { title: rest.title, dueAt: rest.dueAt, cc: rest.cc, escalated: rest.escalated, priority: rest.priority }); continue; }
    db.todos.push({ ...rest, id: newId('td'), status: 'open', eventId: event().id });
  }
  for (const [k, x] of open) {
    if (want.has(k)) continue;
    const task = x.subjectType === 'task' ? db.tasks.find(y => y.id === x.subjectId) : undefined;
    const cancelled = (x.personId && isStopped(x.personId)) || ((x.rule === 'R04' || x.rule === 'R05') && task && isOpen(task));
    x.status = cancelled ? 'cancelled' : 'done';
    x.closedAt = at;
    x.closedByEventId = closingEvent(x);
  }
}

/** 系统推算的其余部分：到开放日自动转进行中、周期规则展开到两周后、兼容字段 mentorId */
export function syncDerived(at = now()) {
  for (const task of db.tasks) {
    if (task.status !== 'todo' || (task.completion !== 'link' && task.completion !== 'declare') || t(task.openAt) > t(at) || isStopped(task.userId)) continue;
    task.status = 'doing';
    logEvent({ type: 'task.opened', subjectType: 'task', subjectId: task.id, personId: task.userId, source: 'system', visibility: 'restricted', at: task.openAt, payload: { taskId: task.id }, dedupKey: `task.opened:${task.id}` });
  }
  const until = new Date(t(at) + 14 * 86400000).toISOString();
  const have = new Set(db.tasks.map(x => x.id));
  for (const p of db.paths) {
    if (isStopped(p.userId)) continue;
    for (const r of db.recurringRules) for (const inst of recurringTasksFor(r, p, db.modules, until, db.workdays)) {
      if (!have.has(inst.id)) { db.tasks.push(inst); have.add(inst.id); }
    }
  }
  for (const u of db.users) if (u.role === 'trainee') u.mentorId = currentStation(u.id, at)?.stationMentorId;
}

export function syncAll(at = now()) { syncDerived(at); syncTodos(at); }

// ---------- 待办查询 ----------
const byUrgency = (a: Todo, b: Todo) => a.priority - b.priority || t(a.dueAt ?? '9999-12-31') - t(b.dueAt ?? '9999-12-31');

/** 某人的待办：负责的 + 抄送给他的；默认只看未关闭的 */
export function todosOf(userId: string, status: Todo['status'] | 'all' = 'open'): Todo[] {
  return db.todos
    .filter(x => (x.ownerId === userId || x.cc.includes(userId)) && (status === 'all' || x.status === status))
    .sort(byUrgency);
}
/** 全部待办（管理员看全局用） */
export const allTodos = (status: Todo['status'] | 'all' = 'open') => db.todos.filter(x => status === 'all' || x.status === status).sort(byUrgency);
export const todoById = (id: string) => db.todos.find(x => x.id === id);
/** 待办是否已过期限 */
export const isTodoLate = (x: Todo, at = now()) => !!x.dueAt && t(at) > t(x.dueAt);

/**
 * 首页焦点：从待办取最急的两件（PRD 3.1）。
 * 管培生按优先级：已逾期 > 需修改 > 今天的测验 > 今明截止 > 换站预告；
 * 带教和管理员：先已超时的，再按期限由近到远，同期限按优先级。
 */
export function homeFocus(viewer: User, at = now()): Todo[] {
  const list = todosOf(viewer.id);
  if (viewer.role === 'trainee') return list.slice(0, 2);
  return [...list].sort((a, b) =>
    Number(isTodoLate(b, at)) - Number(isTodoLate(a, at)) || t(a.dueAt ?? '9999-12-31') - t(b.dueAt ?? '9999-12-31') || a.priority - b.priority,
  ).slice(0, 2);
}

/** 站带教更换：这一站未关闭的 R02、R06、R08、R09 改派给新带教，追加「待办重派」事件；已写的点评不动 */
export function reassignStationTodos(stationId: string, fromId: string, toId: string, actorId: string) {
  const station = stationById(stationId);
  if (!station) return;
  for (const x of db.todos) {
    if (x.status !== 'open' || x.ownerId !== fromId) continue;
    const onStation = x.subjectId === stationId || (x.subjectType === 'task' && db.tasks.find(y => y.id === x.subjectId)?.stationId === stationId);
    if (!onStation || !['R02', 'R06', 'R08', 'R09'].includes(x.rule)) continue;
    x.ownerId = toId;
    x.cc = x.cc.filter(c => c !== toId);
    logEvent({ type: 'todo.reassigned', subjectType: 'todo', subjectId: x.id, personId: x.personId, actorId, source: 'web', visibility: 'admin', payload: { stationId, from: fromId, to: toId, rule: x.rule } });
  }
}
