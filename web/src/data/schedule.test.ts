// 日程视角与轮岗排期（PRD 3.3、4.5）
import { beforeEach, describe, expect, it } from 'vitest';
import { atBj } from '../lib/workday';
import * as api from './api';

const u = (id: string) => api.userById(id);
beforeEach(() => api.resetDemo());

describe('轮岗排期', () => {
  it('示例排期：3 处同岗挤 2 人、3 处空岗', () => {
    const { stats } = api.rotationPlan();
    expect(stats.crowded.map(c => [c.from, c.moduleId, c.userIds.length])).toEqual([
      ['2026-11-12', 'm-xs', 2], ['2026-12-10', 'm-nr', 2], ['2026-12-24', 'm-jx', 2],
    ]);
    expect(stats.empty.map(c => [c.from, c.moduleId])).toEqual([['2026-11-12', 'm-nr'], ['2026-12-10', 'm-jx'], ['2026-12-24', 'm-xs']]);
  });
  it('按带教：周颖第 3 段同时带 3 人；市场线未指定行单列', () => {
    const plan = api.rotationPlan();
    expect(plan.byMentor.find(x => x.mentorId === 'u-zhou')!.max).toBe(3);
    expect(plan.byMentor.find(x => x.mentorId === null)!.name).toContain('未指定');
    expect(plan.periods).toHaveLength(6);
    expect(plan.switches.find(s => s.at === atBj('2026-11-12', '09:00'))!.userIds).toHaveLength(6);
  });
  it('顺延一站会改变冲突：林夏销售站顺延 5 个工作日，之后各站一起后移，未开始的任务重排截止并留痕', () => {
    const before = api.taskById('t-u-lin-tt-11')!.dueAt;
    api.postponeStation('st-u-lin-4', 5, '客服站延长一周', u('u-chang'));
    expect(api.stationById('st-u-lin-4')!.startAt).toBe(atBj('2026-11-19', '09:00'));
    expect(api.stationById('st-u-lin-5')!.startAt).toBe(atBj('2026-12-03', '09:00'));
    expect(api.taskById('t-u-lin-tt-11')!.dueAt).not.toBe(before);
    expect(api.pathOf('u-lin')!.endAt).toBe(atBj('2027-03-26', '18:00'));
    const plan = api.rotationPlan();
    expect(plan.periods.length).toBeGreaterThan(6);
    expect(api.timelineOf('u-lin', u('u-chang')).some(x => x.event.type === 'station.postponed')).toBe(true);
  });
  it('只有管理员能调；已开始的站不能换顺序', () => {
    expect(() => api.postponeStation('st-u-lin-4', 5, '原因', u('u-zhou'))).toThrow();
    expect(() => api.swapStations('st-u-lin-3', 'st-u-lin-4', '原因', u('u-chang'))).toThrow('已开始');
    api.swapStations('st-u-lin-4', 'st-u-lin-5', '先去内容', u('u-chang'));
    expect(api.stationById('st-u-lin-5')!.startAt).toBe(atBj('2026-11-12', '09:00'));
  });
});

describe('我的本周 / 我带的人 / 团队活动', () => {
  it('林夏本周：客服站第 2 周，测验、截止、周报、点评期限排在周时间线上，下一站 11-12', () => {
    const w = api.myWeek('u-lin');
    expect(w.module!.name).toBe('客服');
    expect(w.weekInStation).toBe(2);
    expect(w.nextStation!.startAt).toBe(atBj('2026-11-12', '09:00'));
    const thu = w.days.find(d => d.date === '2026-11-05')!;
    expect(thu.isToday).toBe(true);
    expect(thu.items.map(i => i.kind)).toContain('quiz');
    expect(w.days.find(d => d.date === '2026-11-08')!.items.map(i => i.kind)).toContain('weekly');
    expect(w.items.some(i => i.kind === 'reviewDue')).toBe(true);
  });
  it('同事看别人的本周：只有站和周报交没交，没有任务级条目', () => {
    const w = api.myWeek('u-lin', u('u-he'));
    expect(w.items.filter(i => i.personId === 'u-lin').every(i => ['station', 'switch', 'weekly'].includes(i.kind))).toBe(true);
  });
  it('周颖「我带的人」：在带林夏、许诺；将到赵一然；刚交接出去孟川', () => {
    const { groups } = api.myMentees(u('u-zhou'));
    expect(groups.current.map(r => r.user.name)).toEqual(['林夏', '许诺']);
    expect(groups.incoming.map(r => r.user.name)).toEqual(['赵一然']);
    expect(groups.handedOff.map(r => r.user.name)).toEqual(['孟川']);
    expect(api.mentorSummary(u('u-zhou'))).toMatchObject({ current: 2, incoming: 1, leftoverUnreviewed: 1 });
  });
  it('团队活动：11 月有 3 场飞书日历活动、换站日和周报截止', () => {
    const m = api.teamCalendar(2026, 11);
    expect(m.items.filter(i => i.kind === 'teamEvent' && i.source === 'feishu')).toHaveLength(3);
    expect(m.items.some(i => i.kind === 'switch' && i.title === '换站日 · 6 人')).toBe(true);
    expect(m.items.filter(i => i.title === '周报截止').length).toBeGreaterThan(0);
    expect(api.nextTeamEvent()!.id).toBe('te-2');
  });
});
