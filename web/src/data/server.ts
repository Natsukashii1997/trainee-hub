// 调后端接口的一层（A 级数据都从这里来）：查询 GET /api/views/…、业务命令 POST /api/commands/:id、演示登录 /api/demo/*。
// 失败时抛 ServerError，message 是后端给的中文原因，页面直接给用户看；status 用来区分没登录（401）、没权限（403）等。
// B 级原型继续读前端示例数据（api.ts 里的其他函数），不调这里。

/** 后端 authorize.ts 的 Actor */
export interface Actor {
  id: string;
  name: string;
  role: 'trainee' | 'mentor';
  isAdmin: boolean;
}

/** 演示模式下可切换的示例身份 */
export interface Identity extends Actor {}

export class ServerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
  } catch {
    throw new ServerError(0, '连不上后端服务，请确认已用 npm run dev:all 启动');
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ServerError(res.status, typeof body.error === 'string' ? body.error : `请求失败（${res.status}）`);
  return body as T;
}

/** 当前登录身份；没登录时抛 401 */
export const fetchMe = () => call<{ me: Actor; demo: boolean }>('/api/me');

/** 演示模式下的示例身份；非演示模式下后端没有这个接口（404） */
export const fetchIdentities = () => call<{ identities: Identity[] }>('/api/demo/identities').then(r => r.identities);

export const demoLogin = (userId: string) => call<{ me: Actor }>('/api/demo/login', { method: 'POST', body: JSON.stringify({ userId }) }).then(r => r.me);

export const demoLogout = () => call<{ ok: boolean }>('/api/demo/logout', { method: 'POST', body: '{}' });

/** A 级查询，如 view('todo')、view('projects/pj-1') */
export const view = <T>(route: string) => call<{ result: T }>(`/api/views/${route}`).then(r => r.result);

/** 业务命令，如 command('C02', { projectId }) */
export const command = <T = Record<string, unknown>>(id: string, input: Record<string, unknown>) =>
  call<{ result: T }>(`/api/commands/${id}`, { method: 'POST', body: JSON.stringify(input) }).then(r => r.result);

/** 待办四类（PRD 第 11 节），顶栏计数用；字段详见后端 views/work.ts */
export interface TodoView {
  toReview: unknown[];
  myActions: unknown[];
  blockersToRespond: unknown[];
  projectsToConfirm: unknown[];
}
export const todoCount = (t: TodoView) => t.toReview.length + t.myActions.length + t.blockersToRespond.length + t.projectsToConfirm.length;
