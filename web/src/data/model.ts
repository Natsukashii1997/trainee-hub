// 读模型：按 PRD 4.1、4.2 从存储推出的关系与标记（负责带教、逾期、站的时间位置与结清……）。都是纯查询，不改数据。
import { db, now } from './store';
import { ADMIN_ID } from './mock';
import type { Module, PersonalPath, Stage, Station, StationTimePos, TaskInstance, TaskTemplate, User } from './types';
import { STATUS_LABEL } from './types';

const t = (iso: string) => Date.parse(iso);

// ---------- 人 ----------
export const adminId = () => db.users.find(u => u.role === 'admin')?.id ?? ADMIN_ID;
export const userById = (id: string): User => db.users.find(u => u.id === id)!;
export const findUser = (id?: string): User | undefined => (id ? db.users.find(u => u.id === id) : undefined);
export const listUsers = () => db.users;
/** 全部管培生（含已中止培养的） */
export const trainees = () => db.users.filter(u => u.role === 'trainee');
/** 在培的管培生（剔除已中止） */
export const activeTrainees = () => trainees().filter(u => !u.stoppedAt);
export const mentors = () => db.users.filter(u => u.role === 'mentor');
export const isStopped = (userId: string) => !!findUser(userId)?.stoppedAt;

// ---------- 模板 ----------
export const stagesAll = (): Stage[] => [...db.stages].sort((a, b) => a.no - b.no);
export const stageById = (id: string) => db.stages.find(s => s.id === id)!;
export const modulesAll = (): Module[] => db.modules;
export const moduleById = (id: string) => db.modules.find(m => m.id === id)!;
export const modulesOf = (stageId: string): Module[] => db.modules.filter(m => m.stageId === stageId);
export const rotationModules = () => db.modules.filter(m => m.stageId === 's3');
export const templateById = (id?: string): TaskTemplate | undefined => db.templates.find(x => x.id === id);
export const templatesOf = (moduleId: string): TaskTemplate[] => db.templates.filter(x => x.moduleId === moduleId);
export const ruleById = (id?: string) => db.recurringRules.find(r => r.id === id);

// ---------- 路径与站 ----------
export const pathOf = (userId: string): PersonalPath | undefined => db.paths.find(p => p.userId === userId);
export const stationsOf = (userId: string): Station[] => pathOf(userId)?.stations ?? [];
export const stationById = (id?: string): Station | undefined => (id ? db.paths.flatMap(p => p.stations).find(s => s.id === id) : undefined);
export const allStations = () => db.paths.flatMap(p => p.stations);
export const stageOfStation = (s: Station) => stageById(moduleById(s.moduleId).stageId);
export const prevStation = (s: Station) => stationsOf(s.userId).find(x => x.order === s.order - 1);
export const nextStationOf = (s: Station) => stationsOf(s.userId).find(x => x.order === s.order + 1);

/** 站的时间位置：待开始 / 在站 / 已离站 */
export function stationTimePos(s: Station, at = now()): StationTimePos {
  if (t(at) < t(s.startAt)) return 'upcoming';
  if (t(at) > t(s.endAt)) return 'left';
  return 'current';
}
/** 当前所在站：今天落在哪站；两站之间的夜里算刚结束的那站 */
export function currentStation(userId: string, at = now()): Station | undefined {
  const list = stationsOf(userId);
  return list.find(s => stationTimePos(s, at) === 'current') ?? [...list].reverse().find(s => t(s.startAt) <= t(at)) ?? list[0];
}
/** 下一站（尚未开始的第一站） */
export const nextStation = (userId: string, at = now()) => stationsOf(userId).find(s => t(s.startAt) > t(at));
/** 站的负责带教：站带教，空 = 管理员 */
export const stationMentorOf = (s: Station) => s.stationMentorId ?? adminId();
/** 主带教：空 = 管理员 */
export const mainMentorOf = (userId: string) => pathOf(userId)?.mainMentorId ?? adminId();

/** 站结清：本站路径任务已通过数 / 总数 */
export function stationSettle(s: Station) {
  const list = db.tasks.filter(x => x.stationId === s.id);
  return { passed: list.filter(x => x.status === 'passed').length, total: list.length };
}

// ---------- 任务 ----------
export const taskById = (id: string) => db.tasks.find(x => x.id === id);
const byDue = (a: TaskInstance, b: TaskInstance) => t(a.dueAt) - t(b.dueAt);
export const tasksOf = (userId: string) => db.tasks.filter(x => x.userId === userId).sort(byDue);
export const stationTasks = (stationId: string) => db.tasks.filter(x => x.stationId === stationId).sort(byDue);

/** 任务所属站：路径任务取 stationId；周期任务取截止那天所在的站 */
export function stationOfTask(task: TaskInstance): Station | undefined {
  if (task.stationId) return stationById(task.stationId);
  return currentStation(task.userId, task.dueAt);
}

/** 负责带教（不单存，PRD 4.2）：路径任务 = 所属站的站带教；周期任务 = 主带教；声明型 = 管理员确认；为空都落管理员 */
export function responsibleMentorId(task: TaskInstance): string {
  if (task.kind === 'path') { const s = stationById(task.stationId); return s ? stationMentorOf(s) : adminId(); }
  if (task.completion === 'declare') return adminId();
  return mainMentorOf(task.userId);
}

/** 生效的截止：需修改时看修改截止 */
export const effectiveDue = (task: TaskInstance) => (task.status === 'revise' && task.reviseDueAt ? task.reviseDueAt : task.dueAt);
/** 还没结论：未开始、进行中、需修改；轻测有了成绩或「未答」就算结束 */
export const isOpen = (task: TaskInstance) =>
  (task.status === 'todo' || task.status === 'doing' || task.status === 'revise') && !(task.completion === 'bot-quiz' && task.quizResult !== undefined);
export const isDelivered = (task: TaskInstance) => task.status === 'submitted' || task.status === 'passed';
/** 逾期是标记不是状态：未完成且过了生效截止；轻测未答不算 */
export const isOverdue = (task: TaskInstance, at = now()) => isOpen(task) && task.completion !== 'bot-quiz' && t(at) > t(effectiveDue(task));

/** 按完成方式给出的状态文字 */
export function taskStatusLabel(task: TaskInstance): string {
  switch (task.completion) {
    case 'bot-weekly': return isDelivered(task) ? '已交' : isOverdue(task) ? '逾期未交' : '未交';
    case 'bot-quiz': return task.quizResult === '未答' ? '未答' : typeof task.quizResult === 'number' ? `${task.quizResult} 分` : '待作答';
    case 'declare': return { todo: '未声明', doing: '未声明', submitted: '待确认', revise: '已退回', passed: '已确认' }[task.status];
    default: return STATUS_LABEL[task.status];
  }
}

export const submissionsOf = (taskId: string) => db.submissions.filter(s => s.taskId === taskId).sort((a, b) => t(b.at) - t(a.at));
export const reviewsOf = (taskId: string) => db.reviews.filter(r => r.taskId === taskId).sort((a, b) => t(b.at) - t(a.at));
export const latestSubmission = (taskId: string) => submissionsOf(taskId)[0];
export const handoverOf = (stationId: string) => db.handovers.find(h => h.stationId === stationId);
