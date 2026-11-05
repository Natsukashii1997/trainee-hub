import { Link, useNavigate } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import { CopyBox, Empty, Face, GradeChip, Icon, Ring, StatusChip, useSession } from '../components/ui';
import * as api from '../data/api';
import { fmtCountdown, fmtDate, fmtDue, fmtFull, fmtTime, fmtWeekday, isoWeek, daysSince } from '../lib/time';
import type { User } from '../data/types';

const W = () => `W${isoWeek(api.now())}`;

function Feed({ limit = 3 }: { limit?: number }) {
  return (
    <div className="list">
      {api.feedList().slice(0, limit).map(f => {
        const u = api.userById(f.actorId);
        return <div className="ev" key={f.id}><span className="face md" style={{ background: u.color }}>{u.name[0]}</span><div><b>{u.name}</b> {f.text}</div><time>{fmtDate(f.at)}</time></div>;
      })}
    </div>
  );
}
function EventPin() {
  const e = api.nextEvent;
  return (
    <div className="pin">
      <div className="dtile"><span>NOV</span><b className="num">{fmtDate(e.startAt).slice(3)}</b></div>
      <div><h3>{e.title}</h3><p>{fmtWeekday(e.startAt)} {fmtTime(e.startAt)} · 主讲 {api.userById(e.speakerId).name} · {e.place}</p></div>
      <button className="btn sec" type="button">加入日历</button>
    </div>
  );
}
function Board({ me, title = '11 月贡献榜' }: { me?: User; title?: string }) {
  const lb = api.leaderboard();
  const top = lb.slice(0, 4);
  const mine = me ? lb.findIndex(x => x.user.id === me.id) : -1;
  return (
    <div className="card s4">
      <div className="ch"><h2>{title}</h2><span>按贡献条数 · 三期换积分</span></div>
      <div className="list">
        {top.map((x, i) => <div className={`lr${x.user.id === me?.id ? ' you' : ''}`} key={x.user.id}><span className="n">{i + 1}</span><Face user={x.user} size="sm" /><span>{x.user.id === me?.id ? '你' : x.user.name}</span><span className="p num">{x.count}</span></div>)}
        {me && mine >= 4 && <div className="lr you"><span className="n">{mine + 1}</span><Face user={me} size="sm" /><span>你</span><span className="p num">{lb[mine].count}</span></div>}
        {me && mine < 0 && <div className="lr you"><span className="n">—</span><Face user={me} size="sm" /><span>你还没有贡献</span><span className="p num">0</span></div>}
      </div>
      <a className="tid" href="https://tidings.natsukashii.cn" target="_blank" rel="noopener noreferrer"><span><b>外部发现 · Tidings</b>今日 Skill 榜与 AI 日报</span><Icon name="arrow" /></a>
    </div>
  );
}

// ---------------- 管培生 ----------------
function TraineeHome({ me }: { me: User }) {
  const nav = useNavigate();
  const now = api.now();
  const pos = api.currentPosition(me.id);
  const prog = api.timeProgress(me.id);
  const week = api.weekTasksOf(me.id).concat(api.tasksOf(me.id).filter(t => api.isOpen(t) && !api.weekTasksOf(me.id).includes(t) && Date.parse(t.dueAt) < Date.parse(api.weekRange(1)[1]))).slice(0, 5);
  const open = api.tasksOf(me.id).filter(api.isOpen);
  const focus = open.slice(0, 2);
  const lastRv = api.latestReviewOf(me.id);
  const cur = open.find(t => t.kind === 'path');
  const tpl = api.templateById(cur?.templateId);
  const rec = api.assetsForTemplate(tpl)[0];
  const res = api.resourcesForModule(pos?.module.id);
  const behind = open.some(api.isOverdue);
  const todayCount = open.filter(t => daysSince(t.dueAt, now) >= -1).length;
  return (
    <>
      <div className="head">
        <div><div className="dt">{fmtFull(now)} · 培养第 {prog.day} / {prog.total} 天</div><h1>{me.name}，近两天有 <em>{todayCount} 件事</em>要处理</h1></div>
        <div className="wk" aria-hidden="true">{W()}</div>
      </div>
      <div className="focus">
        {focus.map((t, i) => (
          <div className="fc" key={t.id}>
            <span className={`fi${i === 0 ? ' hot' : ''}`}><Icon name={i === 0 ? 'clock' : 'pen'} /></span>
            <div>
              <div className="k">{fmtDue(t.dueAt, now)} · {t.kind === 'path' ? `${api.moduleById(t.moduleId!).name}岗` : '周期任务'}</div>
              <h3>{t.name}</h3>
              <div className="m">{t.progress ? <><span className="mini"><i style={{ width: `${t.progress * 100}%` }} /></span>已完成 {Math.round(t.progress * 100)}%</> : <>还剩 <b>{fmtCountdown(t.dueAt, now)}</b></>}</div>
            </div>
            <Link className={`btn ${i === 0 ? 'pri' : 'sec'}`} to={`/growth/tasks/${t.id}`}>{t.status === 'doing' ? '继续' : '开始'}</Link>
          </div>
        ))}
      </div>
      <div className="bento">
        <div className="card s5 stretch">
          <div className="ch"><h2>我的进度</h2><Link to="/growth/me">完整路径 →</Link></div>
          <div className="pg">
            <Ring pct={prog.pct} label={`${prog.pct}%`} sub={behind ? '有任务逾期' : '按计划进行'} />
            <div className="stl">
              {api.stagesAll().map(s => {
                const ms = api.modulesOf(s.id);
                const st = ms.every(m => api.moduleState(me.id, m.id) === 'done') ? 'ok' : ms.some(m => api.moduleState(me.id, m.id) !== 'todo') ? 'cur' : '';
                const p = api.pathOf(me.id)!.modules.filter(m => ms.some(x => x.id === m.moduleId));
                return <div className={`st ${st}`} key={s.id}><span className="d" />{s.name}<span className="num">{st === 'ok' ? fmtDate(p[p.length - 1].endAt) : st === 'cur' ? `至 ${fmtDate(p[p.length - 1].endAt)}` : fmtDate(p[0].startAt)}</span></div>;
              })}
            </div>
          </div>
          {pos && pos.rotIndex >= 0 && (
            <div className="mods">
              <div className="k"><span>轮岗 · 第 {pos.rotIndex + 1} / {pos.rotation.length} 站</span><b>{pos.module.name}岗 · 第 {pos.week} 周</b></div>
              <div className="seg">{pos.rotation.map(m => { const s = api.moduleState(me.id, m.moduleId); return <div key={m.moduleId} className={s === 'done' ? 'ok' : s === 'cur' ? 'cur' : ''}><i />{api.moduleById(m.moduleId).name}</div>; })}</div>
            </div>
          )}
        </div>
        <div className="card s7 stretch">
          <div className="ch"><h2>本周任务</h2><span>{week.length} 项 · 按截止时间</span></div>
          <table className="tbl">
            <thead><tr><th>任务</th><th>类型</th><th>截止</th><th>状态</th><th /></tr></thead>
            <tbody>
              {week.map(t => (
                <tr key={t.id} className="clickable" onClick={() => nav(`/growth/tasks/${t.id}`)}>
                  <td><b>{t.name}</b><span className="s">{t.kind === 'path' ? `${api.moduleById(t.moduleId!).name}岗 · 产出：${t.output}` : t.note.slice(0, 18)}</span></td>
                  <td><span className="typ">{t.kind === 'path' ? '路径' : '周期'}</span></td>
                  <td className="mono">{fmtDue(t.dueAt, now)}</td>
                  <td><StatusChip task={t} /></td>
                  <td><span className="go">{t.status === 'submitted' || t.status === 'passed' ? '查看' : '去提交'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card s4 fb stretch">
          <div className="ch"><h2>最新点评</h2><Link to="/growth/me">全部 →</Link></div>
          {lastRv ? (() => { const m = api.userById(lastRv.mentorId); const t = api.taskById(lastRv.taskId)!; return (<>
            <div className="who"><Face user={m} size="md" /><div><b>{m.name}</b><span>{t.moduleId ? `${api.moduleById(t.moduleId).name}岗 · ` : ''}{t.name}</span></div></div>
            <blockquote>{lastRv.comment}</blockquote>
            <div className="ft"><GradeChip grade={lastRv.grade} /><span>{fmtDate(lastRv.at)}</span></div>
          </>); })() : <Empty title="还没有点评">提交产出后，带教人的点评会出现在这里。</Empty>}
        </div>
        <div className="card s4 ai stretch">
          <div className="ch"><h2>这一步可以用</h2><span>{cur ? `关联：${cur.name}` : ''}</span></div>
          {rec ? (<>
            <h3>{rec.title}</h3>
            <p>{rec.summary}</p>
            <div className="meta"><span>{rec.type.toUpperCase()}</span><span>{api.userById(rec.authorId).name}</span><span>{api.uses(rec)} 人用过</span></div>
            {rec.installCmd ? <CopyBox text={rec.installCmd} /> : <Link className="btn sec sm" style={{ marginTop: 16 }} to={`/ai/assets/${rec.id}`}>查看</Link>}
          </>) : <p>当前任务还没有推荐的 AI 资产。</p>}
        </div>
        <div className="card s4 stretch">
          <div className="ch"><h2>{pos?.module.name}岗资料</h2><span>二期接入知识库</span></div>
          <div className="list">
            {res.length ? res.map(r => <div className="li" key={r.id}><span className="di"><Icon name={r.source.startsWith('FAQ') ? 'q' : 'file'} /></span><div className="tx"><b>{r.title}</b><span>{r.source}</span></div></div>) : <Empty title="暂无资料" />}
          </div>
        </div>
        <div className="card s8 stretch">
          <div className="ch"><h2>团队动态</h2><Link to="/team">全部 →</Link></div>
          <EventPin />
          <Feed />
        </div>
        <Board me={me} />
      </div>
    </>
  );
}

// ---------------- 带教人 ----------------
function MentorHome({ me }: { me: User }) {
  const now = api.now();
  const rows = api.boardRows(me);
  const queue = api.pendingReviews(me);
  const oldest = queue[0];
  const late = rows.find(r => r.overdue.length);
  const cal = api.calendarOf(me.id);
  const mine = api.assetsBy(me.id).filter(a => a.status === 'live');
  return (
    <>
      <div className="head">
        <div><div className="dt">{fmtFull(now)} · 本期带教 {rows.length} 人 · {me.line}</div><h1>{me.name}，有 <em>{queue.length} 份产出</em>等你点评</h1></div>
        <div className="wk" aria-hidden="true">{W()}</div>
      </div>
      <div className="focus">
        {oldest ? (
          <div className="fc">
            <span className="fi acc"><Icon name="pen" /></span>
            <div><div className="k">待点评 · 等得最久</div><h3>{oldest.task.name} · {oldest.owner.name}</h3><div className="m">{fmtDate(oldest.sub.at)} 提交 · 已等待 <b>{Math.max(daysSince(oldest.sub.at, now), 0)} 天</b></div></div>
            <Link className="btn pri" to={`/growth/tasks/${oldest.task.id}`}>去点评</Link>
          </div>
        ) : <div className="fc"><span className="fi"><Icon name="check" /></span><div><div className="k">待点评</div><h3>都评完了</h3></div><span /></div>}
        {late ? (
          <div className="fc">
            <span className="fi hot"><Icon name="alert" /></span>
            <div><div className="k">需要跟进</div><h3>{late.user.name} · {late.overdue[0].name}逾期</h3><div className="m">应于 {fmtDate(late.overdue[0].dueAt)} 提交 · 已逾期 <b>{daysSince(late.overdue[0].dueAt, now)} 天</b></div></div>
            <button className="btn sec" type="button">飞书提醒</button>
          </div>
        ) : <div className="fc"><span className="fi"><Icon name="check" /></span><div><div className="k">需要跟进</div><h3>没有逾期</h3></div><span /></div>}
      </div>
      <div className="bento">
        <div className="card s8 stretch">
          <div className="ch"><h2>带教看板</h2><Link to="/growth/board">完整看板 →</Link></div>
          <BoardTable rows={rows} />
        </div>
        <div className="card s4 stretch">
          <div className="ch"><h2>待点评</h2><span>{queue.length} 份 · 先到先评</span></div>
          <div className="list">
            {queue.length ? queue.map(q => <Link className="li" to={`/growth/tasks/${q.task.id}`} key={q.task.id}><Face user={q.owner} size="md" /><div className="tx"><b>{q.task.name}</b><span>{q.task.moduleId ? `${api.moduleById(q.task.moduleId).name}岗` : '周期'} · {q.owner.name}</span></div><span className="end">{fmtDate(q.sub.at)}</span></Link>) : <Empty title="都评完了" />}
          </div>
        </div>
        <div className="card s4 stretch">
          <div className="ch"><h2>本周带教安排</h2><span>二期接飞书日历</span></div>
          <div className="list">{cal.map(c => <div className="li" key={c.id}><span className="di"><Icon name="cal" /></span><div className="tx"><b>{c.title}</b><span>{fmtDue(c.startAt, now).replace(/ \d\d:\d\d$/, '')} {fmtTime(c.startAt)}{c.endAt !== c.startAt ? ` – ${fmtTime(c.endAt)}` : ''}</span></div></div>)}</div>
        </div>
        <div className="card s4 stretch">
          <div className="ch"><h2>我贡献的资产</h2><Link to="/ai/assets">AI 资产库 →</Link></div>
          <div className="list">{mine.map(a => <Link className="li" to={`/ai/assets/${a.id}`} key={a.id}><span className="di"><Icon name="spark" /></span><div className="tx"><b>{a.title}</b><span>{a.type} · 已上架</span></div><span className="end">{api.uses(a)} 人用过</span></Link>)}</div>
          <Link className="tid" to="/ai/submit"><span><b>把好用的方法沉淀下来</b>上架后计入你的贡献</span><Icon name="plus" /></Link>
        </div>
        <div className="card s4 stretch"><div className="ch"><h2>团队动态</h2><Link to="/team">全部 →</Link></div><Feed /></div>
      </div>
    </>
  );
}

export function BoardTable({ rows }: { rows: ReturnType<typeof api.boardRows> }) {
  const nav = useNavigate();
  return (
    <table className="tbl">
      <thead><tr><th>管培生</th><th>当前岗位</th><th>本周提交</th><th>最近评价</th><th>状态</th><th /></tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.user.id} className="clickable" onClick={() => nav(`/team/${r.user.id}`)}>
            <td><div className="who2"><Face user={r.user} size="md" /><div><b>{r.user.name}</b><span className="s">第 {r.progress.day} 天</span></div></div></td>
            <td>{r.pos ? `${r.pos.module.name}岗 · 第 ${r.pos.week} 周` : '—'}</td>
            <td><div className="pbar"><span className="mini"><i style={{ width: `${r.weekTotal ? (r.weekDone / r.weekTotal) * 100 : 0}%` }} /></span>{r.weekDone} / {r.weekTotal}</div></td>
            <td>{r.lastReview ? <GradeChip grade={r.lastReview.grade} /> : <span className="chip plain">暂无</span>}</td>
            <td>{r.overdue.length ? <span className="chip due">逾期 {r.overdue.length} 项</span> : <span className="chip plain">正常</span>}</td>
            <td><span className="go">查看</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------- 管理员 ----------------
function AdminHome({ me }: { me: User }) {
  const now = api.now();
  const rows = api.boardRows(me);
  const pending = api.listAssets({ status: 'pending' });
  const late = rows.filter(r => r.overdue.length);
  const rate = api.onTimeRate(0) ?? 0;
  const last = api.onTimeRate(-1);
  const active = api.trainees().filter(api.isActiveThisWeek);
  const inactive = api.trainees().filter(u => !api.isActiveThisWeek(u));
  const fresh = api.newAssetsThisMonth();
  const ann = api.latestAnnouncement();
  const tr = api.trainees().length;
  return (
    <>
      <div className="head">
        <div><div className="dt">2026 秋季班 · {tr} 人 · 第 {isoWeek(now)} 周</div><h1>{me.name}，本周整体<em>{late.length ? `有 ${late.length} 人需要关注` : '按计划推进'}</em></h1></div>
        <div className="wk" aria-hidden="true">{W()}</div>
      </div>
      <div className="focus">
        <div className="fc">
          <span className="fi acc"><Icon name="shield" /></span>
          <div><div className="k">审核队列</div><h3>{pending.length} 条贡献等你审核</h3><div className="m">{[...new Set(pending.map(a => a.type))].map(t => `${pending.filter(a => a.type === t).length} 个 ${t}`).join(' · ')}{pending[0] ? ` · 最早 ${fmtDate(pending.reduce((a, b) => (a.submittedAt < b.submittedAt ? a : b)).submittedAt)} 提交` : ''}</div></div>
          <Link className="btn pri" to="/admin/review">去审核</Link>
        </div>
        <div className="fc">
          <span className="fi hot"><Icon name="alert" /></span>
          <div><div className="k">需要关注</div><h3>{late.length} 人有逾期</h3><div className="m"><span className="stack">{late.map(r => <Face key={r.user.id} user={r.user} />)}</span>{late.map(r => r.user.name).join('、')} · 共 {late.reduce((s, r) => s + r.overdue.length, 0)} 项</div></div>
          <Link className="btn sec" to="/growth/board">查看</Link>
        </div>
      </div>
      <div className="bento">
        <div className="card s12 stats">
          <div className="sx"><div className="l">按时提交率 <span className="chip acc">主指标</span></div><div className="v num">{rate}<small>%</small></div><div className="d">{last !== null && <span className="up">{rate - last >= 0 ? '+' : ''}{rate - last}%</span>}较上周</div>
            <svg className="spark" viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden="true"><path className="a" d="M0 22 L40 20 L80 24 L120 16 L160 14 L200 9 L200 30 L0 30Z" /><path className="l" d="M0 22 L40 20 L80 24 L120 16 L160 14 L200 9" /><circle cx="198" cy="9" r="3" /></svg></div>
          <div className="sx"><div className="l">逾期任务</div><div className="v num">{late.reduce((s, r) => s + r.overdue.length, 0)}</div><div className="d">涉及 {late.length} 人</div></div>
          <div className="sx"><div className="l">本月新上架资产</div><div className="v num">{fresh.length}</div><div className="d">{['Skill', 'Prompt', '工作流', '用例'].map(t => `${t} ${fresh.filter(a => a.type === t).length}`).join(' · ')}</div></div>
          <div className="sx"><div className="l">本周活跃</div><div className="v num">{active.length}<small>/ {tr} 人</small></div><div className="d">{inactive.length ? `未登录：${inactive.map(u => u.name).join('、')}` : '全员活跃'}</div></div>
        </div>
        <div className="card s8 stretch">
          <div className="ch"><h2>全员进度</h2><Link to="/growth/board">完整看板 →</Link></div>
          <BoardTable rows={rows} />
        </div>
        <div className="card s4 stretch">
          <div className="ch"><h2>审核队列</h2><Link to="/admin/review">全部 →</Link></div>
          <div className="list">
            {pending.length ? pending.map(a => (
              <div className="li" key={a.id}><span className="di"><Icon name={a.type === 'Skill' ? 'spark' : 'file'} /></span><div className="tx"><b>{a.title}</b><span>{a.type} · {api.userById(a.authorId).name} · {fmtDate(a.submittedAt)}</span></div>
                <span className="end"><button className="btn sm sec" type="button" onClick={() => api.reviewAsset(a.id, false, '请补充示例输入输出')}>退回</button><button className="btn sm pri" type="button" onClick={() => api.reviewAsset(a.id, true)}>通过</button></span></div>
            )) : <Empty title="审核队列已清空" />}
          </div>
        </div>
        <div className="card s4 sys stretch">
          <div className="ch"><h2>连接状态</h2><span>设置在二期</span></div>
          <div className="list">{api.botStatus.map(s => <div className="sr" key={s.name}><i className={s.level === 'warn' ? 'w' : s.level === 'off' ? 'off' : ''} /><div><b>{s.name}</b><span>{s.detail}</span></div><time>{s.at ? fmtTime(s.at) : '—'}</time></div>)}</div>
        </div>
        <div className="card s4 stretch">
          <div className="ch"><h2>最近公告</h2><span>发布在二期</span></div>
          {ann && <div className="note" style={{ marginTop: 14, background: 'var(--soft)' }}><b style={{ color: 'var(--ink)', display: 'block', marginBottom: 4 }}>{ann.title}</b>{ann.body}<span className="mono" style={{ display: 'block', marginTop: 8, fontSize: 11.5, color: 'var(--mute)' }}>{fmtDate(ann.at)} 发布 · 已读 {ann.readBy} / {api.listUsers().length}</span></div>}
        </div>
        <Board title="11 月贡献榜" />
      </div>
    </>
  );
}

// ---------------- 同事 ----------------
function ColleagueHome({ me }: { me: User }) {
  const top = api.listAssets().slice(0, 3);
  return (
    <>
      <div className="head"><div><div className="dt">{fmtFull(api.now())}</div><h1>{me.name}，欢迎来到管培生工作台</h1><p className="sub">你可以浏览团队沉淀的 AI 资产和公开作品，也可以贡献自己的 Prompt 和 Skill。培训进度和点评只对本人、带教人和管理员可见。</p></div><div className="wk" aria-hidden="true">{W()}</div></div>
      <div className="bento top">
        <div className="card s8 stretch"><div className="ch"><h2>热门 AI 资产</h2><Link to="/ai/assets">资产库 →</Link></div>
          <div className="list">{top.map(a => <Link className="li" to={`/ai/assets/${a.id}`} key={a.id}><span className="di"><Icon name="spark" /></span><div className="tx"><b>{a.title}</b><span>{a.type} · {a.summary}</span></div><span className="end">{api.uses(a)} 人用过</span></Link>)}</div>
        </div>
        <Board me={me} />
        <div className="card s8 stretch"><div className="ch"><h2>团队动态</h2><Link to="/team">全部 →</Link></div><EventPin /><Feed /></div>
        <div className="card s4 stretch"><div className="ch"><h2>贡献一个资产</h2></div><p style={{ marginTop: 12, fontSize: 13.5, color: 'var(--mute)', lineHeight: 1.7 }}>好用的 Prompt、Skill、工作流都可以提交，审核通过后上架，记入你的贡献。</p><Link className="btn pri" style={{ marginTop: 16 }} to="/ai/submit"><Icon name="plus" />提交资产</Link></div>
      </div>
    </>
  );
}

export default function Home() {
  api.useDataVersion();
  const { role, me } = useSession();
  const action = role === 'trainee' ? <Link className="btn pri" to="/growth/me"><Icon name="plus" />提交产出</Link>
    : role === 'mentor' || role === 'colleague' ? <Link className="btn pri" to="/ai/submit"><Icon name="plus" />上架资产</Link>
      : <Link className="btn pri" to="/admin/review"><Icon name="shield" />审核队列</Link>;
  return (
    <Sheet crumbs={[{ label: '首页', to: '/' }, { label: '今天' }]} action={action}>
      {role === 'trainee' && <TraineeHome me={me} />}
      {role === 'mentor' && <MentorHome me={me} />}
      {role === 'admin' && <AdminHome me={me} />}
      {role === 'colleague' && <ColleagueHome me={me} />}
    </Sheet>
  );
}
