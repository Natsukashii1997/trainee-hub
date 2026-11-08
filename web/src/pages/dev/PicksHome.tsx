import { CardHead, Empty, Icon, MetaPill, PageHead, StationChain, StatusPill, Tile } from '../../components/ui';
import { Timeline } from '../../components/schedule';
import { fmtDate, fmtDateTime, fmtDue, fmtTime, isoWeek } from '../../lib/time';
import type { World } from './picksData';
import {
  AssetCard, Av, BoardCard, CoordCard, CoverageCard, DarkFoot, FeedbackCard, GradePill, Kicker, MenteeTable, MsPill, PJ_TONE, ProgressCard, ProjectCard,
  RISK_TONE, SwitchCard, WeekCard, area, curNode, judgeCount, judgeGroups, latestVersion, more, nextStep, nodeChain,
} from './picksKit';

/* 工作台首页挑版：管培生（W1）、带教（W2）各三版。骨架照现有 Home.tsx：页头 + Bento 网格（管培生四列 hm-t 节奏，带教 12 列 bento）。 */

// ================= 管培生 =================
function TraineeHead({ w }: { w: World }) {
  const n = w.actions.length;
  const title = n ? <>林夏，有 <em>{n} 件事</em>等你推进</>
    : w.coord.some(c => c.kind === '受阻') ? <>林夏，<em>分流方案验证</em>受阻了</>
      : w.coord.some(c => c.kind === '待评审') ? <>林夏，成果在等<em>带教评审</em></>
        : w.coord.some(c => c.kind === '待确认立项') ? <>林夏，项目在等<em>确认立项</em></>
          : <>林夏，今天<em>没有要赶的事</em></>;
  return (
    <PageHead kicker={<Kicker now={w.now} />} title={title}
      right={<><MetaPill>第 <b>{isoWeek(w.now)}</b> 周</MetaPill><MetaPill>{w.station.name} · 第 <b>{w.station.day}</b> / {w.station.days} 天</MetaPill></>} />
  );
}

/** 管培生 · 版 B：行动为中心。强调块 = 最重要的下一步 */
function TraineeB({ w }: { w: World }) {
  const nx = nextStep(w);
  return (
    <>
      <TraineeHead w={w} />
      <div className="pk-t" style={{ gridTemplateRows: '196px 292px auto', gridTemplateAreas: '"nx nx week prog" "rv co week prog" "pj pj cov ai"' }}>
        <section className="reco" style={area('nx')} aria-label="最重要的下一步">
          <div className="r1"><span className={`tile pk-${nx.tone}`}><Icon name={nx.tone === 'acc' ? 'pen' : nx.tone === 'ok' ? 'check' : 'clock'} /></span>最重要的下一步 · {nx.kind}
            {w.pj1.milestones.length > 0 && w.pj1.status !== '已结束' && <span className="for">来电归因优化 · <b>{curNode(w.pj1).name}</b></span>}</div>
          <h2>{nx.title}</h2>
          {nx.from && <p style={{ marginTop: 6 }}>{nx.from}</p>}
          <DarkFoot dueAt={nx.dueAt} now={w.now} label={nx.dueLabel} btn={nx.btn} />
        </section>
        <FeedbackCard w={w} a="rv" />
        <CoordCard w={w} a="co" />
        <WeekCard w={w} a="week" />
        <ProgressCard w={w} a="prog" />
        <ProjectCard w={w} a="pj" title="本阶段目标 · 主推项目" />
        <CoverageCard w={w} a="cov" />
        <AssetCard a="ai" />
      </div>
    </>
  );
}

/** 管培生 · 版 A：目标为中心。强调块 = 主推项目卡（项目、当前节点、下一步合在一块） */
function TraineeA({ w }: { w: World }) {
  const p = w.pj1;
  const m = p.milestones.length ? curNode(p) : undefined;
  const nx = nextStep(w);
  return (
    <>
      <TraineeHead w={w} />
      <div className="pk-t" style={{ gridTemplateRows: '176px 292px auto', gridTemplateAreas: '"pj pj week prog" "pj pj week prog" "co rv cov ai"' }}>
        <section className="reco" style={area('pj')} aria-label="主推项目">
          <div className="r1"><span className="tile pk-acc"><Icon name="flag" /></span>本阶段目标 · 主推项目<span className="for">项目带教 <b>{p.mentor}</b> · {p.status}</span></div>
          <h2>{p.name}</h2>
          <p>{p.goal}</p>
          {m ? <>
            <div className="sec-l" style={{ color: '#A9ADC4', marginTop: 18 }}><span>关键节点</span><span>{p.milestones.filter(x => x.status === '已通过').length} / {p.milestones.length} 已通过</span></div>
            <div style={{ padding: '0 22%' }}><StationChain stations={nodeChain(p)} /></div>
            <div className="pk-in">
              <div className="row" style={{ gap: 6 }}><span className="l">{p.status === '已结束' ? '项目结论' : '当前节点'}</span><b>{p.status === '已结束' ? '交付达成 · 业务未验证' : m.name}</b><span className="row" style={{ marginLeft: 'auto' }}>{p.status === '已结束' ? <StatusPill tone="ok" icon="check">已结项</StatusPill> : <MsPill m={m} />}</span></div>
              <p>{p.status === '已结束' ? p.conclusion!.lessons : <>验收标准：{m.accept}</>}</p>
            </div>
            <div className="pk-in" style={{ marginTop: 8 }}>
              <div className="row" style={{ gap: 6 }}><span className="l">下一步</span><b>{nx.title}</b></div>
              {nx.from && <p>{nx.from}</p>}
            </div>
          </> : (
            <div className="pk-in" style={{ marginTop: 18 }}>
              <div className="row" style={{ gap: 6 }}><span className="l">还没有关键节点</span><b>等周颖确认立项</b></div>
              <p>验收条件：{p.accept}。确认立项后在项目详情里建节点。</p>
            </div>
          )}
          <DarkFoot dueAt={nx.dueAt} now={w.now} label={nx.dueLabel} btn={nx.btn} left={<span className="pk-dl">{p.confirmed ? `${fmtDate(p.confirmed.at)} 周颖确认立项` : `${fmtDate(p.createdAt)} 创建`} · {p.stations}</span>} />
        </section>
        <WeekCard w={w} a="week" />
        <ProgressCard w={w} a="prog" />
        <CoordCard w={w} a="co" />
        <FeedbackCard w={w} a="rv" />
        <CoverageCard w={w} a="cov" />
        <AssetCard a="ai" />
      </div>
    </>
  );
}

/** 管培生 · 版 C：反馈回路为中心。强调块 = 回路当前环节 */
function loopOf(w: World) {
  const p = w.pj1;
  if (!p.milestones.length) return { node: '—', round: 0, cur: -1, who: '周颖', what: '等周颖确认立项', detail: '确认立项、建好节点后，第一次提交成果就开始一轮来回。', btn: '看项目' };
  const m = curNode(p);
  const v = latestVersion(m) ?? latestVersion(w.ms1);
  const node = m.versions.length ? m.name : w.ms1.name;
  if (w.st === 'revise') return { node, round: 1, cur: 2, who: '林夏', what: '轮到你：按评审修改再交', detail: `关键问题：${v.review!.key}`, btn: '去修改再交' };
  if (w.st === 'pending') return { node, round: 2, cur: 1, who: '周颖', what: '轮到周颖：评审 V2', detail: `修改说明：${v.change}`, btn: '看提交记录' };
  if (w.st === 'blocked') return { node: w.ms1.name, round: 2, cur: 3, who: '林夏', what: '轮到你：推进后续节点，但节点受阻', detail: '「分流方案验证」受阻：试点要客服二组调排班 · 等周颖响应', btn: '看受阻记录' };
  return { node: '分流方案验证', round: 0, cur: 4, who: '—', what: '这个项目的来回都走完了', detail: '3 版成果、3 次评审、2 条下一步行动都已关闭；12.08 确认结项。', btn: '补记业务验证' };
}
const LOOP = ['提交成果', '带教评审', '下一步行动', '修改再交 / 推进'];
function TraineeC({ w }: { w: World }) {
  const lp = loopOf(w);
  const lastFb = w.feedback.find(f => f.judge);
  const ev = w.timeline.filter(e => /成果|评审|修改再交|受阻|立项|结项/.test(e.kind) && Date.parse(e.at) >= Date.parse(w.pj1.createdAt)).slice(0, 5);
  const items = ev.map((e, i) => ({ id: `${i}`, start: fmtDate(e.at), end: fmtTime(e.at), title: e.kind, sub: `${e.text} · ${e.who}`,
    domain: (e.tone === 'due' || e.tone === 'exam' ? 'exam' : e.tone === 'grow' ? 'grow' : e.tone === 'ment' ? 'ment' : 'acc') as 'grow' }));
  return (
    <>
      <TraineeHead w={w} />
      <div className="pk-t" style={{ gridTemplateRows: '176px 292px auto', gridTemplateAreas: '"lp lp tl prog" "lp lp tl prog" "pj pj cov ai"' }}>
        <section className="reco" style={area('lp')} aria-label="和带教的来回">
          <div className="r1"><span className="tile pk-info"><Icon name="repeat" /></span>和带教的来回 · {lp.node}{lp.round > 0 && <span className="for">第 <b>{lp.round}</b> 轮 · 现在轮到 <b>{lp.who}</b></span>}</div>
          <h2>{lp.what}</h2>
          <div className="pk-loop">
            {LOOP.map((s, i) => <div key={s} className={i < lp.cur ? 'done' : i === lp.cur ? 'cur' : ''}><i>{i < lp.cur ? <Icon name="check" /> : i + 1}</i><b>{s}</b><small>{i === 0 ? '管培生' : i === 1 ? '带教' : i === 2 ? '负责人' : '管培生'}</small></div>)}
          </div>
          <div className="pk-in"><p style={{ marginTop: 0 }}>{lp.detail}</p></div>
          {lastFb && (
            <div className="pk-in" style={{ marginTop: 8 }}>
              <div className="row" style={{ gap: 8 }}><span className="l">上一次评审</span><b>{lastFb.target}</b><span style={{ marginLeft: 'auto' }}><GradePill g={lastFb.grade} /></span></div>
              <p>带教判断：{lastFb.judge}</p>
            </div>
          )}
          <DarkFoot dueAt={w.actions[0]?.dueAt} now={w.now} label="距节点截止" btn={lp.btn} left={<span className="pk-dl">带教 2 个工作日内评审 · 「需改进」时至少一条修改再交</span>} />
        </section>
        <section className="card vcol" style={area('tl')} aria-label="来回记录">
          <CardHead title="来回记录" sub="提交、评审、行动" more={more('项目')} />
          <div className="vcol grow1" style={{ marginTop: 14 }}>{items.length ? <Timeline fill items={items} /> : <Empty icon="repeat" title="还没有来回">第一次提交成果后开始记录。</Empty>}</div>
        </section>
        <ProgressCard w={w} a="prog" />
        <ProjectCard w={w} a="pj" />
        <CoverageCard w={w} a="cov" />
        <AssetCard a="ai" />
      </div>
    </>
  );
}

// ================= 带教 =================
function MentorHead({ w }: { w: World }) {
  const n = judgeCount(w);
  return (
    <PageHead kicker={<Kicker now={w.now} extra="客户线带教 · 管理" />}
      title={<>在带 <em>2 人</em>{n ? <> · 有 <em>{n} 件事</em>等你判断</> : <> · 现在<em>没有</em>等你判断的事</>}</>}
      right={<><MetaPill>第 <b>{isoWeek(w.now)}</b> 周</MetaPill><MetaPill>待评审 <b>{w.toReview.length}</b></MetaPill></>} />
  );
}

/** 带教 · 版 B：按事。强调块 = 待我判断 */
function MentorB({ w }: { w: World }) {
  const gs = judgeGroups(w);
  return (
    <>
      <MentorHead w={w} />
      <div className="bento">
        <section className="reco s8 stretch" aria-label="待我判断">
          <div className="r1"><span className="tile pk-acc"><Icon name="inbox" /></span>待我判断 · 与待办一致<span className="for">共 <b>{judgeCount(w)}</b> 件 · 按离超时排序</span></div>
          <div className="pk-jg">
            {gs.map(g => (
              <div key={g.key}>
                <div className="pk-jh"><Icon name={g.icon} />{g.key}<b className="num">{g.items.length}</b></div>
                {g.items.length ? g.items.map(it => (
                  <div key={it.title} className="pk-in" style={{ marginTop: 8 }}>
                    <div className="row" style={{ gap: 8 }}><Av name={it.who} size="sm" /><b>{it.title}</b></div>
                    <p className="hm-clamp" style={{ WebkitLineClamp: 2 }}>{it.meta}</p>
                    <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
                      <span className="pk-dl" style={{ marginTop: 0 }}>{it.due ? `评审期限 ${fmtDue(it.due, w.now)}` : g.key === '受阻' ? '未响应' : '确认后才能建节点'}</span>
                      <button type="button" className="btn sec xs">{it.btn}</button>
                    </div>
                  </div>
                )) : <p className="pk-none">{g.empty}</p>}
              </div>
            ))}
          </div>
        </section>
        <BoardCard w={w} cls="s4 stretch" />
        <MenteeTable w={w} cls="s8 stretch" />
        <SwitchCard w={w} cls="s4 stretch" />
      </div>
    </>
  );
}

/** 带教 · 版 A：按项目。看板本身是焦点，不放强调块 */
function MentorA({ w }: { w: World }) {
  const lanes: { key: string; tone: 'plain' | 'acc' | 'info' | 'due'; cards: { name: string; who: string; node: string; meta: string; tag?: string }[] }[] = [
    { key: '待确认立项', tone: 'plain', cards: [] }, { key: '推进中', tone: 'acc', cards: [] }, { key: '等我评审', tone: 'info', cards: [] }, { key: '受阻', tone: 'due', cards: [] },
  ];
  for (const p of [w.pj1, w.pj2]) {
    if (!p) continue;
    const m = p.milestones.length ? curNode(p) : undefined;
    const card = { name: p.name, who: p.lead, node: m ? `${m.name} · ${m.status}` : '还没有节点', meta: `项目带教 ${p.mentor}${p.mentor === '周颖' ? '（你）' : ''}`, tag: p.mentor === '周颖' ? undefined : '吴桐负责' };
    if (p.status === '草拟') lanes[0].cards.push(card);
    else if (p.status === '已结束') continue;
    else if (m?.blocker && m.blocker.status !== '已解除') lanes[3].cards.push({ ...card, meta: `${m.blocker.reason} · ${m.blocker.status}` });
    else if (m?.status === '待评审' && latestVersion(m)?.reviewer === '周颖') lanes[2].cards.push({ ...card, meta: `${fmtDateTime(latestVersion(m).at)} 提交 V${latestVersion(m).no}` });
    else if (m?.status === '待评审') lanes[1].cards.push({ ...card, meta: `V${latestVersion(m).no} 等${latestVersion(m).reviewer}评审` });
    else lanes[1].cards.push(card);
  }
  const ended = [w.pj1, w.pj2].filter(p => p?.status === '已结束');
  const tasks = w.toReview.filter(r => r.scope === '任务');
  return (
    <>
      <MentorHead w={w} />
      <div className="bento">
        <section className="card s12" aria-label="项目看板">
          <CardHead title="项目看板" sub="我带的人参与的项目 · 按状态分列" more={more('项目列表')} />
          <div className="pk-lanes">
            {lanes.map(l => (
              <div key={l.key} className="pk-lane">
                <div className="pk-lh"><StatusPill tone={l.tone} dot>{l.key}</StatusPill><span className="num">{l.cards.length}</span></div>
                {l.cards.map(c => (
                  <div key={c.name} className="pk-pc">
                    <div className="row" style={{ gap: 8 }}><Tile icon="flag" domain="grow" size="sm" /><b className="grow1">{c.name}</b>{c.tag && <span className="typ">{c.tag}</span>}</div>
                    <div className="row" style={{ gap: 6, marginTop: 8 }}><Av name={c.who} size="sm" /><span style={{ fontSize: 12.5 }}>{c.who} 主责</span></div>
                    <small>{c.node}</small><small>{c.meta}</small>
                    {l.key === '待确认立项' && c.tag === undefined && <button type="button" className="btn pri xs" style={{ marginTop: 10 }}>确认立项</button>}
                    {l.key === '等我评审' && <button type="button" className="btn pri xs" style={{ marginTop: 10 }}>去评审</button>}
                    {l.key === '受阻' && <button type="button" className="btn pri xs" style={{ marginTop: 10 }}>去响应</button>}
                  </div>
                ))}
                {!l.cards.length && <p className="pk-lempty">没有</p>}
              </div>
            ))}
          </div>
          {ended.length > 0 && <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>已结项：{ended.map(p => p!.name).join('、')}（不在看板里，去项目列表看）</p>}
        </section>
        <MenteeTable w={w} cls="s8" />
        <div className="stack s4">
          <section className="card" aria-label="任务待评审">
            <CardHead title="任务待评审" sub="培养任务的日常轻反馈" />
            {tasks.length ? <div className="list">{tasks.map(t => (
              <div key={t.title} className="li"><Av name={t.who} size="sm" /><span className="tx"><b>{t.title}</b><span>{t.who} · {t.ctx} · {fmtDate(t.at)} 提交</span></span><span className="end"><StatusPill tone={Date.parse(t.dueAt) < Date.parse(w.now) ? 'due' : 'info'}>{fmtDue(t.dueAt, w.now)}</StatusPill></span></div>
            ))}</div> : <Empty icon="check" title="都评完了" />}
          </section>
          <BoardCard w={w} />
        </div>
      </div>
    </>
  );
}

/** 带教 · 版 C：按人。强调块 = 第一位有待办的人 */
function MentorC({ w }: { w: World }) {
  const todoOf = (name: string) => [
    ...w.toReview.filter(r => r.who === name).map(r => ({ text: `评审 ${r.title}`, meta: `${r.scope} · 期限 ${fmtDue(r.dueAt, w.now)}`, btn: '去评审' })),
    ...w.toConfirm.filter(r => r.who === name).map(r => ({ text: `确认立项 ${r.project}`, meta: `${fmtDate(r.at)} 创建`, btn: '确认立项' })),
    ...w.blockers.filter(r => r.who === name).map(r => ({ text: `响应受阻 ${r.node}`, meta: r.reason, btn: '去响应' })),
  ];
  const first = w.mentees.find(r => todoOf(r.name).length)?.name;
  return (
    <>
      <MentorHead w={w} />
      <div className="bento">
        {w.mentees.map(r => {
          const dark = r.name === first;
          const todo = todoOf(r.name);
          const p = r.name === '林夏' ? w.pj1 : w.pj2;
          const fb = r.name === '林夏' ? w.feedback[0] : undefined;
          return (
            <section key={r.name} className={`${dark ? 'reco' : 'card vcol'} s6 stretch`} aria-label={r.name}>
              <div className={dark ? 'r1' : 'row'} style={dark ? undefined : { gap: 8 }}>
                <Av name={r.name} /><span style={{ fontSize: dark ? 13 : 14.5, fontWeight: 600, color: dark ? '#fff' : 'var(--ink)' }}>{r.name}</span>
                <span className={dark ? 'for' : 'muted'} style={dark ? undefined : { marginLeft: 'auto', fontSize: 12 }}>{r.station}</span>
              </div>
              <div className={dark ? 'pk-in' : 'well'} style={{ marginTop: 14 }}>
                <div className="row" style={{ gap: 6 }}><span className={dark ? 'l' : 'muted'} style={{ fontSize: 11.5 }}>当前项目</span><b style={{ fontWeight: 600, fontSize: 13 }}>{r.project}</b>
                  {p && <span style={{ marginLeft: 'auto' }}><StatusPill tone={PJ_TONE[p.status]}>{p.status}</StatusPill></span>}</div>
                {p && p.milestones.length > 1 && p.lead === r.name ? <div style={{ marginTop: 12, padding: '0 14%' }}><StationChain stations={nodeChain(p)} /></div>
                  : <p style={{ marginTop: 4, fontSize: 12.5, color: dark ? '#D3D6E6' : 'var(--ink2)' }}>{r.node || '还没有参与的项目'}{r.name === '许诺' && w.pj1.status !== '草拟' ? ' · 也参与「来电归因优化」' : ''}</p>}
              </div>
              <div className="row" style={{ marginTop: 12, gap: 8, fontSize: 12.5 }}>
                <span className={dark ? 'pk-dl' : 'muted'} style={{ marginTop: 0 }}>最近反馈</span>{r.lastGrade && <GradePill g={r.lastGrade} />}<span style={{ color: dark ? '#D3D6E6' : 'var(--ink2)' }}>{r.last}</span>
                {r.risks.map(x => <StatusPill key={x} tone={RISK_TONE[x]} icon="alert">{x}</StatusPill>)}
              </div>
              {fb?.judge && <p className={dark ? '' : 'quote'} style={dark ? { fontSize: 12.5, lineHeight: 1.7 } : undefined}>{fb.text}</p>}
              <div className="sec-l" style={dark ? { color: '#A9ADC4' } : undefined}><span>等你处理</span><span>{todo.length} 件</span></div>
              {todo.length ? todo.map(t => (
                <div key={t.text} className={dark ? 'pk-in' : 'doc'} style={{ marginTop: dark ? 0 : undefined, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="grow1"><b style={{ display: 'block', fontSize: 13 }}>{t.text}</b><small style={{ fontSize: 11.5, color: dark ? '#A9ADC4' : 'var(--mute)' }}>{t.meta}</small></span>
                  <button type="button" className={dark ? 'btn sec sm' : 'btn pri xs'}>{t.btn}</button>
                </div>
              )) : <p className={dark ? 'pk-none' : 'muted'} style={{ fontSize: 12.5 }}>{r.next ?? '没有等你处理的事'}</p>}
            </section>
          );
        })}
        <SwitchCard w={w} cls="s4 stretch" />
        <BoardCard w={w} cls="s8 stretch" wide />
      </div>
    </>
  );
}

export const HOME_CSS = `
.pk-loop { margin-top: 16px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; position: relative; }
.pk-loop > div { position: relative; display: grid; justify-items: start; gap: 4px; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,.04); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
.pk-loop > div:not(:last-child)::after { content: ""; position: absolute; right: -7px; top: 50%; width: 6px; height: 6px; border-top: 1.5px solid rgba(255,255,255,.3); border-right: 1.5px solid rgba(255,255,255,.3); transform: translateY(-50%) rotate(45deg); }
.pk-loop i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-family: var(--num); font-size: 10.5px; font-weight: 700; background: #262A3D; color: #C9CCE0; box-shadow: 0 0 0 1.5px rgba(255,255,255,.2); }
.pk-loop i .ico { width: 12px; height: 12px; stroke-width: 2.4; }
.pk-loop b { font-size: 12.5px; font-weight: 600; color: #C9CCE0; }
.pk-loop small { font-size: 11px; color: #8A90A0; }
.pk-loop .done i { background: var(--grow); color: #fff; box-shadow: none; }
.pk-loop .cur { background: rgba(165,169,255,.14); box-shadow: inset 0 0 0 1px rgba(165,169,255,.45); }
.pk-loop .cur i { background: #A5A9FF; color: #1A1D2C; box-shadow: none; }
.pk-loop .cur b { color: #fff; }
.pk-jg { margin-top: 14px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.pk-jh { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #C9CCE0; }
.pk-jh .ico { width: 14px; height: 14px; }
.pk-jh b { margin-left: auto; font-size: 18px; font-weight: 700; color: #fff; }
.pk-none { margin-top: 8px; padding: 14px 12px; border-radius: 14px; font-size: 12px; color: #8A90A0; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
.pk-lanes { margin-top: 14px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.pk-lane { padding: 10px; border-radius: 16px; background: var(--sunk); display: grid; gap: 8px; align-content: start; min-height: 168px; }
.pk-lh { display: flex; align-items: center; justify-content: space-between; padding: 2px 2px 4px; font-size: 12px; color: var(--mute); }
.pk-lh .num { font-weight: 700; color: var(--ink2); }
.pk-pc { padding: 12px; border-radius: 14px; background: #fff; box-shadow: 0 0 0 1px var(--line), 0 4px 12px -8px rgba(28,36,64,.18); display: grid; }
.pk-pc b { font-size: 13px; font-weight: 600; }
.pk-pc small { display: block; font-size: 11.5px; color: var(--mute); margin-top: 4px; }
.pk-pc .btn { justify-self: start; }
.pk-lempty { padding: 18px 0; text-align: center; font-size: 12px; color: var(--faint); }
.reco.s6 .r1 { font-size: 13px; }
`;

export const HOME_VERSIONS = { homeT: [TraineeA, TraineeB, TraineeC], homeM: [MentorA, MentorB, MentorC] };
