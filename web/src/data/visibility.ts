// 可见性（PRD 4.4）。原型在前端执行；接后端后由服务端执行同一套规则，多人视图里看不到的条目直接不返回。
import { addWorkdays } from '../lib/workday';
import { db, now } from './store';
import { pathOf, responsibleMentorId, stationOfTask, stationsOf } from './model';
import type { HandoverNote, Station, TaskInstance, User } from './types';

const t = (iso: string) => Date.parse(iso);
const isTask = (x: TaskInstance | User): x is TaskInstance => 'kind' in x && 'dueAt' in x;

/** 站带教的可见窗口起点：开站前 5 个工作日 */
export const stationWindowStart = (s: Station) => addWorkdays(s.startAt, -5, db.workdays);

/** viewer 是不是这位管培生的相关带教人（本站站带教、主带教、路径上已进入窗口的其他站带教） */
export function isRelatedMentor(viewer: User, userId: string, at = now()): boolean {
  if (pathOf(userId)?.mainMentorId === viewer.id) return true;
  return stationsOf(userId).some(s => s.stationMentorId === viewer.id && t(at) >= t(stationWindowStart(s)));
}

/**
 * 产出与点评能不能看（PRD 4.4）：
 * - 本人、管理员、主带教：全部；
 * - 站带教：自本站开站前 5 个工作日起，可看本站和此前各站（此前各站只读）；离站后保留，但看不到之后的站；
 * - 其他管培生、同事：不能看。
 * 传任务按任务所属站判断；传人则只要有一站进入窗口就算相关。
 */
export function canSeePrivate(viewer: User, target: TaskInstance | User, at = now()): boolean {
  const ownerId = isTask(target) ? target.userId : target.id;
  if (viewer.role === 'admin' || viewer.id === ownerId) return true;
  if (pathOf(ownerId)?.mainMentorId === viewer.id) return true;
  if (!isTask(target)) return isRelatedMentor(viewer, ownerId, at);
  const s = stationOfTask(target);
  if (!s) return false;
  return stationsOf(ownerId).some(v => v.stationMentorId === viewer.id && t(at) >= t(stationWindowStart(v)) && s.order <= v.order);
}

/** 能不能点评、调截止：负责带教或管理员（只读的历史站不能） */
export function canReview(viewer: User, task: TaskInstance): boolean {
  return viewer.role === 'admin' || responsibleMentorId(task) === viewer.id;
}

/** 看得到但只读（此前各站、离站后的本站等）：相关带教里不负责这条任务的人 */
export const isReadOnlyFor = (viewer: User, task: TaskInstance, at = now()) =>
  viewer.id !== task.userId && canSeePrivate(viewer, task, at) && !canReview(viewer, task);

/** 任务名称与状态、逾期标记：本人、相关带教、管理员；其他管培生和同事只看站级进度 */
export const canSeeTaskStatus = (viewer: User, userId: string, at = now()) =>
  viewer.role === 'admin' || viewer.id === userId || isRelatedMentor(viewer, userId, at);

/** 考核（轻测成绩、站评、阶段评估）：本人、主带教、管理员（站评另按作者，二期） */
export const canSeeAssessment = (viewer: User, userId: string) =>
  viewer.role === 'admin' || viewer.id === userId || pathOf(userId)?.mainMentorId === viewer.id;

/** 交接要点：相关带教人和管理员 */
export const canSeeHandover = (viewer: User, note: HandoverNote, at = now()) =>
  viewer.role === 'admin' || (viewer.id !== note.userId && isRelatedMentor(viewer, note.userId, at));
