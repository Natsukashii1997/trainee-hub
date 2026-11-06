import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Grade, Role, TaskInstance, User } from '../data/types';
import { STATUS_LABEL } from '../data/types';
import { demoUserFor, isOverdue } from '../data/api';

/* 通用组件：只收 props，不读 data 层（Face / StatusChip / GradeChip / Session 是对数据类型的薄包装，保留给旧页面）。
   用法见 ./README.md，样子见 /dev/kit。 */

// ---------- 领域 ----------
/** 五个领域 + 周期（灰蓝）+ 强调色。成长=路径任务；带教=跟岗、1:1、日程；团队=团队活动；考核=轻测、评估；AI=资产 */
export type Domain = 'grow' | 'ment' | 'team' | 'exam' | 'ai' | 'week' | 'acc';
export const DOMAIN_LABEL: Record<Domain, string> = { grow: '成长', ment: '带教', team: '团队活动', exam: '考核', ai: 'AI', week: '周期', acc: '强调' };
const d = (x?: Domain) => (x ? `d-${x}` : '');
const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

// ---------- 图标（与 V3 稿同一套线性图标，24 栅格、1.6 线宽） ----------
const PATHS: Record<string, ReactNode> = {
  home: <path d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z" />,
  grow: <><path d="M12 20v-8" /><path d="M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5Z" /><path d="M12 14c0-3-2.3-5-5.5-5C6.5 12 8.8 14 12 14Z" /></>,
  trend: <><path d="M4 19h16" /><path d="m5 15 4.5-4.5 3 3L19 7" /><path d="M15 7h4v4" /></>,
  cal: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  todo: <><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="m8 12 2.5 2.5L16 9" /></>,
  book: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />,
  spark: <><path d="M12 3.5 13.8 9 19.5 11 13.8 13 12 18.5 10.2 13 4.5 11 10.2 9z" /><path d="M19 3.5v3M17.5 5h3" /></>,
  team: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="16.8" cy="9.5" r="2.5" /><path d="M16.5 14.6c2.2.2 3.7 1.7 4.1 4.4" /></>,
  award: <><circle cx="12" cy="9" r="5" /><path d="m8.8 13 -1.3 7.5L12 18l4.5 2.5L15.2 13" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" /></>,
  inbox: <><path d="M4 13.5 6.5 5h11l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" /><path d="M4 13.5h4.5l1 2h5l1-2H20" /></>,
  star: <path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />,
  bm: <path d="M6.5 4.5h11v15l-5.5-3.5-5.5 3.5z" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  upload: <><path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>,
  right: <path d="m9.5 6 6 6-6 6" />,
  left: <path d="m14.5 6-6 6 6 6" />,
  up: <path d="m6 14 6-6 6 6" />,
  down: <path d="m6 10 6 6 6-6" />,
  chev: <path d="m8 10 4 4 4-4" />,
  x: <path d="m7 7 10 10M17 7 7 17" />,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M7 17 17 7M9 7h8v8" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  quiz: <><rect x="5" y="4.5" width="14" height="16" rx="3" /><path d="M9 4.5V3.5h6v1M8.5 11l2 2 4-4M8.5 16.5h7" /></>,
  pen: <><path d="M4.5 19.5 5.5 15 15.5 5a2.1 2.1 0 0 1 3 3l-10 10z" /><path d="m13.5 7 3 3" /></>,
  doc: <><path d="M6.5 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z" /><path d="M13.5 3.5V8H18M8.5 12.5h7M8.5 16h5" /></>,
  file: <><path d="M6.5 3.5h7l4 4v13h-11z" /><path d="M13.5 3.5v4h4" /></>,
  grid: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 10h16M10 10v10" /></>,
  ext: <><path d="M13.5 5h5.5v5.5M19 5l-8 8" /><path d="M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" /></>,
  sync: <><path d="M19.5 12a7.5 7.5 0 0 1-13.2 4.9M4.5 12a7.5 7.5 0 0 1 13.2-4.9" /><path d="M18 3.5v3.8h-3.8M6 20.5v-3.8h3.8" /></>,
  flag: <path d="M5.5 20.5v-16M5.5 4.5h11l-2 4 2 4h-11" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  bot: <><rect x="5" y="8" width="14" height="11" rx="3.5" /><path d="M12 4.5V8M9.5 13h.01M14.5 13h.01M9.5 16h5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  alert: <><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5M12 17v.2" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.2" /></>,
  q: <><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.6a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.4" /><path d="M12 16.8v.2" /></>,
  shield: <><path d="M12 3.5 19 6v6c0 4.2-3 7.2-7 8.5-4-1.3-7-4.3-7-8.5V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  route: <><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M8.2 6H15a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 0 0 0 7h6.8" /></>,
  swap: <><path d="M4.5 8h13l-3.5-3.5M19.5 16h-13l3.5 3.5" /></>,
  repeat: <><path d="M17 3.5 20 6.5l-3 3" /><path d="M4 11.5V10a3.5 3.5 0 0 1 3.5-3.5H20" /><path d="m7 20.5-3-3 3-3" /><path d="M20 12.5V14a3.5 3.5 0 0 1-3.5 3.5H4" /></>,
  layers: <><path d="m12 4 8.5 4.5L12 13 3.5 8.5z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M4 13h16M12 9v11" /><path d="M12 9c-2-3.5-6-3.5-5.5-1S12 9 12 9zm0 0c2-3.5 6-3.5 5.5-1S12 9 12 9z" /></>,
  mega: <><path d="M4 10v4h3l7 4V6L7 10z" /><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />,
  heart: <path d="M12 19s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.5C19 14.6 12 19 12 19z" />,
  filter: <path d="M4.5 5.5h15l-6 7.5v5l-3 1.5v-6.5z" />,
  more: <><circle cx="6" cy="12" r=".8" /><circle cx="12" cy="12" r=".8" /><circle cx="18" cy="12" r=".8" /></>,
};
export type IconName = keyof typeof PATHS;
export function Icon({ name, size, style }: { name: IconName | string; size?: number; style?: CSSProperties }) {
  return <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size, ...style } : style}>{PATHS[name]}</svg>;
}
/** 品牌标：墨色方块 + 新芽 */
export function Mark() {
  return <span className="mark" aria-hidden="true"><Icon name="grow" /></span>;
}

// ---------- 头像 ----------
/** 圆形头像：取名字首字；color 为人物主色（浅底 + 深色字），solid 为实心（叠放头像用） */
export function Avatar({ name, color = '#7A869C', size, solid, title }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg'; solid?: boolean; title?: string }) {
  const style: CSSProperties = solid
    ? { background: color, color: '#fff' }
    : { background: `color-mix(in srgb, ${color} 15%, #fff)`, color: `color-mix(in srgb, ${color} 82%, #000)` };
  return <span className={cx('av', size && size !== 'md' && size)} style={style} title={title ?? name}>{name.slice(0, 1)}</span>;
}
/** 叠放头像（「23 人用过」后面那串） */
export function AvatarStack({ people, max = 3 }: { people: { name: string; color?: string }[]; max?: number }) {
  return <span className="faces" aria-hidden="true">{people.slice(0, max).map(p => <Avatar key={p.name} name={p.name} color={p.color} solid />)}</span>;
}
/** 旧接口：按 User 画头像 */
export function Face({ user, size }: { user: User; size?: 'sm' | 'md' | 'lg' }) {
  return <Avatar name={user.name} color={user.color} size={size} />;
}

// ---------- 胶囊与标签 ----------
export type Tone = 'ok' | 'warn' | 'due' | 'info' | 'acc' | 'plain';
/** 状态胶囊（语义色）：ok 通过/达标，warn 需修改/提醒，due 逾期/驳回，info 已提交/等待，acc 进行中，plain 未开始 */
export function StatusPill({ tone = 'plain', icon, dot, size, children }: { tone?: Tone; icon?: IconName; dot?: boolean; size?: 'lg'; children: ReactNode }) {
  return <span className={cx('chip', tone, dot && 'dot', size)}>{icon && <Icon name={icon} />}{children}</span>;
}
/** 领域色标签：chip = 浅底胶囊；dot = 小圆点 + 灰字（表格里的「路径 / 周期」） */
export function DomainTag({ domain, children, variant = 'chip', icon }: { domain: Domain; children?: ReactNode; variant?: 'chip' | 'dot'; icon?: IconName }) {
  if (variant === 'dot') return <span className={cx('dtag', d(domain))}><i />{children ?? DOMAIN_LABEL[domain]}</span>;
  return <span className={cx('chip', domain)}>{icon && <Icon name={icon} />}{children ?? DOMAIN_LABEL[domain]}</span>;
}
/** 领域色图标方块 */
export function Tile({ icon, domain = 'week', size }: { icon: IconName; domain?: Domain; size?: 'sm' | 'lg' }) {
  return <span className={cx('tile', d(domain), size)} aria-hidden="true"><Icon name={icon} /></span>;
}
/** 玻璃小胶囊（页头右侧「第 45 周」） */
export function MetaPill({ children }: { children: ReactNode }) {
  return <span className="pill">{children}</span>;
}

/** 旧接口：任务状态胶囊 */
export function StatusChip({ task }: { task: TaskInstance }) {
  if (isOverdue(task)) return <StatusPill tone="due">已逾期</StatusPill>;
  const tone: Record<TaskInstance['status'], Tone> = { todo: 'plain', doing: 'acc', submitted: 'info', revise: 'warn', passed: 'ok' };
  return <StatusPill tone={tone[task.status]}>{STATUS_LABEL[task.status]}</StatusPill>;
}
/** 旧接口：点评等级 */
export function GradeChip({ grade }: { grade: Grade }) {
  return <StatusPill tone={grade === '需改进' ? 'warn' : 'ok'} icon={grade === '需改进' ? undefined : 'check'}>{grade}</StatusPill>;
}

// ---------- 结构 ----------
/** 卡片头：标题 + 副标题 + 右侧「更多」链接或任意内容 */
export function CardHead({ title, sub, more, children }: { title: ReactNode; sub?: ReactNode; more?: { to: string; label: string }; children?: ReactNode }) {
  return (
    <div className="hd">
      <h2>{title}</h2>
      {sub != null && <span className="sub">{sub}</span>}
      {more && <Link className="more" to={more.to}>{more.label}<Icon name="right" /></Link>}
      {children && <div className="r">{children}</div>}
    </div>
  );
}
/** 页头：日期小字 + 30px 细体标题（em 内为强调色）+ 右侧 */
export function PageHead({ kicker, title, sub, right }: { kicker?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <section className="head">
      <div>
        {kicker != null && <div className="dt">{kicker}</div>}
        <h1>{title}</h1>
        {sub != null && <p className="sub">{sub}</p>}
      </div>
      {right != null && <div className="meta">{right}</div>}
    </section>
  );
}
/** 分段控件 */
export function Segmented<T extends string>({ options, value, onChange, label, full }: { options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[]; value: T; onChange: (v: T) => void; label?: string; full?: boolean }) {
  return (
    <div className={cx('seg', full && 'full')} role="group" aria-label={label}>
      {label && !full && <span className="seg-l">{label}</span>}
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={value === o.value} disabled={o.disabled} title={o.title} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
/** 空状态 */
export function Empty({ title, children, icon, action, size }: { title: string; children?: ReactNode; icon?: IconName; action?: ReactNode; size?: 'lg' }) {
  return (
    <div className={cx('empty', size)}>
      {icon && <span className="em-ico"><Icon name={icon} /></span>}
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

// ---------- 数字与进度 ----------
/** 倒计时 / 大数字：parts 依次为 [数, 单位]，如 [[9,'小时'],[36,'分']] */
export function Countdown({ parts, label }: { parts: [number | string, string][]; label?: string }) {
  return <div className="cd">{label && <span className="lbl">{label}</span>}{parts.map(([n, u]) => <span key={u} style={{ display: 'contents' }}><span className="n">{n}</span><span className="u">{u}</span></span>)}</div>;
}
/** 线性进度条 */
export function ProgressBar({ value, domain = 'grow', thin, width }: { value: number; domain?: Domain; thin?: boolean; width?: number | string }) {
  return <span className={cx('lbar', thin && 'thin', d(domain))} style={{ display: 'block', width }} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${clamp(value)}%` }} /></span>;
}
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const DOMAIN_GRAD: Record<Domain, [string, string]> = {
  grow: ['#B4E9CD', '#22A065'], ment: ['#BFDBF7', '#2F7FD0'], team: ['#D9CBF8', '#7B57D6'], exam: ['#F9CDBE', '#E3623F'],
  ai: ['#F4DDA6', '#D3951F'], week: ['#D5DAE3', '#6B788F'], acc: ['#C9CBF7', '#4A4ED8'],
};
/** 进度环：粗环 + 渐变端点；plan 在环上标「按计划」刻度（白点墨边） */
export function ProgressRing({ value, plan, size = 128, label, sub, domain = 'grow', thickness = 13 }: { value: number; plan?: number; size?: number; label?: ReactNode; sub?: ReactNode; domain?: Domain; thickness?: number }) {
  const gid = useId().replace(/:/g, '');
  const r = 70 - thickness / 2 - 3;
  const pt = (pct: number) => { const a = (clamp(pct) / 100) * 2 * Math.PI - Math.PI / 2; return [70 + r * Math.cos(a), 70 + r * Math.sin(a)]; };
  const v = clamp(value);
  const [ex, ey] = pt(v);
  const large = v > 50 ? 1 : 0;
  const arc = v >= 99.95 ? `M70 ${70 - r} A${r} ${r} 0 1 1 69.99 ${70 - r}` : `M70 ${70 - r} A${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  const [g0, g1] = DOMAIN_GRAD[domain];
  const pp = plan != null ? pt(plan) : null;
  return (
    <div className={cx('pring', size < 100 && 'sm')} style={{ width: size, height: size }} role="img" aria-label={`完成 ${Math.round(v)}%${plan != null ? `，按计划 ${Math.round(plan)}%` : ''}`}>
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <defs><linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="70" y1={70 - r} x2={v > 50 ? 70 : ex} y2={v > 50 ? 70 + r : ey}><stop offset="0" stopColor={g0} /><stop offset="1" stopColor={g1} /></linearGradient></defs>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(21,25,38,.07)" strokeWidth={thickness} />
        {v > 0 && <path className="arc" d={arc} fill="none" stroke={`url(#${gid})`} strokeWidth={thickness} strokeLinecap="round" />}
        {pp && <circle cx={pp[0]} cy={pp[1]} r="3.4" fill="#fff" stroke="#151926" strokeWidth="1.6" />}
      </svg>
      <div className="c">
        <span className="n">{label ?? <>{Math.round(v)}<sup>%</sup></>}</span>
        {sub != null && <small>{sub}</small>}
      </div>
    </div>
  );
}
/** 旧接口：进度环 */
export function Ring({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  return <ProgressRing value={pct} label={label} sub={sub} />;
}
/** 「按计划」图例（配合进度环的刻度点） */
export function PlanKey({ children }: { children: ReactNode }) {
  return <span className="plan-key"><i aria-hidden="true" />{children}</span>;
}
export type StepState = 'done' | 'cur' | 'todo' | 'due';
/** 阶段条：入职 → 通识 → 轮岗 → 定岗 */
export function PhaseBar({ phases }: { phases: { name: string; state: StepState }[] }) {
  return <div className="phases">{phases.map(p => <span key={p.name} className={cx('phase', p.state === 'due' ? 'todo' : p.state)}>{p.state === 'done' && <Icon name="check" />}{p.name}</span>)}</div>;
}
/** 轮岗站圆点链：done 已结清（绿勾）、due 时间到了未结清（绿圈）、cur 当前站（强调色）、todo 未开始；sub 为站下小字（如开始日） */
export function StationChain({ stations, onPick }: { stations: { name: string; state: StepState; sub?: string; title?: string }[]; onPick?: (index: number) => void }) {
  const cur = stations.findIndex(s => s.state === 'cur');
  const reached = cur >= 0 ? cur : stations.reduce((m, s, i) => (s.state === 'done' || s.state === 'due' ? i : m), -1);
  const f = stations.length > 1 ? Math.max(0, reached) / (stations.length - 1) : 0;
  return (
    <div className="stations">
      <span className="fill" style={{ width: `calc((100% - 28px) * ${f})` }} aria-hidden="true" />
      {stations.map((s, i) => {
        const inner = <><i>{s.state === 'done' ? <Icon name="check" /> : i + 1}</i>{s.name}{s.sub && <small>{s.sub}</small>}</>;
        const label = s.title ?? `第 ${i + 1} 站 ${s.name}`;
        return onPick
          ? <button key={s.name + i} type="button" className={cx('st', s.state)} title={label} aria-current={s.state === 'cur' ? 'step' : undefined} onClick={() => onPick(i)}>{inner}</button>
          : <div key={s.name + i} className={cx('st', s.state)} title={label} aria-current={s.state === 'cur' ? 'step' : undefined}>{inner}</div>;
      })}
    </div>
  );
}
/** 当前站天数条：total 天，已过 passed 天，第 passed+1 天为今天 */
export function DayStrip({ total, passed }: { total: number; passed: number }) {
  return <div className="days" style={{ '--n': total } as CSSProperties} aria-hidden="true">{Array.from({ length: total }, (_, i) => <i key={i} className={i < passed ? 'd' : i === passed ? 't' : ''} />)}</div>;
}

/** 指标卡：大数字 + 单位 + 变化 + 迷你走势 */
export function Metric({ label, value, unit, delta, trend, foot, domain = 'acc', icon, right }: {
  label: ReactNode; value: ReactNode; unit?: ReactNode; delta?: { text: string; dir: 'up' | 'down' | 'flat' }; trend?: number[]; foot?: ReactNode; domain?: Domain; icon?: IconName; right?: ReactNode;
}) {
  return (
    <div className={cx('card metric', d(domain))}>
      <div className="l">{icon && <Tile icon={icon} domain={domain} size="sm" />}{label}{right && <span className="r">{right}</span>}</div>
      <div className="v">{value}{unit != null && <small>{unit}</small>}</div>
      {trend && trend.length > 1 && <Sparkline values={trend} domain={domain} />}
      {(delta || foot) && <div className="f">{delta && <span className={cx('delta', delta.dir)}>{delta.dir === 'up' ? '↑' : delta.dir === 'down' ? '↓' : '·'} {delta.text}</span>}{foot}</div>}
    </div>
  );
}
/** 迷你走势线 */
export function Sparkline({ values, domain = 'acc' }: { values: number[]; domain?: Domain }) {
  const gid = useId().replace(/:/g, '');
  const w = 200, h = 34, p = 3;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const xy = values.map((v, i) => [p + (i * (w - 2 * p)) / (values.length - 1), h - p - ((v - lo) / span) * (h - 2 * p)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg className={cx('spark', d(domain))} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--c)" stopOpacity=".22" /><stop offset="1" stopColor="var(--c)" stopOpacity="0" /></linearGradient></defs>
      <path className="a" d={`${line} L${lx.toFixed(1)} ${h} L${p} ${h}Z`} fill={`url(#${gid})`} />
      <path className="ln" d={line} vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ---------- 抽屉 ----------
/** 右侧滑出抽屉：Esc / 点遮罩关闭；打开时焦点移入，关闭后还给触发元素 */
export function Drawer({ open, onClose, title, sub, head, children, footer, width = 420 }: {
  open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; head?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="drawer-mask" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1} style={{ '--dw': `${width}px` } as CSSProperties}>
        <div className="dr-h">
          <div style={{ minWidth: 0 }}>{head}<h2 style={head ? { marginTop: 12 } : undefined}>{title}</h2>{sub != null && <p>{sub}</p>}</div>
          <button type="button" className="x" aria-label="关闭" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="dr-b">{children}</div>
        {footer && <div className="dr-f">{footer}</div>}
      </div>
    </>
  );
}

// ---------- 演示视角（原型用；正式版按登录身份决定，管理员才可预览其他视角） ----------
type Session = { role: Role; me: User; setRole: (r: Role) => void };
const SessionCtx = createContext<Session | null>(null);
const KEY = 'trainee-hub:demo-role';
const isRole = (r: string | null): r is Role => r === 'trainee' || r === 'mentor' || r === 'admin' || r === 'colleague';
function readRole(): Role {
  // 地址里的 ?as=mentor 优先（截图验收用，也方便把某个视角的链接发给别人看）
  const q = new URLSearchParams(window.location.search).get('as');
  if (isRole(q)) return q;
  try { const r = localStorage.getItem(KEY); if (isRole(r)) return r; } catch { /* 存储不可用时用默认 */ }
  return 'trainee';
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(readRole);
  const setRole = useCallback((r: Role) => { setRoleState(r); try { localStorage.setItem(KEY, r); } catch { /* 忽略 */ } }, []);
  const value = useMemo(() => ({ role, me: demoUserFor(role), setRole }), [role, setRole]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}
export function useSession() { const s = useContext(SessionCtx); if (!s) throw new Error('缺 SessionProvider'); return s; }

// ---------- 轻提示 ----------
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const say = useCallback((m: string) => { setMsg(m); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setMsg(''), 2200); }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return <ToastCtx.Provider value={say}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

/** 复制指令框：剪贴板不可用时选中文字提示手动复制。放在 .reco / .card.dark 里自动变深色 */
export function CopyBox({ text, label = '复制' }: { text: string; label?: string }) {
  const say = useToast();
  const ref = useRef<HTMLElement>(null);
  const copy = () => {
    const done = () => say('已复制');
    const fail = () => { const r = document.createRange(); if (ref.current) { r.selectNodeContents(ref.current); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); } say('无法直接复制，已选中，请按 ⌘C'); };
    try { navigator.clipboard.writeText(text).then(done, fail); } catch { fail(); }
  };
  return <div className="cp"><code ref={ref}>{text}</code><button type="button" onClick={copy} aria-label={`${label}：${text}`}><Icon name="copy" />{label}</button></div>;
}
