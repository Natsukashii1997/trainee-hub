import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet } from '../components/Layout';
import { Empty, Face, Icon, useSession, useToast } from '../components/ui';
import * as api from '../data/api';
import type { Output, Role } from '../data/types';
import { ROLE_LABEL } from '../data/types';
import { fmtDate, fmtDateTime } from '../lib/time';

const TABS = [
  { to: '/admin/review', label: '审核队列' }, { to: '/admin/members', label: '成员与角色' },
  { to: '/admin/path', label: '路径模板' }, { to: '/admin/assign', label: '个人路径分配' },
];
function AdminSheet({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const { role } = useSession();
  return (
    <Sheet crumbs={[{ label: '管理后台', to: '/admin/review' }, { label: title }]} tabs={TABS} action={action}>
      {role === 'admin' ? children : <Empty title="只有管理员能进入管理后台">切到「管理员」视角查看示例。正式版里，非管理员会被服务端拒绝。</Empty>}
    </Sheet>
  );
}

export function ReviewQueue() {
  api.useDataVersion();
  const say = useToast();
  const [reason, setReason] = useState<Record<string, string>>({});
  const pending = api.listAssets({ status: 'pending' }).sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
  return (
    <AdminSheet title="审核队列">
      <div className="ph"><div><h1>待审核的贡献</h1><p>通过即上架，并为作者记一条贡献。退回时写清原因，作者修改后可以重新提交。</p></div></div>
      <div className="card" style={{ marginTop: 24 }}>
        {pending.length ? pending.map(a => {
          const u = api.userById(a.authorId);
          return (
            <div className="queue-item" key={a.id}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="typ">{a.type}</span>{a.tags.map(t => <span className="tag" key={t}>{t}</span>)}</div>
                <h3 style={{ marginTop: 10 }}><Link to={`/ai/assets/${a.id}`}>{a.title}</Link></h3>
                <p>{a.summary}</p>
                <div className="who2" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--mute)' }}><Face user={u} size="sm" />{u.name} · {fmtDateTime(a.submittedAt)} 提交</div>
                <input id={`reason-${a.id}`} className="input" style={{ marginTop: 12, maxWidth: 520 }} placeholder="退回原因（退回时必填）" value={reason[a.id] ?? ''} onChange={e => setReason(r => ({ ...r, [a.id]: e.target.value }))} />
              </div>
              <div className="acts">
                <button className="btn danger" type="button" onClick={() => { if (!(reason[a.id] ?? '').trim()) { say('请先写退回原因'); return; } api.reviewAsset(a.id, false, reason[a.id]); say('已退回'); }}>退回</button>
                <button className="btn pri" type="button" onClick={() => { api.reviewAsset(a.id, true); say('已上架'); }}><Icon name="check" />通过上架</button>
              </div>
            </div>
          );
        }) : <Empty title="审核队列已清空">新的提交会出现在这里。</Empty>}
      </div>
    </AdminSheet>
  );
}

export function MembersAdmin() {
  api.useDataVersion();
  const say = useToast();
  return (
    <AdminSheet title="成员与角色">
      <div className="ph"><div><h1>成员与角色</h1><p>新登录的人默认是「同事」。在这里指定角色和带教人；可见性规则按角色在服务端执行。</p></div></div>
      <div className="card" style={{ marginTop: 24 }}>
        <table className="tbl">
          <thead><tr><th>成员</th><th>团队</th><th>角色</th><th>带教人</th><th>最近活跃</th></tr></thead>
          <tbody>{api.listUsers().map(u => (
            <tr key={u.id}>
              <td><div className="who2"><Face user={u} size="md" /><b>{u.name}</b></div></td>
              <td>{u.team}</td>
              <td><select id={`role-${u.id}`} className="select" style={{ width: 120, height: 32 }} value={u.role} onChange={e => { api.setRole(u.id, e.target.value as Role); say(`${u.name} 改为${ROLE_LABEL[e.target.value as Role]}`); }}>
                {(['trainee', 'mentor', 'admin', 'colleague'] as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></td>
              <td>{u.role === 'trainee' ? <select id={`mentor-${u.id}`} className="select" style={{ width: 120, height: 32 }} value={u.mentorId} onChange={e => { api.setMentor(u.id, e.target.value); say('已更新带教人'); }}>
                {api.mentors().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select> : <span style={{ color: 'var(--mute)' }}>—</span>}</td>
              <td className="mono">{u.lastActiveAt ? fmtDateTime(u.lastActiveAt) : '—'}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </AdminSheet>
  );
}

const OUTPUTS: Output[] = ['文档', '路演', '表格', '复盘', '录音'];
export function PathEditor() {
  api.useDataVersion();
  const say = useToast();
  const [sel, setSel] = useState('tt-9');
  const t = api.templateById(sel);
  return (
    <AdminSheet title="路径模板" action={<Link className="btn sec" to="/growth/path"><Icon name="eye" />预览路径总览</Link>}>
      <div className="ph"><div><h1>路径模板</h1><p>阶段 → 模块（轮岗岗位）→ 任务。改模板不影响已生成的个人路径；需要同步时在「个人路径分配」里处理。</p></div></div>
      <div className="detail" style={{ gridTemplateColumns: 'minmax(0,1fr) 420px' }}>
        <div className="tree">
          {api.stagesAll().map(s => (
            <div className="tree-stage" key={s.id}>
              <header><span className="mono" style={{ color: 'var(--mute)' }}>0{s.no}</span><b>{s.name}</b><span className="sp" /><span style={{ fontSize: 12, color: 'var(--mute)' }}>{s.days} 天</span></header>
              {api.modulesOf(s.id).map(m => (
                <div className="tree-mod" key={m.id}>
                  <header onClick={() => setSel(api.templatesOf(m.id)[0]?.id ?? sel)}><b style={{ fontWeight: 500 }}>{m.name}</b>{m.line && <span className="typ">{m.line}</span>}<span className="sp" /><button className="btn ghost sm" type="button" onClick={e => { e.stopPropagation(); const n = api.addTemplate(m.id); setSel(n.id); say('已添加任务'); }}><Icon name="plus" />任务</button></header>
                  {api.templatesOf(m.id).map((x, i, arr) => (
                    <div className="tree-task" key={x.id} style={x.id === sel ? { background: 'var(--acc-soft)', color: 'var(--ink)' } : undefined} onClick={() => setSel(x.id)}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>{i + 1}</span><span>{x.name}</span><span className="typ">{x.output}</span><span className="sp" />
                      <button className="btn ghost sm" type="button" aria-label="上移" disabled={i === 0} onClick={e => { e.stopPropagation(); api.moveTemplate(x.id, -1); }}><Icon name="up" /></button>
                      <button className="btn ghost sm" type="button" aria-label="下移" disabled={i === arr.length - 1} onClick={e => { e.stopPropagation(); api.moveTemplate(x.id, 1); }}><Icon name="down" /></button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="card" style={{ position: 'sticky', top: 20 }}>
          {t ? (<>
            <div className="ch"><h2>编辑任务</h2><span>{api.moduleById(t.moduleId).name}</span></div>
            <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
              <label className="field"><span>名称</span><input id="tt-name" className="input" value={t.name} onChange={e => api.updateTemplate(t.id, { name: e.target.value })} /></label>
              <label className="field"><span>说明</span><textarea id="tt-desc" className="textarea" style={{ minHeight: 72 }} value={t.desc} onChange={e => api.updateTemplate(t.id, { desc: e.target.value })} /></label>
              <label className="field"><span>要求（每行一条）</span><textarea id="tt-req" className="textarea" value={t.requirements.join('\n')} onChange={e => api.updateTemplate(t.id, { requirements: e.target.value.split('\n') })} /></label>
              <div className="form-grid">
                <label className="field"><span>产出形式</span><select id="tt-out" className="select" value={t.output} onChange={e => api.updateTemplate(t.id, { output: e.target.value as Output })}>{OUTPUTS.map(o => <option key={o}>{o}</option>)}</select></label>
                <label className="field"><span>建议用时（天）</span><input id="tt-days" className="input" type="number" min={1} value={t.days} onChange={e => api.updateTemplate(t.id, { days: Number(e.target.value) || 1 })} /></label>
              </div>
              <div className="field"><span>推荐 AI 资产</span><div className="filters">{api.listAssets().map(a => <button type="button" key={a.id} className={`tag${t.assetIds.includes(a.id) ? ' on' : ''}`} onClick={() => api.updateTemplate(t.id, { assetIds: t.assetIds.includes(a.id) ? t.assetIds.filter(x => x !== a.id) : [...t.assetIds, a.id] })}>{a.title}</button>)}</div></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><button className="btn danger" type="button" onClick={() => { api.removeTemplate(t.id); setSel(''); say('已删除'); }}><Icon name="trash" />删除</button><span style={{ fontSize: 12, color: 'var(--mute)', alignSelf: 'center' }}>修改即时保存</span></div>
            </div>
          </>) : <Empty title="选一个任务来编辑" />}
        </div>
      </div>
    </AdminSheet>
  );
}

export function AssignPath() {
  api.useDataVersion();
  const say = useToast();
  const [uid, setUid] = useState('u-lin');
  const p = api.pathOf(uid);
  const rot0 = p?.modules.filter(m => api.moduleById(m.moduleId).stageId === 's3') ?? [];
  const [order, setOrder] = useState<string[] | null>(null);
  const [mentorsSel, setMentorsSel] = useState<string[] | null>(null);
  const ord = order ?? rot0.map(m => m.moduleId);
  const mts = mentorsSel ?? rot0.map(m => m.mentorId);
  const pick = (id: string) => { setUid(id); setOrder(null); setMentorsSel(null); };
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= ord.length) return; const o = [...ord]; [o[i], o[j]] = [o[j], o[i]]; const m = [...mts]; [m[i], m[j]] = [m[j], m[i]]; setOrder(o); setMentorsSel(m); };
  const started = (i: number) => rot0[i] && api.moduleState(uid, rot0[i].moduleId) !== 'todo';
  return (
    <AdminSheet title="个人路径分配">
      <div className="ph"><div><h1>个人路径分配</h1><p>从模板生成个人路径，调整轮岗顺序和每站的带教人。已经开始或结束的站不能再调。</p></div></div>
      <div className="detail" style={{ gridTemplateColumns: '260px minmax(0,1fr)' }}>
        <div className="card"><div className="ch"><h2>管培生</h2></div><div className="list">{api.trainees().map(u => <button type="button" className="li" key={u.id} style={{ width: '100%', textAlign: 'left', background: u.id === uid ? 'var(--acc-soft)' : undefined, borderRadius: 10, padding: '10px 8px' }} onClick={() => pick(u.id)}><Face user={u} size="md" /><div className="tx"><b>{u.name}</b><span>{api.currentPosition(u.id)?.module.name}岗</span></div></button>)}</div></div>
        <div className="card">
          <div className="ch"><h2>{api.userById(uid).name} · 轮岗顺序</h2><span>{p ? `${fmtDate(p.startAt)} 入职` : ''}</span></div>
          <div className="order" style={{ marginTop: 16 }}>
            {ord.map((mid, i) => (
              <div className="order-row" key={mid}>
                <span className="n">{i + 1}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--mute)' }}>{rot0[i] ? `${fmtDate(rot0[i].startAt)} – ${fmtDate(rot0[i].endAt)}` : ''}</span>
                <span><b style={{ fontWeight: 500 }}>{api.moduleById(mid).name}岗</b> <span className="typ">{api.moduleById(mid).line}</span>{started(i) && <span className="chip plain" style={{ marginLeft: 8 }}>{api.moduleState(uid, rot0[i].moduleId) === 'done' ? '已结束' : '进行中'}</span>}</span>
                <select id={`m-${i}`} className="select" style={{ height: 32 }} value={mts[i]} disabled={started(i)} onChange={e => { const m = [...mts]; m[i] = e.target.value; setMentorsSel(m); }}>{api.mentors().map(m => <option key={m.id} value={m.id}>带教 {m.name}</option>)}</select>
                <span className="mv"><button className="btn ghost sm" type="button" aria-label="上移" disabled={i === 0 || started(i) || started(i - 1)} onClick={() => move(i, -1)}><Icon name="up" /></button><button className="btn ghost sm" type="button" aria-label="下移" disabled={i === ord.length - 1 || started(i) || started(i + 1)} onClick={() => move(i, 1)}><Icon name="down" /></button></span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
            <button className="btn pri" type="button" disabled={!order && !mentorsSel} onClick={() => { api.assignRotation(uid, ord, mts); setOrder(null); setMentorsSel(null); say('已保存路径'); }}>保存</button>
            <button className="btn ghost" type="button" disabled={!order && !mentorsSel} onClick={() => { setOrder(null); setMentorsSel(null); }}>撤销修改</button>
          </div>
        </div>
      </div>
    </AdminSheet>
  );
}
