// 业务命令共用的类型与输入校验（Handler 与执行器共用，避免循环引用）。
import type pg from 'pg';
import type { Actor, CommandId } from '../authorize.ts';

export class CommandError extends Error {
  status: 400 | 401 | 403 | 404 | 409;
  constructor(status: 400 | 401 | 403 | 404 | 409, message: string) {
    super(message);
    this.status = status;
  }
}

/** 事件日志里这条命令记成什么 */
export interface EventInfo {
  subjectType: string;
  subjectId: string;
  /** 所属管培生；项目级事件为空 */
  personId?: string | null;
  projectId?: string | null;
  payload?: Record<string, unknown>;
}

export interface Prepared<R> {
  /** 这个对象相关的管培生（项目成员、任务所属人）；交给统一授权入口判断 */
  traineeIds: string[];
  /** 前置条件不满足时返回中文原因 */
  precondition?: () => string | null;
  /** 写业务对象，返回结果与要记的事件（可多条，如带教建项目时连带确认立项） */
  apply: () => Promise<{ result: R; events: (EventInfo & { type?: CommandId })[] }>;
}

export type Handler = (tx: pg.PoolClient, actor: Actor, input: Record<string, unknown>) => Promise<Prepared<unknown>>;

// ---- 给各 Handler 用的输入校验 ----

export function text(input: Record<string, unknown>, key: string, label: string, required = true): string | null {
  const v = input[key];
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (required) throw new CommandError(400, `缺少「${label}」`);
    return null;
  }
  if (typeof v !== 'string') throw new CommandError(400, `「${label}」应为文字`);
  return v.trim();
}

export function time(input: Record<string, unknown>, key: string, label: string): string {
  const v = text(input, key, label) as string;
  // 只收带时区的完整时间（ISO 8601），避免把北京时间当成 UTC
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) || Number.isNaN(Date.parse(v)))
    throw new CommandError(400, `「${label}」应为带时区的时间，如 2026-11-13T18:00:00+08:00`);
  return new Date(v).toISOString();
}

export function ids(input: Record<string, unknown>, key: string, label: string): string[] {
  const v = input[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || x === '')) throw new CommandError(400, `「${label}」应为编号列表`);
  return [...new Set(v as string[])];
}
