import { describe, expect, it } from 'vitest';
import { atBj } from '../lib/workday';
import { dueFromRule, openFromDue, recurringTasksFor } from './generate';
import { modules, paths, recurringRules, workdays } from './mock';

const kf = { startAt: atBj('2026-10-29', '09:00'), endAt: atBj('2026-11-11', '18:00') };

describe('截止规则 × 工作日日历', () => {
  it('锚定站开始：客服站 10-29 开站，偏移 4 个工作日 = 11-04 18:00', () => {
    expect(dueFromRule({ anchor: 'stationStart', offsetWorkdays: 4, time: '18:00' }, kf, workdays)).toBe(atBj('2026-11-04', '18:00'));
  });
  it('锚定站结束：客服岗小结 = 站结束日 11-11 18:00；结束日是周末时往前挪', () => {
    expect(dueFromRule({ anchor: 'stationEnd', offsetWorkdays: 0, time: '18:00' }, kf, workdays)).toBe(atBj('2026-11-11', '18:00'));
    const weekendEnd = { startAt: kf.startAt, endAt: atBj('2026-11-08', '18:00') };
    expect(dueFromRule({ anchor: 'stationEnd', offsetWorkdays: 0, time: '18:00' }, weekendEnd, workdays)).toBe(atBj('2026-11-06', '18:00'));
  });
  it('通识站跨中秋、国庆：09-17 开站 + 10 个工作日 = 10-08（不会落在假期或周末）', () => {
    expect(dueFromRule({ anchor: 'stationStart', offsetWorkdays: 10, time: '18:00' }, { startAt: atBj('2026-09-17', '09:00'), endAt: atBj('2026-10-14', '18:00') }, workdays)).toBe(atBj('2026-10-08', '18:00'));
  });
  it('开放日 = 截止 − 建议用时（工作日），不早于开站', () => {
    expect(openFromDue(atBj('2026-11-11', '18:00'), 2, kf.startAt, workdays)).toBe(atBj('2026-11-09', '09:00'));
    expect(openFromDue(atBj('2026-11-02', '18:00'), 5, kf.startAt, workdays)).toBe(kf.startAt);
  });
  it('周期任务展开：周报每周日 22:00；轻测只在轮岗阶段、每周四', () => {
    const lin = paths.find(p => p.userId === 'u-lin')!;
    const weekly = recurringTasksFor(recurringRules.find(r => r.id === 'weekly')!, lin, modules, atBj('2026-11-10'), workdays);
    expect(weekly.map(x => x.dueAt)).toContain(atBj('2026-11-08', '22:00'));
    expect(weekly.every(x => new Date(x.dueAt).getUTCDay() === 0)).toBe(true); // 周日 22:00 北京 = 周日 14:00 UTC
    expect(weekly.find(x => x.dueAt === atBj('2026-11-08', '22:00'))!.name).toBe('第 45 周周报');
    const quiz = recurringTasksFor(recurringRules.find(r => r.id === 'quiz')!, lin, modules, atBj('2026-11-10'), workdays);
    expect(quiz[0].dueAt).toBe(atBj('2026-10-15', '20:00'));
    expect(quiz.map(x => x.name)).toContain('轻测 · 客服');
  });
  it('停用的规则（日报）不展开', () => {
    const lin = paths.find(p => p.userId === 'u-lin')!;
    expect(recurringTasksFor(recurringRules.find(r => r.id === 'daily')!, lin, modules, atBj('2026-11-10'), workdays)).toHaveLength(0);
  });
});
