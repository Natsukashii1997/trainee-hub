# -*- coding: utf-8 -*-
"""管培生工作台结构重排：分析留痕脚本。
只读项目仓库与走查文件，输出 coverage.md（报告里的数字都从这里来）。
运行：python3 -I analysis.py
"""
import re, os, datetime as dt
from collections import Counter, defaultdict

REPO = '/Users/nat/Documents/ChatGPT/个人/work/trainee-hub'
HERE = os.path.dirname(os.path.abspath(__file__))
ROLES = os.path.join(HERE, '..', 'roles')
MOCK = open(f'{REPO}/web/src/data/mock.ts', encoding='utf-8').read()
PRD = open(f'{REPO}/docs/PRD.md', encoding='utf-8').read().split('\n')
BJ = dt.timezone(dt.timedelta(hours=8))
def bj(s): return dt.datetime.strptime(s, '%Y-%m-%d %H:%M').replace(tzinfo=BJ)
NOW = bj('2026-11-05 10:24')   # mock.ts:10

out = []
def P(*a): out.append(' '.join(str(x) for x in a))

# ---------------------------------------------------------------- 1. PRD 第 3 节页面 × 原型 × 新结构
# (板块, 页面, PRD 行, 原型现状, 原型依据, 新结构处置, 说明, 期次(新), 原型图)
PAGES = [
 ('全局','全局搜索','L37','未做','PRD 二期 L173','保留','二期不变','二期','—'),
 ('全局','通知中心','L37','未做','铃铛提示「二期上线」Layout.tsx:105','修订','补「事件→通知」规则表；PRD 分期表未列，定为二期','二期','—'),
 ('首页','我的今天（按角色）','L38','部分','三角色已做；带教「本周带教安排」写死 Home.tsx:197；管理员连接状态、公告占位 Home.tsx:285,289','修订','焦点=待办前两条（规则挑）；加「本周」日程切片；带教按在带/将到/刚交接三组；管理员加本周排期与点评积压','一期','P1 P2'),
 ('首页','团队动态','L38','部分','动态是写死文本 mock.ts:174-180，types.ts:86 只有 text','修订','改为事件日志的公开投影','一期','—'),
 ('成长','路径总览（模板）','L39','已做','main.tsx:25','保留','不变','一期','—'),
 ('成长','我的路径与进度','L39','已做','main.tsx:26','修订','进度给两个数（时间、完成）；站分「时间位置」和「结清」两字段','一期','P1'),
 ('成长','任务详情','L39','已做','main.tsx:27','修订','周期任务按完成方式出按钮；再交并排上次评语；需修改给修改截止；带教=本站带教','一期','—'),
 ('成长','带教看板','L39','已做','main.tsx:28；按 user.mentorId 取人 api.ts:186','修订','按站带教关系取人，分三组；只管人和进度（列：本站进度、待我做、上一站要点），时间切面在日程「我带的人」','一期','P2'),
 ('成长','轮岗日历','L39 L66','未做','成长页签无此项 Growth.tsx:10-14；分期表 L172-174 未列','修订','改名「轮岗排期」，放进日程（甘特，按人/按岗位/按带教），成长保留深链','一期','P3'),
 ('成长','考核·轻测记录','L39','未做','二期 L173','修订','轻测=测验型周期任务，成绩由机器人写回，未答不判逾期','二期','P7'),
 ('成长','考核·阶段评估','L39','未做','二期 L173','修订','轮岗阶段由主带教依据各站站评汇总；评估节点一期先上甘特','二期','P3'),
 ('成长','考核·答辩材料包','L39','未做','二期 L173','修订','移到个人档案（PRD L80 原文即「从个人档案一键汇总」），加完整度检查','二期','—'),
 ('知识','资料库','L40','占位','Misc.tsx:21','保留','二期不变','二期','—'),
 ('知识','FAQ','L40','占位','Misc.tsx:21','保留','二期不变','二期','—'),
 ('知识','作品集（列表+详情）','L40','占位','Misc.tsx:21','保留','二期；提名人另定','二期','—'),
 ('AI','AI 首页','L41','已做','main.tsx:29','保留','不变','一期','—'),
 ('AI','资产库','L41','已做','main.tsx:30','保留','不变','一期','—'),
 ('AI','资产详情','L41','已做','main.tsx:31','保留','不变','一期','—'),
 ('AI','提交资产','L41','已做','main.tsx:32','保留','不变','一期','—'),
 ('AI','AI 学习路径','L41','占位','AI.tsx:42 占位卡','保留','三期不变','三期','—'),
 ('AI','用例墙','L41','未做','三期 L174','保留','三期不变','三期','—'),
 ('团队','成员列表','L42','已做','main.tsx:33','保留','不变','一期','—'),
 ('团队','个人档案','L42','部分','main.tsx:34；无成长时间线','修订','成长时间线=事件日志按人投影；加交接卡；答辩材料包入口','一期','P6'),
 ('团队','公告与动态','L42','未做','二期 L173','保留','二期不变（动态来源已在「团队动态」行修订）','二期','—'),
 ('团队','活动','L42','未做','首页一张写死活动卡 mock.ts:186','修订','列表+月历（=日程「团队活动」视角深链），读共享「管培生活动」日历','二期','P4'),
 ('团队','周报汇总','L42','未做','二期 L173','保留','二期不变；周报只在机器人交，这里只看交没交','二期','—'),
 ('激励','贡献榜（月榜、总榜）','L43','占位','Misc.tsx:22','保留','三期不变','三期','—'),
 ('激励','我的积分明细','L43','占位','Misc.tsx:22','保留','三期不变','三期','—'),
 ('激励','兑换商城','L43','占位','Misc.tsx:22','保留','三期不变','三期','—'),
 ('激励','我的兑换申请','L43','占位','Misc.tsx:22','保留','三期不变','三期','—'),
 ('后台','成员与角色','L44','已做','main.tsx:37','修订','带教权限由站带教关系的起止推出；新人由期次预置名单直接成为管培生','一期','P8'),
 ('后台','路径模板编辑','L44','已做','main.tsx:38','修订','模板加版本号；任务加「截止规则（锚点站开始或站结束 + 偏移工作日）」；周期任务拆到单独的规则页','一期','P7'),
 ('后台','个人路径分配','L44','已做','main.tsx:39；调整不重排任务 api.ts:106','删除（并入）','并入轮岗排期甘特的编辑抽屉；调整触发未开始任务截止重排','一期','P3'),
 ('后台','审核队列（资产、资料、作品集）','L44','部分','只有资产 main.tsx:36','修订','归入后台「待处理」组（=管理员待办）','一期','P5'),
 ('后台','公告发布','L44','占位','Misc.tsx:23','保留','二期不变','二期','—'),
 ('后台','积分规则与加权','L44','占位','Misc.tsx:23','保留','三期不变','三期','—'),
 ('后台','兑换处理','L44','占位','Misc.tsx:23','保留','三期不变','三期','—'),
 ('后台','标签维护','L44','占位','Misc.tsx:23','保留','二期不变','二期','—'),
 ('后台','知识库同步设置','L44','占位','Misc.tsx:23','保留','二期不变','二期','—'),
 ('后台','机器人接口密钥','L44','占位','PRD 一期 L172「机器人接口」，原型放在二/三期占位页 Misc.tsx:23','保留','一期补做（原型漏做）','一期','—'),
]
NEW = [
 ('日程 · 我的本周','管培生默认视角：站、换站、截止、周报、轻测、团队活动排在一条周时间线上；跟岗、1:1 二期叠加','一期（推算部分）','P1','T-01 T-03；ontology 5.2'),
 ('日程 · 我带的人','带教多人周视图：行=在带/将到的人，列=天，单元=截止、提交、点评期限、换站；我的飞书日程二期叠加','一期（推算部分）','P2','M-10 M-11；ontology 5.2'),
 ('待办（顶栏入口）','我负责的全部待办，按期限排；首页焦点=前两条；后台「待处理」组=管理员待办','一期','P5','ontology 第 4 节；A-07 A-14'),
 ('后台 · 周期任务规则','周报、轻测、月度物料、日报：频率、截止时刻、适用阶段、完成方式','一期','P7','ontology 1.2；T-07；issue #6'),
 ('后台 · 期次与期次启动','建期次、选模板版本、预置成员名单、设开学日、生成轮岗矩阵、分配站带教、甘特预览、发布','一期（最简向导）','P8','A-02 T-11'),
 ('交接要点（站末填写 + 档案交接卡）','站末由本站带教写，最多 3 条，给下一站带教和管理员看','一期','P6','M-04 A-17'),
 ('后台 · 工作日日历','法定假期与调休，排期和截止推算用','一期','设置页一期另出（P3 只画了假期灰带）','A-09 T-12'),
 ('后台 · 汇报','按期次、时间范围出数，导出飞书文档（推演，待常浩确认）','二期','—','A-12'),
]

P('# 分析留痕：PRD 页面 × 原型 × 新结构')
P('')
P('- 生成方式：`python3 -I analysis.py`（同目录）。只读项目仓库与走查文件。')
P(f'- 演示时刻：{NOW:%Y-%m-%d %H:%M}（北京时间，mock.ts:10）。原型里的人名、日期都是示例数据（mock.ts:1），下文代入只用来验证规则算得通，不当业务事实。')
P('- 依据分级：「PRD Lnn」= PRD 原文行号；「文件:行」= 原型现状；「推演」= 走查推演，待常浩确认。')
P('')
P('## 1. PRD 第 3 节页面逐页对照')
P('')
P('| # | 板块 | PRD 页面 | PRD 行 | 原型现状 | 原型依据 | 新结构 | 说明 | 期次（新） | 原型图 |')
P('|---|---|---|---|---|---|---|---|---|---|')
for i, r in enumerate(PAGES, 1):
    P(f'| {i} | ' + ' | '.join(r) + ' |')
proto = Counter(r[3] for r in PAGES); disp = Counter(r[5] for r in PAGES)
P('')
P(f'- PRD 第 3 节页面数：**{len(PAGES)}**（L37–44 按「、」逐项拆；「考核」按括号拆成 3 页）。')
P(f'- 原型现状：已做 **{proto["已做"]}**，部分 **{proto["部分"]}**，占位 **{proto["占位"]}**，未做 **{proto["未做"]}**。')
P(f'- 新结构处置：保留 **{disp["保留"]}**，修订 **{disp["修订"]}**，删除（并入）**{disp["删除（并入）"]}**；另新增 **{len(NEW)}** 页（第 2 节）。')
ph = Counter(r[7] for r in PAGES)
P(f'- 新结构下 PRD 原有页面的期次：一期 {ph["一期"]}，二期 {ph["二期"]}，三期 {ph["三期"]}。')
P('')
P('## 2. 新增页面（PRD 第 3 节没有）')
P('')
P('| # | 页面 | 职责 | 期次 | 原型图 | 来源 |')
P('|---|---|---|---|---|---|')
for i, r in enumerate(NEW, 1):
    P(f'| N{i} | ' + ' | '.join(r) + ' |')
newph = Counter(('一期' if r[2].startswith('一期') else r[2]) for r in NEW)
P('')
P(f'- 新增 {len(NEW)} 页：一期 {newph["一期"]}，二期 {newph["二期"]}。')

# ---------------------------------------------------------------- 3. 本体对象计数
PRD_ENT = []
for ln in PRD[127:146]:   # L128–L146
    PRD_ENT += re.findall(r'`([a-z_]+)`', ln.split('|')[1])
MOD = ['team','user','path_template','task_template','personal_path','personal_module','task_instance','submission',
       'quiz_result','stage_assessment','weekly_report','event','activity_feed','contribution']
NEWOBJ = ['cohort','recurring_rule','handover_note','event_log','todo','notification','workday_calendar']
VIEWOBJ = ['schedule_item']
KEEP = [e for e in PRD_ENT if e not in MOD]
P('')
P('## 3. 本体对象计数')
P('')
P(f'- PRD 第 9 节实体表：{len(PRD[127:146])} 行（L128–L146），{len(PRD_ENT)} 个实体名：{", ".join(PRD_ENT)}。')
P(f'- 保留 **{len(KEEP)}**：{", ".join(KEEP)}。')
P(f'- 修订 **{len(MOD)}**：{", ".join(MOD)}（event 改名 team_event；activity_feed 不再单存，改为 event_log 公开投影；contribution 由事件派生）。')
P(f'- 新增 **{len(NEWOBJ)}**：{", ".join(NEWOBJ)}；另有查询视图 {", ".join(VIEWOBJ)}（接口返回结构，不建表、不计数）。合计 {len(PRD_ENT)+len(NEWOBJ)} 个对象。')
assert len(KEEP) + len(MOD) == len(PRD_ENT), '修订+保留 应等于 PRD 实体数'
P(f'- 时间字段：PRD 有个人路径与站的起止（L131）、任务截止（L132）、周报周次（L136）、活动日历 id（L143）——轮岗排期的数据已经够；缺的是任务开放日、安排类日程（跟岗、1:1、答辩）、点评与交接期限、工作日口径。')

# ---------------------------------------------------------------- 4. 走查编号与拍板来源
def ids(fn, pat):
    s = open(os.path.join(ROLES, fn), encoding='utf-8').read()
    return sorted(set(re.findall(pat, s)), key=lambda x: int(re.sub(r'\D', '', x)))
T = ids('trainee.md', r'\bT-\d\d\b'); M = ids('mentor.md', r'\bM-\d\d\b'); A = ids('admin-colleague.md', r'\bA-\d\d\b')
E = ids('ontology.md', r'\| (E\d\d) \|'); Q = ids('ontology.md', r'\| (Q\d\d?) \|')
P('')
P('## 4. 走查材料计数')
P('')
P(f'- 管培生缺口 T：{len(T)} 条（{T[0]}…{T[-1]}）；带教缺口 M：{len(M)} 条（{M[0]}…{M[-1]}）；管理员与同事缺口 A：{len(A)} 条（{A[0]}…{A[-1]}）；合计 {len(T)+len(M)+len(A)} 条。')
P(f'- 本体事件 E：{len(E)} 个（{E[0]}…{E[-1]}）；本体待拍板 Q：{len(Q)} 项。')
SRC = {'ontology Q1–Q12': 12, 'trainee 第 6 节': 5, 'mentor 第 6 节 Q1–Q5': 5, 'admin 第 6 节 问题 1–5': 5}
P(f'- 四份走查的拍板问题合计 {sum(SRC.values())} 条（' + '、'.join(f'{k} {v}' for k, v in SRC.items()) + '），合并去重为 **10** 条，其余 6 项列为「可推迟到对应期次再定」。')
MERGE = [
 ('B1 带教关系挂在哪一层', 'ontology Q1；mentor Q1；admin 问题2 前半；trainee 4'),
 ('B2 跨站可见性', 'ontology Q2、Q8；mentor Q2；admin 问题2 后半'),
 ('B3 站评与交接要点、轮岗阶段评估谁出', 'ontology Q3；mentor Q3'),
 ('B4 点评范围、时效与周期任务完成方式', 'mentor Q4；ontology Q12；trainee Q16（自问自答）'),
 ('B5 任务时间规则：开放日、修改截止、改期、工作日', 'ontology Q4、Q5；trainee（T-12、T-14）；admin（A-08、A-09）'),
 ('B6 日程范围与飞书日历', 'ontology Q6、Q7；trainee 1；mentor Q5 后半；admin 问题5'),
 ('B7 轮岗排期放一期、做到哪', 'ontology Q9 前半；trainee 2；mentor Q5 前半；admin 问题3'),
 ('B8 顶栏加「日程」「待办」，通知中心期次', 'ontology Q10、Q9 后半'),
 ('B9 主指标口径', 'admin 问题1；trainee 3'),
 ('B10 期次对象与新人预置', 'admin 问题4；trainee 5'),
]
P('')
P('| 合并后 | 来源 |'); P('|---|---|')
for a, b in MERGE: P(f'| {a} | {b} |')
P('')
P('可推迟（不进 10 条）：作品集由谁提名（ontology Q11，二期定）；资产上架后改版是否重审（ontology 3.6）；站评是否含「推荐定岗到本线」（mentor 自问自答 Q28）；1:1 结论是否沉淀（T-20）；结业后身份（T-21）；代理带教（M-21）。')

# ---------------------------------------------------------------- 5. 示例数据代入
def parse_tasks():
    rows = []
    for m in re.finditer(r"P\('([^']+)', '([^']+)', '([^']+)', bj\('([^']+)'\), '([a-z]+)'", MOCK):
        tid, uid, tpl, due, st = m.groups(); rows.append(dict(id=tid, user=uid, kind='path', tpl=tpl, due=bj(due), status=st))
    for m in re.finditer(r"R\('([^']+)', '([^']+)', '([^']+)', bj\('([^']+)'\), '([a-z]+)'", MOCK):
        tid, uid, name, due, st = m.groups(); rows.append(dict(id=tid, user=uid, kind='recurring', name=name, due=bj(due), status=st))
    return rows
TASKS = parse_tasks()
SUBS = [dict(id=a, task=b, at=bj(c)) for a, b, c in re.findall(r"\{ id: '(sb-\d+)', taskId: '([^']+)', url: [^,]+, at: bj\('([^']+)'\)", MOCK)]
NAMES = dict(re.findall(r"\{ id: '(u-[a-z]+)', name: '([^']+)'", MOCK))
TPLN = dict(re.findall(r"T\('(tt-\d+)', '[^']+', '([^']+)'", MOCK))
tname = lambda t: TPLN.get(t.get('tpl'), t.get('name'))
P('')
P('## 5. 示例数据代入（只验证规则算得通，不是业务数据）')
P('')
P(f'- 解析到任务实例 {len(TASKS)} 条（路径 {sum(t["kind"]=="path" for t in TASKS)}，周期 {sum(t["kind"]=="recurring" for t in TASKS)}），提交 {len(SUBS)} 条。')

# 5.1 旧算法：按时提交率（api.ts:200-206）
mon = (NOW - dt.timedelta(days=NOW.weekday())).replace(hour=0, minute=0)
wk = (mon, mon + dt.timedelta(days=7))
due = [t for t in TASKS if wk[0] <= t['due'] < wk[1] and t['due'] <= NOW]
def subs_of(tid): return [s for s in SUBS if s['task'] == tid]
ontime = [t for t in due if any(s['at'] <= t['due'] for s in subs_of(t['id'])) or (t['status'] == 'passed' and not subs_of(t['id']))]
old_rate = round(len(ontime) / len(due) * 100)
P('')
P(f'### 5.1 旧口径「按时提交率」（照 api.ts:200-206 复算，第 45 周 {wk[0]:%m-%d}–{(wk[1]-dt.timedelta(days=1)):%m-%d}，截至演示时刻）')
P('')
P(f'- 分母 {len(due)} 条（含周期任务 {sum(t["kind"]=="recurring" for t in due)} 条）：' + '、'.join(f'{t["id"]}' for t in due))
P(f'- 分子 {len(ontime)} 条：' + '、'.join(t['id'] for t in ontime) + f'；其中 {sum(1 for t in ontime if not subs_of(t["id"]))} 条没有任何提交记录、因状态是「已通过」被算作按时（api.ts:204 第二个条件）。')
P(f'- 结果 **{old_rate}%**。')

# 5.2 新口径：路径任务按期达标率，滚动 4 周
win = (mon - dt.timedelta(days=21), mon + dt.timedelta(days=7))
cand = [t for t in TASKS if t['kind'] == 'path' and win[0] <= t['due'] < win[1] and t['due'] <= NOW]
ok = [t for t in cand if t['status'] == 'passed' and subs_of(t['id']) and min(s['at'] for s in subs_of(t['id'])) <= t['due']]
pending = [t for t in cand if t['status'] in ('submitted', 'revise')]
fail = [t for t in cand if t not in ok and t not in pending]
P('')
P(f'### 5.2 新口径「路径任务按期达标率」（滚动 4 周 {win[0]:%m-%d}–{(win[1]-dt.timedelta(days=1)):%m-%d}，截至演示时刻）')
P('')
P(f'- 候选（截止已过的路径任务）{len(cand)} 条：' + '、'.join(f'{t["id"]}({tname(t)})' for t in cand))
P(f'- 按期达标 {len(ok)}：' + '、'.join(t['id'] for t in ok) + f'；待定（已提交未点评，或需修改还没最终结论，不进分母）{len(pending)}：' + '、'.join(t['id'] for t in pending) + f'；未达标或逾期 {len(fail)}：' + '、'.join(t['id'] for t in fail))
P(f'- 结果 **{len(ok)} / {len(ok)+len(fail)}**，待定 {len(pending)}。样本很小，这正是要并列显示 n/N 的原因（admin 问 7）。')
NEWM = (len(ok), len(ok) + len(fail), len(pending))

# 5.3 轮岗排期：按岗位的每段人数
ROT = re.search(r"const ROT = \[([^\]]+)\]", MOCK).group(1).replace("'", '').replace(' ', '').split(',')
END = re.search(r"const END = \[([^\]]+)\]", MOCK).group(1).replace("'", '').replace(' ', '').split(',')
PATHS = re.findall(r"path\('(u-[a-z]+)', \[([^\]]+)\]\)", MOCK)
MODN = dict(re.findall(r"\{ id: '(m-[a-z]+)', stageId: 's3', name: '([^']+)'", MOCK))
LINE = dict(re.findall(r"\{ id: '(m-[a-z]+)', stageId: 's3', name: '[^']+', line: '([^']+)'", MOCK))
occ = []
P('')
P('### 5.3 轮岗排期：每段每个岗位有几人（示例个人路径 mock.ts:83-88）')
P('')
P('| 段 | 起止 | ' + ' | '.join(MODN[m] for m in MODN) + ' |'); P('|---|---|' + '---|' * len(MODN))
for i in range(6):
    c = defaultdict(list)
    for uid, order in PATHS:
        mods = order.replace("'", '').replace(' ', '').split(',')
        c[mods[i]].append(NAMES[uid])
    occ.append(c)
    P(f'| {i+1} | {ROT[i]}–{END[i]} | ' + ' | '.join(f'{len(c[m])}（{"、".join(c[m])}）' if c[m] else '0' for m in MODN) + ' |')
crowd = [(i+1, MODN[m]) for i, c in enumerate(occ) for m in MODN if len(c[m]) >= 2]
empty = [(i+1, MODN[m]) for i, c in enumerate(occ) for m in MODN if len(c[m]) == 0]
P('')
P(f'- 同一段同一岗位 2 人的格子 **{len(crowd)}** 个：' + '、'.join(f'第{a}段{b}' for a, b in crowd))
P(f'- 空岗格子 **{len(empty)}** 个：' + '、'.join(f'第{a}段{b}' for a, b in empty))
P(f'- 6 人全部在同一天换站（ROT 共用一组日期 mock.ts:68）：换站日 ' + '、'.join(ROT) + '。')
GANTT_CROWD, GANTT_EMPTY = len(crowd), len(empty)

# 5.4 工作日推算（只按周末判断；法定假期需工作日日历）
def add_wd(d, n):
    while n > 0:
        d += dt.timedelta(days=1)
        if d.weekday() < 5: n -= 1
    return d
def sub_wd(d, n):
    while n > 0:
        d -= dt.timedelta(days=1)
        if d.weekday() < 5: n -= 1
    return d
sw = bj('2026-11-12 09:00'); pre = sub_wd(sw, 5)
s4 = [s for s in SUBS if s['id'] == 'sb-4'][0]; rv_due = add_wd(s4['at'], 2)
P('')
P('### 5.4 规则代入（阈值都是建议值）')
P('')
P(f'- 换站提醒「开站前 5 个工作日」：林夏、许诺、赵一然等 11-12 开站 → 提醒日 **{pre:%m-%d}**（周{"一二三四五六日"[pre.weekday()]}），正好是演示当天。')
P(f'- 点评时效「提交后 2 个工作日」：林夏「话术演练录音」{s4["at"]:%m-%d %H:%M} 提交（sb-4）→ 点评期限 **{rv_due:%m-%d %H:%M}**（周{"一二三四五六日"[rv_due.weekday()]}）；演示时刻剩 {(rv_due-NOW).days} 天 {(rv_due-NOW).seconds//3600} 小时。')
weekend_due = [t for t in TASKS if t['due'].weekday() >= 5 and t['kind'] == 'path']
P(f'- 截止落在周末的路径任务：' + '、'.join(f'{t["id"]} {tname(t)} {t["due"]:%m-%d}（周{"一二三四五六日"[t["due"].weekday()]}）' for t in weekend_due) + '（工作日日历上线后由规则处理）。')
lin = [t for t in TASKS if t['user'] == 'u-lin' and wk[0] <= t['due'] < wk[1] + dt.timedelta(days=7)]
P(f'- 林夏第 45–46 周的截止：' + '、'.join(f'{tname(t)} {t["due"]:%m-%d %H:%M} {t["status"]}' for t in sorted(lin, key=lambda x: x['due'])))
start = bj('2026-09-10 09:00'); day = (NOW.date() - start.date()).days + 1
P(f'- 林夏培养第 **{day}** / 180 天（api.ts:59-64 口径，180 = 7+14+84+75，mock.ts:26-29）。')

# 5.5 待点评队列：旧（按 task.mentorId=周颖 且 status=submitted）vs 新（本站带教 + 只评路径任务）
USER_M = dict(re.findall(r"\{ id: '(u-[a-z]+)', name: '[^']+', color: '[^']+', role: 'trainee', team: '[^']+', joinedAt: bj\('[^']+'\), mentorId: '(u-[a-z]+)'", MOCK))
old_q = [t for t in TASKS if t['status'] == 'submitted' and USER_M.get(t['user']) == 'u-zhou']
# 新：周颖=客户线（客服、销售）站带教（示意）；任务归属=任务所属站的带教；周期任务不评
TPL_MOD = dict(re.findall(r"T\('(tt-\d+)', '(m-[a-z]+)'", MOCK))
new_q = [t for t in old_q if t['kind'] == 'path' and TPL_MOD.get(t['tpl']) in ('m-kf', 'm-xs')]
P('')
P('### 5.5 带教人「待点评」队列（周颖视角）')
P('')
P(f'- 旧（原型 api.ts:176-182，按任务上的 mentorId；示例里周颖是 3 位管培生的固定带教）：**{len(old_q)}** 条：' + '、'.join(f'{NAMES[t["user"]]}·{tname(t)}' for t in old_q))
P(f'- 新（假设周颖是客户线客服、销售两站的站带教——示意；任务归所属站带教；周报只看不评）：**{len(new_q)}** 条：' + '、'.join(f'{NAMES[t["user"]]}·{tname(t)}' for t in new_q))
P('- 去掉的：赵一然「公众号选题清单」属于内容站（市场线），应归内容站带教；「第 44 周周报」按 B4 推荐只看不评。')
QUEUE = (len(old_q), len(new_q))

# 5.6 周颖在 W45–W46 的人（按站）
P('')
P('### 5.6 「我带的人」分组（周颖=客服、销售两站站带教，示意）')
P('')
grp = defaultdict(list)
for uid, order in PATHS:
    mods = order.replace("'", '').replace(' ', '').split(',')
    cur, nxt = mods[2], mods[3]   # 第 3 段 10-29–11-11 在站；第 4 段 11-12 起
    mine = ('m-kf', 'm-xs')
    if cur in mine: grp['在带'].append(f'{NAMES[uid]}（{MODN[cur]}→11-12 {MODN[nxt]}）')
    elif nxt in mine: grp['将到'].append(f'{NAMES[uid]}（{MODN[cur]}→11-12 {MODN[nxt]}）')
for k in ('在带', '将到'): P(f'- {k} {len(grp[k])} 人：' + '、'.join(grp[k]))
P('- 刚交接出去（10-28 离站、仍有未完事项）：示例数据里没有尾巴任务，这一组为空。')
GROUPS = (len(grp['在带']), len(grp['将到']))

# 5.7 按业务线（示意：每条线一位站带教）每段同时在带人数
P('')
P('### 5.7 按业务线每段同时在站人数（示意：若每条线由一位站带教负责两站，即这位带教同时带的人数）')
P('')
lines = sorted(set(LINE.values()))
P('| 段 | ' + ' | '.join(lines) + ' |'); P('|---|' + '---|' * len(lines))
LOAD = {}
for i, c in enumerate(occ):
    row = []
    for ln in lines:
        n = sum(len(c[m]) for m in MODN if LINE[m] == ln)
        LOAD.setdefault(ln, []).append(n); row.append(str(n))
    P(f'| {i+1} | ' + ' | '.join(row) + ' |')
P('')
for ln in lines: P(f'- {ln}：最多同时 **{max(LOAD[ln])}** 人（第 {LOAD[ln].index(max(LOAD[ln]))+1} 段）')

# 5.8 林夏完成进度（只按示例数据里已生成的路径任务实例）
lp = [t for t in TASKS if t['user'] == 'u-lin' and t['kind'] == 'path']
lp_due = [t for t in lp if t['due'] <= NOW]; lp_pass = [t for t in lp_due if t['status'] == 'passed']
P('')
P('### 5.8 林夏两个进度数（示例数据只生成了部分路径任务实例，仅作算法演示）')
P('')
P(f'- 时间进度：第 {day} / 180 天（{round(day/180*100)}%）。')
P(f'- 完成进度：截至演示时刻应完成的路径任务 {len(lp_due)} 条，已通过 {len(lp_pass)} 条（{round(len(lp_pass)/len(lp_due)*100)}%）；差 {len(lp_due)-len(lp_pass)} 条（待点评）。')
end_kf = bj('2026-11-11 18:00'); hn_due = add_wd(end_kf, 2)
P(f'- 交接要点期限「站后 2 个工作日」：第 3 段 11-11 18:00 结束 → **{hn_due:%m-%d %H:%M}**（周{"一二三四五六日"[hn_due.weekday()]}）。')

# 5.9 示意带教分配下的派生数（老师线=吴桐，客户线=周颖，市场=未指定；示例数据里没有市场线带教）
MENT = {'老师线': '吴桐', '客户线': '周颖', '市场': '未指定'}
P('')
P('### 5.9 示意带教分配下的派生数（老师线=吴桐、客户线=周颖、市场=未指定）')
P('')
sw_change = []
for uid, order in PATHS:
    mods = order.replace("'", '').replace(' ', '').split(',')
    a, b = MENT[LINE[mods[2]]], MENT[LINE[mods[3]]]
    if a != b: sw_change.append((NAMES[uid], MODN[mods[2]], MODN[mods[3]], a, b))
P(f'- 11-12 换站：换了带教的 {len(sw_change)} 人：' + '、'.join(f'{n}（{x}→{y}，{a}→{b}）' for n, x, y, a, b in sw_change) + f'；能派发 R06 的 {sum(1 for r in sw_change if r[4] != "未指定")} 条，新站带教未指定 {sum(1 for r in sw_change if r[4] == "未指定")} 人。')
backlog = Counter()
for t in TASKS:
    if t['status'] == 'submitted' and t['kind'] == 'path':
        backlog[MENT[LINE[TPL_MOD[t['tpl']]]]] += 1
P('- 点评积压（路径任务、已提交未点评，按所属站的带教）：' + '、'.join(f'{k} {v}' for k, v in backlog.items()) + '；吴桐 0。')
# 模板截止规则：话术演练录音 = 客服站开始后第几个工作日；客服岗小结 = 站结束日
st = bj('2026-10-29 09:00'); dd = bj('2026-11-04 18:00'); n = 0; d = st
while d.date() <= dd.date():
    if d.weekday() < 5: n += 1
    d += dt.timedelta(days=1)
P(f'- 模板「话术演练录音」截止 11-04 是客服站（10-29 开始）的第 **{n}** 个工作日（只按周末算）；「客服岗小结」截止 11-11 18:00 = 客服站结束日（锚定站结束，偏移 0），建议用时 2 天 → 开放日 11-09；客服站顺延 1 周后小结随站末到 11-18。')

# 待办代入（11-05 10:24，示意分配）
due_today_tomorrow = [t for t in TASKS if t['user']=='u-lin' and t['status'] in ('todo','doing','revise') and NOW.date() <= t['due'].date() <= (NOW+dt.timedelta(days=1)).date()]
lin_todo = len(due_today_tomorrow) + 1   # + R07 换站预告（11-05 = 开站前第 5 个工作日）
P(f'- 林夏待办：R04 今明截止 {len(due_today_tomorrow)} 条（' + '、'.join(tname(t) for t in due_today_tomorrow) + f'）+ R07 换站预告 1 条 = **{lin_todo}** 条；周报（11-08）、客服岗小结（11-11）不在今明，不进待办。')
r02_admin = backlog.get('未指定', 0)
r06_admin = sum(1 for r in sw_change if r[4] == '未指定')
pending_assets = len(re.findall(r"status: 'pending'", MOCK))
r05_admin = 1  # 许诺第 44 周周报：周期任务归主带教（示意：未设主带教 = 管理员）
admin_todo = pending_assets + r02_admin + r06_admin + r05_admin
P(f'- 管理员待办：R10 审核 {pending_assets} + R02（所属站无站带教）{r02_admin} + R06（新站带教未指定）{r06_admin} + R05（主带教为空的周期任务逾期：许诺第 44 周周报）{r05_admin} = **{admin_todo}** 条。孟川试讲复盘的 R05 在孟川和吴桐名下，管理员只看汇总。')
P('- 许诺第 44 周周报：示例数据截止 11-04 18:00（mock.ts:121），按「每周日 22:00」规则应为 11-01 22:00，至演示时刻逾期 3 天 12 小时。')
# ---------------------------------------------------------------- 5.10 待办规则计数
RULES = [
 ('R01','新成员待分配','E01','一期'),('R02','待点评','E10','一期'),('R03','修改再交','E11','一期'),('R04','今明截止 / 今天的测验','E08','一期'),
 ('R05','逾期跟进','E09 E15','一期'),('R06','换站接人','E05','一期'),('R07','换站预告','E05','一期'),('R08','写交接要点','E34','一期'),
 ('R09','站末遗留未评','E06','一期'),('R10','资产审核','E20','一期'),('R11','资产退回修改','E22','一期'),('R12','接口或同步异常','E32','一期'),
 ('R13','填阶段评估','E16','二期'),('R14','确认阶段评估','E17','二期'),('R15','资料待标注','E26','二期'),('R16','活动挂回放','E30','二期'),
 ('R17','作品集本人同意','E24','二期'),('R18','只读归档确认','E33','二期'),('R19','兑换发放','E31','三期'),
]
rp = Counter(r[3] for r in RULES)
P('')
P('### 5.10 待办规则计数')
P('')
P(f'- 规则 {len(RULES)} 条：一期 {rp["一期"]}，二期 {rp["二期"]}，三期 {rp["三期"]}。')
P('- ' + '；'.join(f'{a} {b}（{c}，{d}）' for a, b, c, d in RULES))

# ---------------------------------------------------------------- 6. 报告数字索引
P('')
P('## 6. 报告里出现的数字 → 本文件出处')
P('')
IDX = [
 (len(PAGES), 'PRD 第 3 节页面数', '§1'),
 (disp['保留'], '保留页面', '§1'), (disp['修订'], '修订页面', '§1'), (disp['删除（并入）'], '删除（并入）页面', '§1'), (len(NEW), '新增页面', '§2'),
 (proto['已做'], '原型已做', '§1'), (proto['部分'], '原型部分', '§1'), (proto['占位'], '原型占位', '§1'), (proto['未做'], '原型未做', '§1'),
 (len(PRD_ENT), 'PRD 第 9 节实体名', '§3'), (len(PRD[127:146]), 'PRD 第 9 节实体行', '§3'), (len(KEEP), '保留对象', '§3'), (len(MOD), '修订对象', '§3'), (len(NEWOBJ), '新增对象', '§3'),
 (len(T)+len(M)+len(A), '三份角色走查缺口合计', '§4'), (len(T), 'T', '§4'), (len(M), 'M', '§4'), (len(A), 'A', '§4'), (len(E), '事件 E', '§4'),
 (sum(SRC.values()), '拍板问题原始条数', '§4'), (10, '合并后拍板条数', '§4'),
 (old_rate, '旧口径示例结果（%）', '§5.1'), (f'{NEWM[0]}/{NEWM[1]} 待定 {NEWM[2]}', '新口径示例结果', '§5.2'),
 (GANTT_CROWD, '示例排期 2 人同岗格子', '§5.3'), (GANTT_EMPTY, '示例排期空岗格子', '§5.3'),
 (f'{QUEUE[0]}→{QUEUE[1]}', '周颖待点评条数 旧→新', '§5.5'), (f'在带 {GROUPS[0]} / 将到 {GROUPS[1]}', '周颖我带的人分组', '§5.6'),
 (day, '林夏培养第几天', '§5.4'),
 (f"{len(lp_pass)}/{len(lp_due)}", '林夏完成进度', '§5.8'), (len(RULES), '待办规则', '§5.10'), (lin_todo, '林夏待办条数', '§5.9'), (admin_todo, '管理员待办条数', '§5.9'), (len(sw_change), '11-12 换了带教的人数', '§5.9'), (n, '话术演练录音截止=站开始第几个工作日', '§5.9'), (rp['一期'], '一期待办规则', '§5.10'),
 (max(LOAD['市场']), '市场线最多同时在站', '§5.7'), (max(LOAD['老师线']), '老师线最多同时在站', '§5.7'), (max(LOAD['客户线']), '客户线最多同时在站', '§5.7'),
]
P('| 值 | 含义 | 出处 |'); P('|---|---|---|')
for v, k, s in IDX: P(f'| {v} | {k} | {s} |')

open(os.path.join(HERE, 'coverage.md'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('\n'.join(f'{k}: {v}' for v, k, s in IDX))
