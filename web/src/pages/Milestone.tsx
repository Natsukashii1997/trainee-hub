import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import { Empty, Icon, StatusPill, useSession, useToast, type Tone } from '../components/ui';
import { command, ServerError, view } from '../data/server';
import { daysSince, fmtDate, fmtDateTime, fmtDue, fmtWeekday } from '../lib/time';

/* 里程碑详情（PRD v3.0 第 1 页，页面清单 P3，issue #45）。常浩 2026-11-18 选定 B 版「一条时间线」：
   整页是一条时间线：立任务标准 → 交第 1 版 → 评审与反馈 → 口头反馈 → 修改再交……最后一格「现在」是这一步要做的事。
   数据全部来自后端查询 milestones/:id，写入全部走业务命令；反馈的可见性在服务端裁剪（管培生只拿到自己的）。 */

// ---------- 后端 milestones/:id 的返回（server/src/views/projects.ts milestoneDetail） ----------
type Id = { id: string; name: string };
interface Verification { id: string; feedbackId?: string; content?: string; result: Result; submissionId: string; version?: number; verifiedByName: string; verifiedAt: string }
interface Feedback {
  id: string; traineeId: string; traineeName: string; source: 'review' | 'verbal'; content: string; tags: string[]; nature: Nature | null;
  needsAction: boolean; verifyNext: boolean; createdByName: string; createdAt: string; reviewId: string | null; submissionId: string | null;
  version: number | null; milestoneId: string | null; milestoneName: string | null; pending: boolean; verifications: Verification[];
}
interface Action { id: string; kind: 'revise' | 'advance' | 'suggest'; content: string; status: 'open' | 'done' | 'dropped'; resolution: string | null; ownerId: string | null; ownerName: string | null }
interface Review { id: string; grade: '优秀' | '达标' | '需改进'; comment: string; keyIssue: string | null; judgment: string | null; reviewerName: string; createdAt: string; actions: Action[]; feedback: Feedback[] }
interface Submission {
  id: string; version: number; url: string; note: string | null; changeNote: string | null; submittedAt: string; submitterId: string; submitterName: string;
  reviewerId: string; reviewerName: string; reviewState: 'pending' | 'reviewed'; review: Review | null;
  credits: { taskId: string; taskName: string; traineeName: string }[]; verifications: Verification[];
}
interface Blocker { id: string; reason: string; decider: string | null; status: 'open' | 'responded' | 'resolved'; handlerName: string | null; createdByName: string; createdAt: string; resolvedByName: string | null; resolvedAt: string | null; resolveNote: string | null; responses: { id: string; content: string; responderName: string; createdAt: string }[] }
export interface MilestoneView {
  id: string; name: string; goal: string; acceptanceCriteria: string; commonMistakes: string; escalation: string; sampleLinks: { title: string; url: string }[];
  status: 'todo' | 'doing' | 'submitted' | 'revise' | 'passed' | 'cancelled'; dueAt: string; originalDueAt: string; cancelReason: string | null; blocked: boolean;
  createdByName: string; createdAt: string; projectId: string; projectName: string; projectStatus: string;
  members: (Id & { role: string })[]; mentor: Id | null;
  deadlineChanges: { id: string; oldDueAt: string; newDueAt: string; reason: string; actorName: string; createdAt: string }[];
  submissions: Submission[]; blockers: Blocker[]; verbalFeedback: Feedback[]; pendingFeedback: Feedback[];
  /** 最新一版待评审时，评审这一版能顺手验证的反馈（后端按精确时间算好） */
  verifiableFeedbackIds: string[];
  tasks: { id: string; name: string; status: string; ownerName: string; credit: unknown }[];
}

type Result = 'improved' | 'persisting' | 'not_covered';
type Nature = 'standard' | 'personal' | 'situational';
const RESULT: Record<Result, string> = { improved: '已改善', persisting: '仍存在', not_covered: '这次没涉及' };
const RESULT_TONE: Record<Result, Tone> = { improved: 'ok', persisting: 'due', not_covered: 'plain' };
const NATURE: Record<Nature, string> = { standard: '通用标准问题', personal: '个人发展问题', situational: '情境性判断' };
const STATUS: Record<MilestoneView['status'], [string, Tone]> = {
  todo: ['未开始', 'plain'], doing: ['进行中', 'acc'], submitted: ['待评审', 'info'], revise: ['需修改', 'warn'], passed: ['已通过', 'ok'], cancelled: ['已取消', 'plain'],
};
const GRADE_TONE: Record<Review['grade'], Tone> = { 优秀: 'ok', 达标: 'ok', 需改进: 'warn' };
/** 管培生的提交页最多显示几条待验证的反馈（总纲 6.2） */
const TRAINEE_PENDING_MAX = 3;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
const waited = (iso: string) => { const n = daysSince(iso, new Date().toISOString()); return n <= 0 ? '今天' : `已等 ${n} 天`; };

/** 时间线上的一格：左边时间和人，中间一条线，右边内容 */
function Node({ when, who, now, children }: { when: string; who: ReactNode; now?: boolean; children: ReactNode }) {
  return (
    <li className={now ? 'ms-node now' : 'ms-node'}>
      <div className="when">{when}<small>{who}</small></div>
      <div className="rail" aria-hidden="true" />
      <div className="body">{children}</div>
    </li>
  );
}

function Standard({ m }: { m: MilestoneView }) {
  const good = lines(m.acceptanceCriteria.replace(/；/g, '\n'));
  const misses = lines(m.commonMistakes);
  return (
    <dl className="ms-std">
      <div><dt>为什么做、交付什么</dt><dd>{m.goal || '（没有写）'}</dd></div>
      <div><dt>怎样算好</dt><dd>{good.length > 1 ? <ol>{good.map(x => <li key={x}>{x}</li>)}</ol> : m.acceptanceCriteria}</dd></div>
      <div><dt>常见失误</dt><dd>{misses.length ? <ul className="miss">{misses.map(x => <li key={x}>{x}</li>)}</ul> : '（还没写）'}</dd></div>
      <div><dt>什么情况要及时找带教</dt><dd>{m.escalation || '（还没写）'}</dd></div>
      {m.sampleLinks.length > 0 && <div><dt>样例</dt><dd className="ms-links">{m.sampleLinks.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.title}</a>)}</dd></div>}
    </dl>
  );
}

/** 一条反馈：内容 + 标签、性质、下次验证、需要行动；验证记录 */
function FeedbackItem({ f, children, showSource }: { f: Feedback; children?: ReactNode; showSource?: boolean }) {
  return (
    <div className="well ms-fb">
      <p>{f.content}</p>
      <div className="ms-tags">
        {f.tags.map(t => <span key={t} className="chip">{t}</span>)}
        {f.nature && <span className="chip">{NATURE[f.nature]}</span>}
        {f.needsAction && <span className="chip warn">这一版就要补上</span>}
        {f.verifyNext && f.pending && <span className="chip acc">下次验证</span>}
        {showSource && <span className="sub">{f.source === 'verbal' ? `${fmtDate(f.createdAt)} 口头 · ${f.createdByName}` : `${f.milestoneName ?? ''} 第 ${f.version} 版评审`}</span>}
      </div>
      {f.verifications.length > 0 && (
        <div className="ms-tags">
          {f.verifications.map(v => <StatusPill key={v.id} tone={RESULT_TONE[v.result]}>{v.version ? `第 ${v.version} 版：` : ''}{RESULT[v.result]}</StatusPill>)}
        </div>
      )}
      {children}
    </div>
  );
}

/** 切换按钮（下次验证、这一版就要补上） */
function Tog({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="ms-tog" aria-pressed={on} onClick={onClick}>{children}</button>;
}

interface Draft { content: string; tags: string; nature: Nature | ''; verifyNext: boolean; needsAction: boolean }

/** 带教评审这一版：验证上次的反馈 + 这一版分条写反馈 + 结论、下一步行动、认定 → C08 */
function ReviewPanel({ m, sub, pending, reload }: { m: MilestoneView; sub: Submission; pending: Feedback[]; reload: () => Promise<void> }) {
  const say = useToast();
  const [verify, setVerify] = useState<Record<string, Result | undefined>>({});
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [text, setText] = useState('');
  const [grade, setGrade] = useState<Review['grade'] | null>(null);
  const [revise, setRevise] = useState('按上面的反馈改完再交');
  const [credit, setCredit] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const creditable = m.tasks.filter(t => !t.credit);
  const patch = (i: number, p: Partial<Draft>) => setDrafts(ds => ds.map((d, j) => (j === i ? { ...d, ...p } : d)));
  const add = () => { if (!text.trim()) return; setDrafts(ds => [...ds, { content: text.trim(), tags: '', nature: '', verifyNext: false, needsAction: false }]); setText(''); };

  const submit = async () => {
    if (!grade) { setProblem('还没选结论。'); return; }
    if (grade === '需改进' && !revise.trim()) { setProblem('结论为需改进时，要写一条「修改再交」要做什么。'); return; }
    const all = text.trim() ? [...drafts, { content: text.trim(), tags: '', nature: '' as const, verifyNext: false, needsAction: false }] : drafts;
    const verifications = Object.entries(verify).filter((e): e is [string, Result] => Boolean(e[1])).map(([feedbackId, result]) => ({ feedbackId, result }));
    setBusy(true); setProblem('');
    try {
      await command('C08', {
        submissionId: sub.id, grade,
        actions: grade === '需改进' ? [{ kind: 'revise', content: revise.trim() }] : [],
        creditTaskIds: grade === '需改进' ? [] : credit,
        feedback: all.map(d => ({ content: d.content, tags: d.tags.split(/[\s,，、]+/).filter(Boolean), nature: d.nature || null, verifyNext: d.verifyNext, needsAction: d.needsAction })),
        verifications,
      });
      const left = pending.length - verifications.length;
      say(left > 0 ? `评审已记录；还有 ${left} 条上次的反馈没验证，留到下一次` : '评审已记录');
      await reload();
    } catch (e) {
      setProblem(errText(e));
    } finally { setBusy(false); }
  };

  return (
    <>
      <section className="card dark" aria-label="上次说的，这次改了吗">
        <div className="hd"><h2>上次说的，这次改了吗</h2><span className="sub">{pending.length ? `${pending.length} 条待验证` : '没有约好要在这一版上验证的反馈'}</span></div>
        {pending.length > 0 && (
          <div className="ms-items">
            {pending.map(f => (
              <FeedbackItem key={f.id} f={f} showSource>
                <div className="ms-vbtn" role="group" aria-label="验证结果">
                  {(Object.keys(RESULT) as Result[]).map(k => (
                    <button key={k} type="button" data-v={k} aria-pressed={verify[f.id] === k} onClick={() => setVerify(v => ({ ...v, [f.id]: v[f.id] === k ? undefined : k }))}>{RESULT[k]}</button>
                  ))}
                </div>
              </FeedbackItem>
            ))}
          </div>
        )}
      </section>
      <section className="card" aria-label="这一版的反馈">
        <div className="hd"><h2>这一版的反馈</h2><span className="sub">一条只说一件事；标签、性质都可以不填</span></div>
        <div className="ms-items">
          {drafts.map((d, i) => (
            <div key={i} className="well ms-fb">
              <p>{d.content}</p>
              <div className="ms-tags">
                <Tog on={d.verifyNext} onClick={() => patch(i, { verifyNext: !d.verifyNext })}>下次验证</Tog>
                <Tog on={d.needsAction} onClick={() => patch(i, { needsAction: !d.needsAction })}>这一版就要补上</Tog>
                <input className="input ms-mini" aria-label={`第 ${i + 1} 条的标签`} placeholder="标签（最多两个，空格分开）" value={d.tags} onChange={e => patch(i, { tags: e.target.value })} />
                <select className="select ms-mini" aria-label={`第 ${i + 1} 条的性质`} value={d.nature} onChange={e => patch(i, { nature: e.target.value as Nature | '' })}>
                  <option value="">性质（可不选）</option>
                  {(Object.keys(NATURE) as Nature[]).map(k => <option key={k} value={k}>{NATURE[k]}</option>)}
                </select>
                <button type="button" className="btn xs ghost" onClick={() => setDrafts(ds => ds.filter((_, j) => j !== i))}>删掉</button>
              </div>
            </div>
          ))}
          <div className="field">
            <label htmlFor="ms-new">{drafts.length ? '再写一条反馈' : '写一条反馈'}</label>
            <textarea id="ms-new" className="textarea ms-short" placeholder="一条只说一件事" value={text} onChange={e => setText(e.target.value)} />
            <div><button type="button" className="btn xs sec" onClick={add} disabled={!text.trim()}><Icon name="plus" />加上这一条</button></div>
          </div>
        </div>
        <div className="field">
          <span>结论</span>
          <div className="seg ms-verdict" role="group" aria-label="结论">
            {(['优秀', '达标', '需改进'] as const).map(g => <button key={g} type="button" data-k={g} aria-pressed={grade === g} onClick={() => setGrade(g)}>{g}</button>)}
          </div>
        </div>
        {grade === '需改进' && (
          <div className="field">
            <label htmlFor="ms-revise">下一步行动：修改再交（负责人 {sub.submitterName}）</label>
            <input id="ms-revise" className="input" value={revise} onChange={e => setRevise(e.target.value)} />
          </div>
        )}
        {grade && grade !== '需改进' && creditable.length > 0 && (
          <div className="field">
            <span>认定关联的培养任务（一人一任务，逐条勾）</span>
            <div className="ms-tags">
              {creditable.map(t => <Tog key={t.id} on={credit.includes(t.id)} onClick={() => setCredit(c => (c.includes(t.id) ? c.filter(x => x !== t.id) : [...c, t.id]))}>{t.ownerName} · {t.name}</Tog>)}
            </div>
          </div>
        )}
        {problem && <div className="errmsg" role="alert">{problem}</div>}
        <div className="ms-acts">
          <button type="button" className="btn pri" onClick={submit} disabled={busy}>提交评审</button>
          <span className="sub">{Object.values(verify).filter(Boolean).length} / {pending.length} 条验证已选；没选的留到下一次</span>
        </div>
      </section>
    </>
  );
}

/** 管培生：提交第 1 版（C06）或修改再交（C07），可以标记受阻（C10） */
function SubmitPanel({ m, prev, reload }: { m: MilestoneView; prev: Submission | null; reload: () => Promise<void> }) {
  const say = useToast();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const version = (prev?.version ?? 0) + 1;
  const submit = async () => {
    setBusy(true); setProblem('');
    try {
      if (prev?.review) await command('C07', { prevReviewId: prev.review.id, url, changeNote: note });
      else await command('C06', { milestoneId: m.id, url, note: note || null });
      say(`第 ${version} 版已提交，等${prev?.reviewerName ?? m.mentor?.name ?? '带教'}评审`);
      setUrl(''); setNote('');
      await reload();
    } catch (e) { setProblem(errText(e)); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-label={prev ? '修改再交' : '提交成果'}>
      <div className="hd"><h2>{prev ? `修改再交第 ${version} 版` : '提交第 1 版'}</h2><span className="sub">截止 {fmtDue(m.dueAt, new Date().toISOString())}</span></div>
      <div className="field">
        <label htmlFor="ms-url">成果链接（飞书文档或 GitHub）</label>
        <input id="ms-url" className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" />
      </div>
      <div className="field">
        <label htmlFor="ms-note">{prev ? '修改说明（必填）：这一版针对上面哪几条改了什么' : '说明（可不填）'}</label>
        <textarea id="ms-note" className="textarea ms-short" value={note} onChange={e => setNote(e.target.value)} />
      </div>
      {problem && <div className="errmsg" role="alert">{problem}</div>}
      <div className="ms-acts">
        <button type="button" className="btn pri" onClick={submit} disabled={busy || !url.trim() || (Boolean(prev) && !note.trim())}>提交第 {version} 版</button>
      </div>
    </section>
  );
}

/** 标记受阻（C10）：写清卡在哪、需要谁决定 */
function BlockForm({ m, reload, onDone }: { m: MilestoneView; reload: () => Promise<void>; onDone: () => void }) {
  const say = useToast();
  const [reason, setReason] = useState('');
  const [decider, setDecider] = useState('');
  const [problem, setProblem] = useState('');
  const go = async () => {
    try { await command('C10', { milestoneId: m.id, reason, decider: decider || null }); say('已标记受阻，等带教响应'); onDone(); await reload(); } catch (e) { setProblem(errText(e)); }
  };
  return (
    <div className="well ms-form">
      <div className="field"><label htmlFor="ms-block">卡在哪</label><textarea id="ms-block" className="textarea ms-short" value={reason} onChange={e => setReason(e.target.value)} /></div>
      <div className="field"><label htmlFor="ms-decider">需要谁决定（可不填）</label><input id="ms-decider" className="input" value={decider} onChange={e => setDecider(e.target.value)} /></div>
      {problem && <div className="errmsg" role="alert">{problem}</div>}
      <div className="ms-acts"><button type="button" className="btn sm dark" onClick={go} disabled={!reason.trim()}>标记受阻</button><button type="button" className="btn sm ghost" onClick={onDone}>取消</button></div>
    </div>
  );
}

/** 受阻记录：带教响应（C11，响应 ≠ 解除），成员解除（C12） */
function BlockerCard({ b, isMentor, reload }: { b: Blocker; isMentor: boolean; reload: () => Promise<void> }) {
  const say = useToast();
  const [reply, setReply] = useState('');
  const [problem, setProblem] = useState('');
  const act = async (id: 'C11' | 'C12') => {
    try {
      await command(id, id === 'C11' ? { blockerId: b.id, content: reply } : { blockerId: b.id });
      say(id === 'C11' ? '已响应；解除要由管培生确认' : '已解除受阻'); setReply(''); await reload();
    } catch (e) { setProblem(errText(e)); }
  };
  const open = b.status !== 'resolved';
  return (
    <section className="card" aria-label="受阻">
      <div className="hd"><h2>标记受阻</h2><StatusPill tone={open ? 'due' : 'ok'} dot>{open ? (b.status === 'responded' ? '已响应，仍受阻' : '受阻中') : '已解除'}</StatusPill>
        {b.handlerName && <span className="sub">处理人 {b.handlerName}</span>}</div>
      <p>{b.reason}{b.decider && <span className="sub"> · 需要 {b.decider} 决定</span>}</p>
      {b.responses.map(r => <div key={r.id} className="well"><b>{r.responderName}</b> <span className="sub">{fmtDateTime(r.createdAt)}</span><p>{r.content}</p></div>)}
      {b.resolvedAt && <p className="sub">{b.resolvedByName} {fmtDateTime(b.resolvedAt)} 解除{b.resolveNote ? `：${b.resolveNote}` : ''}</p>}
      {open && isMentor && (
        <div className="ms-row"><input className="input" aria-label="响应内容" placeholder="怎么处理、什么时候有结果" value={reply} onChange={e => setReply(e.target.value)} /><button type="button" className="btn sm sec" onClick={() => act('C11')} disabled={!reply.trim()}>响应</button></div>
      )}
      {open && !isMentor && <div><button type="button" className="btn sm sec" onClick={() => act('C12')}>问题已解决，解除受阻</button></div>}
      {problem && <div className="errmsg" role="alert">{problem}</div>}
    </section>
  );
}

/** 一次评审：结论、关键问题、分条反馈、下一步行动（C09）、认定 */
function ReviewCard({ r, sub, me, isMentor, reload }: { r: Review; sub: Submission; me: string; isMentor: boolean; reload: () => Promise<void> }) {
  const say = useToast();
  const keep = r.feedback.filter(f => f.verifyNext).length;
  const done = async (a: Action) => {
    try { await command('C09', { actionId: a.id, result: 'done' }); say('已标为完成'); await reload(); } catch (e) { say(errText(e)); }
  };
  return (
    <section className="card" aria-label={`第 ${sub.version} 版评审`}>
      <div className="hd"><h2>评审：{r.grade}</h2><StatusPill tone={GRADE_TONE[r.grade]}>第 {sub.version} 版</StatusPill>
        <span className="sub">{r.feedback.length ? `${r.feedback.length} 条反馈${keep ? `，${keep} 条下次验证` : ''}` : '没有分条反馈'}</span></div>
      {(r.keyIssue || r.judgment || r.comment) && (
        <div className="ms-quote">{r.keyIssue && <p><b>关键问题：</b>{r.keyIssue}</p>}{r.judgment && <p><b>带教判断：</b>{r.judgment}</p>}{r.comment && <p>{r.comment}</p>}</div>
      )}
      {r.feedback.length > 0 && <div className="ms-items">{r.feedback.map(f => <FeedbackItem key={f.id} f={f} />)}</div>}
      {r.actions.map(a => (
        <div key={a.id} className="ms-next">
          <span className="chip">{a.kind === 'revise' ? '修改再交' : a.kind === 'advance' ? '推进后续' : '建议'}</span>
          <span>{a.content}</span>
          <span className="sub">{a.ownerName ? `负责人 ${a.ownerName}` : '不指定负责人'} · {a.status === 'open' ? '未完成' : a.status === 'done' ? `已完成${a.resolution ? `（${a.resolution}）` : ''}` : '不再需要'}</span>
          {a.status === 'open' && a.kind !== 'revise' && (isMentor || a.ownerId === me) && <button type="button" className="btn xs sec" onClick={() => done(a)}>标为完成</button>}
        </div>
      ))}
      {sub.credits.length > 0 && <div className="ms-tags">{sub.credits.map(c => <span key={c.taskId} className="chip ok">认定 {c.traineeName} · {c.taskName}</span>)}</div>}
    </section>
  );
}

function SubmissionCard({ s }: { s: Submission }) {
  return (
    <section className="card" aria-label={`第 ${s.version} 版`}>
      <div className="ms-subl">
        <span className="ms-ver">第 {s.version} 版</span>
        <a href={s.url} target="_blank" rel="noreferrer">{s.url.replace(/^https?:\/\//, '').slice(0, 48)}</a>
        <span className="sub">{s.submitterName} · {fmtDateTime(s.submittedAt)} 提交 · 评审负责人 {s.reviewerName}</span>
      </div>
      {s.changeNote && <div className="ms-quote"><p><b>修改说明：</b>{s.changeNote}</p></div>}
      {s.note && <div className="ms-quote"><p>{s.note}</p></div>}
      {s.verifications.length > 0 && (
        <div className="ms-tags"><span className="sub">在这一版上验证：</span>{s.verifications.map(v => <StatusPill key={v.id} tone={RESULT_TONE[v.result]}>{RESULT[v.result]} · {v.content?.slice(0, 14)}…</StatusPill>)}</div>
      )}
    </section>
  );
}

/** 最后一格「现在」：按角色和里程碑状态给这一步要做的事 */
function NowPanel({ m, isMentor, reload }: { m: MilestoneView; isMentor: boolean; reload: () => Promise<void> }) {
  const say = useToast();
  const [blocking, setBlocking] = useState(false);
  const latest = m.submissions.at(-1) ?? null;
  const reviewer = latest?.reviewerName ?? m.mentor?.name ?? '带教';
  const lead = m.members.find(x => x.role === 'lead')?.name ?? m.members[0]?.name ?? '管培生';
  // 带教评审这一版时能验证的：这一版的提交人在这一版提交之前收到的、待验证的反馈（后端算好）
  const forSubmission = m.pendingFeedback.filter(f => m.verifiableFeedbackIds.includes(f.id));
  const toFix = latest?.review?.feedback.filter(f => f.needsAction) ?? [];
  const pendingMine = m.pendingFeedback.filter(f => !toFix.includes(f));
  const blockerOpen = m.blockers.some(b => b.status !== 'resolved');
  const start = async () => { try { await command('C04', { milestoneId: m.id }); say('已开始'); await reload(); } catch (e) { say(errText(e)); } };

  if (m.status === 'cancelled') return <section className="card"><div className="hd"><h2>已取消</h2></div><p>{m.cancelReason}</p></section>;
  if (m.status === 'passed') return <section className="card"><div className="hd"><h2>已通过</h2><StatusPill tone="ok" icon="check">已通过</StatusPill></div><p className="sub">这个里程碑已经结束。待验证的反馈会跟着人走，在下一个里程碑的成果上继续验证。</p></section>;

  if (isMentor) {
    if (m.status === 'submitted' && latest && latest.reviewState === 'pending') return <ReviewPanel key={latest.id} m={m} sub={latest} pending={forSubmission} reload={reload} />;
    const wait = m.status === 'revise' ? `等${lead}修改再交` : `等${lead}提交第 1 版`;
    return (
      <section className="card">
        <div className="hd"><h2>{wait}</h2>{m.status === 'revise' && latest?.review && <span className="sub">{fmtDate(latest.review.createdAt)} 评审</span>}</div>
        {m.pendingFeedback.length > 0 ? <><p className="sub">约好下次验证的 {m.pendingFeedback.length} 条，会在下一版提交后出现在这里让你验证：</p><div className="ms-items">{m.pendingFeedback.map(f => <FeedbackItem key={f.id} f={f} showSource />)}</div></> : <p className="sub">没有待验证的反馈。</p>}
      </section>
    );
  }

  // 管培生
  const shown = pendingMine.slice(0, TRAINEE_PENDING_MAX);
  const fixCard = (title: string, sub: string) => (toFix.length + shown.length > 0) && (
    <section className="card dark" aria-label={title}>
      <div className="hd"><h2>{title}</h2><span className="sub">{sub}</span></div>
      <div className="ms-items">
        {toFix.map(f => <FeedbackItem key={f.id} f={f} showSource />)}
        {shown.map(f => <FeedbackItem key={f.id} f={f} showSource />)}
      </div>
      {pendingMine.length > shown.length && <p className="sub">另有 {pendingMine.length - shown.length} 条待验证的反馈，先改上面这几条。</p>}
    </section>
  );
  if (m.status === 'submitted' && latest) {
    return (
      <>
        <section className="card"><div className="hd"><h2>等{reviewer}评审第 {latest.version} 版</h2><span className="sub">{fmtDate(latest.submittedAt)} 提交 · {waited(latest.submittedAt)}</span></div></section>
        {fixCard('这一版上会验证的', `${shown.length} 条`)}
      </>
    );
  }
  const blockArea = blocking ? <BlockForm m={m} reload={reload} onDone={() => setBlocking(false)} /> : !blockerOpen && <div><button type="button" className="btn sm ghost" onClick={() => setBlocking(true)}><Icon name="alert" />推进不下去，标记受阻</button></div>;
  return (
    <>
      {m.status === 'revise'
        ? fixCard('这次要改的', `${toFix.length ? `${toFix.length} 条这一版就要补上；` : ''}${shown.length} 条会在下一版上验证`)
        : fixCard('提交前看一眼：这次要改的', `${shown.length} 条会在这一版上验证`)}
      {m.status === 'todo' && (
        <section className="card"><div className="hd"><h2>还没开始</h2><span className="sub">先看上面的任务标准</span></div><div><button type="button" className="btn sm sec" onClick={start}>开始这个里程碑</button></div></section>
      )}
      <SubmitPanel m={m} prev={m.status === 'revise' ? latest : null} reload={reload} />
      {blockArea}
    </>
  );
}

type Entry = { at: string; key: string; when: string; who: ReactNode; body: ReactNode };

export function MilestoneDetail() {
  const { id = '', mid = '' } = useParams();
  const { actor } = useSession();
  const [m, setM] = useState<MilestoneView | null>(null);
  const [error, setError] = useState<{ status: number; text: string } | null>(null);
  const who = actor?.id;
  // 换了身份（演示模式切换示例身份）要重新取：反馈按身份裁剪，不能拿上一个身份的数据
  const load = useCallback(async () => {
    if (!who) return;
    try { setM(await view<MilestoneView>(`milestones/${encodeURIComponent(mid)}`)); setError(null); } catch (e) {
      setM(null); setError({ status: e instanceof ServerError ? e.status : 0, text: errText(e) });
    }
  }, [mid, who]);
  useEffect(() => { setM(null); void load(); }, [load]);

  const crumbs = [{ label: '项目', to: '/projects' }, { label: m?.projectName ?? '项目', to: `/projects/${id}` }, { label: m?.name ?? '里程碑' }];
  if (error) return <Sheet crumbs={crumbs} action={null}><section className="card ms-wrap"><Empty size="lg" icon="alert" title={error.status === 404 ? '没有这个里程碑' : error.status === 403 ? '看不到这个里程碑' : '加载失败'}>{error.text}</Empty></section></Sheet>;
  if (!m || !actor) return <Sheet crumbs={crumbs} action={null}><div className="ms-wrap"><section className="card"><p className="sub">加载中…</p></section></div></Sheet>;

  const isMentor = actor.role === 'mentor';
  const [label, tone] = STATUS[m.status];
  const latest = m.submissions.at(-1);
  const lead = m.members.find(x => x.role === 'lead');
  const firstTime = m.submissions.length === 0;

  // 时间线：任务标准、各版成果、评审、口头反馈、受阻、截止调整，按时间排；「现在」放最后
  const entries: Entry[] = [
    { at: m.createdAt, key: 'std', when: fmtDate(m.createdAt), who: m.createdByName, body: (
      <section className="card" aria-label="任务标准">
        <details className="ms-fold" open={firstTime}>
          <summary><div className="hd"><h2>任务标准</h2><span className="sub">为什么做、交付什么、怎样算好、常见失误、什么时候找带教</span></div></summary>
          <Standard m={m} />
        </details>
      </section>
    ) },
    ...m.submissions.flatMap<Entry>(s => [
      { at: s.submittedAt, key: `s-${s.id}`, when: fmtDate(s.submittedAt), who: s.submitterName, body: <SubmissionCard s={s} /> },
      ...(s.review ? [{ at: s.review.createdAt, key: `r-${s.review.id}`, when: fmtDate(s.review.createdAt), who: s.review.reviewerName, body: <ReviewCard r={s.review} sub={s} me={actor.id} isMentor={isMentor} reload={load} /> }] : []),
    ]),
    ...m.verbalFeedback.map<Entry>(f => ({ at: f.createdAt, key: `v-${f.id}`, when: fmtDate(f.createdAt), who: f.createdByName, body: (
      <section className="card" aria-label="口头反馈"><div className="hd"><h2>口头反馈</h2><span className="sub">给 {f.traineeName}</span></div><FeedbackItem f={f} /></section>
    ) })),
    ...m.blockers.map<Entry>(b => ({ at: b.createdAt, key: `b-${b.id}`, when: fmtDate(b.createdAt), who: b.createdByName, body: <BlockerCard b={b} isMentor={isMentor} reload={load} /> })),
    ...m.deadlineChanges.map<Entry>(d => ({ at: d.createdAt, key: `d-${d.id}`, when: fmtDate(d.createdAt), who: d.actorName, body: (
      <section className="card"><div className="hd"><h2>调整截止</h2><span className="sub">{fmtDate(d.oldDueAt)} → {fmtDate(d.newDueAt)}</span></div><p>{d.reason}</p></section>
    ) })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const nowWho = m.status === 'passed' || m.status === 'cancelled' ? '' : isMentor ? (m.status === 'submitted' ? '等你判断' : '等管培生') : m.status === 'submitted' ? '等带教' : '等你';

  return (
    <Sheet crumbs={crumbs} action={null}>
      <div className="ms-wrap">
        <section className="card ms-head">
          <div className="ms-title">
            <h1>{m.name}</h1>
            <StatusPill tone={tone} dot>{label}</StatusPill>
            {m.blocked && <StatusPill tone="due" icon="alert">受阻</StatusPill>}
            {m.status !== 'passed' && m.status !== 'cancelled' && Date.parse(m.dueAt) < Date.now() && <StatusPill tone="due">已过截止</StatusPill>}
          </div>
          <div className="ms-meta">
            <span>项目 <Link to={`/projects/${m.projectId}`}>{m.projectName}</Link></span>
            {lead && <span>主责 <b>{lead.name}</b></span>}
            <span>评审负责人 <b>{latest?.reviewerName ?? m.mentor?.name ?? '—'}</b></span>
            <span>截止 <b>{fmtDate(m.dueAt)} {fmtWeekday(m.dueAt)}</b>{m.dueAt !== m.originalDueAt && <span className="sub">（原定 {fmtDate(m.originalDueAt)}）</span>}</span>
            {m.status === 'submitted' && latest && <span>第 {latest.version} 版 {fmtDate(latest.submittedAt)} 提交，<b>{waited(latest.submittedAt)}</b></span>}
          </div>
        </section>
        <ol className="ms-tl">
          {entries.map(e => <Node key={e.key} when={e.when} who={e.who}>{e.body}</Node>)}
          <Node now when="现在" who={nowWho}><div className="ms-items"><NowPanel m={m} isMentor={isMentor} reload={load} /></div></Node>
        </ol>
      </div>
    </Sheet>
  );
}
