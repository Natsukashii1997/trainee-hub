import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import {
  Avatar, CardHead, DomainTag, Empty, Icon, MetaPill, PageHead, PhaseBar, ProgressRing, Segmented, StationChain, StatusPill, Tile,
  useSession, type Domain, type IconName, type StepState, type Tone,
} from '../components/ui';
import * as api from '../data/api';
import type { EventLog, Grade, Line, Role, User } from '../data/types';
import { ROLE_LABEL } from '../data/types';
import { fmtDate, fmtDateTime, fmtFull, fmtTime, fmtWeekday } from '../lib/time';

/* 团队（PRD 3.2、7）：成员列表 + 个人档案。站级进度对团队公开；任务、产出、点评、交接要点按查看人权限由数据层裁剪。 */

const TABS = [{ to: '/team', label: '成员' }, { to: '/schedule/events', label: '活动', tag: '二期' }];
const LINE_DOMAIN: Record<Line, Domain> = { 老师线: 'grow', 客户线: 'ment', 市场线: 'team', AIBP: 'ai' };
const lineDomain = (line?: Line): Domain => (line ? LINE_DOMAIN[line] : 'week');
const nameOf = (id?: string) => (id ? api.findUser(id)?.name ?? '—' : '—');
const ROLES: Role[] = ['trainee', 'mentor', 'admin', 'colleague'];

/** 轮岗六站的圆点链（站级进度，公开） */
function rotationChain(userId: string) {
  const sp = api.stationsProgress(userId);
  const rotStage = api.rotationModules()[0]?.stageId;
  const rot = sp.stations.filter(s => s.module.stageId === rotStage);
  return rot.map(s => ({
    name: s.module.name,
    state: (s.pos === 'current' ? 'cur' : s.pos === 'left' ? (s.settled ? 'done' : 'due') : 'todo') as StepState,
    sub: s.pos === 'upcoming' ? fmtDate(s.station.startAt) : undefined,
    title: `${s.module.name}岗 · ${fmtDate(s.station.startAt)}–${fmtDate(s.station.endAt)}${s.pos === 'left' ? (s.settled ? ' · 已结清' : ' · 时间到了，还没结清') : ''}`,
  }));
}

// =====================================================================
// 成员列表：当前站、站带教、主带教
// =====================================================================
export function Members() {
  api.useDataVersion();
  const [f, setF] = useState<Role | 'all'>('all');
  const users = api.listUsers();
  const cohort = api.cohortsAll()[0];
  const ts = api.activeTrainees();
  const others = users.filter(u => u.role !== 'trainee' && (f === 'all' || u.role === f));
  const showTrainees = f === 'all' || f === 'trainee';
  const lines = new Set(ts.map(u => api.currentPosition(u.id)?.module.id).filter(Boolean));

  return (
    <Sheet crumbs={[{ label: '团队', to: '/team' }, { label: '成员' }]} tabs={TABS}>
      <style>{CSS}</style>
      <PageHead
        kicker={<>{cohort?.name ?? '团队'}<i aria-hidden="true" />{users.length} 人</>}
        title={<><em>{ts.length} 位</em>管培生，正分布在 {lines.size} 个岗位</>}
        sub="谁在哪站、谁带谁，对团队公开；任务、产出和点评只有本人、相关带教人和管理员看得到。公告、活动和周报汇总在二期上线。"
        right={<Segmented label="看" value={f} onChange={setF} options={[{ value: 'all', label: '全部' }, ...ROLES.map(r => ({ value: r, label: ROLE_LABEL[r] }))]} />}
      />

      {showTrainees && (
        <div className="bento">
          {ts.map(u => {
            const pos = api.currentPosition(u.id);
            const nx = api.nextStation(u.id);
            return (
              <Link key={u.id} to={`/team/${u.id}`} className="card link s4 tm-card" aria-label={`${u.name}的档案`}>
                <div className="row" style={{ gap: 10 }}>
                  <Avatar name={u.name} color={u.color} size="lg" />
                  <span className="grow1"><b className="tm-name">{u.name}</b><small className="muted">{u.line ?? '管培生'}{u.joinedAt ? ` · ${fmtDate(u.joinedAt)} 入职` : ''}</small></span>
                </div>
                <div className="tm-now">
                  <span className="lbl">现在在</span>
                  <b>{pos ? `${pos.module.name}${pos.rotIndex >= 0 ? '岗' : ''}` : '—'}</b>
                  {pos && pos.rotIndex >= 0 && <span className="num tm-wk">第 {pos.week} 周 · 第 {pos.rotIndex + 1} / {pos.rotation.length} 站</span>}
                </div>
                <div style={{ marginTop: 14 }}><StationChain stations={rotationChain(u.id)} /></div>
                <div className="tm-kv">
                  <div><span>站带教</span><b>{pos?.stationMentorId ? nameOf(pos.stationMentorId) : <span className="muted">管理员接</span>}</b></div>
                  <div><span>主带教</span><b>{pos?.mainMentorId ? nameOf(pos.mainMentorId) : <span className="muted">管理员担任</span>}</b></div>
                  <div><span>下一站</span><b>{nx ? `${api.moduleById(nx.moduleId).name} · ${fmtDate(nx.startAt)}` : '—'}</b></div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {others.length > 0 && (
        <section className="card" style={{ marginTop: 12 }} aria-label="带教人与同事">
          <CardHead title={f === 'all' ? '带教人、管理员与同事' : ROLE_LABEL[f as Role]} sub={`${others.length} 人`} />
          <div className="tm-others">
            {others.map(u => {
              const mine = api.allStations().filter(s => s.stationMentorId === u.id && api.stationTimePos(s) === 'current').length;
              const contrib = api.contributionsOf(u.id).length;
              return (
                <Link key={u.id} to={`/team/${u.id}`} className="tm-o">
                  <Avatar name={u.name} color={u.color} />
                  <span className="grow1">
                    <b>{u.name}<StatusPill tone={u.role === 'admin' ? 'acc' : u.role === 'mentor' ? 'info' : 'plain'}>{ROLE_LABEL[u.role]}</StatusPill></b>
                    <small>{u.team}{u.bio ? ` · ${u.bio}` : ''}</small>
                  </span>
                  <span className="tm-o-n">
                    {u.role === 'mentor' && <span><b className="num">{mine}</b>在带</span>}
                    <span><b className="num">{contrib}</b>贡献</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </Sheet>
  );
}

// =====================================================================
// 个人档案：成长时间线、交接卡、提交与点评、贡献的资产（PRD 3.2）
// =====================================================================
const EVENT_LOOK: { test: (t: EventLog['type']) => boolean; icon: IconName; domain: Domain }[] = [
  { test: t => t === 'submission.created', icon: 'upload', domain: 'grow' },
  { test: t => t === 'review.created', icon: 'pen', domain: 'ment' },
  { test: t => t === 'quiz.scored', icon: 'quiz', domain: 'exam' },
  { test: t => t === 'weekly.received', icon: 'doc', domain: 'week' },
  { test: t => t === 'task.overdue', icon: 'alert', domain: 'exam' },
  { test: t => t === 'handover.written', icon: 'swap', domain: 'ment' },
  { test: t => t.startsWith('station.') || t.startsWith('path.'), icon: 'swap', domain: 'acc' },
  { test: t => t.startsWith('asset.'), icon: 'spark', domain: 'ai' },
  { test: t => t.startsWith('task.'), icon: 'flag', domain: 'grow' },
];
const lookOf = (t: EventLog['type']) => EVENT_LOOK.find(x => x.test(t)) ?? { icon: 'clock' as IconName, domain: 'week' as Domain };
const GRADE_TONE: Record<Grade, Tone> = { 优秀: 'ok', 达标: 'ok', 需改进: 'warn' };

export function Profile() {
  api.useDataVersion();
  const { id = '' } = useParams();
  const { me } = useSession();
  const [more, setMore] = useState(false);
  const u = api.findUser(id);
  if (!u) return <Sheet crumbs={[{ label: '团队', to: '/team' }, { label: '档案' }]} tabs={TABS}><div className="card"><Empty size="lg" icon="user" title="找不到这个人" action={<Link className="btn sec sm" to="/team">回到成员列表</Link>}>可能链接有误，或这个人已不在团队里。</Empty></div></Sheet>;

  const self = u.id === me.id;
  const isTrainee = u.role === 'trainee';
  const pos = isTrainee ? api.currentPosition(u.id) : null;
  const prog = isTrainee ? api.progressOf(u.id) : null;
  const seeTasks = isTrainee && api.canSeeTaskStatus(me, u.id);
  const seeHandover = isTrainee && !self && (me.role === 'admin' || api.isRelatedMentor(me, u.id));
  const cards = seeHandover ? api.handoverCard(u.id, me) : [];
  const timeline = api.timelineOf(u.id, me);
  const assets = api.assetsBy(u.id).filter(a => a.status === 'live' || self || me.role === 'admin');
  const contribs = api.contributionsOf(u.id);
  const stages = isTrainee ? api.stagesAll().filter(s => s.templateId === api.cohortById(u.cohortId)?.templateId) : [];
  const phases = stages.map(s => ({ name: s.name.split('：')[0], state: (pos && s.no < pos.stage.no ? 'done' : pos && s.no === pos.stage.no ? 'cur' : 'todo') as StepState }));

  // 提交与点评：数据层按查看人裁剪；看不到的任务直接不返回
  const delivered = isTrainee ? api.visibleTasksOf(me, u.id).filter(t => api.isDelivered(t) || t.status === 'revise')
    .map(t => api.taskDetail(t.id, me)).filter((d): d is NonNullable<typeof d> => !!d)
    .sort((a, b) => Date.parse(b.submissions[0]?.at ?? b.effectiveDueAt) - Date.parse(a.submissions[0]?.at ?? a.effectiveDueAt)) : [];

  const shown = more ? timeline : timeline.slice(0, 9);

  return (
    <Sheet crumbs={[{ label: '团队', to: '/team' }, { label: self ? '我的档案' : `${u.name}的档案` }]} tabs={TABS} action={self || isTrainee ? undefined : null}>
      <style>{CSS}</style>
      <section className="card tm-hero" aria-label="基本信息">
        <Avatar name={u.name} color={u.color} size="lg" />
        <div className="grow1">
          <div className="row" style={{ gap: 8 }}>
            <h1>{u.name}</h1>
            <StatusPill tone={u.role === 'admin' ? 'acc' : u.role === 'mentor' ? 'info' : u.role === 'trainee' ? 'ok' : 'plain'}>{ROLE_LABEL[u.role]}</StatusPill>
            {u.line && <DomainTag domain={lineDomain(u.line)}>{u.line}</DomainTag>}
            {u.stoppedAt && <StatusPill tone="due">已中止培养</StatusPill>}
          </div>
          <p className="tm-bio">{u.bio || (self ? '还没写自我介绍。' : '还没写自我介绍。')}</p>
          {!!u.skills?.length && <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>{u.skills.map(s => <span key={s} className="typ">{s}</span>)}</div>}
        </div>
        <div className="tm-hero-kv">
          <div><span>{isTrainee ? '期次' : '团队'}</span><b>{u.team}</b></div>
          {u.joinedAt && <div><span>入职</span><b className="num">{fmtFull(u.joinedAt)}</b></div>}
          {pos && <div><span>当前</span><b>{pos.module.name}{pos.rotIndex >= 0 ? `岗 · 第 ${pos.week} 周` : ''}</b></div>}
          {pos && <div><span>站带教 / 主带教</span><b>{pos.stationMentorId ? nameOf(pos.stationMentorId) : '管理员'} / {pos.mainMentorId ? nameOf(pos.mainMentorId) : '管理员'}</b></div>}
          {!isTrainee && <div><span>贡献</span><b className="num">{contribs.length} 条</b></div>}
        </div>
        {isTrainee && (
          <div className="tm-hero-act">
            <button type="button" className="btn sec sm" disabled title="二期上线：一键汇总全部产出、点评和贡献，并检查完整度"><Icon name="layers" />答辩材料包<span className="tag" style={{ height: 18, fontSize: 10.5, padding: '0 6px' }}>二期</span></button>
            {seeTasks && !self && <Link className="btn ghost sm" to="/growth/board"><Icon name="team" />在带教看板看</Link>}
          </div>
        )}
      </section>

      {isTrainee && prog && (
        <div className="bento" style={{ marginTop: 12 }}>
          <section className="card s8 stretch" aria-label="培养进度">
            <CardHead title="培养进度" sub="站级进度对团队公开" more={self ? { to: '/growth/me', label: '我的路径' } : undefined} />
            <div className="row" style={{ marginTop: 14, gap: 22, alignItems: 'center' }}>
              <ProgressRing value={prog.time.pct} sub={`第 ${prog.time.day} / ${prog.time.total} 天`} domain="acc" size={120} />
              <div className="grow1 stack" style={{ gap: 14 }}>
                <div><div className="sec-l" style={{ marginTop: 0 }}>阶段</div><PhaseBar phases={phases} /></div>
                <div><div className="sec-l" style={{ marginTop: 0 }}><span>轮岗六站</span><span>绿勾 = 已结清，绿圈 = 时间到了还没结清</span></div><StationChain stations={rotationChain(u.id)} /></div>
              </div>
            </div>
            {seeTasks && (
              <div className="tm-comp">
                <span className="muted">完成进度</span>
                <b className="num">{prog.completion.passed} / {prog.completion.due}</b>
                <span className="muted">应完成的路径任务已通过</span>
                {prog.gap < 0 ? <StatusPill tone="warn">落后 {-prog.gap} 条</StatusPill> : <StatusPill tone="ok">按计划</StatusPill>}
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}><Icon name="lock" size={12} /> 只对本人、相关带教人、管理员显示</span>
              </div>
            )}
          </section>

          {seeHandover ? (
            <section className="card s4 stretch tm-hand" aria-label="交接卡">
              <CardHead title="交接卡" sub="历次站的交接要点"><StatusPill tone="info" icon="lock">带教可见</StatusPill></CardHead>
              {cards.length ? (
                <div className="tm-hand-list">
                  {cards.map(c => (
                    <div key={c.station.id} className="well">
                      <div className="row" style={{ justifyContent: 'space-between' }}><b>{c.module.name}岗</b><span className="muted num" style={{ fontSize: 11.5 }}>{nameOf(c.note!.authorId)} · {fmtDate(c.note!.at)}</span></div>
                      <ol>{c.note!.points.map((p, i) => <li key={i}>{p}</li>)}</ol>
                    </div>
                  ))}
                </div>
              ) : <Empty icon="swap" title="还没有交接要点">每站结束后 2 个工作日内由原站带教填写，最多 3 条。</Empty>}
              <p className="tm-foot"><Icon name="info" size={12} />站评三档在二期随考核模块加入。</p>
            </section>
          ) : (
            <ContribCard u={u} contribs={contribs} className="s4 stretch" />
          )}
        </div>
      )}

      <div className="bento" style={{ marginTop: 12 }}>
        <section className={isTrainee ? 'card s7' : 'card s8'} aria-label="成长时间线">
          <CardHead title={isTrainee ? '成长时间线' : '动态'} sub={`${timeline.length} 条 · 按你的权限显示`} />
          {timeline.length ? (
            <ol className="tm-tl">
              {shown.map(({ event: e, text }) => {
                const lk = lookOf(e.type);
                return (
                  <li key={e.id}>
                    <span className="tm-tl-d num">{fmtDate(e.at)}<small>{fmtTime(e.at)}</small></span>
                    <span className={`tm-tl-dot d-${lk.domain}`}><Icon name={lk.icon} /></span>
                    <span className="tm-tl-t">{text}{e.visibility !== 'public' && <Icon name="lock" size={11} />}</span>
                  </li>
                );
              })}
            </ol>
          ) : <Empty icon="clock" title="还没有动态" />}
          {timeline.length > 9 && <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setMore(!more)}>{more ? '收起' : `展开全部 ${timeline.length} 条`}<Icon name={more ? 'up' : 'down'} /></button>}
        </section>

        {isTrainee ? (
          <section className="card s5" aria-label="提交与点评">
            <CardHead title="提交与点评" sub={seeTasks ? `${delivered.length} 份` : undefined} />
            {!seeTasks ? (
              <div className="tm-locked"><span><Icon name="lock" size={18} /></span><b>产出、点评和考核不对你公开</b><p>只有 {u.name} 本人、相关带教人和管理员看得到。你能看到的是站级进度和公开贡献。</p></div>
            ) : delivered.length ? (
              <div className="tm-subs">
                {delivered.slice(0, 7).map(d => {
                  const rv = d.reviews[0];
                  const sub = d.submissions[0];
                  return (
                    <Link key={d.task.id} to={`/growth/tasks/${d.task.id}`} className="tm-sub">
                      <span className="row" style={{ gap: 8 }}>
                        <Tile icon={d.task.kind === 'path' ? 'flag' : 'repeat'} domain={d.task.kind === 'path' ? 'grow' : 'week'} size="sm" />
                        <b className="grow1">{d.task.name}</b>
                        {!d.canSee ? <StatusPill tone="plain" icon="lock">产出不对你公开</StatusPill> : rv ? <StatusPill tone={GRADE_TONE[rv.grade]} icon={rv.grade === '需改进' ? undefined : 'check'}>{rv.grade}</StatusPill> : <StatusPill tone={d.statusLabel === '—' ? 'plain' : 'info'}>{d.statusLabel === '—' ? '成绩不公开' : d.statusLabel}</StatusPill>}
                      </span>
                      <small>{d.module ? `${d.module.name}岗` : '周期'}{sub ? ` · ${fmtDateTime(sub.at)} 交 · 第 ${sub.version} 版` : ''}</small>
                      {d.canSee && rv && <p className="tm-q">「{rv.comment}」<span>— {nameOf(rv.mentorId)}</span></p>}
                    </Link>
                  );
                })}
              </div>
            ) : <Empty icon="inbox" title="还没有提交">交了第一份产出后会出现在这里。</Empty>}
          </section>
        ) : (
          <ContribCard u={u} contribs={contribs} className="s4" />
        )}

        <section className="card s12" aria-label="贡献的资产">
          <CardHead title="贡献的 AI 资产" sub={`${assets.length} 个`} more={{ to: '/ai/assets', label: '资产库' }} />
          {assets.length ? (
            <div className="tm-assets">
              {assets.map(a => (
                <Link key={a.id} to={`/ai/assets/${a.id}`} className="tm-asset">
                  <Tile icon={a.type === 'Skill' ? 'spark' : a.type === 'Prompt' ? 'pen' : a.type === '工作流' ? 'route' : 'q'} domain="ai" />
                  <span className="grow1"><b>{a.title}</b><small>{a.type} · {a.status === 'live' ? `${api.uses(a)} 人用过` : a.status === 'pending' ? '待审核' : '已退回'}</small></span>
                  <Icon name="right" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="tm-noasset"><Tile icon="spark" domain="ai" /><span className="grow1">{self ? '你还没贡献资产。' : `${u.name}还没贡献资产。`}好用的 Prompt、Skill 审核上架后会记入贡献，三期按贡献计积分。</span>{self && <Link className="btn sec sm" to="/ai/submit"><Icon name="plus" />提交一个</Link>}</div>
          )}
        </section>
      </div>
    </Sheet>
  );
}

function ContribCard({ u, contribs, className }: { u: User; contribs: ReturnType<typeof api.contributionsOf>; className: string }) {
  return (
    <section className={`card ${className}`} aria-label="贡献">
      <CardHead title="贡献" sub={`${contribs.length} 条`}><MetaPill>积分 三期</MetaPill></CardHead>
      {contribs.length ? (
        <div className="list">
          {contribs.slice(0, 5).map(c => (
            <div key={c.id} className="li">
              <span className={`di ${c.kind === '分享会主讲' ? 'd-team' : 'd-ai'}`}><Icon name={c.kind === '分享会主讲' ? 'mega' : 'spark'} /></span>
              <span className="tx"><b>{c.title}</b><span>{c.kind} · {fmtDate(c.at)} {fmtWeekday(c.at)}</span></span>
            </div>
          ))}
        </div>
      ) : <Empty icon="award" title="还没有贡献">{u.name}上架资产、担任分享会主讲（挂上回放后）都会记在这里。</Empty>}
    </section>
  );
}

const CSS = `
.tm-card{display:flex;flex-direction:column;padding:18px 20px 16px}
.tm-name{display:block;font-size:15px;font-weight:600}
.tm-card small{display:block;font-size:11.5px}
.tm-now{margin-top:16px;display:flex;align-items:baseline;gap:8px}
.tm-now .lbl{font-size:11.5px;color:var(--mute)}
.tm-now b{font-size:20px;font-weight:600;letter-spacing:-.01em}
.tm-wk{margin-left:auto;font-size:11.5px;color:var(--mute)}
.tm-kv{margin-top:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.tm-kv>div{padding:8px 10px;border-radius:12px;background:var(--well);box-shadow:0 0 0 1px var(--line);display:grid;gap:1px;min-width:0}
.tm-kv span{font-size:11px;color:var(--mute)}
.tm-kv b{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-others{margin-top:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.tm-o{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--well);box-shadow:0 0 0 1px var(--line);transition:background var(--t),box-shadow var(--t)}
.tm-o:hover{background:#fff;box-shadow:0 0 0 1px var(--line2),0 8px 18px -12px rgba(28,36,64,.3)}
.tm-o b{display:flex;align-items:center;gap:8px;font-weight:600}
.tm-o small{display:block;font-size:11.5px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-o-n{display:flex;gap:14px;flex:none;font-size:11px;color:var(--mute)}
.tm-o-n span{display:grid;justify-items:center}
.tm-o-n b{font-size:16px;color:var(--ink)}
.tm-hero{margin-top:0;display:flex;gap:18px;align-items:flex-start;padding:22px 24px}
.tm-hero .av.lg{width:64px;height:64px;font-size:24px}
.tm-hero h1{font-size:var(--fs-3xl);font-weight:300;letter-spacing:-.01em;line-height:1.1;margin-right:4px}
.tm-bio{margin-top:10px;font-size:13.5px;line-height:1.75;color:var(--ink2);max-width:560px}
.tm-hero-kv{display:grid;grid-template-columns:repeat(2,minmax(0,auto));gap:8px 22px;padding:4px 0 0 22px;border-left:1px solid var(--line);flex:none}
.tm-hero-kv>div{display:grid;gap:2px}
.tm-hero-kv span{font-size:11.5px;color:var(--mute)}
.tm-hero-kv b{font-size:13px;font-weight:600;white-space:nowrap}
.tm-hero-act{display:grid;gap:8px;flex:none;justify-items:end}
.tm-comp{margin-top:16px;display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);font-size:12.5px}
.tm-comp b{font-size:17px;font-weight:700}
.tm-hand{display:flex;flex-direction:column}
.tm-hand-list{margin-top:12px;display:grid;gap:8px}
.tm-hand-list b{font-size:13px;font-weight:600}
.tm-hand-list ol{margin:8px 0 0;padding-left:18px;display:grid;gap:4px;font-size:12.5px;line-height:1.65;color:var(--ink2)}
.tm-foot{margin-top:auto;padding-top:12px;display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--mute)}
.tm-tl{list-style:none;margin:12px 0 0;padding:0;position:relative;display:grid;gap:2px}
.tm-tl::before{content:"";position:absolute;left:85px;top:10px;bottom:10px;width:2px;border-radius:2px;background:rgba(21,25,38,.07)}
.tm-tl li{display:grid;grid-template-columns:62px 36px minmax(0,1fr);align-items:center;gap:6px;min-height:40px}
.tm-tl-d{font-size:12px;font-weight:600;color:var(--ink2);text-align:right;display:grid;line-height:1.25}
.tm-tl-d small{font-size:10.5px;font-weight:500;color:var(--faint)}
.tm-tl-dot{position:relative;z-index:1;justify-self:center;width:26px;height:26px;border-radius:9px;display:grid;place-items:center;background:var(--cs);color:var(--ci);box-shadow:0 0 0 3px #F6F7FA}
.tm-tl-dot .ico{width:13px;height:13px}
.tm-tl-t{font-size:13px;color:var(--ink);display:flex;align-items:center;gap:6px;line-height:1.5}
.tm-tl-t .ico{color:var(--faint);flex:none}
.tm-locked{margin-top:14px;padding:26px 20px;border-radius:16px;background:var(--sunk);text-align:center;display:grid;justify-items:center;gap:6px}
.tm-locked>span{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:#fff;color:var(--ink2);box-shadow:0 0 0 1px var(--line)}
.tm-locked b{font-size:13.5px;font-weight:600}
.tm-locked p{font-size:12.5px;color:var(--mute);line-height:1.7;max-width:320px}
.tm-subs{margin-top:10px;display:grid;gap:6px}
.tm-sub{display:grid;gap:3px;padding:10px 12px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);transition:background var(--t),box-shadow var(--t)}
.tm-sub:hover{background:#fff;box-shadow:0 0 0 1px var(--line2),0 6px 14px -8px rgba(28,36,64,.2)}
.tm-sub b{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-sub small{font-size:11.5px;color:var(--mute);padding-left:32px}
.tm-q{padding-left:32px;font-size:12.5px;line-height:1.65;color:var(--ink2)}
.tm-q span{color:var(--mute);margin-left:4px}
.tm-assets{margin-top:12px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.tm-asset{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);transition:background var(--t)}
.tm-asset:hover{background:#fff}
.tm-asset b{display:block;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-asset small{display:block;font-size:11.5px;color:var(--mute)}
.tm-asset>.ico{color:var(--faint)}
.tm-noasset{margin-top:12px;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:var(--sunk);font-size:12.5px;color:var(--ink2)}
`;
