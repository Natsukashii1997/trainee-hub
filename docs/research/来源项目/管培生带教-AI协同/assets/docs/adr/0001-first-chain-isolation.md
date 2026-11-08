# ADR 0001：独立持久流程，复用唯一 Bridge 与正常回答后的捕获

日期：2026-09-09。状态：正常回答后捕获的方向已实现并部署，三条真人主路径及各自独立归档已验。登记修复registry-r1于07:59受控上线，08:01取得READY_ACROSS_30_SECONDS。Worker、配置和既有业务保持。Ticket01仍in-progress、completion_commit=null；共享业务、长消息定稿、访问和恢复边界待验。历史记录按时点保留，当前执行对象和唯一下一步以末尾上线记录及《阶段状态.md》为准。

## 当前决定

本项目先做多维表格和已有正常问答的审核、纠正、归档。机械邪龙兽沿用现有回答设置；唯一共享 Bridge 在正常回答之后提供真实问题、完整答案和实际送达回执，本项目只接收精确试运行人员及入口范围内的完成事件。为建立案件不得再次生成或发送初始答案，不新增同应用事件监听器。出题考核最后。

独立仓库、Python 标准库与 SQLite 继续用于案件、答案版本、导师决定、外部操作与恢复。正常答案捕获后先写待审台账及过程档案，再提供对应审核卡；待审记录不会进入正式有效知识。导师确认精确版本，完整定稿落实、原则改稿重审，纠正回原入口。答案通过后另审完整归档内容与位置，实际写入并读回后才算归档完成。

稳定原消息引用、答复引用、捕获事件键与操作键连接 Bridge、持久队列和 Worker，防止重启或重复事件导致重复案件与重复发送。正常发送失败、部分成功、未知结果不可冒充完整送达；结果不明先查回。既有审核和归档引擎只是复用基础，新入口和提前写台账必须重新验证。

## 修订理由与旧决定边界

旧方案为了控制初次生成的来源，在生成前接管试运行问题，并要求本项目已审来源后生成待审答复。用户已将此实施方向纠正为“正常回答后记录与审核”，因此旧生成前接管与唯一来源启动前提撤回。第 91 版来源批准继续保留，不重复索要，也不据此限制当前正常回答。旧审查不能作为新路径完成证据。

独立候选和本地 tracker 仍用于保护共享 Bridge 的其他业务、形成可回滚版本及无需远程账号的交付。线上文件不原地修改，源码候选、配置生效与业务结果分别留证；关闭旧开关不等于新候选已通过。

## 已确认范围与证据

首轮仅常浩在测试群提问和审核；正式管培生名单为空。完整档案及台账向测试群全体成员开放查看，阅读权不扩大业务权。首条真实问答已完成待审写入、两个独立批准、实际归档及全文逐字查回，冻结事件39项与远端一致；普通成员实际访问仍待验。09 为 shortcut，不作档案父节点。机器人固定 codex／机械邪龙兽；对外用 bot，必要个人资源操作用同应用 user。

当前Worker受验源码 `a061baffe105b8260fcb772f5f01b1728592ad53` 已部署，Python120/120及两轴本轮新增阻断为0；它修复严格匹配的超时重连通知误判，将原则接收反馈和旧卡停用前移，仍保留完整成功终态、新版审核及独立归档门。第二案原原则已恢复处理，v2于21:39获本人批准；21:53纠正全文及原问引用独立查回。22:00:13常浩另批方案v1/答案v2，22:01:40完成归档。22:25独立验收确认正式归档与最终过程档案全文、实际父目录及群ACL、案件15字段、冻结事件47项和完成卡一致；当前可投影50项中的后置完成卡3项仅本地保留。两个批准独立绑定，knowledge_published=false；普通成员实际打开与完整卡JSON未验。证据见《阶段状态.md》、`work/principles-debug-20260908/v2-archived-independent-readback-20260908T142501533828Z.json` 与 `work/principles-debug-20260908/v2-archive-parent-readback-20260908T142227158223Z.json`。

第三案卡内17字导师定稿于22:48:13提交，直接形成已通过v2，原v1被否决；23:00查回原文、追溯及否决通知均回复原问。22:50:13另批归档方案v1/答案v2，23:04独立验收确认正式归档37,422字符、最终过程档案153,151字符（含proposal附录）均与完整冻结正文逐字相等；群ACL及实际父目录、案件15字段、冻结事件40项和完成卡一致。当前43事件中的后置3项仅本地，knowledge_published=false。证据为 `work/mentor-final-20260908/` 下 answer-readback 与 archived-independent-readback 两份带时间戳回执，完整路径见阶段状态；17字卡内输入不代表长消息入口通过。

当前Bridge构建为源码 `6b7a09f04bff3720dc0457249edffc853f1d3985` 的registry-r1；07:59上线、08:01跨时点核验通过，部署细节集中见《阶段状态.md》。旧capture-r2／2c1da884、Node29/29及09-08 23:03健康16/16仅证明历史对象和时点。登记修复不证明历史故障根因或系统恢复。长定稿完整envelope上限65,536 UTF-8字节，普通答案捕获上限2 MiB；长消息、访问与恢复/兼容待验，Ticket完成版本仍为空。

**旧路径撤下历史证据：2026-09-08 17:59:54（北京时间）核验四开关为 false、Worker stopped、锁释放、exit 0、队列 0。**证据：`work/normal-answer-transition-20260908/worker-stopped.json`。这只证明当时旧处理已停止；其后已完成当前捕获路径部署，不再据此判断当前开关关闭。旧 r4 切换与停止恢复证据保留在 `work/deploy-staging/pilot-r4-20260908/`，不替代当前版本验收。

案件表已新增并整表回读确认 3 列：当前答案正文 `fldjC4sJcy`（text）、回答消息 `fld6U2tT5n`（text）、回答时间 `fldXQW4l1y`（datetime），现共 **15 列**。字段证据：`work/normal-answer-transition-20260908/case-fields-create.json`、`case-fields-after.json`；真实首案行 `recvuCOrXsNhdQ` 已完成写入及查回，见 `work/human-trial-20260908/case-after-recovery.json`。原12列系统探针只作历史。


## 历史：2026-09-08 23:46 登记恢复候选决定（当时未部署）

采用当前连接的完整内存登记和本次 profile/app 双锁令牌作为恢复依据。只有当前代次仍连接、双锁所有权和30秒有效期均成立时才可恢复自身缺失登记；不采用无条件upsert，冲突或损坏保留现场。每5秒检查，停止和重连等待在途检查结束。该规则修复候选为 `6b7a09f04bff3720dc0457249edffc853f1d3985`，Node48/48、Python128/128通过，两轴与部署仍待完成。

构建增加显式保持已启用配置模式，构建前后核对已提交执行来源及配置原字节；默认关闭模式保留。候选准备不修改四开关或启动服务。切换范围仅为Bridge入口，Worker与业务数据保持，升级工具须先独立隔离核验。证据及固定审查范围见《阶段状态.md》登记候选段；Ticket完成版本仍为空。


2026-09-09 00:00 审查更新：6b7a09f两轴代码审查新增阻断0，证据见登记work目录下standards/spec报告。一次性升级工具须在旧服务消失后仍核对旧进程身份及派生进程退出，不能以当前服务PID缺失推导无子进程。旧18项隔离测试未覆盖此已复现缺口，修复和独立复审通过前不得使用工具切换。登记与profile/app两锁startedAt允许分别生成；升级核验要求各自位于本次apply时间窗，并跨30秒确认各自代次不变、心跳前进，不要求三时间戳或两令牌相等。


2026-09-09 00:12 构建证据补记：registry-r1已由6b7a09f构建，实际候选Node48/48、差异9/9与独立依赖清单核对通过，精确manifest/CLI hash见阶段状态及candidate-freeze。候选仍未启动。升级停止门禁采用最终preflight同UID进程身份快照及固定旧PGID，拒绝此后新存活身份，只有本工具本次ps采样可精确排除；这是为避免独立进程组和无可靠日志的旧任务漏检的一次性保守选择。可能因无关桌面新进程停止切换，保留现场，不杀进程。该工具修法仍待最终冻结、针对性测试及独立复审，不能称已通过；未现场prepare/apply/verify。


## 2026-09-09 00:40 ruid 升级工具复审通过（历史时点，入口反证及修复见末尾）

当时工具 `work/registry-stability-20260908/bridge-upgrade.py` SHA256 为 `3c6f00ec969074f75f3a8f13b50d12a7aa099d13b59a0fa6b3796498c8462048`。该范围独立复审 PASS：作者契约自检25/25、独立反证边界10/10，以及00:38:31真实 Mac 只读 `process_state()` 均通过，原孤儿进程漏检与实机采样阻断已关闭。测试前后hash一致，依据为同目录 `upgrade-independent-final-review.md`、`upgrade-independent-final-freeze.json`；真实采样回执为 `upgrade-independent-macos-sampler.json`。这只覆盖当时 ruid／孤儿守卫复审范围，不证明真实候选入口可用，且该时点尚未运行现场prepare/apply/verify。

旧工具 SHA256 `14a6f62296d915183baaf54d43472961591f2a78393523597c4734b9172e1790` 曾隔离通过，但实机 `/bin/ps` 的 `uid` 列返回有效 UID=0，与调用者真实 UID=501 不符，触发 `process_sampler_identity_unknown`。旧版本因此不能作为当前有效通过对象，旧报告及 `upgrade-independent-macos-sampler-failure.json` 留作历史。最终版本将采样列和身份字典统一为 `ruid`，与 `os.getuid()` 对齐，仍精确核对本次采样PID、PPID、真实UID与完整命令，不取消身份校验。

最终预检冻结PID、真实UID、PGID和启动时间；两次停止核验均沿用旧Bridge固定身份，拒绝旧PGID残留及预检后新存活的同真实UID身份，不依赖旧PPID关系或同步日志落盘。新增日志只作附加门禁。无关桌面新进程也可触发保守拒绝，不按正常祖先放行、不主动杀无关进程、不删回执盲试；该规则不宣称已查清预检前全部历史孤儿或穷尽Node内部在途请求。

候选保持 `trainee-registry-v1-20260909-r1`，源码 `6b7a09f04bff3720dc0457249edffc853f1d3985`，manifest `2147656b2bc78b3fbe1a151e44d492e73036dc95b23a07241165a7f6c45f8c7b`、CLI `bd8c3ca87830fbb2bd73d373ecdf5ae47e85e8d006460b83368260f2aca8c49e` 不变，本次未重建或启动候选。00:40记录时部署仍为旧capture-r2／Worker a061baf。当时下一步是核对工具、SQLite reader及候选冻结对象，进入现场prepare并核验条件，再按门禁受控升级及两次跨30秒验收；各startedAt、锁token独立生成，各自验证启动窗口、代次和心跳，不增加相等条件，每库快照也不表述为跨库事务。

Ticket01保持in-progress、completion_commit=null。本次仅同步工具复审事实，不把工具PASS扩大为现场升级或真实休眠/重启验收通过。三案及已获批内容保持，长定稿消息、普通成员访问、完整卡JSON、共享兼容和真实在途/未知结果等既有待验仍保留；不重复审核归档，不启动下游。

## 2026-09-09 06:43 候选真实入口反证与工具修复（历史时点，已由06:50记录覆盖）

真实 `prepare --stage registry-r1-20260909-0451` 已尝试，但旧工具因 `candidate_cli_symlink_invalid` 在 `validate_candidate()` 拒绝，发生在 `observe()`、stage 创建和服务动作之前。stage 未创建，apply/verify 未执行，0 服务动作；失败回执为 `work/registry-stability-20260908/tool-failure-1788902202277821000.json`。旧工具 `3c6f00ec…` 的25/25、独立10/10与实机采样PASS保留为当时 ruid／孤儿守卫证据，撤回其可直接现场使用结论。

采用与冻结安装包一致的精确入口链 `.bin/lark-channel-bridge → ../lark-channel-bridge/bin/lark-channel-bridge.mjs → ../dist/cli.js`，修正旧工具误要求软链接直达dist的假设。该修复只改变升级工具的入口核对，候选不变，不取消入口及内容身份验证。新工具SHA256 `e1fb90db5fa249ac470860db9fe3be7684c837fe5b1613e3686c11a8ebdbc507`；作者测试SHA256 `ed7d6953a53323f4ee785964c2f1ad2dc862b7888e1112510871ce5bc97660e0`；SQLite reader仍为 `fd3c034ea85bf040353fdaa8d2b817e1327ee88ab68ffda3f03ce21913120b71`。06:40:45作者冻结回执 `upgrade-entry-author-freeze.json` 记录25/25通过（`upgrade-entry-green.log`）、实际候选 `validate_candidate()` PASS及1,047项依赖核对通过，前后hash一致，service_actions=0、candidate_started=false；文件均位于上述work目录。

候选目录、源码、manifest与dist CLI保持上段冻结值，wrapper SHA256为 `53e4293b8109ecbeb3955ee4ce138d99cb6a2358fa3c547f4e916d6459a36003`。新工具独立入口复审尚未交付，作者PASS不作为整体独立验收；当前执行仍为Bridge capture-r2／源码2c1da884及Worker a061baf。唯一下一步是取得独立入口复审回执，核对冻结对象与现场条件后由父任务受控升级，实际结果及跨30秒验收随后补记。Ticket01保持in-progress、completion_commit=null，三案与剩余验收边界保持。

## 历史：2026-09-09 06:50 现场apply中断、原r2恢复与后续修复

入口局部独立复审已经通过：`work/registry-stability-20260908/upgrade-entry-independent-review.md` 绑定工具 `e1fb90db5fa249ac470860db9fe3be7684c837fe5b1613e3686c11a8ebdbc507`，12场景及真实候选 `validate_candidate()` PASS，1,047项依赖前后身份一致；不据此宣称现场apply成功。registry-r1／源码6b7a09f及manifest、CLI、wrapper冻结对象保持。

stage `work/registry-stability-20260908/stages/registry-r1-20260909-0646/` 的 `preparation.json` 记录06:46:29准备完成；`apply.json` 记录06:46:49启动，依次完成新鲜预检、bootout返回0、旧PID8777及服务/双锁释放、候选plist安装，随后 `ValueError: worker_not_fresh_idle`，状态 `STOPPED_NEEDS_INSPECTION`，候选未bootstrap。原回执没有失败当刻Worker忙闲及心跳的精确证据；`post-failure-readonly.json` 的后验状态只能说明06:49:18现场，不足以倒推当刻拒绝根因。

`restore-original.json` 记录检查旧实例退出和业务保留后恢复原plist字节及模式，再核验后于06:50:11 bootstrap返回0。`restore-verification.json` 于06:50:42确认 `ORIGINAL_R2_READY_POINT_IN_TIME`，Bridge PID41930／procId cf33、原capture-r2就绪及双锁持有；Worker PID33583、启动身份及配置保持。恢复可用性不等于部署registry-r1，原r2登记缺陷和跨30秒新候选验收仍未关闭。

唯一下一步是修正升级工具Worker状态观察，补全精确失败证据及有界只读等待测试，独立复审通过并核对冻结对象后创建新stage；不重跑本次失败stage的旧apply。Ticket01保持in-progress、completion_commit=null。三案和已获批内容保持，候选不重建、下游不启动；长定稿消息、普通成员访问、完整卡JSON、共享兼容、真实在途/未知结果及休眠重启恢复等既有待验保留。以上仅据保存回执同步事实，本轮未作生产采样或执行操作。


## 2026-09-09 08:01 当前上线决定落实

同一冻结registry-r1已通过最终升级工具的独立Spec/Standards复审（59/59、必要阻断0），使用新stage `work/registry-stability-20260908/stages/registry-r1-20260909-075909/` 单次切换。两次核验相隔106.952秒，结果READY_ACROSS_30_SECONDS：唯一实例与登记、两锁各自代次稳定，心跳均推进，当前连接属于新procId；Worker、配置及业务摘要保持。工具的观察及收尾超时共用原5秒预算，并完整恢复信号与上下文状态，未放宽身份、新鲜度或停止门禁；07:26启动时间空格修复不作为06:46故障根因。

精确版本、hash、两次时间、独立回执与保留证据集中见《阶段状态.md》07:59/08:01段及 `work/registry-stability-20260908/deployment-closeout-20260909.json`。旧失败stage保留，本次stage不得再次apply；必要恢复使用本次原件和既有恢复合同。登记升级通过只关闭该子项，Ticket01仍in-progress、completion_commit=null。

2026-09-09 08:10收口：共享兼容的既存证据检索已完成。当前CLI及两adapter与本stage manifest绑定，但启动日志没有可用的普通共享业务同链，战略jobs只读状态分组为空；日志缺席不证明没有战略回调。静态兼容有依据，当前版普通共享业务及战略卡真实兼容均pending，证据见 `work/registry-stability-20260908/shared-compatibility-readonly-20260909.md`。在相应已授权业务自然发生后按同一事件查回，不新建战略测试或重放旧卡。

唯一下一步：补普通测试群成员打开第三案正式归档、最终过程档案及协作台账的实际结果；现有ACL、常浩及机器人可读不能代替普通成员访问。余项以阶段状态为准，长定稿和恢复仍待验，不重复三案或新增旧卡/多轮真人硬要求，不启动下游。
