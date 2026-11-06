import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import { Avatar, AvatarStack, CardHead, CopyBox, DomainTag, Empty, Icon, MetaPill, PageHead, Segmented, StatusPill, Tile, useSession, useToast, type IconName } from '../components/ui';
import * as api from '../data/api';
import type { Asset, AssetType } from '../data/types';
import { fmtDate, fmtDateTime } from '../lib/time';

/* AI（PRD 6）：AI 首页（Tidings 入口 + 内部精选）、资产库、资产详情、提交资产。AI 领域色只用于小面积。 */

const TABS = [{ to: '/ai', label: 'AI 首页' }, { to: '/ai/assets', label: '资产库' }, { to: '/ai/submit', label: '提交资产' }];
const TYPE_ICON: Record<AssetType, IconName> = { Skill: 'spark', Prompt: 'pen', 工作流: 'route', 用例: 'q' };
const TYPE_DESC: Record<AssetType, string> = { Skill: '装进 Claude Code / Codex 的技能', Prompt: '复制就能用的提示词', 工作流: '多步骤的做事方法、SOP', 用例: '「我用 AI 解决了什么」' };
const TIDINGS = 'https://tidings.natsukashii.cn';

function AISheet({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Sheet crumbs={[{ label: 'AI', to: '/ai' }, { label: title }]} tabs={TABS} action={action === undefined ? <Link className="btn pri" to="/ai/submit"><Icon name="plus" />提交资产</Link> : action}>
      <style>{CSS}</style>
      {children}
    </Sheet>
  );
}
const usersOf = (ids: string[]) => ids.map(id => api.findUser(id)).filter((u): u is NonNullable<typeof u> => !!u);

/** 资产卡 */
function AssetCard({ a, className = 's4' }: { a: Asset; className?: string }) {
  const { me } = useSession();
  const author = api.userById(a.authorId);
  const fav = a.favBy.includes(me.id);
  return (
    <Link className={`card link ai-card ${className}`} to={`/ai/assets/${a.id}`}>
      <div className="row">
        <Tile icon={TYPE_ICON[a.type]} domain="ai" />
        <span className="ai-type">{a.type}</span>
        <span className="ai-ver mono">{a.version}</span>
      </div>
      <h3>{a.title}</h3>
      <p>{a.summary}</p>
      <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 10 }}>{a.tags.slice(0, 3).map(t => <span key={t} className="typ">{t}</span>)}</div>
      <div className="ai-ft">
        <span className="row" style={{ gap: 6 }}><Avatar name={author.name} color={author.color} size="sm" />{author.name}</span>
        <span className="row" style={{ gap: 10, marginLeft: 'auto' }}>
          {fav && <span className="ai-fav" title="已收藏"><Icon name="bm" size={13} /></span>}
          <span><b className="num">{api.uses(a)}</b> 人用过</span>
        </span>
      </div>
    </Link>
  );
}

// =====================================================================
// AI 首页：内部精选 + Tidings 入口
// =====================================================================
export function AIHome() {
  api.useDataVersion();
  const live = api.listAssets();
  const [top, ...rest] = live;
  const lb = api.leaderboard().slice(0, 4);
  const fresh = api.newAssetsThisMonth().length;
  const author = top ? api.userById(top.authorId) : null;
  const users = top ? usersOf(top.usedBy) : [];

  return (
    <AISheet title="AI 首页">
      <PageHead
        kicker={<>团队 AI 资产<i aria-hidden="true" />{live.length} 个已上架</>}
        title={<>把好用的方法<em>沉淀下来</em>，让下一个人少走弯路</>}
        sub="内部资产由团队成员贡献、管理员审核后上架，可以收藏、标记「我用过」。外部的 Skill 和热门项目去 Tidings 找。"
        right={<><MetaPill>本月新上架 <b>{fresh}</b></MetaPill><MetaPill>被同事用过 <b>{api.assetNonAuthorUsers()}</b> 人</MetaPill></>}
      />
      <div className="bento">
        {top && author && (
          <section className="reco s8 stretch ai-hero" aria-label="内部精选">
            <div className="r1"><span className="tile"><Icon name="spark" /></span>内部精选 · 用得最多<span className="for">适合<b>{top.tags.join('、')}</b></span></div>
            <div className="row" style={{ alignItems: 'flex-end', gap: 24 }}>
              <div className="grow1">
                <h2>{top.title}<span className="kbd">{top.type.toUpperCase()}</span></h2>
                <p>{top.summary}</p>
              </div>
              <div className="ai-hero-side">
                <div className="row" style={{ fontSize: 12, color: '#C9CCE0' }}><Avatar name={author.name} color={author.color} solid size="sm" />作者 <b style={{ color: '#fff', fontWeight: 500 }}>{author.name}</b></div>
                <div className="row"><span className="bignum">{api.uses(top)}</span><small style={{ fontSize: 12, color: '#C9CCE0' }}>人用过</small>{users.length > 0 && <span style={{ marginLeft: 'auto' }}><AvatarStack people={users.map(u => ({ name: u.name, color: u.color }))} /></span>}</div>
              </div>
            </div>
            <div className="how">用法：{top.usage}</div>
            {top.installCmd ? <CopyBox text={top.installCmd} label="复制安装指令" /> : top.content ? <CopyBox text={top.content} label="复制全文" /> : null}
            {top.example && (
              <div className="ai-hero-ex">
                <div><span>示例输入</span>{top.example.input}</div>
                <Icon name="right" />
                <div><span>输出</span>{top.example.output}</div>
              </div>
            )}
            <Link className="ai-more" to={`/ai/assets/${top.id}`}>看完整说明<Icon name="right" /></Link>
          </section>
        )}

        <section className="card s4 stretch ai-tid" aria-label="外部发现">
          <div className="row"><Tile icon="ext" domain="ai" size="lg" /><span className="grow1"><b className="ai-tid-k">外部发现</b><small className="muted">只做跳转，不做数据打通</small></span></div>
          <h3>Tidings</h3>
          <p>每天更新的 GitHub 涨星榜、Skill 历史榜和 AI 日报。看到好用的，复制安装指令就能用；觉得团队也该有，就提交成内部资产。</p>
          <div className="ai-tid-list">
            <span><Icon name="trend" />GitHub 涨星榜</span>
            <span><Icon name="star" />Skill 历史榜</span>
            <span><Icon name="doc" />AI 日报</span>
          </div>
          <a className="btn dark full" href={TIDINGS} target="_blank" rel="noopener noreferrer">前往 Tidings<Icon name="ext" /></a>
        </section>

        {rest.length > 0 && <>
          <div className="s12 ai-sec"><h2>更多精选</h2><span className="muted">按使用人数排序</span><Link className="go" to="/ai/assets">全部 {live.length} 个<Icon name="right" /></Link></div>
          {rest.slice(0, 3).map(a => <AssetCard key={a.id} a={a} />)}
        </>}

        <section className="card s4 stretch" aria-label="按类型">
          <CardHead title="按类型" sub="四类" />
          <div className="list">
            {api.ASSET_TYPES.map(t => (
              <Link className="li" key={t} to={`/ai/assets?type=${encodeURIComponent(t)}`}>
                <span className="di d-ai"><Icon name={TYPE_ICON[t]} /></span>
                <span className="tx"><b>{t}</b><span>{TYPE_DESC[t]}</span></span>
                <span className="end">{api.listAssets({ type: t }).length}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="card s4 stretch" aria-label="贡献最多">
          <CardHead title="贡献最多" sub="上架资产与分享会主讲" />
          {lb.length ? (
            <div className="ai-lb">
              {lb.map((x, i) => (
                <Link key={x.user.id} to={`/team/${x.user.id}`} className="ai-lb-r">
                  <span className={i === 0 ? 'n top num' : 'n num'}>{i + 1}</span>
                  <Avatar name={x.user.name} color={x.user.color} size="sm" />
                  <span className="grow1">{x.user.name}</span>
                  <b className="num">{x.count}</b><small>条</small>
                </Link>
              ))}
            </div>
          ) : <Empty icon="award" title="还没有贡献" />}
          <p className="ai-note"><Icon name="info" size={12} />积分和月榜在三期上线，贡献从一期起就在记。</p>
        </section>
        <section className="card s4 flat stretch ai-later" aria-label="之后上线">
          <CardHead title="之后上线"><StatusPill tone="plain">三期</StatusPill></CardHead>
          <div className="stack" style={{ gap: 8, marginTop: 12 }}>
            <div className="ai-later-i"><Tile icon="route" domain="week" /><span><b>AI 学习路径</b><small>使用 AI 的四个层级、工具矩阵和练习任务</small></span></div>
            <div className="ai-later-i"><Tile icon="grid" domain="week" /><span><b>用例墙</b><small>「我用 AI 解决了什么」，按岗位浏览</small></span></div>
          </div>
        </section>
      </div>
    </AISheet>
  );
}

// =====================================================================
// 资产库：类型、标签、收藏筛选 + 搜索
// =====================================================================
export function AssetLibrary() {
  api.useDataVersion();
  const { me } = useSession();
  const [sp, setSp] = useSearchParams();
  const type = (sp.get('type') ?? '') as AssetType | '';
  const tag = sp.get('tag') ?? '';
  const fav = sp.get('fav') === '1';
  const [q, setQ] = useState('');
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  let list = api.listAssets({ type, tag, q });
  if (fav) list = list.filter(a => a.favBy.includes(me.id));
  const total = api.listAssets().length;
  const filtered = !!(type || tag || fav || q.trim());

  return (
    <AISheet title="资产库">
      <PageHead
        kicker={<>AI<i aria-hidden="true" />只显示已上架的</>}
        title={fav ? <>我收藏的 <em>{list.length}</em> 个资产</> : <>AI 资产库 · <em>{total}</em> 个</>}
        sub="按使用人数排序。点开看用法、示例和安装指令；用过记得点「我用过」，作者会收到这份反馈。"
        right={<label className="ai-search"><Icon name="search" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="搜标题或说明" aria-label="搜索资产" />{q && <button type="button" aria-label="清空" onClick={() => setQ('')}><Icon name="x" /></button>}</label>}
      />
      <div className="card tight ai-filter">
        <Segmented value={type || 'all'} onChange={v => set('type', v === 'all' ? '' : v)} options={[{ value: 'all', label: '全部类型' }, ...api.ASSET_TYPES.map(t => ({ value: t, label: t }))]} />
        <span className="ai-div" />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', flex: 1 }}>
          {api.ASSET_TAGS.map(t => <button type="button" key={t} className={tag === t ? 'tag on' : 'tag'} onClick={() => set('tag', tag === t ? '' : t)}>{t}</button>)}
        </div>
        <button type="button" className={fav ? 'tag on' : 'tag'} onClick={() => set('fav', fav ? '' : '1')}><Icon name="bm" size={13} />只看我收藏的</button>
      </div>
      {filtered && <div className="ai-count">找到 <b className="num">{list.length}</b> 个{filtered && <button type="button" className="go" onClick={() => { setQ(''); setSp(new URLSearchParams(), { replace: true }); }}>清空筛选</button>}</div>}
      {list.length ? (
        <div className="bento" style={{ marginTop: filtered ? 8 : 12 }}>{list.map(a => <AssetCard key={a.id} a={a} />)}</div>
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          <Empty size="lg" icon="search" title={fav ? '还没有收藏' : '没有符合条件的资产'} action={<Link to="/ai/submit" className="btn sec sm"><Icon name="plus" />提交一个</Link>}>{fav ? '在资产详情里点「收藏」，之后在这里找。' : '换个标签或关键词；团队里还没有的话，欢迎贡献一个。'}</Empty>
        </div>
      )}
    </AISheet>
  );
}

// =====================================================================
// 资产详情：怎么用（安装指令复制）、示例、全文、收藏、我用过
// =====================================================================
export function AssetDetail() {
  api.useDataVersion();
  const { id = '' } = useParams();
  const { me } = useSession();
  const say = useToast();
  const a = api.assetById(id);
  if (!a || (a.status !== 'live' && me.role !== 'admin' && me.id !== a.authorId)) {
    return <AISheet title="资产详情"><div className="card"><Empty size="lg" icon="spark" title="找不到这个资产，或它还没上架" action={<Link className="btn sec sm" to="/ai/assets">回到资产库</Link>}>待审核和已退回的资产只有作者和管理员看得到。</Empty></div></AISheet>;
  }
  const author = api.userById(a.authorId);
  const faved = a.favBy.includes(me.id), used = a.usedBy.includes(me.id);
  const linked = api.tasksUsingAsset(a.id);
  const users = usersOf(a.usedBy);
  const toggle = (fn: () => void, msg: string) => { try { fn(); say(msg); } catch (e) { say(e instanceof Error ? e.message : String(e)); } };

  return (
    <AISheet title={a.title}>
      <section className="ai-head">
        <div className="grow1">
          <div className="row" style={{ gap: 8 }}>
            <Tile icon={TYPE_ICON[a.type]} domain="ai" size="lg" />
            <DomainTag domain="ai">{a.type}</DomainTag>
            {a.tags.map(t => <Link key={t} className="typ" to={`/ai/assets?tag=${encodeURIComponent(t)}`}>{t}</Link>)}
            {a.status === 'pending' && <StatusPill tone="info">待审核</StatusPill>}
            {a.status === 'returned' && <StatusPill tone="warn">已退回</StatusPill>}
          </div>
          <h1>{a.title}</h1>
          <p>{a.summary}</p>
        </div>
        {a.status === 'live' && (
          <div className="row" style={{ gap: 8, flex: 'none' }}>
            <button className={faved ? 'btn sec ai-on' : 'btn sec'} type="button" aria-pressed={faved} onClick={() => toggle(() => api.toggleFav(a.id, me), faved ? '已取消收藏' : '已收藏，在「资产库 · 只看我收藏的」里找')}><Icon name="bm" />{faved ? '已收藏' : '收藏'}</button>
            <button className={used ? 'btn sec ai-on' : 'btn pri'} type="button" aria-pressed={used} onClick={() => toggle(() => api.toggleUsed(a.id, me), used ? '已撤销「我用过」' : `已记为用过，${author.name}会看到这份反馈`)}><Icon name="check" />{used ? '我用过了' : '我用过'}</button>
          </div>
        )}
      </section>

      {a.status === 'returned' && <div className="note warn" style={{ marginTop: 16 }}><Icon name="alert" /><span><b>管理员退回了这个资产：</b>{a.returnReason}。按意见修改后可以重新提交。</span></div>}
      {a.status === 'pending' && <div className="note" style={{ marginTop: 16 }}><Icon name="info" /><span>正在等管理员审核，通过后上架，并记入{author.name}的贡献。</span></div>}

      <div className="bento">
        <div className="s8 stack">
          {a.installCmd ? (
            <section className="card dark ai-install" aria-label="安装">
              <div className="row" style={{ gap: 8, fontSize: 12, color: '#C9CCE0' }}><span className="ai-dtile"><Icon name="spark" /></span>安装到 Claude Code / Codex</div>
              <h2>复制这行，在终端里运行</h2>
              <CopyBox text={a.installCmd} label="复制安装指令" />
              <div className="ai-how"><b>然后：</b>{a.usage}</div>
            </section>
          ) : (
            <section className="card" aria-label="怎么用">
              <CardHead title="怎么用" />
              <p className="ai-body">{a.usage}</p>
              {a.type === 'Prompt' && a.content && <CopyBox text={a.content} label="复制 Prompt" />}
            </section>
          )}
          {a.example && (
            <section className="card" aria-label="示例">
              <CardHead title="示例" sub="输入 → 输出" />
              <div className="ai-ex">
                <div className="well"><span>输入</span>{a.example.input}</div>
                <span className="ai-ex-arrow"><Icon name="right" /></span>
                <div className="well out"><span>输出</span>{a.example.output}</div>
              </div>
            </section>
          )}
          {a.content && (
            <section className="card" aria-label="全文">
              <CardHead title={a.type === 'Skill' ? 'SKILL.md' : a.type === 'Prompt' ? 'Prompt 全文' : '步骤'} sub={`${a.content.split('\n').length} 行`} />
              <pre className="pre" style={{ marginTop: 12 }}>{a.content}</pre>
            </section>
          )}
        </div>
        <div className="s4 stack">
          <section className="card" aria-label="信息">
            <CardHead title="信息" />
            <Link to={`/team/${author.id}`} className="ai-author">
              <Avatar name={author.name} color={author.color} />
              <span className="grow1"><b>{author.name}</b><small>作者 · 已有 {api.contributionsOf(author.id).length} 条贡献</small></span>
              <Icon name="right" />
            </Link>
            <div className="ai-stats">
              <div><b className="num">{api.uses(a)}</b><span>人用过</span></div>
              <div><b className="num">{a.favBy.length}</b><span>人收藏</span></div>
              <div><b className="num">{a.version}</b><span>{fmtDate(a.updatedAt)} 更新</span></div>
            </div>
            {users.length > 0 && <div className="row" style={{ marginTop: 12, gap: 8, fontSize: 12, color: 'var(--mute)' }}><AvatarStack people={users.map(u => ({ name: u.name, color: u.color }))} max={4} />{users.slice(0, 3).map(u => u.name).join('、')}{users.length > 3 ? ` 等 ${users.length} 位同事` : ''}用过</div>}
          </section>
          <section className="card" aria-label="关联的成长任务">
            <CardHead title="关联的成长任务" sub={linked.length ? `${linked.length} 个` : undefined} />
            {linked.length ? (
              <div className="list">
                {linked.map(t => (
                  <div className="li" key={t.id}>
                    <span className="di d-grow"><Icon name="flag" /></span>
                    <span className="tx"><b>{t.name}</b><span>{api.moduleById(t.moduleId).name}岗 · 做这个任务时会推荐它</span></span>
                  </div>
                ))}
              </div>
            ) : <p className="ai-body" style={{ marginTop: 10, color: 'var(--mute)' }}>还没有任务推荐它。管理员可以在路径模板里把它挂到任务上。</p>}
          </section>
        </div>
      </div>
    </AISheet>
  );
}

// =====================================================================
// 提交资产
// =====================================================================
const TEMPLATE_SKILL = '---\nname: \ndescription: \n---\n\n# 标题\n\n';
export function SubmitAsset() {
  api.useDataVersion();
  const { me } = useSession();
  const say = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ type: 'Prompt' as AssetType, title: '', summary: '', tags: [] as string[], usage: '', content: '', installCmd: '', input: '', output: '' });
  const [err, setErr] = useState('');
  const [tried, setTried] = useState(false);
  const set = (k: keyof typeof f, v: string | string[]) => { setF(x => ({ ...x, [k]: v })); setErr(''); };
  const mine = api.assetsBy(me.id).filter(a => a.status !== 'live');
  const skillErr = f.type === 'Skill' && f.content.trim() ? api.validateSkillMd(f.content) : null;
  const miss = (v: string) => tried && !v.trim();

  const submit = () => {
    setTried(true);
    if (!f.title.trim() || !f.summary.trim() || !f.usage.trim()) { setErr('标题、一句话说明、使用方法都要填'); return; }
    if (!f.tags.length) { setErr('至少选一个适用标签'); return; }
    try {
      const a = api.submitAsset({ type: f.type, title: f.title.trim(), summary: f.summary.trim(), tags: f.tags, usage: f.usage.trim(), content: f.content || undefined, installCmd: f.installCmd.trim() || undefined, example: f.input && f.output ? { input: f.input, output: f.output } : undefined }, me);
      say('已提交，等管理员审核；通过后上架并记入你的贡献');
      nav(`/ai/assets/${a.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <AISheet title="提交资产" action={null}>
      <PageHead
        kicker={<>AI<i aria-hidden="true" />任何人都可以贡献</>}
        title={<>提交一个 <em>AI 资产</em></>}
        sub="管理员审核通过后上架，并记入你的贡献。Skill 直接粘贴 SKILL.md（开头 YAML 写 name、description），不需要会用 GitHub。"
      />
      <div className="bento">
        <section className="card s8" aria-label="提交表单">
          <div className="stack" style={{ gap: 18 }}>
            <div className="field"><span>类型</span>
              <div className="ai-types">
                {api.ASSET_TYPES.map(t => (
                  <button key={t} type="button" className={f.type === t ? 'on' : ''} aria-pressed={f.type === t} onClick={() => { set('type', t); if (t === 'Skill' && !f.content) set('content', TEMPLATE_SKILL); }}>
                    <Tile icon={TYPE_ICON[t]} domain={f.type === t ? 'ai' : 'week'} /><span><b>{t}</b><small>{TYPE_DESC[t]}</small></span>
                  </button>
                ))}
              </div>
            </div>
            <label className="field"><span>标题<em className="req">*</em></span><input className={miss(f.title) ? 'input err' : 'input'} value={f.title} onChange={e => set('title', e.target.value)} placeholder="例：通话记录归因" /></label>
            <label className="field"><span>一句话说明它解决什么问题<em className="req">*</em></span><input className={miss(f.summary) ? 'input err' : 'input'} value={f.summary} onChange={e => set('summary', e.target.value)} placeholder="例：按问题类型归类一周来电，给出前三大原因和原话样例" /></label>
            <div className="field"><span>适用标签<em className="req">*</em></span>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{api.ASSET_TAGS.map(t => <button type="button" key={t} className={f.tags.includes(t) ? 'tag on' : 'tag'} onClick={() => set('tags', f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t])}>{t}</button>)}</div>
              <small>标签由管理员维护，只能选不能新建。</small>
            </div>
            <label className="field"><span>使用方法<em className="req">*</em></span><textarea className={miss(f.usage) ? 'textarea err' : 'textarea'} style={{ minHeight: 76 }} value={f.usage} onChange={e => set('usage', e.target.value)} placeholder="在哪用、怎么开口说、要准备什么材料" /></label>
            {f.type === 'Skill' && <label className="field"><span>安装指令（选填）</span><input className="input mono" value={f.installCmd} onChange={e => set('installCmd', e.target.value)} placeholder="npx skills add …" /></label>}
            {(f.type === 'Skill' || f.type === 'Prompt' || f.type === '工作流') && (
              <label className="field"><span>{f.type === 'Skill' ? 'SKILL.md' : f.type === 'Prompt' ? 'Prompt 全文' : '步骤'}</span>
                <textarea className={skillErr ? 'textarea mono err' : 'textarea mono'} style={{ minHeight: 180, fontSize: 12.5 }} value={f.content} onChange={e => set('content', e.target.value)} />
                {f.type === 'Skill' && (skillErr ? <small className="errmsg">{skillErr}</small> : f.content.trim() ? <small style={{ color: 'var(--grow-ink)' }}>SKILL.md 格式检查通过</small> : null)}
              </label>
            )}
            <div className="form-grid">
              <label className="field"><span>示例输入（选填）</span><textarea className="textarea" style={{ minHeight: 64 }} value={f.input} onChange={e => set('input', e.target.value)} /></label>
              <label className="field"><span>示例输出（选填）</span><textarea className="textarea" style={{ minHeight: 64 }} value={f.output} onChange={e => set('output', e.target.value)} /></label>
            </div>
          </div>
          {err && <div className="note due" role="alert" style={{ marginTop: 16 }}><Icon name="alert" /><span>{err}</span></div>}
          <div className="row" style={{ marginTop: 20, gap: 8 }}>
            <button className="btn pri" type="button" onClick={submit}><Icon name="upload" />提交审核</button>
            <Link className="btn ghost" to="/ai/assets">取消</Link>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>一般 1–2 个工作日内有结果</span>
          </div>
        </section>
        <div className="s4 stack">
          <section className="card dark ai-check" aria-label="审核看什么">
            <div className="row" style={{ gap: 8, fontSize: 12, color: '#C9CCE0' }}><span className="ai-dtile"><Icon name="shield" /></span>审核看什么</div>
            <ol>
              <li><b>能直接用</b>：别人照着「使用方法」能跑通</li>
              <li><b>说得清楚</b>：一句话说明讲清解决什么问题</li>
              <li><b>没有敏感信息</b>：示例里的家长、学员信息要脱敏</li>
            </ol>
          </section>
          <section className="card" aria-label="我提交的">
            <CardHead title="我提交的" sub="待审核与已退回" />
            {mine.length ? (
              <div className="list">
                {mine.map(a => (
                  <Link className="li" key={a.id} to={`/ai/assets/${a.id}`}>
                    <span className="di d-ai"><Icon name={TYPE_ICON[a.type]} /></span>
                    <span className="tx"><b>{a.title}</b><span>{a.status === 'pending' ? `${fmtDateTime(a.submittedAt)} 提交 · 等审核` : `退回：${a.returnReason}`}</span></span>
                    <span className="end">{a.status === 'pending' ? <StatusPill tone="info">待审核</StatusPill> : <StatusPill tone="warn">已退回</StatusPill>}</span>
                  </Link>
                ))}
              </div>
            ) : <Empty icon="inbox" title="没有在审的提交">提交后会出现在这里，退回的也会写明原因。</Empty>}
          </section>
        </div>
      </div>
    </AISheet>
  );
}

const CSS = `
.ai-card{display:flex;flex-direction:column;padding:18px 18px 14px;min-height:212px}
.ai-type{font-size:12px;color:var(--ai-ink);font-weight:500}
.ai-ver{margin-left:auto;font-size:11px;color:var(--faint)}
.ai-card h3{margin-top:12px;font-size:15px;font-weight:600;letter-spacing:-.005em;line-height:1.35}
.ai-card p{margin-top:6px;font-size:12.5px;line-height:1.65;color:var(--ink2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ai-ft{margin-top:auto;padding-top:12px;display:flex;align-items:center;font-size:12px;color:var(--mute);border-top:1px dashed var(--line2)}
.ai-ft b{color:var(--ink);font-weight:700}
.ai-fav{color:var(--ai);display:inline-flex}
.ai-fav .ico{fill:currentColor}
.ai-hero{min-height:300px}
.ai-hero-ex{margin-top:auto;padding-top:16px;display:grid;grid-template-columns:1fr 16px 1fr;gap:10px;align-items:stretch}
.ai-hero-ex>div{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);font-size:12.5px;line-height:1.65;color:#E4E6F3}
.ai-hero-ex span{display:block;font-size:11px;color:#9EA2BA;margin-bottom:2px}
.ai-hero-ex>.ico{align-self:center;color:#7F84A0}
.ai-hero-side{border-left:1px solid rgba(255,255,255,.1);padding-left:20px;display:grid;gap:10px;width:200px;flex:none}
.ai-more{margin-top:12px;align-self:flex-start;display:inline-flex;align-items:center;gap:2px;font-size:12.5px;color:#C9CCE0;transition:color var(--t)}
.ai-more:hover{color:#fff}
.ai-more .ico{width:13px;height:13px}
.ai-tid{display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(255,255,255,.9) 0%,rgba(255,255,255,.72) 55%,color-mix(in srgb,var(--ai-soft) 70%,transparent) 100%)}
.ai-tid-k{display:block;font-size:12.5px;font-weight:600}
.ai-tid small{display:block;font-size:11.5px}
.ai-tid h3{margin-top:16px;font-size:var(--fs-2xl);font-weight:300;letter-spacing:-.01em}
.ai-tid p{margin-top:8px;font-size:12.5px;line-height:1.75;color:var(--ink2)}
.ai-tid-list{margin:14px 0 16px;display:grid;gap:6px}
.ai-tid-list span{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:8px 10px;border-radius:12px;background:var(--well);box-shadow:0 0 0 1px var(--line)}
.ai-tid-list .ico{color:var(--ai-ink)}
.ai-tid .btn{margin-top:auto}
.ai-sec{display:flex;align-items:baseline;gap:10px;margin-top:8px;padding:0 4px}
.ai-sec h2{font-size:var(--fs-l);font-weight:600}
.ai-sec .muted{font-size:12px}
.ai-sec .go{margin-left:auto}
.ai-lb{margin-top:10px;display:grid;gap:2px}
.ai-lb-r{display:flex;align-items:center;gap:10px;padding:8px 6px;border-radius:12px;font-size:13px;transition:background var(--t)}
.ai-lb-r:hover{background:rgba(255,255,255,.7)}
.ai-lb-r .n{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;font-size:11.5px;font-weight:700;color:var(--mute);background:rgba(21,25,38,.05)}
.ai-lb-r .n.top{background:var(--ai);color:#2A1C00}
.ai-lb-r b{font-size:15px;font-weight:700}
.ai-lb-r small{font-size:11.5px;color:var(--mute)}
.ai-note{margin-top:12px;display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--mute)}
.ai-later-i{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.55)}
.ai-later-i b{display:block;font-size:13px;font-weight:600}
.ai-later-i small{display:block;font-size:11.5px;color:var(--mute);line-height:1.6}
.ai-search{display:flex;align-items:center;gap:8px;width:280px;height:38px;padding:0 10px 0 12px;border-radius:var(--r-md);background:var(--glass-hi);box-shadow:var(--sh);color:var(--mute)}
.ai-search input{flex:1;min-width:0;border:0;background:none;outline:none;font-size:13px;color:var(--ink)}
.ai-search:focus-within{box-shadow:0 0 0 1.5px var(--acc),0 0 0 5px rgba(74,78,216,.14)}
.ai-search button{display:grid;place-items:center;width:22px;height:22px;border-radius:7px;color:var(--mute)}
.ai-search button:hover{background:rgba(21,25,38,.06)}
.ai-filter{margin-top:20px;display:flex;align-items:center;gap:12px;padding:10px 12px}
.ai-div{width:1px;height:22px;background:var(--line2);flex:none}
.ai-count{margin-top:14px;display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--mute);padding:0 4px}
.ai-count b{color:var(--ink)}
.ai-count .go{margin-left:8px}
.ai-head{display:flex;align-items:flex-end;gap:24px}
.ai-head h1{margin-top:14px;font-size:var(--fs-3xl);font-weight:300;letter-spacing:-.01em;line-height:1.2}
.ai-head p{margin-top:6px;font-size:13.5px;color:var(--ink2);line-height:1.7;max-width:680px}
.ai-head a.typ:hover{background:rgba(21,25,38,.09)}
.btn.ai-on{color:var(--ai-ink);box-shadow:0 0 0 1px color-mix(in srgb,var(--ai) 45%,transparent);background:var(--ai-soft)}
.ai-install{padding:20px 22px}
.ai-install h2{margin-top:12px;font-size:var(--fs-xl);font-weight:400}
.ai-dtile{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;background:var(--ai);color:#2A1C00}
.ai-dtile .ico{width:13px;height:13px}
.ai-how{margin-top:14px;font-size:12.5px;line-height:1.75;color:#D3D6E6}
.ai-how b{color:#fff;font-weight:500}
.ai-body{margin-top:10px;font-size:13.5px;line-height:1.8;color:var(--ink2)}
.ai-ex{margin-top:12px;display:grid;grid-template-columns:1fr 28px 1fr;align-items:stretch;gap:6px}
.ai-ex .well{font-size:12.5px;line-height:1.75;color:var(--ink2);padding:12px 14px}
.ai-ex .well span{display:block;font-size:11px;color:var(--mute);margin-bottom:4px}
.ai-ex .well.out{background:color-mix(in srgb,var(--ai-soft) 55%,#fff)}
.ai-ex-arrow{display:grid;place-items:center;color:var(--faint)}
.ai-author{margin-top:12px;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);transition:background var(--t)}
.ai-author:hover{background:#fff}
.ai-author b{display:block;font-weight:600}
.ai-author small{display:block;font-size:11.5px;color:var(--mute)}
.ai-author>.ico{color:var(--faint)}
.ai-stats{margin-top:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ai-stats>div{padding:10px 12px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);display:grid;gap:2px}
.ai-stats b{font-size:18px;font-weight:700;letter-spacing:-.02em}
.ai-stats span{font-size:11px;color:var(--mute)}
.ai-types{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.ai-types button{display:flex;gap:10px;align-items:flex-start;padding:12px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);text-align:left;transition:box-shadow var(--t),background var(--t)}
.ai-types button:hover{background:#fff}
.ai-types button.on{background:#fff;box-shadow:0 0 0 1.5px var(--ai),0 0 0 5px color-mix(in srgb,var(--ai) 14%,transparent)}
.ai-types b{display:block;font-size:13px;font-weight:600}
.ai-types small{display:block;font-size:11px;color:var(--mute);line-height:1.5;margin-top:2px}
.ai-check{padding:18px 20px}
.ai-check ol{margin:12px 0 0;padding-left:18px;display:grid;gap:8px;font-size:12.5px;line-height:1.65;color:#D3D6E6}
.ai-check b{color:#fff;font-weight:500}
`;
