import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import { Empty, Face, GradeChip, Icon, Ring, StatusChip, useSession, useToast } from '../components/ui';
import * as api from '../data/api';
import { canSeePrivate, ROLE_LABEL } from '../data/types';
import type { Role } from '../data/types';
import { fmtDate, fmtFull } from '../lib/time';

const TABS = [{ to: '/team', label: '成员' }];

export function Members() {
  api.useDataVersion();
  const [f, setF] = useState<Role | ''>('');
  const list = api.listUsers().filter(u => !f || u.role === f);
  return (
    <Sheet crumbs={[{ label: '团队', to: '/team' }, { label: '成员' }]} tabs={TABS}>
      <div className="ph"><div><h1>2026 秋季班</h1><p>{api.trainees().length} 位管培生 · {api.mentors().length} 位带教人。公告、活动和周报汇总在二期上线。</p></div>
        <div className="acts"><div className="seg2">{(['', 'trainee', 'mentor', 'admin', 'colleague'] as (Role | '')[]).map(r => <button key={r || 'all'} type="button" aria-pressed={f === r} onClick={() => setF(r)}>{r ? ROLE_LABEL[r] : '全部'}</button>)}</div></div></div>
      <div className="people">
        {list.map(u => {
          const pos = u.role === 'trainee' ? api.currentPosition(u.id) : null;
          return (
            <Link className="person" key={u.id} to={`/team/${u.id}`}>
              <div className="who2"><Face user={u} /><div><b>{u.name}</b><span>{ROLE_LABEL[u.role]}{u.line ? ` · ${u.line}` : ''}</span></div></div>
              <div style={{ fontSize: 13, color: 'var(--mute)', lineHeight: 1.6, minHeight: 42 }}>{u.bio}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--mute)' }}>
                <span>{pos ? `${pos.module.name}岗 · 第 ${pos.week} 周` : u.team}</span>
                <span>{api.contributionsOf(u.id).length} 条贡献</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Sheet>
  );
}

export function Profile() {
  api.useDataVersion();
  const { id = '' } = useParams();
  const { me } = useSession();
  const say = useToast();
  const u = api.listUsers().find(x => x.id === id);
  const [edit, setEdit] = useState(false);
  const [bio, setBio] = useState(u?.bio ?? '');
  if (!u) return <Sheet crumbs={[{ label: '团队', to: '/team' }, { label: '档案' }]}><Empty title="找不到这个人" /></Sheet>;
  const isTrainee = u.role === 'trainee';
  const canSee = canSeePrivate(me, u, u.mentorId ? [u.mentorId] : []);
  const prog = isTrainee ? api.timeProgress(u.id) : null;
  const pos = isTrainee ? api.currentPosition(u.id) : null;
  const done = api.tasksOf(u.id).filter(t => t.status === 'passed' || t.status === 'submitted');
  const contribs = api.contributionsOf(u.id);
  const mentor = u.mentorId ? api.userById(u.mentorId) : null;
  return (
    <Sheet crumbs={[{ label: '团队', to: '/team' }, { label: u.id === me.id ? '我的档案' : `${u.name}的档案` }]} tabs={TABS}
      action={u.id === me.id ? <button className="btn sec" type="button" onClick={() => { if (edit) { u.bio = bio.trim(); say('已保存'); } setEdit(!edit); }}><Icon name="pen" />{edit ? '保存介绍' : '编辑介绍'}</button> : undefined}>
      <div className="profile">
        <Face user={u} size="lg" />
        <div>
          <h1>{u.name}</h1>
          <div className="m"><span>{ROLE_LABEL[u.role]}</span><span>{u.team}</span>{u.joinedAt && <span>{fmtFull(u.joinedAt)} 入职</span>}{mentor && <span>带教 {mentor.name}</span>}{u.line && <span>{u.line}</span>}</div>
        </div>
      </div>
      <div className="bento top">
        <div className="card s8">
          <div className="ch"><h2>自我介绍</h2></div>
          {edit ? <textarea id="bio" className="textarea" style={{ marginTop: 12 }} value={bio} onChange={e => setBio(e.target.value)} /> : <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.75, color: 'var(--ink2)' }}>{u.bio || '还没写介绍。'}</p>}
          <div className="filters" style={{ marginTop: 14 }}>{(u.skills ?? []).map(s => <span className="tag" key={s}>{s}</span>)}</div>
        </div>
        <div className="card s4">
          <div className="ch"><h2>贡献</h2><span>{contribs.length} 条</span></div>
          <div className="list">{contribs.length ? contribs.map(c => <div className="li" key={c.id}><span className="di"><Icon name={c.kind === '分享会主讲' ? 'mega' : 'spark'} /></span><div className="tx"><b>{c.title}</b><span>{c.kind} · {fmtDate(c.at)}</span></div></div>) : <Empty title="还没有贡献" />}</div>
        </div>
        {isTrainee && prog && pos && (
          <div className="card s4">
            <div className="ch"><h2>培养进度</h2><span>对团队公开</span></div>
            <div className="pg"><Ring pct={prog.pct} label={`${prog.pct}%`} sub={`第 ${prog.day} 天`} /><div className="stl">
              <div className="st cur"><span className="d" />{pos.stage.name}<span>{pos.module.name}岗</span></div>
              <div className="st"><span className="d" />轮岗第 {pos.rotIndex + 1} / {pos.rotation.length} 站<span>第 {pos.week} 周</span></div>
            </div></div>
          </div>
        )}
        {isTrainee && (
          <div className="card s8">
            <div className="ch"><h2>产出与点评</h2><span>{canSee ? '只对本人、带教人、管理员可见' : ''}</span></div>
            {canSee ? (
              <table className="tbl">
                <thead><tr><th>任务</th><th>截止</th><th>状态</th><th>评价</th></tr></thead>
                <tbody>{done.map(t => { const rv = api.reviewsOf(t.id)[0]; return (
                  <tr key={t.id}><td><Link to={`/growth/tasks/${t.id}`}><b>{t.name}</b><span className="s">{t.moduleId ? `${api.moduleById(t.moduleId).name}岗` : '周期'}</span></Link></td><td className="mono">{fmtDate(t.dueAt)}</td><td><StatusChip task={t} /></td><td>{rv ? <GradeChip grade={rv.grade} /> : '—'}</td></tr>
                ); })}</tbody>
              </table>
            ) : <div className="locked" style={{ marginTop: 14 }}><Icon name="lock" />产出、点评和考核只对 {u.name} 本人、带教人和管理员可见。</div>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
