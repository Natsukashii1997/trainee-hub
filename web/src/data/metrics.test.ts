// 主指标口径（PRD 13）
import { beforeEach, describe, expect, it } from 'vitest';
import { atBj } from '../lib/workday';
import * as api from './api';

const u = (id: string) => api.userById(id);
const row = (r: ReturnType<typeof api.onTimePassRate>, id: string) => r.rows.find(x => x.task.id === id);
beforeEach(() => api.resetDemo());

describe('路径任务按期达标率', () => {
  it('示例数据：滚动 4 周 21 / 24，待定 3 条不进分母', () => {
    const r = api.onTimePassRate();
    expect([r.n, r.N, r.rate, r.pending]).toEqual([21, 24, 88, 3]);
  });
  it('只算路径任务，周期任务（周报、轻测、物料）不进', () => {
    expect(api.onTimePassRate().rows.every(x => x.task.kind === 'path')).toBe(true);
  });
  it('需修改后再交通过也算达标；首轮即达标单列', () => {
    const r = api.onTimePassRate();
    expect(row(r, 't-u-meng-tt-9')).toMatchObject({ verdict: 'hit', firstRound: false });
    expect(r.firstRoundN).toBeLessThan(r.n);
  });
  it('迟交（首次提交晚于截止）即使最终通过也不算；逾期未交不算', () => {
    const r = api.onTimePassRate();
    expect(row(r, 't-u-xu-tt-4')!.verdict).toBe('miss');
    expect(row(r, 't-u-meng-tt-6')!.verdict).toBe('miss');
  });
  it('已提交未点评、需修改还没最终结论 → 待定；点评后进分母', () => {
    let r = api.onTimePassRate();
    expect(row(r, 't-u-lin-tt-8')!.verdict).toBe('pending');
    expect(row(r, 't-u-chen-tt-14')!.verdict).toBe('pending');
    api.reviewTask('t-u-lin-tt-8', '达标', '可以。', u('u-zhou'));
    r = api.onTimePassRate();
    expect([r.n, r.N, r.pending]).toEqual([22, 25, 2]);
  });
  it('截止以调整后的为准，并列调整过的条数和调整人', () => {
    // 孟川的试讲复盘逾期未交：把截止调到后天，它就不在「已过截止」的分母里了
    api.adjustDue('t-u-meng-tt-6', atBj('2026-11-09', '18:00'), '试讲排期推迟', u('u-wu'));
    const r = api.onTimePassRate();
    expect(row(r, 't-u-meng-tt-6')).toBeUndefined();
    expect(r.N).toBe(23);
    api.adjustDue('t-u-lin-tt-8', atBj('2026-11-04', '20:00'), '补录', u('u-zhou'));
    const r2 = api.onTimePassRate();
    expect(r2.adjusted.count).toBe(1);
    expect(r2.adjusted.by).toEqual(['u-zhou']);
  });
  it('中止培养的人从分母剔除', () => {
    api.stopTraining('u-meng', '个人原因', u('u-chang'));
    expect(api.onTimePassRate().rows.some(x => x.task.userId === 'u-meng')).toBe(false);
  });
  it('趋势有 4 个点，最后一个是现在', () => {
    const tr = api.onTimePassTrend();
    expect(tr).toHaveLength(4);
    expect(tr[3].asOf).toBe(api.now());
  });
});

describe('计划进度差距', () => {
  it('林夏：时间第 57 / 191 天；应完成 6 条、已通过 5 条，差 1 条', () => {
    const p = api.progressOf('u-lin')!;
    expect(p.time).toMatchObject({ day: 57, total: 191 });
    expect(p.completion).toMatchObject({ passed: 5, due: 6, pct: 83 });
    expect(p.gap).toBe(-1);
  });
  it('轮岗各站区分时间到了和已结清', () => {
    const s = api.stationsProgress('u-meng').stations.find(x => x.station.id === 'st-u-meng-2')!;
    expect(s.pos).toBe('left');
    expect(s.settled).toBe(false);
  });
});
