// 纯函数：从路径模板、周期任务规则和工作日日历落出任务实例（PRD 4.1、4.2）。示例数据和数据层同步都用它。
import { addDays, atBj, bjYmd, isWorkday, rollToWorkday, shiftWorkdays, weekdayOf, type WorkdayCalendar } from '../lib/workday';
import { isoWeek } from '../lib/time';
import type { DeadlineRule, Module, PersonalPath, RecurringRule, Station, TaskInstance, TaskTemplate } from './types';

/** 截止规则落成具体时刻：锚点日 + N 个工作日；偏移为 0 且锚点不是工作日时，站开始往后挪、站结束往前挪 */
export function dueFromRule(rule: DeadlineRule, station: Pick<Station, 'startAt' | 'endAt'>, cal: WorkdayCalendar): string {
  const fromStart = rule.anchor === 'stationStart';
  const anchor = bjYmd(fromStart ? station.startAt : station.endAt);
  const day = rule.offsetWorkdays === 0 ? rollToWorkday(anchor, fromStart ? 1 : -1, cal) : shiftWorkdays(anchor, rule.offsetWorkdays, cal);
  return atBj(day, rule.time);
}

/** 开放日 = 截止 − 建议用时（工作日），当天 09:00；不早于开站 */
export function openFromDue(dueAt: string, days: number, stationStartAt: string, cal: WorkdayCalendar): string {
  const open = atBj(shiftWorkdays(bjYmd(dueAt), -days, cal), '09:00');
  return Date.parse(open) < Date.parse(stationStartAt) ? stationStartAt : open;
}

export const pathTaskId = (userId: string, templateId: string) => `t-${userId}-${templateId}`;

/** 一站的路径任务实例（新生成的都是未开始） */
export function pathTasksForStation(station: Station, templates: TaskTemplate[], cal: WorkdayCalendar): TaskInstance[] {
  return templates.filter(t => t.moduleId === station.moduleId).map(tpl => {
    const dueAt = dueFromRule(tpl.deadline, station, cal);
    return {
      id: pathTaskId(station.userId, tpl.id), userId: station.userId, kind: 'path', templateId: tpl.id,
      name: tpl.name, note: tpl.desc, output: tpl.output, stationId: station.id, moduleId: station.moduleId,
      openAt: openFromDue(dueAt, tpl.days, station.startAt, cal), dueAt, completion: 'link', status: 'todo',
    };
  });
}

export const pathTasksFor = (path: PersonalPath, templates: TaskTemplate[], cal: WorkdayCalendar) =>
  path.stations.flatMap(s => pathTasksForStation(s, templates, cal));

export const recurringTaskId = (ruleId: string, userId: string, ymd: string) => `r-${ruleId}-${userId}-${ymd}`;

function matches(rule: RecurringRule, ymd: string, cal: WorkdayCalendar): boolean {
  const f = rule.frequency;
  switch (f.kind) {
    case 'daily': return isWorkday(ymd, cal);
    case 'weekly': return weekdayOf(ymd) === f.weekday;
    case 'monthEnd': return addDays(ymd, 1).slice(5, 7) !== ymd.slice(5, 7); // YYYY-MM-DD 日期串取月份，不是时刻
    case 'dates': return f.dates.includes(ymd);
  }
}

/**
 * 周期任务规则展开：在适用阶段的站里（或全程），截止不晚于 until 的每个日期生成一条实例。
 * stageOfModule 把站的模块映射到阶段 id。
 */
export function recurringTasksFor(
  rule: RecurringRule, path: PersonalPath, modules: Module[], until: string, cal: WorkdayCalendar,
): TaskInstance[] {
  if (!rule.enabled || (rule.cohortId && rule.cohortId !== path.cohortId)) return [];
  const modById = new Map(modules.map(m => [m.id, m]));
  const windows = rule.stageIds
    ? path.stations.filter(s => rule.stageIds!.includes(modById.get(s.moduleId)?.stageId ?? '')).map(s => ({ s, a: s.startAt, b: s.endAt }))
    : [{ s: undefined as Station | undefined, a: path.startAt, b: path.endAt }];
  const out: TaskInstance[] = [];
  for (const w of windows) {
    const last = Date.parse(w.b) < Date.parse(until) ? w.b : until;
    for (let d = bjYmd(w.a); d <= bjYmd(last); d = addDays(d, 1)) {
      if (!matches(rule, d, cal)) continue;
      const dueAt = atBj(d, rule.dueTime);
      if (Date.parse(dueAt) < Date.parse(w.a) || Date.parse(dueAt) > Date.parse(w.b) || Date.parse(dueAt) > Date.parse(until)) continue;
      const station = w.s ?? path.stations.find(s => Date.parse(s.startAt) <= Date.parse(dueAt) && Date.parse(dueAt) <= Date.parse(s.endAt));
      const mod = station ? modById.get(station.moduleId) : undefined;
      const title = rule.titleTemplate
        .replace('{week}', String(isoWeek(dueAt)))
        .replace('{month}', String(Number(d.slice(5, 7))))
        .replace('{date}', `${d.slice(5, 7)}.${d.slice(8, 10)}`)
        .replace('{module}', mod?.name ?? '');
      const openYmd = rule.completion === 'bot-quiz' || rule.frequency.kind === 'daily' || rule.frequency.kind === 'dates'
        ? d : rule.frequency.kind === 'monthEnd' ? `${d.slice(0, 8)}01` : addDays(d, -6);
      const openAt = atBj(openYmd, rule.completion === 'bot-quiz' ? '09:00' : '00:00');
      out.push({
        id: recurringTaskId(rule.id, path.userId, d), userId: path.userId, kind: 'recurring', ruleId: rule.id,
        name: title, note: rule.note, output: rule.output, stationId: undefined, moduleId: mod?.id,
        openAt: Date.parse(openAt) < Date.parse(w.a) ? w.a : openAt, dueAt, completion: rule.completion, status: 'todo',
      });
    }
  }
  return out;
}
