import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import {
  Avatar, CardHead, CopyBox, DomainTag, Drawer, Empty, Icon, MetaPill, Metric, PageHead, PhaseBar, ProgressBar, Segmented, StatusPill, Tile,
  useSession, useToast, type Domain, type IconName, type StepState,
} from '../components/ui';
import { Gantt, GanttLegend, type GanttCol, type GanttRow } from '../components/schedule';
import * as api from '../data/api';
import type { Asset, AssetType, CompletionMode, DeadlineRule, Frequency, Line, Output, Role, Station, TaskTemplate, User } from '../data/types';
import { COMPLETION_LABEL, ROLE_LABEL, STATION_POS_LABEL } from '../data/types';
import { addDays, atBj, bjYmd, calendarEntry, daysBetween, isWorkday, weekdayOf, workdaysBetween, addWorkdays } from '../lib/workday';
import { daysSince, fmtCn, fmtDate, fmtDateTime, fmtFull, fmtTime, fmtWeekday, isoWeek } from '../lib/time';

/* 管理后台（PRD 第 3 节「管理后台」分组、2、4.1、4.5、9）。只给管理员；正式版由服务端拒绝其他角色，这里是原型演示。
   页面只读写 data/api；业务规则（重排、改派、可见性）都在数据层。 */

// ---------- 外壳 ----------
type Group = 'pending' | 'plan' | 'path';
const GROUPS: Record<Group, { label: string; tabs: { to: string; label: string; tag?: string }[] }> = {
  pending: { label: '待处理', tabs: [{ to: '/admin/review', label: '审核队列' }] },
  plan: { label: '期次与排期', tabs: [{ to: '/admin/members', label: '成员与角色' }, { to: '/admin/cohort', label: '期次与启动' }, { to: '/admin/rotation', label: '轮岗排期' }, { to: '/admin/calendar', label: '工作日日历' }] },
  path: { label: '路径', tabs: [{ to: '/admin/path', label: '路径模板' }, { to: '/admin/rules', label: '周期任务规则' }] },
};

function AdminSheet({ group, title, action, children }: { group: Group; title: string; action?: ReactNode; children: ReactNode }) {
  const { role } = useSession();
  const g = GROUPS[group];
  const ok = role === 'admin';
  return (
    <Sheet crumbs={[{ label: '管理后台', to: '/admin' }, { label: g.label, to: g.tabs[0].to }, { label: title }]} tabs={ok && g.tabs.length > 1 ? g.tabs : undefined} action={ok ? action : null}>
      <style>{CSS}</style>
      {ok ? children : <Blocked />}
    </Sheet>
  );
}

/** 非管理员访问后台：说明拦截（正式版服务端直接拒绝） */
function Blocked() {
  const { role, setRole } = useSession();
  return (
    <div className="ad-block">
      <div className="card ad-block-card">
        <span className="ad-lock"><Icon name="lock" size={22} /></span>
        <h1>管理后台只对管理员开放</h1>
        <p>你现在是「{ROLE_LABEL[role]}」。正式版里，非管理员打开这里会被服务端直接拒绝（不返回任何数据），侧栏也不会出现入口；这里是原型演示，所以能看到这句说明。</p>
        <div className="ad-block-why">
          <div><Icon name="shield" /><span>可见性规则在服务端执行，不靠前端隐藏</span></div>
          <div><Icon name="user" /><span>需要后台权限，请找管理员在「成员与角色」里调整</span></div>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 22 }}>
          <Link className="btn sec" to="/"><Icon name="home" />回到首页</Link>
          <button type="button" className="btn pri" onClick={() => setRole('admin')}><Icon name="eye" />切到管理员视角看演示</button>
        </div>
      </div>
    </div>
  );
}

// ---------- 小工具 ----------
const LINE_DOMAIN: Record<Line, Domain> = { 老师线: 'grow', 客户线: 'ment', 市场线: 'team', AIBP: 'ai' };
const lineDomain = (line?: Line): Domain => (line ? LINE_DOMAIN[line] : 'week');
const ymdLabel = (ymd: string) => fmtDate(atBj(ymd));
const nameOf = (id?: string) => (id ? api.findUser(id)?.name ?? '—' : '—');
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const TYPE_ICON: Record<AssetType, IconName> = { Skill: 'spark', Prompt: 'pen', 工作流: 'route', 用例: 'q' };

// =====================================================================
// 审核队列：通过上架 / 退回（必须写原因）（PRD 6、R10）
// =====================================================================
export function ReviewQueue() {
  api.useDataVersion();
  const { me } = useSession();
  const say = useToast();
  const pending = api.listAssets({ status: 'pending' }).sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
  const returned = api.listAssets({ status: 'returned' });
  const [selId, setSelId] = useState<string | null>(null);
  const sel = pending.find(a => a.id === selId) ?? pending[0];
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const pick = (id: string) => { setSelId(id); setReason(''); setErr(''); };
  const next = (a: Asset) => pending.find(x => x.id !== a.id)?.id ?? null;

  const approve = (a: Asset) => {
    try {
      api.reviewAsset(a.id, true, '', me);
      say(`「${a.title}」已上架，并给 ${nameOf(a.authorId)} 记了一条贡献`);
      setSelId(next(a)); setReason(''); setErr('');
    } catch (e) { setErr(errText(e)); }
  };
  const reject = (a: Asset) => {
    if (!reason.trim()) { setErr('退回要写原因：作者会看到它，并照着修改后重新提交'); return; }
    try {
      api.reviewAsset(a.id, false, reason.trim(), me);
      say(`已退回给 ${nameOf(a.authorId)}，对方会在「提交资产」里看到原因`);
      setSelId(next(a)); setReason(''); setErr('');
    } catch (e) { setErr(errText(e)); }
  };
  const skillErr = sel?.type === 'Skill' ? api.validateSkillMd(sel.content ?? '') : null;

  return (
    <AdminSheet group="pending" title="审核队列" action={null}>
      <PageHead
        kicker={<>待处理<i aria-hidden="true" />审核队列</>}
        title={pending.length ? <>有 <em>{pending.length} 件贡献</em>等你审核</> : <>审核队列<em>已清空</em></>}
        sub="通过即上架，并为作者记一条贡献；退回要写清原因，作者改完可以重新提交。资料、作品集的审核在二期加入。"
        right={<><MetaPill>资产 <b>{pending.length}</b></MetaPill><MetaPill>资料 · 作品集 二期</MetaPill></>}
      />
      {pending.length ? (
        <div className="bento">
          <section className="card s4 tight" aria-label="待审核列表">
            <div style={{ padding: '0 6px' }}><CardHead title="待审核" sub={`按提交先后 · ${pending.length} 件`} /></div>
            <div className="ad-qlist">
              {pending.map(a => {
                const wait = daysSince(a.submittedAt, api.now());
                return (
                  <button key={a.id} type="button" className={a.id === sel?.id ? 'ad-q on' : 'ad-q'} onClick={() => pick(a.id)} aria-pressed={a.id === sel?.id}>
                    <Tile icon={TYPE_ICON[a.type]} domain="ai" />
                    <span className="grow1">
                      <b>{a.title}</b>
                      <small>{a.type} · {nameOf(a.authorId)} · {fmtDate(a.submittedAt)} 提交</small>
                    </span>
                    {wait >= 2 ? <StatusPill tone="warn">等了 {wait} 天</StatusPill> : <span className="ad-q-t">{wait === 0 ? '今天' : `${wait} 天`}</span>}
                  </button>
                );
              })}
            </div>
            {returned.length > 0 && <>
              <div className="sec-l" style={{ padding: '0 6px' }}><span>已退回，等作者修改</span><span>{returned.length}</span></div>
              <div className="ad-qlist">
                {returned.map(a => (
                  <Link key={a.id} to={`/ai/assets/${a.id}`} className="ad-q dim">
                    <Tile icon={TYPE_ICON[a.type]} domain="week" />
                    <span className="grow1"><b>{a.title}</b><small>退回原因：{a.returnReason}</small></span>
                  </Link>
                ))}
              </div>
            </>}
          </section>

          {sel && (
            <section className="card s8 ad-review" aria-label="审核详情">
              <div className="row" style={{ gap: 10 }}>
                <Tile icon={TYPE_ICON[sel.type]} domain="ai" size="lg" />
                <DomainTag domain="ai">{sel.type}</DomainTag>
                {sel.tags.map(t => <span key={t} className="typ">{t}</span>)}
                <span className="ad-meta">{sel.version} · {fmtDateTime(sel.submittedAt)} 提交</span>
              </div>
              <h2 className="ad-title">{sel.title}</h2>
              <p className="ad-lead">{sel.summary}</p>
              <div className="row" style={{ marginTop: 12, gap: 10 }}>
                <Avatar name={nameOf(sel.authorId)} color={api.userById(sel.authorId).color} size="sm" />
                <span style={{ fontSize: 12.5 }}>作者 <b style={{ fontWeight: 600 }}>{nameOf(sel.authorId)}</b><span className="muted"> · {ROLE_LABEL[api.userById(sel.authorId).role]} · 已有 {api.contributionsOf(sel.authorId).length} 条贡献</span></span>
              </div>

              <div className="ad-checks">
                <div className={sel.usage.trim() ? 'ok' : 'bad'}><Icon name={sel.usage.trim() ? 'check' : 'alert'} />使用方法{sel.usage.trim() ? '已写' : '没写'}</div>
                <div className={sel.example ? 'ok' : 'mid'}><Icon name={sel.example ? 'check' : 'info'} />{sel.example ? '有示例输入输出' : '没有示例（选填）'}</div>
                {sel.type === 'Skill' && <div className={skillErr ? 'bad' : 'ok'}><Icon name={skillErr ? 'alert' : 'check'} />{skillErr ?? 'SKILL.md 格式检查通过'}</div>}
              </div>

              <div className="sec-l">怎么用</div>
              <p className="ad-body">{sel.usage}</p>
              {sel.installCmd && <CopyBox text={sel.installCmd} label="复制安装指令" />}
              {sel.example && (
                <div className="ad-ex">
                  <div className="well"><span>示例输入</span>{sel.example.input}</div>
                  <div className="well"><span>示例输出</span>{sel.example.output}</div>
                </div>
              )}
              {sel.content && <><div className="sec-l"><span>{sel.type === 'Skill' ? 'SKILL.md' : sel.type === 'Prompt' ? 'Prompt 全文' : '步骤'}</span><span>{sel.content.split('\n').length} 行</span></div><pre className="pre ad-pre">{sel.content}</pre></>}

              <div className="ad-decide">
                <label className="field">
                  <span>退回原因<small className="muted" style={{ fontWeight: 400 }}>（退回时必填，作者会看到）</small></span>
                  <textarea className={err && !reason.trim() ? 'textarea err' : 'textarea'} style={{ minHeight: 64 }} value={reason} onChange={e => { setReason(e.target.value); setErr(''); }} placeholder="例：示例输出里有家长手机号，请脱敏后再提交" />
                </label>
                {err && <div className="errmsg" role="alert">{err}</div>}
                <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <Link className="btn ghost" to={`/ai/assets/${sel.id}`}><Icon name="eye" />按上架后的样子预览</Link>
                  <button type="button" className="btn danger" onClick={() => reject(sel)}><Icon name="x" />退回修改</button>
                  <button type="button" className="btn pri" onClick={() => approve(sel)}><Icon name="check" />通过并上架</button>
                </div>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="card" style={{ marginTop: 20 }}>
          <Empty size="lg" icon="shield" title="没有待审核的贡献" action={<Link className="btn sec sm" to="/ai/assets">去看资产库</Link>}>新的提交会出现在这里。{returned.length ? `还有 ${returned.length} 件已退回、等作者修改。` : ''}</Empty>
        </div>
      )}
    </AdminSheet>
  );
}

// =====================================================================
// 成员与角色：角色指定、待分配新成员（R01）、主带教（PRD 2）
// =====================================================================
const ROLES: Role[] = ['trainee', 'mentor', 'admin', 'colleague'];
const DEMO_NEWCOMERS = ['江禾', '顾南', '林溪', '沈卓', '程一'];

export function MembersAdmin() {
  api.useDataVersion();
  const { me } = useSession();
  const say = useToast();
  const [filter, setFilter] = useState<Role | 'all'>('all');
  const [pickRole, setPickRole] = useState<Record<string, Role>>({});
  const users = api.listUsers();
  const r01 = api.allTodos().filter(x => x.rule === 'R01').map(x => ({ todo: x, user: api.findUser(x.subjectId) })).filter((x): x is { todo: typeof x.todo; user: User } => !!x.user);
  const list = users.filter(u => filter === 'all' || u.role === filter);
  const count = (r: Role) => users.filter(u => u.role === r).length;

  const assign = (u: User, role: Role) => {
    try { api.setRole(u.id, role, me); say(`${u.name} 设为${ROLE_LABEL[role]}，「待分配」已关闭`); } catch (e) { say(errText(e)); }
  };
  const changeRole = (u: User, role: Role) => {
    try { api.setRole(u.id, role, me); say(`${u.name} 改为${ROLE_LABEL[role]}，看到的内容随之变化`); } catch (e) { say(errText(e)); }
  };
  const changeMain = (u: User, v: string) => {
    try {
      api.setMainMentor(u.id, v || undefined, me);
      say(v ? `${u.name} 的主带教改为 ${nameOf(v)}，周期任务跟进和阶段评估随之交给 ${nameOf(v)}` : `${u.name} 不设主带教，由管理员担任`);
    } catch (e) { say(errText(e)); }
  };
  const simulate = () => {
    const n = users.filter(u => u.feishuOpenId?.startsWith('ou_demo_')).length;
    const name = DEMO_NEWCOMERS[n % DEMO_NEWCOMERS.length];
    try { api.firstLogin(`ou_demo_${n + 1}`, name); say(`${name} 首次飞书登录：不在预置名单里，默认是同事，已进「待分配」`); } catch (e) { say(errText(e)); }
  };

  return (
    <AdminSheet group="plan" title="成员与角色" action={<button type="button" className="btn sec" onClick={simulate}><Icon name="user" />模拟一次首次登录</button>}>
      <PageHead
        kicker={<>期次与排期<i aria-hidden="true" />{users.length} 人</>}
        title={r01.length ? <>有 <em>{r01.length} 位新成员</em>等你分配角色</> : <>成员与角色</>}
        sub="只用飞书登录。新登录的人默认是同事；open_id 在预置名单里的人首次登录直接成为该期管培生。站带教在「轮岗排期」里按站设置，这里只设主带教。"
        right={<><MetaPill>管培生 <b>{count('trainee')}</b></MetaPill><MetaPill>带教人 <b>{count('mentor')}</b></MetaPill><MetaPill>同事 <b>{count('colleague')}</b></MetaPill></>}
      />

      {r01.length > 0 && (
        <section className="card ad-r01" aria-label="待分配新成员">
          <CardHead title="待分配新成员" sub="规则 R01 · 首次登录且不在任何预置名单里" />
          <div className="ad-r01-list">
            {r01.map(({ todo, user: u }) => (
              <div key={todo.id} className="ad-r01-row">
                <Avatar name={u.name} color={u.color} />
                <span className="grow1">
                  <b>{u.name}</b>
                  <small>{u.team} · {u.firstLoginAt ? `${fmtDateTime(u.firstLoginAt)} 首次登录` : '首次登录'} · <span className="mono">{u.feishuOpenId}</span></small>
                </span>
                <select className="select" style={{ width: 128, height: 34 }} aria-label={`${u.name} 的角色`} value={pickRole[u.id] ?? 'colleague'} onChange={e => setPickRole(p => ({ ...p, [u.id]: e.target.value as Role }))}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <button type="button" className="btn pri sm" onClick={() => assign(u, pickRole[u.id] ?? 'colleague')}><Icon name="check" />确认角色</button>
              </div>
            ))}
          </div>
          <p className="ad-hint"><Icon name="info" size={13} />要让他成为管培生，正式版是把 open_id 加进期次的预置名单、生成个人路径，而不是只改角色。</p>
        </section>
      )}

      <section className="card" style={{ marginTop: 12 }} aria-label="全部成员">
        <CardHead title="全部成员" sub={`${list.length} 人`}>
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: '全部' }, ...ROLES.map(r => ({ value: r, label: ROLE_LABEL[r] }))]} />
        </CardHead>
        <table className="tbl">
          <thead><tr><th style={{ width: 210 }}>成员</th><th style={{ width: 140 }}>角色</th><th>当前站 · 站带教</th><th style={{ width: 200 }}>主带教</th><th style={{ width: 120 }}>最近活跃</th></tr></thead>
          <tbody>
            {list.map(u => {
              const pos = u.role === 'trainee' ? api.currentPosition(u.id) : null;
              const path = u.role === 'trainee' ? api.pathOf(u.id) : undefined;
              return (
                <tr key={u.id}>
                  <td><Link to={`/team/${u.id}`} className="row" style={{ gap: 10 }}><Avatar name={u.name} color={u.color} size="sm" /><span><b>{u.name}</b><span className="s">{u.team}{u.line ? ` · ${u.line}` : ''}</span></span></Link></td>
                  <td>
                    <select className="select" style={{ height: 32, width: 118 }} aria-label={`${u.name} 的角色`} value={u.role} disabled={u.id === me.id} title={u.id === me.id ? '不能改自己的角色' : undefined} onChange={e => changeRole(u, e.target.value as Role)}>
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td>
                    {pos ? <span className="row" style={{ gap: 8 }}>
                      <DomainTag domain={lineDomain(pos.module.line)} variant="dot">{pos.module.name}{pos.rotIndex >= 0 ? `岗 · 第 ${pos.week} 周` : ''}</DomainTag>
                      <span className="muted" style={{ fontSize: 12 }}>站带教 {pos.station.stationMentorId ? nameOf(pos.station.stationMentorId) : <span className="ad-admin">未指定 · 管理员接</span>}</span>
                    </span> : <span className="muted">—</span>}
                  </td>
                  <td>
                    {path ? (
                      <select className="select" style={{ height: 32 }} aria-label={`${u.name} 的主带教`} value={path.mainMentorId ?? ''} onChange={e => changeMain(u, e.target.value)}>
                        <option value="">不设（由管理员担任）</option>
                        {api.mentors().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="num" style={{ textAlign: 'left', fontSize: 12 }}>{u.lastActiveAt ? fmtDateTime(u.lastActiveAt) : <span className="muted">未登录</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <div className="ad-foot">
        <div className="note"><Icon name="info" /><span><b>站带教</b>每站一位，负责本站路径任务的点评和交接要点；<b>主带教</b>贯穿全期，负责周期任务跟进和阶段评估汇总，不设时由管理员担任。带教权限按关系起止日推出，不靠改角色。</span></div>
        <Link className="btn sec" to="/admin/rotation"><Icon name="swap" />去轮岗排期改站带教</Link>
      </div>
    </AdminSheet>
  );
}

// =====================================================================
// 期次与期次启动：当前期次概览 + 最简启动向导（PRD 4.1）
// =====================================================================
const SAMPLE_ROSTER = '江禾 ou_7f3a21c9\n顾南 ou_7f3a22d0\n林溪 ou_7f3a23e4\n沈卓 ou_7f3a24f1\n程一 ou_7f3a25a8\n叶舟 ou_7f3a26b3';
const STEPS = ['选模板版本', '预置名单', '起止日期', '生成个人路径'];

export function CohortAdmin() {
  api.useDataVersion();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const cohort = api.cohortsAll()[0];
  const tpl = api.pathTemplatesAll().find(t => t.id === cohort?.templateId);
  if (!cohort) return <AdminSheet group="plan" title="期次与启动"><div className="card"><Empty size="lg" icon="flag" title="还没有期次" action={<button type="button" className="btn pri" onClick={() => setOpen(true)}>启动第一期</button>} /></div><CohortWizard open={open} onClose={close} /></AdminSheet>;

  const total = daysSince(cohort.startAt, cohort.endAt) + 1;
  const day = Math.min(total, Math.max(0, daysSince(cohort.startAt, api.now()) + 1));
  const stages = api.stagesAll().filter(s => s.templateId === cohort.templateId);
  const curStage = api.activeTrainees().map(u => api.currentPosition(u.id)?.stage.no).find(Boolean) ?? 0;
  const phases = stages.map(s => ({ name: s.name.split('：')[0], state: (s.no < curStage ? 'done' : s.no === curStage ? 'cur' : 'todo') as StepState }));
  const users = api.listUsers();

  return (
    <AdminSheet group="plan" title="期次与启动" action={<button type="button" className="btn pri" onClick={() => setOpen(true)}><Icon name="flag" />启动新期次</button>}>
      <PageHead
        kicker={<>期次与排期<i aria-hidden="true" />当前期次</>}
        title={<>{cohort.name}<em> · {({ preparing: '筹备中', running: '进行中', ended: '已结束' } as const)[cohort.status]}</em></>}
        sub="期次绑定一个模板版本，个人路径挂在期次上。预置名单里的飞书 open_id 首次登录直接成为本期管培生。"
        right={<><MetaPill>第 <b>{day}</b> / {total} 天</MetaPill><MetaPill>在培 <b>{api.activeTrainees().length}</b> 人</MetaPill></>}
      />
      <div className="bento">
        <section className="card s8 stretch" aria-label="期次概览">
          <CardHead title="期次概览" sub={cohort.id}><StatusPill tone="acc" dot>进行中</StatusPill></CardHead>
          <div className="ad-kpis">
            <div><span>绑定模板</span><b>{tpl?.name ?? '—'} <span className="mono">{cohort.templateVersion}</span></b><small><Icon name="lock" size={12} />已绑定，只读</small></div>
            <div><span>开学</span><b className="num">{fmtFull(cohort.startAt)}</b><small>{fmtTime(cohort.startAt)} 入职</small></div>
            <div><span>结束</span><b className="num">{fmtFull(cohort.endAt)}</b><small>定岗答辩后</small></div>
            <div><span>预置名单</span><b className="num">{cohort.roster.length} 人</b><small>{cohort.roster.filter(r => users.some(u => u.feishuOpenId === r.openId && u.firstLoginAt)).length} 人已登录</small></div>
          </div>
          <div className="sec-l"><span>培养进度</span><span className="num">{Math.round((day / total) * 100)}%</span></div>
          <ProgressBar value={(day / total) * 100} domain="acc" />
          <div className="sec-l">阶段</div>
          <PhaseBar phases={phases} />
        </section>

        <section className="card s4 ad-cta stretch" aria-label="启动新期次">
          <div className="row"><Tile icon="flag" domain="acc" /><b style={{ fontSize: 14.5 }}>启动新期次</b><DomainTag domain="acc">最简向导</DomainTag></div>
          <p className="muted" style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.7 }}>四步生成一期：之后在「轮岗排期」里分配站带教、处理挤岗。</p>
          <ol className="ad-steps">{STEPS.map((s, i) => <li key={s}><i className="num">{i + 1}</i>{s}</li>)}</ol>
          <button type="button" className="btn pri full" style={{ marginTop: 'auto' }} onClick={() => setOpen(true)}>开始</button>
        </section>

        <section className="card s12" aria-label="预置名单">
          <CardHead title="预置名单" sub="飞书 open_id · 首次登录直接成为本期管培生" more={{ to: '/admin/members', label: '成员与角色' }} />
          <table className="tbl">
            <thead><tr><th>姓名</th><th>飞书 open_id</th><th>首次登录</th><th>个人路径</th><th>当前站</th><th>主带教</th></tr></thead>
            <tbody>
              {cohort.roster.map(r => {
                const u = users.find(x => x.feishuOpenId === r.openId);
                const pos = u ? api.currentPosition(u.id) : null;
                const path = u ? api.pathOf(u.id) : undefined;
                return (
                  <tr key={r.openId}>
                    <td>{u ? <Link to={`/team/${u.id}`} className="row" style={{ gap: 10 }}><Avatar name={r.name} color={u.color} size="sm" /><b>{r.name}</b></Link> : <span className="row" style={{ gap: 10 }}><Avatar name={r.name} size="sm" /><b>{r.name}</b></span>}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.openId}</td>
                    <td>{u?.firstLoginAt ? <span className="num" style={{ fontSize: 12 }}>{fmtDateTime(u.firstLoginAt)}</span> : u ? <StatusPill tone="ok" dot>已进入</StatusPill> : <StatusPill tone="plain">还没登录</StatusPill>}</td>
                    <td>{path ? <StatusPill tone="ok" icon="check">已生成 · {path.stations.length} 站</StatusPill> : <StatusPill tone="warn">未生成</StatusPill>}</td>
                    <td>{pos ? <DomainTag domain={lineDomain(pos.module.line)} variant="dot">{pos.module.name}{pos.rotIndex >= 0 ? ` · 第 ${pos.week} 周` : ''}</DomainTag> : <span className="muted">—</span>}</td>
                    <td>{path ? (path.mainMentorId ? nameOf(path.mainMentorId) : <span className="muted">不设 · 管理员担任</span>) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
      <CohortWizard open={open} onClose={close} />
    </AdminSheet>
  );
}

/** 启动向导：选模板版本 → 预置名单 → 起止日期 → 生成个人路径（预览）。数据层还没有建期次的写函数，最后一步只演示不写入。 */
function CohortWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const say = useToast();
  const tpls = api.pathTemplatesAll();
  const [step, setStep] = useState(0);
  const [tplId, setTplId] = useState(tpls[tpls.length - 1]?.id ?? '');
  const [name, setName] = useState('2027 春季班');
  const [roster, setRoster] = useState(SAMPLE_ROSTER);
  const [start, setStart] = useState('2027-03-11');
  const [end, setEnd] = useState('');
  const [err, setErr] = useState('');
  const stages = api.stagesAll().filter(s => s.templateId === tplId);
  const total = stages.reduce((n, s) => n + s.days, 0);
  const endYmd = end || (start ? addDays(start, total - 1) : '');
  const people = useMemo(() => roster.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [n = '', id = ''] = l.split(/[\s,，、]+/); return { name: n, openId: id }; }), [roster]);
  const badLines = people.filter(p => !p.name || !/^ou_\w+$/.test(p.openId));
  const rotStage = stages.find(s => api.modulesOf(s.id).length > 1);
  const rotMods = rotStage ? api.modulesOf(rotStage.id) : [];
  const before = stages.filter(s => rotStage && s.no < rotStage.no).reduce((n, s) => n + s.days, 0);
  const rotStart = start ? addDays(start, before) : '';
  const per = rotStage && rotMods.length ? Math.round(rotStage.days / rotMods.length) : 14;

  const check = (s: number): string => {
    if (s === 0 && !tplId) return '先选一个模板版本';
    if (s === 0 && !name.trim()) return '给期次起个名字，例如「2027 春季班」';
    if (s === 1 && !people.length) return '名单至少要有一个人';
    if (s === 1 && badLines.length) return `有 ${badLines.length} 行格式不对：每行写「姓名 open_id」，open_id 以 ou_ 开头`;
    if (s === 2 && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return '选一个开学日';
    if (s === 2 && endYmd <= start) return '结束日要晚于开学日';
    return '';
  };
  const go = (to: number) => {
    if (to > step) { const e = check(step); if (e) { setErr(e); return; } }
    setErr(''); setStep(to);
  };
  const publish = () => {
    say(`原型演示，没有写入：正式版发布「${name}」后会生成 ${people.length} 条个人路径，名单里的人首次登录直接成为管培生`);
    onClose(); setStep(0);
  };

  return (
    <Drawer open={open} onClose={onClose} width={600} title="启动新期次" sub={`第 ${step + 1} 步 / 共 ${STEPS.length} 步 · ${STEPS[step]}`}
      head={<div className="ad-wz">{STEPS.map((s, i) => <button key={s} type="button" className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => go(i)}><i className="num">{i < step ? <Icon name="check" size={11} /> : i + 1}</i>{s}</button>)}</div>}
      footer={<>
        {step > 0 && <button type="button" className="btn ghost" onClick={() => go(step - 1)}><Icon name="left" />上一步</button>}
        <span className="grow1" />
        {step < STEPS.length - 1
          ? <button type="button" className="btn pri" onClick={() => go(step + 1)}>下一步<Icon name="right" /></button>
          : <button type="button" className="btn pri" onClick={publish}><Icon name="flag" />发布期次</button>}
      </>}>
      {step === 0 && <div className="stack" style={{ gap: 16 }}>
        <label className="field"><span>期次名称<em className="req">*</em></span><input className="input" value={name} onChange={e => setName(e.target.value)} /></label>
        <div className="field"><span>路径模板版本</span>
          <div className="stack" style={{ gap: 8 }}>{tpls.map(t => (
            <button key={t.id} type="button" className={t.id === tplId ? 'ad-opt on' : 'ad-opt'} onClick={() => setTplId(t.id)} aria-pressed={t.id === tplId}>
              <span className="ad-radio" /><span className="grow1"><b>{t.name} <span className="mono">{t.version}</span></b><small>{fmtDate(t.createdAt)} 创建{t.basedOnId ? ` · 基于 ${tpls.find(x => x.id === t.basedOnId)?.version ?? ''}` : ''} · {api.stagesAll().filter(s => s.templateId === t.id).reduce((n, s) => n + s.days, 0)} 天</small></span>
              {t.frozen ? <StatusPill tone="plain" icon="lock">已被期次绑定</StatusPill> : <StatusPill tone="ok">可编辑</StatusPill>}
            </button>
          ))}</div>
          <small>新期次绑定后，这个版本会冻结为只读；之后改模板要另存新版本。</small>
        </div>
      </div>}
      {step === 1 && <div className="stack" style={{ gap: 12 }}>
        <label className="field"><span>预置名单<DomainTag domain="week">示例</DomainTag></span>
          <textarea className={err && badLines.length ? 'textarea err mono' : 'textarea mono'} style={{ minHeight: 160, fontSize: 12.5 }} value={roster} onChange={e => { setRoster(e.target.value); setErr(''); }} />
          <small>每行一人：姓名 + 飞书 open_id（可从飞书通讯录导出）。示例 open_id 是编的。</small>
        </label>
        <div className="well ad-roster">{people.map((p, i) => <span key={i} className={!p.name || !/^ou_\w+$/.test(p.openId) ? 'bad' : ''}><Avatar name={p.name || '?'} size="sm" />{p.name || '缺姓名'}<small className="mono">{p.openId || '缺 open_id'}</small></span>)}</div>
      </div>}
      {step === 2 && <div className="stack" style={{ gap: 16 }}>
        <div className="form-grid">
          <label className="field"><span>开学日</span><input className="input" type="date" value={start} onChange={e => { setStart(e.target.value); setErr(''); }} /></label>
          <label className="field"><span>结束日</span><input className="input" type="date" value={endYmd} onChange={e => { setEnd(e.target.value); setErr(''); }} /></label>
        </div>
        <div className="note"><Icon name="info" /><span>结束日默认按模板 <b>{total} 天</b>推算，可以手动改。任务截止会按「工作日日历」落成具体日期，假期自动跳过。</span></div>
        <div className="ad-stagecal">{stages.reduce<{ el: ReactNode[]; at: string }>((acc, s) => {
          const from = acc.at, to = addDays(from, s.days - 1);
          acc.el.push(<div key={s.id}><b>{s.name.split('：')[0]}</b><span className="num">{start ? `${ymdLabel(from)} – ${ymdLabel(to)}` : '—'}</span><small>{s.days} 天</small></div>);
          acc.at = addDays(to, 1); return acc;
        }, { el: [], at: start || '2027-01-01' }).el}</div>
      </div>}
      {step === 3 && <div className="stack" style={{ gap: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b style={{ fontSize: 13.5 }}>轮岗矩阵预览 <DomainTag domain="week">示例</DomainTag></b>
          <span className="muted" style={{ fontSize: 12 }}>{people.length} 人 × {rotMods.length} 站 · 每站约 {per} 天</span>
        </div>
        <div className="ad-matrix" style={{ gridTemplateColumns: `76px repeat(${rotMods.length}, minmax(0, 1fr))` }}>
          <span className="h" />
          {rotMods.map((_, i) => <span key={i} className="h num">{rotStart ? ymdLabel(addDays(rotStart, i * per)) : `第 ${i + 1} 段`}</span>)}
          {people.map((p, r) => <MatrixRow key={r} name={p.name} cells={rotMods.map((_, c) => rotMods[(c + r) % rotMods.length])} />)}
        </div>
        <div className="note"><Icon name="info" /><span>按错位轮转预排，尽量不挤岗。发布后在<b>轮岗排期</b>里分配每站的站带教、处理冲突；主带教在<b>成员与角色</b>里设。</span></div>
        <div className="note warn"><Icon name="alert" /><span>原型里点「发布期次」只演示，不会写入数据。</span></div>
      </div>}
      {err && <div className="errmsg" role="alert" style={{ marginTop: 12 }}>{err}</div>}
    </Drawer>
  );
}
function MatrixRow({ name, cells }: { name: string; cells: { id: string; name: string; line?: Line }[] }) {
  return <><span className="who">{name}</span>{cells.map((m, i) => <span key={i} className={`c d-${lineDomain(m.line)}`}>{m.name}</span>)}</>;
}

// =====================================================================
// 轮岗排期编辑：三视角 Gantt + 抽屉顺延 / 换顺序 / 换站带教（PRD 4.1、4.5）
// =====================================================================
type RotView = 'person' | 'module' | 'mentor';
type Adjust = 'postpone' | 'swap' | 'mentor';

export function RotationAdmin() {
  api.useDataVersion();
  const [view, setView] = useState<RotView>('person');
  const [selId, setSelId] = useState<string | null>(null);
  const close = useCallback(() => setSelId(null), []);
  const rp = api.rotationPlan();
  const rotIds = new Set(api.rotationModules().map(m => m.id));
  const rotStageId = api.rotationModules()[0]?.stageId;
  const all = rp.byPerson.flatMap(p => p.stations.filter(s => rotIds.has(s.module.id)));
  const today = bjYmd(api.now());

  if (!all.length) return <AdminSheet group="plan" title="轮岗排期"><div className="card"><Empty size="lg" icon="swap" title="还没有轮岗排期">期次启动、生成个人路径后，这里按人汇总出排期。</Empty></div></AdminSheet>;

  // 列 = 以第一站开站日（周四）对齐的周
  const first = all.reduce((m, s) => (bjYmd(s.station.startAt) < m ? bjYmd(s.station.startAt) : m), bjYmd(all[0].station.startAt));
  const last = all.reduce((m, s) => (bjYmd(s.station.endAt) > m ? bjYmd(s.station.endAt) : m), bjYmd(all[0].station.endAt));
  const hol = rp.holidays.map(h => h.date);
  const cols: GanttCol[] = [];
  for (let d = first; d <= last; d = addDays(d, 7)) {
    const e = addDays(d, 6);
    cols.push({ key: d, label: `W${isoWeek(atBj(d))}`, sub: ymdLabel(d), current: d <= today && today <= e, holiday: hol.some(h => d <= h && h <= e) });
  }
  const colOf = (ymd: string) => Math.max(0, Math.min(cols.length - 1, Math.floor(daysBetween(first, ymd) / 7)));
  const covers = (s: Station, ymd: string) => bjYmd(s.startAt) <= ymd && ymd <= bjYmd(s.endAt);

  const personRows: GanttRow[] = rp.byPerson.map(p => {
    const sts = p.stations.filter(s => rotIds.has(s.module.id)).sort((a, b) => Date.parse(a.station.startAt) - Date.parse(b.station.startAt));
    let prevEnd = -1;
    const bars = sts.map(s => {
      let from = colOf(bjYmd(s.station.startAt));
      const to = colOf(bjYmd(s.station.endAt));
      if (from <= prevEnd) from = prevEnd + 1;
      prevEnd = Math.max(prevEnd, to);
      const wk = Math.floor(daysBetween(bjYmd(s.station.startAt), today) / 7) + 1;
      return {
        id: s.station.id, from, span: Math.max(1, to - from + 1), label: s.module.name,
        sub: s.pos === 'current' ? `第 ${wk} 周` : s.mentorId ? nameOf(s.mentorId) : '未指定',
        domain: lineDomain(s.module.line), state: s.pos === 'left' ? 'done' as const : s.pos === 'current' ? 'cur' as const : undefined,
        title: `${s.module.name}岗 · ${fmtDate(s.station.startAt)}–${fmtDate(s.station.endAt)} · 站带教 ${s.mentorId ? nameOf(s.mentorId) : '未指定（管理员接）'}`,
      };
    });
    const clashes = rp.stats.crowded.filter(c => c.userIds.includes(p.user.id)).flatMap(c => { const a = colOf(c.from), b = colOf(c.to); return Array.from({ length: b - a + 1 }, (_, i) => a + i); });
    const nx = api.nextStation(p.user.id);
    const cur = api.currentStation(p.user.id);
    const markers = [
      ...(nx && rotIds.has(nx.moduleId) ? [{ col: colOf(bjYmd(nx.startAt)), kind: 'switch' as const, label: `${fmtDate(nx.startAt)} 换站：${cur ? api.moduleById(cur.moduleId).name : ''} → ${api.moduleById(nx.moduleId).name}` }] : []),
      ...rp.assessments.filter(a => a.stageId === rotStageId && a.userIds.includes(p.user.id) && bjYmd(a.at) >= first && bjYmd(a.at) <= last).map(a => ({ col: colOf(bjYmd(a.at)), kind: 'eval' as const, label: `${fmtDate(a.at)} ${api.stageById(a.stageId).name}阶段评估` })),
    ];
    return { id: p.user.id, label: p.user.name, sub: `主带教 ${p.mainMentorId ? nameOf(p.mainMentorId) : '管理员'}`, lead: <Avatar name={p.user.name} color={p.user.color} size="sm" />, bars, clashes, markers };
  });
  const moduleRows: GanttRow[] = api.rotationModules().map(m => {
    const counts = cols.map(c => all.filter(s => s.module.id === m.id && covers(s.station, c.key)).length);
    const emptyN = rp.stats.empty.filter(e => e.moduleId === m.id).length;
    return { id: m.id, label: `${m.name}岗`, sub: `${m.line ?? ''}${emptyN ? ` · 空岗 ${emptyN} 段` : ''}`, lead: <Tile icon="layers" domain={lineDomain(m.line)} size="sm" />, counts, clashes: counts.map((n, i) => (n >= 2 ? i : -1)).filter(i => i >= 0) };
  });
  const mentorRows: GanttRow[] = rp.byMentor.map(b => {
    const counts = cols.map(c => all.filter(s => (s.mentorId ?? null) === b.mentorId && covers(s.station, c.key)).length);
    const u = b.mentorId ? api.userById(b.mentorId) : null;
    return { id: b.mentorId ?? 'none', label: u ? u.name : '未指定站带教', sub: u ? `${u.team} · 峰值 ${b.max} 人` : `由${nameOf(api.adminId())}接 · 峰值 ${b.max} 人`, lead: u ? <Avatar name={u.name} color={u.color} size="sm" /> : <Tile icon="user" domain="week" size="sm" />, counts, clashes: counts.map((n, i) => (n >= 3 ? i : -1)).filter(i => i >= 0) };
  });

  const nextSwitch = rp.switches.find(s => Date.parse(s.at) > Date.parse(api.now()));
  const peak = rp.byMentor.reduce((m, b) => (b.max > m.max ? b : m), rp.byMentor[0]);
  const sel = selId ? api.stationById(selId) : undefined;

  return (
    <AdminSheet group="plan" title="轮岗排期" action={<Link className="btn sec" to="/schedule/rotation"><Icon name="cal" />日程里的只读视角</Link>}>
      <PageHead
        kicker={<>期次与排期<i aria-hidden="true" />{cols[0].sub} – {ymdLabel(last)}</>}
        title={<>轮岗排期 · <em>{rp.stats.crowded.length} 处挤岗</em>待处理</>}
        sub="排期由每个人的个人路径汇总，不单独维护。点色块，在右侧抽屉里顺延、换顺序或换站带教；未开始的任务会按新日期重排，相关待办随之改派。"
        right={<Segmented label="视角" value={view} onChange={setView} options={[{ value: 'person', label: '按人' }, { value: 'module', label: '按岗位' }, { value: 'mentor', label: '按带教' }]} />}
      />
      <div className="metrics" style={{ marginTop: 20 }}>
        <Metric label="挤岗" value={rp.stats.crowded.length} unit="段" icon="alert" domain="exam" foot={rp.stats.crowded[0] ? `最近：${ymdLabel(rp.stats.crowded[0].from)} 起 ${api.moduleById(rp.stats.crowded[0].moduleId).name}岗 ${rp.stats.crowded[0].userIds.length} 人` : '没有挤岗'} />
        <Metric label="空岗" value={rp.stats.empty.length} unit="段" icon="layers" domain="week" foot={rp.stats.empty[0] ? `最近：${ymdLabel(rp.stats.empty[0].from)} 起 ${api.moduleById(rp.stats.empty[0].moduleId).name}岗没人` : '没有空岗'} />
        <Metric label="带教同时带人峰值" value={peak?.max ?? 0} unit="人" icon="team" domain="ment" foot={peak ? `${peak.name}` : ''} />
        <Metric label="下一个换站日" value={nextSwitch ? fmtDate(nextSwitch.at) : '—'} unit={nextSwitch ? fmtWeekday(nextSwitch.at) : undefined} icon="swap" domain="acc" foot={nextSwitch ? `${nextSwitch.userIds.length} 人换站` : '轮岗已结束'} />
      </div>

      <section className="card" style={{ marginTop: 12 }} aria-label="轮岗甘特">
        <CardHead title={view === 'person' ? '按人' : view === 'module' ? '按岗位 · 每段几人' : '按带教 · 同时带几人'} sub={view === 'person' ? '点色块调整' : view === 'module' ? '超过 1 人标红；0 = 空岗' : '3 人及以上标红'} />
        <div style={{ margin: '12px 0 10px' }}>
          <GanttLegend items={view === 'person'
            ? [{ label: '老师线', domain: 'grow' }, { label: '客户线', domain: 'ment' }, { label: '市场线', domain: 'team' }, { label: '在站', domain: 'acc', kind: 'solid' }, { label: '已离站' }, { label: '下次换站', kind: 'switch' }, { label: '阶段评估', kind: 'eval' }, { label: '假期', kind: 'hol' }, { label: '挤岗', kind: 'clash' }]
            : [{ label: '本周', domain: 'acc' }, { label: '假期', kind: 'hol' }, { label: view === 'module' ? '挤岗' : '负载高', kind: 'clash' }]} />
        </div>
        <Gantt cols={cols} rows={view === 'person' ? personRows : view === 'module' ? moduleRows : mentorRows} corner={view === 'person' ? '成员' : view === 'module' ? '岗位' : '站带教'} labelWidth={168} colWidth={70} rowHeight={view === 'person' ? 54 : 46} selectedId={selId ?? undefined} onBarClick={view === 'person' ? b => setSelId(b.id) : undefined} />
      </section>

      <div className="bento" style={{ marginTop: 12 }}>
        <section className="card s7" aria-label="冲突与空岗">
          <CardHead title="冲突与空岗" sub={`${rp.stats.crowded.length + rp.stats.empty.length} 处`} />
          <div className="list">
            {rp.stats.crowded.map(c => (
              <div className="li" key={`c-${c.from}-${c.moduleId}`}>
                <span className="di d-exam"><Icon name="alert" /></span>
                <span className="tx"><b>{api.moduleById(c.moduleId).name}岗挤了 {c.userIds.length} 人</b><span>{ymdLabel(c.from)} – {ymdLabel(c.to)} · {c.userIds.map(nameOf).join('、')}</span></span>
                <span className="end">{c.userIds.map(uid => { const st = all.find(s => s.station.userId === uid && s.module.id === c.moduleId); return st ? <button key={uid} type="button" className="btn sec xs" onClick={() => { setView('person'); setSelId(st.station.id); }}>调 {nameOf(uid)}</button> : null; })}</span>
              </div>
            ))}
            {rp.stats.empty.map(e => (
              <div className="li" key={`e-${e.from}-${e.moduleId}`}>
                <span className="di d-week"><Icon name="layers" /></span>
                <span className="tx"><b>{api.moduleById(e.moduleId).name}岗没人</b><span>{ymdLabel(e.from)} – {ymdLabel(e.to)} · 可把同段挤岗的人换过来</span></span>
                <span className="end"><StatusPill tone="plain">空岗</StatusPill></span>
              </div>
            ))}
            {!rp.stats.crowded.length && !rp.stats.empty.length && <Empty icon="check" title="没有冲突">每段每个岗位正好 1 人。</Empty>}
          </div>
        </section>
        <section className="card s5" aria-label="换站与评估节点">
          <CardHead title="换站与评估节点" sub="之后的" more={{ to: '/admin/calendar', label: '工作日日历' }} />
          <div className="list">
            {rp.switches.filter(s => Date.parse(s.at) > Date.parse(api.now())).slice(0, 4).map(s => (
              <div className="li" key={s.at}>
                <span className="di d-acc"><Icon name="swap" /></span>
                <span className="tx"><b>{fmtDate(s.at)} {fmtWeekday(s.at)} 换站</b><span>{s.userIds.length} 人 · 新站带教开站前 5 个工作日开始接人</span></span>
                <span className="end num">{daysSince(api.now(), s.at)} 天后</span>
              </div>
            ))}
            {rp.assessments.filter(a => Date.parse(a.at) > Date.parse(api.now())).map(a => (
              <div className="li" key={`${a.stageId}-${a.at}`}>
                <span className="di d-exam"><Icon name="flag" /></span>
                <span className="tx"><b>{fmtDate(a.at)} {api.stageById(a.stageId).name}阶段评估</b><span>{a.userIds.length} 人 · 填写流程二期上线</span></span>
                <span className="end"><DomainTag domain="exam">考核</DomainTag></span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <StationDrawer station={sel} onClose={close} />
    </AdminSheet>
  );
}

function StationDrawer({ station, onClose }: { station?: Station; onClose: () => void }) {
  api.useDataVersion();
  const { me } = useSession();
  const say = useToast();
  const [mode, setMode] = useState<Adjust>('postpone');
  const [days, setDays] = useState(2);
  const [other, setOther] = useState('');
  const [mentor, setMentor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [lastId, setLastId] = useState<string | undefined>(undefined);
  if (station?.id !== lastId) { setLastId(station?.id); setMode(station && api.stationTimePos(station) === 'left' ? 'mentor' : 'postpone'); setDays(2); setOther(''); setMentor(null); setReason(''); setErr(''); }
  if (!station) return <Drawer open={false} onClose={onClose} title=""><span /></Drawer>;

  const s = station;
  const u = api.userById(s.userId);
  const m = api.moduleById(s.moduleId);
  const pos = api.stationTimePos(s);
  const settle = api.stationSettle(s);
  const tasks = api.stationTasks(s.id);
  const notStarted = tasks.filter(t => t.status === 'todo' && !t.originalDueAt).length;
  const rotIds = new Set(api.rotationModules().map(x => x.id));
  const swappable = api.stationsOf(s.userId).filter(x => x.id !== s.id && rotIds.has(x.moduleId) && api.stationTimePos(x) === 'upcoming');
  const crowd = api.rotationPlan().stats.crowded.find(c => c.moduleId === s.moduleId && c.userIds.includes(s.userId) && c.from <= bjYmd(s.endAt) && c.to >= bjYmd(s.startAt));
  const wd = workdaysBetween(atBj(addDays(bjYmd(s.startAt), -1)), s.endAt, api.workdayCalendar());
  const mentorVal = mentor ?? s.stationMentorId ?? '';
  const otherVal = other || swappable[0]?.id || '';

  const apply = () => {
    if (!reason.trim()) { setErr('写一句原因：会和原日期、新日期一起留在调整记录里'); return; }
    const before = { due: new Map(api.tasksOf(s.userId).map(t => [t.id, t.dueAt])), owners: new Map(api.allTodos().map(x => [x.id, x.ownerId])) };
    try {
      let what = '';
      if (mode === 'postpone') { api.postponeStation(s.id, days, reason, me); what = `${m.name}岗顺延 ${days} 个工作日`; }
      else if (mode === 'swap') { if (!otherVal) throw new Error('没有可以交换的未开始站'); api.swapStations(s.id, otherVal, reason, me); what = `${m.name}岗与${api.moduleById(api.stationById(otherVal)!.moduleId).name}岗换了顺序`; }
      else { api.changeStationMentor(s.id, mentorVal || undefined, reason, me); what = `${m.name}岗站带教改为${mentorVal ? nameOf(mentorVal) : '管理员'}`; }
      const moved = api.tasksOf(s.userId).filter(t => before.due.has(t.id) && before.due.get(t.id) !== t.dueAt).length;
      const reassigned = api.allTodos().filter(x => before.owners.has(x.id) && before.owners.get(x.id) !== x.ownerId).length;
      say(`${u.name}：${what}；${moved} 条未开始任务重排截止，${reassigned} 条待办改派`);
      onClose();
    } catch (e) { setErr(errText(e)); }
  };

  return (
    <Drawer open onClose={onClose} width={460}
      title={`${u.name} · ${m.name}岗`}
      sub={`${fmtDate(s.startAt)} ${fmtWeekday(s.startAt)} – ${fmtDate(s.endAt)} ${fmtWeekday(s.endAt)} · ${wd} 个工作日`}
      head={<div className="row"><Tile icon="swap" domain={lineDomain(m.line)} /><DomainTag domain={lineDomain(m.line)}>{m.line}</DomainTag><StatusPill tone={pos === 'current' ? 'acc' : pos === 'left' ? 'plain' : 'info'}>{STATION_POS_LABEL[pos]}</StatusPill></div>}
      footer={<><button type="button" className="btn ghost" onClick={onClose}>取消</button><button type="button" className="btn pri" onClick={apply}><Icon name="check" />确认调整</button></>}>
      <div className="dl">
        <div><span className="k">站带教</span><span className="v">{s.stationMentorId ? nameOf(s.stationMentorId) : <span className="ad-admin">未指定 · 由管理员接</span>}</span></div>
        <div><span className="k">主带教</span><span className="v">{api.pathOf(s.userId)?.mainMentorId ? nameOf(api.pathOf(s.userId)!.mainMentorId) : '管理员担任'}</span></div>
        <div><span className="k">本站任务</span><span className="v">{tasks.length} 条 · 已通过 {settle.passed} / {settle.total} · 未开始 {notStarted} 条（调整时重排）</span></div>
      </div>
      {crowd && <div className="note warn" style={{ marginTop: 14 }}><Icon name="alert" /><span>{ymdLabel(crowd.from)} – {ymdLabel(crowd.to)} {m.name}岗挤了 <b>{crowd.userIds.length} 人</b>：{crowd.userIds.map(nameOf).join('、')}。可以和同段空岗的站换顺序。</span></div>}
      <div className="divider" />
      <div className="field"><span>怎么调</span>
        <Segmented full value={mode} onChange={v => { setMode(v); setErr(''); }} options={[
          { value: 'postpone', label: '顺延', disabled: pos === 'left', title: pos === 'left' ? '已离站的站不能顺延' : undefined },
          { value: 'swap', label: '换顺序', disabled: pos !== 'upcoming' || !swappable.length, title: pos !== 'upcoming' ? '已开始的站不能换顺序' : !swappable.length ? '没有其他未开始的站' : undefined },
          { value: 'mentor', label: '换站带教' },
        ]} />
      </div>
      <div className="stack" style={{ gap: 14, marginTop: 14 }}>
        {mode === 'postpone' && <>
          <div className="field"><span>顺延几个工作日</span>
            <div className="row" style={{ gap: 6 }}>{[1, 2, 3, 5, 10].map(n => <button key={n} type="button" className={n === days ? 'tag on' : 'tag'} onClick={() => setDays(n)}>{n} 天</button>)}</div>
            <small>{pos === 'current' ? '在站中：只顺延结束日' : '本站整体后移'}，之后各站一起后移 {days} 个工作日；手动调过截止的任务不动。</small>
          </div>
        </>}
        {mode === 'swap' && (
          <label className="field"><span>和哪一站交换</span>
            <select className="select" value={otherVal} onChange={e => setOther(e.target.value)}>
              {swappable.map(x => <option key={x.id} value={x.id}>{api.moduleById(x.moduleId).name}岗 · {fmtDate(x.startAt)}–{fmtDate(x.endAt)} · 站带教 {x.stationMentorId ? nameOf(x.stationMentorId) : '未指定'}</option>)}
            </select>
            <small>两站交换时间段，任务随站重排；站带教跟着站走。</small>
          </label>
        )}
        {mode === 'mentor' && (
          <label className="field"><span>站带教</span>
            <select className="select" value={mentorVal} onChange={e => setMentor(e.target.value)}>
              <option value="">不指定（由管理员接）</option>
              {api.mentors().map(x => <option key={x.id} value={x.id}>{x.name} · {x.team}</option>)}
            </select>
            <small>这一站没关闭的待点评、换站接人、写交接要点、站末遗留未评会改派给新带教；已写的点评不动。</small>
          </label>
        )}
        <label className="field"><span>原因<em className="req">*</em></span>
          <textarea className={err && !reason.trim() ? 'textarea err' : 'textarea'} style={{ minHeight: 72 }} value={reason} onChange={e => { setReason(e.target.value); setErr(''); }} placeholder="例：销售岗本段挤了 2 人，赵一然改到内容岗" />
        </label>
        {err && <div className="errmsg" role="alert">{err}</div>}
      </div>
      {tasks.length > 0 && <>
        <div className="sec-l"><span>本站任务</span><span>截止</span></div>
        <div className="ad-tasks">{tasks.map(t => <div key={t.id}><span className={t.status === 'passed' ? 'ck on' : 'ck'}>{t.status === 'passed' && <Icon name="check" />}</span><span className="grow1">{t.name}</span><span className="num muted">{fmtDate(t.dueAt)}</span></div>)}</div>
      </>}
    </Drawer>
  );
}

// =====================================================================
// 工作日日历：假期与调休（示例），截止和换站都按它推算（PRD 4.1）
// =====================================================================
const WD = ['一', '二', '三', '四', '五', '六', '日'];
export function WorkdayCalendar() {
  api.useDataVersion();
  const cal = api.workdayCalendar();
  const cohort = api.cohortsAll()[0];
  const today = bjYmd(api.now());
  const s0 = cohort ? bjYmd(cohort.startAt) : today, s1 = cohort ? bjYmd(cohort.endAt) : today;
  const months: { y: number; m: number }[] = [];
  for (let y = +s0.slice(0, 4), m = +s0.slice(5, 7); y * 12 + m <= +s1.slice(0, 4) * 12 + +s1.slice(5, 7); m === 12 ? (y++, m = 1) : m++) months.push({ y, m }); // 北京时间日期字符串
  const switchDays = new Set(api.rotationPlan().switches.map(s => bjYmd(s.at)));
  const holidays = cal.filter(e => !e.workday), makeups = cal.filter(e => e.workday);
  const groupKey = (name: string) => name.replace(/调休$/, '').replace(/节$/, '');
  const groups = [...new Set(cal.map(e => groupKey(e.name)))];

  // 推算举例：都从数据层读出实际结果
  const lin = api.demoUserFor('trainee');
  const ex1 = api.tasksOf(lin.id).find(t => t.kind === 'path' && api.isOpen(t) && Date.parse(t.dueAt) >= Date.parse(api.now()) && api.templateById(t.templateId)?.deadline.anchor === 'stationStart');
  const ex1tpl = ex1 ? api.templateById(ex1.templateId) : undefined;
  const ex1st = ex1 ? api.stationOfTask(ex1) : undefined;
  const st2 = api.stationsOf(lin.id).find(s => api.moduleById(s.moduleId).stageId === api.stagesAll()[1]?.id);
  const reviewFrom = atBj('2026-09-30', '18:00');

  return (
    <AdminSheet group="plan" title="工作日日历" action={null}>
      <PageHead
        kicker={<>期次与排期<i aria-hidden="true" />{cohort?.name}</>}
        title={<>工作日日历 · <em>{holidays.length} 天假期</em>、{makeups.length} 天调休</>}
        sub="任务截止、开放日、换站日、点评和交接要点的期限都按这本日历数工作日。只记「例外」：法定假期（周一到周五也放假）和调休（周末也上班）。"
        right={<><MetaPill>示例数据</MetaPill><MetaPill>{fmtDate(cohort?.startAt ?? api.now())} – {fmtDate(cohort?.endAt ?? api.now())}</MetaPill></>}
      />
      <div className="bento">
        {months.map(({ y, m }) => <MonthCard key={`${y}-${m}`} y={y} m={m} today={today} range={[s0, s1]} switches={switchDays} />)}
        <section className="card s3 ad-legend" aria-label="图例">
          <CardHead title="图例" />
          <div className="stack" style={{ gap: 9, marginTop: 12 }}>
            <span className="row"><i className="ad-sw hol">休</i>法定假期</span>
            <span className="row"><i className="ad-sw mk">班</i>调休上班</span>
            <span className="row"><i className="ad-sw we">六</i>周末</span>
            <span className="row"><i className="ad-sw td">5</i>今天</span>
            <span className="row"><i className="ad-sw sw">12<b /></i>换站日</span>
          </div>
          <div className="note warn" style={{ marginTop: 14 }}><Icon name="alert" /><span>日期都是<b>示例</b>，按国务院当年公布的放假安排维护。</span></div>
        </section>
      </div>

      <div className="bento" style={{ marginTop: 12 }}>
        <section className="card s7" aria-label="例外日">
          <CardHead title="例外日" sub={`${cal.length} 天 · 示例`}>
            <button type="button" className="btn sec sm" disabled title="原型阶段日历只读"><Icon name="plus" />添加假期或调休</button>
          </CardHead>
          <table className="tbl">
            <thead><tr><th>名称</th><th>放假</th><th>调休上班</th><th className="num">影响工作日</th></tr></thead>
            <tbody>{groups.map(g => {
              const hs = holidays.filter(e => groupKey(e.name) === g), ms = makeups.filter(e => groupKey(e.name) === g);
              const delta = ms.length - hs.filter(e => { const w = weekdayOf(e.date); return w !== 0 && w !== 6; }).length;
              return (
                <tr key={g}>
                  <td><span className="row"><Tile icon="cal" domain="exam" size="sm" /><b>{hs[0]?.name ?? g}</b></span></td>
                  <td className="num" style={{ fontSize: 12.5 }}>{hs.length ? `${ymdLabel(hs[0].date)}${hs.length > 1 ? ` – ${ymdLabel(hs[hs.length - 1].date)}` : ''} · ${hs.length} 天` : '—'}</td>
                  <td className="num" style={{ fontSize: 12.5 }}>{ms.length ? ms.map(e => `${ymdLabel(e.date)}（周${WD[(weekdayOf(e.date) + 6) % 7]}）`).join('、') : '—'}</td>
                  <td className="num"><b>{delta > 0 ? '+' : delta < 0 ? '−' : ''}{Math.abs(delta)} 天</b></td>
                </tr>
              );
            })}</tbody>
          </table>
          <p className="ad-hint"><Icon name="info" size={13} />原型阶段日历只读；正式版由管理员在这里增删，改动后未开始任务的截止会按新日历重算。</p>
        </section>
        <section className="card s5" aria-label="怎么推算">
          <CardHead title="按它推算的" sub="示例里的真实结果" />
          <div className="stack" style={{ gap: 10, marginTop: 12 }}>
            {ex1 && ex1tpl && ex1st && (
              <div className="well ad-calc">
                <span className="lbl"><Tile icon="flag" domain="grow" size="sm" />任务截止</span>
                <b>{lin.name}「{ex1.name}」</b>
                <p>规则「{ruleText(ex1tpl.deadline)}」：{api.moduleById(ex1st.moduleId).name}岗 {fmtDate(ex1st.startAt)} {fmtWeekday(ex1st.startAt)} 开站 → 截止 <b className="num">{fmtDate(ex1.dueAt)} {fmtWeekday(ex1.dueAt)} {fmtTime(ex1.dueAt)}</b></p>
              </div>
            )}
            {st2 && (
              <div className="well ad-calc">
                <span className="lbl"><Tile icon="cal" domain="exam" size="sm" />跨假期的阶段</span>
                <b>通识阶段 {fmtDate(st2.startAt)} – {fmtDate(st2.endAt)}</b>
                <p>日历上 {daysSince(st2.startAt, st2.endAt) + 1} 天，跨中秋、国庆，实际 <b className="num">{workdaysBetween(atBj(addDays(bjYmd(st2.startAt), -1)), st2.endAt, cal)} 个工作日</b></p>
              </div>
            )}
            <div className="well ad-calc">
              <span className="lbl"><Tile icon="pen" domain="ment" size="sm" />点评期限（举例）</span>
              <b>提交后 2 个工作日内点评</b>
              <p>{fmtDate(reviewFrom)} {fmtWeekday(reviewFrom)} 18:00 提交 → 期限 <b className="num">{fmtDate(addWorkdays(reviewFrom, 2, cal))} {fmtWeekday(addWorkdays(reviewFrom, 2, cal))} 18:00</b>，国庆 7 天不算</p>
            </div>
          </div>
        </section>
      </div>
    </AdminSheet>
  );
}
function MonthCard({ y, m, today, range, switches }: { y: number; m: number; today: string; range: [string, string]; switches: Set<string> }) {
  const cal = api.workdayCalendar();
  const pad = (n: number) => String(n).padStart(2, '0');
  const first = `${y}-${pad(m)}-01`;
  const lead = (weekdayOf(first) + 6) % 7;
  const n = daysBetween(first, m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const ex = cal.filter(e => e.date.startsWith(`${y}-${pad(m)}`));
  const work = cells.filter((d): d is string => !!d && isWorkday(d, cal)).length;
  return (
    <section className="card s3 tight ad-month stretch" aria-label={`${y} 年 ${m} 月`}>
      <div className="hd" style={{ padding: '0 4px' }}><h2>{y !== 2026 ? `${y} 年 ` : ''}{m} 月</h2><span className="sub">{work} 个工作日</span>{ex.length > 0 && <span className="r"><DomainTag domain="exam">{[...new Set(ex.filter(e => !e.workday).map(e => e.name))].join('、') || '调休'}</DomainTag></span>}</div>
      <div className="ad-mg">
        {WD.map(w => <span key={w} className="w">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const e = calendarEntry(d, cal);
          const wk = weekdayOf(d) === 0 || weekdayOf(d) === 6;
          const cls = ['d', e && !e.workday && 'hol', e?.workday && 'mk', !e && wk && 'we', d === today && 'td', (d < range[0] || d > range[1]) && 'out', switches.has(d) && 'sw'].filter(Boolean).join(' ');
          return <span key={i} className={cls} title={e ? `${fmtCn(atBj(d))} ${e.name}` : switches.has(d) ? `${fmtCn(atBj(d))} 换站日` : undefined}>{+d.slice(8)}{e && <small>{e.workday ? '班' : '休'}</small>}</span>; // 北京时间日期字符串
        })}
      </div>
    </section>
  );
}

// =====================================================================
// 路径模板（带版本）：阶段、站、任务模板、截止规则与建议用时（PRD 4.1）
// =====================================================================
const OUTPUTS: Output[] = ['文档', '路演', '表格', '复盘', '录音'];
function ruleText(r: DeadlineRule) {
  const n = r.offsetWorkdays;
  const base = r.anchor === 'stationStart'
    ? (n === 0 ? '开站当天' : n > 0 ? `开站后第 ${n} 个工作日` : `开站前 ${-n} 个工作日`)
    : (n === 0 ? '站最后一个工作日' : n > 0 ? `站结束后第 ${n} 个工作日` : `站结束前 ${-n} 个工作日`);
  return `${base} ${r.time}`;
}

export function PathEditor() {
  api.useDataVersion();
  const { me } = useSession();
  const say = useToast();
  const tpls = api.pathTemplatesAll();
  const [verId, setVerId] = useState<string>(tpls[tpls.length - 1]?.id ?? '');
  const ver = tpls.find(t => t.id === verId) ?? tpls[0];
  const stages = api.stagesAll().filter(s => s.templateId === ver?.id);
  const mods = stages.flatMap(s => api.modulesOf(s.id));
  const [sel, setSel] = useState<string>('');
  const allTpl = mods.flatMap(m => api.templatesOf(m.id));
  const t = allTpl.find(x => x.id === sel) ?? allTpl.find(x => x.name === '一周来电归因复盘') ?? allTpl[0];
  const ro = !!ver?.frozen;
  const bound = api.cohortsAll().filter(c => c.templateId === ver?.id);
  const upd = (patch: Partial<TaskTemplate>) => { if (!t) return; setSel(t.id); try { api.updateTemplate(t.id, patch); } catch (e) { say(errText(e)); } };
  const fork = () => {
    if (!ver) return;
    try {
      const n = api.saveTemplateAsNewVersion(ver.id, me);
      const copy = api.stagesAll().filter(x => x.templateId === n.id).flatMap(x => api.modulesOf(x.id)).flatMap(m => api.templatesOf(m.id)).find(x => x.name === t?.name);
      setVerId(n.id); setSel(copy?.id ?? ''); say(`已另存为 ${n.version}：可以编辑了，进行中的「${bound[0]?.name ?? '期次'}」仍用 ${ver.version}`); } catch (e) { say(errText(e)); }
  };
  const act = (fn: () => void, msg: string) => { try { fn(); say(msg); } catch (e) { say(errText(e)); } };

  return (
    <AdminSheet group="path" title="路径模板" action={<Link className="btn sec" to="/growth/path"><Icon name="eye" />看路径总览</Link>}>
      <PageHead
        kicker={<>路径<i aria-hidden="true" />{tpls.length} 个版本</>}
        title={<>{ver?.name} <em>{ver?.version}</em></>}
        sub="阶段 → 站（模块）→ 任务模板。任务模板带截止规则和建议用时，生成个人路径时按工作日日历落成具体日期；开放日 = 截止 − 建议用时。"
        right={<Segmented label="版本" value={ver?.id ?? ''} onChange={v => { setVerId(v); setSel(''); }} options={tpls.map(x => ({ value: x.id, label: <>{x.version}{x.frozen && <Icon name="lock" size={12} style={{ marginLeft: 4 }} />}</> }))} />}
      />
      {ro ? (
        <div className="note warn ad-ver"><Icon name="lock" /><span><b>{ver?.version} 已被{bound.map(c => `「${c.name}」`).join('、') || '期次'}绑定，只读。</b>要改，先另存为新版本：阶段、站、任务模板一起复制；新版本不影响已在进行的期次，下一期启动时再选它。</span><button type="button" className="btn pri sm" onClick={fork}><Icon name="copy" />另存为新版本</button></div>
      ) : (
        <div className="note ok ad-ver"><Icon name="pen" /><span><b>{ver?.version} 可编辑</b>{ver?.basedOnId ? `，基于 ${tpls.find(x => x.id === ver.basedOnId)?.version}` : ''}。改动即时保存；绑定到期次后会冻结为只读。</span></div>
      )}
      <div className="ad-pe">
        <div className="stack">
          {stages.map(st => (
            <section key={st.id} className="card ad-stage" aria-label={st.name}>
              <div className="row" style={{ gap: 10 }}>
                <span className="ad-no num">{String(st.no).padStart(2, '0')}</span>
                <span className="grow1"><b style={{ fontSize: 15 }}>{st.name}</b><small className="muted" style={{ display: 'block', fontSize: 12 }}>{st.desc}</small></span>
                <MetaPill><b>{st.days}</b> 天</MetaPill>
              </div>
              <div className={api.modulesOf(st.id).length > 2 ? 'ad-mods two' : 'ad-mods'}>
              {api.modulesOf(st.id).map(md => {
                const list = api.templatesOf(md.id);
                return (
                  <div key={md.id} className="ad-mod">
                    <div className="row ad-mod-h">
                      <DomainTag domain={lineDomain(md.line)} variant="dot">{md.name}{md.line ? ` · ${md.line}` : ''}</DomainTag>
                      <span className="muted" style={{ fontSize: 11.5 }}>{md.days} 天 · {list.length} 个任务</span>
                      {!ro && <button type="button" className="btn ghost xs" style={{ marginLeft: 'auto' }} onClick={() => { try { const n = api.addTemplate(md.id); setSel(n.id); say(`已在${md.name}加了一个任务，右侧填写`); } catch (e) { say(errText(e)); } }}><Icon name="plus" />任务</button>}
                    </div>
                    {list.map((x, i) => (
                      <div key={x.id} className={x.id === t?.id ? 'ad-tt on' : 'ad-tt'}>
                        <button type="button" className="ad-tt-main" onClick={() => setSel(x.id)} aria-pressed={x.id === t?.id}>
                          <span className="num muted" style={{ width: 16 }}>{i + 1}</span>
                          <span className="grow1"><b>{x.name}</b><small>{ruleText(x.deadline)} · 建议 {x.days} 个工作日</small></span>
                          <span className="typ">{x.output}</span>
                        </button>
                        {!ro && <span className="ad-mv">
                          <button type="button" className="btn ghost xs" aria-label="上移" disabled={i === 0} onClick={() => act(() => api.moveTemplate(x.id, -1), '已上移')}><Icon name="up" /></button>
                          <button type="button" className="btn ghost xs" aria-label="下移" disabled={i === list.length - 1} onClick={() => act(() => api.moveTemplate(x.id, 1), '已下移')}><Icon name="down" /></button>
                        </span>}
                      </div>
                    ))}
                    {!list.length && <div className="muted" style={{ fontSize: 12, padding: '6px 10px' }}>这一站还没有任务模板</div>}
                  </div>
                );
              })}
              </div>
            </section>
          ))}
        </div>

        <aside className="card ad-edit" aria-label="编辑任务模板">
          {t ? <>
            <CardHead title={ro ? '任务模板' : '编辑任务模板'} sub={api.moduleById(t.moduleId).name}>{ro && <StatusPill tone="plain" icon="lock">只读</StatusPill>}</CardHead>
            <fieldset disabled={ro} className="ad-fs">
              <label className="field"><span>名称</span><input className="input" value={t.name} onChange={e => upd({ name: e.target.value })} /></label>
              <label className="field"><span>说明</span><textarea className="textarea" style={{ minHeight: 60 }} value={t.desc} onChange={e => upd({ desc: e.target.value })} /></label>
              <label className="field"><span>要求（每行一条）</span><textarea className="textarea" style={{ minHeight: 76 }} value={t.requirements.join('\n')} onChange={e => upd({ requirements: e.target.value.split('\n') })} /></label>
              <div className="form-grid">
                <label className="field"><span>产出形式</span><select className="select" value={t.output} onChange={e => upd({ output: e.target.value as Output })}>{OUTPUTS.map(o => <option key={o}>{o}</option>)}</select></label>
                <label className="field"><span>建议用时（工作日）</span><input className="input" type="number" min={1} value={t.days} onChange={e => upd({ days: Math.max(1, Number(e.target.value) || 1) })} /></label>
              </div>
              <div className="field"><span>截止规则</span>
                <div className="ad-rule">
                  <select className="select" aria-label="锚点" value={t.deadline.anchor} onChange={e => upd({ deadline: { ...t.deadline, anchor: e.target.value as DeadlineRule['anchor'] } })}><option value="stationStart">从开站算</option><option value="stationEnd">从站结束算</option></select>
                  <input className="input" type="number" aria-label="偏移工作日" value={t.deadline.offsetWorkdays} onChange={e => upd({ deadline: { ...t.deadline, offsetWorkdays: Math.trunc(Number(e.target.value) || 0) } })} />
                  <input className="input" type="time" aria-label="时刻" value={t.deadline.time} onChange={e => upd({ deadline: { ...t.deadline, time: e.target.value || '18:00' } })} />
                </div>
                <small>= {ruleText(t.deadline)}；开放日 = 截止前 {t.days} 个工作日（不早于开站）。</small>
              </div>
              <div className="field"><span>推荐 AI 资产</span>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{api.listAssets().map(a => <button type="button" key={a.id} className={t.assetIds.includes(a.id) ? 'tag on' : 'tag'} onClick={() => upd({ assetIds: t.assetIds.includes(a.id) ? t.assetIds.filter(x => x !== a.id) : [...t.assetIds, a.id] })}>{a.title}</button>)}</div>
              </div>
              {t.resources.length > 0 && <div className="field"><span>关联资料</span>{t.resources.map(r => <div key={r.title} className="doc"><Tile icon="doc" domain="ment" size="sm" /><span><b>{r.title}</b><small>{r.source}</small></span></div>)}</div>}
            </fieldset>
            {!ro && <div className="row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
              <button type="button" className="btn danger sm" onClick={() => act(() => { api.removeTemplate(t.id); setSel(''); }, `已删除「${t.name}」`)}><Icon name="trash" />删除这个任务</button>
              <span className="muted" style={{ fontSize: 12 }}>改动即时保存</span>
            </div>}
            {ro && <button type="button" className="btn sec full" style={{ marginTop: 16 }} onClick={fork}><Icon name="copy" />另存为新版本后编辑</button>}
          </> : <Empty icon="route" title="选一个任务模板">左侧点任意任务查看或编辑。</Empty>}
        </aside>
      </div>
    </AdminSheet>
  );
}

// =====================================================================
// 周期任务规则：四种完成方式、周期与截止（PRD 4.2）
// =====================================================================
const MODE_INFO: Record<CompletionMode, { icon: IconName; domain: Domain; done: string; review: string }> = {
  link: { icon: 'link', domain: 'grow', done: '本人交飞书文档链接，同路径任务', review: '待定' },
  'bot-weekly': { icon: 'bot', domain: 'week', done: '只在机器人里交，工作台只显示交没交，不出现「去提交」', review: '只看不评' },
  'bot-quiz': { icon: 'quiz', domain: 'exam', done: '机器人出题、成绩写回；没作答记「未答」，不判逾期', review: '不评' },
  declare: { icon: 'check', domain: 'ai', done: '本人声明，管理员确认通过或退回', review: '管理员确认' },
};
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function freqText(f: Frequency) {
  if (f.kind === 'daily') return '每天';
  if (f.kind === 'weekly') return `每${WEEK[f.weekday]}`;
  if (f.kind === 'monthEnd') return '每月最后一天';
  return `指定 ${f.dates.length} 天`;
}

export function RulesAdmin() {
  api.useDataVersion();
  const rules = api.recurringRulesAll();
  const people = api.activeTrainees();
  const nowMs = Date.parse(api.now());
  const stats = (id: string) => {
    const ts = people.flatMap(u => api.tasksOf(u.id)).filter(x => x.ruleId === id);
    const next = ts.filter(x => Date.parse(x.dueAt) > nowMs).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
    return { n: ts.length, next };
  };
  const modes = Object.keys(MODE_INFO) as CompletionMode[];

  return (
    <AdminSheet group="path" title="周期任务规则" action={null}>
      <PageHead
        kicker={<>路径<i aria-hidden="true" />{rules.filter(r => r.enabled).length} 条启用</>}
        title={<>周期任务规则 · <em>四种</em>完成方式</>}
        sub="周期任务由规则展开：频率、截止时刻、适用阶段、完成方式、是否要带教点评。周报、轻测这类只在机器人里完成，工作台不出「去提交」。"
        right={<MetaPill>原型阶段只读</MetaPill>}
      />
      <div className="bento">
        {modes.map(k => {
          const info = MODE_INFO[k];
          const used = rules.filter(r => r.completion === k);
          return (
            <section key={k} className={`card s3 ad-mode d-${info.domain}`} aria-label={COMPLETION_LABEL[k]}>
              <div className="row"><Tile icon={info.icon} domain={info.domain} size="lg" /><span className="ad-mode-n num">{used.length} 条规则</span></div>
              <h3>{COMPLETION_LABEL[k]}</h3>
              <p>{info.done}</p>
              <div className="ad-mode-f"><span>带教</span><b>{info.review}</b></div>
              <div className="ad-mode-f"><span>例子</span><b>{used.map(r => r.name).join('、') || '—'}</b></div>
            </section>
          );
        })}
      </div>
      <section className="card" style={{ marginTop: 12 }} aria-label="规则列表">
        <CardHead title="规则" sub={`${rules.length} 条`} />
        <table className="tbl">
          <thead><tr><th style={{ width: 260 }}>规则</th><th>周期</th><th>截止</th><th>适用</th><th>完成方式</th><th>点评</th><th>本期实例</th><th>状态</th></tr></thead>
          <tbody>{rules.map(r => {
            const info = MODE_INFO[r.completion];
            const st = stats(r.id);
            return (
              <tr key={r.id} style={r.enabled ? undefined : { opacity: 0.62 }}>
                <td><span className="row" style={{ gap: 10, alignItems: 'flex-start' }}><Tile icon={info.icon} domain={info.domain} size="sm" /><span><b>{r.name}</b><span className="s" style={{ maxWidth: 230 }}>{r.note}</span></span></span></td>
                <td>{freqText(r.frequency)}</td>
                <td><span className="num">{r.dueTime}</span></td>
                <td>{r.stageIds?.length ? r.stageIds.map(id => api.stageById(id).name).join('、') : '全程'}</td>
                <td><DomainTag domain={info.domain}>{COMPLETION_LABEL[r.completion]}</DomainTag></td>
                <td>{r.needsReview ? <StatusPill tone="info">{r.completion === 'declare' ? '管理员确认' : '需点评'}</StatusPill> : <span className="muted">{info.review}</span>}</td>
                <td>{r.enabled ? <span><b className="num">{st.n}</b> 条<span className="s">{st.next ? `下次 ${fmtDate(st.next.dueAt)} ${fmtWeekday(st.next.dueAt)}` : '暂无待到期的'}</span></span> : <span className="muted">不展开</span>}</td>
                <td>{r.enabled ? <StatusPill tone="ok" dot>启用</StatusPill> : <StatusPill tone="plain">停用</StatusPill>}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <p className="ad-hint"><Icon name="info" size={13} />原型阶段规则只读；正式版在这里改，改动只影响之后展开的实例，已生成的不动。</p>
      </section>
    </AdminSheet>
  );
}

// ---------- 页面私有样式（V3 token；如需复用可迁入 app.css） ----------
const CSS = `
.ad-block{display:grid;place-items:center;min-height:560px}
.ad-block-card{width:560px;padding:36px 40px 32px;text-align:center}
.ad-lock{width:56px;height:56px;margin:0 auto;border-radius:18px;display:grid;place-items:center;background:var(--dark);color:#fff;box-shadow:0 14px 30px -14px rgba(26,29,44,.7)}
.ad-block-card h1{margin-top:20px;font-size:24px;font-weight:300;letter-spacing:-.01em}
.ad-block-card p{margin-top:10px;font-size:13px;line-height:1.8;color:var(--mute)}
.ad-block-why{margin-top:20px;display:grid;gap:8px;text-align:left}
.ad-block-why div{display:flex;gap:10px;align-items:center;padding:10px 14px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);font-size:12.5px;color:var(--ink2)}
.ad-block-why .ico{color:var(--acc-ink)}
.ad-qlist{display:grid;gap:4px;margin-top:10px}
.ad-q{display:flex;align-items:center;gap:10px;width:100%;padding:10px;border-radius:14px;text-align:left;transition:background var(--t),box-shadow var(--t)}
.ad-q:hover{background:rgba(255,255,255,.7)}
.ad-q.on{background:#fff;box-shadow:0 0 0 1px var(--line2),0 6px 16px -10px rgba(28,36,64,.3)}
.ad-q b{display:block;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ad-q small{display:block;font-size:11.5px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ad-q.dim b{color:var(--ink2)}
.ad-q.dim small{white-space:normal;line-height:1.55}
.ad-q-t{font-size:11.5px;color:var(--mute);flex:none}
.ad-review{padding:22px 24px}
.ad-meta{margin-left:auto;font-size:11.5px;color:var(--mute);font-family:var(--num)}
.ad-title{margin-top:14px;font-size:var(--fs-xl);font-weight:600;letter-spacing:-.01em}
.ad-lead{margin-top:6px;font-size:13.5px;color:var(--ink2);line-height:1.7}
.ad-body{font-size:13px;line-height:1.75;color:var(--ink2)}
.ad-checks{margin-top:14px;display:flex;flex-wrap:wrap;gap:6px}
.ad-checks div{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;font-size:12px}
.ad-checks .ico{width:13px;height:13px}
.ad-checks .ok{background:var(--grow-soft);color:var(--grow-ink)}
.ad-checks .mid{background:rgba(21,25,38,.05);color:var(--ink2)}
.ad-checks .bad{background:var(--due-soft);color:var(--due-ink)}
.ad-ex{margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ad-ex .well{font-size:12.5px;line-height:1.7;color:var(--ink2)}
.ad-ex .well span{display:block;font-size:11px;color:var(--mute);margin-bottom:2px}
.ad-pre{max-height:220px;overflow:auto}
.ad-decide{margin-top:18px;padding-top:16px;border-top:1px dashed var(--line2)}
.ad-admin{color:var(--warn-ink);font-weight:500}
.ad-r01{margin-top:20px;background:linear-gradient(180deg,rgba(255,255,255,.88),rgba(255,255,255,.7));box-shadow:var(--sh),var(--sh-in),inset 0 0 0 1.5px color-mix(in srgb,var(--acc) 22%,transparent)}
.ad-r01-list{margin-top:12px;display:grid;gap:8px}
.ad-r01-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line)}
.ad-r01-row b{display:block;font-weight:600}
.ad-r01-row small{display:block;font-size:11.5px;color:var(--mute)}
.ad-hint{margin-top:12px;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mute)}
.ad-foot{margin-top:12px;display:flex;gap:12px;align-items:center}
.ad-foot .note{flex:1}
.ad-kpis{margin-top:16px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.ad-kpis>div{padding:12px 14px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);display:grid;gap:3px;min-width:0}
.ad-kpis span{font-size:11.5px;color:var(--mute)}
.ad-kpis b{font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ad-kpis small{font-size:11.5px;color:var(--mute);display:flex;align-items:center;gap:4px}
.ad-cta{display:flex;flex-direction:column}
.ad-steps{margin:14px 0 16px;padding:0;list-style:none;display:grid;gap:6px}
.ad-steps li{display:flex;align-items:center;gap:10px;font-size:13px;padding:8px 10px;border-radius:12px;background:var(--well);box-shadow:0 0 0 1px var(--line)}
.ad-steps i{width:20px;height:20px;border-radius:7px;display:grid;place-items:center;background:var(--acc-soft);color:var(--acc-ink);font-style:normal;font-size:11px;font-weight:700}
.ad-wz{display:flex;gap:4px;padding:3px;border-radius:12px;background:var(--sunk)}
.ad-wz button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:30px;border-radius:9px;font-size:12px;color:var(--mute);white-space:nowrap}
.ad-wz button i{width:18px;height:18px;border-radius:6px;display:grid;place-items:center;font-style:normal;font-size:10.5px;font-weight:700;background:rgba(21,25,38,.07)}
.ad-wz button.on{background:#fff;color:var(--ink);font-weight:500;box-shadow:0 0 0 1px var(--line),0 2px 6px -2px rgba(28,36,64,.16)}
.ad-wz button.on i{background:var(--acc);color:#fff}
.ad-wz button.done{color:var(--grow-ink)}
.ad-wz button.done i{background:var(--grow);color:#fff}
.ad-opt{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);text-align:left;transition:box-shadow var(--t),background var(--t)}
.ad-opt:hover{background:#fff}
.ad-opt.on{background:#fff;box-shadow:0 0 0 1.5px var(--acc),0 0 0 5px rgba(74,78,216,.1)}
.ad-opt b{display:block;font-size:13px;font-weight:600}
.ad-opt small{display:block;font-size:11.5px;color:var(--mute);margin-top:2px}
.ad-radio{width:16px;height:16px;border-radius:50%;box-shadow:inset 0 0 0 1.5px rgba(21,25,38,.25);flex:none}
.ad-opt.on .ad-radio{box-shadow:inset 0 0 0 5px var(--acc)}
.field>span .chip{margin-left:8px;vertical-align:1px}
.ad-roster{display:flex;flex-wrap:wrap;gap:6px;padding:10px}
.ad-roster>span{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px 0 4px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px var(--line);font-size:12.5px}
.ad-roster>span small{font-size:11px;color:var(--mute)}
.ad-roster>span.bad{box-shadow:0 0 0 1.5px var(--due);color:var(--due-ink)}
.ad-stagecal{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.ad-stagecal>div{padding:10px 12px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);display:grid;gap:2px}
.ad-stagecal b{font-size:13px;font-weight:600}
.ad-stagecal span{font-size:12px;color:var(--ink2)}
.ad-stagecal small{font-size:11px;color:var(--mute)}
.ad-matrix{display:grid;gap:4px;align-items:center}
.ad-matrix .h{font-size:11px;color:var(--mute);text-align:center}
.ad-matrix .who{font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ad-matrix .c{height:28px;border-radius:9px;display:grid;place-items:center;font-size:12px;font-weight:500;background:var(--cs);color:var(--ci)}
.ad-tasks{display:grid;gap:2px}
.ad-tasks>div{display:flex;align-items:center;gap:10px;padding:8px 4px;font-size:12.5px;box-shadow:inset 0 -1px 0 var(--line)}
.ad-tasks>div:last-child{box-shadow:none}
.ad-month{padding:14px 12px 10px}
.ad-month .hd h2{font-size:14px}
.ad-mg{margin-top:10px;display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.ad-mg .w{font-size:10.5px;color:var(--faint);text-align:center;padding-bottom:2px}
.ad-mg .d{position:relative;height:30px;border-radius:9px;display:grid;place-items:center;font-family:var(--num);font-size:12px;font-weight:600;color:var(--ink2);line-height:1}
.ad-mg .d small{position:absolute;top:2px;right:3px;font-family:var(--sans);font-size:8.5px;font-weight:600}
.ad-mg .we{color:var(--faint);font-weight:500}
.ad-mg .hol{background:var(--exam-soft);color:var(--exam-ink)}
.ad-mg .mk{background:var(--ment-soft);color:var(--ment-ink)}
.ad-mg .td{box-shadow:inset 0 0 0 1.5px var(--acc);color:var(--acc-ink)}
.ad-mg .out{opacity:.38}
.ad-mg .sw::after{content:"";position:absolute;bottom:3px;width:4px;height:4px;border-radius:50%;background:var(--acc)}
.ad-legend .row{font-size:12.5px;color:var(--ink2);gap:10px}
.ad-sw{position:relative;width:26px;height:24px;border-radius:8px;display:grid;place-items:center;font-style:normal;font-size:10.5px;font-weight:600;font-family:var(--num);color:var(--ink2);background:rgba(21,25,38,.04)}
.ad-sw.hol{background:var(--exam-soft);color:var(--exam-ink)}
.ad-sw.mk{background:var(--ment-soft);color:var(--ment-ink)}
.ad-sw.we{color:var(--faint);background:none;box-shadow:inset 0 0 0 1px var(--line)}
.ad-sw.td{background:none;box-shadow:inset 0 0 0 1.5px var(--acc);color:var(--acc-ink)}
.ad-sw.sw b{position:absolute;bottom:2px;width:4px;height:4px;border-radius:50%;background:var(--acc)}
.ad-calc{display:grid;gap:4px;padding:12px 14px}
.ad-calc .lbl{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--mute)}
.ad-calc>b{font-size:13px;font-weight:600}
.ad-calc p{font-size:12.5px;line-height:1.7;color:var(--ink2)}
.ad-calc p b{color:var(--ink);font-weight:700}
.ad-ver{margin-top:18px;align-items:center}
.ad-ver span{flex:1}
.ad-pe{margin-top:12px;display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:12px;align-items:start}
.ad-stage{padding:18px 18px 12px}
.ad-no{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:var(--dark);color:#fff;font-size:12.5px;font-weight:700;flex:none}
.ad-mods{display:grid;gap:8px;margin-top:12px}
.ad-mods.two{grid-template-columns:1fr 1fr}
.ad-mod{padding:8px;border-radius:16px;background:rgba(255,255,255,.5);box-shadow:0 0 0 1px var(--line)}
.ad-mod-h{padding:2px 6px 6px;gap:10px}
.ad-mod-h .dtag{font-size:12.5px;color:var(--ink);font-weight:600}
.ad-tt{display:flex;align-items:center;border-radius:12px;transition:background var(--t),box-shadow var(--t)}
.ad-tt:hover{background:rgba(255,255,255,.8)}
.ad-tt.on{background:#fff;box-shadow:0 0 0 1.5px var(--acc),0 6px 16px -10px rgba(74,78,216,.45)}
.ad-tt-main{flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:8px 10px;text-align:left}
.ad-tt-main b{display:block;font-size:13px;font-weight:500}
.ad-tt-main small{display:block;font-size:11.5px;color:var(--mute)}
.ad-mv{display:flex;gap:2px;padding-right:6px;opacity:0;transition:opacity var(--t)}
.ad-tt:hover .ad-mv,.ad-tt.on .ad-mv{opacity:1}
.ad-edit{position:sticky;top:12px}
.ad-fs{border:0;margin:14px 0 0;padding:0;display:grid;gap:14px;min-width:0}
.ad-fs:disabled .input,.ad-fs:disabled .textarea,.ad-fs:disabled .select{background:rgba(21,25,38,.03);color:var(--ink2);box-shadow:0 0 0 1px var(--line)}
.ad-fs:disabled .tag{cursor:default}
.ad-rule{display:grid;grid-template-columns:1.3fr .7fr 1fr;gap:6px}
.ad-mode{display:flex;flex-direction:column;gap:8px;align-self:stretch}
.ad-mode-n{margin-left:auto;font-size:11.5px;color:var(--mute);font-weight:600}
.ad-mode h3{margin-top:6px;font-size:14.5px;font-weight:600}
.ad-mode p{font-size:12.5px;line-height:1.7;color:var(--ink2);min-height:42px}
.ad-mode-f{display:flex;gap:10px;font-size:12px;padding-top:8px;border-top:1px dashed var(--line2)}
.ad-mode-f span{color:var(--mute);width:28px;flex:none}
.ad-mode-f b{font-weight:600;color:var(--ci)}
`;
