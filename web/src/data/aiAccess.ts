// AI 接入（PRD 第 15 节，全局规则 P-13）：管理后台「AI 与接入」页读的配置。
// 本节、PRD 第 15 节、AGENTS.md「AI 接入」三处内容一致；改这里时三处一起改（aiAccess.test.ts 会查功能名）。
// 工作台自己不调用 AI，所以这里只有说明性的配置，没有可切换项。

/** 执行方状态（P-13 统一用词）；「未启用」= 工作台还没有功能调用它 */
export type ExecutorStatus = '可用' | '未安装' | '未登录' | '额度用尽' | '未启用';
/** 接入方式只有五种（P-13） */
export type AccessMode = '本机 CLI' | '官方 API' | '网页桥' | 'Hermes 派单' | 'MCP 开放';

export type AiExecutor = { id: 'claude' | 'codex'; name: string; /** 两个字母的标记，页面上当图标用 */ mark: string; status: ExecutorStatus; plannedAccess: AccessMode; checkedAt: string | null };

/** 默认执行方：null = 本应用当前不调用 AI，页面不出切换按钮 */
export const AI_DEFAULT_EXECUTOR: AiExecutor['id'] | null = null;

export const AI_EXECUTORS: AiExecutor[] = [
  { id: 'claude', name: 'Claude', mark: 'Cl', status: '未启用', plannedAccess: '官方 API', checkedAt: null },
  { id: 'codex', name: 'Codex', mark: 'Cx', status: '未启用', plannedAccess: '官方 API', checkedAt: null },
];

/** 链路上的一段：主文字 + 补充；outside = 发生在工作台外（机器人里） */
export type AiFlowStep = { main: string; note: string; outside?: boolean };

export type AiFeature = {
  id: 'reco' | 'faq' | 'feedback' | 'summary' | 'quiz';
  name: string;
  where: string;
  phase: '一期' | '二期';
  /** true = 产出由 AI 生成（哪怕 AI 在工作台外） */
  aiOutput: boolean;
  what: string;
  read: AiFlowStep;
  exec: AiFlowStep;
  write: AiFlowStep;
  who: AiFlowStep;
  access: string;
  trace: string;
  now: string;
  switchNote: string;
};

export const AI_FEATURES: AiFeature[] = [
  {
    id: 'reco', name: '这一步可以用 · 推荐 AI 资产', where: '首页、任务详情', phase: '一期', aiOutput: false,
    what: '按规则挑：先取任务模板上挂的推荐资产；没有时取使用人数最多的上架资产。不调用 AI。',
    read: { main: '任务模板的推荐资产', note: '加上资产使用记录' },
    exec: { main: '规则', note: '不调用 AI' },
    write: { main: '只在页面上显示', note: '不存' },
    who: { main: '本人', note: '只看自己正在做的任务' },
    access: '无', trace: '不需要（不是 AI 产出）', now: '可用（一期）', switchNote: '无可切换项',
  },
  {
    id: 'faq', name: '答疑答案草稿', where: '培养成长 · 带教答疑', phase: '一期', aiOutput: true,
    what: '亚古兽从管培生日志取提问并起草答案，经接口写入；带教审核后，亚古兽挂回飞书原话。AI 调用发生在亚古兽里。',
    read: { main: '亚古兽自己读飞书日志', note: '工作台只提供工作上下文', outside: true },
    exec: { main: '亚古兽', note: '常浩的企业分身；底层模型在其 Hermes 配置里切换', outside: true },
    write: { main: 'qa_record', note: '每版答案带留痕' },
    who: { main: '提问人、带教', note: '已收录的进 Q&A 合集后全员可见，显示「由亚古兽生成 · 某人审核」' },
    access: 'Hermes 派单：亚古兽凭接口密钥写入',
    trace: '执行方、接入方式、模型、生成时间、审核人；缺执行方的接口拒收',
    now: '未上线（PRD v2.1 D 阶段）；密钥未配置', switchNote: '在亚古兽的 Hermes 配置里切换，本页不可切',
  },
  {
    id: 'feedback', name: '带教反馈草稿', where: '培养成长 · 评审', phase: '二期', aiOutput: true,
    what: '常浩在飞书私聊亚古兽起草追问和反馈，经接口写入草稿，常浩审核后才进评审或下一步行动。',
    read: { main: '亚古兽自己读飞书日志', note: '工作台只提供工作上下文', outside: true },
    exec: { main: '亚古兽', note: '常浩的企业分身', outside: true },
    write: { main: '草稿', note: '不直接生效' },
    who: { main: '带教', note: '审核后才对管培生可见' },
    access: 'Hermes 派单：亚古兽凭接口密钥写入',
    trace: '执行方、接入方式、模型、生成时间、审核人；缺执行方的接口拒收',
    now: '未上线（试点后再定）', switchNote: '在亚古兽的 Hermes 配置里切换，本页不可切',
  },
  {
    id: 'summary', name: '资料卡片摘要', where: '知识 · 资料库', phase: '二期', aiOutput: false,
    what: '同步飞书知识库时截取文档开头一段，不改写；管理员可人工改写。不调用 AI。',
    read: { main: '飞书文档', note: '只取开头一段' },
    exec: { main: '规则', note: '截取，不改写' },
    write: { main: 'resource_card', note: '摘要字段' },
    who: { main: '公开', note: '正文权限由飞书判断' },
    access: '无', trace: '不需要（不是 AI 产出）', now: '未上线（二期）', switchNote: '无可切换项',
  },
  {
    id: 'quiz', name: '轻测', where: '成长 · 考核', phase: '二期', aiOutput: false,
    what: '题目留在机器人里（是否由 AI 出题由机器人项目定），工作台只存成绩；未作答记「未答」。',
    read: { main: '无', note: '工作台不提供题目' },
    exec: { main: '带教机器人', note: '出题、收答案、写回成绩；工作台不调用 AI', outside: true },
    write: { main: 'quiz_result', note: '成绩或「未答」' },
    who: { main: '本人、主带教、管理员', note: '考核可见范围' },
    access: '对外开放：机器人写成绩', trace: '不需要（成绩不是 AI 产出）', now: '未上线（二期）', switchNote: '无可切换项',
  },
];

/** 对外开放：外部程序连进来读写（PRD 第 10 节）。密钥只显示「已配置 / 未配置」 */
export type AiOpenApi = {
  name: string; to: string; kind: string;
  keyConfigured: boolean; issuedAt: string | null; lastCalledAt: string | null;
  canRead: string[]; canWrite: string[]; closeHow: string;
};
export const AI_OPEN_APIS: AiOpenApi[] = [
  {
    name: '带教机器人接口', to: '亚古兽（常浩的企业分身）', kind: 'HTTP 接口，不是 MCP',
    keyConfigured: false, issuedAt: null, lastCalledAt: null,
    canRead: ['成员与角色', '个人路径与当前任务', '即将到期和已逾期的任务', '某人今天的日程', '某位带教的待点评', '待推送的提醒'],
    canWrite: ['答疑记录与答案草稿（须带留痕）', '送达回执', '以后：提交记录、周报、轻测成绩'],
    closeHow: '本页「吊销」，立即失效',
  },
];

/** 数据对象：只展示，不是 AI 替工作台产出的，不进切换 */
export const AI_DATA_OBJECTS: { name: string; source: string; aiOutput: false }[] = [
  { name: 'AI 资产库', source: '人工贡献，管理员审核', aiOutput: false },
  { name: 'Tidings 入口', source: '外部站点，只跳转，不取数据', aiOutput: false },
];
