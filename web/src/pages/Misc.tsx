import { Link, useNavigate } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import { CardHead, Icon, Mark, MetaPill, PageHead, Segmented, StatusPill, Tile, useSession, type Domain, type IconName } from '../components/ui';
import * as api from '../data/api';
import type { Role } from '../data/types';
import { ROLE_LABEL } from '../data/types';

/* 杂项：飞书登录页（PRD 2：只用飞书登录）、二期 / 三期占位页（PRD 12 分期）。 */

// =====================================================================
// 登录
// =====================================================================
export function Login() {
  const nav = useNavigate();
  const { role, setRole } = useSession();
  const enter = () => nav('/');
  return (
    <div className="login lg-wrap">
      <style>{CSS}</style>
      <div className="lg-glow a" aria-hidden="true" /><div className="lg-glow b" aria-hidden="true" /><div className="lg-glow c" aria-hidden="true" />
      <div className="lg-shell">
        <section className="lg-brand" aria-label="管培生工作台">
          <div className="lg-mark"><Mark /><div><b>管培生工作台</b><small>TRAINEE HUB</small></div></div>
          <h2>培养路径、飞书资料和 AI 资产，<em>放在一处</em></h2>
          <ul>
            <li><Tile icon="grow" domain="grow" /><span><b>路径和进度</b>在哪站、这周交什么、下一站哪天开始</span></li>
            <li><Tile icon="pen" domain="ment" /><span><b>带教不漏</b>待点评、换站接人、交接要点按时提醒</span></li>
            <li><Tile icon="spark" domain="ai" /><span><b>AI 资产</b>同事验证过的 Skill 和 Prompt，复制就能用</span></li>
          </ul>
          <div className="lg-foot"><Icon name="lock" size={13} />产出和点评只对本人、相关带教人和管理员可见</div>
        </section>
        <section className="lg-card" aria-label="登录">
          <span className="lg-fs"><Icon name="user" size={20} /></span>
          <h1>用飞书账号登录</h1>
          <p>在飞书里打开会自动登录，不需要账号密码。只有公司飞书成员能进入。</p>
          <button className="btn pri lg-btn" type="button" onClick={enter}>使用飞书登录<Icon name="right" /></button>
          <div className="lg-steps">
            <div><i className="num">1</i><span>在本期<b>预置名单</b>里：首次登录直接进入管培生首页</span></div>
            <div><i className="num">2</i><span>不在名单里：先以<b>同事</b>身份浏览公开内容，管理员会为你分配角色</span></div>
          </div>
          <div className="lg-demo">
            <span>原型演示 · 选一个视角进入</span>
            <Segmented full value={role} onChange={(r: Role) => setRole(r)} options={(['trainee', 'mentor', 'admin', 'colleague'] as Role[]).map(r => ({ value: r, label: ROLE_LABEL[r] }))} />
          </div>
        </section>
      </div>
    </div>
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
.lg-btn{width:100%;height:46px;margin-top:26px;font-size:14px;border-radius:14px}
.lg-steps{margin-top:22px;display:grid;gap:8px}
.lg-steps>div{display:flex;gap:10px;align-items:flex-start;font-size:12.5px;line-height:1.65;color:var(--ink2)}
.lg-steps i{width:20px;height:20px;border-radius:7px;flex:none;display:grid;place-items:center;font-style:normal;font-size:11px;font-weight:700;background:rgba(21,25,38,.06);color:var(--ink2);margin-top:1px}
.lg-steps b{font-weight:600;color:var(--ink)}
.lg-demo{margin-top:auto;padding-top:22px;display:grid;gap:8px;border-top:1px dashed var(--line2)}
.lg-demo>span{font-size:11.5px;color:var(--mute);margin-top:16px}
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
