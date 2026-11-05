// 数据访问层。UI 原型阶段读写内存里的示例数据；接后端时，页面只依赖这里导出的函数和类型，逐个换成接口调用即可。
import { useSyncExternalStore } from 'react';
import * as seed from './mock';
import { daysSince } from '../lib/time';
import type {
  Asset, AssetType, Grade, Module, Review, Role, Stage, Submission, TaskInstance, TaskTemplate, User,
} from './types';
import { canSeePrivate } from './types';

const clone = <T,>(x: T): T => structuredClone(x);
const db = {
  users: clone(seed.users), stages: clone(seed.stages), modules: clone(seed.modules), templates: clone(seed.templates),
  paths: clone(seed.paths), tasks: clone(seed.tasks), submissions: clone(seed.submissions), reviews: clone(seed.reviews),
  assets: clone(seed.assets), feed: clone(seed.feed), announcements: clone(seed.announcements), calendar: clone(seed.calendar),
  resources: clone(seed.resources),
};

// ---------- 订阅：数据变了让页面重算 ----------
let version = 0;
const listeners = new Set<() => void>();
const bump = () => { version++; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
/** 页面里用：数据一变就重新渲染 */
export function useDataVersion() { return useSyncExternalStore(subscribe, () => version); }

let seq = 100;
const newId = (p: string) => `${p}-${++seq}`;

export const now = () => seed.DEMO_NOW;
export const nextEvent = seed.nextEvent;
export const botStatus = seed.botStatus;

// ---------- 人 ----------
export const userById = (id: string) => db.users.find(u => u.id === id)!;
export const listUsers = () => db.users;
export const trainees = () => db.users.filter(u => u.role === 'trainee');
export const mentors = () => db.users.filter(u => u.role === 'mentor');
const DEMO_USER: Record<Role, string> = { trainee: 'u-lin', mentor: 'u-zhou', admin: 'u-chang', colleague: 'u-he' };
export const demoUserFor = (role: Role) => userById(DEMO_USER[role]);
export function setRole(userId: string, role: Role) { userById(userId).role = role; bump(); }
export function setMentor(userId: string, mentorId: string) {
  userById(userId).mentorId = mentorId;
  db.tasks.filter(t => t.userId === userId && t.status !== 'passed').forEach(t => { t.mentorId = mentorId; });
  bump();
}
export const isActiveThisWeek = (u: User) => !!u.lastActiveAt && Date.parse(u.lastActiveAt) >= Date.parse(weekRange()[0]);

// ---------- 路径 ----------
export const stagesAll = (): Stage[] => db.stages;
export const modulesOf = (stageId: string): Module[] => db.modules.filter(m => m.stageId === stageId);
export const moduleById = (id: string) => db.modules.find(m => m.id === id)!;
export const stageById = (id: string) => db.stages.find(s => s.id === id)!;
export const templatesOf = (moduleId: string): TaskTemplate[] => db.templates.filter(t => t.moduleId === moduleId);
export const templateById = (id?: string) => db.templates.find(t => t.id === id);
export const pathOf = (userId: string) => db.paths.find(p => p.userId === userId);
export const totalDays = () => db.stages.reduce((s, x) => s + x.days, 0);

/** 时间进度：第几天、占全程百分比 */
export function timeProgress(userId: string) {
  const p = pathOf(userId);
  if (!p) return { day: 0, total: totalDays(), pct: 0 };
  const day = daysSince(p.startAt, now()) + 1;
  return { day, total: totalDays(), pct: Math.min(100, Math.round((day / totalDays()) * 100)) };
}

/** 当前所在的阶段、模块、轮岗第几站、本模块第几周 */
export function currentPosition(userId: string) {
  const p = pathOf(userId);
  if (!p) return null;
  const t = Date.parse(now());
  const idx = p.modules.findIndex(m => Date.parse(m.startAt) <= t && t <= Date.parse(m.endAt));
  const pm = p.modules[Math.max(0, idx)];
  const mod = moduleById(pm.moduleId);
  const rotation = p.modules.filter(m => moduleById(m.moduleId).stageId === 's3');
  const rotIndex = rotation.findIndex(m => m.moduleId === pm.moduleId);
  const week = Math.floor(daysSince(pm.startAt, now()) / 7) + 1;
  return { pm, module: mod, stage: stageById(mod.stageId), rotation, rotIndex, week };
}

/** 每个模块的状态：done / cur / todo */
export function moduleState(userId: string, moduleId: string): 'done' | 'cur' | 'todo' {
  const pm = pathOf(userId)?.modules.find(m => m.moduleId === moduleId);
  if (!pm) return 'todo';
  const t = Date.parse(now());
  if (t > Date.parse(pm.endAt)) return 'done';
  if (t >= Date.parse(pm.startAt)) return 'cur';
  return 'todo';
}

export function addTemplate(moduleId: string) {
  const t: TaskTemplate = { id: newId('tt'), moduleId, name: '新任务', desc: '', requirements: [], output: '文档', days: 7, assetIds: [], resources: [] };
  db.templates.push(t); bump(); return t;
}
export function updateTemplate(id: string, patch: Partial<TaskTemplate>) { Object.assign(templateById(id)!, patch); bump(); }
export function removeTemplate(id: string) { db.templates = db.templates.filter(t => t.id !== id); bump(); }
export function moveTemplate(id: string, dir: -1 | 1) {
  const t = templateById(id)!;
  const same = db.templates.filter(x => x.moduleId === t.moduleId);
  const i = same.indexOf(t), j = i + dir;
  if (j < 0 || j >= same.length) return;
  const a = db.templates.indexOf(same[i]), b = db.templates.indexOf(same[j]);
  [db.templates[a], db.templates[b]] = [db.templates[b], db.templates[a]];
  bump();
}

/** 重新分配个人路径的轮岗顺序与带教人（原型：只改路径，不重排历史任务） */
export function assignRotation(userId: string, order: string[], mentorIds: string[]) {
  const p = pathOf(userId);
  if (!p) return;
  const rot = p.modules.filter(m => moduleById(m.moduleId).stageId === 's3');
  rot.forEach((m, i) => { m.moduleId = order[i]; m.mentorId = mentorIds[i]; });
  bump();
}

// ---------- 任务 ----------
const byDue = (a: TaskInstance, b: TaskInstance) => Date.parse(a.dueAt) - Date.parse(b.dueAt);
export const taskById = (id: string) => db.tasks.find(t => t.id === id);
export const tasksOf = (userId: string) => db.tasks.filter(t => t.userId === userId).sort(byDue);
export const isOpen = (t: TaskInstance) => t.status === 'todo' || t.status === 'doing' || t.status === 'revise';
export const isOverdue = (t: TaskInstance) => isOpen(t) && Date.parse(t.dueAt) < Date.parse(now());

/** 本周（北京时间周一 00:00 到周日 24:00） */
export function weekRange(offsetWeeks = 0): [string, string] {
  const bjNow = new Date(Date.parse(now()) + 8 * 3600000);
  const dow = (bjNow.getUTCDay() + 6) % 7;
  const mon = Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), bjNow.getUTCDate() - dow + offsetWeeks * 7) - 8 * 3600000;
  return [new Date(mon).toISOString(), new Date(mon + 7 * 86400000).toISOString()];
}
const inRange = (iso: string, [a, b]: [string, string]) => Date.parse(iso) >= Date.parse(a) && Date.parse(iso) < Date.parse(b);
export const weekTasksOf = (userId: string, offset = 0) => tasksOf(userId).filter(t => inRange(t.dueAt, weekRange(offset)));
export const isDelivered = (t: TaskInstance) => t.status === 'submitted' || t.status === 'passed';

export const submissionsOf = (taskId: string): Submission[] =>
  db.submissions.filter(s => s.taskId === taskId).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
export const reviewsOf = (taskId: string): Review[] =>
  db.reviews.filter(r => r.taskId === taskId).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
export function latestReviewOf(userId: string) {
  const ids = new Set(tasksOf(userId).map(t => t.id));
  return db.reviews.filter(r => ids.has(r.taskId)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
}

/** 任务详情：私密部分（提交、点评）按可见性规则裁掉 */
export function taskDetail(taskId: string, viewer: User) {
  const task = taskById(taskId);
  if (!task) return null;
  const owner = userById(task.userId);
  const canSee = canSeePrivate(viewer, owner, [task.mentorId]);
  return {
    task, owner, canSee, template: templateById(task.templateId),
    module: task.moduleId ? moduleById(task.moduleId) : undefined,
    submissions: canSee ? submissionsOf(task.id) : [],
    reviews: canSee ? reviewsOf(task.id) : [],
  };
}

export const FEISHU_DOC = /^https:\/\/[\w-]+\.(feishu\.cn|larksuite\.com)\/(docx|docs|wiki|sheets|base|file)\/\w+/;
export function submitTask(taskId: string, url: string, note: string, actor: User) {
  const task = taskById(taskId)!;
  if (actor.id !== task.userId) throw new Error('只能提交自己的任务');
  if (!FEISHU_DOC.test(url.trim())) throw new Error('请贴飞书文档、表格或知识库链接');
  db.submissions.push({ id: newId('sb'), taskId, url: url.trim(), at: now(), note: note.trim() || undefined });
  task.status = 'submitted';
  bump();
}
export function reviewTask(taskId: string, grade: Grade, comment: string, mentor: User) {
  const task = taskById(taskId)!;
  if (!(mentor.role === 'admin' || mentor.id === task.mentorId)) throw new Error('只有带教人和管理员能点评');
  const sub = submissionsOf(taskId)[0];
  if (!sub) throw new Error('还没有提交');
  db.reviews.push({ id: newId('rv'), taskId, submissionId: sub.id, mentorId: mentor.id, grade, comment: comment.trim(), at: now() });
  task.status = grade === '需改进' ? 'revise' : 'passed';
  bump();
}

/** 等待点评的提交，先到先评 */
export function pendingReviews(viewer: User) {
  return db.tasks
    .filter(t => t.status === 'submitted' && (viewer.role === 'admin' || t.mentorId === viewer.id))
    .map(t => ({ task: t, owner: userById(t.userId), sub: submissionsOf(t.id)[0] }))
    .filter(x => x.sub)
    .sort((a, b) => Date.parse(a.sub.at) - Date.parse(b.sub.at));
}

/** 带教看板的一行 */
export function boardRows(viewer: User) {
  const list = trainees().filter(u => viewer.role === 'admin' || u.mentorId === viewer.id);
  return list.map(u => {
    const week = weekTasksOf(u.id);
    const overdue = tasksOf(u.id).filter(isOverdue);
    return {
      user: u, pos: currentPosition(u.id), progress: timeProgress(u.id),
      weekDone: week.filter(isDelivered).length, weekTotal: week.length,
      lastReview: latestReviewOf(u.id), overdue,
    };
  }).sort((a, b) => b.overdue.length - a.overdue.length);
}

// ---------- 管理员指标 ----------
/** 按时提交率：统计周期内已到截止时间的任务里，在截止前提交的占比（PRD 第 13 节主指标） */
export function onTimeRate(offsetWeeks = 0) {
  const range = weekRange(offsetWeeks);
  const due = db.tasks.filter(t => inRange(t.dueAt, range) && Date.parse(t.dueAt) <= Date.parse(now()));
  if (!due.length) return null;
  const onTime = due.filter(t => db.submissions.some(s => s.taskId === t.id && Date.parse(s.at) <= Date.parse(t.dueAt)) || (t.status === 'passed' && !submissionsOf(t.id).length));
  return Math.round((onTime.length / due.length) * 100);
}

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
export const tasksUsingAsset = (assetId: string) => db.templates.filter(t => t.assetIds.includes(assetId));
const toggle = (arr: string[], id: string) => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); };
export function toggleFav(assetId: string, user: User) { toggle(assetById(assetId)!.favBy, user.id); bump(); }
export function toggleUsed(assetId: string, user: User) { toggle(assetById(assetId)!.usedBy, user.id); bump(); }

export function validateSkillMd(text: string): string | null {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return 'SKILL.md 开头要有 YAML 区块（用 --- 包起来）';
  if (!/^name:\s*\S+/m.test(m[1])) return 'YAML 里缺 name';
  if (!/^description:\s*\S+/m.test(m[1])) return 'YAML 里缺 description';
  return null;
}
export function submitAsset(input: Pick<Asset, 'type' | 'title' | 'summary' | 'tags' | 'usage' | 'content' | 'installCmd' | 'example'>, author: User) {
  if (input.type === 'Skill') { const e = validateSkillMd(input.content ?? ''); if (e) throw new Error(e); }
  const a: Asset = { ...input, id: newId('a'), authorId: author.id, version: 'v1.0', submittedAt: now(), updatedAt: now(), status: 'pending', baseUses: 0, usedBy: [], favBy: [] };
  db.assets.push(a); bump(); return a;
}
/** 审核：通过即上架，并为作者记一条贡献（三期积分按此补算） */
export function reviewAsset(assetId: string, approve: boolean, reason = '') {
  const a = assetById(assetId)!;
  a.status = approve ? 'live' : 'returned';
  a.returnReason = approve ? undefined : reason.trim() || '请补充说明后重新提交';
  a.updatedAt = now();
  if (approve) db.feed.unshift({ id: newId('f'), actorId: a.authorId, text: `上架了 ${a.type}「${a.title}」`, at: now() });
  bump();
}

// ---------- 贡献、动态 ----------
export function contributionsOf(userId: string) {
  const list = db.assets.filter(a => a.authorId === userId && a.status === 'live')
    .map(a => ({ id: a.id, kind: '资产上架' as const, title: `${a.type}「${a.title}」`, at: a.updatedAt }));
  const all: { id: string; kind: '资产上架' | '分享会主讲'; title: string; at: string }[] = list;
  if (userId === seed.nextEvent.speakerId) all.push({ id: 'ev-1', kind: '分享会主讲', title: '分享会「用 Claude 做行业研究」', at: seed.nextEvent.startAt });
  return all.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
/** 一期贡献榜按贡献条数排；三期换成积分 */
export function leaderboard() {
  return db.users.map(u => ({ user: u, count: contributionsOf(u.id).length })).filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count || a.user.name.localeCompare(b.user.name, 'zh'));
}
export const feedList = () => [...db.feed].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
export const latestAnnouncement = () => db.announcements[0];
export const calendarOf = (userId: string) => db.calendar.filter(c => c.ownerId === userId).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
export const resourcesForModule = (moduleId?: string) => db.resources.filter(r => r.moduleId === moduleId);
/** 本月（北京时间）新上架的资产 */
export function newAssetsThisMonth() {
  const bjNow = new Date(Date.parse(now()) + 8 * 3600000);
  const start = Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), 1) - 8 * 3600000;
  return db.assets.filter(a => a.status === 'live' && Date.parse(a.updatedAt) >= start);
}
