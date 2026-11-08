import { useState } from 'react';
import { Avatar, CardHead, DomainTag, Empty, Icon, PhaseBar, ProgressRing, StationChain, StatusPill, Tile, useSession, type Domain, type IconName, type Tone } from '../../components/ui';
import { fmtDate, fmtTime } from '../../lib/time';
import { COLOR, ITEMS, TRAIN_TOTAL, type Ev, type World } from './picksData';
import { GradePill, Meter, MsPill, PJ_TONE, judgeOf, more, nodeChain, phases, stationChain } from './picksKit';

/* 成长档案（T3）挑版：骨架照现有个人档案（Profile）：头部卡 tm-hero + 培养进度 + 时间线（tm-tl）+ 提交与点评（tm-sub）。 */

const TONE_D: Record<Ev['tone'], Domain> = { grow: 'grow', ment: 'ment', exam: 'exam', acc: 'acc', week: 'week', due: 'exam', ai: 'ai' };
const EV_ICON = (k: string): IconName => (k.startsWith('评审') ? 'pen' : k === '换站' ? 'swap' : k.includes('受阻') ? 'alert' : k.includes('成果') || k === '修改再交' ? 'upload' : k.includes('证据') ? 'spark' : k.includes('立项') || k.includes('结项') ? 'check' : 'flag');
const ST_TONE: Record<string, Tone> = { 已通过: 'ok', 进行中: 'acc', 待评审: 'info', 未开始: 'plain' };

function Hero({ w }: { w: World }) {
  const { role } = useSession();
  return (
    <section className="card tm-hero" aria-label="基本信息">
      <Avatar name="林夏" color={COLOR.林夏} size="lg" />
      <div className="grow1">
        <div className="row" style={{ gap: 8 }}><h1>林夏</h1><StatusPill tone="ok">管培生</StatusPill><DomainTag domain="ment">客户线</DomainTag></div>
        <p className="tm-bio">喜欢把复杂的事拆清楚。轮岗期间想把客服和销售的数据串起来看。</p>
        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}><span className="typ">行业研究</span><span className="typ">数据整理</span><span className="typ">Claude</span></div>
      </div>
      <div className="tm-hero-kv">
        <div><span>期次</span><b>2026 秋季班</b></div>
        <div><span>入职</span><b className="num">2026.09.10 周四</b></div>
        <div><span>当前</span><b>{w.station.stage} · {w.station.name}（第 {w.station.no} 站）</b></div>
        <div><span>默认带教</span><b>周颖</b></div>
      </div>
      <div className="tm-hero-act">
        <button type="button" className="btn sec sm"><Icon name="layers" />阶段复盘<span className="tag" style={{ height: 18, fontSize: 10.5, padding: '0 6px' }}>B</span></button>
        {role !== 'trainee' && <button type="button" className="btn ghost sm"><Icon name="swap" />交接卡</button>}
      </div>
    </section>
  );
}

function TimelineCard({ w, cls, n = 9 }: { w: World; cls: string; n?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? w.timeline : w.timeline.slice(0, n);
  return (
    <section className={`card ${cls}`} aria-label="成长时间线">
      <CardHead title="成长时间线" sub={`${w.timeline.length} 条 · 本人事件 + 参与项目的事件`} />
      <ol className="tm-tl">
        {shown.map(e => (
          <li key={e.at + e.kind}>
            <span className="tm-tl-d num">{fmtDate(e.at)}<small>{fmtTime(e.at)}</small></span>
            <span className={`tm-tl-dot d-${TONE_D[e.tone]}`}><Icon name={EV_ICON(e.kind)} /></span>
            <span className="tm-tl-t"><b style={{ fontWeight: 600 }}>{e.kind}</b>{e.text}<span className="muted">· {e.who}</span></span>
          </li>
        ))}
      </ol>
      {w.timeline.length > n && <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setAll(!all)}>{all ? '收起' : `展开全部 ${w.timeline.length} 条`}<Icon name={all ? 'up' : 'down'} /></button>}
    </section>
  );
}

function PassedList({ w, filter, title = '通过的成果', cls }: { w: World; filter?: (from: string) => boolean; title?: string; cls?: string }) {
  const list = w.passed.filter(p => (filter ? filter(p.from) : true));
  return (
    <section className={`card ${cls ?? ''}`} aria-label={title}>
      <CardHead title={title} sub={`${list.length} 项 · 本人提交且已通过 + 认定记录`} />
      {list.length ? <div className="tm-subs">{list.map(p => (
        <a key={p.title + p.at} className="tm-sub">
          <span className="row" style={{ gap: 8 }}><Tile icon={p.kind === '认定' ? 'check' : p.from.startsWith('任务') ? 'repeat' : 'flag'} domain={p.kind === '认定' ? 'ment' : 'grow'} size="sm" /><b className="grow1">{p.title}</b>{p.grade ? <GradePill g={p.grade} /> : <StatusPill tone="info" icon="check">认定</StatusPill>}</span>
          <small>{p.from} · {fmtDate(p.at)}{p.via ? ` · ${p.via}` : ''}</small>
        </a>
      ))}</div> : <Empty icon="inbox" title="还没有通过的成果" />}
    </section>
  );
}

function ProgressMini({ w, cls, chain = true }: { w: World; cls?: string; chain?: boolean }) {
  const pct = Math.round((w.trainDay / TRAIN_TOTAL) * 100);
  return (
    <section className={`card ${cls ?? ''}`} aria-label="培养进度">
      <CardHead title="培养进度" sub="站级进度对团队公开" more={more('我的路径')} />
      <div className="row" style={{ marginTop: 14, gap: 18, alignItems: 'center' }}>
        <ProgressRing value={pct} sub={`第 ${w.trainDay} / ${TRAIN_TOTAL} 天`} domain="acc" size={chain ? 104 : 96} />
        <div className="grow1 stack" style={{ gap: 12 }}>
          <div><div className="sec-l" style={{ marginTop: 0 }}>阶段</div><PhaseBar phases={phases(w)} /></div>
          {chain && <div><div className="sec-l" style={{ marginTop: 0 }}>培养五站</div><StationChain stations={stationChain(w)} /></div>}
        </div>
      </div>
    </section>
  );
}

function ItemsCount({ w, cls }: { w: World; cls?: string }) {
  return (
    <section className={`card ${cls ?? ''}`} aria-label="能力项覆盖">
      <CardHead title="能力项覆盖" sub={`${w.coverage} / 5 项有证据`} />
      <div className="stack" style={{ gap: 2, marginTop: 10 }}>
        {ITEMS.map((n, i) => { const j = judgeOf(w, i + 1); return (
          <div key={n} className="pk-cov"><span className="num">{i + 1}</span><span className="grow1" style={{ color: j.list.length ? 'var(--ink)' : 'var(--mute)' }}>{n}</span><Meter lv={j.best} /><span className="num pk-cn">{j.list.length}</span></div>
        ); })}
      </div>
    </section>
  );
}

/** 版 A：项目经历主线 */
function ProfileA({ w }: { w: World }) {
  const p = w.pj1;
  const fromProject = w.passed.filter(x => x.from === p.name || x.via);
  const ev = w.evidence.filter(e => e.project === p.name);
  return (
    <>
      <Hero w={w} />
      <div className="bento" style={{ marginTop: 12 }}>
        <section className="card s8" aria-label="项目经历">
          <CardHead title="项目经历" sub="1 个项目 · 目标、角色、交付结论与验证状态" more={more('项目列表')} />
          <article className="pk-xp">
            <div className="row" style={{ gap: 10 }}><Tile icon="flag" domain="grow" size="lg" /><span className="grow1"><b className="pk-xt">{p.name}</b><small className="muted">主责 · 和许诺一起 · 项目带教 {p.mentor} · {p.stations}</small></span><StatusPill tone={PJ_TONE[p.status]} size="lg">{p.status}</StatusPill></div>
            <div className="pk-xg">
              <div><span className="l">目标</span><p>{p.goal}</p></div>
              <div><span className="l">交付结论与业务验证</span>{p.conclusion ? <p className="row" style={{ gap: 6 }}><StatusPill tone="ok" icon="check">交付{p.conclusion.delivery}</StatusPill><StatusPill>业务{p.conclusion.verify}</StatusPill></p> : <p className="muted">未结项 · {p.milestones.length ? `${p.milestones.filter(m => m.status === '已通过').length} / ${p.milestones.length} 个节点已通过` : '等确认立项'}</p>}</div>
            </div>
            {p.milestones.length > 0 && <div style={{ padding: '6px 24% 0' }}><StationChain stations={nodeChain(p)} /></div>}
            <div className="sec-l"><span>这个项目带来的成果与认定</span><span>{fromProject.length} 项</span></div>
            {fromProject.length ? <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{fromProject.map(x => <span key={x.title} className="pk-tag">{x.kind === '认定' ? <Icon name="check" size={12} /> : <Icon name="upload" size={12} />}{x.title}{x.grade ? ` · ${x.grade}` : ' · 认定'}</span>)}</div> : <p className="muted" style={{ fontSize: 12.5 }}>还没有通过的节点成果。</p>}
            <div className="sec-l"><span>提炼的能力证据</span><span>{ev.length} 条</span></div>
            {ev.length ? <div className="stack" style={{ gap: 6 }}>{ev.map(e => <div key={e.text} className="well row" style={{ gap: 10, fontSize: 12.5 }}><span className="pk-ci">{e.item}</span><span className="grow1">{e.text}<small className="muted" style={{ display: 'block', fontSize: 11.5 }}>{ITEMS[e.item - 1]} · {e.judge} · 来源 {e.src}</small></span><a className="go">来源<Icon name="right" /></a></div>)}</div> : <p className="muted" style={{ fontSize: 12.5 }}>节点评审时，带教可以把成果提炼为能力证据。</p>}
          </article>
        </section>
        <div className="stack s4"><ProgressMini w={w} chain={false} /><ItemsCount w={w} /></div>
        <TimelineCard w={w} cls="s7" />
        <PassedList w={w} title="项目之外的成果" filter={from => from.startsWith('任务')} cls="s5" />
      </div>
    </>
  );
}

/** 版 B：能力证据主线 */
function ProfileB({ w }: { w: World }) {
  const p = w.pj1;
  return (
    <>
      <Hero w={w} />
      <div className="bento" style={{ marginTop: 12 }}>
        <section className="card s8" aria-label="能力证据">
          <CardHead title="能力证据" sub={`按「4+1 主线」 · ${w.evidence.length} 条 · ${w.coverage} / 5 项有证据`}><StatusPill tone="info">季度答辩用</StatusPill></CardHead>
          <div className="pk-items">
            {ITEMS.map((n, i) => { const j = judgeOf(w, i + 1); return (
              <div key={n} className="pk-it">
                <div className="pk-ih"><span className="pk-ci">{i + 1}</span><b>{n}</b><span className="grow1" /><Meter lv={j.best} /><span className={j.list.length ? 'pk-jl' : 'pk-jl none'}>{j.label}</span></div>
                {j.list.length ? j.list.map(e => (
                  <div key={e.text} className="pk-ev">
                    <p>{e.text}</p>
                    <small><StatusPill tone={e.judge === '可独立完成' ? 'ok' : 'info'}>{e.judge}</StatusPill>来源：<a className="go">{e.src}<Icon name="right" /></a>· {e.by}确认 · {fmtDate(e.at)}</small>
                  </div>
                )) : <p className="pk-evn">{i === 3 ? '营销线是否作为通用能力项待定' : '还没有证据：带教在评审时可以提炼'}</p>}
              </div>
            ); })}
          </div>
        </section>
        <div className="stack s4">
          <ProgressMini w={w} chain={false} />
          <section className="card" aria-label="项目经历">
            <CardHead title="项目经历" more={more('项目')} />
            <div className="doc" style={{ marginTop: 12 }}><Tile icon="flag" domain="grow" /><span className="grow1"><b>{p.name}</b><small>主责 · {p.conclusion ? `交付${p.conclusion.delivery} · 业务${p.conclusion.verify}` : p.status}</small></span><StatusPill tone={PJ_TONE[p.status]}>{p.status}</StatusPill></div>
          </section>
          <PassedList w={w} />
        </div>
        <TimelineCard w={w} cls="s12" n={6} />
      </div>
    </>
  );
}

/** 版 C：培养路径主线 */
function ProfileC({ w }: { w: World }) {
  const [pick, setPick] = useState<number | null>(null);
  const sel = pick ?? w.curStation;
  const order = [...w.path.keys()].reverse().filter(i => i <= Math.max(w.curStation, sel));
  return (
    <>
      <Hero w={w} />
      <div className="bento" style={{ marginTop: 12 }}>
        <section className="card s12" aria-label="培养进度">
          <CardHead title="培养进度" sub="点一站，看那段时间做了什么" more={more('我的路径')} />
          <div className="row" style={{ marginTop: 14, gap: 22, alignItems: 'center' }}>
            <ProgressRing value={Math.round((w.trainDay / TRAIN_TOTAL) * 100)} sub={`第 ${w.trainDay} / ${TRAIN_TOTAL} 天`} domain="acc" size={112} />
            <div className="grow1 stack" style={{ gap: 14 }}>
              <div><div className="sec-l" style={{ marginTop: 0 }}>阶段</div><PhaseBar phases={phases(w)} /></div>
              <div><div className="sec-l" style={{ marginTop: 0 }}><span>培养五站</span><span>任务 {w.tasksDue[0]} / {w.tasksDue[1]} 应完成的已通过</span></div><StationChain stations={stationChain(w)} onPick={setPick} /></div>
            </div>
          </div>
        </section>
        <div className="stack s8">
          {order.map(i => { const s = w.path[i]; const now = i === w.curStation; return (
            <section key={s.name} className={`card${i === sel ? '' : ' pk-dim'}`} aria-label={s.name}>
              <CardHead title={<>{s.name}<span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>第 {i + 1} 站 · {s.stage}</span></>} sub={`${s.start.slice(5).replace('-', '.')} – ${s.end.slice(5).replace('-', '.') /* 北京时间日期串 */}`}>
                <StatusPill tone={now ? 'acc' : i < w.curStation ? 'ok' : 'plain'}>{now ? '在站' : i < w.curStation ? '已结束' : '未开始'}</StatusPill>
              </CardHead>
              <div className="rows">
                {s.tasks.map((t, k) => (
                  <div key={t.name} className="rw" style={{ gridTemplateColumns: '28px minmax(0,1fr) auto' }}>
                    <span className="num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--grow-ink)' }}>{k + 1}</span>
                    <span><span className="nm">{t.name}</span>{t.inProject && <small className="muted" style={{ display: 'block', fontSize: 11.5 }}>在项目中完成 · {t.inProject}</small>}</span>
                    <span className="end"><StatusPill tone={ST_TONE[t.status] ?? 'plain'}>{t.status}</StatusPill></span>
                  </div>
                ))}
              </div>
              {s.projects.length > 0 && (
                <div className="doc" style={{ marginTop: 10 }}><Tile icon="flag" domain="grow" /><span className="grow1"><b>{s.projects[0]}</b><small>{w.pj1.status === '草拟' ? '草拟 · 等确认立项' : w.pj1.milestones.map(m => `${m.name} ${m.status}`).join(' · ')}</small></span>
                  <span className="row" style={{ gap: 4 }}>{w.pj1.milestones.length ? <MsPill m={w.pj1.milestones.find(m => m.status !== '已通过') ?? w.pj1.milestones[0]} /> : <StatusPill>草拟</StatusPill>}</span></div>
              )}
            </section>
          ); })}
          {order.length < w.path.length && <p className="muted" style={{ fontSize: 12, paddingLeft: 4 }}>之后的 {w.path.length - order.length} 站还没开始：{w.path.slice(Math.max(w.curStation, sel) + 1).map(s => s.name).join('、')}</p>}
        </div>
        <div className="stack s4"><ItemsCount w={w} /><PassedList w={w} /></div>
        <TimelineCard w={w} cls="s12" n={6} />
      </div>
    </>
  );
}

export const PROFILE_CSS = `
.pk-xp { margin-top: 14px; padding: 16px; border-radius: 18px; background: var(--well); box-shadow: 0 0 0 1px var(--line); }
.pk-xt { display: block; font-size: 16px; font-weight: 600; letter-spacing: -.01em; }
.pk-xp small { font-size: 11.5px; }
.pk-xg { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pk-xg .l, .pk-xp .l { font-size: 11.5px; color: var(--mute); }
.pk-xg p { margin-top: 4px; font-size: 13px; line-height: 1.7; color: var(--ink2); }
.pk-tag { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border-radius: 9px; background: #fff; box-shadow: 0 0 0 1px var(--line); font-size: 12px; color: var(--ink2); }
.pk-tag .ico { color: var(--grow-ink); }
.pk-ci { width: 22px; height: 22px; border-radius: 7px; flex: none; display: grid; place-items: center; background: var(--grow-soft); color: var(--grow-ink); font-family: var(--num); font-size: 11.5px; font-weight: 700; }
.pk-items { margin-top: 12px; display: grid; gap: 8px; }
.pk-it { padding: 12px 14px; border-radius: 16px; background: var(--well); box-shadow: 0 0 0 1px var(--line); }
.pk-ih { display: flex; align-items: center; gap: 10px; }
.pk-ih b { font-size: 13.5px; font-weight: 600; }
.pk-jl { font-size: 11.5px; color: var(--grow-ink); font-weight: 500; min-width: 84px; text-align: right; }
.pk-jl.none { color: var(--faint); font-weight: 400; }
.pk-ev { margin: 10px 0 0 32px; padding-top: 10px; box-shadow: inset 0 1px 0 var(--line); }
.pk-ev p { font-size: 13px; line-height: 1.7; color: var(--ink); }
.pk-ev small { margin-top: 4px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11.5px; color: var(--mute); }
.pk-evn { margin: 6px 0 0 32px; font-size: 12px; color: var(--faint); }
.card.pk-dim { opacity: .78; }
`;

export const PROFILE_VERSIONS = [ProfileA, ProfileB, ProfileC];
