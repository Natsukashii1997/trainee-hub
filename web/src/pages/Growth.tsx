import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import {
  Avatar, CardHead, CopyBox, DayStrip, Drawer, Empty, Icon, MetaPill, Metric, PageHead, PhaseBar, ProgressBar, ProgressRing, Segmented, StationChain,
  StatusPill, Tile, useSession, useToast, type Domain, type IconName, type StepState, type Tone,
} from '../components/ui';
import * as api from '../data/api';
import type { DeadlineRule, Frequency, Grade, Role, Station, TaskInstance, TaskStatus, Todo, TodoRule } from '../data/types';
import { COMPLETION_LABEL, GRADES, STATION_POS_LABEL, TODO_RULE_LABEL } from '../data/types';
import { daysSince, fmtCn, fmtCountdown, fmtDate, fmtDateTime, fmtDue, fmtTime, fmtWeekday } from '../lib/time';
import { atBj, bjHm, bjYmd } from '../lib/workday';

/* 成长板块（PRD 第 4 节）：路径总览、我的路径与进度、任务详情、带教看板、交接要点。
   数据只从 data/api 取；可见性由数据层裁剪，页面按返回结果画。 */

// ---------------- 共用 ----------------
function growthTabs(role: Role) {
  const path = { to: '/growth/path', label: '路径总览' };
  const rot = { to: '/schedule/rotation', label: '轮岗排期' };
  if (role === 'trainee') return [{ to: '/growth/me', label: '我的路径与进度' }, path, rot];
  if (role === 'colleague') return [path];
  return [{ to: '/growth/board', label: '带教看板' }, path, rot];
}
function GrowthSheet({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const { role } = useSession();
  const home = role === 'trainee' ? '/growth/me' : role === 'colleague' ? '/growth/path' : '/growth/board';
  return <Sheet crumbs={[{ label: '成长', to: home }, { label: title }]} tabs={growthTabs(role)} action={action}>{children}</Sheet>;
}

const nameOf = (id?: string) => (id ? api.findUser(id)?.name ?? '—' : '—');
/** 站带教的名字：空 = 管理员代 */
const stationMentorLabel = (s: Station) => (s.stationMentorId ? nameOf(s.stationMentorId) : `${nameOf(api.adminId())}（管理员代）`);
const mainMentorLabel = (userId: string) => { const id = api.pathOf(userId)?.mainMentorId; return id ? nameOf(id) : `${nameOf(api.adminId())}（管理员担任）`; };
const moduleName = (s?: Station) => (s ? api.moduleById(s.moduleId).name : '');
const dayWd = (iso: string) => `${fmtDate(iso)} ${fmtWeekday(iso)}`;
/** 阶段短名：「通识：AI 行研与路演」→「通识」 */
const shortStage = (name: string) => name.split(/[：:]/)[0];

function Person({ id, sub, size = 'sm' }: { id: string; sub?: ReactNode; size?: 'sm' | 'md' }) {
  const u = api.findUser(id);
  if (!u) return <span className="muted">—</span>;
  return (
    <span className="row" style={{ gap: 8, minWidth: 0 }}>
      <Avatar name={u.name} color={u.color} size={size} />
      <span style={{ minWidth: 0 }}><b style={{ fontWeight: 500, display: 'block' }}>{u.name}</b>{sub && <small style={{ display: 'block', fontSize: 11.5, color: 'var(--mute)' }}>{sub}</small>}</span>
    </span>
  );
}

const STATUS_TONE: Record<TaskStatus, Tone> = { todo: 'plain', doing: 'acc', submitted: 'info', revise: 'warn', passed: 'ok' };
/** 状态胶囊的颜色：按完成方式（周报只分交没交，轻测只看成绩） */
function statusTone(task: TaskInstance): Tone {
  if (task.completion === 'bot-weekly') return api.isDelivered(task) ? 'ok' : api.isOverdue(task) ? 'due' : 'plain';
  if (task.completion === 'bot-quiz') return typeof task.quizResult === 'number' ? 'ok' : 'plain';
  return STATUS_TONE[task.status];
}
function TaskStatusPill({ task, label, size }: { task: TaskInstance; label?: string; size?: 'lg' }) {
  return <StatusPill tone={statusTone(task)} size={size}>{label ?? api.taskStatusLabel(task)}</StatusPill>;
}
/** 逾期是标记不是状态（PRD 4.2）：单独一个胶囊；周报的「逾期未交」已写在状态里 */
function OverdueMark({ task, size }: { task: TaskInstance; size?: 'lg' }) {
  if (!api.isOverdue(task) || task.completion === 'bot-weekly') return null;
  const n = daysSince(api.effectiveDue(task), api.now());
  return <StatusPill tone="due" icon="alert" size={size}>逾期{n > 0 ? ` ${n} 天` : ''}</StatusPill>;
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function dueRuleText(r: DeadlineRule) {
  if (r.anchor === 'stationStart') return r.offsetWorkdays === 0 ? `开站当天 ${r.time}` : `开站后第 ${r.offsetWorkdays} 个工作日 ${r.time}`;
  if (r.offsetWorkdays === 0) return `本站最后一个工作日 ${r.time}`;
  return r.offsetWorkdays < 0 ? `站末前 ${-r.offsetWorkdays} 个工作日 ${r.time}` : `离站后第 ${r.offsetWorkdays} 个工作日 ${r.time}`;
}
function freqText(f: Frequency) {
  switch (f.kind) {
    case 'daily': return '每个工作日';
    case 'weekly': return `每${WEEK[f.weekday]}`;
    case 'monthEnd': return '每月最后一天';
    default: return `指定的 ${f.dates.length} 天`;
  }
}

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------- 路径总览（模板） ----------------
const MODES: { mode: TaskInstance['completion']; eg: string; how: string; review: string; icon: IconName; domain: Domain }[] = [
  { mode: 'link', eg: '日报（通道待定）', how: '贴飞书文档链接提交，同路径任务', review: '待定', icon: 'link', domain: 'grow' },
  { mode: 'bot-weekly', eg: '周报', how: '只在带教机器人里交，工作台只显示交没交', review: '只看不评', icon: 'bot', domain: 'week' },
  { mode: 'bot-quiz', eg: '轻测', how: '机器人出题、成绩写回；没作答记「未答」，不算逾期', review: '不评', icon: 'quiz', domain: 'exam' },
  { mode: 'declare', eg: '月度营销物料', how: '本人声明已完成，管理员确认通过或退回', review: '管理员确认', icon: 'shield', domain: 'acc' },
];

function ModuleBlock({ moduleId, mine }: { moduleId: string; mine: boolean }) {
  const m = api.moduleById(moduleId);
  const list = api.templatesOf(m.id);
  const hi: CSSProperties = mine ? { background: '#fff', boxShadow: '0 0 0 1.5px var(--acc), 0 10px 24px -14px rgba(74,78,216,.5)' } : {};
  return (
    <div className="well" style={{ padding: '14px 14px 12px', ...hi }}>
      <div className="row" style={{ gap: 8 }}>
        <b style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</b>
        {m.line && <span className="typ">{m.line}</span>}
        {mine && <StatusPill tone="acc">你在这站</StatusPill>}
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}><span className="num">{m.days}</span> 天 · <span className="num">{list.length}</span> 个任务</span>
      </div>
      <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
        {list.map((t, i) => (
          <li key={t.id} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr)', gap: 8, alignItems: 'start' }}>
            <span className="num" style={{ width: 20, height: 20, borderRadius: 7, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, background: 'var(--grow-soft)', color: 'var(--grow-ink)' }}>{i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><span style={{ fontWeight: 500, fontSize: 13 }}>{t.name}</span><span className="typ">{t.output}</span></div>
              <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--mute)', lineHeight: 1.6 }}>
                {dueRuleText(t.deadline)} 截止 · 建议用时 <span className="num">{t.days}</span> 个工作日
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StageCard({ stageId, span, cols, myModule }: { stageId: string; span: string; cols: number; myModule?: string }) {
  const s = api.stageById(stageId);
  const mods = api.modulesOf(s.id);
  return (
    <section className={`card ${span}`} aria-label={`${s.name}阶段`}>
      <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
        <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--acc-ink)' }}>0{s.no}</span>
        <h2 style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.name}</h2>
        <span className="muted" style={{ fontSize: 12.5, flex: 1, minWidth: 0 }}><span className="num">{s.days}</span> 天 · {s.desc}</span>
        {mods.length > 1 && <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{mods.length} 站，顺序因人而异，以个人路径为准</span>}
      </div>
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 10 }}>
        {mods.map(m => <ModuleBlock key={m.id} moduleId={m.id} mine={m.id === myModule} />)}
      </div>
    </section>
  );
}

export function PathOverview() {
  api.useDataVersion();
  const { me, role } = useSession();
  const cohort = api.cohortsAll()[0];
  const versions = api.pathTemplatesAll();
  const tpl = versions.find(x => x.id === cohort?.templateId) ?? versions[0];
  const stages = api.stagesAll().filter(s => s.templateId === tpl.id);
  const myModule = role === 'trainee' ? api.currentStation(me.id)?.moduleId : undefined;
  const rules = api.recurringRulesAll();
  const total = stages.reduce((n, s) => n + s.days, 0);
  const countTasks = (stageId: string) => api.modulesOf(stageId).reduce((n, m) => n + api.templatesOf(m.id).length, 0);
  const holidays = api.workdayCalendar().filter(x => !x.workday).length;
  const byNo = (no: number) => stages.find(s => s.no === no);
  const [s1, s2, s3, s4] = [byNo(1), byNo(2), byNo(3), byNo(4)];
  return (
    <GrowthSheet title="路径总览" action={role === 'admin' ? <Link className="btn pri" to="/admin/path"><Icon name="pen" />编辑模板</Link> : undefined}>
      <PageHead
        kicker={<>路径模板<i aria-hidden="true" />所有人可见</>}
        title={<>{tpl.name} <em>{tpl.version}</em></>}
        sub={<>阶段 → 站（轮岗岗位）→ 任务三层。生成个人路径时，每个任务按截止规则和工作日日历落成具体日期；轮岗顺序因人而异{role === 'trainee' ? '，你自己的日期看「我的路径与进度」' : ''}。</>}
        right={<>
          <MetaPill><Icon name="layers" size={13} /><b>{stages.length}</b> 个阶段</MetaPill>
          <MetaPill>全程 <b>{total}</b> 天</MetaPill>
          {tpl.frozen && <MetaPill><Icon name="lock" size={13} />已绑定期次 · 只读</MetaPill>}
        </>}
      />

      <div className="bento">
        <section className="card s12" aria-label="阶段一览">
          <CardHead title="阶段一览" sub="宽度按天数" />
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {stages.map(s => {
              const mods = api.modulesOf(s.id);
              const cur = myModule && mods.some(m => m.id === myModule);
              return (
                <div key={s.id} className="well" style={{ flex: `${Math.max(s.days, 40)} 1 0`, minWidth: 0, padding: '12px 14px', ...(cur ? { background: 'var(--acc-soft)', boxShadow: '0 0 0 1px rgba(74,78,216,.25)' } : {}) }}>
                  <div className="row" style={{ gap: 6 }}><span className="num" style={{ fontSize: 11, fontWeight: 700, color: 'var(--acc-ink)' }}>0{s.no}</span><b style={{ fontWeight: 600, whiteSpace: 'nowrap' }} title={s.name}>{shortStage(s.name)}</b>{cur && <StatusPill tone="acc">你在这里</StatusPill>}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.desc}>
                    <span className="num">{s.days}</span> 天 · <span className="num">{mods.length}</span> 站 · <span className="num">{countTasks(s.id)}</span> 个任务
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card s8" aria-label="截止规则">
          <CardHead title="任务的日期怎么来" sub="截止、开放日、工作日" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginTop: 14 }}>
            {[
              { n: '1', t: '截止规则', d: '锚点（开站或站末）+ 偏移 N 个工作日 + 时刻，例如「开站后第 6 个工作日 18:00」。' },
              { n: '2', t: '开放日', d: '开放日 = 截止 − 建议用时。到开放日任务自动转「进行中」，也可以提前点「开始」。' },
              { n: '3', t: '工作日日历', d: `只数工作日，跳过法定假期、算上调休。日历由管理员维护，目前记了 ${holidays} 天假期。` },
            ].map(x => (
              <div key={x.n} className="well" style={{ padding: 14 }}>
                <div className="row" style={{ gap: 8 }}><span className="num" style={{ width: 22, height: 22, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--acc)', color: '#fff', fontSize: 11.5, fontWeight: 700 }}>{x.n}</span><b style={{ fontWeight: 600 }}>{x.t}</b></div>
                <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.7 }}>{x.d}</p>
              </div>
            ))}
          </div>
          <div className="note" style={{ marginTop: 12 }}><Icon name="info" /><span>需修改的任务另给<b>修改截止</b>（点评后 3 个工作日）；截止可由本站带教或管理员调整，必须写原因并留痕；路径调整（顺延、换顺序）时，未开始的任务按新日期重排。</span></div>
        </section>

        <section className="card s4 vcol stretch" aria-label="版本">
          <CardHead title="模板版本" sub={`${versions.length} 个`} />
          <div className="list">
            {versions.map(v => {
              const bound = api.cohortsAll().filter(c => c.templateId === v.id);
              return (
                <div className="li" key={v.id}>
                  <span className="di d-acc"><Icon name={v.frozen ? 'lock' : 'pen'} /></span>
                  <span className="tx"><b>{v.name} {v.version}</b><span>{bound.length ? `绑定：${bound.map(c => c.name).join('、')}` : '未绑定期次，可编辑'} · {fmtDate(v.createdAt)} 建</span></span>
                  <span className="end">{v.frozen ? <StatusPill tone="plain">只读</StatusPill> : <StatusPill tone="acc">草稿</StatusPill>}</span>
                </div>
              );
            })}
          </div>
          <p className="muted" style={{ marginTop: 'auto', paddingTop: 12, fontSize: 12, lineHeight: 1.7 }}>已被期次绑定的版本只读；要改就另存新版本，阶段、站、任务模板一起复制。</p>
        </section>

        {s1 && <StageCard stageId={s1.id} span="s5" cols={1} myModule={myModule} />}
        {s2 && <StageCard stageId={s2.id} span="s7" cols={1} myModule={myModule} />}
        {s3 && <StageCard stageId={s3.id} span="s12" cols={3} myModule={myModule} />}
        {s4 && <StageCard stageId={s4.id} span="s5" cols={1} myModule={myModule} />}

        <section className="card s7" aria-label="周期任务规则">
          <CardHead title="周期任务规则" sub="按规则展开成每个人的周期任务" more={role === 'admin' ? { to: '/admin/rules', label: '管理规则' } : undefined} />
          <table className="tbl">
            <thead><tr><th>规则</th><th>频率与截止</th><th>适用</th><th>完成方式</th><th>点评</th></tr></thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} style={r.enabled ? undefined : { opacity: .55 }}>
                  <td><b>{r.name}</b>{!r.enabled && <span className="s">已停用 · {r.note}</span>}</td>
                  <td>{freqText(r.frequency)} <span className="num">{r.dueTime}</span></td>
                  <td>{r.stageIds?.length ? r.stageIds.map(id => api.stageById(id).name).join('、') : '全程'}</td>
                  <td>{COMPLETION_LABEL[r.completion]}</td>
                  <td>{r.needsReview ? (r.completion === 'declare' ? '管理员确认' : '带教点评') : r.completion === 'bot-weekly' ? '只看不评' : '不评'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card s12" aria-label="四种完成方式">
          <CardHead title="周期任务的四种完成方式" sub="任务详情按完成方式出按钮" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginTop: 14 }}>
            {MODES.map(m => (
              <div key={m.mode} className="well" style={{ padding: 14 }}>
                <div className="row" style={{ gap: 8 }}><Tile icon={m.icon} domain={m.domain} /><b style={{ fontWeight: 600 }}>{COMPLETION_LABEL[m.mode]}</b></div>
                <div className="dl" style={{ marginTop: 12 }}>
                  <div><span className="k">例子</span><span className="v">{m.eg}</span></div>
                  <div><span className="k">怎么算</span><span className="v">{m.how}</span></div>
                  <div><span className="k">带教</span><span className="v">{m.review}</span></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </GrowthSheet>
  );
}

// ---------------- 我的路径与进度 ----------------
const stepOf = (pos: 'upcoming' | 'current' | 'left', settled: boolean): StepState => (pos === 'current' ? 'cur' : pos === 'left' ? (settled ? 'done' : 'due') : 'todo');

function StationBadge({ s }: { s: Station }) {
  const pos = api.stationTimePos(s);
  const { passed, total } = api.stationSettle(s);
  const now = api.now();
  if (pos === 'current') return <StatusPill tone="acc">在站 · 第 {Math.floor(daysSince(s.startAt, now) / 7) + 1} 周</StatusPill>;
  if (pos === 'upcoming') return <StatusPill tone="plain">{daysSince(now, s.startAt)} 天后开站</StatusPill>;
  return passed === total ? <StatusPill tone="ok" icon="check">已结清</StatusPill> : <StatusPill tone="warn">时间到了 · 还有 {total - passed} 项没结清</StatusPill>;
}

function goLabel(task: TaskInstance, mine: boolean) {
  if (!mine) return '查看';
  if (task.status === 'revise') return '去修改';
  if (task.completion === 'link' && api.isOpen(task)) return '去提交';
  if (task.completion === 'declare' && api.isOpen(task)) return '去声明';
  return '查看';
}

function StationTasks({ station, mine }: { station: Station; mine: boolean }) {
  const now = api.now();
  const list = api.stationTasks(station.id);
  if (!list.length) return <Empty icon="inbox" title="这一站没有路径任务" />;
  return (
    <table className="tbl">
      <thead><tr><th>任务</th><th>开放日</th><th>截止</th><th>修改截止</th><th>状态</th><th>标记</th><th /></tr></thead>
      <tbody>
        {list.map(t => (
          <tr key={t.id}>
            <td><Link to={`/growth/tasks/${t.id}`}><b>{t.name}</b><span className="s">产出：{t.output}</span></Link></td>
            <td>{dayWd(t.openAt)}{Date.parse(t.openAt) > Date.parse(now) && <span className="s">未开放</span>}</td>
            <td>
              <span style={api.isOverdue(t) && t.status !== 'revise' ? { color: 'var(--due-ink)', fontWeight: 600 } : undefined}>{fmtDue(t.dueAt, now)}</span>
              {t.originalDueAt && <span className="s" title="截止调整过，原因见任务详情">原 <s>{fmtDate(t.originalDueAt)}</s> · 已调整</span>}
            </td>
            <td>{t.reviseDueAt ? <span style={t.status === 'revise' ? { color: api.isOverdue(t) ? 'var(--due-ink)' : 'var(--warn-ink)', fontWeight: 600 } : undefined}>{fmtDue(t.reviseDueAt, now)}</span> : <span className="muted">—</span>}</td>
            <td><TaskStatusPill task={t} /></td>
            <td><OverdueMark task={t} /></td>
            <td style={{ textAlign: 'right' }}><Link className="go" to={`/growth/tasks/${t.id}`}>{goLabel(t, mine)}<Icon name="right" /></Link></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecurringList({ userId, all }: { userId: string; all: boolean }) {
  const now = api.now();
  const from = Date.parse(now) - 10 * 86400000, to = Date.parse(now) + 10 * 86400000;
  const tasks = api.tasksOf(userId).filter(t => t.kind === 'recurring');
  const rules = api.recurringRulesAll().filter(r => tasks.some(t => t.ruleId === r.id));
  if (!rules.length) return <Empty icon="repeat" title="还没有周期任务" />;
  return (
    <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
      {rules.map(r => {
        const list = tasks.filter(t => t.ruleId === r.id && (all || (Date.parse(t.dueAt) >= from && Date.parse(t.dueAt) <= to)));
        const mode = MODES.find(m => m.mode === r.completion)!;
        return (
          <div key={r.id}>
            <div className="row" style={{ gap: 8 }}><Tile icon={mode.icon} domain={mode.domain} size="sm" /><b style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</b><span className="muted" style={{ fontSize: 11.5 }}>{COMPLETION_LABEL[r.completion]}</span></div>
            {list.length ? (
              <div className="rows" style={{ marginTop: 4 }}>
                {list.map(t => (
                  <Link key={t.id} to={`/growth/tasks/${t.id}`} className="rw" style={{ gridTemplateColumns: 'minmax(0,1fr) 92px auto', minHeight: 38 }}>
                    <span className="nm" style={{ fontWeight: 400 }}>{t.name}</span>
                    <span className="due">{fmtDue(t.dueAt, now)}</span>
                    <span className="end"><TaskStatusPill task={t} /></span>
                  </Link>
                ))}
              </div>
            ) : <p className="muted" style={{ fontSize: 12, padding: '8px 0 0 32px' }}>前后 10 天没有这一项</p>}
          </div>
        );
      })}
    </div>
  );
}

export function MyPath() {
  api.useDataVersion();
  const { me, role } = useSession();
  const [pick, setPick] = useState<string>('');
  const [recAll, setRecAll] = useState<'near' | 'all'>('near');
  if (role !== 'trainee') {
    return (
      <GrowthSheet title="我的路径与进度">
        <div className="card"><Empty size="lg" icon="route" title="这一页给管培生看自己的路径" action={<Link className="btn sec sm" to={role === 'colleague' ? '/growth/path' : '/growth/board'}>{role === 'colleague' ? '看路径总览' : '去带教看板'}</Link>}>带教人和管理员在带教看板里看每个人的进度；想看示例，切到「管培生」视角。</Empty></div>
      </GrowthSheet>
    );
  }
  const path = api.pathOf(me.id);
  const prog = api.progressOf(me.id);
  const pos = api.currentPosition(me.id);
  if (!path || !prog || !pos) {
    return <GrowthSheet title="我的路径与进度"><div className="card"><Empty size="lg" icon="route" title="你的个人路径还没生成">管理员发布期次后，这里会出现你的阶段、站和任务日期。</Empty></div></GrowthSheet>;
  }
  const now = api.now();
  const stations = api.stationsOf(me.id);
  const sp = api.stationsProgress(me.id).stations;
  const spOf = (id: string) => sp.find(x => x.station.id === id)!;
  const sel = stations.find(s => s.id === pick) ?? pos.station;
  const rot = pos.rotation.map(s => spOf(s.id));
  const settledN = rot.filter(x => x.pos === 'left' && x.settle.passed === x.settle.total).length;
  const leftN = rot.filter(x => x.pos === 'left').length;
  const phases = api.stagesAll().filter(st => stations.some(s => api.stageOfStation(s).id === st.id)).map(st => {
    const list = stations.filter(s => api.stageOfStation(s).id === st.id).map(s => api.stationTimePos(s));
    return { name: shortStage(st.name), state: (list.every(p => p === 'left') ? 'done' : list.some(p => p === 'current') ? 'cur' : 'todo') as StepState };
  });
  const next = pos.next;
  const behind = prog.gap < 0;
  return (
    <GrowthSheet title="我的路径与进度">
      <PageHead
        kicker={<>{api.cohortById(path.cohortId)?.name}<i aria-hidden="true" />{fmtCn(path.startAt)}入营</>}
        title={<>{me.name}，你在<em>{pos.module.name}站</em>第 {pos.week} 周</>}
        sub={next ? <>下一站 {moduleName(next)}，{dayWd(next.startAt)} 开始。时间进度看日子过了多少，完成进度看该交的交了多少。</> : '这是最后一站。'}
        right={<><MetaPill>培养第 <b>{prog.time.day}</b> / {prog.time.total} 天</MetaPill><MetaPill>{pos.stage.name} · 第 <b>{pos.rotIndex >= 0 ? pos.rotIndex + 1 : 1}</b> 站</MetaPill></>}
      />

      <div className="bento">
        <section className="card s4 vcol stretch" aria-label="两个进度">
          <CardHead title="两个进度" sub="时间 · 完成" />
          <div className="row" style={{ marginTop: 16, gap: 18, justifyContent: 'center' }}>
            <ProgressRing value={prog.time.pct} size={112} thickness={11} domain="week" sub="时间进度" />
            <ProgressRing value={prog.completion.pct} size={112} thickness={11} domain="grow" sub="完成进度" />
          </div>
          <div className="dl" style={{ marginTop: 16 }}>
            <div><span className="k">时间</span><span className="v">第 <b className="num">{prog.time.day}</b> 天，共 <span className="num">{prog.time.total}</span> 天</span></div>
            <div><span className="k">完成</span><span className="v">已通过 <b className="num">{prog.completion.passed}</b> 条，截至今天应完成 <span className="num">{prog.completion.due}</span> 条（全程 <span className="num">{prog.completion.all}</span> 条）</span></div>
          </div>
          <div className={behind ? 'note warn' : 'note ok'} style={{ marginTop: 'auto' }}>
            <Icon name={behind ? 'alert' : 'check'} />
            <span>{behind ? <>已过截止、还没通过的有 <b>{-prog.gap} 条</b>（等点评的也算），通过后会补上。</> : <>按计划在走，<b>没有欠账</b>。</>}</span>
          </div>
        </section>

        <section className="card s5 vcol stretch" aria-label="路径">
          <CardHead title="路径" sub="点站看任务" />
          <div className="sec-l"><span>阶段</span></div>
          <PhaseBar phases={phases} />
          <div className="sec-l"><span>轮岗六站</span><span>时间到了 <span className="num">{leftN}</span> 站，其中已结清 <span className="num">{settledN}</span> 站</span></div>
          <div style={{ marginTop: 6 }}>
            <StationChain
              stations={rot.map(x => ({ name: x.module.name, state: stepOf(x.pos, x.settle.passed === x.settle.total), sub: fmtDate(x.station.startAt), title: `${x.module.name}站 · ${STATION_POS_LABEL[x.pos]} · 已通过 ${x.settle.passed}/${x.settle.total}` }))}
              onPick={i => setPick(rot[i].station.id)}
            />
          </div>
          {(() => {
            const total = daysSince(pos.station.startAt, pos.station.endAt) + 1;
            const passed = Math.min(total, daysSince(pos.station.startAt, now) + 1);
            return (
              <div className="well" style={{ marginTop: 14 }}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>{pos.module.name}站 · 第 {pos.week} 周</b><span className="num muted" style={{ fontSize: 11.5 }}>{fmtDate(pos.station.startAt)}–{fmtDate(pos.station.endAt)}</span></div>
                <div style={{ marginTop: 8 }}><DayStrip total={total} passed={passed} /></div>
                <div className="row" style={{ marginTop: 6, justifyContent: 'space-between', fontSize: 11.5, color: 'var(--mute)' }}><span>第 {passed} / {total} 天</span><span>还剩 {total - passed} 天</span></div>
              </div>
            );
          })()}
          <div className="row" style={{ marginTop: 'auto', paddingTop: 14, gap: 14, fontSize: 11.5, color: 'var(--mute)', flexWrap: 'wrap' }}>
            <span className="row" style={{ gap: 5 }}><i style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--grow)' }} />已结清</span>
            <span className="row" style={{ gap: 5 }}><i style={{ width: 10, height: 10, borderRadius: 5, boxShadow: 'inset 0 0 0 1.5px var(--grow)' }} />时间到了，还有任务没结</span>
            <span className="row" style={{ gap: 5 }}><i style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--acc)' }} />当前站</span>
          </div>
        </section>

        <section className="card s3 vcol stretch" aria-label="带教">
          <CardHead title="谁带你" />
          <div className="stack" style={{ marginTop: 14, gap: 14 }}>
            <div><div className="sec-l" style={{ margin: '0 0 6px' }}>本站站带教 · {pos.module.name}</div><Person id={api.stationMentorOf(pos.station)} sub={pos.station.stationMentorId ? '点评本站任务、写交接要点' : '本站未指定，由管理员代'} /></div>
            <div><div className="sec-l" style={{ margin: '0 0 6px' }}>主带教 · 贯穿全期</div><Person id={api.mainMentorOf(me.id)} sub={path.mainMentorId ? '跟进周期任务、阶段评估' : '未设主带教，由管理员担任'} /></div>
            {next && <div><div className="sec-l" style={{ margin: '0 0 6px' }}>下一站 · {moduleName(next)} · {fmtDate(next.startAt)}</div><Person id={api.stationMentorOf(next)} sub={next.stationMentorId ? '下一站站带教' : '未指定，由管理员代'} /></div>}
          </div>
        </section>

        <section className="card s8" aria-label="路径任务">
          <CardHead title="路径任务" sub="按站看">
            <Link className="go" to="/schedule/week">按周看<Icon name="right" /></Link>
          </CardHead>
          <div style={{ marginTop: 12 }}>
            <Segmented label="站" value={sel.id} onChange={setPick} options={stations.map(s => ({ value: s.id, label: moduleName(s) }))} />
          </div>
          <div className="well row" style={{ marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
            <b style={{ fontWeight: 600 }}>{moduleName(sel)}站</b>
            <span className="num muted" style={{ fontSize: 12 }}>{fmtDate(sel.startAt)}–{fmtDate(sel.endAt)}</span>
            <span className="muted" style={{ fontSize: 12 }}>站带教 {stationMentorLabel(sel)} · 已通过 <span className="num">{api.stationSettle(sel).passed}</span>/<span className="num">{api.stationSettle(sel).total}</span></span>
            <span style={{ marginLeft: 'auto' }}><StationBadge s={sel} /></span>
          </div>
          <StationTasks station={sel} mine />
        </section>

        <section className="card s4" aria-label="周期任务">
          <CardHead title="周期任务" sub="按规则展开">
            <Segmented value={recAll} onChange={setRecAll} options={[{ value: 'near', label: '近期' }, { value: 'all', label: '全部' }]} />
          </CardHead>
          <RecurringList userId={me.id} all={recAll === 'all'} />
          <div className="note" style={{ marginTop: 14 }}><Icon name="bot" /><span>周报、轻测都在<b>带教机器人</b>里完成，这里只显示交没交和成绩；轻测没作答记「未答」，不算逾期。</span></div>
        </section>
      </div>
      <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>现在 {fmtDateTime(now)}（北京时间）· 逾期是标记不是状态：过了截止还没交会标红，交了就消失。</p>
    </GrowthSheet>
  );
}

// ---------------- 任务详情 ----------------
type Detail = NonNullable<ReturnType<typeof api.taskDetail>>;

function AdjustDrawer({ d, open, onClose }: { d: Detail; open: boolean; onClose: () => void }) {
  const { me } = useSession();
  const say = useToast();
  const cur = d.effectiveDueAt;
  const [date, setDate] = useState(bjYmd(cur));
  const [time, setTime] = useState(bjHm(cur));
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const revise = d.task.status === 'revise';
  const save = () => {
    if (!reason.trim()) { setMsg('写一句原因，会留痕给本人和管理员看'); return; }
    try {
      const iso = atBj(date, time);
      api.adjustDue(d.task.id, iso, reason, me);
      say(`${revise ? '修改截止' : '截止'}改到 ${fmtDateTime(iso)}，原因已留痕`);
      setReason(''); setMsg(''); onClose();
    } catch (e) { setMsg(err(e)); }
  };
  return (
    <Drawer open={open} onClose={onClose} title={revise ? '改修改截止' : '改截止'} sub={`${d.owner.name} · ${d.task.name}`}
      footer={<><button type="button" className="btn ghost" onClick={onClose}>取消</button><button type="button" className="btn pri" onClick={save}>保存并留痕</button></>}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="dl">
          <div><span className="k">现在</span><span className="v">{fmtDateTime(cur)} {fmtWeekday(cur)}</span></div>
          {d.task.originalDueAt && <div><span className="k">最早</span><span className="v">{fmtDateTime(d.task.originalDueAt)}（第一次调整前）</span></div>}
        </div>
        <div className="form-grid">
          <label className="field"><span>新日期</span><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="field"><span>时刻（北京时间）</span><input className="input" type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
        </div>
        <label className="field"><span>原因<em className="req">*</em></span><textarea className={msg && !reason.trim() ? 'textarea err' : 'textarea'} value={reason} onChange={e => setReason(e.target.value)} placeholder="例：客户资料晚到两天，顺延到周一" /><small>原截止、新截止、原因和你的名字都会记下来；管理员可以撤销。</small></label>
        {msg && <div className="errmsg" role="alert">{msg}</div>}
      </div>
    </Drawer>
  );
}

function ReviewDeadline({ d, viewerIsReviewer }: { d: Detail; viewerIsReviewer: boolean }) {
  const now = api.now();
  const r02 = api.allTodos('open').find(x => x.rule === 'R02' && x.subjectId === d.task.id);
  if (!r02?.dueAt) return null;
  const late = api.isTodoLate(r02);
  const left = Date.parse(r02.dueAt) - Date.parse(now);
  const near = !late && left < 24 * 3600000;
  const who = nameOf(r02.ownerId);
  const cls = late ? 'note due' : near ? 'note warn' : 'note';
  return (
    <div className={cls} style={{ marginTop: 14 }}>
      <Icon name={late ? 'alert' : 'clock'} />
      <span>
        {viewerIsReviewer ? '点评期限' : `等 ${who} 点评，期限`} <b>{fmtDue(r02.dueAt, now)}</b>（提交后 2 个工作日）
        {late ? <>，已超时 {Math.max(1, daysSince(r02.dueAt, now))} 天{r02.cc.length ? '，已抄送管理员' : '；再超 3 个工作日会抄送管理员'}。</> : near ? <>，<b>快超时</b>：还剩 {fmtCountdown(r02.dueAt, now)}。</> : <>，还剩 {fmtCountdown(r02.dueAt, now)}。</>}
      </span>
    </div>
  );
}

function SubmitForm({ d }: { d: Detail }) {
  const { me } = useSession();
  const say = useToast();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [change, setChange] = useState('');
  const [msg, setMsg] = useState('');
  const { task } = d;
  const resubmit = task.status === 'revise';
  const declare = task.completion === 'declare';
  const lastReview = d.reviews[0];
  const badUrl = url.trim() !== '' && !api.FEISHU_DOC.test(url.trim());
  const submit = () => {
    try {
      api.submitTask(task.id, { url, note, changeNote: change }, me);
      setUrl(''); setNote(''); setChange(''); setMsg('');
      say(declare ? '已声明完成，等管理员确认' : `已提交，${nameOf(d.responsibleMentorId)} 会在 2 个工作日内点评`);
    } catch (e) { setMsg(err(e)); }
  };
  return (
    <div className="stack" style={{ gap: 14, marginTop: 14 }}>
      {resubmit && lastReview && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="well" style={{ padding: 12 }}>
            <div className="row" style={{ fontSize: 12, color: 'var(--mute)', gap: 6 }}>上次评语 · {nameOf(lastReview.mentorId)}<span style={{ marginLeft: 'auto' }}><StatusPill tone="warn">{lastReview.grade}</StatusPill></span></div>
            <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.75, color: 'var(--ink2)' }}>{lastReview.comment}</p>
          </div>
          <label className="field"><span>这次改了什么<em className="req">*</em></span><textarea className="textarea" value={change} onChange={e => setChange(e.target.value)} placeholder="对着左边的评语，逐条写你改了哪里" /></label>
        </div>
      )}
      <label className="field">
        <span>飞书文档链接{declare ? '（选填）' : <em className="req">*</em>}</span>
        <input className={badUrl ? 'input err' : 'input'} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxx.feishu.cn/docx/…" />
        {badUrl ? <small className="errmsg">请贴飞书文档、表格或知识库链接</small> : <small>工作台只存链接，不存文件；文档权限由飞书控制。不支持草稿，提交即正式提交。</small>}
      </label>
      <label className="field"><span>给{declare ? '管理员' : '带教'}的话（选填）</span><textarea className="textarea" style={{ minHeight: 64 }} value={note} onChange={e => setNote(e.target.value)} placeholder="比如哪里还拿不准、想重点听哪方面的意见" /></label>
      {msg && <div className="errmsg" role="alert">{msg}</div>}
      <div className="row"><button type="button" className="btn pri" onClick={submit}><Icon name="upload" />{declare ? '声明已完成' : resubmit ? '再次提交' : '提交'}</button><span className="muted" style={{ fontSize: 12 }}>{declare ? '管理员确认通过或退回' : `交给 ${nameOf(d.responsibleMentorId)} 点评`}</span></div>
    </div>
  );
}

function ReviewForm({ d }: { d: Detail }) {
  const { me } = useSession();
  const say = useToast();
  const [grade, setGrade] = useState<Grade | ''>('');
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const declare = d.task.completion === 'declare';
  const send = (g: Grade) => {
    if (!declare && !comment.trim()) { setMsg('写一两句总评：哪里好、哪里要改'); return; }
    if (declare && g === '需改进' && !comment.trim()) { setMsg('退回要写原因'); return; }
    try {
      api.reviewTask(d.task.id, g, comment, me);
      const t = api.taskById(d.task.id);
      setGrade(''); setComment(''); setMsg('');
      if (declare) say(g === '需改进' ? '已退回，本人会收到修改提醒' : '已确认通过');
      else say(g === '需改进' && t?.reviseDueAt ? `已点评「需改进」，修改截止 ${fmtDateTime(t.reviseDueAt)}` : `已点评「${g}」，任务已通过`);
    } catch (e) { setMsg(err(e)); }
  };
  if (declare) {
    return (
      <div className="stack" style={{ gap: 12, marginTop: 14 }}>
        <label className="field"><span>说明（退回时必填）</span><textarea className="textarea" style={{ minHeight: 64 }} value={comment} onChange={e => setComment(e.target.value)} placeholder="例：缺少 10 月第 4 周的物料截图" /></label>
        {msg && <div className="errmsg" role="alert">{msg}</div>}
        <div className="row"><button type="button" className="btn pri" onClick={() => send('达标')}><Icon name="check" />确认通过</button><button type="button" className="btn danger" onClick={() => send('需改进')}>退回</button></div>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 12, marginTop: 14 }}>
      <div className="field"><span>评价</span><div><Segmented<Grade> value={grade as Grade} onChange={setGrade} options={GRADES.map(g => ({ value: g, label: g }))} /></div></div>
      <label className="field"><span>总评</span><textarea className="textarea" value={comment} onChange={e => setComment(e.target.value)} placeholder="一两句就够，细节可以留在飞书文档批注里" /><small>不打分、不设字数下限。评「需改进」会同时给修改截止：点评后 3 个工作日。</small></label>
      {msg && <div className="errmsg" role="alert">{msg}</div>}
      <div className="row"><button type="button" className="btn pri" disabled={!grade} onClick={() => grade && send(grade)}><Icon name="pen" />提交点评</button>{!grade && <span className="muted" style={{ fontSize: 12 }}>先选一档评价</span>}</div>
    </div>
  );
}

function ModeExplain({ d }: { d: Detail }) {
  const { me } = useSession();
  const { task } = d;
  const mine = me.id === task.userId;
  if (task.completion === 'bot-weekly') {
    const sub = d.submissions[0];
    return (
      <div className="stack" style={{ gap: 10, marginTop: 14 }}>
        <div className="note"><Icon name="bot" /><span>周报<b>只在带教机器人里交</b>，工作台只显示交没交，不在这里提交。带教只看不评。</span></div>
        <div className="well row" style={{ gap: 10 }}>
          <TaskStatusPill task={task} />
          <span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{sub ? `机器人 ${fmtDateTime(sub.at)} 收到` : d.canSee ? `截止 ${fmtDue(task.dueAt, api.now())}，还没收到` : '交没交只给本人、相关带教和管理员看'}</span>
          {sub?.url && <a className="go" style={{ marginLeft: 'auto' }} href={sub.url} target="_blank" rel="noopener noreferrer">在飞书中打开<Icon name="ext" /></a>}
        </div>
      </div>
    );
  }
  if (task.completion === 'bot-quiz') {
    const canScore = api.canSeeAssessment(me, task.userId);
    return (
      <div className="stack" style={{ gap: 10, marginTop: 14 }}>
        <div className="note"><Icon name="quiz" /><span>轻测由<b>带教机器人</b>出题，成绩自动写回；没作答记「未答」，<b>不算逾期</b>。不需要带教点评。</span></div>
        <div className="well row" style={{ gap: 12 }}>
          {canScore
            ? (typeof d.quizResult === 'number' ? <><span className="bignum">{d.quizResult}<small>分</small></span><span className="muted" style={{ fontSize: 12 }}>机器人写回</span></> : <><StatusPill tone="plain">{d.quizResult === '未答' ? '未答' : '待作答'}</StatusPill><span className="muted" style={{ fontSize: 12 }}>{d.quizResult === '未答' ? '这次没作答，不影响逾期' : mine ? `到飞书里打开带教机器人作答，${fmtDue(task.dueAt, api.now())} 截止` : `${fmtDue(task.dueAt, api.now())} 截止`}</span></>)
            : <span className="muted" style={{ fontSize: 12.5 }}><Icon name="lock" size={13} /> 轻测成绩属于考核，只给本人、主带教和管理员看。</span>}
        </div>
      </div>
    );
  }
  return null;
}

function History({ d }: { d: Detail }) {
  const items = [
    ...d.submissions.map(s => ({ at: s.at, k: 's' as const, s })),
    ...d.reviews.map(r => ({ at: r.at, k: 'r' as const, r })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (!items.length) return <Empty icon="inbox" title="还没有提交">交了之后，提交和点评会按时间排在这里。</Empty>;
  return (
    <div className="stack" style={{ gap: 0, marginTop: 6 }}>
      {items.map(h => h.k === 's' ? (
        <div key={h.s.id} className="row" style={{ alignItems: 'flex-start', gap: 12, padding: '12px 0', boxShadow: 'inset 0 -1px 0 var(--line)' }}>
          <Tile icon={h.s.channel === 'bot' ? 'bot' : 'link'} domain="grow" />
          <div className="grow1">
            <div className="row" style={{ gap: 8, fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>第 {h.s.version} 次提交</b><span className="muted">{h.s.channel === 'bot' ? '机器人' : '网页'} · {fmtDateTime(h.s.at)}</span></div>
            {h.s.url && <a className="go" href={h.s.url} target="_blank" rel="noopener noreferrer" style={{ marginTop: 4, wordBreak: 'break-all', whiteSpace: 'normal' }}>{h.s.url}<Icon name="ext" /></a>}
            {h.s.changeNote && <div className="well" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.7 }}><span className="muted">修改说明：</span>{h.s.changeNote}</div>}
            {h.s.note && <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.7 }}>{h.s.note}</p>}
          </div>
        </div>
      ) : (
        <div key={h.r.id} className="row" style={{ alignItems: 'flex-start', gap: 12, padding: '12px 0', boxShadow: 'inset 0 -1px 0 var(--line)' }}>
          <Avatar name={nameOf(h.r.mentorId)} color={api.findUser(h.r.mentorId)?.color} size="sm" />
          <div className="grow1">
            <div className="row" style={{ gap: 8, fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>{nameOf(h.r.mentorId)} {d.task.completion === 'declare' ? '确认' : '点评'}</b><span className="muted">{fmtDateTime(h.r.at)}</span><span style={{ marginLeft: 'auto' }}><StatusPill tone={h.r.grade === '需改进' ? 'warn' : 'ok'} icon={h.r.grade === '需改进' ? undefined : 'check'}>{d.task.completion === 'declare' ? (h.r.grade === '需改进' ? '已退回' : '已确认') : h.r.grade}</StatusPill></span></div>
            {h.r.comment && <p className="quote" style={{ marginTop: 10 }}>{h.r.comment}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimeCard({ d, onAdjust }: { d: Detail; onAdjust: () => void }) {
  const { me } = useSession();
  const say = useToast();
  const { task } = d;
  const now = api.now();
  const open = api.isOpen(task);
  const overdue = d.overdue;
  const canAdjust = d.canReview && open && task.completion !== 'bot-quiz';
  const undo = () => { try { api.undoDueAdjust(task.id, me); say('已撤销最近一次截止调整'); } catch (e) { say(err(e)); } };
  return (
    <section className="card" aria-label="时间">
      <CardHead title="时间" sub="按工作日日历">{canAdjust && <button type="button" className="btn sec xs" onClick={onAdjust}><Icon name="pen" />改截止</button>}</CardHead>
      {open && (
        <div className="well" style={{ marginTop: 14, padding: 14, ...(overdue ? { background: 'var(--due-soft)', boxShadow: 'none' } : {}) }}>
          <div className="row" style={{ fontSize: 12, gap: 6, color: overdue ? 'var(--due-ink)' : 'var(--ink2)', fontWeight: 500 }}><Icon name={overdue ? 'alert' : 'clock'} size={13} />{task.status === 'revise' ? '距修改截止' : '距截止'}</div>
          <div className="bignum" style={{ marginTop: 8, fontSize: 22, color: overdue ? 'var(--due-ink)' : undefined }}>{overdue ? `已逾期 ${Math.max(0, daysSince(d.effectiveDueAt, now))} 天` : fmtCountdown(d.effectiveDueAt, now)}</div>
        </div>
      )}
      <div className="dl" style={{ marginTop: 14 }}>
        <div><span className="k">开放日</span><span className="v">{dayWd(task.openAt)} {fmtTime(task.openAt)}</span></div>
        <div><span className="k">截止</span><span className="v">{dayWd(task.dueAt)} {fmtTime(task.dueAt)}{task.originalDueAt && <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>原截止 <s>{fmtDateTime(task.originalDueAt)}</s></span>}</span></div>
        {task.reviseDueAt && <div><span className="k">修改截止</span><span className="v" style={task.status === 'revise' ? { color: 'var(--warn-ink)', fontWeight: 600 } : undefined}>{dayWd(task.reviseDueAt)} {fmtTime(task.reviseDueAt)}<span className="muted" style={{ display: 'block', fontSize: 11.5, fontWeight: 400 }}>点评为「需改进」后 3 个工作日</span></span></div>}
      </div>
      {d.dueAdjustments.length > 0 && (
        <>
          <div className="sec-l"><span>截止调整留痕</span>{me.role === 'admin' && d.dueAdjustments[0]?.type === 'task.dueAdjusted' && <button type="button" className="go" onClick={undo}>撤销最近一次</button>}</div>
          <div className="stack" style={{ gap: 8 }}>
            {d.dueAdjustments.map(e => {
              const p = (e.payload ?? {}) as { from?: string; to?: string; reason?: string; restored?: string };
              return (
                <div key={e.id} className="well" style={{ fontSize: 12, lineHeight: 1.7 }}>
                  {e.type === 'task.dueAdjusted'
                    ? <><b style={{ fontWeight: 600 }}>{p.from ? fmtDateTime(p.from) : '—'} → {p.to ? fmtDateTime(p.to) : '—'}</b><div style={{ color: 'var(--ink2)' }}>原因：{p.reason}</div></>
                    : <><b style={{ fontWeight: 600 }}>撤销调整</b><div style={{ color: 'var(--ink2)' }}>恢复为 {p.restored ? fmtDateTime(p.restored) : '—'}</div></>}
                  <div className="muted">{nameOf(e.actorId)} · {fmtDateTime(e.at)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {!d.canSee && <p className="muted" style={{ marginTop: 12, fontSize: 11.5 }}>调整留痕只给本人、相关带教和管理员看。</p>}
    </section>
  );
}

function PeopleCard({ d }: { d: Detail }) {
  const { me } = useSession();
  const say = useToast();
  const { task, owner } = d;
  const mainId = api.mainMentorOf(task.userId);
  const canNudgeRole = me.id !== task.userId && (d.canReview || mainId === me.id);
  const nudge = () => { try { api.nudgeTask(task.id, me); say(`已催办，带教机器人会推到 ${owner.name} 的飞书`); } catch (e) { say(err(e)); } };
  return (
    <section className="card" aria-label="相关的人">
      <CardHead title="相关的人" />
      <div className="stack" style={{ gap: 12, marginTop: 14 }}>
        <Person id={owner.id} sub="本人 · 提交产出" />
        <Person id={d.responsibleMentorId} sub={task.kind === 'path' ? `负责带教 · ${d.module?.name ?? ''}站的站带教` : task.completion === 'declare' ? '负责确认 · 管理员' : '负责带教 · 主带教'} />
        {mainId !== d.responsibleMentorId && <Person id={mainId} sub="主带教 · 贯穿全期" />}
      </div>
      {canNudgeRole && api.isOpen(task) && (
        <>
          <div className="divider" />
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn sec sm" disabled={!d.canNudge} onClick={nudge} title={d.canNudge ? '通过带教机器人推到飞书' : '同一任务 24 小时内只能催一次'}><Icon name="bell" />{d.canNudge ? `催 ${owner.name}` : '24 小时内已催过'}</button>
            {d.lastNudge && <span className="muted" style={{ fontSize: 11.5 }}>上次 {fmtDateTime(d.lastNudge.at)} · {nameOf(d.lastNudge.actorId)}</span>}
          </div>
        </>
      )}
    </section>
  );
}

export function TaskDetail() {
  api.useDataVersion();
  const { id = '' } = useParams();
  const { me } = useSession();
  const say = useToast();
  const [adj, setAdj] = useState(false);
  const d = api.taskDetail(id, me);
  if (!d) {
    const exists = !!api.taskById(id);
    return (
      <GrowthSheet title="任务详情">
        <div className="card"><Empty size="lg" icon={exists ? 'lock' : 'search'} title={exists ? '这条任务你看不到' : '找不到这个任务'}>{exists ? '任务名称、状态和逾期标记只给本人、相关带教人和管理员看；团队里公开的只有在哪站、换站这类站级进度。' : '链接可能已失效，回到路径里再找一下。'}</Empty></div>
      </GrowthSheet>
    );
  }
  const { task, owner, module } = d;
  const mine = me.id === owner.id;
  const now = api.now();
  const reviewable = task.kind === 'path' || !!d.rule?.needsReview;
  const canSubmit = mine && (task.completion === 'link' || task.completion === 'declare') && (task.status === 'todo' || task.status === 'doing' || task.status === 'revise');
  const showReview = d.canReview && task.status === 'submitted' && reviewable;
  const start = () => { try { api.startTask(task.id, me); say('已开始，状态改为进行中'); } catch (e) { say(err(e)); } };
  const tpl = d.template;
  return (
    <GrowthSheet title="任务详情">
      <PageHead
        kicker={<>{task.kind === 'path' ? '路径任务' : '周期任务'}<i aria-hidden="true" />{module ? `${module.name}站` : '贯穿培养期'}<i aria-hidden="true" />{COMPLETION_LABEL[task.completion]}</>}
        title={task.name}
        sub={<>{owner.name} · 产出：{task.output} · 截止 {fmtDue(d.effectiveDueAt, now)}{task.status === 'revise' ? '（修改截止）' : ''}</>}
        right={<><TaskStatusPill task={task} label={d.statusLabel} size="lg" /><OverdueMark task={task} size="lg" /></>}
      />
      <div className="bento">
        <div className="stack s8">
          <section className="card" aria-label="要求">
            <CardHead title="要求" sub={tpl ? `建议用时 ${tpl.days} 个工作日` : d.rule ? `${freqText(d.rule.frequency)} ${d.rule.dueTime} 截止` : undefined}>
              {mine && task.status === 'todo' && task.completion === 'link' && <button type="button" className="btn sec xs" onClick={start}>开始</button>}
            </CardHead>
            <p style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.8, color: 'var(--ink2)' }}>{task.note || d.rule?.note}</p>
            {tpl && tpl.requirements.length > 0 && (
              <div className="rows" style={{ marginTop: 8 }}>
                {tpl.requirements.map((r, i) => (
                  <div key={r} className="rw" style={{ gridTemplateColumns: '28px minmax(0,1fr)' }}>
                    <span className="num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--grow-ink)' }}>{i + 1}</span><span style={{ lineHeight: 1.6, padding: '8px 0' }}>{r}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card" aria-label="提交与点评">
            <CardHead title={task.completion === 'declare' ? '声明与确认' : '提交与点评'} sub={d.canSee ? `${d.submissions.length} 次提交 · ${d.reviews.length} 条${task.completion === 'declare' ? '确认' : '点评'}` : undefined} />
            {!d.canSee ? (
              <div className="note" style={{ marginTop: 14 }}><Icon name="lock" /><span>提交内容和点评只给 {owner.name} 本人、<b>相关带教人</b>和管理员看。你能看到任务状态，看不到产出。</span></div>
            ) : (
              <>
                {d.readOnly && <div className="note" style={{ marginTop: 14 }}><Icon name="eye" /><span>你是 {owner.name} 路径上的带教，这条任务属于其他站，<b>只读</b>；点评和改截止由 {nameOf(d.responsibleMentorId)} 负责。</span></div>}
                <ModeExplain d={d} />
                {task.status === 'submitted' && reviewable && <ReviewDeadline d={d} viewerIsReviewer={d.canReview} />}
                {task.status === 'revise' && mine && <div className="note warn" style={{ marginTop: 14 }}><Icon name="sync" /><span>{nameOf(d.reviews[0]?.mentorId)} 评了「需改进」，按评语改完再交，<b>修改截止 {task.reviseDueAt ? fmtDue(task.reviseDueAt, now) : '—'}</b>。</span></div>}
                {canSubmit && <SubmitForm d={d} />}
                {showReview && <ReviewForm d={d} />}
                {d.canReview && !mine && task.status !== 'submitted' && api.isOpen(task) && task.completion === 'link' && <p className="muted" style={{ marginTop: 14, fontSize: 12.5 }}>{owner.name} 还没提交，交了之后可以在这里点评。</p>}
                <div className="divider" />
                <div className="sec-l" style={{ marginTop: 0 }}><span>记录</span><span>新的在前</span></div>
                <History d={d} />
              </>
            )}
          </section>
        </div>

        <div className="stack s4">
          <TimeCard d={d} onAdjust={() => setAdj(true)} />
          <PeopleCard d={d} />
          {d.assets.length > 0 && (
            <section className="reco" aria-label="这一步可以用" style={{ padding: 18 }}>
              <div className="r1"><span className="tile"><Icon name="spark" /></span>这一步可以用 · AI 推荐</div>
              {d.assets.slice(0, 2).map(a => (
                <div key={a.id} style={{ marginTop: 12 }}>
                  <Link to={`/ai/assets/${a.id}`} style={{ color: '#fff' }}><h2 style={{ fontSize: 17 }}>{a.title}<span className="kbd">{a.type.toUpperCase()}</span></h2></Link>
                  <p style={{ marginTop: 6 }}>{a.summary}</p>
                </div>
              ))}
              {d.assets[0]?.installCmd && <div style={{ marginTop: 12 }}><CopyBox text={d.assets[0].installCmd} /></div>}
            </section>
          )}
          {(tpl?.resources.length ?? 0) > 0 && (
            <section className="card" aria-label="相关资料">
              <CardHead title="相关资料" sub="知识库二期接入" />
              <div style={{ marginTop: 12 }}>
                {tpl!.resources.map(r => <div key={r.title} className="doc"><Tile icon="doc" domain="ment" /><span><b>{r.title}</b><small>{r.source}</small></span></div>)}
              </div>
            </section>
          )}
        </div>
      </div>
      {d.canReview && <AdjustDrawer key={`${task.id}-${d.effectiveDueAt}`} d={d} open={adj} onClose={() => setAdj(false)} />}
    </GrowthSheet>
  );
}

// ---------------- 带教看板 ----------------
const RULE_GO: Partial<Record<TodoRule, string>> = { R05: '看任务', R06: '看档案', R08: '去写', R09: '去处理' };
function todoHref(x: Todo) {
  if (x.rule === 'R08') return `/growth/handoff/${x.subjectId}`;
  if (x.rule === 'R09') { const left = api.stationTasks(x.subjectId).find(t => t.status !== 'passed'); return left ? `/growth/tasks/${left.id}` : `/growth/handoff/${x.subjectId}`; }
  if (x.subjectType === 'task') return `/growth/tasks/${x.subjectId}`;
  if (x.subjectType === 'station' && x.personId) return `/team/${x.personId}`;
  return '/todo';
}

export function MentorBoard() {
  api.useDataVersion();
  const { me, role } = useSession();
  const nav = useNavigate();
  const say = useToast();
  if (role !== 'mentor' && role !== 'admin') {
    return (
      <GrowthSheet title="带教看板">
        <div className="card"><Empty size="lg" icon="lock" title="带教看板只给站带教、主带教和管理员" action={<Link className="btn sec sm" to={role === 'trainee' ? '/growth/me' : '/growth/path'}>{role === 'trainee' ? '看我的路径' : '看路径总览'}</Link>}>看板里有每个人的任务状态和逾期标记，这些只给相关带教和管理员看。</Empty></div>
      </GrowthSheet>
    );
  }
  const now = api.now();
  const rows = api.boardRows(me);
  const queue = api.pendingReviews(me);
  const others = api.todosOf(me.id).filter(x => x.rule !== 'R02' && x.ownerId === me.id);
  const sum = role === 'mentor' ? api.mentorSummary(me) : null;
  const late = queue.filter(q => q.late).length;
  const overduePeople = rows.filter(r => r.overdue.length);
  const behind = rows.filter(r => r.progress.gap < 0).length;
  const twoWeeks = Date.parse(api.weekRange(1)[1]);
  const switching = rows.filter(r => { const n = api.nextStation(r.user.id); return n && Date.parse(n.startAt) < twoWeeks; });
  const relTags = (userId: string, stationMentorId?: string, mainMentorId?: string) => {
    if (role !== 'mentor') return [];
    const tags: { t: string; tone: Tone }[] = [];
    if (stationMentorId === me.id) tags.push({ t: '本站在带', tone: 'acc' });
    if (mainMentorId === me.id) tags.push({ t: '主带教', tone: 'info' });
    const n = api.nextStation(userId);
    if (stationMentorId !== me.id && n?.stationMentorId === me.id) tags.push({ t: `${fmtDate(n.startAt)} 到我站`, tone: 'warn' });
    if (!tags.length) tags.push({ t: '已交接出去', tone: 'plain' });
    return tags;
  };
  const prepared = (stationId: string, who: string) => { try { api.markStationPrepared(stationId, me); say(`已确认准备好接 ${who}，这条待办已关闭`); } catch (e) { say(err(e)); } };
  return (
    <GrowthSheet title="带教看板">
      <PageHead
        kicker={<>{fmtCn(now)} {fmtWeekday(now)}<i aria-hidden="true" />{fmtTime(now)}</>}
        title={sum ? <>{me.name}，在带 <em>{sum.current} 人</em></> : <>全员进度，<em>{rows.length} 位</em>管培生</>}
        sub={sum
          ? <>{sum.incoming ? `${sum.incomingAt ? fmtDate(sum.incomingAt) : ''} 到站 ${sum.incoming} 人 · ` : ''}上一站还有 {sum.leftoverUnreviewed} 份没评。这里看人和进度；谁哪天交、我哪天要评完，看日程「我带的人」。</>
          : <>谁在哪站、做完几成、待谁处理。按时间看换站和评估节点，去日程「轮岗排期」。</>}
        right={<Link className="pill" to={role === 'mentor' ? '/schedule/mentees' : '/schedule/rotation'}><Icon name="cal" size={13} />{role === 'mentor' ? '按时间看 · 我带的人' : '按时间看 · 轮岗排期'}</Link>}
      />

      <div className="metrics" style={{ marginTop: 20 }}>
        <Metric label={role === 'mentor' ? '待我点评' : '全员待点评'} value={String(queue.length)} unit="份" icon="pen" domain="grow" foot={late ? `${late} 份已超过 2 个工作日` : '都在时效内'} />
        <Metric label="有逾期的人" value={String(overduePeople.length)} unit={`/ ${rows.length} 人`} icon="alert" domain="exam" foot={overduePeople.length ? overduePeople.map(r => r.user.name).join('、') : '没有人逾期'} />
        <Metric label="落后计划" value={String(behind)} unit="人" icon="trend" domain="week" foot="已过截止但没通过的路径任务" />
        <Metric label="两周内换站" value={String(switching.length)} unit="人" icon="swap" domain="ment" foot={switching.length ? switching.map(r => `${r.user.name} ${fmtDate(api.nextStation(r.user.id)!.startAt)}`).join('、') : '近期没有换站'} />
      </div>

      <div className="bento">
        <section className="card s12" aria-label="进度">
          <CardHead title="人和进度" sub={`${rows.length} 人 · 有逾期的排前面 · 点一行看个人档案`} />
          {rows.length ? (
            <table className="tbl">
              <thead><tr><th>成员</th><th>当前站</th><th>时间 / 完成</th><th className="num">本周交付</th><th>逾期</th><th>最近点评</th><th>上一站</th><th className="num">待我做</th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const prev = api.stationsOf(r.user.id).find(s => s.order === r.station.order - 1);
                  const ps = prev ? api.stationSettle(prev) : null;
                  const lr = r.lastReview;
                  const lrTask = lr ? api.taskById(lr.taskId) : undefined;
                  const stop = (e: React.MouseEvent) => e.stopPropagation();
                  return (
                    <tr key={r.user.id} className="clickable" onClick={() => nav(`/team/${r.user.id}`)}>
                      <td>
                        <span className="row" style={{ gap: 10 }}><Avatar name={r.user.name} color={r.user.color} size="sm" /><span><b>{r.user.name}</b>
                          <span className="row" style={{ gap: 4, marginTop: 3, flexWrap: 'wrap' }}>{relTags(r.user.id, r.stationMentorId, r.mainMentorId).map(x => <StatusPill key={x.t} tone={x.tone}>{x.t}</StatusPill>)}{role === 'admin' && <span className="muted" style={{ fontSize: 11.5 }}>主带教 {mainMentorLabel(r.user.id)}</span>}</span>
                        </span></span>
                      </td>
                      <td><b>{r.module.name}站</b> · 第 {Math.floor(daysSince(r.station.startAt, now) / 7) + 1} 周<span className="s">站带教 {stationMentorLabel(r.station)}</span></td>
                      <td>
                        <div className="row" style={{ gap: 6, fontSize: 11.5 }}><span className="muted" style={{ width: 24 }}>时间</span><ProgressBar value={r.progress.time.pct} thin width={72} domain="week" /><span className="num" style={{ fontWeight: 600 }}>{r.progress.time.pct}%</span></div>
                        <div className="row" style={{ gap: 6, fontSize: 11.5, marginTop: 4 }}><span className="muted" style={{ width: 24 }}>完成</span><ProgressBar value={r.progress.completion.pct} thin width={72} domain="grow" /><span className="num" style={{ fontWeight: 600 }}>{r.progress.completion.pct}%</span>{r.progress.gap < 0 && <span style={{ color: 'var(--warn-ink)' }}>差 {-r.progress.gap} 条</span>}</div>
                      </td>
                      <td className="num"><span className="num" style={{ fontWeight: 600 }}>{r.weekDone}</span><span className="muted"> / {r.weekTotal}</span></td>
                      <td>{r.overdue.length ? <span title={r.overdue.map(t => t.name).join('、')}><StatusPill tone="due" icon="alert">{r.overdue.length} 项</StatusPill><span className="s" style={{ maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.overdue[0].name}</span></span> : <span className="muted">—</span>}</td>
                      <td>{lr ? <><StatusPill tone={lr.grade === '需改进' ? 'warn' : 'ok'}>{lr.grade}</StatusPill><span className="s">{lrTask?.name} · {fmtDate(lr.at)}</span></> : <span className="muted">—</span>}</td>
                      <td>
                        {prev && ps ? <>
                          <span>{moduleName(prev)} · {ps.passed === ps.total ? <span style={{ color: 'var(--grow-ink)' }}>已结清</span> : <span style={{ color: 'var(--warn-ink)' }}>{ps.total - ps.passed} 项未结</span>}</span>
                          <Link className="go" style={{ display: 'flex', fontSize: 11.5, marginTop: 2 }} to={`/growth/handoff/${prev.id}`} onClick={stop}>{r.prevHandover ? `交接要点 ${r.prevHandover.points.length} 条` : '交接要点'}<Icon name="right" /></Link>
                        </> : <span className="muted">—</span>}
                      </td>
                      <td className="num">{r.myTodos ? <Link to="/todo" onClick={stop}><StatusPill tone="acc">{r.myTodos}</StatusPill></Link> : <span className="muted">0</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <Empty icon="team" title="现在没有你带的人">开站前 5 个工作日起，即将到你站的人会出现在这里。</Empty>}
        </section>

        <section className="card s7" id="review" aria-label="待点评">
          <CardHead title="待点评" sub={`${queue.length} 份 · 按离超时排`} more={{ to: '/todo', label: '全部待办' }} />
          {queue.length ? (
            <div className="list">
              {queue.map(q => {
                const left = Date.parse(q.dueAt) - Date.parse(now);
                const tone: Tone = q.late ? 'due' : left < 24 * 3600000 ? 'warn' : 'plain';
                const st = api.stationOfTask(q.task);
                return (
                  <Link className="li" key={q.todo.id} to={`/growth/tasks/${q.task.id}`}>
                    <Avatar name={q.owner.name} color={q.owner.color} size="sm" />
                    <span className="tx"><b>{q.task.name}</b><span>{q.owner.name}{st ? ` · ${moduleName(st)}站` : ''} · 第 {q.sub.version} 次提交 · {fmtDateTime(q.sub.at)}{q.todo.ownerId !== me.id ? ` · 由 ${nameOf(q.todo.ownerId)} 点评` : ''}</span></span>
                    <span className="end"><StatusPill tone={tone} icon={q.late ? 'alert' : 'clock'}>{q.late ? `已超时 · ${fmtDate(q.dueAt)}` : left < 24 * 3600000 ? `快超时 · ${fmtCountdown(q.dueAt, now)}` : `${fmtDue(q.dueAt, now)} 前`}</StatusPill></span>
                  </Link>
                );
              })}
            </div>
          ) : <Empty icon="check" title="都评完了">新的提交进来后会排在这里，2 个工作日内评完。</Empty>}
        </section>

        <section className="card s5" aria-label="其他待我做">
          <CardHead title="其他待我做" sub={`${others.length} 件`} more={{ to: '/todo', label: '待办' }} />
          {others.length ? (
            <div className="list">
              {others.slice(0, 6).map(x => (
                <div className="li" key={x.id}>
                  <span className={`di ${x.rule === 'R05' ? 'd-exam' : 'd-ment'}`}><Icon name={x.rule === 'R06' ? 'swap' : x.rule === 'R08' ? 'doc' : x.rule === 'R05' ? 'alert' : 'inbox'} /></span>
                  <span className="tx"><b><Link to={todoHref(x)}>{x.title}</Link></b><span>{TODO_RULE_LABEL[x.rule]}{x.dueAt ? ` · ${api.isTodoLate(x) ? '已过期限 ' : '期限 '}${fmtDue(x.dueAt, now)}` : ''}{x.escalated ? ' · 已转管理员' : ''}</span></span>
                  <span className="end">
                    {x.rule === 'R06'
                      ? <button type="button" className="btn sec xs" onClick={() => prepared(x.subjectId, nameOf(x.personId))}><Icon name="check" />已准备</button>
                      : <Link className="go" to={todoHref(x)}>{RULE_GO[x.rule] ?? '去处理'}<Icon name="right" /></Link>}
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty icon="todo" title="没有别的事">换站接人、交接要点、逾期跟进出现时会排在这里。</Empty>}
        </section>
      </div>
    </GrowthSheet>
  );
}

// ---------------- 交接要点 ----------------
export function HandoffNotes() {
  const { stationId = '' } = useParams();
  return <HandoffPage key={stationId} stationId={stationId} />;
}
function HandoffPage({ stationId }: { stationId: string }) {
  api.useDataVersion();
  const { me } = useSession();
  const say = useToast();
  const s = api.stationById(stationId);
  const note = s ? api.handoverOf(s.id) : undefined;
  const [pts, setPts] = useState<string[]>(() => [0, 1, 2].map(i => note?.points[i] ?? ''));
  const [msg, setMsg] = useState('');
  if (!s) return <GrowthSheet title="交接要点"><div className="card"><Empty size="lg" icon="search" title="找不到这一站">链接可能已失效，从带教看板或待办里重新进入。</Empty></div></GrowthSheet>;
  const now = api.now();
  const owner = api.userById(s.userId);
  const mod = moduleName(s);
  const next = api.nextStationOf(s);
  const writer = api.stationMentorOf(s);
  const nextMentor = next ? api.stationMentorOf(next) : undefined;
  const exempt = !!next && nextMentor === writer;
  const due = api.handoverDueAt(s.id);
  const pos = api.stationTimePos(s);
  const late = !note && !exempt && !!next && pos === 'left' && !!due && Date.parse(now) > Date.parse(due);
  const canView = note ? api.canSeeHandover(me, note) : me.role === 'admin' || (me.id !== s.userId && api.isRelatedMentor(me, s.userId));
  const canWrite = !!next && !exempt && (me.role === 'admin' || writer === me.id);
  const status: { t: string; tone: Tone } = note ? { t: '已写', tone: 'ok' } : !next ? { t: '最后一站，不用写', tone: 'plain' } : exempt ? { t: '免写', tone: 'plain' } : pos !== 'left' ? { t: '站还没结束', tone: 'plain' } : late ? { t: '已过期限', tone: 'due' } : { t: '待写', tone: 'warn' };
  const history = canView ? api.handoverCard(s.userId, me).filter(x => x.station.id !== s.id) : [];
  const save = () => {
    try { api.writeHandover(s.id, pts, me); setMsg(''); say(`交接要点已保存，${next ? `下一站带教 ${nameOf(nextMentor)} 和` : ''}管理员能看到`); }
    catch (e) { setMsg(err(e)); }
  };
  return (
    <GrowthSheet title="交接要点" action={null}>
      <PageHead
        kicker={<>交接要点<i aria-hidden="true" />站末由原站带教填写</>}
        title={<>{owner.name} · <em>{mod}站</em>交接</>}
        sub={<>{fmtDate(s.startAt)}–{fmtDate(s.endAt)} · 站带教 {stationMentorLabel(s)}{next ? <> → 下一站 {moduleName(next)}（{fmtDate(next.startAt)} 起）· 站带教 {stationMentorLabel(next)}</> : ' · 这是最后一站'}</>}
        right={<StatusPill tone={status.tone} size="lg" icon={note ? 'check' : undefined}>{status.t}</StatusPill>}
      />
      {!canView ? (
        <div className="card" style={{ marginTop: 20 }}><Empty size="lg" icon="lock" title="交接要点只给相关带教和管理员看">{me.id === s.userId ? '这是带教之间交接用的，写的是怎么带你更合适；点评和进度你在自己的路径里都能看到。' : `你不在 ${owner.name} 的带教名单里，或者还没到开站前 5 个工作日。`}</Empty></div>
      ) : (
        <div className="bento">
          <section className="card s8 vcol stretch" aria-label="要点">
            <CardHead title="要点" sub="最多 3 条，写给下一站带教">{note && <span className="muted" style={{ fontSize: 12 }}>{nameOf(note.authorId)} · {fmtDateTime(note.at)}</span>}</CardHead>
            {exempt ? (
              <Empty icon="check" title={`连续两站都是 ${nameOf(writer)} 带，免写`}>同一位带教接着带，不需要交接；这一站不生成「写交接要点」待办。</Empty>
            ) : !next ? (
              <Empty icon="flag" title="最后一站不用交接" />
            ) : canWrite ? (
              <div className="stack" style={{ gap: 12, marginTop: 14 }}>
                {pts.map((p, i) => (
                  <label key={i} className="field">
                    <span>第 {i + 1} 条{i === 0 && <em className="req">*</em>}</span>
                    <textarea className="textarea" style={{ minHeight: 64 }} value={p} onChange={e => setPts(pts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={['这一站他做得好的地方，下一站可以接着用', '还需要盯的短板，下一站多练什么', '性格、沟通方式上要注意的'][i]} />
                  </label>
                ))}
                {msg && <div className="errmsg" role="alert">{msg}</div>}
                <div className="row"><button type="button" className="btn pri" onClick={save}><Icon name="check" />{note ? '保存修改' : '保存交接要点'}</button><span className="muted" style={{ fontSize: 12 }}>保存后给下一站带教 {nameOf(nextMentor)} 和管理员看，不给本人看；再写会覆盖。</span></div>
              </div>
            ) : note ? (
              <>
                {nextMentor === me.id && <div className="note" style={{ marginTop: 14 }}><Icon name="eye" /><span>你是下一站带教，这里<b>只读</b>；有疑问直接找 {nameOf(writer)}。</span></div>}
                <ol style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'grid', gap: 10 }}>
                  {note.points.map((p, i) => (
                    <li key={i} className="well row" style={{ alignItems: 'flex-start', gap: 12, padding: 14 }}>
                      <span className="num" style={{ width: 24, height: 24, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--ment-soft)', color: 'var(--ment-ink)', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                      <span style={{ fontSize: 13.5, lineHeight: 1.75 }}>{p}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <Empty icon="clock" title={`${nameOf(writer)} 还没写`}>{pos === 'left' ? `期限 ${due ? fmtDue(due, now) : '—'}，写好后你会在这里看到。` : '站结束后 2 个工作日内写，写好后你会在这里看到。'}</Empty>
            )}
          </section>

          <div className="stack s4">
            <section className="card" aria-label="期限">
              <CardHead title="期限" sub="规则 R08" />
              {due && next && !exempt ? (
                <div className={`well`} style={{ marginTop: 14, padding: 14, ...(late ? { background: 'var(--due-soft)', boxShadow: 'none' } : {}) }}>
                  <div className="row" style={{ fontSize: 12, gap: 6, color: late ? 'var(--due-ink)' : 'var(--ink2)', fontWeight: 500 }}><Icon name={late ? 'alert' : 'clock'} size={13} />站结束后 2 个工作日</div>
                  <div className="bignum" style={{ marginTop: 8, fontSize: 22, color: late ? 'var(--due-ink)' : undefined }}>{dayWd(due)} {fmtTime(due)}</div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{note ? `已于 ${fmtDateTime(note.at)} 写好` : late ? `已过 ${Math.max(1, daysSince(due, now))} 天` : pos === 'left' ? `还剩 ${fmtCountdown(due, now)}` : `${fmtDate(s.endAt)} 站结束后开始计时`}</div>
                </div>
              ) : <p className="muted" style={{ marginTop: 12, fontSize: 12.5 }}>{exempt ? '免写，没有期限。' : '最后一站，没有期限。'}</p>}
              <div className="dl" style={{ marginTop: 14 }}>
                <div><span className="k">谁写</span><span className="v">原站带教 {stationMentorLabel(s)}</span></div>
                <div><span className="k">谁看</span><span className="v">下一站带教、主带教和管理员；本人看不到</span></div>
                <div><span className="k">免写</span><span className="v">连续两站同一位带教</span></div>
              </div>
            </section>

            <section className="card" aria-label="这一站">
              <CardHead title={`${mod}站结果`} more={{ to: `/team/${owner.id}`, label: '档案' }} />
              {(() => {
                const list = api.stationTasks(s.id);
                const st = api.stationSettle(s);
                return (
                  <>
                    <div className="row" style={{ marginTop: 12, gap: 8 }}><span className="bignum">{st.passed}<small>/{st.total}</small></span><span className="muted" style={{ fontSize: 12 }}>路径任务已通过</span><span style={{ marginLeft: 'auto' }}><StationBadge s={s} /></span></div>
                    <div className="rows" style={{ marginTop: 8 }}>
                      {list.map(t => (
                        <Link key={t.id} to={`/growth/tasks/${t.id}`} className="rw" style={{ gridTemplateColumns: 'minmax(0,1fr) auto', minHeight: 38 }}>
                          <span className="nm" style={{ fontWeight: 400 }}>{t.name}</span><span className="end"><TaskStatusPill task={t} /></span>
                        </Link>
                      ))}
                    </div>
                  </>
                );
              })()}
            </section>

            <section className="card flat" aria-label="站评">
              <div className="row" style={{ gap: 8 }}><Tile icon="award" domain="exam" size="sm" /><b style={{ fontWeight: 600, fontSize: 13 }}>站评</b><span className="tag" style={{ height: 20, fontSize: 10.5, padding: '0 7px' }}>二期</span></div>
              <p className="muted" style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7 }}>二期随考核模块上线：本站带教写三档 + 评语，和交接要点写在同一处；轮岗阶段评估由主带教依据各站站评汇总。</p>
            </section>
          </div>

          {history.length > 0 && (
            <section className="card s12" aria-label="历次交接">
              <CardHead title="历次交接" sub={`${owner.name} 此前各站`} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginTop: 14 }}>
                {history.map(h => (
                  <Link key={h.station.id} to={`/growth/handoff/${h.station.id}`} className="well" style={{ padding: 14, display: 'block' }}>
                    <div className="row" style={{ gap: 8 }}><b style={{ fontWeight: 600 }}>{h.module.name}站</b><span className="muted num" style={{ fontSize: 11.5 }}>{fmtDate(h.station.startAt)}–{fmtDate(h.station.endAt)}</span><span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>{nameOf(h.note!.authorId)}</span></div>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 12.5, lineHeight: 1.7, color: 'var(--ink2)' }}>{h.note!.points.map(p => <li key={p}>{p}</li>)}</ul>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </GrowthSheet>
  );
}
