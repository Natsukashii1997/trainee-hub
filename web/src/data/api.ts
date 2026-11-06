// 数据访问层入口：页面只从这里 import（接口说明见同目录 README.md）。
// UI 原型阶段读写内存里的示例数据；接后端时逐个换成接口调用即可。
import { useSyncExternalStore } from 'react';
import { addWorkdays } from '../lib/workday';
import { db, getVersion, now, subscribe } from './store';
import { seedEvents } from './actions';
import { syncAll, todosOf } from './rules';
import {
  activeTrainees, currentStation, effectiveDue, handoverOf, isDelivered, isOverdue, moduleById, nextStation, pathOf,
  responsibleMentorId, reviewsOf, ruleById, stageById, stationById, stationOfTask, stationsOf, submissionsOf, taskById,
  taskStatusLabel, tasksOf, templateById, userById,
} from './model';
import { canNudgeNow, dueAdjustmentsOf, lastNudge } from './actions';
import { canReview, canSeeAssessment, canSeeHandover, canSeePrivate, canSeeTaskStatus, isRelatedMentor } from './visibility';
import { progressOf } from './metrics';
import { teamEventsAll, weekRange } from './schedule';
import type { Asset, AssetType, EventLog, FeedItem, Role, TaskTemplate, User } from './types';

export * from './model';
export * from './visibility';
export * from './rules';
export * from './schedule';
export * from './metrics';
export * from './actions';
export { ADMIN_ID, COHORT_ID, DEMO_NOW } from './mock';

// 初始化：把示例数据里已发生的事补成事件，再推算一次
seedEvents();
syncAll();

const t = (iso: string) => Date.parse(iso);

/** 页面里用：数据一变就重新渲染 */
export function useDataVersion() { return useSyncExternalStore(subscribe, getVersion); }
export { now };

// ---------- 演示视角 ----------
const DEMO_USER: Record<Role, string> = { trainee: 'u-lin', mentor: 'u-zhou', admin: 'u-chang', colleague: 'u-he' };
/** 原型的演示身份：管培生 = 林夏，带教 = 周颖，管理员 = 常浩，同事 = 何安 */
export const demoUserFor = (role: Role) => userById(DEMO_USER[role]);

// ---------- 期次、模板、日历 ----------
export const cohortsAll = () => db.cohorts;
export const cohortById = (id?: string) => db.cohorts.find(c => c.id === id);
export const pathTemplatesAll = () => db.pathTemplates;
export const recurringRulesAll = () => db.recurringRules;
export const workdayCalendar = () => db.workdays;
/** 全程天数（模板各阶段天数之和） */
export const totalDays = () => db.stages.filter(s => s.templateId === db.cohorts[0]?.templateId).reduce((s, x) => s + x.days, 0);
export const isActiveThisWeek = (u: User) => !!u.lastActiveAt && t(u.lastActiveAt) >= t(weekRange()[0]);

/** 当前位置：所在站、模块、阶段、轮岗第几站、本站第几周、下一站 */
export function currentPosition(userId: string) {
  const station = currentStation(userId);
  if (!station) return null;
  const module = moduleById(station.moduleId);
  const rotation = stationsOf(userId).filter(s => moduleById(s.moduleId).stageId === 's3');
  return {
    station, module, stage: stageById(module.stageId), rotation, rotIndex: rotation.findIndex(s => s.id === station.id),
    week: Math.floor((t(now()) - t(station.startAt)) / (7 * 86400000)) + 1, next: nextStation(userId),
    stationMentorId: station.stationMentorId, mainMentorId: pathOf(userId)?.mainMentorId,
  };
}

// ---------- 任务 ----------
/** 某周（按生效截止）的任务 */
export const weekTasksOf = (userId: string, offset = 0) => {
  const [a, b] = weekRange(offset);
  return tasksOf(userId).filter(x => t(effectiveDue(x)) >= t(a) && t(effectiveDue(x)) < t(b));
};
/** 查看人看得到的任务列表：本人、相关带教、管理员；其他人返回空（只看站级进度） */
export const visibleTasksOf = (viewer: User, userId: string) => (canSeeTaskStatus(viewer, userId) ? tasksOf(userId) : []);

/** 任务详情：查看人无权看任务状态时返回 null；私密部分（提交、点评）、考核（轻测成绩）按可见性裁掉 */
export function taskDetail(taskId: string, viewer: User) {
  const task = taskById(taskId);
  if (!task || !canSeeTaskStatus(viewer, task.userId)) return null;
  const canSee = canSeePrivate(viewer, task);
  const station = stationOfTask(task);
  const assess = canSeeAssessment(viewer, task.userId);
  return {
    task, owner: userById(task.userId), station, module: station ? moduleById(station.moduleId) : undefined,
    template: templateById(task.templateId), rule: ruleById(task.ruleId),
    statusLabel: task.completion === 'bot-quiz' && !assess ? '—' : taskStatusLabel(task),
    quizResult: assess ? task.quizResult : undefined,
    overdue: isOverdue(task), effectiveDueAt: effectiveDue(task),
    responsibleMentorId: responsibleMentorId(task),
    canSee, canReview: canReview(viewer, task), readOnly: viewer.id !== task.userId && !canReview(viewer, task),
    submissions: canSee ? submissionsOf(task.id) : [],
    reviews: canSee ? reviewsOf(task.id) : [],
    dueAdjustments: canSee ? dueAdjustmentsOf(task.id) : [],
    lastNudge: lastNudge(task.id), canNudge: canNudgeNow(task.id),
    assets: assetsForTemplate(templateById(task.templateId)),
    resources: db.resources.filter(r => r.moduleId && r.moduleId === task.moduleId),
  };
}

/** 等待点评（= 查看人名下未关闭的 R02 待办，管理员看全部），按离超时还有多久排序 */
export function pendingReviews(viewer: User) {
  const list = viewer.role === 'admin' ? db.todos.filter(x => x.status === 'open' && x.rule === 'R02') : todosOf(viewer.id).filter(x => x.rule === 'R02');
  return list.map(todo => {
    const task = taskById(todo.subjectId)!;
    return { todo, task, owner: userById(task.userId), sub: submissionsOf(task.id)[0], dueAt: todo.dueAt!, late: t(now()) > t(todo.dueAt!) };
  }).filter(x => x.sub).sort((a, b) => t(a.dueAt) - t(b.dueAt));
}

/** 最近一条点评（查看人能看到的） */
export function latestReviewOf(userId: string, viewer?: User) {
  const ids = new Set(tasksOf(userId).filter(x => !viewer || canSeePrivate(viewer, x)).map(x => x.id));
  return db.reviews.filter(r => ids.has(r.taskId)).sort((a, b) => t(b.at) - t(a.at))[0];
}

/** 带教看板的一行：谁在哪站、做完几成、待我做什么、上一站怎样（PRD 3.3 看板是人和进度的家） */
export function boardRows(viewer: User) {
  const list = activeTrainees().filter(u => viewer.role === 'admin' || isRelatedMentor(viewer, u.id));
  return list.map(u => {
    const station = currentStation(u.id)!;
    const week = weekTasksOf(u.id);
    const prev = station ? stationsOf(u.id).find(s => s.order === station.order - 1) : undefined;
    return {
      user: u, station, module: moduleById(station.moduleId), stationMentorId: station.stationMentorId, mainMentorId: pathOf(u.id)?.mainMentorId,
      progress: progressOf(u.id)!, weekDone: week.filter(isDelivered).length, weekTotal: week.length,
      lastReview: latestReviewOf(u.id, viewer), overdue: tasksOf(u.id).filter(x => isOverdue(x) && canSeePrivate(viewer, x)),
      myTodos: todosOf(viewer.id).filter(x => x.personId === u.id).length,
      prevHandover: prev ? (() => { const h = handoverOf(prev.id); return h && canSeeHandover(viewer, h) ? h : undefined; })() : undefined,
    };
  }).sort((a, b) => b.overdue.length - a.overdue.length || b.myTodos - a.myTodos);
}

/** 个人档案的交接卡：历次站的交接要点（只给相关带教和管理员） */
export function handoverCard(userId: string, viewer: User) {
  return stationsOf(userId).map(s => ({ station: s, module: moduleById(s.moduleId), note: handoverOf(s.id) }))
    .filter(x => x.note && canSeeHandover(viewer, x.note));
}
export const handoverDueAt = (stationId: string) => { const s = stationById(stationId); return s ? addWorkdays(s.endAt, 2, db.workdays) : undefined; };

// ---------- 事件：动态、时间线 ----------
const name = (id?: string) => (id ? userById(id)?.name ?? '' : '');
/** 事件的中文描述 */
export function eventText(e: EventLog): string {
  const task = e.payload?.taskId ? taskById(String(e.payload.taskId)) : undefined;
  const st = e.payload?.stationId ? stationById(String(e.payload.stationId)) : undefined;
  const stName = st ? `${moduleById(st.moduleId).name}站` : '';
  switch (e.type) {
    case 'user.firstLogin': return `${name(e.subjectId)} 首次登录`;
    case 'user.roleAssigned': return `${name(e.subjectId)} 的角色设为${String(e.payload?.role ?? '')}`;
    case 'user.stopped': return `${name(e.subjectId)} 中止培养`;
    case 'path.mainMentorChanged': return `主带教改为${e.payload?.to ? name(String(e.payload.to)) : '管理员'}`;
    case 'station.mentorChanged': return `${stName}站带教改为${name(String(e.payload?.to ?? ''))}`;
    case 'station.prepared': return `${name(e.actorId)} 已准备好接${name(e.personId)}到${stName}`;
    case 'station.postponed': return `${stName}顺延 ${String(e.payload?.workdays)} 个工作日`;
    case 'station.swapped': return '调整了轮岗顺序';
    case 'station.switching': return `将换到${stName}`;
    case 'station.ended': return `${stName}结束`;
    case 'station.leftUnsettled': return `离开${stName}时还有任务没有结论`;
    case 'task.opened': return `「${task?.name ?? ''}」开放`;
    case 'task.started': return `开始「${task?.name ?? ''}」`;
    case 'task.dueSoon': return `「${task?.name ?? ''}」快到截止`;
    case 'task.overdue': return `「${task?.name ?? ''}」逾期`;
    case 'task.dueAdjusted': return `${name(e.actorId)} 调整了「${task?.name ?? ''}」的截止：${String(e.payload?.reason ?? '')}`;
    case 'task.dueAdjustUndone': return `${name(e.actorId)} 撤销了「${task?.name ?? ''}」的截止调整`;
    case 'task.rescheduled': return `「${task?.name ?? ''}」随路径调整重排截止`;
    case 'task.nudged': return `${name(e.actorId)} 催办「${task?.name ?? ''}」`;
    case 'submission.created': return `提交了「${task?.name ?? ''}」`;
    case 'weekly.received': return `交了${task?.name ?? '周报'}`;
    case 'review.created': return `${name(e.actorId)} 点评了「${task?.name ?? ''}」：${String(e.payload?.grade ?? '')}`;
    case 'quiz.scored': return `「${task?.name ?? ''}」${e.payload?.result === '未答' ? '未答' : '已出分'}`;
    case 'handover.written': return `${name(e.actorId)} 写了${stName}的交接要点`;
    case 'asset.submitted': return `提交了资产待审核`;
    case 'asset.approved': return `上架了 ${String(e.payload?.assetType ?? '')}「${String(e.payload?.title ?? '')}」`;
    case 'asset.returned': return `资产被退回：${String(e.payload?.reason ?? '')}`;
    case 'asset.used': return `用了「${db.assets.find(a => a.id === e.subjectId)?.title ?? ''}」`;
    case 'integration.error': return `连接异常：${String(e.payload?.detail ?? '')}`;
    case 'integration.recovered': return '连接恢复正常';
    case 'todo.reassigned': return `待办改派给${name(String(e.payload?.to ?? ''))}`;
    case 'announcement.published': return `发布了公告「${String(e.payload?.title ?? '')}」`;
    case 'template.versioned': return `路径模板另存为 ${String(e.payload?.to ?? '')}`;
  }
}

/** 查看人能不能看这条事件 */
export function canSeeEvent(viewer: User, e: EventLog): boolean {
  if (viewer.role === 'admin' || e.visibility === 'public') return true;
  if (e.visibility === 'admin') return false;
  if (e.visibility === 'owner') return viewer.id === e.personId || viewer.id === e.actorId || (e.subjectType === 'asset' && db.assets.find(a => a.id === e.subjectId)?.authorId === viewer.id);
  const task = e.payload?.taskId ? taskById(String(e.payload.taskId)) : undefined;
  if (task) return canSeePrivate(viewer, task);
  return !!e.personId && canSeePrivate(viewer, userById(e.personId));
}

/** 动态流 = 事件日志的公开投影（资产上架、公告等），不出现考核结果 */
export function feedList(limit = 20): FeedItem[] {
  return db.events.filter(e => e.visibility === 'public' && e.actorId && (e.type === 'asset.approved' || e.type === 'announcement.published' || e.type === 'template.versioned'))
    .sort((a, b) => t(b.at) - t(a.at)).slice(0, limit)
    .map(e => ({ id: e.id, actorId: e.actorId!, text: eventText(e), at: e.at }));
}

/** 成长时间线 = 主体是这个人的事件，按查看人权限过滤（PRD 3.2） */
export function timelineOf(userId: string, viewer: User) {
  return db.events.filter(e => (e.personId === userId || (e.visibility === 'public' && e.actorId === userId)) && t(e.at) <= t(now()) && canSeeEvent(viewer, e))
    .sort((a, b) => t(b.at) - t(a.at)).map(e => ({ event: e, text: eventText(e) }));
}

// ---------- 贡献（由事件派生） ----------
/** 贡献：资产上架、担任分享会主讲（挂上回放后才记） */
export function contributionsOf(userId: string) {
  const list: { id: string; kind: '资产上架' | '分享会主讲'; title: string; at: string }[] = [];
  for (const e of db.events) if (e.type === 'asset.approved' && e.actorId === userId) list.push({ id: e.id, kind: '资产上架', title: `${String(e.payload?.assetType)}「${String(e.payload?.title)}」`, at: e.at });
  for (const ev of teamEventsAll()) if (ev.speakerId === userId && ev.status === 'replayed') list.push({ id: ev.id, kind: '分享会主讲', title: ev.title, at: ev.endAt });
  return list.sort((a, b) => t(b.at) - t(a.at));
}
/** 一期贡献榜按贡献条数排；三期换成积分 */
export function leaderboard() {
  return db.users.map(u => ({ user: u, count: contributionsOf(u.id).length })).filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count || a.user.name.localeCompare(b.user.name, 'zh'));
}

// ---------- 公告、资料、连接状态 ----------
export const announcementsAll = () => db.announcements;
export const latestAnnouncement = () => db.announcements[0];
export const resourcesForModule = (moduleId?: string) => db.resources.filter(r => r.moduleId === moduleId);
export const resourcesAll = () => db.resources;
export const integrationsAll = () => db.integrations;

// ---------- AI 资产 ----------
export const ASSET_TYPES: AssetType[] = ['Skill', 'Prompt', '工作流', '用例'];
export const ASSET_TAGS = ['行研', '客服', '销售', '教学', '内容', '投放', '数据整理', '复盘', 'AI'];
export const assetById = (id: string) => db.assets.find(a => a.id === id);
export const uses = (a: Asset) => a.baseUses + a.usedBy.length;
export function listAssets(f: { type?: AssetType | ''; tag?: string; q?: string; status?: Asset['status'] } = {}) {
  const q = (f.q ?? '').trim();
  return db.assets
    .filter(a => a.status === (f.status ?? 'live'))
    .filter(a => !f.type || a.type === f.type)
    .filter(a => !f.tag || a.tags.includes(f.tag))
    .filter(a => !q || a.title.includes(q) || a.summary.includes(q))
    .sort((a, b) => uses(b) - uses(a));
}
export const assetsBy = (userId: string) => db.assets.filter(a => a.authorId === userId);
export const assetsForTemplate = (tpl?: TaskTemplate) => (tpl?.assetIds ?? []).map(assetById).filter((a): a is Asset => !!a && a.status === 'live');
export const tasksUsingAsset = (assetId: string) => db.templates.filter(x => x.assetIds.includes(assetId));
/** 本月（北京时间）新上架的资产 */
export function newAssetsThisMonth() {
  const bjNow = new Date(t(now()) + 8 * 3600000); // 北京时间
  const start = Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), 1) - 8 * 3600000;
  return db.assets.filter(a => a.status === 'live' && t(a.updatedAt) >= start);
}

