import { describe, expect, it } from 'vitest';
import { daysSince, fmtCountdown, fmtDate, fmtDateTime, fmtDue, fmtFull, isoWeek } from './time';

const NOW = '2026-11-05T02:24:00Z'; // 北京时间 11.05 周四 10:24

describe('北京时间格式化', () => {
  it('UTC 跨日的时刻按北京时间显示', () => {
    expect(fmtDateTime('2026-11-04T16:30:00Z')).toBe('11.05 00:30');
    expect(fmtDate('2026-11-05T15:59:00Z')).toBe('11.05');
    expect(fmtDate('2026-11-05T16:00:00Z')).toBe('11.06');
  });
  it('完整日期带星期', () => {
    expect(fmtFull(NOW)).toBe('2026.11.05 周四');
  });
  it('截止时间的口语说法', () => {
    expect(fmtDue('2026-11-05T12:00:00Z', NOW)).toBe('今天 20:00');
    expect(fmtDue('2026-11-06T10:00:00Z', NOW)).toBe('明天 18:00');
    expect(fmtDue('2026-11-04T10:00:00Z', NOW)).toBe('昨天 18:00');
    expect(fmtDue('2026-11-08T12:00:00Z', NOW)).toBe('11.08 周日');
  });
  it('倒计时与逾期天数', () => {
    expect(fmtCountdown('2026-11-05T12:00:00Z', NOW)).toBe('9 小时 36 分');
    expect(fmtCountdown('2026-11-05T02:00:00Z', NOW)).toBe('已过截止时间');
    expect(daysSince('2026-11-04T10:00:00Z', NOW)).toBe(1);
  });
  it('ISO 周次', () => {
    expect(isoWeek(NOW)).toBe(45);
    expect(isoWeek('2026-01-01T04:00:00Z')).toBe(1);
  });
});
