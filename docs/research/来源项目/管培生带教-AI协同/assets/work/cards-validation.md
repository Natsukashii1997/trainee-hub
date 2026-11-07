# 首链消息与审核卡片渲染器验证

日期：2026-09-08。**本地渲染完成，未发送；不构成真实飞书卡片接收与回调验收。**

## 可集成接口

`trainee/cards.py` 提供纯函数：

```python
from trainee.cards import VerifiedArchiveLink, render_action

# 参数来自可信执行端的真实读回核验，不能只因 URL 存在就设 verified=True。
link = VerifiedArchiveLink(
    url=verified_full_record_url,
    case_id=case["id"],
    answer_version=case["answer_version"],
    verified=True,
    proposal_hash=verified_proposal_hash_or_none,
)
payloads = render_action(action, case, verified_archive=link)
```

返回按发送顺序排列的 `list[{"msg_type": "post" | "interactive", "content": object}]`。调用方在发送边界对 `content` 做 JSON 序列化，并显式使用机械邪龙兽 bot 身份、核验过的接收目标；渲染器不选择收件人，不调用网络。

支持 Engine 的 `answer`、`correction`、`rejection_notice`、`answer_review`、`archive_review`。不把文档写入和台账写入动作伪装成消息。正文与当前保存的答案版本/状态不一致会拒绝；归档方案的目标、内容、哈希须逐项等于保存的 proposal。

## 档案与内容边界

- 可提交审核卡必须提供 `VerifiedArchiveLink`。案件、当前答案版本和归档方案哈希必须匹配，且调用方显式声明 `verified=True`；缺失或错配直接拒绝。
- `verified=True` 的责任是：链接内容保留完整原问、原答、历史版本、来源与审核过程，归档审核还须展示对应的精确拟写入方案；已按用户授权范围核验访问。渲染器只检查声明与 URL 语法，不会把语法校验称作远端权限或内容校验。
- 当前用户已选测试群全体成员可见。该权限核验及文档创建由主执行端完成，示例链接不具备任何真实验证意义。
- 问答和纠正以飞书 `post` 的 `text` 节点无损分段，保持原始每个字符和换行；每段正文不超过 6,000 UTF-8 字节，序列化后的每个消息体不超过 20,000 字节。调用方须依次发送并保存每段回执，不能只登记第一段送达。
- 审核卡明确标为摘要，完整内容通过核验后的档案查看。原文只进入 `plain_text` / `post.text`，不会拼接到 Markdown 或交互定义中；`<at id=all>`、`@all`、伪造按钮 JSON 均按文本展示。
- 已结束的审核卡移除所有 callback 控件。答案通过与归档通过分开表述；归档批准显示“等待写入核验”，只有 Engine 标记 archived 才显示“已完成入库核验”。

## 审核回调协议

答案卡四按钮：`approve / final / principles / reject`；归档卡两按钮：`approve / reject`。所有按钮回传 `protocol=trainee-collab/v1`、`case_id`、正整数 `version`、`scope`、`decision`，归档另回传 `proposal_hash`。不在 value 中自报导师、群或消息身份。

导师输入字段名固定 `text`，飞书表单提交为 `action.form_value.text`，由既有 Bridge 转交。通过可以不填；定稿、原则改稿和退回须填写，最终仍由 Engine 校验。飞书多行 input 的单字段上限是 1,000 字，界面已提示；当前版本不支持超过该限额的导师完整定稿，不能剪短后冒充全文。

## 官方规范核对

使用 Card 2.0、默认宽度（省略 width_mode）、共享更新；动态内容均为纯文本。答案卡四个视觉块：问答摘要、依据追溯、完整档案、审核表单；归档卡四块：摘要、精确位置、全文方案、审核表单。一项主操作，其他操作次级或退回色，动态摘要有行数上限。

读取了本地 lark-im 的 schema、form、button、input、div、markdown、column_set 和 P0–P7 参考，并从飞书公开官方索引核对实际表单协议：

- [官方 Card 2.0 表单容器](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/containers/form-container)：示例明确同时配置 `form_action_type: submit` 和 `behaviors: [{type: callback, value: ...}]`；回调结构明确 value 来自 behaviors。
- [官方 Card 2.0 按钮](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/interactive-components/button)
- [官方卡片交互回调](https://open.feishu.cn/document/feishu-cards/card-callback-communication)
- [官方 Card 2.0 结构](https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-json-v2-structure)

本地参考写有“form 按钮不写 behaviors”，与当前官方有 value 回传需求的示例不一致。本实现按官方配置 submit + callback behavior，以保持 `action.value` 协议，不使用遗留顶层 value。已记录差异，没有更改已安装 Skill。

## Red → Green 与实际验证

先新增公开接口测试，观察到模块不存在；最小实现使待审卡的档案门禁和四类决定通过。再对归档精确绑定、长内容无损、安全文本及导师纠正新增行为测试，观察未支持动作错误，再实现对应动作。

命令：`python3 -m unittest tests.test_cards`。结果：**4/4 通过**，覆盖：

1. 缺失／未核验／错案件／错版本档案阻断；四按钮协议与 form text 字段。
2. 审核完成无回调控件；归档哈希、位置绑定；篡改位置被拒绝。
3. 超长中文、换行和控制标记无损分段，不生成 at 或伪造 button；每消息体限额。
4. 导师最终定稿、已否决原答、纠正版本与审核状态准确表达。

`work/cards-synthetic-examples.json` 提供待审答案、审核卡、已审卡和归档卡 payload。文件整体标记 synthetic_only=true、sent=false、remote_verification=false；全部内容与链接为合成演示。

尚未验证：飞书 API 接受这份 JSON、桌面/移动端真实呈现、真实 form 回调 SDK 字段、真实档案访问权限、发送回执与更新卡片闭环。以上由主执行端继续完成；不得仅凭本地测试宣布首链上线。
