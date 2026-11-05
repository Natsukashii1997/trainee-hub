import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Face, Icon, Mark, useSession, useToast } from './ui';
import { listAssets, pendingReviews, tasksOf, isOpen, useDataVersion, userById, weekTasksOf } from '../data/api';
import type { Role } from '../data/types';
import { ROLE_LABEL } from '../data/types';

const growthHome = (r: Role) => (r === 'trainee' ? '/growth/me' : r === 'colleague' ? '/growth/path' : '/growth/board');

function Sidebar() {
  useDataVersion();
  const { role, me } = useSession();
  const { pathname } = useLocation();
  const say = useToast();
  const pendingAssets = listAssets({ status: 'pending' }).length;
  const toReview = role === 'mentor' || role === 'admin' ? pendingReviews(me).length : 0;
  const openWeek = role === 'trainee' ? weekTasksOf(me.id).filter(isOpen).length : 0;
  const myFav = listAssets().filter(a => a.favBy.includes(me.id)).length;
  const submitted = tasksOf(me.id).filter(t => t.status === 'submitted' || t.status === 'passed').length;

  const main = [
    { to: '/', icon: 'home', label: '首页', end: true },
    { to: growthHome(role), icon: 'grow', label: '成长', match: '/growth', extra: openWeek ? <span className="cnt">{openWeek}</span> : null },
    { to: '/knowledge', icon: 'book', label: '知识', extra: <span className="soon">二期</span> },
    { to: '/ai', icon: 'spark', label: 'AI', match: '/ai', extra: <span className="new">新 2</span> },
    { to: '/team', icon: 'team', label: '团队', match: '/team' },
    { to: '/incentive', icon: 'star', label: '激励', extra: <span className="soon">三期</span> },
  ];
  const groups: Record<Role, { title: string; items: { to: string; icon: string; label: string; extra?: ReactNode }[] }> = {
    trainee: { title: '我的', items: [
      { to: `/team/${me.id}`, icon: 'user', label: '我的档案' },
      { to: '/growth/me', icon: 'inbox', label: '我的提交', extra: <span className="cnt">{submitted}</span> },
      { to: '/ai/assets?fav=1', icon: 'bm', label: '收藏', extra: myFav ? <span className="cnt">{myFav}</span> : null },
    ] },
    mentor: { title: '带教', items: [
      { to: '/growth/board', icon: 'team', label: '我带的人' },
      { to: '/growth/board#review', icon: 'pen', label: '待点评', extra: toReview ? <span className="cnt hot">{toReview}</span> : null },
      { to: `/team/${me.id}`, icon: 'spark', label: '我贡献的资产' },
    ] },
    admin: { title: '管理后台', items: [
      { to: '/admin/review', icon: 'shield', label: '审核队列', extra: pendingAssets ? <span className="cnt hot">{pendingAssets}</span> : null },
      { to: '/admin/members', icon: 'user', label: '成员与角色' },
      { to: '/admin/path', icon: 'route', label: '路径模板' },
      { to: '/admin/assign', icon: 'cal', label: '个人路径分配' },
      { to: '/admin/soon', icon: 'mega', label: '公告发布', extra: <span className="soon">二期</span> },
      { to: '/admin/soon', icon: 'gift', label: '积分与兑换', extra: <span className="soon">三期</span> },
    ] },
    colleague: { title: '我的', items: [
      { to: `/team/${me.id}`, icon: 'user', label: '我的档案' },
      { to: '/ai/assets?fav=1', icon: 'bm', label: '收藏' },
    ] },
  };
  const g = groups[role];
  return (
    <aside className="side">
      <div className="brand"><Mark /><div><b>管培生工作台</b><span>TRAINEE HUB</span></div></div>
      <div className="ws"><div><b>2026 秋季班</b>　<span>6 人</span></div><Icon name="chev" /></div>
      <button className="srch" type="button" onClick={() => say('全局搜索在二期上线')}><Icon name="search" />搜索资料、Skill、FAQ<kbd>⌘K</kbd></button>
      <nav className="navs" aria-label="主导航">
        {main.map(n => (
          <NavLink key={n.label} to={n.to} end={n.end} className={() => (n.match ? pathname.startsWith(n.match) : n.end ? pathname === '/' : pathname === n.to) ? 'active' : ''}>
            <Icon name={n.icon} />{n.label}{n.extra}
          </NavLink>
        ))}
      </nav>
      <div className="grp">{g.title}</div>
      <nav className="navs" aria-label={g.title}>
        {g.items.map(n => <Link key={n.label} to={n.to}><Icon name={n.icon} />{n.label}{n.extra}</Link>)}
      </nav>
      <Link className="me" to={`/team/${me.id}`}>
        <Face user={me} />
        <div><b>{me.name}</b><span>{ROLE_LABEL[me.role]}{me.mentorId ? ` · 带教 ${userById(me.mentorId).name}` : me.line ? ` · ${me.line}` : ''}</span></div>
      </Link>
    </aside>
  );
}

export function AppLayout() {
  return <div className="app"><Sidebar /><Outlet /></div>;
}

export type Crumb = { label: string; to?: string };
/** 主面板：顶栏（面包屑、演示视角、通知、主操作）+ 可选二级标签 + 内容 */
export function Sheet({ crumbs, tabs, action, children }: { crumbs: Crumb[]; tabs?: { to: string; label: string }[]; action?: ReactNode; children: ReactNode }) {
  const { role, setRole } = useSession();
  const say = useToast();
  return (
    <main className="sheet">
      <div className="bar">
        <div className="crumb">
          {crumbs.map((c, i) => (
            <span key={c.label} style={{ display: 'contents' }}>
              {i > 0 && <span>/</span>}
              {c.to && i < crumbs.length - 1 ? <Link to={c.to}>{c.label}</Link> : i === crumbs.length - 1 ? <b>{c.label}</b> : <span>{c.label}</span>}
            </span>
          ))}
        </div>
        <div className="r">
          <div className="lens" role="group" aria-label="切换演示视角">
            <span className="lb"><Icon name="eye" />演示视角</span>
            {(['trainee', 'mentor', 'admin', 'colleague'] as Role[]).map(r => (
              <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>{ROLE_LABEL[r]}</button>
            ))}
          </div>
          <button className="ib" type="button" aria-label="通知" onClick={() => say('通知中心在二期上线')}><Icon name="bell" size={18} /><span className="dot" /></button>
          {action}
        </div>
      </div>
      {tabs && (
        <nav className="tabs" aria-label="二级导航">
          {tabs.map(t => <NavLink key={t.to} to={t.to} end>{t.label}</NavLink>)}
        </nav>
      )}
      <div className="content">{children}</div>
    </main>
  );
}
