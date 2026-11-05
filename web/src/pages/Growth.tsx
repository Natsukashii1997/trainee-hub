import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import { BoardTable } from './Home';
import { CopyBox, Empty, Face, GradeChip, Icon, Ring, StatusChip, useSession, useToast } from '../components/ui';
import * as api from '../data/api';
import type { Grade, Role, TaskInstance } from '../data/types';
import { fmtDate, fmtDateTime, fmtDue, fmtFull } from '../lib/time';

function growthTabs(role: Role) {
  if (role === 'trainee') return [{ to: '/growth/me', label: '我的路径与进度' }, { to: '/growth/path', label: '路径总览' }];
  if (role === 'colleague') return [{ to: '/growth/path', label: '路径总览' }];
  return [{ to: '/growth/board', label: '带教看板' }, { to: '/growth/path', label: '路径总览' }];
}
function GrowthSheet({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const { role } = useSession();
  return <Sheet crumbs={[{ label: '成长', to: '/growth/path' }, { label: title }]} tabs={growthTabs(role)} action={action}>{children}</Sheet>;
}

// ---------------- 路径总览 ----------------
export function PathOverview() {
  api.useDataVersion();
  const { me, role } = useSession();
  const mine = role === 'trainee' ? me.id : null;
  return (
    <GrowthSheet title="路径总览" action={role === 'admin' ? <Link className="btn pri" to="/admin/path"><Icon name="pen" />编辑模板</Link> : undefined}>
      <div className="ph"><div><h1>2026 秋季班培养路径</h1><p>四个阶段，共 {api.totalDays()} 天。轮岗六站的顺序因人而异，以「我的路径」为准。{mine && '你所在的模块用蓝框标出。'}</p></div></div>
      <div style={{ display: 'grid', gap: 32, marginTop: 28 }}>
        {api.stagesAll().map(s => (
          <section className="stage-col" key={s.id}>
            <div className="stage-h"><span className="no">0{s.no}</span><h2>{s.name}</h2><span>{s.days} 天 · {s.desc}</span></div>
            <div className="modgrid">
              {api.modulesOf(s.id).map(m => {
                const st = mine ? api.moduleState(mine, m.id) : 'todo';
                return (
                  <div className={`mod-card${st === 'cur' ? ' cur' : st === 'done' ? ' done' : ''}`} key={m.id}>
                    <h3>{m.name}{m.line && <span className="typ">{m.line}</span>}{st === 'cur' && <span className="chip acc">进行中</span>}{st === 'done' && <span className="chip ok">已完成</span>}</h3>
                    <div className="m">{m.days} 天 · {api.templatesOf(m.id).length} 个任务</div>
                    <ol>{api.templatesOf(m.id).map((t, i) => <li key={t.id}><span className="n">{i + 1}</span><div>{t.name}<small>产出：{t.output} · {t.requirements[0] ?? t.desc}</small></div></li>)}</ol>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </GrowthSheet>
  );
}

// ---------------- 我的路径与进度 ----------------
function TaskTable({ list }: { list: TaskInstance[] }) {
  const now = api.now();
  if (!list.length) return <Empty title="没有任务" />;
  return (
    <table className="tbl">
      <thead><tr><th>任务</th><th>截止</th><th>状态</th><th /></tr></thead>
      <tbody>{list.map(t => (
        <tr key={t.id}>
          <td><Link to={`/growth/tasks/${t.id}`}><b>{t.name}</b><span className="s">{t.moduleId ? `${api.moduleById(t.moduleId).name}岗 · ` : ''}产出：{t.output}</span></Link></td>
          <td className="mono">{fmtDue(t.dueAt, now)}</td>
          <td><StatusChip task={t} /></td>
          <td><Link className="go" to={`/growth/tasks/${t.id}`}>{api.isOpen(t) ? '去提交' : '查看'}</Link></td>
        </tr>))}
      </tbody>
    </table>
  );
}
export function MyPath() {
  api.useDataVersion();
  const { me, role } = useSession();
  const [show, setShow] = useState<'open' | 'all'>('open');
  if (role !== 'trainee') return <GrowthSheet title="我的路径与进度"><Empty title="这个页面给管培生用">切到「管培生」视角查看示例。</Empty></GrowthSheet>;
  const prog = api.timeProgress(me.id);
  const pos = api.currentPosition(me.id)!;
  const all = api.tasksOf(me.id);
  const pick = (k: 'path' | 'recurring') => all.filter(t => t.kind === k && (show === 'all' || api.isOpen(t) || t.status === 'submitted'));
  const p = api.pathOf(me.id)!;
  return (
    <GrowthSheet title="我的路径与进度">
      <div className="ph"><div><h1>{me.name}的培养路径</h1><p>{fmtFull(p.startAt)} 入职 · 第 {prog.day} / {prog.total} 天 · 当前：{pos.stage.name} · {pos.module.name}岗第 {pos.week} 周 · 带教 {api.userById(pos.pm.mentorId).name}</p></div>
        <div className="acts"><div className="seg2"><button type="button" aria-pressed={show === 'open'} onClick={() => setShow('open')}>待处理</button><button type="button" aria-pressed={show === 'all'} onClick={() => setShow('all')}>全部</button></div></div></div>
      <div className="bento top">
        <div className="card s12">
          <div className="pg" style={{ marginTop: 0, gridTemplateColumns: '132px minmax(0,1fr)' }}>
            <Ring pct={prog.pct} label={`${prog.pct}%`} sub="时间进度" />
            <div>
              <div className="track">
                {api.stagesAll().map(s => {
                  const ms = p.modules.filter(m => api.moduleById(m.moduleId).stageId === s.id);
                  const a = Date.parse(ms[0].startAt), b = Date.parse(ms[ms.length - 1].endAt), n = Date.parse(api.now());
                  const pct = Math.max(0, Math.min(1, (n - a) / (b - a)));
                  return <div key={s.id} className={pct >= 1 ? 'ok' : pct > 0 ? 'cur' : ''}><i><b style={{ width: `${pct * 100}%` }} /></i>{s.name}</div>;
                })}
              </div>
              <div className="seg" style={{ marginTop: 22 }}>
                {pos.rotation.map(m => { const s = api.moduleState(me.id, m.moduleId); return <div key={m.moduleId} className={s === 'done' ? 'ok' : s === 'cur' ? 'cur' : ''}><i />{api.moduleById(m.moduleId).name} · {fmtDate(m.startAt)}</div>; })}
              </div>
            </div>
          </div>
        </div>
        <div className="card s7"><div className="ch"><h2>路径任务</h2><span>属于某个阶段或岗位</span></div><TaskTable list={pick('path')} /></div>
        <div className="card s5"><div className="ch"><h2>周期任务</h2><span>日报、周报、月度、轻测</span></div><TaskTable list={pick('recurring')} /></div>
      </div>
    </GrowthSheet>
  );
}

// ---------------- 任务详情 ----------------
export function TaskDetail() {
  api.useDataVersion();
  const { id = '' } = useParams();
  const { me } = useSession();
  const say = useToast();
  const d = api.taskDetail(id, me);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [grade, setGrade] = useState<Grade | ''>('');
  const [comment, setComment] = useState('');
  if (!d) return <GrowthSheet title="任务详情"><Empty title="找不到这个任务" /></GrowthSheet>;
  const { task, owner, canSee, template, module } = d;
  const now = api.now();
  const isOwner = me.id === owner.id;
  const canReview = (me.role === 'admin' || me.id === task.mentorId) && task.status === 'submitted';
  const recs = api.assetsForTemplate(template);
  const res = template?.resources ?? [];
  const submit = () => {
    try { api.submitTask(task.id, url, note, me); setUrl(''); setNote(''); setErr(''); say('已提交，带教人会收到飞书提醒'); }
    catch (e) { setErr((e as Error).message); }
  };
  const doReview = () => {
    if (!grade) { setErr('请选择评价'); return; }
    if (!comment.trim()) { setErr('请写评语'); return; }
    try { api.reviewTask(task.id, grade, comment, me); setComment(''); setGrade(''); setErr(''); say(grade === '需改进' ? '已退回修改' : '已通过'); }
    catch (e) { setErr((e as Error).message); }
  };
  const history = [
    ...d.submissions.map(s => ({ at: s.at, kind: 'sub' as const, s })),
    ...d.reviews.map(r => ({ at: r.at, kind: 'rv' as const, r })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <GrowthSheet title="任务详情">
      <div className="ph">
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="typ">{task.kind === 'path' ? '路径任务' : '周期任务'}</span><StatusChip task={task} /></div>
          <h1 style={{ marginTop: 12 }}>{task.name}</h1>
          <p>{owner.name} · {module ? `${api.stageById(module.stageId).name} · ${module.name}岗` : '贯穿培养期'} · 截止 {fmtDue(task.dueAt, now)}</p>
        </div>
      </div>
      <div className="detail">
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card">
            <div className="ch"><h2>要求</h2><span>产出形式：{task.output}</span></div>
            <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.75, color: 'var(--ink2)' }}>{task.note}</p>
            {template && template.requirements.length > 0 && <ul className="req">{template.requirements.map(r => <li key={r}>{r}</li>)}</ul>}
          </div>
          {!canSee ? (
            <div className="locked"><Icon name="lock" />提交内容和点评只对 {owner.name} 本人、带教人和管理员可见。</div>
          ) : (
            <div className="card">
              <div className="ch"><h2>提交与点评</h2><span>{d.submissions.length} 次提交</span></div>
              {isOwner && api.isOpen(task) && (
                <div style={{ display: 'grid', gap: 12, marginTop: 16, paddingBottom: 18, borderBottom: '1px solid var(--line)' }}>
                  <label className="field"><span>飞书文档链接</span><input id="sub-url" className={`input${err ? ' err' : ''}`} placeholder="https://xxx.feishu.cn/docx/…" value={url} onChange={e => setUrl(e.target.value)} /><small>工作台只保存链接，文档的查看权限由飞书控制。</small></label>
                  <label className="field"><span>给带教人的说明（选填）</span><textarea id="sub-note" className="textarea" style={{ minHeight: 72 }} value={note} onChange={e => setNote(e.target.value)} placeholder="比如哪里还拿不准" /></label>
                  {err && <div className="errmsg">{err}</div>}
                  <div><button className="btn pri" type="button" onClick={submit}><Icon name="check" />提交</button></div>
                </div>
              )}
              {canReview && (
                <div style={{ display: 'grid', gap: 12, marginTop: 16, paddingBottom: 18, borderBottom: '1px solid var(--line)' }}>
                  <div className="field"><span>评价</span><div className="grade">{(['优秀', '达标', '需改进'] as Grade[]).map(g => <button key={g} type="button" aria-pressed={grade === g} onClick={() => setGrade(g)}>{g}</button>)}</div></div>
                  <label className="field"><span>评语</span><textarea id="rv-comment" className="textarea" value={comment} onChange={e => setComment(e.target.value)} placeholder="写具体：哪里好、哪里要改、下次怎么做" /></label>
                  {err && <div className="errmsg">{err}</div>}
                  <div><button className="btn pri" type="button" onClick={doReview}>提交点评</button></div>
                </div>
              )}
              <div className="timeline" style={{ marginTop: 18 }}>
                {history.length ? history.map(h => h.kind === 'sub' ? (
                  <div className="tl" key={h.s.id}><span className="dotc"><Icon name="link" /></span><div className="tx"><time>{fmtDateTime(h.at)}</time>{owner.name} 提交了 <a href={h.s.url} target="_blank" rel="noopener noreferrer">{h.s.url}</a>{h.s.note && <blockquote>{h.s.note}</blockquote>}</div></div>
                ) : (
                  <div className="tl" key={h.r.id}><span className="dotc"><Icon name="pen" /></span><div className="tx"><time>{fmtDateTime(h.at)}</time>{api.userById(h.r.mentorId).name} 点评 <GradeChip grade={h.r.grade} /><blockquote>{h.r.comment}</blockquote></div></div>
                )) : <Empty title="还没有提交">{isOwner ? '贴上飞书文档链接即可提交。' : ''}</Empty>}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card">
            <div className="ch"><h2>信息</h2></div>
            <div className="kv" style={{ marginTop: 8 }}>
              <div><span className="k">负责人</span><span className="who2"><Face user={owner} size="sm" />{owner.name}</span></div>
              <div><span className="k">带教人</span><span className="who2"><Face user={api.userById(task.mentorId)} size="sm" />{api.userById(task.mentorId).name}</span></div>
              <div><span className="k">截止</span><span className="mono">{fmtDateTime(task.dueAt)}</span></div>
              <div><span className="k">产出</span><span>{task.output}</span></div>
            </div>
          </div>
          {recs.map(a => (
            <div className="card ai" key={a.id}>
              <div className="ch"><h2>这一步可以用</h2><Link to={`/ai/assets/${a.id}`}>详情 →</Link></div>
              <h3>{a.title}</h3><p>{a.summary}</p>
              <div className="meta"><span>{a.type.toUpperCase()}</span><span>{api.userById(a.authorId).name}</span><span>{api.uses(a)} 人用过</span></div>
              {a.installCmd && <CopyBox text={a.installCmd} />}
            </div>
          ))}
          {res.length > 0 && <div className="card"><div className="ch"><h2>相关资料</h2><span>二期接入知识库</span></div><div className="list">{res.map(r => <div className="li" key={r.title}><span className="di"><Icon name="file" /></span><div className="tx"><b>{r.title}</b><span>{r.source}</span></div></div>)}</div></div>}
        </div>
      </div>
    </GrowthSheet>
  );
}

// ---------------- 带教看板 ----------------
export function MentorBoard() {
  api.useDataVersion();
  const { me, role } = useSession();
  if (role !== 'mentor' && role !== 'admin') return <GrowthSheet title="带教看板"><Empty title="带教看板给带教人和管理员用">切到「带教人」或「管理员」视角查看示例。</Empty></GrowthSheet>;
  const rows = api.boardRows(me);
  const queue = api.pendingReviews(me);
  return (
    <GrowthSheet title="带教看板">
      <div className="ph"><div><h1>{role === 'admin' ? '全员进度' : `${me.name}带的人`}</h1><p>{rows.length} 位管培生 · 本周 {api.weekRange()[0] && fmtDate(api.weekRange()[0])} – {fmtDate(new Date(Date.parse(api.weekRange()[1]) - 1).toISOString())} · 逾期的排在前面</p></div></div>
      <div className="bento top">
        <div className="card s8"><div className="ch"><h2>进度</h2><span>点一行看个人档案</span></div><BoardTable rows={rows} /></div>
        <div className="card s4" id="review"><div className="ch"><h2>待点评</h2><span>{queue.length} 份 · 先到先评</span></div>
          <div className="list">{queue.length ? queue.map(q => <Link className="li" key={q.task.id} to={`/growth/tasks/${q.task.id}`}><Face user={q.owner} size="md" /><div className="tx"><b>{q.task.name}</b><span>{q.owner.name} · {fmtDateTime(q.sub.at)} 提交</span></div><span className="end"><span className="go">去点评</span></span></Link>) : <Empty title="都评完了" />}</div>
        </div>
      </div>
    </GrowthSheet>
  );
}
