// 工作日推算（PRD 4.1、3.4：期限一律按工作日日历推算）。日期一律按北京时间的自然日算。
// 日历只记「例外」：法定假期（周一到周五也放假）和调休（周末也上班）；其余周一到周五是工作日。

export interface WorkdayEntry {
  /** 北京时间日期，YYYY-MM-DD */
  date: string;
  workday: boolean;
  /** 假期或调休的名称，如「国庆节」「国庆调休」 */
  name: string;
}
export type WorkdayCalendar = readonly WorkdayEntry[];

const H8 = 8 * 3600000;
const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');

/** ISO 时刻 → 北京时间日期 YYYY-MM-DD */
export function bjYmd(iso: string): string {
  const d = new Date(Date.parse(iso) + H8); // 北京时间：UTC+8，无夏令时
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** ISO 时刻 → 北京时间的「时:分」 */
export function bjHm(iso: string): string {
  const d = new Date(Date.parse(iso) + H8); // 北京时间
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
/** 北京时间日期 + 时刻 → ISO（UTC） */
export const atBj = (ymd: string, hm = '00:00') => new Date(`${ymd}T${hm}:00+08:00`).toISOString();

const ymdMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const msYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10); // 这里的毫秒已是北京时间的自然日零点，不是 UTC 时刻
/** 日期加减自然日 */
export const addDays = (ymd: string, n: number) => msYmd(ymdMs(ymd) + n * DAY);
/** 星期几：0 = 周日 … 6 = 周六 */
export const weekdayOf = (ymd: string) => new Date(ymdMs(ymd)).getUTCDay();
/** 所在周的周一 */
export const mondayOf = (ymd: string) => addDays(ymd, -((weekdayOf(ymd) + 6) % 7));
/** 两个日期相差几个自然日（b − a） */
export const daysBetween = (a: string, b: string) => Math.round((ymdMs(b) - ymdMs(a)) / DAY);

const cache = new WeakMap<WorkdayCalendar, Map<string, WorkdayEntry>>();
function lookup(cal: WorkdayCalendar) {
  let m = cache.get(cal);
  if (!m) { m = new Map(cal.map(e => [e.date, e])); cache.set(cal, m); }
  return m;
}
/** 日历里这一天的例外（假期或调休），没有则 undefined */
export const calendarEntry = (ymd: string, cal: WorkdayCalendar) => lookup(cal).get(ymd);

export function isWorkday(ymd: string, cal: WorkdayCalendar): boolean {
  const e = lookup(cal).get(ymd);
  if (e) return e.workday;
  const w = weekdayOf(ymd);
  return w !== 0 && w !== 6;
}

/** 从某日起（不含）往后（n>0）或往前（n<0）数第 |n| 个工作日的日期；n=0 返回原日期 */
export function shiftWorkdays(ymd: string, n: number, cal: WorkdayCalendar): string {
  let d = ymd;
  const step = n >= 0 ? 1 : -1;
  for (let left = Math.abs(n); left > 0;) {
    d = addDays(d, step);
    if (isWorkday(d, cal)) left--;
  }
  return d;
}

/** 某时刻加减 n 个工作日，保留北京时间的时分（例：11-04 16:50 + 2 个工作日 = 11-06 16:50） */
export const addWorkdays = (iso: string, n: number, cal: WorkdayCalendar) =>
  atBj(shiftWorkdays(bjYmd(iso), n, cal), bjHm(iso));

/** 当天不是工作日时，挪到下一个（dir=1）或上一个（dir=-1）工作日 */
export function rollToWorkday(ymd: string, dir: 1 | -1, cal: WorkdayCalendar): string {
  let d = ymd;
  while (!isWorkday(d, cal)) d = addDays(d, dir);
  return d;
}

/** (from, to] 之间有几个工作日；to 早于 from 时为负数 */
export function workdaysBetween(fromIso: string, toIso: string, cal: WorkdayCalendar): number {
  let a = bjYmd(fromIso), b = bjYmd(toIso), sign = 1;
  if (b < a) { [a, b] = [b, a]; sign = -1; }
  let n = 0;
  for (let d = addDays(a, 1); d <= b; d = addDays(d, 1)) if (isWorkday(d, cal)) n++;
  return n * sign;
}
