import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Avatar, Empty, Icon, Mark, Segmented, useSession, useToast, type Domain, type IconName } from './ui';
import { HealthStatus } from './Health';
import { listAssets, myWeek, pendingReviews, tasksOf, todosOf, trainees, useDataVersion, userById } from '../data/api';
import type { Role } from '../data/types';
import { ROLE_LABEL } from '../data/types';

/* 应用外壳（V3「柔光」）：左侧玻璃侧栏 + 右侧主区。顶栏由各页面通过 <Sheet> 渲染（面包屑、演示视角、日程、待办、通知、主按钮）。
   PRD v1.1 第 3 节：一级导航 6 个；「日程」「待办」是顶栏切面，不进侧栏。 */

const growthHome = (r: Role) => (r === 'trainee' ? '/growth/me' : r === 'colleague' ? '/growth/path' : '/growth/board');
const base = (to: string) => to.split(/[?#]/)[0];

type Item = { to: string; icon: IconName; label: string; domain?: Domain; extra?: ReactNode; dim?: boolean; match?: string };
type Group = { title: string; sub?: boolean; items: Item[] };

/** 外壳上的计数：待办 = 本人未关闭的待办（含抄送）；日程 = 今天落在本人日程上的项数（管培生）；其余为侧栏小计数。 */
function useCounts() {
  useDataVersion();
  const { role, me } = useSession();
  const todo = todosOf(me.id).length;
  let schedule = 0;
  if (role === 'trainee') {
    try { schedule = myWeek(me.id).days.find(d => d.isToday)?.items.length ?? 0; } catch { schedule = 0; }
  }
  const pendingAssets = listAssets({ status: 'pending' }).length;
  const toReview = role === 'mentor' || role === 'admin' ? pendingReviews(me).length : 0;
  const mine = tasksOf(me.id);
  const submitted = mine.filter(t => t.status === 'submitted' || t.status === 'passed').length;
  const fav = listAssets().filter(a => a.favBy.includes(me.id)).length;
  return { todo, schedule, toReview, pendingAssets, submitted, fav };
}

function Sidebar() {
  const { role, me } = useSession();
  const { pathname } = useLocation();
  const say = useToast();
  const c = useCounts();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); say('全局搜索在二期上线'); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [say]);

  const main: Item[] = [
    { to: '/', icon: 'home', label: '首页', domain: 'acc' },
    { to: growthHome(role), icon: 'grow', label: '成长', domain: 'grow', match: '/growth' },
    { to: '/knowledge', icon: 'book', label: '知识', dim: true, extra: <span className="tag">二期</span> },
    { to: '/ai', icon: 'spark', label: 'AI', domain: 'ai', match: '/ai', extra: <span className="tag new">新 2</span> },
    { to: '/team', icon: 'team', label: '团队', domain: 'team', match: '/team' },
    { to: '/incentive', icon: 'award', label: '激励', dim: true, extra: <span className="tag">三期</span> },
  ];
  const cnt = (n: number, hot?: boolean) => (n ? <span className={hot ? 'cnt hot' : 'cnt'}>{n}</span> : null);
  const groups: Record<Role, Group[]> = {
    trainee: [{ title: '我的', items: [
      { to: `/team/${me.id}`, icon: 'user', label: '我的档案' },
      { to: '/growth/me', icon: 'inbox', label: '我的提交', extra: cnt(c.submitted) },
      { to: '/ai/assets?fav=1', icon: 'star', label: '收藏', extra: cnt(c.fav) },
    ] }],
    mentor: [{ title: '带教', items: [
      { to: '/growth/board', icon: 'team', label: '我带的人' },
      { to: '/growth/board#review', icon: 'pen', label: '待点评', extra: cnt(c.toReview, true) },
      { to: `/team/${me.id}`, icon: 'spark', label: '我贡献的资产' },
    ] }],
    admin: [
      { title: '待处理', sub: true, items: [
        { to: '/admin/review', icon: 'shield', label: '审核队列', extra: cnt(c.pendingAssets, true) },
      ] },
      { title: '期次与排期', sub: true, items: [
        { to: '/admin/members', icon: 'user', label: '成员与角色' },
        { to: '/admin/cohort', icon: 'flag', label: '期次与启动' },
        { to: '/admin/rotation', icon: 'swap', label: '轮岗排期' },
        { to: '/admin/calendar', icon: 'cal', label: '工作日日历' },
      ] },
      { title: '路径', sub: true, items: [
        { to: '/admin/path', icon: 'route', label: '路径模板' },
        { to: '/admin/rules', icon: 'repeat', label: '周期任务规则' },
      ] },
      { title: '内容与系统', sub: true, items: [
        { to: '/admin/soon', icon: 'gear', label: '公告与系统设置', dim: true, extra: <span className="tag">二期</span> },
      ] },
    ],
    colleague: [{ title: '我的', items: [
      { to: `/team/${me.id}`, icon: 'user', label: '我的档案' },
      { to: '/ai/assets?fav=1', icon: 'star', label: '收藏', extra: cnt(c.fav) },
    ] }],
  };
  const isOn = (n: Item) => (n.to === '/' ? pathname === '/' : n.match ? pathname.startsWith(n.match) : pathname === base(n.to));
  const link = (n: Item) => (
    <NavLink key={n.label} to={n.to} end className={() => [isOn(n) ? 'on' : '', n.dim ? 'dim' : ''].join(' ').trim()} aria-current={isOn(n) ? 'page' : undefined}>
      <span className={`t ${n.domain ? `d-${n.domain}` : 'd-week'}`}><Icon name={n.icon} /></span>{n.label}{n.extra}
    </NavLink>
  );
  const mentor = me.mentorId ? userById(me.mentorId) : null;
  return (
    <aside className="side" aria-label="主导航">
      <Link to="/" className="brand"><Mark /><div><b>管培生工作台</b><small>TRAINEE HUB</small></div></Link>
      <div className="cohort"><span className="dot" aria-hidden="true" />2026 秋季班<span>{trainees().length} 人</span></div>
      <button className="srch" type="button" onClick={() => say('全局搜索在二期上线')}><Icon name="search" />搜索<kbd>⌘K</kbd></button>
      <div className="side-scroll">
        <nav className="nav" aria-label="一级导航">{main.map(link)}</nav>
        {role === 'admin' && <div className="grp">管理后台</div>}
        {groups[role].map(g => (
          <div key={g.title}>
            <div className={g.sub ? 'grp sm' : 'grp'}>{g.title}</div>
            <nav className={g.sub ? 'nav sub' : 'nav'} style={{ marginTop: 0 }} aria-label={g.title}>{g.items.map(link)}</nav>
          </div>
        ))}
      </div>
      <Link className="me" to={`/team/${me.id}`}>
        <Avatar name={me.name} color={me.color} />
        <span><b>{me.name}</b><small>{ROLE_LABEL[me.role]}{mentor ? ` · 带教 ${mentor.name}` : me.line ? ` · ${me.line}` : ''}</small></span>
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

export function AppLayout() {
  return <div className="app"><Sidebar /><PageFrame><Outlet /></PageFrame><HealthStatus /></div>;
}

/** 各角色的默认主按钮 */
function DefaultAction({ role }: { role: Role }) {
  const a: Record<Role, { to: string; icon: IconName; label: string }> = {
    trainee: { to: '/growth/me', icon: 'upload', label: '提交产出' },
    mentor: { to: '/growth/board#review', icon: 'pen', label: '去点评' },
    admin: { to: '/admin/review', icon: 'shield', label: '处理审核' },
    colleague: { to: '/ai/submit', icon: 'spark', label: '提交资产' },
  };
  const x = a[role];
  return <Link className="btn pri" to={x.to}><Icon name={x.icon} />{x.label}</Link>;
}

export type Crumb = { label: string; to?: string };
/** 主区：顶栏（面包屑、演示视角、日程、待办、通知、主按钮）+ 可选二级标签 + 内容。
 *  action 不传时用角色默认主按钮；传 null 不显示主按钮。 */
export function Sheet({ crumbs, tabs, action, children }: { crumbs: Crumb[]; tabs?: { to: string; label: string; tag?: string }[]; action?: ReactNode; children: ReactNode }) {
  const { role, setRole } = useSession();
  const say = useToast();
  const { pathname } = useLocation();
  const c = useCounts();
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
        <Segmented<Role>
          label="演示视角"
          value={role}
          onChange={setRole}
          options={(['trainee', 'mentor', 'admin', 'colleague'] as Role[]).map(r => ({ value: r, label: ROLE_LABEL[r] }))}
        />
        <Link to="/schedule" className={pathname.startsWith('/schedule') ? 'tbtn on' : 'tbtn'} aria-label={`日程，今天 ${c.schedule} 项`}>
          <Icon name="cal" />日程{c.schedule > 0 && <span className="n">{c.schedule}</span>}
        </Link>
        <Link to="/todo" className={pathname.startsWith('/todo') ? 'tbtn on' : 'tbtn'} aria-label={`待办，${c.todo} 项`}>
          <Icon name="todo" />待办<span className={c.todo ? 'n hot' : 'n'}>{c.todo}</span>
        </Link>
        <button className="ibtn" type="button" aria-label="通知（有未读）" onClick={() => say('通知中心在二期上线')}><Icon name="bell" /><span className="badge" aria-hidden="true" /></button>
        {action === undefined ? <DefaultAction role={role} /> : action}
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
