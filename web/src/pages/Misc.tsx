import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sheet, type Crumb } from '../components/Layout';
import { Avatar, CardHead, Empty, Icon, Mark, MetaPill, PageHead, StatusPill, Tile, useSession, type Domain, type IconName } from '../components/ui';
import * as api from '../data/api';

/* 杂项：演示登录页（页面清单 G4）、还没做的页面占位、二期 / 三期占位页。 */

// =====================================================================
// 演示登录（G4）：演示模式下选一个示例身份进入；非演示模式显示「未开放」（PRD 2.2）
// =====================================================================
const roleText = (i: { role: string; isAdmin: boolean }) => (i.role === 'trainee' ? '示例管培生' : i.isAdmin ? '示例带教 · 有管理权限' : '示例带教');

export function Login() {
  const nav = useNavigate();
  const { status, actor, identities, switchTo } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const enter = (id: string) => {
    setBusy(id); setErr('');
    switchTo(id).then(() => nav('/'), (e: Error) => { setErr(e.message); setBusy(null); });
  };
  return (
    <div className="login lg-wrap">
      <style>{CSS}</style>
      <div className="lg-glow a" aria-hidden="true" /><div className="lg-glow b" aria-hidden="true" /><div className="lg-glow c" aria-hidden="true" />
      <div className="lg-shell">
        <section className="lg-brand" aria-label="管培生工作台">
          <div className="lg-mark"><Mark /><div><b>管培生工作台</b><small>TRAINEE HUB</small></div></div>
          <h2>在真实项目里做事，<em>每一步都有反馈</em></h2>
          <ul>
            <li><Tile icon="flag" domain="acc" /><span><b>项目实践</b>关键节点、成果版本和评审，下一步行动不漏</span></li>
            <li><Tile icon="grow" domain="grow" /><span><b>培养成长</b>我的路径、能力证据和成长档案，点回来源</span></li>
            <li><Tile icon="spark" domain="ai" /><span><b>知识与工具</b>资料、案例和 AI 资产，按问题复用</span></li>
          </ul>
          <div className="lg-foot"><Icon name="lock" size={13} />演示模式只在本机运行，只用虚构的示例数据</div>
        </section>
        <section className="lg-card" aria-label="登录">
          {status === 'loading' && <div className="lg-wait" aria-busy="true">正在连接后端…</div>}
          {(status === 'anon' || status === 'in') && (
            <>
              <span className="lg-fs"><Icon name="user" size={20} /></span>
              <h1>选一个示例身份进入</h1>
              <p>现在是演示模式：飞书登录还没接入，用下面的示例身份体验。进入后可以在顶栏「演示身份」里随时切换。</p>
              <div className="lg-ids" role="list">
                {identities.map(i => (
                  <button key={i.id} type="button" role="listitem" className={actor?.id === i.id ? 'lg-id on' : 'lg-id'} disabled={busy !== null} onClick={() => enter(i.id)}>
                    <Avatar name={i.name} size="md" />
                    <span className="lg-id-t"><b>{i.name}</b><small>{roleText(i)}</small></span>
                    {actor?.id === i.id ? <StatusPill tone="plain">当前</StatusPill> : <Icon name="right" />}
                  </button>
                ))}
              </div>
              {err && <p className="lg-err" role="alert">{err}</p>}
              <div className="lg-note"><Icon name="lock" size={13} />示例身份由后端初始化脚本生成；重置数据用 <code>TRAINEE_HUB_DEMO=1 npm run db:seed</code></div>
            </>
          )}
          {status === 'closed' && (
            <>
              <span className="lg-fs"><Icon name="lock" size={20} /></span>
              <h1>未开放</h1>
              <p>飞书登录和服务端授权还没做好，非演示模式下工作台暂不开放。</p>
              <div className="lg-note">本机体验请用演示模式启动：<code>TRAINEE_HUB_DEMO=1 npm run dev:all</code></div>
            </>
          )}
          {status === 'offline' && (
            <>
              <span className="lg-fs"><Icon name="alert" size={20} /></span>
              <h1>连不上后端服务</h1>
              <p>工作台的数据都来自本机后端。请在项目目录启动后再刷新这一页。</p>
              <div className="lg-note"><code>TRAINEE_HUB_DEMO=1 npm run dev:all</code></div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// =====================================================================
// 还没做的页面：写明在第 3 步哪张 issue 实现（页面清单编号）
// =====================================================================
const PENDING: Record<string, { title: string; level: 'A' | 'B' | 'C'; issue: number; crumbs: Crumb[]; desc: string }> = {
  P1: { title: '项目列表', level: 'A', issue: 45, crumbs: [{ label: '项目实践' }], desc: '项目名称、状态、主责、当前节点、受阻标记、项目带教；可创建项目。' },
  P2: { title: '项目详情', level: 'A', issue: 45, crumbs: [{ label: '项目实践', to: '/projects' }], desc: '基本信息与验收条件、成员与项目带教、关键节点列表、关联的培养任务、最近反馈。' },
  T5: { title: '阶段复盘', level: 'B', issue: 49, crumbs: [{ label: '培养成长' }], desc: '自评 5 问、带教结论；自动汇总项目、成果、反馈和证据覆盖。' },
  K2: { title: '知识资料', level: 'B', issue: 49, crumbs: [{ label: '知识与工具', to: '/knowledge' }], desc: '资料卡片、四维标签筛选；模板与 SOP 筛选视图。' },
  K3: { title: '业务案例', level: 'B', issue: 49, crumbs: [{ label: '知识与工具', to: '/knowledge' }], desc: '案例列表与详情：来源项目、方法、验证结果、已知限制。' },
  K5: { title: 'FAQ', level: 'C', issue: 50, crumbs: [{ label: '知识与工具', to: '/knowledge' }], desc: '带教机器人审核入库的问答，随机器人接口一起做；骨架期只放占位。' },
  M2: { title: '能力项', level: 'A', issue: 48, crumbs: [{ label: '管理', to: '/admin' }], desc: '能力项列表与版本；维护能力项（C18）。' },
};

export function Pending({ page }: { page: keyof typeof PENDING }) {
  const p = PENDING[page];
  return (
    <Sheet crumbs={[...p.crumbs, { label: p.title }]}>
      <PageHead kicker={<>{page}<i aria-hidden="true" />{p.level} 级</>} title={p.title} sub={p.desc} right={<MetaPill>第 3 步 #{p.issue}</MetaPill>} />
      <div className="bento">
        <section className="card s12" aria-label="还没做">
          <Empty size="lg" icon="flag" title={`这一页在第 3 步 #${p.issue} 实现`}>导航已经按新结构排好，页面内容还没做。</Empty>
        </section>
      </div>
    </Sheet>
  );
}

// =====================================================================
// 二期 / 三期占位
// =====================================================================
type Feature = { icon: IconName; domain: Domain; title: string; desc: string; phase?: string };
const SOON: Record<'knowledge' | 'incentive' | 'admin', { phase: string; crumbs: { label: string; to?: string }[]; title: string; em: string; desc: string; features: Feature[]; why: string }> = {
  knowledge: {
    phase: '二期', crumbs: [{ label: '知识' }], title: '知识', em: '跟着任务走',
    desc: '资料本体留在飞书「管培生知识库」，工作台自动同步目录、以资料卡片展示，挂到阶段和任务上。打开时跳回飞书，权限由飞书判断。',
    features: [
      { icon: 'book', domain: 'ment', title: '资料库', desc: '按阶段、主题、类型、岗位四个维度筛选，点开跳飞书' },
      { icon: 'q', domain: 'week', title: 'FAQ', desc: '带教机器人审核入库的问答，可按标签筛选和搜索' },
      { icon: 'star', domain: 'team', title: '作品集', desc: '经本人同意的优秀产出，对外展示' },
    ],
    why: '一期先在任务详情和首页「当前岗位资料」里推送资料卡。',
  },
  incentive: {
    phase: '三期', crumbs: [{ label: '激励' }], title: '激励', em: '只奖励对团队的贡献',
    desc: '积分不奖励完成本职培训任务（那由考核负责），只奖励资产上架、被同事用过、分享会主讲、作品集入选这些对团队有用的事。',
    features: [
      { icon: 'award', domain: 'ai', title: '贡献榜', desc: '月榜和总榜，只按贡献积分排名；不做带教排行' },
      { icon: 'trend', domain: 'grow', title: '我的积分', desc: '每一分从哪来，管理员审核时可手动加权' },
      { icon: 'gift', domain: 'team', title: '兑换', desc: 'AI 工具额度、学习资源、特权荣誉；线上申请，线下发放' },
    ],
    why: '贡献从一期起就记在事件日志里，三期上线时按历史补算。',
  },
  admin: {
    phase: '二期', crumbs: [{ label: '管理后台', to: '/admin' }, { label: '内容与系统' }], title: '内容与系统', em: '二期开放',
    desc: '公告、标签、知识库同步和积分规则的后台设置，随二期、三期功能一起上线。机器人接口密钥已并入一期的「AI 与接入」。',
    features: [
      { icon: 'mega', domain: 'team', title: '公告发布', desc: '只由管理员发，进团队动态' },
      { icon: 'filter', domain: 'week', title: '标签维护', desc: '主题、类型、岗位三个固定列表，贡献者只能选' },
      { icon: 'sync', domain: 'ment', title: '知识库同步', desc: '同步飞书知识库目录，新资料待标注' },
      { icon: 'award', domain: 'ai', title: '积分规则与加权', desc: '各类贡献的分值与上限，审核时可手动加权', phase: '三期' },
    ],
    why: '一期能用的后台：审核队列、成员与角色、期次、轮岗排期、工作日日历、路径模板、周期任务规则、AI 与接入。',
  },
};

export function Soon({ which }: { which: keyof typeof SOON }) {
  api.useDataVersion();
  const s = SOON[which];
  const contrib = api.leaderboard().reduce((n, x) => n + x.count, 0);
  return (
    <Sheet crumbs={s.crumbs} action={which === 'admin' ? null : undefined}>
      <style>{CSS}</style>
      <PageHead
        kicker={<>{s.phase}上线<i aria-hidden="true" />现在还不能用</>}
        title={<>{s.title}：<em>{s.em}</em></>}
        sub={s.desc}
        right={<MetaPill>{s.phase}</MetaPill>}
      />
      <div className="bento">
        {s.features.map(f => (
          <section key={f.title} className={`card ${s.features.length === 4 ? 's3' : 's4'} sn-f stretch`} aria-label={f.title}>
            <div className="row"><Tile icon={f.icon} domain={f.domain} size="lg" /><StatusPill tone="plain">{f.phase ?? s.phase}</StatusPill></div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
            <div className="sn-ghost" aria-hidden="true"><i /><i /><i /></div>
          </section>
        ))}
        <section className={`card dark ${s.features.length % 3 === 2 ? 's4' : 's12'} sn-now`} aria-label="现在可以做什么">
          <div className="row" style={{ gap: 8, fontSize: 12, color: '#C9CCE0' }}><span className="sn-dt"><Icon name="flag" /></span>一期现在</div>
          <p>{s.why}</p>
          {which === 'incentive' && <div className="sn-big"><span className="bignum">{contrib}</span><small>条贡献已记录</small></div>}
          <div className="row" style={{ gap: 8, marginTop: 'auto', paddingTop: 14, flexWrap: 'wrap' }}>
            {which === 'knowledge' && <Link className="btn sec sm" to="/growth/me"><Icon name="grow" />去我的路径看资料</Link>}
            {which === 'incentive' && <Link className="btn sec sm" to="/ai"><Icon name="spark" />去贡献一个 AI 资产</Link>}
            {which === 'admin' && <><Link className="btn sec sm" to="/admin/review"><Icon name="shield" />审核队列</Link><Link className="btn sec sm" to="/admin/rotation"><Icon name="swap" />轮岗排期</Link></>}
            <Link className="btn ghost sm sn-home" to="/"><Icon name="home" />回到首页</Link>
          </div>
        </section>
      </div>
      {which !== 'admin' && (
        <section className="card flat" style={{ marginTop: 12 }} aria-label="分期">
          <CardHead title="分期" sub="PRD 第 12 节" />
          <div className="sn-phases">
            <div className="on"><b>一期</b><span>成长路径与带教、待办与日程、AI 资产与审核、个人档案、管理后台基础</span></div>
            <div className={s.phase === '二期' ? 'cur' : ''}><b>二期</b><span>知识库与 FAQ、考核、团队公告与活动、作品集、通知中心、全局搜索</span></div>
            <div className={s.phase === '三期' ? 'cur' : ''}><b>三期</b><span>积分、排行、兑换、徽章、用例墙、AI 学习路径</span></div>
          </div>
        </section>
      )}
    </Sheet>
  );
}

const CSS = `
.lg-wrap{position:relative;overflow:hidden}
.lg-glow{position:absolute;border-radius:50%;filter:blur(70px);opacity:.55;pointer-events:none}
.lg-glow.a{width:520px;height:520px;left:-120px;top:-140px;background:#C9CBF7}
.lg-glow.b{width:440px;height:440px;right:-100px;bottom:-120px;background:#FAEED3}
.lg-glow.c{width:360px;height:360px;right:24%;top:-160px;background:#DCEAF9}
.lg-shell{position:relative;display:grid;grid-template-columns:440px 420px;gap:14px;align-items:stretch}
.lg-brand{border-radius:28px;padding:36px 34px 28px;background:var(--dark);color:#fff;display:flex;flex-direction:column;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),0 30px 70px -30px rgba(54,58,170,.6)}
.lg-mark{display:flex;align-items:center;gap:12px}
.lg-mark .mark{background:#fff;color:var(--ink)}
.lg-mark b{display:block;font-size:14.5px;font-weight:600}
.lg-mark small{display:block;font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;color:#9EA2BA}
.lg-brand h2{margin-top:40px;font-size:26px;font-weight:300;line-height:1.45;letter-spacing:-.01em}
.lg-brand h2 em{font-style:normal;font-weight:500;color:#C3C5FF}
.lg-brand ul{margin:28px 0 0;padding:0;list-style:none;display:grid;gap:10px}
.lg-brand li{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);font-size:12.5px;color:#C9CCE0;line-height:1.6}
.lg-brand li b{display:block;color:#fff;font-weight:500;font-size:13px}
.lg-foot{margin-top:auto;padding-top:24px;display:flex;align-items:center;gap:8px;font-size:12px;color:#9EA2BA}
.lg-card{border-radius:28px;padding:36px 36px 28px;background:var(--glass-hi);backdrop-filter:blur(24px);box-shadow:var(--sh),var(--sh-in),0 40px 80px -40px rgba(28,36,64,.3);display:flex;flex-direction:column}
.lg-fs{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--acc-soft);color:var(--acc-ink)}
.lg-card h1{margin-top:22px;font-size:var(--fs-2xl);font-weight:300;letter-spacing:-.01em}
.lg-card>p{margin-top:8px;font-size:13px;color:var(--mute);line-height:1.75}
.lg-wait{margin:auto;font-size:13px;color:var(--mute)}
.lg-ids{margin-top:24px;display:grid;gap:8px}
.lg-id{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.62);box-shadow:var(--sh-sm);text-align:left;color:var(--ink2);transition:background var(--t),box-shadow var(--t)}
.lg-id:hover:not(:disabled){background:#fff;box-shadow:0 0 0 1.5px rgba(74,78,216,.35),var(--sh-sm)}
.lg-id:disabled{cursor:progress;opacity:.7}
.lg-id-t{flex:1;min-width:0}
.lg-id b{display:block;font-size:14px;font-weight:600;color:var(--ink)}
.lg-id small{display:block;font-size:12px;color:var(--mute);margin-top:2px}
.lg-id>.ico{width:15px;height:15px;color:var(--mute)}
.lg-id.on{background:#fff;box-shadow:0 0 0 1.5px var(--acc),var(--sh-sm)}
.lg-err{margin-top:12px;font-size:12.5px;color:var(--due-ink)}
.lg-note{margin-top:auto;padding-top:22px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--mute);line-height:1.7}
.lg-note code{font-family:var(--mono);font-size:11.5px;padding:1px 6px;border-radius:6px;background:rgba(21,25,38,.06);color:var(--ink2)}
.sn-f{display:flex;flex-direction:column;gap:6px;min-height:200px;overflow:hidden}
.sn-f .chip{margin-left:auto}
.sn-f h3{margin-top:12px;font-size:15px;font-weight:600}
.sn-f p{font-size:12.5px;line-height:1.7;color:var(--ink2)}
.sn-ghost{margin-top:auto;padding-top:14px;display:grid;gap:6px}
.sn-ghost i{display:block;height:8px;border-radius:5px;background:rgba(21,25,38,.05)}
.sn-ghost i:nth-child(1){width:86%}.sn-ghost i:nth-child(2){width:64%}.sn-ghost i:nth-child(3){width:42%}
.sn-now{display:flex;flex-direction:column;min-height:200px;padding:20px 22px}
.sn-now>p{margin-top:12px;font-size:13.5px;line-height:1.75;color:#E4E6F3;max-width:640px}
.sn-dt{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;background:var(--ai);color:#2A1C00}
.sn-dt .ico{width:13px;height:13px}
.sn-big{margin-top:12px;display:flex;align-items:baseline;gap:8px}
.sn-big small{font-size:12px;color:#C9CCE0}
.sn-now .btn.ghost{color:#C9CCE0}
.sn-now .btn.ghost:hover{background:rgba(255,255,255,.08);color:#fff}
.sn-phases{margin-top:12px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.sn-phases>div{padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.55);display:grid;gap:4px}
.sn-phases b{font-size:13px;font-weight:600}
.sn-phases span{font-size:12px;color:var(--mute);line-height:1.6}
.sn-phases .on{background:var(--grow-soft)}
.sn-phases .on b{color:var(--grow-ink)}
.sn-phases .cur{background:#fff;box-shadow:0 0 0 1.5px var(--acc)}
.sn-phases .cur b{color:var(--acc-ink)}
`;
