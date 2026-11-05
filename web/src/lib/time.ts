// 页面上的时间一律经这里按北京时间格式化（AGENTS.md 规则、全局坑 G-02）。
const TZ = 'Asia/Shanghai';
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type Parts = { y: number; mo: number; d: number; h: number; mi: number; wd: number };

function parts(iso: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(iso))) p[x.type] = x.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, wd };
}
const pad = (n: number) => String(n).padStart(2, '0');
/** 北京时间的自然日序号，用来比较"今天/明天" */
const dayIndex = (p: Parts) => Math.floor(Date.UTC(p.y, p.mo - 1, p.d) / 86400000);

export const fmtDate = (iso: string) => { const p = parts(iso); return `${pad(p.mo)}.${pad(p.d)}`; };
export const fmtTime = (iso: string) => { const p = parts(iso); return `${pad(p.h)}:${pad(p.mi)}`; };
export const fmtDateTime = (iso: string) => `${fmtDate(iso)} ${fmtTime(iso)}`;
export const fmtWeekday = (iso: string) => WEEK[parts(iso).wd];
export const fmtFull = (iso: string) => { const p = parts(iso); return `${p.y}.${pad(p.mo)}.${pad(p.d)} ${WEEK[p.wd]}`; };
export const fmtCn = (iso: string) => { const p = parts(iso); return `${p.mo} 月 ${p.d} 日`; };

/** 截止时间的口语说法：今天 20:00 / 明天 18:00 / 11.08 周日 / 昨天 18:00 */
export function fmtDue(dueIso: string, nowIso: string): string {
  const diff = dayIndex(parts(dueIso)) - dayIndex(parts(nowIso));
  if (diff === 0) return `今天 ${fmtTime(dueIso)}`;
  if (diff === 1) return `明天 ${fmtTime(dueIso)}`;
  if (diff === -1) return `昨天 ${fmtTime(dueIso)}`;
  return `${fmtDate(dueIso)} ${fmtWeekday(dueIso)}`;
}

/** 距离截止还剩多久：9 小时 36 分 / 2 天 / 已过 */
export function fmtCountdown(dueIso: string, nowIso: string): string {
  const min = Math.floor((Date.parse(dueIso) - Date.parse(nowIso)) / 60000);
  if (min <= 0) return '已过截止时间';
  if (min < 60) return `${min} 分`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} 小时 ${min % 60} 分`;
  return `${Math.floor(min / 1440)} 天`;
}

/** 已经过去几天（按北京时间自然日） */
export const daysSince = (iso: string, nowIso: string) => dayIndex(parts(nowIso)) - dayIndex(parts(iso));

/** ISO 周次 */
export function isoWeek(iso: string): number {
  const p = parts(iso);
  const d = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}
