import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Grade, Role, TaskInstance, User } from '../data/types';
import { STATUS_LABEL } from '../data/types';
import { demoUserFor, isOverdue } from '../data/api';

// ---------- 图标 ----------
const PATHS: Record<string, ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  grow: <><path d="M4 19h16" /><path d="m5 15 4.5-4.5 3 3L19 7" /><path d="M15 7h4v4" /></>,
  book: <><path d="M5 4.5h9.5L19 9v10.5H5z" /><path d="M14.5 4.5V9H19" /><path d="M8.5 13h7M8.5 16.5h5" /></>,
  spark: <><path d="M12 3.5 13.9 9l5.6 2-5.6 2L12 18.5 10.1 13 4.5 11l5.6-2z" /><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>,
  team: <><circle cx="9" cy="9" r="3.2" /><circle cx="17" cy="10" r="2.4" /><path d="M3.5 19c.8-3 3-4.8 5.5-4.8s4.7 1.8 5.5 4.8" /><path d="M15.5 15c2.3-.4 4.3.9 5 3.5" /></>,
  star: <path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6L12 16.6l-5 2.7.9-5.6-4-4 5.6-.8z" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></>,
  bell: <><path d="M6.5 16V11a5.5 5.5 0 0 1 11 0v5l1.5 2h-14z" /><path d="M10 20.5h4" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1-3.5 3.8-5.5 7-5.5s6 2 7 5.5" /></>,
  inbox: <><path d="M4.5 13.5 7 5h10l2.5 8.5V19h-15z" /><path d="M4.5 13.5h4.5l1 2h4l1-2h4.5" /></>,
  file: <><path d="M6.5 3.5h7l4 4v13h-11z" /><path d="M13.5 3.5v4h4" /></>,
  q: <><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.6a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.4" /><path d="M12 16.8v.2" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  pen: <><path d="M4.5 19.5 5.5 15 15 5.5l3.5 3.5L9 18.5z" /><path d="m13 7.5 3.5 3.5" /></>,
  cal: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M7 17 17 7M9 7h8v8" />,
  chev: <path d="m8 10 4 4 4-4" />,
  bm: <path d="M6.5 4.5h11v15l-5.5-3.5-5.5 3.5z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: <><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5M12 17v.2" /></>,
  shield: <><path d="M12 3.5 19 6v6c0 4.2-3 7.2-7 8.5-4-1.3-7-4.3-7-8.5V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  route: <><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M8.2 6H15a3.5 3.5 0 0 1 0 7H9a3.5 3.5 0 0 0 0 7h6.8" /></>,
  gift: <><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M4 13h16M12 9v11" /><path d="M12 9c-2-3.5-6-3.5-5.5-1S12 9 12 9zm0 0c2-3.5 6-3.5 5.5-1S12 9 12 9z" /></>,
  mega: <><path d="M4 10v4h3l7 4V6L7 10z" /><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  up: <path d="m6 14 6-6 6 6" />,
  down: <path d="m6 10 6 6 6-6" />,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V6a1 1 0 0 1 1-1h9" /></>,
  heart: <path d="M12 19s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.5C19 14.6 12 19 12 19z" />,
};
export function Icon({ name, size }: { name: keyof typeof PATHS | string; size?: number }) {
  return <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size } : undefined}>{PATHS[name]}</svg>;
}
export function Mark() {
  return (
    <span className="mark"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.2" fill="#fff" /><rect x="9" y="2" width="5" height="5" rx="2.5" fill="#fff" opacity=".55" /><rect x="2" y="9" width="12" height="5" rx="1.2" fill="#fff" opacity=".8" /></svg></span>
  );
}

// ---------- 小部件 ----------
export function Face({ user, size }: { user: User; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`face${size ? ` ${size}` : ''}`} style={{ background: user.color }} title={user.name}>{user.name[0]}</span>;
}
export function StatusChip({ task }: { task: TaskInstance }) {
  if (isOverdue(task)) return <span className="chip due">已逾期</span>;
  const cls = { todo: 'plain', doing: 'warn', submitted: 'acc', revise: 'due', passed: 'ok' }[task.status];
  return <span className={`chip ${cls}`}>{STATUS_LABEL[task.status]}</span>;
}
export function GradeChip({ grade }: { grade: Grade }) {
  return <span className={`chip ${grade === '需改进' ? 'due' : 'ok'}`}>{grade}</span>;
}
export function Ring({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const c = 2 * Math.PI * 56;
  return (
    <div className="ring">
      <svg viewBox="0 0 132 132" aria-hidden="true"><circle className="tr" cx="66" cy="66" r="56" /><circle className="fg" cx="66" cy="66" r="56" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} /></svg>
      <div className="c"><b className="num">{label}</b><span>{sub}</span></div>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

// ---------- 演示视角（原型用；正式版按登录身份决定，管理员才可预览其他视角） ----------
type Session = { role: Role; me: User; setRole: (r: Role) => void };
const SessionCtx = createContext<Session | null>(null);
const KEY = 'trainee-hub:demo-role';
function readRole(): Role {
  try { const r = localStorage.getItem(KEY); if (r === 'trainee' || r === 'mentor' || r === 'admin' || r === 'colleague') return r; } catch { /* 存储不可用时用默认 */ }
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

/** 复制：剪贴板不可用时提示手动复制 */
export function CopyBox({ text, label = '复制' }: { text: string; label?: string }) {
  const say = useToast();
  const ref = useRef<HTMLElement>(null);
  const copy = () => {
    const done = () => say('已复制');
    const fail = () => { const r = document.createRange(); if (ref.current) { r.selectNodeContents(ref.current); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); } say('无法直接复制，已选中，请按 ⌘C'); };
    try { navigator.clipboard.writeText(text).then(done, fail); } catch { fail(); }
  };
  return <div className="cp"><code ref={ref}>{text}</code><button type="button" onClick={copy}>{label}</button></div>;
}
