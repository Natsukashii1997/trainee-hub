// 指标（PRD 13）：主指标「路径任务按期达标率」与「计划进度差距」等辅助指标。
import { daysSince } from '../lib/time';
import { db, now } from './store';
import { activeTrainees, isStopped, pathOf, stationSettle, stationTimePos, stationsOf, moduleById, nextStation } from './model';
import type { Grade, TaskInstance } from './types';
import { weekRange } from './schedule';

const t = (iso: string) => Date.parse(iso);
const DAY = 86400000;

export type Verdict = 'hit' | 'miss' | 'pending';
export interface OnTimeRow {
  task: TaskInstance;
  verdict: Verdict;
  /** 首次正式提交时间；没交为空 */
  firstSubmitAt?: string;
  onTime: boolean;
  finalGrade?: Grade;
  /** 首轮即达标（明细用） */
  firstRound: boolean;
  /** 截止调整过 */
  adjusted: boolean;
}

/** 单条任务在 asOf 时刻的判定：已交未评、需修改还没最终结论 → 待定；没交或迟交或最终不达标 → 未达标 */
export function classify(task: TaskInstance, asOf = now()): OnTimeRow {
  const subs = db.submissions.filter(s => s.taskId === task.id && t(s.at) <= t(asOf)).sort((a, b) => t(a.at) - t(b.at));
  const revs = db.reviews.filter(r => r.taskId === task.id && t(r.at) <= t(asOf)).sort((a, b) => t(a.at) - t(b.at));
  const first = subs[0], lastSub = subs[subs.length - 1], lastRev = revs[revs.length - 1];
  const adjusted = !!task.originalDueAt;
  const base = { task, firstSubmitAt: first?.at, onTime: !!first && t(first.at) <= t(task.dueAt), adjusted, firstRound: false };
  if (!first) return { ...base, verdict: 'miss' };
  if (!lastRev || t(lastRev.at) < t(lastSub.at) || lastRev.grade === '需改进') return { ...base, verdict: 'pending', finalGrade: lastRev?.grade };
  const firstRound = revs[0].grade !== '需改进';
  return { ...base, verdict: base.onTime ? 'hit' : 'miss', finalGrade: lastRev.grade, firstRound: base.onTime && firstRound };
}

/**
 * 路径任务按期达标率（滚动 4 周，PRD 13）：
 * 分母 = 截止落在窗口内且已过截止的路径任务（剔除中止培养的人，待定的不进）；
 * 分子 = 首次正式提交不晚于截止、且最终评为优秀或达标（需修改后再交通过也算）。截止以调整后的为准。
 */
export function onTimePassRate(opts: { asOf?: string; weeks?: number } = {}) {
  const asOf = opts.asOf ?? now();
  const from = new Date(t(asOf) - (opts.weeks ?? 4) * 7 * DAY).toISOString();
  const rows = db.tasks
    .filter(x => x.kind === 'path' && !isStopped(x.userId) && t(x.dueAt) >= t(from) && t(x.dueAt) <= t(asOf))
    .map(x => classify(x, asOf));
  const counted = rows.filter(r => r.verdict !== 'pending');
  const n = counted.filter(r => r.verdict === 'hit').length, N = counted.length;
  const adjustedRows = rows.filter(r => r.adjusted);
  const adjusters = new Set(db.events.filter(e => e.type === 'task.dueAdjusted' && adjustedRows.some(r => r.task.id === e.subjectId)).map(e => e.actorId!).filter(Boolean));
  return {
    windowStart: from, windowEnd: asOf, n, N,
    /** 百分比整数；N = 0 时为 null */
    rate: N ? Math.round((n / N) * 100) : null,
    pending: rows.filter(r => r.verdict === 'pending').length,
    firstRoundN: rows.filter(r => r.firstRound).length,
    adjusted: { count: adjustedRows.length, by: [...adjusters] },
    rows,
  };
}

/** 滚动四周趋势：最近 count 个周末（周日 24:00）各算一次，最后一个点是现在 */
export function onTimePassTrend(count = 4) {
  const points: { asOf: string; n: number; N: number; rate: number | null }[] = [];
  for (let i = count - 1; i >= 1; i--) {
    const asOf = weekRange(-i + 1)[0];
    const r = onTimePassRate({ asOf });
    points.push({ asOf, n: r.n, N: r.N, rate: r.rate });
  }
  const cur = onTimePassRate();
  points.push({ asOf: now(), n: cur.n, N: cur.N, rate: cur.rate });
  return points;
}

/**
 * 两个进度数（PRD 3.1、13）：
 * 时间进度 = 培养第几天 / 全程天数；完成进度 = 已通过的路径任务 / 截至今天应完成（已过截止）的路径任务。
 * 计划进度差距 gap = 已通过 − 应完成（条数，≤ 0 表示落后几条）。
 */
export function progressOf(userId: string) {
  const p = pathOf(userId);
  if (!p) return null;
  const total = daysSince(p.startAt, p.endAt) + 1;
  const day = Math.min(total, Math.max(0, daysSince(p.startAt, now()) + 1));
  const pathTasks = db.tasks.filter(x => x.userId === userId && x.kind === 'path');
  const due = pathTasks.filter(x => t(x.dueAt) <= t(now()));
  const passed = pathTasks.filter(x => x.status === 'passed').length;
  return {
    time: { day, total, pct: Math.round((day / total) * 100) },
    completion: { passed, due: due.length, all: pathTasks.length, pct: due.length ? Math.min(100, Math.round((passed / due.length) * 100)) : 100 },
    gap: passed - due.length,
  };
}

/** 轮岗各站：区分「时间到了」和「已结清」，并给出下一站开始日 */
export function stationsProgress(userId: string) {
  const list = stationsOf(userId).map(s => {
    const settle = stationSettle(s);
    return { station: s, module: moduleById(s.moduleId), pos: stationTimePos(s), settle, settled: settle.total > 0 && settle.passed === settle.total };
  });
  return { stations: list, next: nextStation(userId) };
}

/** 计划进度差距（管理员指标条）：全员汇总 */
export function planGap() {
  const rows = activeTrainees().map(u => ({ user: u, progress: progressOf(u.id)! })).filter(r => r.progress);
  const avg = (f: (r: typeof rows[number]) => number) => (rows.length ? Math.round(rows.reduce((s, r) => s + f(r), 0) / rows.length) : 0);
  return {
    rows,
    avgTimePct: avg(r => r.progress.time.pct),
    avgCompletionPct: avg(r => r.progress.completion.pct),
    behind: rows.filter(r => r.progress.gap < 0).length,
    gapTotal: rows.reduce((s, r) => s + r.progress.gap, 0),
  };
}

/** 本周活跃人数（参考指标） */
export const weeklyActiveCount = () => db.users.filter(u => !!u.lastActiveAt && t(u.lastActiveAt) >= t(weekRange()[0])).length;

/** 资产被非作者使用的人数（按「我用过」自报，口径见 PRD 13） */
export function assetNonAuthorUsers() {
  const set = new Set<string>();
  for (const a of db.assets) if (a.status === 'live') for (const u of a.usedBy) if (u !== a.authorId) set.add(u);
  return set.size;
}
