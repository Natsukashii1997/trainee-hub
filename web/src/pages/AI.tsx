import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import { CopyBox, Empty, Face, Icon, useSession, useToast } from '../components/ui';
import * as api from '../data/api';
import type { Asset, AssetType } from '../data/types';
import { fmtDate } from '../lib/time';

const TABS = [{ to: '/ai', label: 'AI 首页' }, { to: '/ai/assets', label: '资产库' }, { to: '/ai/submit', label: '提交资产' }];
function AISheet({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <Sheet crumbs={[{ label: 'AI', to: '/ai' }, { label: title }]} tabs={TABS} action={action ?? <Link className="btn pri" to="/ai/submit"><Icon name="plus" />提交资产</Link>}>{children}</Sheet>;
}
function AssetCard({ a }: { a: Asset }) {
  const author = api.userById(a.authorId);
  return (
    <Link className="asset" to={`/ai/assets/${a.id}`}>
      <div className="top"><span className="typ">{a.type}</span><span className="mono" style={{ fontSize: 11.5, color: 'var(--mute)' }}>{a.version}</span></div>
      <h3>{a.title}</h3>
      <p>{a.summary}</p>
      <div className="ft"><span className="who2"><Face user={author} size="sm" />{author.name}</span><span>{api.uses(a)} 人用过</span></div>
    </Link>
  );
}

export function AIHome() {
  api.useDataVersion();
  const top = api.listAssets().slice(0, 3);
  const lb = api.leaderboard().slice(0, 3);
  return (
    <AISheet title="AI 首页">
      <div className="head"><div><div className="dt">团队 AI 资产 · {api.listAssets().length} 个已上架</div><h1>把好用的方法<em>沉淀下来</em>，让下一个人少走弯路</h1><p className="sub">内部资产由团队成员贡献、管理员审核后上架。外部的 Skill 和项目去 Tidings 找。</p></div></div>
      <div className="bento top">
        <div className="card s8"><div className="ch"><h2>团队精选</h2><Link to="/ai/assets">全部资产 →</Link></div><div className="asset-grid" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>{top.map(a => <AssetCard a={a} key={a.id} />)}</div></div>
        <div className="card s4 ai stretch">
          <div className="ch"><h2>外部发现</h2><span>Tidings</span></div>
          <h3>Skill 榜、热门项目与 AI 日报</h3>
          <p>每天更新的 GitHub 涨星榜、Skill 历史榜和 AI 日报。看到好用的，复制安装指令就能用。</p>
          <a className="btn" style={{ marginTop: 18, background: '#fff', color: 'var(--ink)', position: 'relative', zIndex: 1 }} href="https://tidings.natsukashii.cn" target="_blank" rel="noopener noreferrer">前往 Tidings <Icon name="arrow" /></a>
        </div>
        <div className="card s4"><div className="ch"><h2>按类型</h2></div><div className="list">{api.ASSET_TYPES.map(t => <Link className="li" key={t} to={`/ai/assets?type=${encodeURIComponent(t)}`}><span className="di"><Icon name={t === 'Skill' ? 'spark' : t === 'Prompt' ? 'pen' : t === '工作流' ? 'route' : 'q'} /></span><div className="tx"><b>{t}</b><span>{({ Skill: '装进 Claude Code / Codex 的技能', Prompt: '复制就能用的提示词', 工作流: '多步骤的做事方法', 用例: '「我用 AI 解决了什么」' } as Record<string, string>)[t]}</span></div><span className="end">{api.listAssets({ type: t }).length}</span></Link>)}</div></div>
        <div className="card s4"><div className="ch"><h2>贡献最多</h2><span>本月</span></div><div className="list">{lb.map((x, i) => <div className="lr" key={x.user.id}><span className="n">{i + 1}</span><Face user={x.user} size="sm" /><span>{x.user.name}</span><span className="p num">{x.count}</span></div>)}</div></div>
        <div className="card s4 flat"><div className="ch"><h2>AI 学习路径</h2><span className="chip plain">三期</span></div><p style={{ marginTop: 12, fontSize: 13.5, color: 'var(--mute)', lineHeight: 1.75 }}>AI 使用的四个层级、工具矩阵和练习任务，三期上线。用例墙也在三期。</p></div>
      </div>
    </AISheet>
  );
}

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
  return (
    <AISheet title="资产库">
      <div className="ph"><div><h1>AI 资产库</h1><p>按使用人数排序。只显示已上架的资产。</p></div>
        <div className="acts"><input id="asset-q" className="input" style={{ width: 260 }} placeholder="搜索标题或说明" value={q} onChange={e => setQ(e.target.value)} /></div></div>
      <div className="filters" style={{ marginTop: 20 }}>
        <button type="button" className={`tag${!type ? ' on' : ''}`} onClick={() => set('type', '')}>全部类型</button>
        {api.ASSET_TYPES.map(t => <button type="button" key={t} className={`tag${type === t ? ' on' : ''}`} onClick={() => set('type', t)}>{t}</button>)}
        <span style={{ width: 1, height: 18, background: 'var(--line)', margin: '0 6px' }} />
        {api.ASSET_TAGS.map(t => <button type="button" key={t} className={`tag${tag === t ? ' on' : ''}`} onClick={() => set('tag', tag === t ? '' : t)}>{t}</button>)}
        <span style={{ flex: 1 }} />
        <button type="button" className={`tag${fav ? ' on' : ''}`} onClick={() => set('fav', fav ? '' : '1')}>只看我收藏的</button>
      </div>
      {list.length ? <div className="asset-grid">{list.map(a => <AssetCard a={a} key={a.id} />)}</div> : <div className="card" style={{ marginTop: 18 }}><Empty title="没有符合条件的资产">换个筛选条件，或者<Link to="/ai/submit" className="go"> 提交一个</Link>。</Empty></div>}
    </AISheet>
  );
}

export function AssetDetail() {
  api.useDataVersion();
  const { id = '' } = useParams();
  const { me } = useSession();
  const say = useToast();
  const a = api.assetById(id);
  if (!a || (a.status !== 'live' && me.role !== 'admin' && me.id !== a.authorId)) return <AISheet title="资产详情"><Empty title="找不到这个资产，或它还没上架" /></AISheet>;
  const author = api.userById(a.authorId);
  const faved = a.favBy.includes(me.id), used = a.usedBy.includes(me.id);
  const linked = api.tasksUsingAsset(a.id);
  return (
    <AISheet title="资产详情">
      <div className="ph">
        <div>
          <div style={{ display: 'flex', gap: 8 }}><span className="typ">{a.type}</span>{a.tags.map(t => <span className="tag" key={t}>{t}</span>)}{a.status !== 'live' && <span className="chip warn">{a.status === 'pending' ? '待审核' : '已退回'}</span>}</div>
          <h1 style={{ marginTop: 12 }}>{a.title}</h1>
          <p>{a.summary}</p>
        </div>
        <div className="acts">
          <button className="btn sec" type="button" onClick={() => { api.toggleFav(a.id, me); say(faved ? '已取消收藏' : '已收藏'); }}><Icon name="bm" />{faved ? '已收藏' : '收藏'}</button>
          <button className={`btn ${used ? 'sec' : 'pri'}`} type="button" onClick={() => { api.toggleUsed(a.id, me); say(used ? '已撤销' : '已记为用过，谢谢反馈'); }}><Icon name="check" />{used ? '我用过 ✓' : '我用过'}</button>
        </div>
      </div>
      <div className="detail">
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card"><div className="ch"><h2>怎么用</h2></div><p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.75, color: 'var(--ink2)' }}>{a.usage}</p>{a.installCmd && <CopyBox text={a.installCmd} label="复制安装指令" />}{a.type === 'Prompt' && a.content && <CopyBox text={a.content} label="复制 Prompt" />}</div>
          {a.example && <div className="card"><div className="ch"><h2>示例</h2></div><div className="kv" style={{ marginTop: 8 }}><div><span className="k">输入</span><span>{a.example.input}</span></div><div><span className="k">输出</span><span>{a.example.output}</span></div></div></div>}
          {a.content && <div className="card"><div className="ch"><h2>{a.type === 'Skill' ? 'SKILL.md' : '全文'}</h2></div><div className="pre">{a.content}</div></div>}
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card"><div className="ch"><h2>信息</h2></div>
            <div className="kv" style={{ marginTop: 8 }}>
              <div><span className="k">作者</span><Link className="who2" to={`/team/${author.id}`}><Face user={author} size="sm" />{author.name}</Link></div>
              <div><span className="k">版本</span><span className="mono">{a.version}</span></div>
              <div><span className="k">更新</span><span className="mono">{fmtDate(a.updatedAt)}</span></div>
              <div><span className="k">使用</span><span>{api.uses(a)} 人用过 · {a.favBy.length} 人收藏</span></div>
            </div>
          </div>
          <div className="card"><div className="ch"><h2>关联的成长任务</h2></div><div className="list">{linked.length ? linked.map(t => <div className="li" key={t.id}><span className="di"><Icon name="grow" /></span><div className="tx"><b>{t.name}</b><span>{api.moduleById(t.moduleId).name}</span></div></div>) : <Empty title="还没有任务推荐它" />}</div></div>
        </div>
      </div>
    </AISheet>
  );
}

const TEMPLATE_SKILL = '---\nname: \ndescription: \n---\n\n# 标题\n\n';
export function SubmitAsset() {
  api.useDataVersion();
  const { me } = useSession();
  const say = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ type: 'Prompt' as AssetType, title: '', summary: '', tags: [] as string[], usage: '', content: '', installCmd: '', input: '', output: '' });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f, v: string | string[]) => setF(x => ({ ...x, [k]: v }));
  const mine = api.assetsBy(me.id).filter(a => a.status !== 'live');
  const submit = () => {
    if (!f.title.trim() || !f.summary.trim() || !f.usage.trim()) { setErr('标题、一句话说明、使用方法都要填'); return; }
    if (!f.tags.length) { setErr('至少选一个标签'); return; }
    try {
      const a = api.submitAsset({ type: f.type, title: f.title.trim(), summary: f.summary.trim(), tags: f.tags, usage: f.usage.trim(), content: f.content || undefined, installCmd: f.installCmd.trim() || undefined, example: f.input && f.output ? { input: f.input, output: f.output } : undefined }, me);
      say('已提交，等待管理员审核'); nav(`/ai/assets/${a.id}`);
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <AISheet title="提交资产" action={<span />}>
      <div className="ph"><div><h1>提交一个 AI 资产</h1><p>审核通过后上架，并记入你的贡献。Skill 需要粘贴 SKILL.md（开头 YAML 含 name、description）。</p></div></div>
      <div className="detail">
        <div className="card">
          <div className="form-grid">
            <div className="field full"><span>类型</span><div className="seg2">{api.ASSET_TYPES.map(t => <button key={t} type="button" aria-pressed={f.type === t} onClick={() => { set('type', t); if (t === 'Skill' && !f.content) set('content', TEMPLATE_SKILL); }}>{t}</button>)}</div></div>
            <label className="field full"><span>标题</span><input id="as-title" className="input" value={f.title} onChange={e => set('title', e.target.value)} placeholder="比如：通话记录归因" /></label>
            <label className="field full"><span>一句话说明它解决什么问题</span><input id="as-summary" className="input" value={f.summary} onChange={e => set('summary', e.target.value)} /></label>
            <div className="field full"><span>适用标签</span><div className="filters">{api.ASSET_TAGS.map(t => <button type="button" key={t} className={`tag${f.tags.includes(t) ? ' on' : ''}`} onClick={() => set('tags', f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t])}>{t}</button>)}</div><small>标签由管理员维护，不能自建。</small></div>
            <label className="field full"><span>使用方法</span><textarea id="as-usage" className="textarea" style={{ minHeight: 72 }} value={f.usage} onChange={e => set('usage', e.target.value)} /></label>
            {f.type === 'Skill' && <label className="field full"><span>安装指令（选填）</span><input id="as-install" className="input mono" value={f.installCmd} onChange={e => set('installCmd', e.target.value)} placeholder="npx skills add …" /></label>}
            {(f.type === 'Skill' || f.type === 'Prompt' || f.type === '工作流') && <label className="field full"><span>{f.type === 'Skill' ? 'SKILL.md' : f.type === 'Prompt' ? 'Prompt 全文' : '步骤'}</span><textarea id="as-content" className="textarea mono" style={{ minHeight: 180, fontSize: 12.5 }} value={f.content} onChange={e => set('content', e.target.value)} /></label>}
            <label className="field"><span>示例输入（选填）</span><input id="as-in" className="input" value={f.input} onChange={e => set('input', e.target.value)} /></label>
            <label className="field"><span>示例输出（选填）</span><input id="as-out" className="input" value={f.output} onChange={e => set('output', e.target.value)} /></label>
          </div>
          {err && <div className="errmsg" style={{ marginTop: 14 }}>{err}</div>}
          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}><button className="btn pri" type="button" onClick={submit}>提交审核</button><Link className="btn ghost" to="/ai/assets">取消</Link></div>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="note"><b>审核看什么</b><br />能不能直接用、说明是否清楚、有没有敏感信息。一般 1–2 个工作日内处理。</div>
          <div className="card"><div className="ch"><h2>我提交的</h2></div><div className="list">{mine.length ? mine.map(a => <Link className="li" key={a.id} to={`/ai/assets/${a.id}`}><span className="di"><Icon name="spark" /></span><div className="tx"><b>{a.title}</b><span>{a.status === 'pending' ? '待审核' : `已退回：${a.returnReason}`}</span></div></Link>) : <Empty title="暂无待审核的提交" />}</div></div>
        </div>
      </div>
    </AISheet>
  );
}
