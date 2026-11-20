/* #44 关键页挑版的示例数据（只给 /dev/picks 用，不调接口）。
   人、路径、项目、节点与后端初始化脚本 server/src/seed.ts 一致：林夏、许诺是管培生；周颖带两人、有管理权限；
   吴桐带许诺的销售站，也是许诺在「渠道转化复盘」里的项目带教。五种状态是同一条故事线上的五个时刻。 */

export type St = 'revise' | 'pending' | 'blocked' | 'empty' | 'ended';
export const STATES: { value: St; label: string; when: string }[] = [
  { value: 'revise', label: '需修改', when: '11.09 周一：问题定义 V1 被评「需改进」' },
  { value: 'pending', label: '待评审', when: '11.10 周二：修改后交了 V2，等周颖评审' },
  { value: 'blocked', label: '受阻', when: '11.12 周四：V2 达标，分流方案验证卡在排班审批' },
  { value: 'empty', label: '空数据', when: '10.19 周一：刚建项目，等带教确认立项' },
  { value: 'ended', label: '已结项', when: '12.10 周四：项目已结项，进入定岗' },
];

/** 北京时间 → ISO（页面上一律经 lib/time 的格式化函数显示） */
export const bj = (s: string) => new Date(`${s.replace(' ', 'T')}:00+08:00`).toISOString();

export type Grade = '优秀' | '达标' | '需改进';
export type MsStatus = '未开始' | '进行中' | '待评审' | '需修改' | '已通过' | '已取消';
export type ActKind = '修改再交' | '推进后续节点' | '建议';
export type ActStatus = '未完成' | '已完成' | '不再需要';
export type Judge = '尚未观察到充分证据' | '有指导下完成' | '可独立完成';

export interface Action { kind: ActKind; text: string; owner: string; status: ActStatus; doneNote?: string; from: string; dueAt?: string }
export interface Review { grade: Grade; by: string; at: string; key: string; judge: string; actions: Action[]; credits: string[] }
export interface Version { no: number; by: string; at: string; text: string; change?: string; reviewer: string; review: Review | null }
export interface Blocker {
  reason: string; decider: string; handler: string; status: '未响应' | '已响应' | '已解除'; by: string; at: string;
  responses: { by: string; at: string; text: string }[]; resolved?: { by: string; at: string; text: string };
}
export interface Milestone {
  id: string; name: string; goal: string; accept: string; dueAt: string; status: MsStatus;
  versions: Version[]; blocker: Blocker | null; tasks: { owner: string; name: string; credited: boolean }[];
}
export interface Conclusion { delivery: '达成' | '部分达成' | '未达成'; evidence: string; verify: '未验证' | '已验证' | '不适用'; lessons: string; next: string; by: string; at: string; closedBy: string; closedAt: string }
export interface Project {
  id: string; name: string; status: '草拟' | '推进中' | '已结束'; goal: string; accept: string; acceptor: string; lead: string;
  members: { name: string; role: '主责' | '参与' }[]; mentor: string; mentorWhy: string; createdAt: string; confirmed: { by: string; at: string } | null;
  stations: string; milestones: Milestone[]; conclusion: Conclusion | null;
}
export interface Feedback { grade: Grade; target: string; scope: string; by: string; at: string; text: string; judge?: string }
export interface Evidence { item: number; judge: Judge; text: string; src: string; by: string; at: string; project?: string }
export interface Passed { kind: '成果' | '认定'; title: string; grade?: Grade; at: string; from: string; via?: string }
export interface Ev { at: string; kind: string; text: string; who: string; tone: 'grow' | 'ment' | 'exam' | 'acc' | 'week' | 'due' | 'ai' }
export interface WeekItem { id: string; at: string; title: string; aside: string; domain: 'grow' | 'acc' | 'ment' | 'week' | 'exam'; done?: boolean }
export interface PathStation { stage: string; name: string; start: string; end: string; tasks: { name: string; status: string; inProject?: string }[]; projects: string[] }
export interface ReviewItem { who: string; title: string; scope: '节点' | '任务'; ctx: string; at: string; dueAt: string; deep: boolean }
export interface MenteeRow { name: string; color: string; station: string; project: string; node: string; nodeTone: 'warn' | 'info' | 'acc' | 'ok' | 'plain' | 'due'; last: string; lastGrade?: Grade; risks: readonly string[]; next?: string }

export const ITEMS = ['公司、行业与导师侧认知', '用户与服务链路认知', '实际项目推进与交付', '营销线', 'AI 使用与人机协同'];
export const COLOR: Record<string, string> = { 林夏: '#5C7CFA', 许诺: '#2E9E68', 周颖: '#E0A436', 吴桐: '#8A68DE' };
export const TRAIN_START = '2026-09-10';
export const TRAIN_TOTAL = 191;
export const STATIONS = [
  { stage: '入职', name: '入职', start: '2026-09-10', end: '2026-09-16' },
  { stage: '通识', name: '通识', start: '2026-09-17', end: '2026-10-14' },
  { stage: '轮岗', name: '客服岗', start: '2026-10-15', end: '2026-11-11' },
  { stage: '轮岗', name: '销售岗', start: '2026-11-12', end: '2026-12-09' },
  { stage: '定岗', name: '定岗', start: '2026-12-10', end: '2027-03-19' },
];
/** 推荐 AI 资产（规则推荐，不调用 AI）：示例 */
export const ASSET = { title: '来电摘要批量归类', type: 'PROMPT', author: '周颖', uses: 2, summary: '把一批来电摘要按给定口径归类，输出每类条数、占比和三条样本，方便人工抽检。', cmd: 'npx skills add trainee-hub/call-classify' };

const NOW: Record<St, string> = { revise: bj('2026-11-09 10:24'), pending: bj('2026-11-10 17:30'), blocked: bj('2026-11-12 10:24'), empty: bj('2026-10-19 14:00'), ended: bj('2026-12-10 10:24') };
const CUR: Record<St, number> = { revise: 2, pending: 2, blocked: 3, empty: 2, ended: 4 };

export function world(st: St) {
  const after = (...s: St[]) => s.includes(st);
  const now = NOW[st];

  // ---- 来电归因优化：问题定义 ----
  const v1: Version = {
    no: 1, by: '林夏', at: bj('2026-11-07 17:40'), reviewer: '周颖', text: '近两周来电 4,210 通，按 12 类归并，前三类：账单疑问、改约、物流查询',
    review: {
      grade: '需改进', by: '周颖', at: bj('2026-11-08 10:15'), key: '只覆盖两周，验收要求四周；「咨询其他」占 23%，口径太粗', judge: '方向对，但现在的前三类结论站不住',
      actions: [
        { kind: '修改再交', text: '补齐近四周数据，把「咨询其他」拆到二级类', owner: '林夏', status: st === 'revise' ? '未完成' : '已完成', doneNote: st === 'revise' ? undefined : '交 V2 时自动完成', from: '问题定义 V1 · 周颖 11.08 需改进', dueAt: bj('2026-11-13 18:00') },
        { kind: '建议', text: '口径先和客服主管对一次再定稿', owner: '', status: '未完成', from: '问题定义 V1 · 周颖 11.08 需改进' },
      ],
      credits: [],
    },
  };
  const v2: Version = {
    no: 2, by: '林夏', at: bj('2026-11-10 16:20'), reviewer: '周颖', text: '四周来电 8,630 通，前三类：账单疑问 24%、改约 19%、物流查询 15%', change: '补到四周 8,630 通；「咨询其他」拆成 4 个二级类，占比降到 6%',
    review: after('blocked', 'ended') ? {
      grade: '达标', by: '周颖', at: bj('2026-11-11 11:02'), key: '四周样本齐了，前三类占 58%，每类有样本和出处', judge: '可以进入方案验证',
      actions: [{ kind: '推进后续节点', text: '进入分流方案验证，先定试点班组', owner: '林夏', status: st === 'ended' ? '已完成' : '未完成', doneNote: st === 'ended' ? '11.16 已定客服二组' : undefined, from: '问题定义 V2 · 周颖 11.11 达标', dueAt: bj('2026-12-04 18:00') }],
      credits: ['林夏 · 来电问题分类与归因', '许诺 · 来电问题分类与归因'],
    } : null,
  };
  const ms1: Milestone = {
    id: 'ms-1-1', name: '问题定义', goal: '把近四周来电按问题分类，找出量最大的三类', accept: '分类口径经带教确认；三类问题各有样本和占比', dueAt: bj('2026-11-13 18:00'),
    status: ({ revise: '需修改', pending: '待评审', blocked: '已通过', ended: '已通过', empty: '未开始' } as const)[st],
    versions: st === 'revise' ? [v1] : [v1, v2], blocker: null,
    tasks: [{ owner: '林夏', name: '来电问题分类与归因', credited: after('blocked', 'ended') }, { owner: '许诺', name: '来电问题分类与归因', credited: after('blocked', 'ended') }],
  };
  const ms2: Milestone = {
    id: 'ms-1-2', name: '分流方案验证', goal: '在一个班组试用分流方案一周', accept: '有试用前后的对比数据和客服主管反馈', dueAt: bj('2026-12-04 18:00'),
    status: ({ revise: '未开始', pending: '未开始', blocked: '进行中', ended: '已通过', empty: '未开始' } as const)[st], versions: [], blocker: null, tasks: [],
  };
  if (st === 'blocked') ms2.blocker = { reason: '试点要客服二组调排班，主管还没批', decider: '客服主管', handler: '周颖', status: '未响应', by: '林夏', at: bj('2026-11-12 09:30'), responses: [] };
  if (st === 'ended') {
    ms2.blocker = { reason: '试点要客服二组调排班，主管还没批', decider: '客服主管', handler: '周颖', status: '已解除', by: '林夏', at: bj('2026-11-12 09:30'),
      responses: [{ by: '周颖', at: bj('2026-11-12 14:05'), text: '我周四和主管确认排班，先按二组准备话术' }], resolved: { by: '林夏', at: bj('2026-11-16 10:00'), text: '主管批了二组排班，11.17 开始试用' } };
    ms2.versions = [{ no: 1, by: '林夏', at: bj('2026-12-03 18:00'), reviewer: '周颖', text: '二组试用 5 个工作日：转人工率 31% → 24%；主管反馈话术还要再简化',
      review: { grade: '优秀', by: '周颖', at: bj('2026-12-04 10:30'), key: '有前后对比，也写清了试用范围和限制', judge: '同类验证可以独立推进',
        actions: [{ kind: '建议', text: '话术简化后再测一周，数据补进业务验证', owner: '林夏', status: '未完成', from: '分流方案验证 V1 · 周颖 12.04 优秀' }], credits: [] } }];
  }

  const pj1: Project = {
    id: 'pj-1', name: '来电归因优化', status: st === 'ended' ? '已结束' : st === 'empty' ? '草拟' : '推进中',
    goal: '找出来电量最高的三类问题的根因，提出可落地的分流方案', accept: '问题分类覆盖近四周 90% 以上来电；方案经客服主管试用一周并给出反馈', acceptor: '客服主管（示例）',
    lead: '林夏', members: [{ name: '林夏', role: '主责' }, { name: '许诺', role: '参与' }], mentor: '周颖', mentorWhy: '林夏在这个项目没有项目范围的带教，按她的默认带教推出',
    createdAt: bj('2026-10-19 13:40'), confirmed: st === 'empty' ? null : { by: '周颖', at: bj('2026-10-20 10:00') }, stations: '客服岗（林夏第 3 站）',
    milestones: st === 'empty' ? [] : [ms1, ms2],
    conclusion: st === 'ended' ? { delivery: '达成', evidence: '问题定义 V2、分流方案验证 V1', verify: '未验证', lessons: '先和业务方对齐口径再取数，省掉一轮返工', next: '下期把分流规则接进 IVR 菜单', by: '林夏', at: bj('2026-12-07 16:00'), closedBy: '周颖', closedAt: bj('2026-12-08 11:00') } : null,
  };
  const pj2: Project | null = st === 'empty' ? null : {
    id: 'pj-2', name: '渠道转化复盘', status: after('revise', 'pending') ? '草拟' : '推进中', goal: '梳理三个获客渠道的转化漏斗，找到流失最大的环节', accept: '漏斗数据核对无误；给出一条可验证的改进假设',
    acceptor: '销售主管（示例）', lead: '许诺', members: [{ name: '许诺', role: '主责' }], mentor: '吴桐', mentorWhy: '许诺在这个项目有项目范围的带教', createdAt: bj('2026-11-06 10:00'),
    confirmed: after('revise', 'pending') ? null : { by: '吴桐', at: bj('2026-11-11 09:30') }, stations: '销售岗（许诺第 3 站）',
    milestones: [{ id: 'ms-2-1', name: '现状梳理', goal: '画出三个渠道的转化漏斗', accept: '每个渠道的各环节数据有出处', dueAt: bj('2026-11-20 18:00'),
      status: st === 'ended' ? '待评审' : st === 'blocked' ? '进行中' : '未开始', blocker: null, tasks: [{ owner: '许诺', name: '渠道转化现状分析', credited: false }],
      versions: st === 'ended' ? [{ no: 1, by: '许诺', at: bj('2026-12-08 15:00'), reviewer: '吴桐', text: '三个渠道的漏斗画完，流失最大的是「留资 → 首次通话」', review: null }] : [] }],
    conclusion: null,
  };

  // ---- 管培生（林夏）首页 ----
  const day = (iso: string, startYmd: string) => Math.floor((Date.parse(iso) - Date.parse(`${startYmd}T00:00:00+08:00`)) / 86400000) + 1;
  const cur = STATIONS[CUR[st]];
  const station = { ...cur, no: CUR[st] + 1, day: day(now, cur.start), days: day(bj(`${cur.end} 12:00`), cur.start) };
  const trainDay = day(now, TRAIN_START);
  const tasksDue = { revise: [2, 2], pending: [2, 2], blocked: [4, 4], empty: [2, 2], ended: [6, 6] }[st];

  const actions: Action[] = [...(st === 'revise' ? v1.review!.actions.filter(a => a.kind !== '建议') : []), ...(st === 'blocked' ? v2.review!.actions : [])];
  const coord: { kind: '待评审' | '受阻' | '待确认立项'; title: string; meta: string; at: string }[] = ({
    revise: [{ kind: '待评审', title: '客服岗小结', meta: '任务 · 评审负责人 周颖', at: bj('2026-11-08 21:10') }],
    pending: [{ kind: '待评审', title: '问题定义 V2', meta: '节点 · 评审负责人 周颖', at: bj('2026-11-10 16:20') }, { kind: '待评审', title: '客服岗小结', meta: '任务 · 评审负责人 周颖', at: bj('2026-11-08 21:10') }],
    blocked: [{ kind: '受阻', title: '分流方案验证', meta: '试点要客服二组调排班 · 等周颖响应', at: bj('2026-11-12 09:30') }],
    empty: [{ kind: '待确认立项', title: '来电归因优化', meta: '等周颖确认立项，确认后才能建节点', at: bj('2026-10-19 13:40') }],
    ended: [],
  } as const)[st].map(x => ({ ...x }));
  const fb = {
    v1: { grade: '需改进', target: '问题定义 V1', scope: '节点 · 来电归因优化', by: '周颖', at: bj('2026-11-08 10:15'), text: v1.review!.key, judge: v1.review!.judge },
    v2: { grade: '达标', target: '问题定义 V2', scope: '节点 · 来电归因优化', by: '周颖', at: bj('2026-11-11 11:02'), text: '四周样本齐了，前三类占 58%，每类有样本和出处', judge: '可以进入方案验证' },
    kf: { grade: '达标', target: '客服岗小结', scope: '任务 · 客服岗', by: '周颖', at: bj('2026-11-11 15:20'), text: '把一周来电的观察写清楚了，转人工的原因可以再细一点' },
    tl: { grade: '达标', target: '服务链路梳理', scope: '任务 · 通识', by: '周颖', at: bj('2026-10-14 17:00'), text: '链路画得完整，售后环节的交接点再标清楚' },
    m2: { grade: '优秀', target: '分流方案验证 V1', scope: '节点 · 来电归因优化', by: '周颖', at: bj('2026-12-04 10:30'), text: '有前后对比，也写清了试用范围和限制', judge: '同类验证可以独立推进' },
    xs: { grade: '达标', target: '销售岗小结', scope: '任务 · 销售岗', by: '周颖', at: bj('2026-12-08 16:40'), text: '渠道话术的对比有意思，可以再补一组数据' },
  } satisfies Record<string, Feedback>;
  const feedback: Feedback[] = { revise: [fb.v1, fb.tl], pending: [fb.v1, fb.tl], blocked: [fb.v2, fb.kf], empty: [fb.tl], ended: [fb.xs, fb.m2] }[st];

  const W = (id: string, at: string, title: string, aside: string, domain: WeekItem['domain'], done?: boolean): WeekItem => ({ id, at: bj(at), title, aside, domain, done });
  const week: WeekItem[] = {
    revise: [W('w1', '2026-11-09 10:00', '问题定义修改再交', '行动', 'acc'), W('w2', '2026-11-11 18:00', '客服岗小结', '已提交', 'grow', true), W('w3', '2026-11-12 09:00', '换站 → 销售岗', '换站', 'acc'), W('w4', '2026-11-13 18:00', '问题定义截止', '节点', 'grow'), W('w5', '2026-12-04 18:00', '分流方案验证截止', '节点', 'grow')],
    pending: [W('w1', '2026-11-10 16:20', '问题定义 V2', '已提交', 'grow', true), W('w2', '2026-11-11 18:00', '客服岗小结', '已提交', 'grow', true), W('w3', '2026-11-12 09:00', '换站 → 销售岗', '换站', 'acc'), W('w4', '2026-11-13 18:00', '问题定义截止', '节点', 'grow'), W('w5', '2026-12-04 18:00', '分流方案验证截止', '节点', 'grow')],
    blocked: [W('w1', '2026-11-12 09:00', '换站 → 销售岗', '换站', 'acc', true), W('w2', '2026-11-12 09:30', '分流方案验证受阻', '受阻', 'exam', true), W('w3', '2026-11-13 18:00', '确定试点班组', '行动', 'acc'), W('w4', '2026-12-04 18:00', '分流方案验证截止', '节点', 'grow'), W('w5', '2026-12-09 18:00', '销售岗小结', '任务', 'grow')],
    empty: [W('w1', '2026-10-19 13:40', '新建来电归因优化', '已建', 'acc', true), W('w2', '2026-11-11 18:00', '来电问题分类与归因', '任务', 'grow'), W('w3', '2026-11-11 18:00', '客服岗小结', '任务', 'grow'), W('w4', '2026-11-12 09:00', '换站 → 销售岗', '换站', 'acc')],
    ended: [W('w1', '2026-12-08 11:00', '来电归因优化结项', '结项', 'grow', true), W('w2', '2026-12-10 09:00', '换站 → 定岗', '换站', 'acc', true), W('w3', '2027-03-19 18:00', '定岗答辩材料', '任务', 'grow')],
  }[st];

  const E = (item: number, judge: Judge, text: string, src: string, at: string, project?: string): Evidence => ({ item, judge, text, src, by: '周颖', at: bj(at), project });
  const evidence: Evidence[] = [];
  if (st !== 'empty') evidence.push(E(2, '有指导下完成', '能讲清一通来电从接起到结单要经过哪几个环节', '带教观察', '2026-11-05 17:00'));
  if (after('blocked', 'ended')) evidence.push(E(3, '有指导下完成', '补齐四周样本后重新归类，前三类结论有样本和出处', '问题定义 V2 的评审', '2026-11-11 11:02', '来电归因优化'));
  if (st === 'ended') evidence.push(
    E(3, '可独立完成', '自己定试点范围、对比口径，按期交出前后数据', '分流方案验证 V1 的评审', '2026-12-04 10:30', '来电归因优化'),
    E(5, '可独立完成', '用 Claude 批量归类 8,630 条来电摘要，再人工抽检 200 条核对', '问题定义 V2', '2026-12-04 10:40', '来电归因优化'));
  const coverage = new Set(evidence.map(e => e.item)).size;

  const P = (kind: Passed['kind'], title: string, grade: Grade | undefined, at: string, from: string, via?: string): Passed => ({ kind, title, grade, at: bj(at), from, via });
  const passed: Passed[] = [P('成果', '服务链路梳理', '达标', '2026-10-14 17:00', '任务 · 通识'), P('成果', '公司与业务认知笔记', '达标', '2026-09-16 17:00', '任务 · 入职')];
  if (after('blocked', 'ended')) passed.unshift(P('成果', '问题定义 V2', '达标', '2026-11-11 11:02', '来电归因优化'), P('认定', '来电问题分类与归因', undefined, '2026-11-11 11:02', '任务 · 客服岗', '经 问题定义 V2 认定'), P('成果', '客服岗小结', '达标', '2026-11-11 15:20', '任务 · 客服岗'));
  if (st === 'ended') passed.unshift(P('成果', '销售岗小结', '达标', '2026-12-08 16:40', '任务 · 销售岗'), P('成果', '分流方案验证 V1', '优秀', '2026-12-04 10:30', '来电归因优化'), P('成果', '渠道转化现状分析', '达标', '2026-12-03 15:00', '任务 · 销售岗'));
  passed.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const T = (at: string, kind: string, text: string, who: string, tone: Ev['tone']): Ev => ({ at: bj(at), kind, text, who, tone });
  const timeline: Ev[] = [T('2026-09-16 17:00', '评审 · 达标', '公司与业务认知笔记', '周颖', 'grow'), T('2026-10-14 17:00', '评审 · 达标', '服务链路梳理', '周颖', 'grow'), T('2026-10-15 09:00', '换站', '到客服岗（第 3 站）', '系统', 'acc'), T('2026-10-19 13:40', '新建项目', '来电归因优化（主责）', '林夏', 'acc')];
  if (st !== 'empty') timeline.push(T('2026-10-20 10:00', '确认立项', '来电归因优化', '周颖', 'grow'), T('2026-10-21 10:30', '新建关键节点', '问题定义、分流方案验证', '林夏', 'week'), T('2026-11-05 17:00', '提炼能力证据', '用户与服务链路认知 · 带教观察', '周颖', 'ai'), T('2026-11-07 17:40', '提交成果', '问题定义 V1', '林夏', 'ment'), T('2026-11-08 10:15', '评审 · 需改进', '问题定义 V1，给了 1 条修改再交', '周颖', 'exam'), T('2026-11-08 21:10', '提交成果', '客服岗小结', '林夏', 'ment'));
  if (after('pending', 'blocked', 'ended')) timeline.push(T('2026-11-10 16:20', '修改再交', '问题定义 V2（修改再交行动自动完成）', '林夏', 'ment'));
  if (after('blocked', 'ended')) timeline.push(T('2026-11-11 11:02', '评审 · 达标', '问题定义 V2，认定林夏、许诺各一条任务', '周颖', 'grow'), T('2026-11-11 15:20', '评审 · 达标', '客服岗小结', '周颖', 'grow'), T('2026-11-12 09:00', '换站', '到销售岗（第 4 站）', '系统', 'acc'), T('2026-11-12 09:30', '标记受阻', '分流方案验证：等客服主管批排班', '林夏', 'due'));
  if (st === 'ended') timeline.push(T('2026-11-12 14:05', '响应受阻', '分流方案验证（仍受阻）', '周颖', 'week'), T('2026-11-16 10:00', '解除受阻', '分流方案验证', '林夏', 'grow'), T('2026-12-03 18:00', '提交成果', '分流方案验证 V1', '林夏', 'ment'), T('2026-12-04 10:30', '评审 · 优秀', '分流方案验证 V1', '周颖', 'grow'), T('2026-12-08 11:00', '确认结项', '来电归因优化 · 交付达成，业务未验证', '周颖', 'grow'), T('2026-12-10 09:00', '换站', '到定岗（第 5 站）', '系统', 'acc'));
  timeline.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const s = (pass: boolean, open: boolean) => (pass ? '已通过' : open ? '进行中' : '未开始');
  const path: PathStation[] = [
    { ...STATIONS[0], tasks: [{ name: '公司与业务认知笔记', status: '已通过' }], projects: [] },
    { ...STATIONS[1], tasks: [{ name: '服务链路梳理', status: '已通过' }], projects: [] },
    { ...STATIONS[2], tasks: [{ name: '来电问题分类与归因', status: s(after('blocked', 'ended'), true), inProject: '来电归因优化 · 问题定义' }, { name: '客服岗小结', status: after('blocked', 'ended') ? '已通过' : after('revise', 'pending') ? '待评审' : '进行中' }], projects: ['来电归因优化'] },
    { ...STATIONS[3], tasks: [{ name: '渠道转化现状分析', status: s(st === 'ended', st === 'blocked') }, { name: '销售岗小结', status: s(st === 'ended', st === 'blocked') }], projects: after('blocked', 'ended') ? ['来电归因优化（跨站）'] : [] },
    { ...STATIONS[4], tasks: [{ name: '定岗答辩材料', status: st === 'ended' ? '进行中' : '未开始' }], projects: [] },
  ];

  // ---- 带教（周颖）首页 ----
  const R = (who: string, title: string, scope: ReviewItem['scope'], ctx: string, at: string, due: string, deep = false): ReviewItem => ({ who, title, scope, ctx, at: bj(at), dueAt: bj(due), deep });
  const toReview: ReviewItem[] = {
    revise: [R('林夏', '客服岗小结', '任务', '客服岗', '2026-11-08 21:10', '2026-11-10 21:10')],
    pending: [R('林夏', '问题定义 V2', '节点', '来电归因优化', '2026-11-10 16:20', '2026-11-12 16:20', true), R('林夏', '客服岗小结', '任务', '客服岗', '2026-11-08 21:10', '2026-11-10 21:10')],
    blocked: [], empty: [],
    ended: [R('许诺', '客服岗小结', '任务', '客服岗', '2026-12-09 17:30', '2026-12-11 17:30')],
  }[st];
  const toConfirm = st === 'empty' ? [{ who: '林夏', project: '来电归因优化', goal: pj1.goal, at: pj1.createdAt }] : [];
  const blockers = st === 'blocked' ? [{ who: '林夏', project: '来电归因优化', node: '分流方案验证', reason: ms2.blocker!.reason, decider: '客服主管', at: ms2.blocker!.at }] : [];
  const lin: MenteeRow = { name: '林夏', color: COLOR.林夏, ...({
    revise: { station: '客服岗 · 第 3 站', project: '来电归因优化', node: '问题定义 · 需修改', nodeTone: 'warn', last: '问题定义 V1 · 11.08', lastGrade: '需改进', risks: [], next: '修改再交 · 11.13 截止' },
    pending: { station: '客服岗 · 第 3 站', project: '来电归因优化', node: '问题定义 · 待评审', nodeTone: 'info', last: '问题定义 V1 · 11.08', lastGrade: '需改进', risks: [], next: '等你评审 V2' },
    blocked: { station: '销售岗 · 第 4 站', project: '来电归因优化', node: '分流方案验证 · 进行中', nodeTone: 'acc', last: '问题定义 V2 · 11.11', lastGrade: '达标', risks: ['受阻'], next: '受阻未响应' },
    empty: { station: '客服岗 · 第 3 站', project: '来电归因优化（草拟）', node: '待你确认立项', nodeTone: 'plain', last: '服务链路梳理 · 10.14', lastGrade: '达标', risks: [], next: '等你确认立项' },
    ended: { station: '定岗 · 第 5 站', project: '来电归因优化（已结项）', node: '交付达成 · 业务未验证', nodeTone: 'ok', last: '销售岗小结 · 12.08', lastGrade: '达标', risks: [] },
  } as const)[st] };
  const xu: MenteeRow = { name: '许诺', color: COLOR.许诺, ...({
    revise: { station: '销售岗 · 第 3 站', project: '渠道转化复盘（草拟）', node: '待吴桐确认立项', nodeTone: 'plain', last: '服务链路梳理 · 10.14', lastGrade: '达标', risks: [] },
    pending: { station: '销售岗 · 第 3 站', project: '渠道转化复盘（草拟）', node: '待吴桐确认立项', nodeTone: 'plain', last: '服务链路梳理 · 10.14', lastGrade: '达标', risks: [] },
    blocked: { station: '客服岗 · 第 4 站', project: '渠道转化复盘', node: '现状梳理 · 进行中', nodeTone: 'acc', last: '销售岗小结 · 11.11 · 吴桐', lastGrade: '达标', risks: [] },
    empty: { station: '销售岗 · 第 3 站', project: '还没有项目', node: '', nodeTone: 'plain', last: '服务链路梳理 · 10.14', lastGrade: '达标', risks: [] },
    ended: { station: '定岗 · 第 5 站', project: '渠道转化复盘', node: '现状梳理 · 待评审', nodeTone: 'info', last: '销售岗小结 · 11.11 · 吴桐', lastGrade: '达标', risks: [], next: '客服岗小结等你评审' },
  } as const)[st] };
  const mentees = [lin, xu];
  const board = {
    repeatFail: [] as { project: string; node: string; times: number }[],
    pending: [{ mentor: '周颖', n: toReview.length }, { mentor: '吴桐', n: ({ revise: 1, pending: 1, blocked: 0, empty: 0, ended: 1 } as const)[st] }],
  };
  const sw = {
    at: st === 'ended' ? bj('2026-12-10 09:00') : bj('2026-11-12 09:00'), today: after('blocked', 'ended'),
    list: st === 'ended' ? [{ who: '林夏', from: '销售岗', to: '定岗' }, { who: '许诺', from: '客服岗', to: '定岗' }] : [{ who: '林夏', from: '客服岗', to: '销售岗' }, { who: '许诺', from: '销售岗', to: '客服岗' }],
  };

  return { st, now, pj1, pj2, ms1, ms2, station, trainDay, tasksDue, actions, coord, feedback, week, evidence, coverage, passed, timeline, path, curStation: CUR[st], toReview, toConfirm, blockers, mentees, board, sw };
}
export type World = ReturnType<typeof world>;
