// 示例数据：UI 原型阶段用，人名均为虚构。接后端后整份删除，改由接口返回。
import type {
  Announcement, Asset, CalendarItem, FeedItem, Module, PersonalPath, Resource, Review, Stage, Submission, TaskInstance, TaskTemplate, User,
} from './types';

/** 把北京时间 "2026-11-05 20:00" 转成 ISO（UTC） */
export const bj = (s: string) => new Date(`${s.replace(' ', 'T')}:00+08:00`).toISOString();

/** 演示用的"现在"：北京时间 2026-11-05 周四 10:24 */
export const DEMO_NOW = bj('2026-11-05 10:24');

export const users: User[] = [
  { id: 'u-lin', name: '林夏', color: '#3446E0', role: 'trainee', team: '2026 秋季班', joinedAt: bj('2026-09-10 09:00'), mentorId: 'u-zhou', bio: '喜欢把复杂的事拆清楚。轮岗期间想把客服和销售的数据串起来看。', skills: ['行业研究', '数据整理', 'Claude'], lastActiveAt: bj('2026-11-05 10:20') },
  { id: 'u-xu', name: '许诺', color: '#5A6577', role: 'trainee', team: '2026 秋季班', joinedAt: bj('2026-09-10 09:00'), mentorId: 'u-zhou', bio: '销售岗在读，擅长和人聊天。', skills: ['沟通', '销售话术'], lastActiveAt: bj('2026-11-05 09:12') },
  { id: 'u-zhao', name: '赵一然', color: '#8A6A3B', role: 'trainee', team: '2026 秋季班', joinedAt: bj('2026-09-10 09:00'), mentorId: 'u-zhou', bio: '写东西比说话快。', skills: ['内容策划', 'Prompt'], lastActiveAt: bj('2026-11-05 09:40') },
  { id: 'u-chen', name: '陈默', color: '#2E5B4E', role: 'trainee', team: '2026 秋季班', joinedAt: bj('2026-09-10 09:00'), mentorId: 'u-wu', bio: '工具控，团队里第一个写 Skill 的人。', skills: ['Skill 开发', '投放分析'], lastActiveAt: bj('2026-11-05 10:02') },
  { id: 'u-meng', name: '孟川', color: '#6B4E8A', role: 'trainee', team: '2026 秋季班', joinedAt: bj('2026-09-10 09:00'), mentorId: 'u-wu', bio: '师范背景，正在教学岗。', skills: ['教学设计'], lastActiveAt: bj('2026-10-30 18:40') },
  { id: 'u-song', name: '宋知', color: '#3E6E8E', role: 'trainee', team: '2026 秋季班', joinedAt: bj('2026-09-10 09:00'), mentorId: 'u-wu', bio: '对课程体系感兴趣。', skills: ['课程研发'], lastActiveAt: bj('2026-11-04 21:15') },
  { id: 'u-zhou', name: '周颖', color: '#B0875A', role: 'mentor', team: '2026 秋季班', line: '客户线', bio: '客户线负责人，带过三期管培生。', skills: ['客服管理', '销售'], lastActiveAt: bj('2026-11-05 10:10') },
  { id: 'u-wu', name: '吴桐', color: '#4F6B3A', role: 'mentor', team: '2026 秋季班', line: '老师线', bio: '教研主管。', skills: ['教研', '教学'], lastActiveAt: bj('2026-11-05 08:55') },
  { id: 'u-chang', name: '常浩', color: '#14161A', role: 'admin', team: '2026 秋季班', line: 'AIBP', bio: '负责管培生带教与 AI 落地。', skills: ['AI 落地', '培训设计'], lastActiveAt: bj('2026-11-05 10:24') },
  { id: 'u-he', name: '何安', color: '#7A5C5C', role: 'colleague', team: '市场部', bio: '市场部同事，常来资产库找 Prompt。', skills: ['活动策划'], lastActiveAt: bj('2026-11-03 15:00') },
];

export const stages: Stage[] = [
  { id: 's1', no: 1, name: '入职', days: 7, desc: '熟悉公司、团队和工具，开通账号。' },
  { id: 's2', no: 2, name: '通识：AI 行研与路演', days: 14, desc: '用 AI 完成一份行业研究并当众路演。' },
  { id: 's3', no: 3, name: '轮岗', days: 84, desc: '老师线、客户线、市场共六个岗位，每站两周。' },
  { id: 's4', no: 4, name: '定岗', days: 75, desc: '在目标岗位独立负责一块工作，期末答辩。' },
];

export const modules: Module[] = [
  { id: 'm-onboard', stageId: 's1', name: '入职', days: 7 },
  { id: 'm-research', stageId: 's2', name: '行研与路演', days: 14 },
  { id: 'm-jy', stageId: 's3', name: '教研', line: '老师线', days: 14 },
  { id: 'm-jx', stageId: 's3', name: '教学', line: '老师线', days: 14 },
  { id: 'm-kf', stageId: 's3', name: '客服', line: '客户线', days: 14 },
  { id: 'm-xs', stageId: 's3', name: '销售', line: '客户线', days: 14 },
  { id: 'm-nr', stageId: 's3', name: '内容', line: '市场', days: 14 },
  { id: 'm-tf', stageId: 's3', name: '投放', line: '市场', days: 14 },
  { id: 'm-ding', stageId: 's4', name: '定岗', days: 75 },
];

const T = (id: string, moduleId: string, name: string, output: TaskTemplate['output'], days: number, desc: string, requirements: string[], assetIds: string[] = [], resources: TaskTemplate['resources'] = []): TaskTemplate =>
  ({ id, moduleId, name, output, days, desc, requirements, assetIds, resources });

export const templates: TaskTemplate[] = [
  T('tt-1', 'm-onboard', '入职手续与系统开通', '表格', 3, '完成入职流程，开通飞书、CRM 和工作台。', ['所有系统能正常登录', '加入管培生群并完成自我介绍']),
  T('tt-2', 'm-research', 'AI 行业研究报告', '文档', 10, '选一个教育细分赛道，用 AI 辅助完成行业研究。', ['覆盖市场规模、主要玩家、用户画像', '注明每个数据的来源', '附上关键 Prompt'], ['a-2']),
  T('tt-3', 'm-research', '行研路演', '路演', 4, '面向带教人和管理员做 15 分钟路演。', ['15 分钟内讲完', '回答至少 3 个提问']),
  T('tt-4', 'm-jy', '课程拆解报告', '文档', 10, '拆解一门在售课程的结构与卖点。', ['画出课程结构图', '找出 3 个可改进点']),
  T('tt-5', 'm-jy', '教研岗小结', '复盘', 4, '两周教研岗的收获与问题。', ['不少于 800 字']),
  T('tt-6', 'm-jx', '试讲复盘', '复盘', 10, '完成一次试讲并复盘。', ['附试讲录像链接', '学生反馈数据放在最前面']),
  T('tt-7', 'm-jx', '教学岗小结', '复盘', 4, '两周教学岗的收获与问题。', ['不少于 800 字']),
  T('tt-8', 'm-kf', '话术演练录音', '录音', 6, '按话术库完成 5 段模拟通话录音。', ['覆盖退费、调课、投诉三类场景', '每段 3 分钟以内'], ['a-3'], [{ title: '常见问题话术库', source: '管培生知识库' }]),
  T('tt-9', 'm-kf', '一周来电归因复盘', '文档', 8, '把一周来电按问题类型归因，给出前三大原因和改进建议。', ['覆盖全部来电记录', '前三大原因各附 2 条原话', '给出可执行的改进建议'], ['a-1'], [{ title: '客服 SOP（第 3 版）', source: '管培生知识库' }, { title: '来电问题分类标准', source: '管培生知识库' }]),
  T('tt-10', 'm-kf', '客服岗小结', '复盘', 2, '两周客服岗的收获与问题。', ['不少于 800 字']),
  T('tt-11', 'm-xs', '跟单记录', '表格', 10, '跟进 10 个意向客户并记录。', ['每个客户至少两次跟进']),
  T('tt-12', 'm-xs', '销售岗小结', '复盘', 4, '两周销售岗的收获与问题。', ['不少于 800 字']),
  T('tt-13', 'm-nr', '公众号选题清单', '表格', 6, '给下个月的公众号提 10 个选题。', ['每个选题写清目标读者和切入点'], ['a-2']),
  T('tt-14', 'm-nr', '推文初稿', '文档', 8, '完成一篇推文初稿。', ['1500 字以内', '配图建议']),
  T('tt-15', 'm-tf', '投放数据周报', '表格', 10, '整理一周投放数据并分析。', ['覆盖花费、线索量、转化率']),
  T('tt-16', 'm-tf', '投放岗小结', '复盘', 4, '两周投放岗的收获与问题。', ['不少于 800 字']),
  T('tt-17', 'm-ding', '定岗工作计划', '文档', 14, '定岗后第一个月的工作计划。', ['目标可衡量']),
  T('tt-18', 'm-ding', '定岗答辩', '路演', 61, '期末答辩。', ['20 分钟陈述 + 10 分钟提问']),
];

const ROT = ['10-01', '10-15', '10-29', '11-12', '11-26', '12-10'];
const END = ['10-14', '10-28', '11-11', '11-25', '12-09', '12-23'];
function path(userId: string, order: string[]): PersonalPath {
  const mentorId = users.find(u => u.id === userId)!.mentorId!;
  return {
    userId, startAt: bj('2026-09-10 09:00'), endAt: bj('2027-03-08 18:00'),
    modules: [
      { moduleId: 'm-onboard', startAt: bj('2026-09-10 09:00'), endAt: bj('2026-09-16 18:00'), mentorId },
      { moduleId: 'm-research', startAt: bj('2026-09-17 09:00'), endAt: bj('2026-09-30 18:00'), mentorId },
      ...order.map((moduleId, i) => ({ moduleId, startAt: bj(`2026-${ROT[i]} 09:00`), endAt: bj(`2026-${END[i]} 18:00`), mentorId })),
      { moduleId: 'm-ding', startAt: bj('2026-12-24 09:00'), endAt: bj('2027-03-08 18:00'), mentorId },
    ],
  };
}
export const paths: PersonalPath[] = [
  path('u-lin', ['m-jy', 'm-jx', 'm-kf', 'm-xs', 'm-nr', 'm-tf']),
  path('u-xu', ['m-jx', 'm-jy', 'm-xs', 'm-kf', 'm-tf', 'm-nr']),
  path('u-zhao', ['m-jy', 'm-kf', 'm-nr', 'm-xs', 'm-jx', 'm-tf']),
  path('u-chen', ['m-nr', 'm-xs', 'm-tf', 'm-jy', 'm-kf', 'm-jx']),
  path('u-meng', ['m-kf', 'm-jy', 'm-jx', 'm-tf', 'm-nr', 'm-xs']),
  path('u-song', ['m-xs', 'm-tf', 'm-jy', 'm-jx', 'm-kf', 'm-nr']),
];

type TI = Omit<TaskInstance, 'note' | 'output' | 'mentorId'> & Partial<Pick<TaskInstance, 'note' | 'output'>>;
const task = (t: TI): TaskInstance => {
  const tpl = templates.find(x => x.id === t.templateId);
  const owner = users.find(u => u.id === t.userId)!;
  return { note: tpl?.desc ?? '', output: tpl?.output ?? '文档', mentorId: owner.mentorId!, ...t };
};
const R = (id: string, userId: string, name: string, dueAt: string, status: TaskInstance['status'], note: string, output: TaskInstance['output'] = '文档') =>
  task({ id, userId, kind: 'recurring', name, dueAt, status, note, output });
const P = (id: string, userId: string, templateId: string, dueAt: string, status: TaskInstance['status'], progress?: number) => {
  const tpl = templates.find(x => x.id === templateId)!;
  return task({ id, userId, templateId, kind: 'path', name: tpl.name, moduleId: tpl.moduleId, dueAt, status, progress });
};

export const tasks: TaskInstance[] = [
  // 林夏
  P('t-l-1', 'u-lin', 'tt-1', bj('2026-09-12 18:00'), 'passed'),
  P('t-l-2', 'u-lin', 'tt-2', bj('2026-09-26 18:00'), 'passed'),
  P('t-l-3', 'u-lin', 'tt-3', bj('2026-09-30 18:00'), 'passed'),
  P('t-l-4', 'u-lin', 'tt-4', bj('2026-10-10 18:00'), 'passed'),
  P('t-l-5', 'u-lin', 'tt-6', bj('2026-10-24 18:00'), 'passed'),
  P('t-l-6', 'u-lin', 'tt-8', bj('2026-11-04 18:00'), 'submitted'),
  P('t-l-7', 'u-lin', 'tt-9', bj('2026-11-06 18:00'), 'doing', 0.5),
  P('t-l-8', 'u-lin', 'tt-10', bj('2026-11-11 18:00'), 'todo'),
  R('r-l-1', 'u-lin', '轻测 · 客服话术与流程', bj('2026-11-05 20:00'), 'todo', '带教人出题，约 20 分钟。', '文档'),
  R('r-l-2', 'u-lin', '第 45 周周报', bj('2026-11-08 22:00'), 'todo', '本周做了什么、学到什么、下周计划。机器人会在周日提醒。'),
  R('r-l-3', 'u-lin', '月度营销物料上传', bj('2026-11-30 22:00'), 'todo', '每月最后一天上传本月参与的营销物料。', '表格'),
  R('r-l-4', 'u-lin', '第 44 周周报', bj('2026-11-01 22:00'), 'passed', '本周做了什么、学到什么、下周计划。'),
  // 许诺
  P('t-x-1', 'u-xu', 'tt-6', bj('2026-10-10 18:00'), 'passed'),
  P('t-x-2', 'u-xu', 'tt-11', bj('2026-11-08 18:00'), 'doing', 0.3),
  R('r-x-1', 'u-xu', '第 44 周周报', bj('2026-11-04 18:00'), 'todo', '本周做了什么、学到什么、下周计划。'),
  R('r-x-2', 'u-xu', '轻测 · 销售流程', bj('2026-11-05 20:00'), 'todo', '带教人出题，约 20 分钟。'),
  // 赵一然
  P('t-z-1', 'u-zhao', 'tt-13', bj('2026-11-05 18:00'), 'submitted'),
  P('t-z-2', 'u-zhao', 'tt-14', bj('2026-11-09 18:00'), 'doing', 0.2),
  R('r-z-1', 'u-zhao', '第 44 周周报', bj('2026-11-04 22:00'), 'submitted', '本周做了什么、学到什么、下周计划。'),
  R('r-z-2', 'u-zhao', '第 45 周周报', bj('2026-11-08 22:00'), 'todo', '本周做了什么、学到什么、下周计划。'),
  // 陈默
  P('t-c-1', 'u-chen', 'tt-15', bj('2026-11-06 18:00'), 'submitted'),
  R('r-c-1', 'u-chen', '第 44 周周报', bj('2026-11-04 22:00'), 'passed', '本周做了什么、学到什么、下周计划。'),
  R('r-c-2', 'u-chen', '轻测 · 投放基础', bj('2026-11-03 20:00'), 'passed', '带教人出题，约 20 分钟。'),
  // 孟川
  P('t-m-1', 'u-meng', 'tt-6', bj('2026-11-03 18:00'), 'todo'),
  P('t-m-2', 'u-meng', 'tt-7', bj('2026-11-11 18:00'), 'todo'),
  R('r-m-1', 'u-meng', '第 44 周周报', bj('2026-11-04 22:00'), 'submitted', '本周做了什么、学到什么、下周计划。'),
  // 宋知
  P('t-s-1', 'u-song', 'tt-4', bj('2026-11-07 18:00'), 'doing', 0.6),
  R('r-s-1', 'u-song', '第 44 周周报', bj('2026-11-04 22:00'), 'passed', '本周做了什么、学到什么、下周计划。'),
];

const doc = (t: string) => `https://example.feishu.cn/docx/${t}`;
export const submissions: Submission[] = [
  { id: 'sb-1', taskId: 't-l-2', url: doc('LinK12Research'), at: bj('2026-09-25 21:10') },
  { id: 'sb-2', taskId: 't-l-4', url: doc('LinCourseTeardown'), at: bj('2026-10-09 20:30') },
  { id: 'sb-3', taskId: 't-l-5', url: doc('LinTrialLesson'), at: bj('2026-10-24 17:40') },
  { id: 'sb-4', taskId: 't-l-6', url: doc('LinScriptRecording'), at: bj('2026-11-04 16:50'), note: '5 段录音放在文档里，第 4 段投诉场景有点卡壳。' },
  { id: 'sb-5', taskId: 't-l-7', url: doc('LinCallAttribution'), at: bj('2026-11-04 22:05'), note: '草稿，还差改进建议部分。' },
  { id: 'sb-6', taskId: 't-z-1', url: doc('ZhaoTopics'), at: bj('2026-11-05 09:10') },
  { id: 'sb-7', taskId: 'r-z-1', url: doc('ZhaoWeekly44'), at: bj('2026-11-05 08:30') },
  { id: 'sb-8', taskId: 't-x-1', url: doc('XuTrialLesson'), at: bj('2026-10-10 15:00') },
  { id: 'sb-9', taskId: 't-c-1', url: doc('ChenAdsWeekly'), at: bj('2026-11-05 09:30') },
  { id: 'sb-10', taskId: 'r-m-1', url: doc('MengWeekly44'), at: bj('2026-11-05 07:50') },
];
// 草稿提交不算正式提交：t-l-7 仍是进行中，sb-5 只用于展示历史。

export const reviews: Review[] = [
  { id: 'rv-1', taskId: 't-l-2', submissionId: 'sb-1', mentorId: 'u-zhou', grade: '优秀', comment: '数据来源标得很清楚，结论有自己的判断。', at: bj('2026-09-27 11:00') },
  { id: 'rv-2', taskId: 't-l-4', submissionId: 'sb-2', mentorId: 'u-zhou', grade: '优秀', comment: '结构图画得好，改进点有落地性。', at: bj('2026-10-11 10:30') },
  { id: 'rv-3', taskId: 't-l-5', submissionId: 'sb-3', mentorId: 'u-zhou', grade: '达标', comment: '结构清楚，节奏也稳。下次把学生反馈的数据放到最前面，结论会更有说服力。', at: bj('2026-11-03 15:20') },
  { id: 'rv-4', taskId: 't-x-1', submissionId: 'sb-8', mentorId: 'u-zhou', grade: '优秀', comment: '试讲很有感染力。', at: bj('2026-10-12 10:00') },
];

export const assets: Asset[] = [
  { id: 'a-1', type: 'Skill', title: '通话记录归因', summary: '按问题类型、课程、时段归类一周来电，给出前三大原因和原话样例。', tags: ['客服', '数据整理'], usage: '在 Claude Code 里安装后，把导出的来电记录表格拖进对话，说「按问题类型归因」。', installCmd: 'npx skills add trainee-hub/call-attribution', example: { input: '一周 186 条来电记录（CSV）', output: '前三大原因：调课 34%、退费 21%、上课链接问题 17%，每类附 2 条原话' }, content: '---\nname: call-attribution\ndescription: 把一周来电记录按问题类型、课程、时段归类，输出前三大原因与原话样例。\n---\n\n# 通话记录归因\n\n1. 读取用户提供的来电记录表格\n2. 按「来电问题分类标准」归到 12 个类型\n3. 统计各类型占比，列出前三大原因\n4. 每个原因摘 2 条原话\n', authorId: 'u-chen', version: 'v1.2', submittedAt: bj('2026-11-04 20:00'), updatedAt: bj('2026-11-05 09:00'), status: 'live', baseUses: 21, usedBy: ['u-zhao', 'u-xu'], favBy: ['u-lin'] },
  { id: 'a-2', type: 'Prompt', title: '竞品课程拆解', summary: '输入课程详情页，输出卖点、价格带和差异点。', tags: ['行研', '内容'], usage: '把下面的 Prompt 复制到 Claude，再贴上课程详情页的文字。', example: { input: '某素养课详情页全文', output: '卖点 5 条、价格带、与我们课程的 3 个差异' }, content: '你是一名教育行业分析师。下面是一门课程的详情页。请输出：\n1. 核心卖点（不超过 5 条，每条一句话）\n2. 价格带与促销方式\n3. 与「我们的课程」相比的 3 个差异点\n\n课程详情页：\n{{粘贴到这里}}', authorId: 'u-zhao', version: 'v1.0', submittedAt: bj('2026-11-02 21:00'), updatedAt: bj('2026-11-03 10:00'), status: 'live', baseUses: 14, usedBy: ['u-lin'], favBy: [] },
  { id: 'a-3', type: 'Prompt', title: '客诉话术改写', summary: '把生硬的客服回复改写成有温度、不推卸的版本。', tags: ['客服'], usage: '复制 Prompt，贴上原始回复。', content: '请把下面这段客服回复改写得更有温度：先共情，再说明原因，最后给出明确的下一步。不要推卸责任。\n\n原回复：\n{{粘贴到这里}}', authorId: 'u-zhou', version: 'v1.1', submittedAt: bj('2026-10-20 10:00'), updatedAt: bj('2026-10-22 10:00'), status: 'live', baseUses: 18, usedBy: [], favBy: [] },
  { id: 'a-4', type: '工作流', title: '客服跟岗观察表', summary: '跟岗时按这张表记录，回来直接整理成复盘。', tags: ['客服', '复盘'], usage: '跟岗前在飞书里复制模板，按时段填写。', content: '1. 跟岗前：读客服 SOP，列出想观察的 3 个问题\n2. 跟岗中：每通电话记录类型、时长、处理方式\n3. 跟岗后：当天整理成观察表，标出没处理好的通话', authorId: 'u-zhou', version: 'v1.0', submittedAt: bj('2026-10-18 10:00'), updatedAt: bj('2026-10-18 10:00'), status: 'live', baseUses: 9, usedBy: [], favBy: [] },
  { id: 'a-5', type: 'Skill', title: '行研报告结构检查', summary: '检查行研报告是否覆盖规模、玩家、画像，数据是否都有来源。', tags: ['行研'], usage: '安装后把报告链接发给 Claude。', installCmd: 'npx skills add trainee-hub/research-check', content: '---\nname: research-check\ndescription: 检查行研报告结构完整性与数据来源。\n---\n', authorId: 'u-chen', version: 'v0.9', submittedAt: bj('2026-11-04 19:30'), updatedAt: bj('2026-11-04 19:30'), status: 'pending', baseUses: 0, usedBy: [], favBy: [] },
  { id: 'a-6', type: 'Skill', title: '销售跟进话术生成', summary: '根据客户上次的反馈，生成下一次跟进的开场和问题。', tags: ['销售'], usage: '安装后贴上客户上次的反馈。', installCmd: 'npx skills add trainee-hub/sales-followup', content: '---\nname: sales-followup\ndescription: 生成销售跟进话术。\n---\n', authorId: 'u-xu', version: 'v1.0', submittedAt: bj('2026-11-03 18:00'), updatedAt: bj('2026-11-03 18:00'), status: 'pending', baseUses: 0, usedBy: [], favBy: [] },
  { id: 'a-7', type: 'Prompt', title: '家长沟通开场白', summary: '第一次和家长电话沟通时的开场白模板。', tags: ['教学', '客服'], usage: '复制后替换孩子姓名和课程名。', content: '您好，我是{{孩子姓名}}的{{课程名}}老师……', authorId: 'u-meng', version: 'v1.0', submittedAt: bj('2026-11-05 08:00'), updatedAt: bj('2026-11-05 08:00'), status: 'pending', baseUses: 0, usedBy: [], favBy: [] },
  { id: 'a-8', type: '用例', title: '一晚上拆完 30 份竞品详情页', summary: '用「竞品课程拆解」Prompt 批量跑 30 份详情页，再让 Claude 汇总成对比表。', tags: ['行研', 'AI'], usage: '先跑单份，确认输出稳定后再批量。', authorId: 'u-zhao', version: 'v1.0', submittedAt: bj('2026-11-01 22:00'), updatedAt: bj('2026-11-02 09:00'), status: 'live', baseUses: 6, usedBy: [], favBy: [] },
];

export const feed: FeedItem[] = [
  { id: 'f-1', actorId: 'u-chen', text: '上架了 Skill「通话记录归因」', at: bj('2026-11-05 09:00') },
  { id: 'f-2', actorId: 'u-xu', text: '通过了「通识」阶段评估', at: bj('2026-11-04 17:00') },
  { id: 'f-3', actorId: 'u-zhao', text: '上架了 Prompt「竞品课程拆解」', at: bj('2026-11-03 10:00') },
  { id: 'f-4', actorId: 'u-chang', text: '发布了公告「11 月分享会安排」', at: bj('2026-11-03 09:30') },
  { id: 'f-5', actorId: 'u-zhao', text: '分享了用例「一晚上拆完 30 份竞品详情页」', at: bj('2026-11-02 09:00') },
];

export const announcements: Announcement[] = [
  { id: 'an-1', title: '11 月分享会安排', body: '11.12 周三 19:30，陈默主讲「用 Claude 做行业研究」。请大家带上手头的行研题目。', at: bj('2026-11-03 09:30'), readBy: 8 },
];

export const nextEvent = { title: '分享会：用 Claude 做行业研究', startAt: bj('2026-11-12 19:30'), place: '3 楼大会议室 / 飞书会议', speakerId: 'u-chen' };

export const calendar: CalendarItem[] = [
  { id: 'c-1', ownerId: 'u-zhou', title: '林夏 · 客服岗跟岗', startAt: bj('2026-11-05 09:30'), endAt: bj('2026-11-05 11:30') },
  { id: 'c-2', ownerId: 'u-zhou', title: '与林夏 1:1', startAt: bj('2026-11-05 16:00'), endAt: bj('2026-11-05 16:30') },
  { id: 'c-3', ownerId: 'u-zhou', title: '轻测出题截止', startAt: bj('2026-11-05 18:00'), endAt: bj('2026-11-05 18:00') },
  { id: 'c-4', ownerId: 'u-zhou', title: '许诺 · 销售岗陪访', startAt: bj('2026-11-06 14:00'), endAt: bj('2026-11-06 16:00') },
];

export const resources: Resource[] = [
  { id: 'rs-1', title: '客服 SOP（第 3 版）', source: '管培生知识库', moduleId: 'm-kf', updatedAt: bj('2026-10-21 10:00') },
  { id: 'rs-2', title: '来电问题分类标准', source: '管培生知识库', moduleId: 'm-kf', updatedAt: bj('2026-10-12 10:00') },
  { id: 'rs-3', title: '复盘要写多长？', source: 'FAQ · 周颖 回答', moduleId: 'm-kf', updatedAt: bj('2026-10-30 10:00') },
  { id: 'rs-4', title: '销售 CRM 使用指南', source: '管培生知识库', moduleId: 'm-xs', updatedAt: bj('2026-10-02 10:00') },
];

export const botStatus = [
  { name: '带教机器人', detail: '接口调用正常 · 今日 46 次', at: bj('2026-11-05 10:20'), level: 'ok' as const },
  { name: '飞书 · 管培生知识库', detail: '二期接入', at: null, level: 'off' as const },
  { name: '多维表格迁移', detail: '过渡期 · 只读归档定于 12.01', at: null, level: 'warn' as const },
];
