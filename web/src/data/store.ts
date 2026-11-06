// 内存数据库：原型阶段读写示例数据。接后端时整份换成接口调用，页面只依赖 api.ts 的导出。
import * as seed from './mock';
import type { EventLog, EventType, Todo } from './types';

const clone = <T,>(x: T): T => structuredClone(x);

function fresh() {
  return {
    users: clone(seed.users), cohorts: clone(seed.cohorts), pathTemplates: clone(seed.pathTemplates),
    stages: clone(seed.stages), modules: clone(seed.modules), templates: clone(seed.templates),
    recurringRules: clone(seed.recurringRules), workdays: clone(seed.workdays),
    paths: clone(seed.paths), tasks: clone(seed.tasks), submissions: clone(seed.submissions), reviews: clone(seed.reviews),
    handovers: clone(seed.handovers), teamEvents: clone(seed.teamEvents), assets: clone(seed.assets),
    announcements: clone(seed.announcements), resources: clone(seed.resources), integrations: clone(seed.integrations),
    events: [] as EventLog[], todos: [] as Todo[],
  };
}
export type Db = ReturnType<typeof fresh>;

export const db: Db = fresh();
let nowIso = seed.DEMO_NOW;
let seq = 1000;

/** 当前时间（原型固定为演示时刻；测试可改） */
export const now = () => nowIso;
export function setNowRaw(iso: string) { nowIso = iso; }
export const newId = (p: string) => `${p}-${++seq}`;

/** 恢复示例数据（测试用；页面一般不用） */
export function resetRaw() {
  Object.assign(db, fresh());
  nowIso = seed.DEMO_NOW;
  seq = 1000;
}

/** 追加一条事件（只追加，不改不删）；带去重键的同一键只写一次，返回已有的那条 */
export function logEvent(e: Omit<EventLog, 'id' | 'at'> & { at?: string }): EventLog {
  if (e.dedupKey) {
    const hit = db.events.find(x => x.dedupKey === e.dedupKey);
    if (hit) return hit;
  }
  const ev: EventLog = { ...e, id: newId('ev'), at: e.at ?? now() };
  db.events.push(ev);
  return ev;
}
export const eventsOfType = (type: EventType) => db.events.filter(e => e.type === type);

// ---------- 订阅：数据变了让页面重算 ----------
let version = 0;
const listeners = new Set<() => void>();
export const getVersion = () => version;
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function notify() { version++; listeners.forEach(l => l()); }
