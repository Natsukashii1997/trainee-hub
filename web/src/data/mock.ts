// 示例数据：UI 原型阶段用，人名均为虚构，日期、假期、带教分配都是示例数据。接后端后整份删除，改由接口返回。
// 任务实例不手写：路径任务由模板的截止规则 × 工作日日历落出，周期任务由规则展开（generate.ts），再按下面的 HISTORY 补上历史。
import { addWorkdays, atBj, bjYmd } from '../lib/workday';
import { pathTasksFor, pathTaskId, recurringTaskId, recurringTasksFor } from './generate';
import type {
  Announcement, Asset, Cohort, Grade, HandoverNote, Integration, Module, PathTemplate, PersonalPath, RecurringRule, Resource,
  Review, Stage, Station, Submission, TaskInstance, TaskTemplate, TeamEvent, User, WorkdayEntry,
} from './types';

/** 把北京时间 "2026-11-05 20:00" 转成 ISO（UTC） */
export const bj = (s: string) => new Date(`${s.replace(' ', 'T')}:00+08:00`).toISOString();

/** 演示用的"现在"：北京时间 2026-11-05 周四 10:24 */
export const DEMO_NOW = bj('2026-11-05 10:24');
export const ADMIN_ID = 'u-chang';
export const COHORT_ID = 'c-2026a';

// ---------- 工作日日历（示例数据：2026 中秋、国庆与调休，2027 元旦；其余假期待管理员录入） ----------
export const workdays: WorkdayEntry[] = [
  { date: '2026-09-25', workday: false, name: '中秋节' },
  { date: '2026-09-27', workday: true, name: '国庆调休' },
  ...['01', '02', '03', '04', '05', '06', '07'].map(d => ({ date: `2026-10-${d}`, workday: false, name: '国庆节' })),
  { date: '2026-10-10', workday: true, name: '国庆调休' },
  { date: '2027-01-01', workday: false, name: '元旦' },
];

// ---------- 人 ----------
export const users: User[] = [
  { id: 'u-lin', name: '林夏', color: '#3446E0', role: 'trainee', team: '2026 秋季班', feishuOpenId: 'ou_lin', cohortId: COHORT_ID, joinedAt: bj('2026-09-10 09:00'), firstLoginAt: bj('2026-09-10 09:20'), bio: '喜欢把复杂的事拆清楚。轮岗期间想把客服和销售的数据串起来看。', skills: ['行业研究', '数据整理', 'Claude'], lastActiveAt: bj('2026-11-05 10:20') },
  { id: 'u-xu', name: '许诺', color: '#5A6577', role: 'trainee', team: '2026 秋季班', feishuOpenId: 'ou_xu', cohortId: COHORT_ID, joinedAt: bj('2026-09-10 09:00'), firstLoginAt: bj('2026-09-10 09:31'), bio: '销售岗在读，擅长和人聊天。', skills: ['沟通', '销售话术'], lastActiveAt: bj('2026-11-05 09:12') },
  { id: 'u-zhao', name: '赵一然', color: '#8A6A3B', role: 'trainee', team: '2026 秋季班', feishuOpenId: 'ou_zhao', cohortId: COHORT_ID, joinedAt: bj('2026-09-10 09:00'), firstLoginAt: bj('2026-09-10 09:25'), bio: '写东西比说话快。', skills: ['内容策划', 'Prompt'], lastActiveAt: bj('2026-11-05 09:40') },
  { id: 'u-chen', name: '陈默', color: '#2E5B4E', role: 'trainee', team: '2026 秋季班', feishuOpenId: 'ou_chen', cohortId: COHORT_ID, joinedAt: bj('2026-09-10 09:00'), firstLoginAt: bj('2026-09-10 09:18'), bio: '工具控，团队里第一个写 Skill 的人。', skills: ['Skill 开发', '投放分析'], lastActiveAt: bj('2026-11-05 10:02') },
  { id: 'u-meng', name: '孟川', color: '#6B4E8A', role: 'trainee', team: '2026 秋季班', feishuOpenId: 'ou_meng', cohortId: COHORT_ID, joinedAt: bj('2026-09-10 09:00'), firstLoginAt: bj('2026-09-10 10:02'), bio: '师范背景，正在教学岗。', skills: ['教学设计'], lastActiveAt: bj('2026-10-30 18:40') },
  { id: 'u-song', name: '宋知', color: '#3E6E8E', role: 'trainee', team: '2026 秋季班', feishuOpenId: 'ou_song', cohortId: COHORT_ID, joinedAt: bj('2026-09-10 09:00'), firstLoginAt: bj('2026-09-10 09:40'), bio: '对课程体系感兴趣。', skills: ['课程研发'], lastActiveAt: bj('2026-11-04 21:15') },
  { id: 'u-zhou', name: '周颖', color: '#B0875A', role: 'mentor', team: '客户线', feishuOpenId: 'ou_zhou', roleAssignedAt: bj('2026-09-01 10:00'), line: '客户线', bio: '客户线负责人，带过三期管培生。', skills: ['客服管理', '销售'], lastActiveAt: bj('2026-11-05 10:10') },
  { id: 'u-wu', name: '吴桐', color: '#4F6B3A', role: 'mentor', team: '老师线', feishuOpenId: 'ou_wu', roleAssignedAt: bj('2026-09-01 10:00'), line: '老师线', bio: '教研主管。', skills: ['教研', '教学'], lastActiveAt: bj('2026-11-05 08:55') },
  { id: ADMIN_ID, name: '常浩', color: '#14161A', role: 'admin', team: 'AIBP', feishuOpenId: 'ou_chang', roleAssignedAt: bj('2026-09-01 10:00'), line: 'AIBP', bio: '负责管培生带教与 AI 落地。', skills: ['AI 落地', '培训设计'], lastActiveAt: bj('2026-11-05 10:24') },
  { id: 'u-he', name: '何安', color: '#7A5C5C', role: 'colleague', team: '市场部', feishuOpenId: 'ou_he', firstLoginAt: bj('2026-10-12 14:00'), roleAssignedAt: bj('2026-10-12 16:00'), bio: '市场部同事，常来资产库找 Prompt。', skills: ['活动策划'], lastActiveAt: bj('2026-11-03 15:00') },
  // 新登录、还没分配角色的同事：演示 R01
  { id: 'u-bai', name: '白露', color: '#5C7A6E', role: 'colleague', team: '市场部', feishuOpenId: 'ou_bai', firstLoginAt: bj('2026-11-04 16:20'), lastActiveAt: bj('2026-11-04 16:25') },
];

// ---------- 路径模板（v1.0，已被 2026 秋季班绑定，只读） ----------
export const pathTemplates: PathTemplate[] = [
  { id: 'pt-1', name: '管培生培养路径', version: 'v1.0', frozen: true, createdAt: bj('2026-08-20 10:00') },
];

export const cohorts: Cohort[] = [{
  id: COHORT_ID, name: '2026 秋季班', templateId: 'pt-1', templateVersion: 'v1.0',
  startAt: bj('2026-09-10 09:00'), endAt: bj('2027-03-19 18:00'), status: 'running',
  roster: users.filter(u => u.role === 'trainee').map(u => ({ openId: u.feishuOpenId!, name: u.name })),
}];

export const stages: Stage[] = [
  { id: 's1', templateId: 'pt-1', no: 1, name: '入职', days: 7, desc: '熟悉公司、团队和工具，开通账号。' },
  { id: 's2', templateId: 'pt-1', no: 2, name: '通识：AI 行研与路演', days: 28, desc: '用 AI 完成一份行业研究并当众路演。跨中秋、国庆假期，按工作日算约三周。' },
  { id: 's3', templateId: 'pt-1', no: 3, name: '轮岗', days: 84, desc: '老师线、客户线、市场线共六个岗位，每站两周。' },
  { id: 's4', templateId: 'pt-1', no: 4, name: '定岗', days: 72, desc: '在目标岗位独立负责一块工作，期末答辩。' },
];

export const modules: Module[] = [
  { id: 'm-onboard', stageId: 's1', name: '入职', days: 7 },
  { id: 'm-research', stageId: 's2', name: '行研与路演', days: 28 },
  { id: 'm-jy', stageId: 's3', name: '教研', line: '老师线', days: 14 },
  { id: 'm-jx', stageId: 's3', name: '教学', line: '老师线', days: 14 },
  { id: 'm-kf', stageId: 's3', name: '客服', line: '客户线', days: 14 },
  { id: 'm-xs', stageId: 's3', name: '销售', line: '客户线', days: 14 },
  { id: 'm-nr', stageId: 's3', name: '内容', line: '市场线', days: 14 },
  { id: 'm-tf', stageId: 's3', name: '投放', line: '市场线', days: 14 },
  { id: 'm-ding', stageId: 's4', name: '定岗', days: 72 },
];

const S = (offsetWorkdays: number, time = '18:00') => ({ anchor: 'stationStart' as const, offsetWorkdays, time });
const E = (offsetWorkdays = 0, time = '18:00') => ({ anchor: 'stationEnd' as const, offsetWorkdays, time });
const T = (id: string, moduleId: string, name: string, output: TaskTemplate['output'], days: number, deadline: TaskTemplate['deadline'], desc: string, requirements: string[], assetIds: string[] = [], resources: TaskTemplate['resources'] = []): TaskTemplate =>
  ({ id, moduleId, name, output, days, deadline, desc, requirements, assetIds, resources });

export const templates: TaskTemplate[] = [
  T('tt-1', 'm-onboard', '入职手续与系统开通', '表格', 2, S(2), '完成入职流程，开通飞书、CRM 和工作台。', ['所有系统能正常登录', '加入管培生群并完成自我介绍']),
  T('tt-2', 'm-research', 'AI 行业研究报告', '文档', 8, S(10), '选一个教育细分赛道，用 AI 辅助完成行业研究。', ['覆盖市场规模、主要玩家、用户画像', '注明每个数据的来源', '附上关键 Prompt'], ['a-2']),
  T('tt-3', 'm-research', '行研路演', '路演', 4, E(), '面向带教人和管理员做 15 分钟路演。', ['15 分钟内讲完', '回答至少 3 个提问']),
  T('tt-4', 'm-jy', '课程拆解报告', '文档', 6, S(7), '拆解一门在售课程的结构与卖点。', ['画出课程结构图', '找出 3 个可改进点'], ['a-2']),
  T('tt-5', 'm-jy', '教研岗小结', '复盘', 2, E(), '两周教研岗的收获与问题。', ['不少于 800 字']),
  T('tt-6', 'm-jx', '试讲复盘', '复盘', 4, S(4), '完成一次试讲并复盘。', ['附试讲录像链接', '学生反馈数据放在最前面']),
  T('tt-7', 'm-jx', '教学岗小结', '复盘', 2, E(), '两周教学岗的收获与问题。', ['不少于 800 字']),
  T('tt-8', 'm-kf', '话术演练录音', '录音', 4, S(4), '按话术库完成 5 段模拟通话录音。', ['覆盖退费、调课、投诉三类场景', '每段 3 分钟以内'], ['a-3'], [{ title: '常见问题话术库', source: '管培生知识库' }]),
  T('tt-9', 'm-kf', '一周来电归因复盘', '文档', 5, S(6), '把一周来电按问题类型归因，给出前三大原因和改进建议。', ['覆盖全部来电记录', '前三大原因各附 2 条原话', '给出可执行的改进建议'], ['a-1'], [{ title: '客服 SOP（第 3 版）', source: '管培生知识库' }, { title: '来电问题分类标准', source: '管培生知识库' }]),
  T('tt-10', 'm-kf', '客服岗小结', '复盘', 2, E(), '两周客服岗的收获与问题。', ['不少于 800 字']),
  T('tt-11', 'm-xs', '跟单记录', '表格', 6, S(7), '跟进 10 个意向客户并记录。', ['每个客户至少两次跟进'], ['a-6']),
  T('tt-12', 'm-xs', '销售岗小结', '复盘', 2, E(), '两周销售岗的收获与问题。', ['不少于 800 字']),
  T('tt-13', 'm-nr', '公众号选题清单', '表格', 4, S(5), '给下个月的公众号提 10 个选题。', ['每个选题写清目标读者和切入点'], ['a-2']),
  T('tt-14', 'm-nr', '推文初稿', '文档', 5, S(8), '完成一篇推文初稿。', ['1500 字以内', '配图建议']),
  T('tt-15', 'm-tf', '投放数据周报', '表格', 4, S(5), '整理一周投放数据并分析。', ['覆盖花费、线索量、转化率']),
  T('tt-16', 'm-tf', '投放岗小结', '复盘', 2, E(), '两周投放岗的收获与问题。', ['不少于 800 字']),
  T('tt-17', 'm-ding', '定岗工作计划', '文档', 8, S(10), '定岗后第一个月的工作计划。', ['目标可衡量']),
  T('tt-18', 'm-ding', '定岗答辩', '路演', 10, E(), '期末答辩。', ['20 分钟陈述 + 10 分钟提问']),
];

export const recurringRules: RecurringRule[] = [
  { id: 'weekly', name: '周报', titleTemplate: '第 {week} 周周报', frequency: { kind: 'weekly', weekday: 0 }, dueTime: '22:00', completion: 'bot-weekly', needsReview: false, output: '文档', note: '本周做了什么、学到什么、下周计划。只在带教机器人里交，工作台只显示交没交。', enabled: true },
  { id: 'quiz', name: '轻测', titleTemplate: '轻测 · {module}', frequency: { kind: 'weekly', weekday: 4 }, dueTime: '20:00', stageIds: ['s3'], completion: 'bot-quiz', needsReview: false, output: '文档', note: '机器人出题，2–3 道，约 20 分钟；成绩写回工作台，未作答记「未答」，不判逾期。', enabled: true },
  { id: 'material', name: '月度营销物料上传', titleTemplate: '{month} 月营销物料上传', frequency: { kind: 'monthEnd' }, dueTime: '22:00', stageIds: ['s3'], completion: 'declare', needsReview: true, output: '表格', note: '每月最后一天声明本月参与的营销物料，管理员确认。', enabled: true },
  { id: 'daily', name: '日报', titleTemplate: '{date} 日报', frequency: { kind: 'daily' }, dueTime: '21:00', completion: 'link', needsReview: false, output: '文档', note: '提交通道待定，一期不展开。', enabled: false },
];

// ---------- 个人路径：每站挂站带教 ----------
// 客户线站（客服、销售）站带教周颖；老师线站（教研、教学）站带教吴桐；市场线站（内容、投放）故意不设站带教 → 落给管理员。
// 入职、通识、定岗三站的站带教 = 主带教；只有林夏设主带教（周颖），其他人不设（= 管理员常浩）。
const MAIN_MENTOR: Record<string, string | undefined> = { 'u-lin': 'u-zhou' };
const LINE_MENTOR: Record<string, string | undefined> = { 客户线: 'u-zhou', 老师线: 'u-wu', 市场线: undefined };
// 轮岗顺序（示例数据）：第 3 段销售挤 2 人、内容空岗；第 5 段内容挤 2 人、教学空岗；第 6 段教学挤 2 人、销售空岗
const ROTATION: Record<string, string[]> = {
  'u-lin': ['m-jx', 'm-kf', 'm-xs', 'm-nr', 'm-tf', 'm-jy'],
  'u-xu': ['m-jy', 'm-xs', 'm-kf', 'm-tf', 'm-nr', 'm-jx'],
  'u-zhao': ['m-tf', 'm-nr', 'm-xs', 'm-jy', 'm-kf', 'm-jx'],
  'u-chen': ['m-nr', 'm-tf', 'm-jy', 'm-jx', 'm-xs', 'm-kf'],
  'u-meng': ['m-kf', 'm-jx', 'm-tf', 'm-xs', 'm-jy', 'm-nr'],
  'u-song': ['m-xs', 'm-jy', 'm-jx', 'm-kf', 'm-nr', 'm-tf'],
};
/** 轮岗六段：每段两周，周四开站、下下周三结束 */
const SEGMENTS: [string, string][] = [
  ['2026-10-15', '2026-10-28'], ['2026-10-29', '2026-11-11'], ['2026-11-12', '2026-11-25'],
  ['2026-11-26', '2026-12-09'], ['2026-12-10', '2026-12-23'], ['2026-12-24', '2027-01-06'],
];

function buildPath(userId: string): PersonalPath {
  const main = MAIN_MENTOR[userId];
  const slots: [string, string, string, string | undefined][] = [
    ['m-onboard', '2026-09-10', '2026-09-16', main],
    ['m-research', '2026-09-17', '2026-10-14', main],
    ...ROTATION[userId].map((m, i): [string, string, string, string | undefined] =>
      [m, SEGMENTS[i][0], SEGMENTS[i][1], LINE_MENTOR[modules.find(x => x.id === m)!.line!]]),
    ['m-ding', '2027-01-07', '2027-03-19', main],
  ];
  const stations: Station[] = slots.map(([moduleId, a, b, mentor], order) => ({
    id: `st-${userId}-${order}`, userId, moduleId, order, startAt: atBj(a, '09:00'), endAt: atBj(b, '18:00'), stationMentorId: mentor,
  }));
  // 已开站的「换站接人」都已确认准备（示例数据）；未开站的留空，交给 R06
  for (const s of stations) if (Date.parse(s.startAt) < Date.parse(DEMO_NOW)) s.preparedAt = addWorkdays(s.startAt, -2, workdays);
  return {
    id: `p-${userId}`, userId, cohortId: COHORT_ID, startAt: stations[0].startAt, endAt: stations[stations.length - 1].endAt,
    mainMentorId: main, status: 'running', stations,
  };
}
export const paths: PersonalPath[] = Object.keys(ROTATION).map(buildPath);

// ---------- 任务实例与历史 ----------
type Hist = {
  subs?: { at: string; note?: string; changeNote?: string; url?: string; channel?: 'web' | 'bot' }[];
  reviews?: { at: string; grade: Grade; comment: string; by?: string }[];
  status?: 'todo' | 'doing';
  progress?: number;
  quiz?: number | '未答';
};
const P = (userId: string, tpl: string) => pathTaskId(userId, tpl);
const Rr = (rule: string, userId: string, ymd: string) => recurringTaskId(rule, userId, ymd);

/** 有故事的历史；其余已过截止的任务按默认补成「按时提交、已通过」，周报按时交、轻测有分、物料已确认 */
const HISTORY: Record<string, Hist> = {
  // 林夏：今天有轻测、明天交归因复盘；话术录音等周颖点评
  [P('u-lin', 'tt-2')]: { subs: [{ at: '2026-09-30 21:10', url: 'LinK12Research' }], reviews: [{ at: '2026-10-09 11:00', grade: '优秀', comment: '数据来源标得很清楚，结论有自己的判断。' }] },
  [P('u-lin', 'tt-6')]: { subs: [{ at: '2026-10-21 17:40', url: 'LinTrialLesson' }], reviews: [{ at: '2026-11-03 15:20', grade: '达标', comment: '结构清楚，节奏也稳。下次把学生反馈的数据放到最前面，结论会更有说服力。' }] },
  [P('u-lin', 'tt-8')]: { subs: [{ at: '2026-11-04 16:50', url: 'LinScriptRecording', note: '5 段录音放在文档里，第 4 段投诉场景有点卡壳。' }] },
  [P('u-lin', 'tt-9')]: { status: 'doing', progress: 0.5 },
  // 赵一然：行研报告迟交；内容站无站带教，选题清单和物料声明落给管理员
  [P('u-zhao', 'tt-2')]: { subs: [{ at: '2026-10-09 20:00' }], reviews: [{ at: '2026-10-12 10:00', grade: '达标', comment: '选题有意思，数据还可以再新一些。' }] },
  [P('u-zhao', 'tt-13')]: { subs: [{ at: '2026-11-05 09:10', url: 'ZhaoTopics' }] },
  [P('u-zhao', 'tt-14')]: { status: 'doing', progress: 0.2 },
  [Rr('material', 'u-zhao', '2026-10-31')]: { subs: [{ at: '2026-10-31 21:00', note: '参与了 10 月两场直播的海报和推文。' }] },
  // 陈默：内容站推文需修改（修改截止 11-06）；投放周报今早已交
  [P('u-chen', 'tt-14')]: { subs: [{ at: '2026-10-27 10:00', url: 'ChenDraft' }], reviews: [{ at: '2026-11-03 11:00', grade: '需改进', comment: '结构可以，标题和开头太平，换一个读者一眼想点开的切口。' }] },
  [P('u-chen', 'tt-15')]: { subs: [{ at: '2026-11-05 09:30', url: 'ChenAdsWeekly' }] },
  // 孟川：客服站「需修改后再交通过」；小结离站时还没评（刚交接出去）；教学站试讲复盘已逾期；轻测一次未答
  [P('u-meng', 'tt-9')]: {
    subs: [{ at: '2026-10-23 15:00' }, { at: '2026-10-28 11:00', changeNote: '补了前三大原因的原话，改进建议改成可执行的三条。' }],
    reviews: [{ at: '2026-10-26 10:00', grade: '需改进', comment: '原因归类对了，但每类没有原话支撑。' }, { at: '2026-10-29 10:30', grade: '达标', comment: '这版可以，改进建议能直接拿去用。' }],
  },
  [P('u-meng', 'tt-10')]: { subs: [{ at: '2026-10-28 17:30' }] },
  [P('u-meng', 'tt-6')]: { status: 'doing' },
  [Rr('weekly', 'u-meng', '2026-11-01')]: { subs: [{ at: '2026-11-02 07:50', channel: 'bot' }] },
  [Rr('quiz', 'u-meng', '2026-10-29')]: { quiz: '未答' },
  // 许诺：课程拆解迟交；第 44 周周报没交（无主带教 → 跟进落给管理员）
  [P('u-xu', 'tt-4')]: { subs: [{ at: '2026-10-27 20:30' }], reviews: [{ at: '2026-10-29 11:00', grade: '达标', comment: '拆得细，但晚了一天。' }] },
  [P('u-xu', 'tt-11')]: { status: 'doing', progress: 0.3 },
  [Rr('weekly', 'u-xu', '2026-11-01')]: {},
  // 宋知：行研路演首轮需改进，再交后优秀
  [P('u-song', 'tt-3')]: {
    subs: [{ at: '2026-10-14 16:00' }, { at: '2026-10-19 15:00', changeNote: '压缩到 14 分钟，补了竞品价格带。' }],
    reviews: [{ at: '2026-10-15 10:00', grade: '需改进', comment: '超时 6 分钟，结论埋得太深。' }, { at: '2026-10-20 10:00', grade: '优秀', comment: '改得很到位，开头一分钟就把结论讲清楚了。' }],
  },
  [P('u-song', 'tt-4')]: { status: 'doing', progress: 0.6 },
};

const COMMENTS = ['要点齐全，按要求完成。', '结构清楚，结论有依据。', '完成得不错，细节还可以再打磨。', '有自己的判断，继续保持。'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const doc = (code: string) => `https://example.feishu.cn/docx/${code.replace(/\W/g, '')}`;

function stationMentorOfTask(t: TaskInstance): string {
  const st = paths.flatMap(p => p.stations).find(s => s.id === t.stationId);
  return st?.stationMentorId ?? ADMIN_ID;
}

/** 生成到「现在 + 两周」为止的全部实例，并补上历史 */
function build() {
  const until = bj('2026-11-19 23:59');
  const tasks: TaskInstance[] = [];
  const submissions: Submission[] = [];
  const reviews: Review[] = [];
  let sb = 0, rv = 0;
  for (const p of paths) {
    tasks.push(...pathTasksFor(p, templates, workdays));
    for (const r of recurringRules) tasks.push(...recurringTasksFor(r, p, modules, until, workdays));
  }
  const now = Date.parse(DEMO_NOW);
  for (const t of tasks) {
    const past = Date.parse(t.dueAt) < now;
    let h = HISTORY[t.id];
    if (!h && past) {
      const subAt = bjYmd(t.dueAt) + ' ' + (t.completion === 'bot-weekly' ? '20:30' : t.completion === 'declare' ? '18:00' : '15:00');
      if (t.completion === 'bot-quiz') h = { quiz: 70 + (hash(t.id) % 7) * 5 };
      else if (t.completion === 'bot-weekly') h = { subs: [{ at: subAt, channel: 'bot' }] };
      else {
        const revAt = bjYmd(addWorkdays(bj(subAt), 1, workdays)) + ' 10:30';
        h = {
          subs: [{ at: subAt }],
          reviews: Date.parse(bj(revAt)) < now ? [{ at: revAt, grade: t.completion === 'declare' ? '达标' : hash(t.id) % 3 === 0 ? '优秀' : '达标', comment: t.completion === 'declare' ? '已确认。' : COMMENTS[hash(t.id) % COMMENTS.length] }] : [],
        };
      }
    }
    if (!h) continue;
    if (h.quiz !== undefined) { t.quizResult = h.quiz; if (h.quiz !== '未答') t.status = 'passed'; continue; }
    const subIds: string[] = [];
    (h.subs ?? []).forEach((s, i) => {
      const id = `sb-${++sb}`;
      subIds.push(id);
      submissions.push({
        id, taskId: t.id, at: bj(s.at), version: i + 1, channel: s.channel ?? (t.completion === 'bot-weekly' ? 'bot' : 'web'),
        url: t.completion === 'link' ? doc(s.url ?? `${t.id}v${i + 1}`) : undefined, note: s.note, changeNote: s.changeNote,
      });
    });
    (h.reviews ?? []).forEach((r, i) => {
      reviews.push({
        id: `rv-${++rv}`, taskId: t.id, submissionId: subIds[Math.min(i, subIds.length - 1)],
        mentorId: r.by ?? (t.completion === 'declare' ? ADMIN_ID : stationMentorOfTask(t)), grade: r.grade, comment: r.comment, at: bj(r.at),
      });
    });
    const subs = h.subs ?? [], revs = h.reviews ?? [];
    if (subs.length) {
      if (t.completion === 'bot-weekly') t.status = 'submitted';
      else if (revs.length < subs.length) t.status = 'submitted';
      else if (revs[revs.length - 1].grade === '需改进') { t.status = 'revise'; t.reviseDueAt = addWorkdays(bj(revs[revs.length - 1].at), 3, workdays); }
      else t.status = 'passed';
    } else if (h.status) t.status = h.status;
    if (h.progress !== undefined) t.progress = h.progress;
  }
  return { tasks, submissions, reviews };
}
const built = build();
export const tasks: TaskInstance[] = built.tasks;
export const submissions: Submission[] = built.submissions;
export const reviews: Review[] = built.reviews;

// ---------- 交接要点：站结束且下一站换了带教才要写；许诺教研站（吴桐）故意没写，演示 R08 ----------
const H = (id: string, stationId: string, authorId: string, at: string, points: string[]): HandoverNote =>
  ({ id, stationId, userId: stationId.split('-').slice(1, 3).join('-'), authorId, points, at: bj(at) });
export const handovers: HandoverNote[] = [
  H('ho-1', 'st-u-lin-1', 'u-zhou', '2026-10-15 10:00', ['行研报告数据来源标得清楚，可以让她带新人做资料整理', '路演语速偏快，提醒她留白', '对客户线很感兴趣，教学岗可以多让她接触家长沟通']),
  H('ho-2', 'st-u-xu-1', ADMIN_ID, '2026-10-16 10:00', ['表达好，写东西偏口语', '行研报告的数据要盯来源']),
  H('ho-3', 'st-u-meng-1', ADMIN_ID, '2026-10-16 10:10', ['师范背景，讲东西有条理', '不太主动提问，需要多点名']),
  H('ho-4', 'st-u-song-1', ADMIN_ID, '2026-10-16 10:20', ['路演第一次超时，改过后很好', '对课程体系兴趣大，销售站可以让他看课程卖点']),
  H('ho-5', 'st-u-lin-2', 'u-wu', '2026-10-29 09:30', ['试讲节奏稳，学生反馈数据要提醒她放前面', '家长沟通开场还生，客服站可以多练']),
  H('ho-6', 'st-u-meng-2', 'u-zhou', '2026-10-30 11:00', ['归因复盘改过一版后达标', '客服岗小结还没评，我这周评完', '接电话偏紧张，教学岗试讲前多演练']),
  H('ho-7', 'st-u-song-2', 'u-zhou', '2026-10-29 16:00', ['跟单记录完整，客户分层做得好', '对价格异议的回应还要练']),
];

// ---------- 团队活动：来自共享「管培生活动」飞书日历的只读数据 ----------
export const teamEvents: TeamEvent[] = [
  { id: 'te-1', feishuEventId: 'fe_7f3a01', type: '读书会', title: '读书会：《学会提问》第 3–5 章', speakerId: 'u-song', topic: '怎么识别论证里的偷换概念', startAt: bj('2026-10-29 19:30'), endAt: bj('2026-10-29 20:30'), place: '飞书会议', cohortId: COHORT_ID, assetIds: [], status: 'replayed', minutesUrl: 'https://example.feishu.cn/minutes/obcnReadClub03' },
  { id: 'te-2', feishuEventId: 'fe_7f3a02', type: '分享会', title: '分享会：用 Claude 做行业研究', speakerId: 'u-chen', topic: '从选题到出报告，一晚上能做到什么程度', startAt: bj('2026-11-12 19:30'), endAt: bj('2026-11-12 21:00'), place: '3 楼大会议室 / 飞书会议', cohortId: COHORT_ID, assetIds: ['a-2', 'a-8'], status: 'upcoming' },
  { id: 'te-3', feishuEventId: 'fe_7f3a03', type: '分享会', title: '分享会：客服话术的 5 个坑', speakerId: 'u-zhou', topic: '退费、调课、投诉三类电话里最常见的失误', startAt: bj('2026-11-19 19:30'), endAt: bj('2026-11-19 20:30'), place: '飞书会议', cohortId: COHORT_ID, assetIds: ['a-3'], status: 'upcoming' },
  { id: 'te-4', feishuEventId: 'fe_7f3a04', type: '路演', title: '轮岗中期路演', topic: '每人 8 分钟：前三站学到了什么', startAt: bj('2026-11-26 14:00'), endAt: bj('2026-11-26 17:00'), place: '3 楼大会议室', cohortId: COHORT_ID, assetIds: [], status: 'upcoming' },
];

// ---------- AI 资产 ----------
export const assets: Asset[] = [
  { id: 'a-1', type: 'Skill', title: '通话记录归因', summary: '按问题类型、课程、时段归类一周来电，给出前三大原因和原话样例。', tags: ['客服', '数据整理'], usage: '在 Claude Code 里安装后，把导出的来电记录表格拖进对话，说「按问题类型归因」。', installCmd: 'npx skills add trainee-hub/call-attribution', example: { input: '一周 186 条来电记录（CSV）', output: '前三大原因：调课 34%、退费 21%、上课链接问题 17%，每类附 2 条原话' }, content: '---\nname: call-attribution\ndescription: 把一周来电记录按问题类型、课程、时段归类，输出前三大原因与原话样例。\n---\n\n# 通话记录归因\n\n1. 读取用户提供的来电记录表格\n2. 按「来电问题分类标准」归到 12 个类型\n3. 统计各类型占比，列出前三大原因\n4. 每个原因摘 2 条原话\n', authorId: 'u-chen', version: 'v1.2', submittedAt: bj('2026-11-04 20:00'), updatedAt: bj('2026-11-05 09:00'), status: 'live', baseUses: 21, usedBy: ['u-zhao', 'u-xu'], favBy: ['u-lin'] },
  { id: 'a-2', type: 'Prompt', title: '竞品课程拆解', summary: '输入课程详情页，输出卖点、价格带和差异点。', tags: ['行研', '内容'], usage: '把下面的 Prompt 复制到 Claude，再贴上课程详情页的文字。', example: { input: '某素养课详情页全文', output: '卖点 5 条、价格带、与我们课程的 3 个差异' }, content: '你是一名教育行业分析师。下面是一门课程的详情页。请输出：\n1. 核心卖点（不超过 5 条，每条一句话）\n2. 价格带与促销方式\n3. 与「我们的课程」相比的 3 个差异点\n\n课程详情页：\n{{粘贴到这里}}', authorId: 'u-zhao', version: 'v1.0', submittedAt: bj('2026-11-02 21:00'), updatedAt: bj('2026-11-03 10:00'), status: 'live', baseUses: 14, usedBy: ['u-lin'], favBy: [] },
  { id: 'a-3', type: 'Prompt', title: '客诉话术改写', summary: '把生硬的客服回复改写成有温度、不推卸的版本。', tags: ['客服'], usage: '复制 Prompt，贴上原始回复。', content: '请把下面这段客服回复改写得更有温度：先共情，再说明原因，最后给出明确的下一步。不要推卸责任。\n\n原回复：\n{{粘贴到这里}}', authorId: 'u-zhou', version: 'v1.1', submittedAt: bj('2026-10-20 10:00'), updatedAt: bj('2026-10-22 10:00'), status: 'live', baseUses: 18, usedBy: [], favBy: [] },
  { id: 'a-4', type: '工作流', title: '客服跟岗观察表', summary: '跟岗时按这张表记录，回来直接整理成复盘。', tags: ['客服', '复盘'], usage: '跟岗前在飞书里复制模板，按时段填写。', content: '1. 跟岗前：读客服 SOP，列出想观察的 3 个问题\n2. 跟岗中：每通电话记录类型、时长、处理方式\n3. 跟岗后：当天整理成观察表，标出没处理好的通话', authorId: 'u-zhou', version: 'v1.0', submittedAt: bj('2026-10-18 10:00'), updatedAt: bj('2026-10-18 10:00'), status: 'live', baseUses: 9, usedBy: [], favBy: [] },
  { id: 'a-5', type: 'Skill', title: '行研报告结构检查', summary: '检查行研报告是否覆盖规模、玩家、画像，数据是否都有来源。', tags: ['行研'], usage: '安装后把报告链接发给 Claude。', installCmd: 'npx skills add trainee-hub/research-check', content: '---\nname: research-check\ndescription: 检查行研报告结构完整性与数据来源。\n---\n', authorId: 'u-chen', version: 'v0.9', submittedAt: bj('2026-11-04 19:30'), updatedAt: bj('2026-11-04 19:30'), status: 'pending', baseUses: 0, usedBy: [], favBy: [] },
  { id: 'a-6', type: 'Skill', title: '销售跟进话术生成', summary: '根据客户上次的反馈，生成下一次跟进的开场和问题。', tags: ['销售'], usage: '安装后贴上客户上次的反馈。', installCmd: 'npx skills add trainee-hub/sales-followup', content: '---\nname: sales-followup\ndescription: 生成销售跟进话术。\n---\n', authorId: 'u-xu', version: 'v1.0', submittedAt: bj('2026-11-03 18:00'), updatedAt: bj('2026-11-03 18:00'), status: 'pending', baseUses: 0, usedBy: [], favBy: [] },
  { id: 'a-7', type: 'Prompt', title: '家长沟通开场白', summary: '第一次和家长电话沟通时的开场白模板。', tags: ['教学', '客服'], usage: '复制后替换孩子姓名和课程名。', content: '您好，我是{{孩子姓名}}的{{课程名}}老师……', authorId: 'u-meng', version: 'v1.0', submittedAt: bj('2026-11-05 08:00'), updatedAt: bj('2026-11-05 08:00'), status: 'pending', baseUses: 0, usedBy: [], favBy: [] },
  { id: 'a-8', type: '用例', title: '一晚上拆完 30 份竞品详情页', summary: '用「竞品课程拆解」Prompt 批量跑 30 份详情页，再让 Claude 汇总成对比表。', tags: ['行研', 'AI'], usage: '先跑单份，确认输出稳定后再批量。', authorId: 'u-zhao', version: 'v1.0', submittedAt: bj('2026-11-01 22:00'), updatedAt: bj('2026-11-02 09:00'), status: 'live', baseUses: 6, usedBy: [], favBy: [] },
  { id: 'a-9', type: 'Prompt', title: '课程卖点提炼', summary: '从课程大纲里提炼 3 个家长最关心的卖点。', tags: ['教学', '内容'], usage: '复制 Prompt，贴上课程大纲。', content: '请从下面的课程大纲里提炼 3 个家长最关心的卖点，每个一句话。\n\n{{粘贴到这里}}', authorId: 'u-song', version: 'v1.0', submittedAt: bj('2026-11-02 20:00'), updatedAt: bj('2026-11-03 16:00'), status: 'returned', returnReason: '示例输出太短，补一段真实课程的输入输出再提交。', baseUses: 0, usedBy: [], favBy: [] },
];

export const announcements: Announcement[] = [
  { id: 'an-1', title: '11 月分享会安排', body: '11.12 周四 19:30，陈默主讲「用 Claude 做行业研究」；11.19 周四 19:30，周颖讲「客服话术的 5 个坑」。请大家带上手头的问题。', at: bj('2026-11-03 09:30'), readBy: 8 },
];

export const resources: Resource[] = [
  { id: 'rs-1', title: '客服 SOP（第 3 版）', source: '管培生知识库', moduleId: 'm-kf', updatedAt: bj('2026-10-21 10:00') },
  { id: 'rs-2', title: '来电问题分类标准', source: '管培生知识库', moduleId: 'm-kf', updatedAt: bj('2026-10-12 10:00') },
  { id: 'rs-3', title: '复盘要写多长？', source: 'FAQ · 周颖 回答', moduleId: 'm-kf', updatedAt: bj('2026-10-30 10:00') },
  { id: 'rs-4', title: '销售 CRM 使用指南', source: '管培生知识库', moduleId: 'm-xs', updatedAt: bj('2026-10-02 10:00') },
];

/** 连接状态；飞书日历同步出错演示 R12 */
export const integrations: Integration[] = [
  { id: 'int-bot', name: '带教机器人接口', detail: '接口调用正常 · 今日 46 次', at: bj('2026-11-05 10:20'), level: 'ok' },
  { id: 'int-cal', name: '飞书日历 · 管培生活动', detail: '08:00 同步失败：应用凭证过期，活动停在 11-04 20:00 的数据', at: bj('2026-11-05 08:00'), level: 'error' },
  { id: 'int-kb', name: '飞书 · 管培生知识库', detail: '二期接入', at: null, level: 'off' },
  { id: 'int-base', name: '多维表格迁移', detail: '过渡期 · 只读归档定于 12.01', at: null, level: 'warn' },
];
