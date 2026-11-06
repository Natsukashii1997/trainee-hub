import type { CSSProperties, ReactNode } from 'react';
import { Icon, type Domain, type IconName } from './ui';

/* 时间类组件：竖向日程时间轴、迷你月历、周视图网格、甘特条。只收 props，时间一律由调用方先格式化成北京时间字符串或分钟数传入。 */

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
const dc = (x?: Domain) => (x ? `d-${x}` : 'd-week');

// ---------- 竖向日程时间轴（首页「今日日程」） ----------
export type TimelineItem = {
  id: string;
  /** 开始时刻，如 '09:30' */
  start: string;
  end?: string;
  title: ReactNode;
  sub?: ReactNode;
  domain: Domain;
  /** 时刻型（截止、换站）：菱形节点、单行 */
  point?: boolean;
  /** 时刻型右侧小字，如「考核」 */
  aside?: ReactNode;
  done?: boolean;
  /** 进行中：nowLabel 显示在时间列（当前时刻），progress 0–100，remain 如「进行中 · 还剩 66 分」 */
  now?: { nowLabel: string; progress: number; remain: string };
};
export function Timeline({ items, fill, onSelect }: { items: TimelineItem[]; fill?: boolean; onSelect?: (id: string) => void }) {
  return (
    <div className={cx('tline', fill && 'fill')}>
      {items.map(it => {
        const cls = cx('tl-ev', dc(it.domain), it.now && 'now', it.point && 'pt', it.done && 'done');
        const body = (
          <>
            <div className="tm"><b>{it.start}</b>{it.now && <span className="nowtag">{it.now.nowLabel}</span>}{it.end && <span>{it.end}</span>}</div>
            <span className="node" aria-hidden="true" />
            <div className="box">
              {it.point ? <><b>{it.title}</b>{(it.aside ?? it.sub) && <small>{it.aside ?? it.sub}</small>}</> : <>
                <b>{it.title}</b>
                {it.sub && <small>{it.sub}</small>}
                {it.now && <div className="live"><span className="lbar" aria-hidden="true"><i style={{ width: `${it.now.progress}%` }} /></span><span>{it.now.remain}</span></div>}
              </>}
            </div>
          </>
        );
        return onSelect
          ? <button key={it.id} type="button" className={cls} onClick={() => onSelect(it.id)}>{body}</button>
          : <div key={it.id} className={cls}>{body}</div>;
      })}
    </div>
  );
}

// ---------- 迷你月历 ----------
const WD = ['一', '二', '三', '四', '五', '六', '日'];
/** 迷你月历（周一起）：today/selected 为当月日号；marks 为有事项的日号（底部小点）；off 为非工作日日号（变淡）。选中日所在周整行浅底高亮 */
export function MiniMonth({ year, month, today, selected, marks = [], off = [], onPick, onPrev, onNext, title }: {
  year: number; month: number; today?: number; selected?: number; marks?: number[]; off?: number[];
  onPick?: (day: number) => void; onPrev?: () => void; onNext?: () => void; title?: ReactNode;
}) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prevDays = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const cells: { n: number; out: boolean }[] = [];
  for (let i = lead; i > 0; i--) cells.push({ n: prevDays - i + 1, out: true });
  for (let i = 1; i <= days; i++) cells.push({ n: i, out: false });
  let k = 1; while (cells.length % 7) cells.push({ n: k++, out: true });
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
  const focus = selected ?? today;
  const mk = new Set(marks), of = new Set(off);
  return (
    <section className="card tight mmonth" aria-label="迷你月历">
      <div className="hd" style={{ padding: '0 4px' }}>
        <h2>{title ?? `${year} 年 ${month} 月`}</h2>
        {(onPrev || onNext) && <span className="nav2"><button type="button" aria-label="上个月" onClick={onPrev}><Icon name="left" /></button><button type="button" aria-label="下个月" onClick={onNext}><Icon name="right" /></button></span>}
      </div>
      <div className="wd" aria-hidden="true">{WD.map(w => <span key={w}>{w}</span>)}</div>
      {rows.map((row, r) => (
        <div key={r} className={cx('mr', row.some(c => !c.out && c.n === focus) && 'wk')}>
          {row.map((c, i) => c.out
            ? <span key={i} className="d out">{c.n}</span>
            : <button key={i} type="button" className={cx('d', c.n === today && 'td', c.n === selected && 'pick', of.has(c.n) && 'off')} aria-current={c.n === today ? 'date' : undefined} aria-label={`${month} 月 ${c.n} 日`} onClick={onPick ? () => onPick(c.n) : undefined}>{c.n}{mk.has(c.n) && <i />}</button>)}
        </div>
      ))}
    </section>
  );
}

// ---------- 周视图网格 ----------
export type WeekDay = { key: string; dow: string; date: number | string; today?: boolean; weekend?: boolean; off?: boolean };
export type WeekEvent = {
  id: string;
  /** 第几列（0 = 周一） */
  day: number;
  /** 开始，距 0 点的分钟数 */
  start: number;
  /** 结束分钟数；不填即截止型（白底小卡挂在时间点上） */
  end?: number;
  title: string;
  sub?: string;
  /** 时间文字，如 '09:30–11:30'；截止型显示在首行，如 '20:00' 或 '已提交' */
  time?: string;
  icon?: IconName;
  domain: Domain;
  done?: boolean;
  /** 截止型用领域浅底（默认白底） */
  tinted?: boolean;
};
export type AllDayItem = { id: string; from: number; to: number; title: ReactNode; right?: ReactNode; icon?: IconName; domain?: Domain };
const DUE_SPAN = 42; // 截止卡大约占 42 分钟高度，用于避让

function layout(evs: WeekEvent[]) {
  const sorted = [...evs].sort((a, b) => a.start - b.start);
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: WeekEvent[] = [], clusterEnd = -1, laneEnds: number[] = [];
  const flush = () => { const n = laneEnds.length; cluster.forEach(e => { out.get(e.id)!.lanes = n; }); cluster = []; laneEnds = []; };
  for (const e of sorted) {
    const end = e.end ?? e.start + DUE_SPAN;
    if (cluster.length && e.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex(x => x <= e.start);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(end); } else laneEnds[lane] = end;
    out.set(e.id, { lane, lanes: 1 });
    cluster.push(e); clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}

/** 周视图：工作日列 1.25fr、周末 0.6fr（weights 可改）；事件按领域着色；当前时间线；选中态柔和外发光。标题不截断，自动换行 */
export function WeekGrid({ days, events, allDay = [], startHour = 9, endHour = 21, hourHeight = 52, now, selectedId, onSelect, weights = [1.25, 0.6], label }: {
  days: WeekDay[]; events: WeekEvent[]; allDay?: AllDayItem[]; startHour?: number; endHour?: number; hourHeight?: number;
  now?: { day: number; minutes: number; label: string }; selectedId?: string; onSelect?: (id: string) => void; weights?: [number, number]; label?: string;
}) {
  const cols = days.map(d => `minmax(0, ${d.weekend ? weights[1] : weights[0]}fr)`).join(' ');
  const H = (endHour - startHour) * hourHeight;
  const y = (min: number) => ((min - startHour * 60) / 60) * hourHeight;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const style = { '--cols': cols } as CSSProperties;
  const nowY = now ? y(now.minutes) : null;
  return (
    <section className="card flush wkg" style={style} aria-label={label ?? '周视图'}>
      <div className="wh">
        <div />
        {days.map(d => <div key={d.key} className={cx('dh', d.today && 'today', d.weekend && 'we', d.off && 'off')}><span>{d.dow}</span><b>{d.date}</b></div>)}
      </div>
      {allDay.length > 0 && (
        <div className="ad">
          <div className="gl">全天</div>
          {allDay.map((a, i) => {
            const cls = cx('adi', dc(a.domain ?? 'acc'), a.from === a.to && 'one', selectedId === a.id && 'sel');
            const st: CSSProperties = { gridColumn: `${a.from + 2} / ${a.to + 3}`, gridRow: i + 1 };
            const inner = <>{a.icon && <Icon name={a.icon} />}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</span>{a.right && <span className="r">{a.right}</span>}</>;
            return onSelect ? <button key={a.id} type="button" className={cls} style={st} onClick={() => onSelect(a.id)}>{inner}</button> : <div key={a.id} className={cls} style={st}>{inner}</div>;
          })}
        </div>
      )}
      <div className="grid" style={{ height: H }}>
        <div className="gut" aria-hidden="true">
          {hours.map((h, i) => <span key={h} className={cx(i === 0 && 'first', i === hours.length - 1 && 'last')} style={{ top: i * hourHeight }}>{String(h).padStart(2, '0')}:00</span>)}
          {now && nowY != null && nowY >= 0 && nowY <= H && <span className="nowpill" style={{ top: nowY }}>{now.label}</span>}
        </div>
        <div className="cols">
          <div className="hl" aria-hidden="true">
            {hours.slice(1, -1).map((h, i) => <i key={h} style={{ top: (i + 1) * hourHeight }} />)}
            {nowY != null && nowY >= 0 && nowY <= H && <i className="nowg" style={{ top: nowY }} />}
          </div>
          {days.map((d, di) => {
            const evs = events.filter(e => e.day === di);
            const pos = layout(evs);
            return (
              <div key={d.key} className={cx('col', d.weekend && 'we', d.off && 'off', d.today && 'today')}>
                {evs.map(e => {
                  const { lane, lanes } = pos.get(e.id)!;
                  const isDue = e.end == null;
                  const h = isDue ? undefined : Math.max(22, y(e.end!) - y(e.start) - 2);
                  const short = h != null && h < 36;
                  const mid = h != null && !short && h < 72;
                  const st: CSSProperties = { top: isDue ? y(e.start) - 4 : y(e.start) + 1, height: h, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` };
                  const cls = cx('evb', dc(e.domain), isDue && 'due', isDue && e.tinted && 'tinted', short && 'short', mid && 'mid', e.done && 'done', selectedId === e.id && 'sel');
                  const inner = isDue
                    ? <><span className="l">{e.icon && <Icon name={e.icon} />}{e.time}</span><b>{e.title}</b></>
                    : <><b>{e.title}</b>{e.time && <span className="tm">{e.time}</span>}{e.sub && <span className="sub">{e.sub}</span>}</>;
                  const title = `${e.title}${e.time ? ` ${e.time}` : ''}${e.sub ? ` · ${e.sub}` : ''}`;
                  return onSelect
                    ? <button key={e.id} type="button" className={cls} style={st} title={title} aria-pressed={selectedId === e.id} onClick={() => onSelect(e.id)}>{inner}</button>
                    : <div key={e.id} className={cls} style={st} title={title}>{inner}</div>;
                })}
                {now && now.day === di && nowY != null && nowY >= 0 && nowY <= H && <div className="nowl" style={{ top: nowY }} />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- 甘特条（轮岗排期） ----------
export type GanttCol = { key: string; label: string; sub?: string; current?: boolean; holiday?: boolean };
export type GanttBar = {
  id: string;
  /** 起始列下标（0 起） */
  from: number;
  /** 占几列 */
  span: number;
  label: string;
  sub?: string;
  domain?: Domain;
  /** done 已结束（灰）、cur 进行中（实色）、plan 计划（斜纹描边），不填为常规浅底 */
  state?: 'done' | 'cur' | 'plan';
  title?: string;
};
export type GanttMarker = { col: number; kind: 'switch' | 'eval'; label: string };
export type GanttRow = {
  id: string;
  label: ReactNode;
  sub?: ReactNode;
  /** 行首前缀，如头像 */
  lead?: ReactNode;
  bars?: GanttBar[];
  /** 冲突格（列下标），红色描边高亮 */
  clashes?: number[];
  /** 每列的数字（按岗位、按带教视角：该周几人） */
  counts?: (number | null)[];
  markers?: GanttMarker[];
};
/** 甘特条：行 = 人 / 岗位 / 带教，列 = 周；色块可点击（onBarClick），冲突格高亮，假期列灰带，本周列浅底 */
export function Gantt({ cols, rows, corner = '成员', labelWidth = 180, colWidth = 64, rowHeight = 52, selectedId, onBarClick }: {
  cols: GanttCol[]; rows: GanttRow[]; corner?: ReactNode; labelWidth?: number; colWidth?: number; rowHeight?: number;
  selectedId?: string; onBarClick?: (bar: GanttBar, row: GanttRow) => void;
}) {
  const style = { '--n': cols.length, '--lw': `${labelWidth}px`, '--cw': `${colWidth}px`, '--rh': `${rowHeight}px` } as CSSProperties;
  const cellCls = (i: number, clash?: boolean) => cx('g-cell', cols[i].current && 'cur', cols[i].holiday && 'hol', clash && 'clash');
  return (
    <div className="gantt" style={style}>
      <div className="g-row g-head">
        <div className="g-lab">{corner}</div>
        {cols.map((c, i) => <div key={c.key} className={cellCls(i)} style={{ gridColumn: i + 2 }}><b>{c.label}</b>{c.sub && <span>{c.sub}</span>}</div>)}
      </div>
      <div className="g-body">
        {rows.map(r => {
          const clash = new Set(r.clashes ?? []);
          return (
            <div key={r.id} className="g-row">
              <div className="g-lab">{r.lead}<span><b>{r.label}</b>{r.sub && <small>{r.sub}</small>}</span></div>
              {cols.map((c, i) => (
                <div key={c.key} className={cellCls(i, clash.has(i))} style={{ gridColumn: i + 2 }} title={clash.has(i) ? `${c.label} 有冲突` : undefined}>
                  {r.counts && r.counts[i] != null && <span className="cnt">{r.counts[i]}</span>}
                </div>
              ))}
              {(r.bars ?? []).map(b => {
                const cls = cx('g-bar', dc(b.domain ?? 'acc'), b.state, selectedId === b.id && 'sel');
                const st: CSSProperties = { gridColumn: `${b.from + 2} / span ${b.span}` };
                const inner = <>{b.label}{b.sub && <small>{b.sub}</small>}</>;
                return onBarClick
                  ? <button key={b.id} type="button" className={cls} style={st} title={b.title ?? b.label} aria-pressed={selectedId === b.id} onClick={() => onBarClick(b, r)}>{inner}</button>
                  : <div key={b.id} className={cls} style={st} title={b.title ?? b.label}>{inner}</div>;
              })}
              {(r.markers ?? []).map(m => <span key={`${m.kind}-${m.col}`} className={cx('g-mk', m.kind)} style={{ gridColumn: m.col + 2 }} title={m.label} aria-label={m.label} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
/** 甘特图例 */
/** kind：solid 实色（进行中）、plan 斜纹（计划）、switch 换站菱形、eval 评估节点、hol 假期、clash 冲突；不填为领域浅底 */
export function GanttLegend({ items }: { items: { label: string; domain?: Domain; kind?: 'solid' | 'plan' | 'switch' | 'eval' | 'hol' | 'clash' }[] }) {
  return (
    <div className="g-legend">
      {items.map(it => <span key={it.label}><i className={cx(it.domain && `d-${it.domain}`, it.kind === 'solid' && 'solid', it.kind === 'plan' && 'plan', it.kind === 'switch' && 'mk', it.kind === 'eval' && 'mk eval', it.kind === 'hol' && 'hol', it.kind === 'clash' && 'clash')} />{it.label}</span>)}
    </div>
  );
}
