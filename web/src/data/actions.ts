// 写操作（内存中）。每个写操作：校验 → 改数据 → 追加事件日志 → 重新推算待办 → 通知页面重算。
import { addWorkdays } from '../lib/workday';
import { db, logEvent, newId, notify, now, resetRaw, setNowRaw } from './store';
import { syncAll, reassignStationTodos } from './rules';
import { dueFromRule, openFromDue } from './generate';
import {
  adminId, findUser, isDelivered, isOpen, latestSubmission, pathOf, responsibleMentorId, ruleById, stationById, stationMentorOf,
  stationTimePos, taskById, templateById, userById,
} from './model';
import { canReview } from './visibility';
import type { Asset, Grade, IntegrationLevel, Role, Station, TaskTemplate, User } from './types';

const t = (iso: string) => Date.parse(iso);
const fail = (msg: string): never => { throw new Error(msg); };
const commit = () => { syncAll(); notify(); };
const isAdmin = (u: User) => u.role === 'admin';

// ---------- 演示控制 ----------
/** 改「现在」（演示或测试用），随后重新推算 */
export function setNow(iso: string) { setNowRaw(iso); commit(); }
/** 恢复示例数据 */
export function resetDemo() { resetRaw(); seedEvents(); commit(); }

/** 示例数据里已经发生过的事，补成事件日志（只在初始化时跑一次） */
export function seedEvents() {
  for (const s of db.submissions) {
    const task = taskById(s.taskId);
    logEvent({ type: s.channel === 'bot' && task?.completion === 'bot-weekly' ? 'weekly.received' : 'submission.created', subjectType: 'submission', subjectId: s.id, personId: task?.userId, actorId: task?.userId, source: s.channel, visibility: task?.completion === 'bot-weekly' ? 'public' : 'restricted', at: s.at, payload: { taskId: s.taskId, version: s.version }, dedupKey: `submission.created:${s.id}` });
  }
  for (const r of db.reviews) {
    const task = taskById(r.taskId);
    logEvent({ type: 'review.created', subjectType: 'review', subjectId: r.id, personId: task?.userId, actorId: r.mentorId, source: 'web', visibility: 'restricted', at: r.at, payload: { taskId: r.taskId, grade: r.grade }, dedupKey: `review.created:${r.id}` });
  }
  for (const task of db.tasks) if (task.quizResult !== undefined) {
    logEvent({ type: 'quiz.scored', subjectType: 'task', subjectId: task.id, personId: task.userId, source: 'bot', visibility: 'restricted', at: task.dueAt, payload: { taskId: task.id, result: task.quizResult }, dedupKey: `quiz.scored:${task.id}` });
  }
  for (const h of db.handovers) logEvent({ type: 'handover.written', subjectType: 'handover', subjectId: h.id, personId: h.userId, actorId: h.authorId, source: 'web', visibility: 'restricted', at: h.at, payload: { stationId: h.stationId }, dedupKey: `handover.written:${h.id}` });
  for (const a of db.assets) {
    logEvent({ type: 'asset.submitted', subjectType: 'asset', subjectId: a.id, actorId: a.authorId, source: 'web', visibility: 'admin', at: a.submittedAt, payload: { version: a.version }, dedupKey: `asset.submitted:${a.id}:${a.submittedAt}` });
    if (a.status === 'live') logEvent({ type: 'asset.approved', subjectType: 'asset', subjectId: a.id, actorId: a.authorId, source: 'web', visibility: 'public', at: a.updatedAt, payload: { title: a.title, assetType: a.type }, dedupKey: `asset.approved:${a.id}:${a.updatedAt}` });
  }
  for (const n of db.announcements) logEvent({ type: 'announcement.published', subjectType: 'announcement', subjectId: n.id, actorId: adminId(), source: 'web', visibility: 'public', at: n.at, payload: { title: n.title }, dedupKey: `announcement.published:${n.id}` });
  for (const u of db.users) if (u.firstLoginAt) logEvent({ type: 'user.firstLogin', subjectType: 'user', subjectId: u.id, actorId: u.id, source: 'feishu', visibility: 'admin', at: u.firstLoginAt, dedupKey: `user.firstLogin:${u.id}` });
  db.events.sort((a, b) => t(a.at) - t(b.at));
}

// ---------- 任务 ----------
export const FEISHU_DOC = /^https:\/\/[\w-]+\.(feishu\.cn|larksuite\.com)\/(docx|docs|wiki|sheets|base|file)\/\w+/;

/** 本人点「开始」：未开始 → 进行中 */
export function startTask(taskId: string, actor: User) {
  const task = taskById(taskId) ?? fail('任务不存在');
  if (actor.id !== task.userId) fail('只能开始自己的任务');
  if (task.status !== 'todo') return;
  task.status = 'doing';
  logEvent({ type: 'task.started', subjectType: 'task', subjectId: task.id, personId: task.userId, actorId: actor.id, source: 'web', visibility: 'restricted', payload: { taskId } });
  commit();
}

/**
 * 提交产出（PRD 4.2）：只交飞书链接，不支持草稿；再交必须写修改说明。
 * 周报、轻测只在机器人里交，网页不能交；月度物料是本人声明，链接可选。
 */
export function submitTask(taskId: string, input: { url?: string; note?: string; changeNote?: string }, actor: User) {
  const task = taskById(taskId) ?? fail('任务不存在');
  if (actor.id !== task.userId) fail('只能提交自己的任务');
  if (task.completion === 'bot-weekly' || task.completion === 'bot-quiz') fail('周报和轻测在带教机器人里完成，工作台不能提交');
  if (isDelivered(task)) fail('已经提交过，等点评或确认');
  const url = input.url?.trim();
  if (task.completion === 'link' && (!url || !FEISHU_DOC.test(url))) fail('请贴飞书文档、表格或知识库链接');
  if (url && !FEISHU_DOC.test(url)) fail('请贴飞书文档、表格或知识库链接');
  const prev = latestSubmission(task.id);
  const resubmit = task.status === 'revise';
  if (resubmit && !input.changeNote?.trim()) fail('再交要写修改说明');
  const sub = {
    id: newId('sb'), taskId, url, at: now(), version: (prev?.version ?? 0) + 1, channel: 'web' as const,
    note: input.note?.trim() || undefined, changeNote: resubmit ? input.changeNote!.trim() : undefined,
  };
  db.submissions.push(sub);
  task.status = 'submitted';
  task.reviseDueAt = resubmit ? task.reviseDueAt : undefined;
  logEvent({ type: 'submission.created', subjectType: 'submission', subjectId: sub.id, personId: task.userId, actorId: actor.id, source: 'web', visibility: 'restricted', payload: { taskId, version: sub.version, url }, dedupKey: `submission.created:${sub.id}` });
  commit();
  return sub;
}

/**
 * 点评（PRD 4.2）：路径任务由所属站的站带教点评（没有站带教由管理员接）；月度物料由管理员确认。
 * 三档 + 一两句总评；评「需改进」时同时给修改截止（点评后 3 个工作日）。
 */
export function reviewTask(taskId: string, grade: Grade, comment: string, actor: User) {
  const task = taskById(taskId) ?? fail('任务不存在');
  const rule = ruleById(task.ruleId);
  if (task.kind === 'recurring' && !rule?.needsReview) fail('这类周期任务不需要点评');
  if (!canReview(actor, task)) fail(task.completion === 'declare' ? '只有管理员能确认' : '只有本站站带教和管理员能点评');
  if (task.status !== 'submitted') fail('还没有待点评的提交');
  const sub = latestSubmission(taskId) ?? fail('还没有提交');
  const rv = { id: newId('rv'), taskId, submissionId: sub.id, mentorId: actor.id, grade, comment: comment.trim(), at: now() };
  db.reviews.push(rv);
  if (grade === '需改进') { task.status = 'revise'; task.reviseDueAt = addWorkdays(now(), 3, db.workdays); }
  else task.status = 'passed';
  logEvent({ type: 'review.created', subjectType: 'review', subjectId: rv.id, personId: task.userId, actorId: actor.id, source: 'web', visibility: 'restricted', payload: { taskId, grade, reviseDueAt: task.reviseDueAt }, dedupKey: `review.created:${rv.id}` });
  commit();
  return rv;
}

/** 改截止（PRD 4.2）：本站站带教或管理员；必须写原因，留痕（原截止、新截止、原因、操作人）。需修改时改的是修改截止 */
export function adjustDue(taskId: string, newDueAt: string, reason: string, actor: User) {
  const task = taskById(taskId) ?? fail('任务不存在');
  if (!canReview(actor, task)) fail('只有负责带教和管理员能改截止');
  if (!reason.trim()) fail('改截止要写原因');
  if (Number.isNaN(t(newDueAt))) fail('新截止时间不对');
  const field = task.status === 'revise' && task.reviseDueAt ? 'reviseDueAt' : 'dueAt';
  const from = task[field]!;
  if (field === 'dueAt' && !task.originalDueAt) task.originalDueAt = task.dueAt;
  task[field] = newDueAt;
  logEvent({ type: 'task.dueAdjusted', subjectType: 'task', subjectId: task.id, personId: task.userId, actorId: actor.id, source: 'web', visibility: 'restricted', payload: { taskId, field, from, to: newDueAt, reason: reason.trim() } });
  commit();
}

/** 管理员撤销最近一次截止调整 */
export function undoDueAdjust(taskId: string, actor: User) {
  if (!isAdmin(actor)) fail('只有管理员能撤销调整');
  const task = taskById(taskId) ?? fail('任务不存在');
  const last = [...db.events].reverse().find(e => e.type === 'task.dueAdjusted' && e.subjectId === taskId) ?? fail('没有可撤销的调整');
  const field = last.payload!.field as 'dueAt' | 'reviseDueAt';
  task[field] = last.payload!.from as string;
  if (field === 'dueAt' && task.dueAt === task.originalDueAt) task.originalDueAt = undefined;
  logEvent({ type: 'task.dueAdjustUndone', subjectType: 'task', subjectId: task.id, personId: task.userId, actorId: actor.id, source: 'web', visibility: 'restricted', payload: { taskId, undoEventId: last.id, restored: last.payload!.from } });
  commit();
}

/** 截止调整记录（新的在前） */
export const dueAdjustmentsOf = (taskId: string) =>
  db.events.filter(e => (e.type === 'task.dueAdjusted' || e.type === 'task.dueAdjustUndone') && e.subjectId === taskId).sort((a, b) => t(b.at) - t(a.at));

/** 最近一次催办 */
export const lastNudge = (taskId: string) => [...db.events].reverse().find(e => e.type === 'task.nudged' && e.subjectId === taskId);
/** 同一任务 24 小时内只催一次 */
export const canNudgeNow = (taskId: string) => { const l = lastNudge(taskId); return !l || t(now()) - t(l.at) >= 24 * 3600000; };

/** 催办（PRD 3.4）：写催办事件，由机器人推到飞书；同一任务 24 小时内只催一次 */
export function nudgeTask(taskId: string, actor: User) {
  const task = taskById(taskId) ?? fail('任务不存在');
  const allowed = isAdmin(actor) || responsibleMentorId(task) === actor.id || pathOf(task.userId)?.mainMentorId === actor.id;
  if (!allowed) fail('只有带教和管理员能催办');
  if (!isOpen(task)) fail('这条任务已经交了');
  if (!canNudgeNow(taskId)) fail('24 小时内已经催过一次');
  const ev = logEvent({ type: 'task.nudged', subjectType: 'task', subjectId: taskId, personId: task.userId, actorId: actor.id, source: 'web', visibility: 'restricted', payload: { taskId, delivered: false } });
  commit();
  return ev;
}

// ---------- 机器人写回（原型里模拟接口） ----------
/** 机器人收到周报 */
export function botReceiveWeekly(taskId: string, url?: string) {
  const task = taskById(taskId) ?? fail('任务不存在');
  if (task.completion !== 'bot-weekly') fail('不是周报');
  const sub = { id: newId('sb'), taskId, url, at: now(), version: 1, channel: 'bot' as const };
  db.submissions.push(sub);
  task.status = 'submitted';
  logEvent({ type: 'weekly.received', subjectType: 'submission', subjectId: sub.id, personId: task.userId, actorId: task.userId, source: 'bot', visibility: 'public', payload: { taskId }, dedupKey: `submission.created:${sub.id}` });
  commit();
}
/** 机器人写回轻测成绩（含「未答」） */
export function botWriteQuiz(taskId: string, result: number | '未答') {
  const task = taskById(taskId) ?? fail('任务不存在');
  if (task.completion !== 'bot-quiz') fail('不是轻测');
  task.quizResult = result;
  if (result !== '未答') task.status = 'passed';
  logEvent({ type: 'quiz.scored', subjectType: 'task', subjectId: taskId, personId: task.userId, source: 'bot', visibility: 'restricted', payload: { taskId, result }, dedupKey: `quiz.scored:${taskId}` });
  commit();
}

// ---------- 站与路径（轮岗排期抽屉里的操作） ----------
/** 交接要点（PRD 4.3）：原站带教（或管理员）写，最多 3 条；再写覆盖 */
export function writeHandover(stationId: string, points: string[], actor: User) {
  const s = stationById(stationId) ?? fail('站不存在');
  if (!isAdmin(actor) && stationMentorOf(s) !== actor.id) fail('只有这一站的站带教能写交接要点');
  const list = points.map(p => p.trim()).filter(Boolean);
  if (!list.length) fail('至少写一条');
  if (list.length > 3) fail('最多 3 条');
  let note = db.handovers.find(h => h.stationId === stationId);
  if (note) Object.assign(note, { points: list, authorId: actor.id, at: now() });
  else { note = { id: newId('ho'), stationId, userId: s.userId, authorId: actor.id, points: list, at: now() }; db.handovers.push(note); }
  logEvent({ type: 'handover.written', subjectType: 'handover', subjectId: note.id, personId: s.userId, actorId: actor.id, source: 'web', visibility: 'restricted', payload: { stationId } });
  commit();
  return note;
}

/** 换站接人：新站带教点「已准备」 */
export function markStationPrepared(stationId: string, actor: User) {
  const s = stationById(stationId) ?? fail('站不存在');
  if (!isAdmin(actor) && stationMentorOf(s) !== actor.id) fail('只有这一站的站带教能确认');
  s.preparedAt = now();
  logEvent({ type: 'station.prepared', subjectType: 'station', subjectId: s.id, personId: s.userId, actorId: actor.id, source: 'web', visibility: 'restricted', payload: { stationId } });
  commit();
}

/** 按新站期重排未开始的路径任务（手工调过截止的不动），并删掉未来的周期实例由规则重新展开 */
function rescheduleStations(stations: Station[], actor: User, reason: string) {
  const ids = new Set(stations.map(s => s.id));
  for (const task of db.tasks) {
    if (!task.stationId || !ids.has(task.stationId) || task.status !== 'todo' || task.originalDueAt) continue;
    const s = stationById(task.stationId)!;
    const tpl = templateById(task.templateId);
    if (!tpl) continue;
    const from = task.dueAt;
    task.dueAt = dueFromRule(tpl.deadline, s, db.workdays);
    task.openAt = openFromDue(task.dueAt, tpl.days, s.startAt, db.workdays);
    if (from !== task.dueAt) logEvent({ type: 'task.rescheduled', subjectType: 'task', subjectId: task.id, personId: task.userId, actorId: actor.id, source: 'web', visibility: 'restricted', payload: { taskId: task.id, from, to: task.dueAt, reason } });
  }
  const userIds = new Set(stations.map(s => s.userId));
  db.tasks = db.tasks.filter(x => !(x.kind === 'recurring' && userIds.has(x.userId) && ruleById(x.ruleId)?.stageIds && x.status === 'todo' && x.quizResult === undefined && t(x.dueAt) > t(now())));
}

/**
 * 顺延（PRD 4.1）：已开始的站只能顺延结束日；未开始的站整体后移；之后各站一起后移 N 个工作日。
 * 未开始的任务按新日期重排截止，留痕。管理员操作。
 */
export function postponeStation(stationId: string, workdays: number, reason: string, actor: User) {
  if (!isAdmin(actor)) fail('只有管理员能调整轮岗');
  if (!reason.trim()) fail('调整要写原因');
  if (!Number.isInteger(workdays) || workdays <= 0) fail('顺延天数要是正整数');
  const s = stationById(stationId) ?? fail('站不存在');
  if (stationTimePos(s) === 'left') fail('已离站的站不能调整');
  const p = pathOf(s.userId)!;
  const moved: Station[] = [];
  const before = p.stations.map(x => ({ id: x.id, startAt: x.startAt, endAt: x.endAt }));
  for (const x of p.stations) {
    if (x.order < s.order) continue;
    if (x.order > s.order || stationTimePos(x) === 'upcoming') x.startAt = addWorkdays(x.startAt, workdays, db.workdays);
    x.endAt = addWorkdays(x.endAt, workdays, db.workdays);
    moved.push(x);
  }
  p.endAt = p.stations[p.stations.length - 1].endAt;
  logEvent({ type: 'station.postponed', subjectType: 'station', subjectId: s.id, personId: s.userId, actorId: actor.id, source: 'web', visibility: 'public', payload: { stationId, workdays, reason: reason.trim(), before, after: moved.map(x => ({ id: x.id, startAt: x.startAt, endAt: x.endAt })) } });
  rescheduleStations(moved, actor, reason.trim());
  commit();
}

/** 换顺序：交换两站的时间段（两站都必须未开始），任务随站重排 */
export function swapStations(stationIdA: string, stationIdB: string, reason: string, actor: User) {
  if (!isAdmin(actor)) fail('只有管理员能调整轮岗');
  if (!reason.trim()) fail('调整要写原因');
  const a = stationById(stationIdA) ?? fail('站不存在'), b = stationById(stationIdB) ?? fail('站不存在');
  if (a.userId !== b.userId) fail('只能交换同一个人的两站');
  if (stationTimePos(a) !== 'upcoming' || stationTimePos(b) !== 'upcoming') fail('已开始的站不能换顺序');
  [a.startAt, b.startAt] = [b.startAt, a.startAt];
  [a.endAt, b.endAt] = [b.endAt, a.endAt];
  [a.order, b.order] = [b.order, a.order];
  pathOf(a.userId)!.stations.sort((x, y) => x.order - y.order);
  logEvent({ type: 'station.swapped', subjectType: 'station', subjectId: a.id, personId: a.userId, actorId: actor.id, source: 'web', visibility: 'public', payload: { stationId: a.id, otherStationId: b.id, reason: reason.trim() } });
  rescheduleStations([a, b], actor, reason.trim());
  commit();
}

/** 换站带教（含后补）：这一站未关闭的 R02、R06、R08、R09 改派给新带教；已写的点评不动 */
export function changeStationMentor(stationId: string, mentorId: string | undefined, reason: string, actor: User) {
  if (!isAdmin(actor)) fail('只有管理员能换站带教');
  const s = stationById(stationId) ?? fail('站不存在');
  if (mentorId && findUser(mentorId)?.role !== 'mentor' && findUser(mentorId)?.role !== 'admin') fail('只能指定带教人');
  const from = stationMentorOf(s);
  s.stationMentorId = mentorId;
  const to = stationMentorOf(s);
  logEvent({ type: 'station.mentorChanged', subjectType: 'station', subjectId: s.id, personId: s.userId, actorId: actor.id, source: 'web', visibility: 'restricted', payload: { stationId, from, to, reason: reason.trim() } });
  if (from !== to) reassignStationTodos(stationId, from, to, actor.id);
  commit();
}

/** 设或取消主带教（空 = 管理员担任） */
export function setMainMentor(userId: string, mentorId: string | undefined, actor: User) {
  if (!isAdmin(actor)) fail('只有管理员能指定主带教');
  const p = pathOf(userId) ?? fail('还没有个人路径');
  const from = p.mainMentorId;
  p.mainMentorId = mentorId;
  logEvent({ type: 'path.mainMentorChanged', subjectType: 'path', subjectId: p.id, personId: userId, actorId: actor.id, source: 'web', visibility: 'restricted', payload: { from, to: mentorId } });
  commit();
}

/** 中止培养：未关闭的待办全部撤销，指标分母剔除 */
export function stopTraining(userId: string, reason: string, actor: User) {
  if (!isAdmin(actor)) fail('只有管理员能操作');
  if (!reason.trim()) fail('要写原因');
  const u = userById(userId);
  u.stoppedAt = now();
  const p = pathOf(userId);
  if (p) p.status = 'ended';
  logEvent({ type: 'user.stopped', subjectType: 'user', subjectId: userId, personId: userId, actorId: actor.id, source: 'web', visibility: 'admin', payload: { reason: reason.trim() } });
  commit();
}

// ---------- 人与角色 ----------
/** 指定角色（管理员）；关闭 R01 */
export function setRole(userId: string, role: Role, actor?: User) {
  const u = userById(userId);
  u.role = role;
  u.roleAssignedAt = now();
  logEvent({ type: 'user.roleAssigned', subjectType: 'user', subjectId: userId, actorId: actor?.id ?? adminId(), source: 'web', visibility: 'admin', payload: { role } });
  commit();
}

/** 首次飞书登录：open_id 在某期预置名单里直接成为该期管培生，否则是同事（进 R01 待分配） */
export function firstLogin(openId: string, name: string): User {
  const hit = db.users.find(u => u.feishuOpenId === openId);
  if (hit) return hit;
  const cohort = db.cohorts.find(c => c.roster.some(r => r.openId === openId));
  const u: User = {
    id: newId('u'), name, color: '#5A6577', role: cohort ? 'trainee' : 'colleague', team: cohort?.name ?? '待分配',
    feishuOpenId: openId, cohortId: cohort?.id, firstLoginAt: now(), roleAssignedAt: cohort ? now() : undefined, lastActiveAt: now(),
  };
  db.users.push(u);
  logEvent({ type: 'user.firstLogin', subjectType: 'user', subjectId: u.id, actorId: u.id, source: 'feishu', visibility: 'admin', payload: { cohortId: cohort?.id }, dedupKey: `user.firstLogin:${u.id}` });
  commit();
  return u;
}

/** 连接状态变化（出错 → R12；恢复 → 关闭） */
export function setIntegrationStatus(id: string, level: IntegrationLevel, detail: string) {
  const i = db.integrations.find(x => x.id === id) ?? fail('没有这个连接');
  const wasError = i.level === 'error';
  Object.assign(i, { level, detail, at: now() });
  if (level === 'error') logEvent({ type: 'integration.error', subjectType: 'integration', subjectId: id, source: 'system', visibility: 'admin', payload: { detail }, dedupKey: `integration.error:${id}:${i.at}` });
  else if (wasError) logEvent({ type: 'integration.recovered', subjectType: 'integration', subjectId: id, source: 'system', visibility: 'admin', payload: { detail } });
  commit();
}

/** 发公告（管理员） */
export function publishAnnouncement(title: string, body: string, actor: User) {
  if (!isAdmin(actor)) fail('只有管理员能发公告');
  if (!title.trim()) fail('标题不能为空');
  const a = { id: newId('an'), title: title.trim(), body: body.trim(), at: now(), readBy: 0 };
  db.announcements.unshift(a);
  logEvent({ type: 'announcement.published', subjectType: 'announcement', subjectId: a.id, actorId: actor.id, source: 'web', visibility: 'public', payload: { title: a.title }, dedupKey: `announcement.published:${a.id}` });
  commit();
  return a;
}

// ---------- 路径模板（带版本） ----------
const templateOfModule = (moduleId: string) => {
  const m = db.modules.find(x => x.id === moduleId) ?? fail('模块不存在');
  const st = db.stages.find(x => x.id === m.stageId)!;
  return db.pathTemplates.find(x => x.id === st.templateId)!;
};
const assertEditable = (moduleId: string) => { if (templateOfModule(moduleId).frozen) fail('这个版本已被期次绑定，只读；请先另存新版本'); };

export function addTemplate(moduleId: string) {
  assertEditable(moduleId);
  const tpl: TaskTemplate = { id: newId('tt'), moduleId, name: '新任务', desc: '', requirements: [], output: '文档', days: 5, deadline: { anchor: 'stationStart', offsetWorkdays: 5, time: '18:00' }, assetIds: [], resources: [] };
  db.templates.push(tpl); notify(); return tpl;
}
export function updateTemplate(id: string, patch: Partial<TaskTemplate>) {
  const tpl = templateById(id) ?? fail('任务模板不存在');
  assertEditable(tpl.moduleId);
  Object.assign(tpl, patch); notify();
}
export function removeTemplate(id: string) {
  const tpl = templateById(id) ?? fail('任务模板不存在');
  assertEditable(tpl.moduleId);
  db.templates = db.templates.filter(x => x.id !== id); notify();
}
export function moveTemplate(id: string, dir: -1 | 1) {
  const tpl = templateById(id) ?? fail('任务模板不存在');
  assertEditable(tpl.moduleId);
  const same = db.templates.filter(x => x.moduleId === tpl.moduleId);
  const i = same.indexOf(tpl), j = i + dir;
  if (j < 0 || j >= same.length) return;
  const a = db.templates.indexOf(same[i]), b = db.templates.indexOf(same[j]);
  [db.templates[a], db.templates[b]] = [db.templates[b], db.templates[a]];
  notify();
}
/** 另存新版本：阶段、模块、任务模板一起复制，新版本可编辑 */
export function saveTemplateAsNewVersion(templateId: string, actor: User) {
  if (!isAdmin(actor)) fail('只有管理员能维护路径模板');
  const src = db.pathTemplates.find(x => x.id === templateId) ?? fail('模板不存在');
  const [maj, min] = src.version.replace('v', '').split('.').map(Number);
  const nt = { id: newId('pt'), name: src.name, version: `v${maj}.${min + 1}`, frozen: false, basedOnId: src.id, createdAt: now() };
  db.pathTemplates.push(nt);
  for (const st of db.stages.filter(x => x.templateId === src.id)) {
    const ns = { ...structuredClone(st), id: newId('s'), templateId: nt.id };
    db.stages.push(ns);
    for (const m of db.modules.filter(x => x.stageId === st.id)) {
      const nm = { ...structuredClone(m), id: newId('m'), stageId: ns.id };
      db.modules.push(nm);
      for (const tp of db.templates.filter(x => x.moduleId === m.id)) db.templates.push({ ...structuredClone(tp), id: newId('tt'), moduleId: nm.id });
    }
  }
  logEvent({ type: 'template.versioned', subjectType: 'template', subjectId: nt.id, actorId: actor.id, source: 'web', visibility: 'public', payload: { from: src.version, to: nt.version } });
  notify();
  return nt;
}

// ---------- AI 资产 ----------
export function validateSkillMd(text: string): string | null {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return 'SKILL.md 开头要有 YAML 区块（用 --- 包起来）';
  if (!/^name:\s*\S+/m.test(m[1])) return 'YAML 里缺 name';
  if (!/^description:\s*\S+/m.test(m[1])) return 'YAML 里缺 description';
  return null;
}
type AssetInput = Pick<Asset, 'type' | 'title' | 'summary' | 'tags' | 'usage' | 'content' | 'installCmd' | 'example'>;
export function submitAsset(input: AssetInput, author: User) {
  if (input.type === 'Skill') { const e = validateSkillMd(input.content ?? ''); if (e) fail(e); }
  const a: Asset = { ...input, id: newId('a'), authorId: author.id, version: 'v1.0', submittedAt: now(), updatedAt: now(), status: 'pending', baseUses: 0, usedBy: [], favBy: [] };
  db.assets.push(a);
  logEvent({ type: 'asset.submitted', subjectType: 'asset', subjectId: a.id, actorId: author.id, source: 'web', visibility: 'admin', payload: { version: a.version }, dedupKey: `asset.submitted:${a.id}:${a.submittedAt}` });
  commit();
  return a;
}
/** 退回后修改再提交（关闭 R11、重新进 R10） */
export function resubmitAsset(assetId: string, patch: Partial<AssetInput>, author: User) {
  const a = db.assets.find(x => x.id === assetId) ?? fail('资产不存在');
  if (a.authorId !== author.id) fail('只能改自己的资产');
  if (a.status !== 'returned') fail('只有被退回的资产需要重新提交');
  const next = { ...a, ...patch };
  if (next.type === 'Skill') { const e = validateSkillMd(next.content ?? ''); if (e) fail(e); }
  const [maj, min] = a.version.replace('v', '').split('.').map(Number);
  Object.assign(a, patch, { status: 'pending', returnReason: undefined, version: `v${maj}.${min + 1}`, submittedAt: now(), updatedAt: now() });
  logEvent({ type: 'asset.submitted', subjectType: 'asset', subjectId: a.id, actorId: author.id, source: 'web', visibility: 'admin', payload: { version: a.version }, dedupKey: `asset.submitted:${a.id}:${a.submittedAt}` });
  commit();
}
/** 审核：通过即上架（写公开事件，贡献由它派生）；退回要写原因 */
export function reviewAsset(assetId: string, approve: boolean, reason = '', actor?: User) {
  const a = db.assets.find(x => x.id === assetId) ?? fail('资产不存在');
  if (actor && !isAdmin(actor)) fail('只有管理员能审核');
  a.status = approve ? 'live' : 'returned';
  a.returnReason = approve ? undefined : reason.trim() || '请补充说明后重新提交';
  a.updatedAt = now();
  logEvent(approve
    ? { type: 'asset.approved', subjectType: 'asset', subjectId: a.id, actorId: a.authorId, source: 'web', visibility: 'public', payload: { title: a.title, assetType: a.type, reviewerId: actor?.id ?? adminId() }, dedupKey: `asset.approved:${a.id}:${a.updatedAt}` }
    : { type: 'asset.returned', subjectType: 'asset', subjectId: a.id, actorId: actor?.id ?? adminId(), source: 'web', visibility: 'owner', payload: { reason: a.returnReason }, dedupKey: `asset.returned:${a.id}:${a.updatedAt}` });
  commit();
}
const toggle = (arr: string[], id: string) => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); return i < 0; };
export function toggleFav(assetId: string, user: User) { toggle((db.assets.find(x => x.id === assetId) ?? fail('资产不存在')).favBy, user.id); notify(); }
export function toggleUsed(assetId: string, user: User) {
  const a = db.assets.find(x => x.id === assetId) ?? fail('资产不存在');
  if (toggle(a.usedBy, user.id)) logEvent({ type: 'asset.used', subjectType: 'asset', subjectId: a.id, actorId: user.id, source: 'web', visibility: 'public', payload: { authorId: a.authorId } });
  notify();
}

