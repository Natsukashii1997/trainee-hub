import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, type Crumb } from '../../components/Layout';
import { Drawer, Icon, Segmented, useSession } from '../../components/ui';
import type { Role } from '../../data/types';
import { CSS as HOME_PAGE_CSS } from '../Home';
import { CSS as TEAM_PAGE_CSS } from '../Team';
import { STATES, world, type St } from './picksData';
import { PK_CSS } from './picksKit';
import { HOME_CSS, HOME_VERSIONS } from './PicksHome';
import { PROJECT_CSS, PROJECT_VERSIONS } from './PicksProject';
import { PROFILE_CSS, PROFILE_VERSIONS } from './PicksProfile';

/* #44 关键页挑版（开发用，/dev/picks；独立构建见 web/picks.html）：页面 × 版本 × 状态三个切换。
   外壳、组件、样式全部来自现有原型；页面主体的数据见 picksData.ts，与后端初始化脚本一致。 */

type PageKey = 'homeT' | 'homeM' | 'proj' | 'prof';
type Note = { name: string; idea: string; trade: string; strong: string };
const PAGES: Record<PageKey, { label: string; role: Role; crumbs: Crumb[]; path: string; act: (r: Role) => { icon: 'upload' | 'pen' | 'plus'; label: string }; notes: Note[] }> = {
  homeT: {
    label: '首页 · 管培生', role: 'trainee', crumbs: [{ label: '首页' }], path: '/', act: () => ({ icon: 'upload', label: '提交成果' }),
    notes: [
      { name: '目标为中心', strong: '主推项目卡（项目 + 当前节点 + 下一步合在一块），占左上 2×2。',
        idea: '先看在推进什么：主推项目的目标、节点路线和当前节点的验收标准占左上最大块，下一步行动写在项目卡里；右侧保留「我的本周」「我的进度」；第三行是需要协调的事、最新评审、能力证据、这一步可以用。',
        trade: '项目是主线的人最顺手，一眼知道这件事为了什么、做到哪；但最急的那件事被包在项目卡里，不如版 B 醒目；同时推进两个项目时，第二个只能往下放。' },
      { name: '行动为中心', strong: '最重要的下一步（左上横条，占现有两张焦点卡的位置）。',
        idea: '在现有首页焦点卡的位置扩：左上一条「最重要的下一步」（未完成的下一步行动；没有时退到在等的评审或立项），下面是最新评审和需要协调的事；右侧保留「我的本周」「我的进度」；第三行是主推项目、能力证据、这一步可以用。从上到下的顺序和 PRD 10.2 一致。',
        trade: '一眼知道现在该做什么，和现有首页最像，迁移最省；项目全貌只有一张卡，看节点详情要点进项目。' },
      { name: '反馈回路为中心', strong: '回路当前环节（左上 2×2）。',
        idea: '把「提交成果 → 带教评审 → 下一步行动 → 修改再交」画成一圈，标出现在第几轮、轮到谁；右边是来回记录时间线，右侧保留「我的进度」；第三行是我的项目、能力证据、这一步可以用。',
        trade: '最能体现「带教反馈形成闭环」，管培生清楚球在谁手里；但刚开始、还没有来回时整块偏空，多个项目并行时要切换。' },
      { name: '优化', strong: '最重要的下一步（同 B）。',
        idea: '在定稿的 B 上做减法，结构、位置、外观都不变：「我的进度」只留时间进度、培养五站和当前站（能力证据第三行已有，「阶段」和五站重复）；「主推项目」不再重复深色块里的当前节点和截止，只留节点链和一行验收标准；「需要协调的事」「能力证据」去掉底部说明小字；「这一步可以用」不放安装命令，改成「去看看」。',
        trade: '页面更清爽，每块只说一件事；去掉的说明和安装命令要点进去才看得到。' },
    ],
  },
  homeM: {
    // 带教首页的主角是周颖（带教、有管理权限）；#43 之后按身份切换，'mentor' 会切到吴桐
    label: '首页 · 带教', role: 'admin', crumbs: [{ label: '首页' }], path: '/', act: () => ({ icon: 'pen', label: '去评审' }),
    notes: [
      { name: '按项目', strong: '不放强调块，项目看板本身是焦点。',
        idea: '第一行是项目看板：待确认立项、推进中、等我评审、受阻四列，确认立项、评审、响应都在卡上点；第二行是我带的人（每人一行），右侧是任务待评审和决策看板。',
        trade: '带的项目多时一眼看全局；但培养任务的评审被挤到侧栏，「先做哪件」要自己在四列里找。' },
      { name: '按事', strong: '待我判断（第一行左侧 8 列）。',
        idea: '「待我判断」三类（评审、立项、受阻）并排放在强调块里，与待办一致、按离超时排序；右侧保留现有的「下一个换站节点」；第二行是我带的人（每人一行）和决策看板（管理者）。',
        trade: '最贴合 PRD 10.2 的顺序：先清待办再看人；三类都空时强调块只剩空提示，人多时「我带的人」要往下翻。' },
      { name: '按人', strong: '第一位有待办的人的卡片。',
        idea: '每位管培生一张卡：在哪站、当前项目与节点路线、最近反馈、风险，以及等我处理的事；第一位有待办的人用深色卡；下面是换站节点和决策看板。',
        trade: '带的人少（现在两人）时最直观；人一多卡片变长，同类事情散在各张卡里，没法一次批量处理。' },
      { name: '优化', strong: '待我判断（同 B）。',
        idea: '在定稿的 B 上做减法，结构、位置、外观都不变：「下一个换站节点」去掉底部说明小字。带教首页 B 本身信息不多，这一页改动很少。',
        trade: '和 B 几乎一样；要更大的改动需要另定方向。' },
    ],
  },
  proj: {
    label: '项目详情', role: 'trainee', crumbs: [{ label: '项目实践' }, { label: '项目' }, { label: '来电归因优化' }], path: '/growth/projects/pj-1',
    act: r => (r === 'trainee' ? { icon: 'upload', label: '提交成果' } : { icon: 'pen', label: '去评审' }),
    notes: [
      { name: '节点路线', strong: '不放强调块；「这一步可以用」作普通卡放右栏。',
        idea: '主栏顶部是节点路线，点哪个节点就在下方展开：左边目标、验收标准、受阻、关联培养任务和操作，右边成果版本与评审（关键问题、带教判断、下一步行动、认定）；右栏是项目信息、成员与项目带教、未完成行动、这一步可以用。',
        trade: '最像「推进一个项目」的心智，卡在哪一眼可见；节点超过五六个时路线图要横向滚动。' },
      { name: '总览分栏', strong: '不放强调块。',
        idea: '三栏：左栏项目信息与成员；中栏节点表、关联培养任务、项目结论；右栏未完成行动、最近反馈、这一步可以用。节点详情点表格行，从右侧抽屉打开。',
        trade: '信息最全、像管理工具，适合带教横看；第一眼不突出「现在卡在哪」，做事要多点一次打开抽屉。' },
      { name: '项目日志', strong: '不放强调块。',
        idea: '顶部一条摘要（节点进度、当前节点、项目带教、交付与验证），主体是倒序的项目日志，每条能点回节点或版本；右栏是节点列表、未完成行动、项目结论。',
        trade: '最适合回看「这个项目怎么走过来的」，写结论和复盘方便；但要执行操作得先找到对应节点。' },
    ],
  },
  prof: {
    label: '成长档案', role: 'trainee', crumbs: [{ label: '培养成长' }, { label: '成长档案' }], path: '/team/u-lin',
    act: r => (r === 'trainee' ? { icon: 'upload', label: '提交成果' } : { icon: 'pen', label: '去评审' }),
    notes: [
      { name: '项目经历主线', strong: '不放强调块。',
        idea: '头部卡沿用现有档案；主体按项目组织：每个项目写目标、角色、交付结论与验证状态，下面挂它带来的成果、认定和能力证据；右栏是培养进度和能力项覆盖；底部是成长时间线和项目之外的成果。',
        trade: '最能回答「做过什么、做成了没有」；能力项的全貌只能看右栏计数。' },
      { name: '能力证据主线', strong: '不放强调块。',
        idea: '主体按「4+1 主线」五个能力项逐行列出证据和判断等级，每条点回来源；右栏是培养进度、项目经历、通过的成果；时间线放到底部通栏。',
        trade: '最贴合季度答辩和阶段复盘；项目的来龙去脉被拆散到各能力项里。' },
      { name: '培养路径主线', strong: '不放强调块。',
        idea: '顶部是培养进度（点站切换），主体按站倒序：每站的培养任务和在这站开始的项目；右栏是能力项覆盖和通过的成果；底部是成长时间线。',
        trade: '最能看出「在哪一站做了什么」，和现有个人档案最接近；跨站的项目只能挂在开始的那一站。' },
    ],
  },
};
const VER = ['A', 'B', 'C', 'B′'];
const REC = '建议把附录 A 的「全屏唯一强调块：深墨色『这一步可以用』（推荐 AI 资产）」改为：每页最多一个深墨色强调块，放这一页最该先处理的事——管培生首页放「最重要的下一步」，带教首页放「待我判断」，项目详情、成长档案不放；「这一步可以用」降为普通卡（浅色面 + AI 色图标块），放在首页第三行或项目详情右栏。三版各自标了强调块的位置，首页选 B 版时与这条完全一致。';

/** 地址里的 ?p=proj&v=0&s=blocked 可直接打开某一版（截图自查、发给别人看） */
function initial() {
  let q = new URLSearchParams();
  try { q = new URLSearchParams(window.location.search); } catch { /* 读不到时用默认 */ }
  const p = q.get('p') as PageKey | null;
  const v = Number(q.get('v'));
  const s = q.get('s') as St | null;
  const page: PageKey = p && p in PAGES ? p : 'homeT';
  const n = PAGES[page].notes.length;
  // 默认打开当前在确认的版本：首页看「B 优化」，其余页看定稿的 B
  return { page, ver: q.has('v') && v >= 0 && v < n ? v : n > 3 ? 3 : 1, st: s && STATES.some(x => x.value === s) ? s : 'revise' };
}

export default function Picks({ standalone }: { standalone?: boolean }) {
  const { role, setRole } = useSession();
  const nav = useNavigate();
  const [init] = useState(initial);
  const [page, setPage] = useState<PageKey>(init.page);
  const [ver, setVer] = useState(init.ver);
  const [st, setSt] = useState<St>(init.st);
  // 首页的视角跟页面走；项目详情、成长档案保留当前视角（管培生 / 带教都能看）
  const pick = (p: PageKey, cur: Role) => (p === 'homeT' || p === 'homeM' || cur === 'colleague' ? PAGES[p].role : cur);
  useEffect(() => { setRole(pick(init.page, role)); }, [init]); // eslint-disable-line react-hooks/exhaustive-deps
  const [note, setNote] = useState(false);
  const w = useMemo(() => world(st), [st]);

  // 顶栏「演示视角」切到带教 / 管培生时，首页跟着换
  useEffect(() => {
    if (page === 'homeT' && (role === 'mentor' || role === 'admin')) setPage('homeM');
    if (page === 'homeM' && role === 'trainee') setPage('homeT');
  }, [role, page]);
  const choose = (p: PageKey) => {
    setPage(p); setRole(pick(p, role));
    if (ver >= PAGES[p].notes.length) setVer(1);
    if (standalone) nav(PAGES[p].path);
    window.scrollTo(0, 0);
  };

  const P = PAGES[page];
  const V = page === 'homeT' || page === 'homeM' ? HOME_VERSIONS[page][ver] : page === 'proj' ? PROJECT_VERSIONS[ver] : PROFILE_VERSIONS[ver];
  const n = P.notes[ver];
  const act = P.act(role);
  return (
    <>
      <Sheet crumbs={P.crumbs} action={<button type="button" className="btn pri"><Icon name={act.icon} />{act.label}</button>}>
        <style>{HOME_PAGE_CSS + TEAM_PAGE_CSS + PK_CSS + HOME_CSS + PROJECT_CSS + PROFILE_CSS + BAR_CSS}</style>
        <V key={`${page}-${ver}-${st}`} w={w} />
        <div className="pk-pad" aria-hidden="true" />
      </Sheet>

      <div className="pk-bar" role="region" aria-label="挑版切换">
        <div className="row" style={{ gap: 8 }}>
          <Segmented<PageKey> label="页面" value={page} onChange={choose} options={(Object.keys(PAGES) as PageKey[]).map(k => ({ value: k, label: PAGES[k].label }))} />
          <Segmented<string> label="版本" value={String(ver)} onChange={v => { setVer(Number(v)); window.scrollTo(0, 0); }} options={P.notes.map((x, i) => ({ value: String(i), label: `${VER[i]} ${x.name.replace(/为中心|主线/, '')}` }))} />
          <Segmented<St> label="状态" value={st} onChange={setSt} options={STATES.map(s => ({ value: s.value, label: s.label }))} />
          <button type="button" className="btn dark sm" onClick={() => setNote(true)}><Icon name="info" />说明</button>
        </div>
        <p className="pk-bar-l"><b>版 {VER[ver]} · {n.name}</b>{n.idea}<span>强调块：{n.strong}</span><span>状态：{STATES.find(s => s.value === st)!.when}</span></p>
      </div>

      <Drawer open={note} onClose={() => setNote(false)} title={`版 ${VER[ver]} · ${n.name}`} sub={`${P.label} · #44 关键页挑版`} width={460}>
        <div className="pk-note">
          <h3>思路</h3><p>{n.idea}</p>
          <h3>取舍</h3><p>{n.trade}</p>
          <h3>强调块放在</h3><p>{n.strong}</p>
          <h3>附录 A「全屏唯一强调块」建议改法</h3><p>{REC}</p>
          <h3>五种示例状态</h3>
          <ul>{STATES.map(s => <li key={s.value}><b>{s.label}</b>{s.when}</li>)}</ul>
          <h3>说明</h3>
          <p>侧栏、顶栏和其中的计数沿用现有原型外壳（数字来自原型的示例数据），#43 新外壳合并后会自动换上。页面主体的人、项目、节点、日期与后端初始化脚本一致：林夏、许诺是管培生，周颖带两人并有管理权限，吴桐带许诺的销售站和「渠道转化复盘」。</p>
          <p>项目详情和成长档案可以用顶栏「演示视角」切换管培生 / 带教看，按钮会跟着变。</p>
        </div>
      </Drawer>
    </>
  );
}

const BAR_CSS = `
.pk-pad { height: 132px; }
.pk-bar { position: fixed; z-index: 30; bottom: 16px; left: calc(50% + 114px); transform: translateX(-50%); width: max-content; max-width: calc(100vw - 260px);
  padding: 10px 12px; border-radius: 20px; background: var(--glass-hi); backdrop-filter: blur(24px) saturate(1.4); -webkit-backdrop-filter: blur(24px) saturate(1.4); box-shadow: var(--sh-pop); }
.pk-bar .seg { flex: none; }
.pk-bar-l { margin-top: 8px; padding: 0 4px; max-width: 1080px; font-size: 12px; line-height: 1.6; color: var(--ink2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pk-bar-l b { color: var(--acc-ink); font-weight: 600; margin-right: 8px; }
.pk-bar-l span { margin-left: 10px; color: var(--mute); }
.pk-note h3 { margin-top: 18px; font-size: 13px; font-weight: 600; }
.pk-note h3:first-child { margin-top: 0; }
.pk-note p, .pk-note li { margin-top: 6px; font-size: 13px; line-height: 1.75; color: var(--ink2); }
.pk-note ul { padding-left: 0; list-style: none; }
.pk-note li b { display: inline-block; min-width: 56px; font-weight: 600; color: var(--ink); }
`;
