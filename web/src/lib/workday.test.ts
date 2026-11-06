import { describe, expect, it } from 'vitest';
import { addWorkdays, atBj, bjYmd, isWorkday, mondayOf, rollToWorkday, shiftWorkdays, workdaysBetween, type WorkdayCalendar } from './workday';

// 示例日历：2026 中秋、国庆与调休
const CAL: WorkdayCalendar = [
  { date: '2026-09-25', workday: false, name: '中秋节' },
  { date: '2026-09-27', workday: true, name: '国庆调休' },
  ...['01', '02', '03', '04', '05', '06', '07'].map(d => ({ date: `2026-10-${d}`, workday: false, name: '国庆节' })),
  { date: '2026-10-10', workday: true, name: '国庆调休' },
];

describe('工作日推算', () => {
  it('北京时间日期：UTC 跨日的时刻归到北京时间那一天', () => {
    expect(bjYmd('2026-11-04T16:30:00Z')).toBe('2026-11-05');
    expect(bjYmd(atBj('2026-11-05', '23:59'))).toBe('2026-11-05');
  });
  it('周末、法定假期不是工作日，调休的周末是工作日', () => {
    expect(isWorkday('2026-11-05', CAL)).toBe(true);
    expect(isWorkday('2026-11-07', CAL)).toBe(false);
    expect(isWorkday('2026-10-05', CAL)).toBe(false); // 国庆（周一）
    expect(isWorkday('2026-10-10', CAL)).toBe(true); // 调休（周六）
    expect(isWorkday('2026-09-27', CAL)).toBe(true); // 调休（周日）
  });
  it('加 N 个工作日保留时分（点评期限：11-04 16:50 提交 + 2 个工作日 = 11-06 16:50）', () => {
    expect(addWorkdays(atBj('2026-11-04', '16:50'), 2, CAL)).toBe(atBj('2026-11-06', '16:50'));
    expect(addWorkdays(atBj('2026-11-06', '18:00'), 1, CAL)).toBe(atBj('2026-11-09', '18:00')); // 跨周末
  });
  it('跨国庆：09-30 后的第一个工作日是 10-08；10-09 后是调休的 10-10', () => {
    expect(shiftWorkdays('2026-09-30', 1, CAL)).toBe('2026-10-08');
    expect(shiftWorkdays('2026-10-09', 1, CAL)).toBe('2026-10-10');
    expect(shiftWorkdays('2026-09-24', 1, CAL)).toBe('2026-09-27'); // 跳过中秋和周六，周日调休上班
  });
  it('往前数：11-12 开站前 5 个工作日是 11-05', () => {
    expect(shiftWorkdays('2026-11-12', -5, CAL)).toBe('2026-11-05');
    expect(addWorkdays(atBj('2026-11-12', '09:00'), -5, CAL)).toBe(atBj('2026-11-05', '09:00'));
  });
  it('两日之间的工作日数与挪到工作日', () => {
    expect(workdaysBetween(atBj('2026-09-30'), atBj('2026-10-12'), CAL)).toBe(4); // 10-08、09、10、12
    expect(workdaysBetween(atBj('2026-11-06'), atBj('2026-11-02'), CAL)).toBe(-4);
    expect(rollToWorkday('2026-10-03', 1, CAL)).toBe('2026-10-08');
    expect(rollToWorkday('2026-11-08', -1, CAL)).toBe('2026-11-06');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
  });
});
