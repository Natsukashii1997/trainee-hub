// A 级页面的查询入口（PRD 8.4、10.2、第 11 节；issue #42）：GET /api/views/…
// 全部直接查事实对象，不存副本；每个查询都先过统一授权入口（shared.ts 的 need），列表用 readScope 裁剪。
import type { Actor } from '../authorize.ts';
import { path, profile, taskDetail, timeline } from './growth.ts';
import { milestoneDetail, projectDetail, projectList } from './projects.ts';
import { type Db, notFound } from './shared.ts';
import { dashboard, home, todo } from './work.ts';

type View = (db: Db, actor: Actor, ...params: string[]) => Promise<unknown>;

/** 路由表：路径（去掉 /api/views/ 前缀）→ 查询 */
const ROUTES: [RegExp, View][] = [
  [/^home$/, home],
  [/^todo$/, todo],
  [/^dashboard$/, dashboard],
  [/^projects$/, projectList],
  [/^projects\/([^/]+)$/, projectDetail],
  [/^milestones\/([^/]+)$/, milestoneDetail],
  [/^path$/, (db, actor) => path(db, actor, actor.id)],
  [/^path\/([^/]+)$/, path],
  [/^tasks\/([^/]+)$/, taskDetail],
  [/^people\/([^/]+)$/, profile],
  [/^people\/([^/]+)\/timeline$/, timeline],
];

/** 执行一个查询；没有这个查询时抛 404 */
export async function runView(db: Db, actor: Actor, route: string): Promise<unknown> {
  for (const [pattern, view] of ROUTES) {
    const m = pattern.exec(route);
    if (m) return view(db, actor, ...m.slice(1).map(decodeURIComponent));
  }
  throw notFound('查询');
}
