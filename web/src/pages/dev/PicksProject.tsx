import { useState } from 'react';
import { CardHead, Drawer, Empty, Icon, PageHead, StationChain, StatusPill, Tile, useSession, type IconName, type Domain } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtDue, fmtFull, fmtTime } from '../../lib/time';
import type { Action, Milestone, World } from './picksData';
import { AssetCard, Av, GradePill, MsPill, PJ_TONE, Person, curNode, latestVersion, more, nodeChain } from './picksKit';

/* 项目详情（P2）挑版：骨架照现有任务详情（TaskDetail）：页头 + bento（主栏 s8 + 右栏 s4 的 stack），节点详情借它的「提交与点评」记录写法。 */

const ACT_TONE = { 未完成: 'acc', 已完成: 'ok', 不再需要: 'plain' } as const;
function ActionRow({ a }: { a: Action }) {
  return (
    <div className="doc" style={{ alignItems: 'flex-start' }}>
      <Tile icon={a.kind === '修改再交' ? 'sync' : a.kind === '推进后续节点' ? 'arrow' : 'info'} domain={a.kind === '建议' ? 'week' : 'acc'} />
      <span className="grow1"><b>{a.text}</b><small>{a.kind}{a.owner ? ` · 负责人 ${a.owner}` : ' · 可不处理'}{a.dueAt ? ` · 截止 ${fmtDate(a.dueAt)}` : ''}</small>{a.doneNote && <small>完成依据：{a.doneNote}</small>}</span>
      {a.kind !== '建议' && <StatusPill tone={ACT_TONE[a.status]}>{a.status}</StatusPill>}
    </div>
  );
}
const allActions = (w: World) => w.pj1.milestones.flatMap(m => m.versions.flatMap(v => v.review?.actions ?? []));
const allReviews = (w: World) => w.pj1.milestones.flatMap(m => m.versions.filter(v => v.review).map(v => ({ m, v, r: v.review! }))).sort((a, b) => Date.parse(b.r.at) - Date.parse(a.r.at));

/** 节点主操作：按查看人与状态 */
function nodeCmd(m: Milestone, role: string) {
  const mentor = role !== 'trainee';
  if (m.blocker && m.blocker.status !== '已解除') return mentor ? '响应受阻' : '解除受阻';
  if (m.status === '需修改') return mentor ? null : '修改再交 V2';
  if (m.status === '待评审') return mentor ? `评审 V${latestVersion(m).no}` : null;
  if (m.status === '进行中') return mentor ? null : '提交成果 V1';
  if (m.status === '未开始') return mentor ? null : '开始节点';
  return null;
}

function Versions({ m }: { m: Milestone }) {
  if (!m.versions.length) return <Empty icon="inbox" title="还没有成果">交了第一版之后，成果、评审和下一步行动会按版本排在这里。</Empty>;
  return (
    <div className="stack" style={{ gap: 0 }}>
      {[...m.versions].reverse().map(v => (
        <div key={v.no} style={{ padding: '12px 0', boxShadow: 'inset 0 -1px 0 var(--line)' }}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <Tile icon="link" domain="grow" />
            <div className="grow1">
              <div className="row" style={{ gap: 8, fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>V{v.no} · {v.by} 提交</b><span className="muted">{fmtDateTime(v.at)} · 评审负责人 {v.reviewer}</span>{!v.review && <span style={{ marginLeft: 'auto' }}><StatusPill tone="info">待评审</StatusPill></span>}</div>
              <p style={{ marginTop: 6, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.7 }}>{v.text}</p>
              {v.change && <div className="well" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.7 }}><span className="muted">修改说明：</span>{v.change}</div>}
            </div>
          </div>
          {v.review && (
            <div className="row" style={{ alignItems: 'flex-start', gap: 12, marginTop: 12 }}>
              <Av name={v.review.by} size="sm" />
              <div className="grow1">
                <div className="row" style={{ gap: 8, fontSize: 12.5 }}><b style={{ fontWeight: 600 }}>{v.review.by} 评审 · 深反馈</b><span className="muted">{fmtDateTime(v.review.at)}</span><span style={{ marginLeft: 'auto' }}><GradePill g={v.review.grade} /></span></div>
                <div className="quote" style={{ marginTop: 10 }}><b style={{ fontWeight: 600, color: 'var(--ink)' }}>关键问题：</b>{v.review.key}<br /><b style={{ fontWeight: 600, color: 'var(--ink)' }}>带教判断：</b>{v.review.judge}</div>
                {v.review.actions.length > 0 && <div className="stack" style={{ gap: 6, marginTop: 8 }}>{v.review.actions.map(a => <ActionRow key={a.text} a={a} />)}</div>}
                {v.review.credits.length > 0 && <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap', fontSize: 12 }}><span className="muted">认定：</span>{v.review.credits.map(c => <StatusPill key={c} tone="ok" icon="check">{c}</StatusPill>)}</div>}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Blocker({ m, w }: { m: Milestone; w: World }) {
  const b = m.blocker;
  if (!b) return null;
  const open = b.status !== '已解除';
  return (
    <div className={`note ${open ? 'due' : 'ok'}`} style={{ marginTop: 12, display: 'block' }}>
      <div className="row" style={{ gap: 6 }}><Icon name={open ? 'alert' : 'check'} /><b>{open ? `受阻 · ${b.status}` : '受阻已解除'}</b><span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>{b.by} {fmtDateTime(b.at)} 标记</span></div>
      <div style={{ marginTop: 4 }}>{b.reason} · 需要{b.decider}决定 · 处理人 {b.handler}{open && ` · 已 ${Math.max(0, Math.round((Date.parse(w.now) - Date.parse(b.at)) / 3600000))} 小时`}</div>
      {b.responses.map(r => <div key={r.at} style={{ marginTop: 4 }}>↳ {r.by} {fmtDateTime(r.at)} 响应：{r.text}</div>)}
      {b.resolved && <div style={{ marginTop: 4 }}>↳ {b.resolved.by} {fmtDateTime(b.resolved.at)} 解除：{b.resolved.text}</div>}
    </div>
  );
}

function NodeBody({ m, w, role, cols = true }: { m: Milestone; w: World; role: string; cols?: boolean }) {
  const cmd = nodeCmd(m, role);
  const left = (
    <div>
      <div className="dl">
        <div><span className="k">节点目标</span><span className="v">{m.goal}</span></div>
        <div><span className="k">验收标准</span><span className="v">{m.accept}</span></div>
        <div><span className="k">截止</span><span className="v">{fmtFull(m.dueAt)} 18:00{m.status !== '已通过' && <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>{fmtDue(m.dueAt, w.now)} · 调整截止要留原因</span>}</span></div>
      </div>
      <Blocker m={m} w={w} />
      <div className="sec-l"><span>关联的培养任务</span><span>{m.tasks.length} 条</span></div>
      {m.tasks.length ? m.tasks.map(t => (
        <div key={t.owner} className="doc"><Av name={t.owner} size="sm" /><span className="grow1"><b>{t.name}</b><small>{t.owner} · 客服岗</small></span>{t.credited ? <StatusPill tone="ok" icon="check">已认定</StatusPill> : <StatusPill>未认定</StatusPill>}</div>
      )) : <p className="muted" style={{ fontSize: 12 }}>这个节点没有关联培养任务。</p>}
      {cmd && <div className="row" style={{ marginTop: 14, gap: 8 }}><button type="button" className="btn pri sm"><Icon name={cmd.startsWith('评审') ? 'pen' : cmd.includes('受阻') ? 'alert' : 'upload'} />{cmd}</button><button type="button" className="btn ghost sm">改截止</button></div>}
    </div>
  );
  const right = <div><div className="sec-l" style={{ marginTop: 0 }}><span>成果版本与评审</span><span>新的在前</span></div><Versions m={m} /></div>;
  return cols ? <div className="pk-nd">{left}{right}</div> : <>{left}<div className="divider" />{right}</>;
}

function ProjectHead({ w }: { w: World }) {
  const p = w.pj1;
  const blocked = p.milestones.some(m => m.blocker && m.blocker.status !== '已解除');
  return (
    <PageHead kicker={<>项目<i aria-hidden="true" />主责 {p.lead}<i aria-hidden="true" />{p.stations}</>} title={p.name} sub={p.goal}
      right={<><StatusPill tone={PJ_TONE[p.status]} size="lg">{p.status}</StatusPill>{blocked && <StatusPill tone="due" icon="alert" size="lg">有节点受阻</StatusPill>}</>} />
  );
}

function InfoCard({ w }: { w: World }) {
  const p = w.pj1;
  return (
    <section className="card" aria-label="项目信息">
      <CardHead title="项目信息" />
      <div className="dl" style={{ marginTop: 14 }}>
        <div><span className="k">验收条件</span><span className="v">{p.accept}</span></div>
        <div><span className="k">业务验收</span><span className="v">{p.acceptor}<span className="muted" style={{ display: 'block', fontSize: 11.5 }}>只记名字，不进系统</span></span></div>
        <div><span className="k">关联站</span><span className="v">{p.stations}</span></div>
        <div><span className="k">立项</span><span className="v">{p.confirmed ? `${p.confirmed.by} · ${fmtDate(p.confirmed.at)} 确认` : `${fmtDate(p.createdAt)} 创建 · 待确认`}</span></div>
        <div><span className="k">项目文档</span><span className="v"><a className="go">飞书 · 来电归因优化<Icon name="ext" /></a></span></div>
      </div>
    </section>
  );
}
function PeopleCard({ w }: { w: World }) {
  const p = w.pj1;
  return (
    <section className="card" aria-label="成员与项目带教">
      <CardHead title="成员与项目带教" />
      <div className="stack" style={{ gap: 12, marginTop: 14 }}>
        {p.members.map(x => <Person key={x.name} name={x.name} sub={x.role === '主责' ? '主责 · 提交节点成果' : '参与 · 分别认定培养任务'} />)}
        <Person name={p.mentor} sub="项目带教 · 节点评审负责人" />
      </div>
      <p className="muted" style={{ marginTop: 12, fontSize: 11.5, lineHeight: 1.6 }}>项目带教由带教关系推出：{p.mentorWhy}。</p>
    </section>
  );
}
function OpenActions({ w }: { w: World }) {
  const list = allActions(w).filter(a => a.status === '未完成');
  return (
    <section className="card" aria-label="未完成的下一步行动">
      <CardHead title="未完成的下一步行动" sub={`${list.filter(a => a.kind !== '建议').length} 条待办 · ${list.filter(a => a.kind === '建议').length} 条建议`} />
      <div className="stack" style={{ gap: 8, marginTop: 12 }}>{list.length ? list.map(a => <ActionRow key={a.text} a={a} />) : <Empty icon="check" title="没有未完成的行动" />}</div>
    </section>
  );
}
function RecentFeedback({ w, n = 3 }: { w: World; n?: number }) {
  const list = allReviews(w).slice(0, n);
  return (
    <section className="card" aria-label="最近反馈">
      <CardHead title="最近反馈" sub={`${allReviews(w).length} 次评审`} />
      {list.length ? <div className="list">{list.map(({ m, v, r }) => (
        <div key={`${m.id}-${v.no}`} className="li" style={{ alignItems: 'flex-start' }}><Av name={r.by} size="sm" /><span className="tx"><b>{m.name} V{v.no}</b><span className="hm-clamp" style={{ WebkitLineClamp: 2 }}>{r.key}</span><span>{fmtDate(r.at)}</span></span><span className="end"><GradePill g={r.grade} /></span></div>
      ))}</div> : <Empty icon="pen" title="还没有反馈" />}
    </section>
  );
}
function TasksCard({ w }: { w: World }) {
  const list = w.pj1.milestones.flatMap(m => m.tasks.map(t => ({ ...t, node: m.name })));
  return (
    <section className="card" aria-label="关联的培养任务">
      <CardHead title="关联的培养任务" sub="通过的节点成果可认定，多人项目按人分行" />
      {list.length ? <div className="list">{list.map(t => (
        <div key={t.owner + t.node} className="li"><Av name={t.owner} size="sm" /><span className="tx"><b>{t.name}</b><span>{t.owner} · 挂在「{t.node}」</span></span><span className="end">{t.credited ? <StatusPill tone="ok" icon="check">已认定</StatusPill> : <StatusPill>未认定</StatusPill>}</span></div>
      ))}</div> : <Empty icon="link" title="还没有关联的培养任务">建节点时可以挂上要在项目里完成的培养任务。</Empty>}
    </section>
  );
}
function ConclusionCard({ w }: { w: World }) {
  const { role } = useSession();
  const p = w.pj1;
  const c = p.conclusion;
  const allPassed = p.milestones.length > 0 && p.milestones.every(m => m.status === '已通过');
  return (
    <section className="card" aria-label="项目结论">
      <CardHead title="项目结论" sub={c ? `${c.closedBy} ${fmtDate(c.closedAt)} 确认结项` : '结项前由主责填写，带教确认'}>
        {c && <button type="button" className="btn sec xs"><Icon name="plus" />补记业务验证</button>}
      </CardHead>
      {c ? (
        <div className="pk-con">
          <div><span className="l">交付结论</span><StatusPill tone="ok" icon="check" size="lg">{c.delivery}</StatusPill><small>证据：{c.evidence}</small></div>
          <div><span className="l">业务验证</span><StatusPill tone="plain" size="lg">{c.verify}</StatusPill><small>业务验收人反馈后补记（结项后仍可补）</small></div>
          <div className="w"><span className="l">经验</span><p>{c.lessons}</p><span className="l" style={{ marginTop: 8 }}>后续建议</span><p>{c.next}</p></div>
        </div>
      ) : (
        <div className="note" style={{ marginTop: 14 }}><Icon name="info" /><span>{allPassed ? <>关键节点都通过了，<b>可以填写结论</b>：交付结论、业务验证、经验。</> : <>关键节点都通过后，{p.lead}填写结论（交付结论、业务验证、经验），{p.mentor}确认结项。</>}</span>
          {allPassed && <button type="button" className="btn pri xs" style={{ marginLeft: 'auto' }}>{role === 'trainee' ? '填写结论' : '确认结项'}</button>}</div>
      )}
    </section>
  );
}
function NoNodes({ w }: { w: World }) {
  const { role } = useSession();
  return (
    <Empty icon="flag" title="还没有关键节点" action={role === 'trainee' ? <button type="button" className="btn sec sm" disabled><Icon name="plus" />新建节点（确认立项后可用）</button> : <button type="button" className="btn pri sm"><Icon name="check" />确认立项</button>}>
      {w.pj1.lead} {fmtDate(w.pj1.createdAt)} 创建了项目，{w.pj1.mentor}确认立项后才能建节点、提交成果。
    </Empty>
  );
}

/** 版 A：节点路线。顶部节点路线，下方展开所选节点；项目信息与成员在右栏 */
function ProjectA({ w }: { w: World }) {
  const { role } = useSession();
  const p = w.pj1;
  const [pick, setPick] = useState<number | null>(null);
  const idx = pick ?? Math.max(0, p.milestones.indexOf(curNode(p)));
  const m = p.milestones[idx];
  return (
    <>
      <ProjectHead w={w} />
      <div className="bento">
        <div className="stack s8">
          <section className="card" aria-label="关键节点">
            <CardHead title="关键节点" sub={p.milestones.length ? `${p.milestones.filter(x => x.status === '已通过').length} / ${p.milestones.length} 已通过 · 点节点切换` : undefined}><button type="button" className="btn sec xs" disabled={!p.confirmed}><Icon name="plus" />新建节点</button></CardHead>
            {m ? <>
              <div style={{ padding: '18px 26% 4px' }}><StationChain stations={nodeChain(p)} onPick={setPick} /></div>
              <div className="divider" />
              <div className="row" style={{ gap: 8, marginBottom: 12 }}><b style={{ fontSize: 15, fontWeight: 600 }}>{m.name}</b><MsPill m={m} /></div>
              <NodeBody m={m} w={w} role={role} />
            </> : <NoNodes w={w} />}
          </section>
          <ConclusionCard w={w} />
        </div>
        <div className="stack s4">
          <InfoCard w={w} />
          <PeopleCard w={w} />
          <OpenActions w={w} />
          <AssetCard compact />
        </div>
      </div>
    </>
  );
}

/** 版 B：总览分栏。三栏，节点详情用右侧抽屉打开 */
function ProjectB({ w }: { w: World }) {
  const { role } = useSession();
  const p = w.pj1;
  const [open, setOpen] = useState<Milestone | null>(null);
  return (
    <>
      <ProjectHead w={w} />
      <div className="bento">
        <div className="stack s3"><InfoCard w={w} /><PeopleCard w={w} /></div>
        <div className="stack s6">
          <section className="card" aria-label="关键节点">
            <CardHead title="关键节点" sub="点一行打开节点详情"><button type="button" className="btn sec xs" disabled={!p.confirmed}><Icon name="plus" />新建节点</button></CardHead>
            {p.milestones.length ? (
              <table className="tbl" style={{ marginTop: 10 }}>
                <thead><tr><th>节点</th><th>状态</th><th>截止</th><th>当前版本</th></tr></thead>
                <tbody>{p.milestones.map(m => { const v = latestVersion(m); return (
                  <tr key={m.id} className="clickable" onClick={() => setOpen(m)}>
                    <td><b>{m.name}</b><span className="s">{m.accept}</span></td>
                    <td><span className="row" style={{ gap: 4, flexWrap: 'wrap' }}><MsPill m={m} /></span></td>
                    <td className="num">{fmtDate(m.dueAt)}</td>
                    <td>{v ? <>V{v.no}<span className="s">{v.review ? v.review.grade : '待评审'}</span></> : <span className="muted">—</span>}</td>
                  </tr>
                ); })}</tbody>
              </table>
            ) : <NoNodes w={w} />}
          </section>
          <TasksCard w={w} />
          <ConclusionCard w={w} />
        </div>
        <div className="stack s3"><OpenActions w={w} /><RecentFeedback w={w} n={2} /><AssetCard compact /></div>
      </div>
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} sub={open ? `截止 ${fmtDate(open.dueAt)} · ${open.status}` : undefined} width={520}>
        {open && <NodeBody m={open} w={w} role={role} cols={false} />}
      </Drawer>
    </>
  );
}

/** 版 C：项目日志。顶部摘要，主体是倒序项目日志，每条点回节点或版本 */
const LOG_LOOK: Record<string, { icon: IconName; d: Domain }> = {
  新建项目: { icon: 'plus', d: 'week' }, 确认立项: { icon: 'check', d: 'grow' }, 新建关键节点: { icon: 'flag', d: 'week' }, 提交成果: { icon: 'upload', d: 'ment' }, 修改再交: { icon: 'sync', d: 'ment' },
  标记受阻: { icon: 'alert', d: 'exam' }, 响应受阻: { icon: 'info', d: 'week' }, 解除受阻: { icon: 'check', d: 'grow' }, 确认结项: { icon: 'award', d: 'grow' }, 提炼能力证据: { icon: 'spark', d: 'ai' },
};
const lookOf = (k: string) => LOG_LOOK[k] ?? (k.startsWith('评审') ? { icon: 'pen' as IconName, d: (k.includes('需改进') ? 'exam' : 'grow') as Domain } : { icon: 'clock' as IconName, d: 'week' as Domain });
function ProjectC({ w }: { w: World }) {
  const p = w.pj1;
  const log = w.timeline.filter(e => !/换站/.test(e.kind) && !/公司与业务|服务链路|客服岗小结/.test(e.text) && !(e.kind === '提炼能力证据' && !e.text.includes('V')));
  const m = p.milestones.length ? curNode(p) : undefined;
  return (
    <>
      <ProjectHead w={w} />
      <section className="card pk-sum" style={{ marginTop: 20 }} aria-label="项目摘要">
        <div><span className="l">关键节点</span><span className="v num">{p.milestones.filter(x => x.status === '已通过').length}<small>/ {p.milestones.length} 已通过</small></span><span className="s">{p.milestones.map(x => x.name).join(' → ') || '还没有节点'}</span></div>
        <div><span className="l">{p.status === '已结束' ? '最后节点' : '当前节点'}</span><span className="v">{m ? m.name : '—'}</span><span className="s row" style={{ gap: 4 }}>{m ? <MsPill m={m} /> : '等确认立项'}</span></div>
        <div><span className="l">项目带教</span><span className="v row" style={{ gap: 8 }}><Av name={p.mentor} size="sm" />{p.mentor}</span><span className="s">{p.members.map(x => `${x.name}${x.role}`).join(' · ')}</span></div>
        <div><span className="l">交付与验证</span><span className="v">{p.conclusion ? `${p.conclusion.delivery} · ${p.conclusion.verify}` : '未结项'}</span><span className="s">{p.conclusion ? `${fmtDate(p.conclusion.closedAt)} 确认结项` : `验收：${p.acceptor}`}</span></div>
      </section>
      <div className="bento" style={{ marginTop: 12 }}>
        <section className="card s8" aria-label="项目日志">
          <CardHead title="项目日志" sub={`${log.length} 条 · 新的在前`} more={more('导出')} />
          <ol className="tm-tl">
            {log.map(e => { const lk = lookOf(e.kind); return (
              <li key={e.at + e.kind} style={{ gridTemplateColumns: '62px 36px minmax(0,1fr) auto' }}>
                <span className="tm-tl-d num">{fmtDate(e.at)}<small>{fmtTime(e.at)}</small></span>
                <span className={`tm-tl-dot d-${lk.d}`}><Icon name={lk.icon} /></span>
                <span className="tm-tl-t"><b style={{ fontWeight: 600 }}>{e.kind}</b><span style={{ color: 'var(--ink2)' }}>{e.text}</span><span className="muted">· {e.who}</span></span>
                {/V\d/.test(e.text) ? <a className="go">看 {e.text.match(/[^\s（，]*V\d/)?.[0]}<Icon name="right" /></a> : /节点|受阻/.test(e.kind) ? <a className="go">看节点<Icon name="right" /></a> : <span />}
              </li>
            ); })}
          </ol>
        </section>
        <div className="stack s4">
          <section className="card" aria-label="节点">
            <CardHead title="节点" sub="点开看详情" />
            {p.milestones.length ? <div className="list">{p.milestones.map(x => (
              <div key={x.id} className="li"><span className={`di d-${x.status === '已通过' ? 'grow' : 'acc'}`}><Icon name="flag" /></span><span className="tx"><b>{x.name}</b><span>截止 {fmtDate(x.dueAt)} · {x.versions.length} 版成果</span></span><span className="end"><MsPill m={x} /></span></div>
            ))}</div> : <NoNodes w={w} />}
          </section>
          <OpenActions w={w} />
          <ConclusionCard w={w} />
          <AssetCard compact />
        </div>
      </div>
    </>
  );
}

export const PROJECT_CSS = `
.pk-nd { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 24px; }
.pk-con { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pk-con > div { display: grid; gap: 6px; justify-items: start; padding: 12px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); }
.pk-con .w { grid-column: span 2; }
.pk-con .l { font-size: 11.5px; color: var(--mute); }
.pk-con small { font-size: 11.5px; color: var(--mute); }
.pk-con p { font-size: 13px; line-height: 1.7; color: var(--ink2); }
.pk-sum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; padding: 18px 8px; }
.pk-sum > div { display: grid; gap: 6px; padding: 0 16px; align-content: start; }
.pk-sum > div + div { box-shadow: -1px 0 0 var(--line); }
.pk-sum .l { font-size: 11.5px; color: var(--mute); }
.pk-sum .v { font-size: 19px; font-weight: 600; letter-spacing: -.01em; line-height: 1.2; }
.pk-sum .v.num { font-size: 26px; font-weight: 700; }
.pk-sum .v small { font-size: 12.5px; font-weight: 600; color: var(--ink2); margin-left: 3px; }
.pk-sum .s { font-size: 11.5px; color: var(--mute); }
`;

export const PROJECT_VERSIONS = [ProjectA, ProjectB, ProjectC];
