import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Avatar, Empty, Icon, Mark, useSession, useToast, type Domain, type IconName } from './ui';
import { HealthStatus } from './Health';
import { myWeek } from '../data/api';
import { todoCount, view, type TodoView } from '../data/server';

/* 应用外壳（V3「柔光」）：左侧玻璃侧栏 + 右侧主区。顶栏由各页面通过 <Sheet> 渲染。
   结构按页面清单「全局」G1–G4（PRD 10.1）：四个工作域（工作台、项目实践、培养成长、知识与工具）+ 管理区（只对管理者显示）；
   顶栏：待办（A，带数量）、日程（B）、搜索与通知（C 占位）、演示身份切换（只在演示模式出现）。 */

type Item = { to: string; icon: IconName; label: string; domain?: Domain; extra?: ReactNode; later?: boolean; match?: string };
type Group = { title: string; items: Item[] };

const later = <span className="tag">以后</span>;

/** 待办数：A 级查询「待办四类」（PRD 第 11 节）的条数；路由变化或换身份时重新查 */
function useTodoCount() {
  const { status, actor } = useSession();
  const { pathname } = useLocation();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (status !== 'in') { setN(0); return; }
    let live = true;
    view<TodoView>('todo').then(t => { if (live) setN(todoCount(t)); }, () => { if (live) setN(0); });
    return () => { live = false; };
  }, [status, actor?.id, pathname]);
  return n;
}

/** 日程数（B 级原型，前端示例数据）：今天落在本人日程上的项数，只给管培生 */
function useScheduleCount() {
  const { role, me } = useSession();
  if (role !== 'trainee') return 0;
  try { return myWeek(me.id).days.find(d => d.isToday)?.items.length ?? 0; } catch { return 0; }
}

function groupsFor(role: 'trainee' | 'mentor', isAdmin: boolean, meId: string, todo: number): Group[] {
  const g: Group[] = [
    { title: '工作台', items: [
      { to: '/', icon: 'home', label: '首页', domain: 'acc' },
      { to: '/todo', icon: 'todo', label: '待办', domain: 'acc', extra: todo ? <span className="cnt">{todo}</span> : null },
      { to: '/schedule', icon: 'cal', label: '日程', domain: 'ment', match: '/schedule' },
    ] },
    { title: '项目实践', items: [{ to: '/projects', icon: 'flag', label: '项目', domain: 'acc', match: '/projects' }] },
    { title: '培养成长', items: role === 'trainee'
      ? [
          { to: '/growth/path', icon: 'route', label: '我的路径', domain: 'grow', match: '/growth/path' },
          { to: `/growth/people/${meId}`, icon: 'user', label: '成长档案', domain: 'grow', match: '/growth/people' },
          { to: '/growth/overview', icon: 'layers', label: '路径总览', domain: 'grow' },
        ]
      : [
          { to: '/growth/mentees', icon: 'team', label: '我带的人', domain: 'grow', match: '/growth/mentees' },
          { to: '/growth/overview', icon: 'layers', label: '路径总览', domain: 'grow' },
        ] },
    { title: '知识与工具', items: [
      { to: '/knowledge', icon: 'book', label: '知识与工具', domain: 'ai' },
      { to: '/knowledge/resources', icon: 'doc', label: '知识资料', domain: 'ai', match: '/knowledge/resources' },
      { to: '/knowledge/cases', icon: 'file', label: '业务案例', domain: 'ai', match: '/knowledge/cases' },
      { to: '/knowledge/assets', icon: 'spark', label: 'AI 资产', domain: 'ai', match: '/knowledge/assets' },
      { to: '/knowledge/faq', icon: 'q', label: 'FAQ', later: true, extra: later },
    ] },
  ];
  if (isAdmin) g.push({ title: '管理', items: [
    { to: '/admin/members', icon: 'user', label: '成员与带教' },
    { to: '/admin/competencies', icon: 'star', label: '能力项' },
    { to: '/admin/cohort', icon: 'flag', label: '期次与启动' },
    { to: '/admin/path', icon: 'route', label: '路径模板' },
    { to: '/admin/rules', icon: 'repeat', label: '周期任务规则' },
    { to: '/admin/calendar', icon: 'cal', label: '工作日日历' },
    { to: '/admin/rotation', icon: 'swap', label: '轮岗排期' },
    { to: '/admin/review', icon: 'shield', label: '审核' },
    { to: '/admin/ai', icon: 'spark', label: 'AI 与接入' },
    { to: '/admin/later', icon: 'gear', label: '以后', later: true, extra: later },
  ] });
  return g;
}

function Sidebar() {
  const { actor } = useSession();
  const { pathname } = useLocation();
  const todo = useTodoCount();
  if (!actor) return null;
  const isOn = (n: Item) => (n.to === '/' ? pathname === '/' : n.match ? pathname.startsWith(n.match) : pathname === n.to);
  const link = (n: Item) => (
    <NavLink key={n.to} to={n.to} end className={() => [isOn(n) ? 'on' : '', n.later ? 'dim' : ''].join(' ').trim()} aria-current={isOn(n) ? 'page' : undefined}>
      <span className={`t ${n.domain && !n.later ? `d-${n.domain}` : 'd-week'}`}><Icon name={n.icon} /></span>{n.label}{n.extra}
    </NavLink>
  );
  const roleLabel = actor.role === 'trainee' ? '管培生' : actor.isAdmin ? '带教 · 管理' : '带教';
  const home = actor.role === 'trainee' ? `/growth/people/${actor.id}` : '/growth/mentees';
  return (
    <aside className="side" aria-label="主导航">
      <Link to="/" className="brand"><Mark /><div><b>管培生工作台</b><small>TRAINEE HUB</small></div></Link>
      <div className="side-scroll">
        {groupsFor(actor.role, actor.isAdmin, actor.id, todo).map(g => (
          <div key={g.title}>
            <div className="grp">{g.title}</div>
            <nav className="nav" style={{ marginTop: 0 }} aria-label={g.title}>{g.items.map(link)}</nav>
          </div>
        ))}
      </div>
      <Link className="me" to={home} aria-label={`${actor.name}，${actor.role === 'trainee' ? '进入我的成长档案' : '进入我带的人'}`}>
        <Avatar name={actor.name} />
        <span><b>{actor.name}</b><small>{roleLabel}</small></span>
      </Link>
    </aside>
  );
}

/** 页面级错误边界：页面按需加载，单个页面出错（含模块加载失败）只影响主区，侧栏照常可用 */
class PageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="main">
        <div className="card" style={{ marginTop: 56 }}>
          <Empty size="lg" icon="alert" title="这个页面暂时打不开">{this.state.error.message}</Empty>
        </div>
      </main>
    );
  }
}
/** 套在独立页面（如登录）外面：错误边界 + 按需加载的等待态 */
export function PageFrame({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <PageBoundary key={pathname}><Suspense fallback={<main className="main" aria-busy="true" />}>{children}</Suspense></PageBoundary>;
}

/** 登录后的外壳：没登录（或非演示模式）转去登录页；连不上后端时说明怎么启动 */
export function AppLayout() {
  const { status } = useSession();
  if (status === 'loading') return <div className="app" aria-busy="true" />;
  if (status === 'anon' || status === 'closed') return <Navigate to="/login" replace />;
  if (status === 'offline') {
    return (
      <div className="app" style={{ gridTemplateColumns: '1fr' }}>
        <main className="main">
          <div className="card" style={{ marginTop: 56 }}>
            <Empty size="lg" icon="alert" title="连不上后端服务">
              工作台的数据都来自本机后端。请在项目目录运行 <code>TRAINEE_HUB_DEMO=1 npm run dev:all</code>，再刷新这一页。
            </Empty>
          </div>
        </main>
      </div>
    );
  }
  return <div className="app"><Sidebar /><PageFrame><Outlet /></PageFrame><HealthStatus /></div>;
}

/** 演示身份切换（页面清单 G3）：只在演示模式出现，在示例管培生和示例带教之间切换 */
function IdentitySwitch() {
  const { demo, actor, identities, switchTo } = useSession();
  const say = useToast();
  if (!demo || !actor) return null;
  const label = (i: { role: string; isAdmin: boolean }) => (i.role === 'trainee' ? '管培生' : i.isAdmin ? '带教 · 管理' : '带教');
  return (
    <label className="idsw" title="演示模式：切换示例身份">
      <span>演示身份</span>
      <select
        id="demo-identity"
        value={actor.id}
        onChange={e => { const id = e.target.value; switchTo(id).then(() => say(`已切换为${identities.find(i => i.id === id)?.name ?? ''}`), err => say(err.message)); }}
      >
        {identities.map(i => <option key={i.id} value={i.id}>{i.name}（{label(i)}）</option>)}
      </select>
    </label>
  );
}

export type Crumb = { label: string; to?: string };
/** 主区：顶栏（面包屑、演示身份、日程、待办、搜索与通知占位、主按钮）+ 可选二级标签 + 内容。action 传 null 或不传都不显示主按钮。 */
export function Sheet({ crumbs, tabs, action, children }: { crumbs: Crumb[]; tabs?: { to: string; label: string; tag?: string }[]; action?: ReactNode; children: ReactNode }) {
  const say = useToast();
  const { pathname } = useLocation();
  const todo = useTodoCount();
  const schedule = useScheduleCount();
  const trail: Crumb[] = crumbs[0]?.label === '工作台' ? crumbs : [{ label: '工作台', to: '/' }, ...crumbs];
  return (
    <main className="main">
      <header className="top">
        <nav className="crumb" aria-label="面包屑">
          {trail.map((cr, i) => (
            <span key={`${cr.label}-${i}`} style={{ display: 'contents' }}>
              {i > 0 && <Icon name="right" />}
              {i === trail.length - 1 ? <b aria-current="page">{cr.label}</b> : cr.to ? <Link to={cr.to}>{cr.label}</Link> : <span>{cr.label}</span>}
            </span>
          ))}
        </nav>
        <IdentitySwitch />
        <button className="ibtn" type="button" aria-label="搜索（以后）" title="全局搜索：以后做" onClick={() => say('全局搜索以后做')}><Icon name="search" /></button>
        <Link to="/schedule" className={pathname.startsWith('/schedule') ? 'tbtn on' : 'tbtn'} aria-label={`日程，今天 ${schedule} 项`}>
          <Icon name="cal" />日程{schedule > 0 && <span className="n">{schedule}</span>}
        </Link>
        <Link to="/todo" className={pathname.startsWith('/todo') ? 'tbtn on' : 'tbtn'} aria-label={`待办，${todo} 项`}>
          <Icon name="todo" />待办<span className={todo ? 'n hot' : 'n'}>{todo}</span>
        </Link>
        <button className="ibtn" type="button" aria-label="通知（以后）" title="通知中心：以后做" onClick={() => say('通知中心以后做')}><Icon name="bell" /></button>
        {action ?? null}
      </header>
      {tabs && (
        <nav className="tabs" aria-label="二级导航">
          {tabs.map(t => <NavLink key={t.to} to={t.to} end>{t.label}{t.tag && <span className="tag">{t.tag}</span>}</NavLink>)}
        </nav>
      )}
      <div className="content">{children}</div>
    </main>
  );
}
