"""Pure rendering for the shared tutoring review group.

The renderer has no network side effects. It keeps untrusted questions and
answers as inert ``post`` text, then emits one interactive decision card. A
decision is bound to the exact case, answer version and full-content hash.
"""
import hashlib
import json
import re
from datetime import datetime
from itertools import combinations
from zoneinfo import ZoneInfo

from .answer_metadata import VALUE_RATING_LABELS, validate_answer_metadata
from .qa_links import qa_collection_url


PROTOCOL = "trainee-collab/v1"
MAX_MESSAGE_BYTES = 20000
POST_CHUNK_BYTES = 6000
PROJECT_MANAGEMENT_URL = (
    "https://vm94j8bzy7.feishu.cn/base/MxB8biSR2aJKenszh4CcprRenmf"
    "?table=tblc3pkZfjaOnOwY&view=vewgvTTuYy"
)
PERSON_OPEN_ID = re.compile(r"ou_[A-Za-z0-9]{8,128}")
MATERIAL_ACTION_CODES = {
    "submit_request": "sr", "start_production": "sp",
    "submit_review": "sv", "approve_review": "ap",
    "reject_review": "rr", "handoff": "ho",
    "accept": "ac", "reject_acceptance": "ra",
}
MATERIAL_CARD_ACTION = re.compile(
    r"^mat_(sr|sp|sv|ap|rr|ho|ac|ra)__([A-Za-z0-9_-]{1,25})__([a-f0-9]{64})$"
)
MATERIAL_SUPPLEMENT_ACTION = re.compile(r"^material_request_supplement__([a-f0-9]{64})$")
MATERIAL_MISSING_TITLE = "待确认｜设计提需信息不足"
MATERIAL_SUCCESS_TITLE = "已确认 | 完成提需并同步多维表格"
MATERIAL_MISSING_FIELDS = (
    "material_name", "use_scene", "material_spec", "due_at", "request_doc_url",
)
MATERIAL_BRIEF_TEMPLATE_URL = (
    "https://vm94j8bzy7.feishu.cn/wiki/Mb2ewzW7Bix76jkQPTucViJpn5b"
)


def answer_content_hash(case_id, answer_version, question, answer):
    """Return the stable identity of one exact question/answer version."""
    if (not isinstance(case_id, str) or not case_id.strip()
            or type(answer_version) is not int or answer_version < 1
            or not isinstance(question, str) or not question.strip()
            or not isinstance(answer, str) or not answer.strip()):
        raise ValueError("答案内容哈希缺少有效案件、版本、问题或答案")
    encoded = json.dumps([case_id, answer_version, question, answer],
                         ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _plain(text):
    return {"tag": "plain_text", "content": text}


def _div(text, lines=4, secondary=False, *, text_size=None, text_color=None,
         text_align=None):
    style = {"text_size": text_size or ("notation" if secondary else "normal"),
             "text_color": text_color or ("grey" if secondary else "default")}
    if text_align is not None:
        style["text_align"] = text_align
    if lines is not None:
        style["lines"] = lines
    return {"tag": "div", "text": _plain(text) | style}


def _block(title, elements, colored=False, *, background=None, element_id=None):
    block = {"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px", "columns": [
        {"tag": "column", "width": "weighted", "weight": 1,
         "background_style": background or ("blue-50" if colored else "default"),
         "padding": "12px", "vertical_spacing": "4px",
         "elements": [{"tag": "markdown", "content": "**" + title + "**"}, *elements]}]}
    if element_id:
        block["element_id"] = element_id
    return block


def _message(kind, content):
    if len(json.dumps(content, ensure_ascii=False).encode("utf-8")) > MAX_MESSAGE_BYTES:
        raise ValueError("消息超过渲染器安全体积限制；不得截断后冒充完整内容")
    return {"msg_type": kind, "content": content}


def _markdown_text(text):
    """Keep a trusted display label inert inside Card 2.0 markdown."""
    reserved = frozenset("&*~><[]()#:_")
    return "".join(f"&#{ord(char)};" if char in reserved else char for char in text)


def _person_display(person_id, person_name):
    """Prefer a compact, clickable Feishu person and fall back to its frozen name."""
    name = person_name.strip()
    if (isinstance(person_id, str)
            and PERSON_OPEN_ID.fullmatch(person_id.strip())):
        return (f"<person id='{person_id.strip()}' show_name=true "
                "show_avatar=false style='normal'></person>")
    return _markdown_text(name)


def _card(title, subtitle, elements, pending, *, template=None, status_tag=None,
          status_color=None):
    template_color = template or ("blue" if pending else "grey")
    header = {"title": _plain(title), "subtitle": _plain(subtitle),
              "template": template_color}
    if status_tag:
        header["text_tag_list"] = [{"tag": "text_tag", "text": _plain(status_tag),
                                    "color": status_color or (
                                        "neutral" if template_color == "grey"
                                        else template_color)}]
    return {"schema": "2.0", "config": {"update_multi": True, "width_mode": "default",
                                          "enable_forward": False,
                                          "summary": {"content": title}},
            "header": header,
            "body": {"direction": "vertical", "vertical_spacing": "12px",
                     "padding": "12px", "elements": elements}}


def _metadata_row(asker, knowledge_type, value_rating):
    values = (
        ("提问人", asker, "red-50", "red"),
        ("知识类型", knowledge_type, "purple-50", "purple"),
        ("价值评级", VALUE_RATING_LABELS[value_rating], "orange-50", "orange"),
    )
    return {"tag": "column_set", "element_id": "answer_metadata", "flex_mode": "none",
            "horizontal_spacing": "8px", "columns": [
                {"tag": "column", "width": "weighted", "weight": 1,
                 "background_style": background, "padding": "12px", "vertical_spacing": "4px",
                 "elements": [
                     {"tag": "markdown", "content":
                      f"**<font color='{color}'>{label}</font>**",
                      "text_size": "notation", "text_align": "left"},
                     _div(value, lines=2, text_align="left")]}
                for label, value, background, color in values]}


def _post_parts(title, text):
    """Keep every code point and newline while respecting message byte limits."""
    chunks, current, size = [], [], 0
    for char in text:
        amount = len(char.encode("utf-8"))
        if current and size + amount > POST_CHUNK_BYTES:
            chunks.append("".join(current))
            current, size = [], 0
        current.append(char)
        size += amount
    if current:
        chunks.append("".join(current))
    count = len(chunks)
    return [_message("post", {"zh_cn": {
        "title": title if count == 1 else f"{title} · {index}/{count}",
        "content": [[{"tag": "text", "text": chunk}]]}})
        for index, chunk in enumerate(chunks, 1)]


def render_feedback(text, *, event_id=None, feedback_context=None):
    if not isinstance(text, str) or not text.strip():
        raise ValueError("处理反馈须提供可读说明")
    if event_id is not None and (not isinstance(event_id, str) or not event_id.strip()):
        raise ValueError("反馈事件标识无效")
    titles = {
        None: "带教协同 · 处理进度",
        "material_request": "内容物料提需 · 处理异常",
        "material_action": "内容物料流转 · 处理异常",
        "monthly_discount": "月度折扣同步 · 处理异常",
    }
    if feedback_context not in titles:
        raise ValueError("处理反馈业务归属无效")
    return _post_parts(titles[feedback_context], text)


def render_material_missing_card(missing_fields, request_token):
    """Render the approved Card 2.0 continuation form for an incomplete request."""
    if (not isinstance(missing_fields, (list, tuple)) or not missing_fields
            or len(missing_fields) != len(set(missing_fields))
            or any(field not in MATERIAL_MISSING_FIELDS for field in missing_fields)
            or tuple(missing_fields) != tuple(
                field for field in MATERIAL_MISSING_FIELDS if field in missing_fields)):
        raise ValueError("物料提需缺项必须按固定业务顺序提供")
    if (not isinstance(request_token, str)
            or re.fullmatch(r"[a-f0-9]{64}", request_token) is None):
        raise ValueError("物料提需缺项卡必须绑定服务端续接令牌")
    guide = {
        "material_name": ("物料名称", "例如：选课指导海报", True),
        "use_scene": ("使用场景", "朋友圈 / 私信 / 其他", False),
        "material_spec": ("物料规格", "海报 / 九宫格 / 六宫格 / 三宫格 / 单图 / 其他", False),
        "due_at": ("交付 DDL", "例如：2026-8-31", True),
        "request_doc_url": ("提需文档链接 URL", "例如：https://开头的文档链接", True),
    }
    number = ("1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣")
    colors = ("blue-50", "purple-50", "purple-50", "blue-50", "blue-50")
    guides = []
    for index, field in enumerate(missing_fields):
        title, detail, example = guide[field]
        guides.append({
            "tag": "column", "width": "weighted", "weight": 1, "padding": "0px",
            "elements": [{
                "tag": "interactive_container", "width": "fill", "height": "104px",
                "background_style": colors[index], "corner_radius": "8px",
                "padding": "12px", "vertical_spacing": "4px", "elements": [
                    {"tag": "markdown", "content": f"**{number[index]} {title}**"},
                    {"tag": "markdown", "content": (
                        f"<font color='grey'>{detail}</font>" if example else detail),
                     **({"text_size": "notation"} if example else {})},
                ],
            }],
        })
    guide_rows = []
    for start in range(0, len(guides), 2):
        guide_rows.append({
            "tag": "column_set", "flex_mode": "stretch", "horizontal_spacing": "12px",
            "columns": guides[start:start + 2],
        })
    elements = [
        {"tag": "column_set", "flex_mode": "none", "columns": [{
            "tag": "column", "width": "weighted", "weight": 1,
            "padding": "8px 12px", "background_style": "grey-50",
            "elements": [{"tag": "markdown", "text_align": "center",
                          "content": ("**缺少必填字段：<font color='red'>"
                                      f"{len(missing_fields)}</font>**")}],
        }]},
        {"tag": "markdown", "content": "👇 **请一次性补齐下方必填信息**"},
        {"tag": "column_set", "flex_mode": "none", "columns": [{
            "tag": "column", "width": "weighted", "weight": 1,
            "vertical_spacing": "12px", "elements": guide_rows,
        }]},
        {"tag": "form", "name": "material_request_supplement_form",
         "direction": "vertical", "vertical_spacing": "8px", "elements": [
             {"tag": "input", "name": "material_request_supplement",
              "required": True, "input_type": "multiline_text", "rows": 4,
              "auto_resize": True, "max_rows": 8, "max_length": 1000,
              "width": "fill", "label": _plain("补充提需信息"),
              "placeholder": _plain(
                  "请按上方缺项一次性填写；日期须真实有效，文档须粘贴 https:// 链接")},
             {"tag": "button", "name": f"material_request_supplement__{request_token}",
              "form_action_type": "submit", "type": "primary_filled", "width": "fill",
              "text": _plain("提交提需")},
         ]},
        {"tag": "markdown", "content": (
            "✅ **提需示例**： 请帮我上一套物料，叫做选课指导海报，朋友圈九宫格，"
            "DDL是2026年8月31日，对应提需文档 "
            f"[设计 Brief 需求模板]({MATERIAL_BRIEF_TEMPLATE_URL})")},
        {"tag": "markdown", "text_size": "notation", "content": (
            "<font color='grey'>写入状态：</font>"
            "<font color='red'>**未写入**</font>"
            "<font color='grey'>｜请在上方补齐并提交；完整校验通过后才会写入。</font>")},
    ]
    return _message("interactive", {
        "schema": "2.0",
        "config": {"update_multi": True, "width_mode": "default",
                   "enable_forward": False,
                   "summary": {"content": MATERIAL_MISSING_TITLE}},
        "header": {"title": _plain(MATERIAL_MISSING_TITLE), "template": "yellow",
                   "icon": {"tag": "standard_icon", "token": "lark-logo_colorful"}},
        "body": {"direction": "vertical", "padding": "16px 16px 20px 16px",
                 "vertical_spacing": "16px", "elements": elements},
    })


def render_project_startup_success_card(project_name, owner_name, project_created_at,
                                        *, task_count, owner_id, requester_name):
    """Render the single Card 2.0 reply for a verified standard-project startup."""
    if (not isinstance(project_name, str) or not project_name.strip()
            or len(project_name.strip()) > 100
            or not isinstance(owner_name, str) or not owner_name.strip()
            or not isinstance(requester_name, str) or not requester_name.strip()
            or not isinstance(project_created_at, str)
            or type(task_count) is not int or not 1 <= task_count <= 200):
        raise ValueError("项目启动成功卡缺少冻结的项目、负责人、提需人、日期或任务总数")
    try:
        instant = datetime.fromisoformat(project_created_at.replace("Z", "+00:00"))
        if instant.utcoffset() is None:
            raise ValueError()
    except ValueError:
        raise ValueError("项目启动成功卡日期必须是带时区时间") from None
    display_date = instant.astimezone(ZoneInfo("Asia/Shanghai")).strftime("%Y/%m/%d")
    owner = _person_display(owner_id, owner_name)
    metrics = (
        (requester_name.strip(), "提需人", "green-50"),
        (display_date, "项目创建时间", "turquoise-50"),
        (f"{task_count}项", "任务事项", "grey-50"),
    )
    metric_row = {
        "tag": "column_set", "element_id": "project_startup_metrics",
        "flex_mode": "none", "horizontal_spacing": "8px",
        "columns": [{
            "tag": "column", "width": "weighted", "weight": 1,
            "background_style": background, "padding": "12px",
            "vertical_spacing": "4px", "elements": [
                _div(value, lines=1, text_size="heading", text_color="green",
                     text_align="center"),
                _div(label, lines=1, secondary=True, text_size="normal",
                     text_align="center"),
            ],
        } for value, label, background in metrics],
    }
    title = "已启动 | " + project_name.strip()
    card = {
        "schema": "2.0",
        "config": {"update_multi": True, "width_mode": "default",
                   "enable_forward": False, "summary": {"content": title}},
        "header": {"title": _plain(title), "template": "green"},
        "body": {
            "direction": "vertical", "vertical_spacing": "12px", "padding": "12px",
            "elements": [
                metric_row,
                {"tag": "markdown", "text_size": "normal",
                 "content": "**✅ 标准项目现已启动，请尽快核验流程是否与实际情况匹配**"},
                {"tag": "markdown", "text_size": "notation",
                 "content": ("<font color='green'>已启动</font> | "
                             f"[项目推进管理]({PROJECT_MANAGEMENT_URL}) | "
                             f"{owner}（总负责人）")},
            ],
        },
    }
    return _message("interactive", card)


def _material_action_name(action, material_id, card_token):
    code = MATERIAL_ACTION_CODES.get(action)
    value = f"mat_{code}__{material_id}__{card_token}"
    if code is None or len(value) > 100 or not MATERIAL_CARD_ACTION.fullmatch(value):
        raise ValueError("物料卡片动作缺少稳定对象或状态令牌")
    return value


def _material_callback_button(label, action, material_id, card_token, *, danger=False):
    """Build the compact callback used by the accepted legacy review card.

    The original card used direct callback buttons rather than a form.  The
    compact action string keeps the callback under Feishu's size limit while
    still binding it to one record and one exact workflow state.
    """
    action_name = _material_action_name(action, material_id, card_token)
    button = {
        "tag": "button", "text": _plain(label), "width": "fill",
        "type": "danger_filled" if danger else "primary_filled",
        "behaviors": [{"type": "callback", "value": {
            "material_action": action_name,
        }}],
    }
    if danger:
        button["confirm"] = {
            "title": _plain("确认退回？"),
            "text": _plain("退回后物料回到制作中；具体修改内容请在线下或本话题沟通。"),
        }
    return button


def _material_value(material, key, fallback="—"):
    value = material.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _material_optional_url(material, key):
    value = material.get(key)
    if isinstance(value, str) and value.startswith(("https://", "http://")):
        return value
    return ""


def render_material_submission_success_card(material):
    """Render the accepted read-only receipt after a complete request is saved."""
    if (not isinstance(material, dict)
            or not isinstance(material.get("name"), str)
            or not material["name"].strip()):
        raise ValueError("物料提需成功卡缺少经回读的物料记录")
    name = _markdown_text(material["name"].strip())
    requirement = "+".join(
        _markdown_text(str(material.get(key) or "").strip())
        for key in ("use_scene", "material_spec")
        if str(material.get(key) or "").strip()
    ) or "—"
    due_at = _short_date(_material_value(material, "due_at"))
    columns = [{
        "tag": "column", "width": "weighted", "weight": 1,
        "padding": "12px", "background_style": "grey-50",
        "vertical_align": "center", "elements": [{
            "tag": "markdown", "text_align": "center",
            "content": f"**{label}**\n{value}",
        }],
    } for label, value in (
        ("✅ 物料名称", name),
        ("✅ 类型需求", requirement),
        ("✅ 交付DDL", due_at),
    )]
    footer = ("<font color='grey'>写入状态：</font>"
              "<font color='green'>**已写入**</font>")
    request_url = _material_optional_url(material, "request_doc_url")
    if request_url:
        footer += ("<font color='grey'> | </font>"
                   f"[查看设计提需文档]({request_url})")
    return _message("interactive", {
        "schema": "2.0",
        "config": {"update_multi": True, "width_mode": "default",
                   "enable_forward": False,
                   "summary": {"content": MATERIAL_SUCCESS_TITLE}},
        "header": {"title": _plain(MATERIAL_SUCCESS_TITLE), "template": "green",
                   "icon": {"tag": "standard_icon", "token": "wiki-bitable_colorful"}},
        "body": {"direction": "vertical", "padding": "12px 12px 16px 12px",
                 "vertical_spacing": "large", "elements": [
                     {"tag": "column_set", "flex_mode": "stretch",
                      "horizontal_spacing": "small", "columns": columns},
                     {"tag": "markdown", "text_size": "notation", "content": footer},
                 ]},
    })


def _material_review_info_column(title, value, background):
    return {
        "tag": "column", "width": "weighted", "weight": 1,
        "padding": "12px", "background_style": background,
        "vertical_align": "center", "elements": [{
            "tag": "markdown", "content": f"**{title}**\n{_markdown_text(str(value))}",
        }],
    }


def _material_terminal_card(material, *, approved):
    name = _material_value(material, "name", "内容物料")
    due_at = _short_date(_material_value(material, "due_at"))
    priority = _material_value(material, "priority")
    if approved:
        title, template, status, color = f"已通过｜{name}"[:120], "green", "已通过", "green"
        backgrounds = ("green-50", "turquoise-50", "grey-50")
        instruction = "**❤ 设计内容已通过最终审批，辛苦伙伴们的付出**"
        project_url = _material_optional_url(material, "project_url")
        link = (f"[营销战役文档]({project_url})" if project_url
                else "<font color='grey'>营销战役文档未登记</font>")
    else:
        title, template, status, color = f"未通过｜{name}"[:120], "red", "待修改", "red"
        backgrounds = ("red-50", "orange-50", "grey-50")
        instruction = "**❤ 请根据反馈进一步优化内容，完成后上传终稿自动送审**"
        request_url = _material_optional_url(material, "request_doc_url")
        link = (f"[设计提需文档]({request_url})" if request_url
                else "<font color='grey'>设计提需文档未登记</font>")
    specs = (
        ("当前状态", status, color, backgrounds[0]),
        ("交付 DDL", due_at, "green" if approved else "orange", backgrounds[1]),
        ("优先级", priority, "green" if approved else "grey", backgrounds[2]),
    )
    row = {"tag": "column_set", "flex_mode": "stretch",
           "horizontal_spacing": "small", "columns": [{
               "tag": "column", "width": "weighted", "weight": 1,
               "padding": "10px", "background_style": background,
               **({"vertical_align": "center"} if approved else {}),
               "elements": [{
                   "tag": "markdown", "text_align": "center",
                   "content": (f"**<font color='{metric_color}'>"
                               f"{_markdown_text(value)}</font>**\n"
                               f"<font color='grey'>{label}</font>"),
               }],
           } for label, value, metric_color, background in specs]}
    audit_status = "已通过" if approved else "未通过"
    footer = (f"<font color='grey'>审核状态：</font> "
              f"<font color='{color}'>{audit_status}</font> "
              f"<font color='grey'>|</font> {link}")
    return _message("interactive", {
        "schema": "2.0",
        "config": {"update_multi": True, "width_mode": "default",
                   "enable_forward": False, "summary": {"content": title}},
        "header": {"title": _plain(title), "template": template,
                   "icon": {"tag": "standard_icon", "token": "image_colorful"}},
        "body": {"direction": "vertical", "padding": "12px 12px 20px 12px",
                 "vertical_spacing": "large", "elements": [
                     row, {"tag": "markdown", "content": instruction},
                     {"tag": "markdown", "text_size": "notation", "content": footer},
                 ]},
    })


def _material_pending_review_card(material, view, material_url):
    name = material["name"].strip()
    request_url = _material_optional_url(material, "request_doc_url")
    brief = "<font color='grey'>查看设计Brief | </font>" + (
        f"[打开提需文档]({request_url})" if request_url
        else "<font color='grey'>未登记</font>")
    type_requirement = " + ".join(
        str(material.get(key) or "").strip()
        for key in ("use_scene", "material_spec")
        if str(material.get(key) or "").strip()) or "—"
    requester = _material_value(
        material, "requester_name",
        "已指定" if material.get("requester_ids") else "未指定")
    reviewer = _material_value(
        material, "reviewer_name",
        "已指定" if material.get("reviewer_ids") else "未指定")
    buttons = [
        _material_callback_button("审核通过", "approve_review", material["record_id"],
                                  view["card_token"]),
        _material_callback_button("退回修改", "reject_review", material["record_id"],
                                  view["card_token"], danger=True),
    ]
    record_url = _trusted_url(material_url, "内容物料地址")
    updated = material.get("updated_at")
    try:
        updated_display = _short_date(updated) if updated else _short_date(
            datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat())
    except ValueError:
        updated_display = _short_date(datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat())
    footer = "｜".join([
        "视觉预览", "连接真实记录", f"[打开记录查看终稿]({record_url})",
        f"交付 DDL：{_short_date(_material_value(material, 'due_at'))}",
        f"更新日期：{updated_display}",
        f"状态版本：v{view.get('state_version', view['result_version'])}",
    ])
    elements = [
        {"tag": "column_set", "flex_mode": "none", "margin": "0px", "columns": [{
            "tag": "column", "width": "weighted", "weight": 1,
            "padding": "0px", "margin": "0px", "vertical_spacing": "2px",
            "elements": [
                {"tag": "markdown", "margin": "0px",
                 "content": "**设计终稿已正式提交，请审核人查阅下方成图，完成对应审核流程**"},
                {"tag": "markdown", "content": brief, "text_size": "notation",
                 "margin": "0px"},
            ],
        }]},
        {"tag": "column_set", "flex_mode": "stretch", "horizontal_spacing": "medium",
         "margin": "0px", "columns": [
             _material_review_info_column("✅ 物料名称", name, "blue-50"),
             _material_review_info_column("✅ 类型需求", type_requirement, "purple-50"),
         ]},
        {"tag": "column_set", "flex_mode": "stretch", "horizontal_spacing": "medium",
         "margin": "0px", "columns": [
             _material_review_info_column("✅ 提需人", requester, "purple-50"),
             _material_review_info_column("✅ 审核人", reviewer, "blue-50"),
         ]},
        {"tag": "column_set", "flex_mode": "stretch", "horizontal_spacing": "medium",
         "margin": "0px", "columns": [{
             "tag": "column", "width": "weighted", "weight": 1,
             "padding": "0px", "margin": "0px", "elements": [button],
         } for button in buttons]},
        {"tag": "markdown", "text_size": "notation", "content": footer},
    ]
    image_key = material.get("preview_image_key")
    if isinstance(image_key, str) and image_key:
        elements.append({"tag": "img", "img_key": image_key,
                         "alt": _plain(f"{name}终稿预览"),
                         "scale_type": "fit_horizontal", "corner_radius": "8px",
                         "preview": True})
    title = f"待审核 | {name}"[:120]
    return _message("interactive", {
        "schema": "2.0",
        "config": {"update_multi": True, "width_mode": "default",
                   "enable_forward": False,
                   "summary": {"content": f"待审核｜{name}"[:120]}},
        "header": {"title": _plain(title), "template": "orange",
                   "icon": {"tag": "standard_icon", "token": "image_colorful"}},
        "body": {"direction": "vertical", "padding": "12px 12px 20px 12px",
                 "vertical_spacing": "large", "elements": elements},
    })


def render_material_card(material, view, *, material_url):
    """Render the accepted review, rework, or approved material card."""
    if (not isinstance(material, dict) or not isinstance(view, dict)
            or material.get("record_id") != view.get("material_id")
            or not isinstance(material.get("name"), str) or not material["name"].strip()
            or view.get("status") not in {
                "草稿", "待制作", "制作中", "待审核", "审核退回", "待交接", "待验收",
                "验收退回", "已完成"}
            or type(view.get("result_version")) is not int or view["result_version"] < 0
            or not isinstance(view.get("card_token"), str)
            or not re.fullmatch(r"[a-f0-9]{64}", view["card_token"])
            or not isinstance(view.get("actions"), list)
            or not isinstance(view.get("blockers"), list)):
        raise ValueError("物料卡片缺少经核验的对象、状态或成果版本")
    material_url = _trusted_url(material_url, "内容物料地址")
    status = view["status"]
    review_decision = view.get("review_decision")
    if status == "制作中" and review_decision == "rejected":
        return _material_terminal_card(material, approved=False)
    if status == "已完成" and review_decision == "approved":
        return _material_terminal_card(material, approved=True)
    if status == "待审核":
        return _material_pending_review_card(material, view, material_url)
    actions = tuple(view["actions"])
    supported = {
        "submit_request": "提交提需", "start_production": "开始制作",
        "submit_review": "提交审核", "approve_review": "审核通过",
        "reject_review": "审核退回", "handoff": "完成交接",
        "accept": "验收通过", "reject_acceptance": "验收退回",
    }
    if (len(actions) != len(set(actions)) or any(action not in supported for action in actions)
            or any(not isinstance(item, str) for item in view["blockers"])):
        raise ValueError("物料卡片动作或阻塞信息无效")
    palette = {
        "草稿": ("grey", "草稿", "neutral"), "待制作": ("blue", "待制作", "blue"),
        "制作中": ("blue", "制作中", "blue"), "待审核": ("orange", "待审核", "orange"),
        "审核退回": ("red", "审核退回", "red"),
        "待交接": ("purple", "待交接", "purple"), "待验收": ("turquoise", "待验收", "turquoise"),
        "验收退回": ("red", "验收退回", "red"),
        "已完成": ("green", "已完成", "green"),
    }
    template, status_tag, status_color = palette[status]
    people = []
    for key, label in (("producer_name", "制作负责人"), ("reviewer_name", "审核人"),
                       ("acceptor_name", "验收人")):
        value = material.get(key)
        if isinstance(value, str) and value.strip():
            people.append(f"**{label}**：{_markdown_text(value.strip())}")
    facts = [
        f"**流程状态**：{status}",
        f"**成果版本**：v{view['result_version']}",
        *people,
    ]
    if isinstance(material.get("due_at"), str) and material["due_at"].strip():
        facts.append("**期望交付**：" + _markdown_text(material["due_at"].strip()))
    elements = [
        _block("当前进度", [{"tag": "markdown", "content": "\n".join(facts)}],
               background="green-50" if status == "已完成" else "blue-50"),
    ]
    requirement = material.get("requirement")
    if isinstance(requirement, str) and requirement.strip():
        elements.append(_block("需求与验收口径", [_div(requirement.strip(), lines=8)]))
    if view["blockers"]:
        elements.append(_block("当前阻塞", [
            {"tag": "markdown", "content": "\n".join(
                "- " + _markdown_text(item) for item in view["blockers"])}],
            background="red-50"))
    if actions:
        form_elements = [{
            "tag": "input", "name": "text", "input_type": "multiline_text",
            "rows": 2, "required": False, "max_length": 1000, "width": "fill",
            "auto_resize": True, "max_rows": 5, "label_position": "top",
            "label": _plain("审核或验收意见"),
            "placeholder": _plain("退回时必填；通过时可留空"),
        }]
        buttons = []
        for action in actions:
            danger = action in ("reject_review", "reject_acceptance")
            primary = action in ("start_production", "submit_review", "approve_review", "handoff", "accept")
            label = ("开始修改" if action == "start_production"
                     and status in ("审核退回", "验收退回") else supported[action])
            buttons.append({
                "tag": "button",
                "name": _material_action_name(action, material["record_id"], view["card_token"]),
                "text": _plain(label), "width": "fill",
                "type": "danger_filled" if danger else "primary_filled" if primary else "default",
                "form_action_type": "submit",
            })
        for index in range(0, len(buttons), 2):
            form_elements.append({"tag": "column_set", "flex_mode": "none", "columns": [
                {"tag": "column", "width": "weighted", "weight": 1, "elements": [button]}
                for button in buttons[index:index + 2]]})
        elements.append({"tag": "form", "name": "material_workflow",
                         "vertical_spacing": "8px", "elements": form_elements})
    elements.extend([
        _open_url_button("查看内容物料", material_url, primary=not actions),
        {"tag": "markdown", "text_size": "notation", "content":
         f"物料记录：{_markdown_text(material['record_id'])}｜"
         f"状态：<font color='{status_color}'>**{status}**</font>｜"
         f"成果版本：v{view['result_version']}"},
    ])
    title = "内容物料｜" + material["name"].strip()
    subtitle = "提需—制作—审核—交接—验收"
    return _message("interactive", _card(
        title, subtitle, elements, bool(actions), template=template,
        status_tag=status_tag, status_color=status_color))


def render_discount_sync_card(result, *, month):
    """Render an inert success card only for a fully completed discount batch."""
    if (not isinstance(result, dict) or result.get("status") != "completed"
            or result.get("atomic") is not False
            or result.get("transaction_scope") != "per_record"
            or type(result.get("total")) is not int or result["total"] < 1
            or result.get("succeeded") != result["total"]
            or result.get("failed") != 0 or result.get("unknown") != 0
            or not isinstance(month, str) or not re.fullmatch(r"20\d{2}-(?:0[1-9]|1[0-2])", month)):
        raise ValueError("月度折扣完成卡只能用于全部逐条回读成功的批次")
    metrics = {"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px",
               "columns": [
                   _report_metric(str(result["total"]), "方案总数", "当月 SKU 记录",
                                  background="green-50", color="green"),
                   _report_metric(str(result["succeeded"]), "已回读", "逐条写后核验",
                                  background="turquoise-50", color="green"),
               ]}
    elements = [metrics, _block("处理说明", [
        _div("本批次先完成整批预校验，再按自然键逐条新建或更新。"
             "每条均已写后回读；跨记录不声称事务原子性。", lines=4)],
        background="green-50"),
        {"tag": "markdown", "text_size": "notation", "content":
         f"适用月份：{month}｜结果：<font color='green'>**{result['succeeded']}/{result['total']} 已同步**</font>"}]
    return _message("interactive", _card(
        f"月度折扣已同步｜{month}", "整批预校验通过·逐条写后回读",
        elements, False, template="green", status_tag="已完成", status_color="green"))


def _iso_date(value, label):
    if not isinstance(value, str):
        raise ValueError(label + "必须是 ISO 日期")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            raise ValueError(label + "必须是 ISO 日期") from None
    return parsed


def _short_date(value):
    parsed = _iso_date(value, "卡片日期")
    return f"{parsed.month}月{parsed.day}日"


def _short_datetime(value):
    parsed = _iso_date(value, "卡片读取时间")
    if parsed.utcoffset() is None:
        raise ValueError("卡片读取时间必须带时区")
    local = parsed.astimezone(ZoneInfo("Asia/Shanghai"))
    return f"{local.month}月{local.day}日 {local:%H:%M}"


def _full_date(value):
    return _iso_date(value, "卡片日期").strftime("%Y/%m/%d")


def _trusted_url(value, label):
    if (not isinstance(value, str) or not value.startswith("https://")
            or len(value) > 2048 or any(character.isspace() for character in value)):
        raise ValueError(label + "缺少可用的 HTTPS 链接")
    return value


def _open_url_button(title, url, *, primary):
    return {
        "tag": "button", "text": _plain(title),
        "type": "primary_filled" if primary else "default", "width": "fill",
        "behaviors": [{"type": "open_url", "default_url": url}],
    }


def _section_title(title):
    return {"tag": "markdown", "content": "**" + title + "**",
            "text_size": "heading-3"}


def _report_metric(value, label, detail, *, background="blue-50", color="blue"):
    if not all(isinstance(item, str) and item for item in (value, label, detail)):
        raise ValueError("周报指标缺少可显示内容")
    return {
        "tag": "column", "width": "weighted", "weight": 1,
        "background_style": background, "padding": "12px", "vertical_spacing": "4px",
        "elements": [
            _div(value, lines=1, text_size="heading-1", text_color=color),
            _div(label, lines=1, text_size="normal"),
            _div(detail, lines=2, secondary=True),
        ],
    }


def _daily_project_block(project):
    required = ("short_name", "name", "completed_count", "task_count",
                "in_progress_count", "completion_percent", "today_completed_count",
                "overdue_count", "week_items", "tomorrow_due", "status")
    if (not isinstance(project, dict) or any(key not in project for key in required)
            or any(type(project[key]) is not int or project[key] < 0 for key in (
                "completed_count", "task_count", "in_progress_count",
                "completion_percent", "today_completed_count", "overdue_count"))
            or not isinstance(project["week_items"], list)
            or not isinstance(project["tomorrow_due"], list)
            or not isinstance(project["status"], dict)):
        raise ValueError("日报项目块结构不完整")
    definitions = {
        "risk": ("存在风险", "red", "red-50"),
        "attention": ("需要关注", "orange", "orange-50"),
        "data_gap": ("信息待补", "blue", "blue-50"),
        "normal": ("推进正常", "green", "green-50"),
    }
    definition = definitions.get(project["status"].get("code"))
    if definition is None or project["status"].get("label") != definition[0]:
        raise ValueError("日报项目状态无效")
    status_label, color, background = definition
    short_name = str(project["short_name"]).strip()
    name = str(project["name"]).strip()
    if not short_name or not name:
        raise ValueError("日报项目缺少名称")
    display_name = name if short_name == name else f"{short_name} {name}"
    header = {"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px",
              "columns": [
                  {"tag": "column", "width": "weighted", "weight": 4,
                   "vertical_spacing": "4px", "elements": [
                       {"tag": "markdown", "content": "**" + _markdown_text(display_name) + "**"},
                       _div(f"{project['completed_count']} / {project['task_count']} 项已完成",
                            lines=1, secondary=True),
                   ]},
                  {"tag": "column", "width": "auto", "vertical_align": "center",
                   "elements": [{"tag": "markdown", "content":
                                 f"<font color='{color}'>**{status_label}**</font>"},
                                _div(f"{project['completion_percent']}%", lines=1,
                                     text_size="heading-2", text_align="right")]},
              ]}
    metrics = {"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px",
               "columns": [
                   _report_metric(f"{project['completed_count']}/{project['task_count']}",
                                  "已完成/总数", "项目任务", background=background,
                                  color=color),
                   _report_metric(str(project["in_progress_count"]), "进行中",
                                  "尚未完成", background="grey-50", color="default"),
                   _report_metric(str(project["today_completed_count"]), "今日完成",
                                  "按实际完成时间", background="green-50", color="green"),
                   _report_metric(str(project["overdue_count"]), "逾期",
                                  "未完成且已过截止时间",
                                  background="red-50" if project["overdue_count"] else "grey-50",
                                  color="red" if project["overdue_count"] else "default"),
               ]}
    week_lines = []
    for item in project["week_items"]:
        if (not isinstance(item, dict)
                or not isinstance(item.get("name"), str) or not item["name"].strip()
                or not isinstance(item.get("owner"), str) or not item["owner"].strip()):
            raise ValueError("日报本周事项缺少名称或责任人")
        when = item.get("due_date") or item.get("start_date")
        if not isinstance(when, str):
            raise ValueError("日报本周事项缺少日期")
        week_lines.append(
            f"{_short_date(when)}｜**{_markdown_text(item['name'])}**｜"
            + _person_display(item.get("owner_id"), item["owner"]))
    hidden = project.get("week_hidden_count", 0)
    if type(hidden) is not int or hidden < 0:
        raise ValueError("日报本周事项隐藏数量无效")
    if hidden:
        week_lines.append(f"另有 {hidden} 项请进入任务事项查看。")
    elements = [header, metrics, {"tag": "hr"},
                {"tag": "markdown", "content": "**本周事项**\n"
                 + ("\n".join(week_lines) if week_lines else "本周无已排期的未完成事项。")}]
    if project["tomorrow_due"]:
        lines = []
        for item in project["tomorrow_due"]:
            if (not isinstance(item, dict)
                    or not isinstance(item.get("name"), str) or not item["name"].strip()
                    or not isinstance(item.get("owner"), str) or not item["owner"].strip()):
                raise ValueError("日报明日到期事项不完整")
            lines.append("**" + _markdown_text(item["name"]) + "**｜"
                         + _person_display(item.get("owner_id"), item["owner"]))
        tomorrow_hidden = project.get("tomorrow_due_hidden_count", 0)
        if type(tomorrow_hidden) is not int or tomorrow_hidden < 0:
            raise ValueError("日报明日到期隐藏数量无效")
        if tomorrow_hidden:
            lines.append(f"另有 {tomorrow_hidden} 项。")
        elements.append(_block("明日到期", [
            {"tag": "markdown", "content": "\n".join(lines)}], background="orange-50"))
    milestone = project.get("next_milestone")
    if milestone is not None:
        if (not isinstance(milestone, dict)
                or not isinstance(milestone.get("name"), str) or not milestone["name"].strip()
                or not isinstance(milestone.get("due_date"), str)
                or type(milestone.get("remaining_days")) is not int):
            raise ValueError("日报里程碑结构不完整")
        elements.append({"tag": "markdown", "content":
                         f"**里程碑倒计**　{_markdown_text(milestone['name'])}｜"
                         f"{_short_date(milestone['due_date'])}｜"
                         f"剩余 {milestone['remaining_days']} 天"})
    stale_days = project.get("stale_days")
    if stale_days is not None and (type(stale_days) is not int or stale_days < 0):
        raise ValueError("日报无新完成天数无效")
    last_completed = project.get("last_completed_date")
    if stale_days == 0:
        update_text = "今日已有新完成任务。"
    elif stale_days is None or last_completed is None:
        update_text = "尚未读取到可确认的完成记录。"
    else:
        update_text = (f"已连续 {stale_days} 天无新完成任务，"
                       f"最近完成 {_short_date(last_completed)}。")
    elements.append({"tag": "markdown", "content": "**更新状态**　" + update_text})
    note_count = project.get("data_note_count", 0)
    if type(note_count) is not int or note_count < 0:
        raise ValueError("日报项目数据说明数量无效")
    if note_count:
        elements.append(_div(f"该项目有 {note_count} 项数据待核对，详见数据说明。",
                             lines=2, secondary=True))
    return _block("", elements, background="default")


def _render_daily_card(report, projects, *, include_overview, include_projects,
                       include_tail, page_index, page_count):
    status = report["status"]
    definitions = {
        "risk": ("存在风险", "red"), "attention": ("需要关注", "orange"),
        "data_gap": ("信息待补", "blue"), "normal": ("推进正常", "green"),
    }
    if (not isinstance(status, dict) or status.get("code") not in definitions
            or (status.get("label"), status.get("color")) != definitions[status["code"]]):
        raise ValueError("日报全局状态无效")
    elements = []
    if include_overview:
        elements.extend([
            {"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px",
             "columns": [
                 _report_metric(f"{report['active_project_count']}个", "推进中项目",
                                "只统计状态为推进中"),
                 _report_metric(f"{report['completion_percent']}%", "总体完成度",
                                f"{report['completed_count']} / {report['task_count']} 项",
                                background="green-50", color="green"),
                 _report_metric(f"{report['today_completed_count']}项", "今日完成",
                                "按实际完成时间"),
                 _report_metric(f"{report['overdue_count']}项", "已逾期",
                                f"明日到期 {report['tomorrow_due_count']} 项",
                                background="red-50" if report["overdue_count"] else "orange-50",
                                color="red" if report["overdue_count"] else "orange"),
             ]},
        ])
        risks = report.get("risks")
        if not isinstance(risks, list):
            raise ValueError("日报风险列表无效")
        if risks:
            elements.append(_section_title("风险提示"))
            for item in risks:
                if any(not isinstance(item.get(key), str) or not item[key].strip()
                       for key in ("title", "text")):
                    raise ValueError("日报风险项缺少事实")
                elements.append(_block("", [{"tag": "markdown", "content":
                    "<font color='red'>**" + _markdown_text(item["title"]) + "**</font>\n"
                    + _markdown_text(item["text"])}], background="red-50"))
            hidden = report.get("risk_hidden_count", 0)
            if type(hidden) is not int or hidden < 0:
                raise ValueError("日报隐藏风险数量无效")
            if hidden:
                elements.append(_div(f"另有 {hidden} 项请进入任务事项查看。",
                                     lines=1, secondary=True))
        notes = report.get("data_notes")
        if not isinstance(notes, list):
            raise ValueError("日报数据说明无效")
        if notes:
            elements.append(_section_title("数据说明"))
            text = "\n".join("• " + _markdown_text(str(note)) for note in notes)
            hidden = report.get("data_note_hidden_count", 0)
            if type(hidden) is not int or hidden < 0:
                raise ValueError("日报隐藏数据说明数量无效")
            if hidden:
                text += f"\n• 另有 {hidden} 项数据问题未展开。"
            elements.append(_block("", [{"tag": "markdown", "content": text}],
                                   background="blue-50"))
    if include_projects:
        elements.append(_section_title("分项目进展" if page_index <= 2 else "分项目进展（续）"))
        if projects:
            elements.extend(_daily_project_block(project) for project in projects)
        else:
            elements.append(_block("", [_div("当前没有推进中的项目。", lines=1)],
                                   background="grey-50"))
    if include_tail:
        project_url = _trusted_url(report.get("project_url"), "项目推进入口")
        task_url = _trusted_url(report.get("task_url"), "任务事项入口")
        elements.extend([
            {"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px",
             "columns": [
                 {"tag": "column", "width": "weighted", "weight": 1,
                  "elements": [_open_url_button("查看项目推进管理", project_url,
                                                primary=True)]},
                 {"tag": "column", "width": "weighted", "weight": 1,
                  "elements": [_open_url_button("查看任务事项", task_url,
                                                primary=False)]},
             ]},
            _div(((f"模拟报告日：{_full_date(report['report_date'])}｜"
                   if report["simulated_reference"] else
                   f"报告日：{_full_date(report['report_date'])}｜")
                  + ("实际数据读取：" if report["simulated_reference"] else "数据读取：")
                  + f"{_short_datetime(report['data_read_at'])}｜接收人："
                  f"{str(report.get('recipient_name', '')).strip()}"),
                 lines=3, secondary=True),
        ])
    local_date = _iso_date(report["report_date"], "日报日期")
    weekdays = "一二三四五六日"
    title = ("模拟预览 | " if report["simulated_reference"] else "")
    title += f"AI管培项目日报 · {local_date:%m-%d} 周{weekdays[local_date.weekday()]}"
    if page_count > 1:
        title += f" · {page_index}/{page_count}"
    subtitle = (f"{report['active_project_count']} 个项目推进中 · "
                + ("实际数据读取 " if report["simulated_reference"] else "数据截至 ")
                + _short_datetime(report["data_read_at"]))
    return _message("interactive", _card(
        title, subtitle, elements, False, template="blue",
        status_tag=status["label"], status_color=status["color"]))


def render_project_daily_report_cards(report):
    """Render the daily report while keeping each Card 2.0 payload bounded."""
    if (not isinstance(report, dict) or report.get("kind") != "daily_report"
            or not isinstance(report.get("projects"), list)
            or len(report["projects"]) > 40
            or any(type(report.get(key)) is not int or report[key] < 0 for key in (
                "active_project_count", "completed_count", "task_count",
                "in_progress_count", "completion_percent", "today_completed_count",
                "overdue_count", "tomorrow_due_count", "anomaly_count"))
            or not isinstance(report.get("recipient_name"), str)
            or not report["recipient_name"].strip()
            or type(report.get("simulated_reference")) is not bool
            or not isinstance(report.get("report_date"), str)
            or not isinstance(report.get("period_reference_at"), str)
            or not isinstance(report.get("data_read_at"), str)):
        raise ValueError("日报数据结构不完整")
    projects = report["projects"]
    if len(projects) <= 2:
        return [_render_daily_card(
            report, projects, include_overview=True, include_projects=True,
            include_tail=True, page_index=1, page_count=1)]
    chunks = [projects[index:index + 2] for index in range(0, len(projects), 2)]
    page_count = len(chunks) + 1
    messages = [_render_daily_card(
        report, [], include_overview=True, include_projects=False,
        include_tail=False, page_index=1, page_count=page_count)]
    for page_index, chunk in enumerate(chunks, 2):
        messages.append(_render_daily_card(
            report, chunk, include_overview=False, include_projects=True,
            include_tail=page_index == page_count,
            page_index=page_index, page_count=page_count))
    return messages


def _report_project_block(project):
    required = ("short_name", "name", "completed_count", "task_count",
                "completion_percent", "weekly_completed_count", "weekly_results",
                "next_focus", "status")
    if (not isinstance(project, dict) or any(key not in project for key in required)
            or any(type(project[key]) is not int for key in
                   ("completed_count", "task_count", "completion_percent",
                    "weekly_completed_count"))
            or not isinstance(project["weekly_results"], list)
            or not isinstance(project["next_focus"], list)
            or not isinstance(project["status"], dict)):
        raise ValueError("周报项目块结构不完整")
    short_name = str(project["short_name"]).strip()
    name = str(project["name"]).strip()
    status = str(project["status"].get("label", "")).strip()
    if not short_name or not name or not status:
        raise ValueError("周报项目块缺少名称或状态")
    status_definitions = {
        "risk": ("存在风险", "red"), "attention": ("需要关注", "orange"),
        "data_gap": ("信息待补", "blue"), "normal": ("推进正常", "green"),
    }
    definition = status_definitions.get(project["status"].get("code"))
    if definition is None or status != definition[0]:
        raise ValueError("周报项目状态无效")
    status_color = definition[1]
    milestone = project.get("next_milestone")
    milestone_text = "无未完成里程碑"
    if isinstance(milestone, dict):
        milestone_text = (f"下一里程碑 {_short_date(milestone.get('due_date'))} "
                          + str(milestone.get("name", "")).strip())
    result_text = "；".join(str(item).strip() for item in project["weekly_results"]
                             if isinstance(item, str) and item.strip()) or "本周未读取到新增完成记录"
    focus_text = "；".join(str(item).strip() for item in project["next_focus"]
                            if isinstance(item, str) and item.strip()) or "暂无明确到期任务"
    header = {
        "tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px",
        "columns": [
            {"tag": "column", "width": "auto", "background_style": "blue-50",
             "padding": "8px", "elements": [_div(short_name, lines=1,
                                                     text_size="heading-2", text_color="blue")]},
            {"tag": "column", "width": "weighted", "weight": 4,
             "vertical_spacing": "4px", "elements": [
                 {"tag": "markdown", "content": "**" + _markdown_text(name) + "**"},
                 _div(f"{project['completed_count']} / {project['task_count']} 项｜"
                      f"本周 +{project['weekly_completed_count']}｜{milestone_text}",
                      lines=2, secondary=True),
             ]},
            {"tag": "column", "width": "auto", "vertical_align": "center",
             "elements": [{"tag": "markdown",
                          "content": f"<font color='{status_color}'>**{status}**</font>"},
                          _div(f"{project['completion_percent']}%", lines=1,
                               text_size="heading-2", text_align="right")]},
        ],
    }
    return _block("", [
        header,
        {"tag": "hr"},
        {"tag": "markdown", "content": "**本周成果**　" + _markdown_text(result_text)},
        {"tag": "markdown", "content": "**下周重点**　" + _markdown_text(focus_text)},
    ], background="default")


def _render_weekly_card(report, projects, *, include_overview, include_projects,
                        include_tail, page_index, page_count):
    period = f"{_short_date(report['period_start'])}—{_short_date(report['period_end'])}"
    status = report["status"]
    valid_statuses = {
        "risk": ("存在风险", "red"), "attention": ("需要关注", "orange"),
        "data_gap": ("信息待补", "blue"), "normal": ("推进正常", "green"),
    }
    if (not isinstance(status, dict) or status.get("code") not in valid_statuses
            or (status.get("label"), status.get("color"))
            != valid_statuses.get(status.get("code"))):
        raise ValueError("周报全局状态无效")
    elements = []
    if include_overview:
        summary = report.get("summary")
        if (not isinstance(summary, list) or len(summary) != 3
                or any(not isinstance(item, dict)
                       or not isinstance(item.get("label"), str)
                       or not isinstance(item.get("text"), str) for item in summary)):
            raise ValueError("周报必须包含三条结构化总结")
        elements.extend([
            _section_title("本周总结"),
            _block("", [{"tag": "markdown", "content":
                          f"**{_markdown_text(item['label'])}**　{_markdown_text(item['text'])}"}
                         for item in summary], background="grey-50"),
            {"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px",
             "columns": [
                 _report_metric(f"{report['active_project_count']}个", "推进中项目",
                                "当前状态为推进中"),
                 _report_metric(f"{report['completion_percent']}%", "总体完成度",
                                f"{report['completed_count']} / {report['task_count']} 项",
                                background="green-50", color="green"),
                 _report_metric(f"{report['weekly_completed_count']}项", "本周完成",
                                "按实际完成时间"),
                 _report_metric(f"{report['attention_count']}项", "关注信号",
                                f"逾期 {report['overdue_count']}·"
                                f"3日内到期 {report['due_soon_count']}·"
                                f"4—7日里程碑 {report['milestone_watch_count']}"
                                + (f"\n另有 {report['schedule_gap_count']} 个项目排期待核验"
                                   if report["schedule_gap_count"] else ""),
                                background="orange-50", color="orange"),
             ]},
            _section_title("风险与待关注"),
        ])
        risks = report.get("risks")
        if not isinstance(risks, list):
            raise ValueError("周报风险列表无效")
        if risks:
            for item in risks[:3]:
                if any(not isinstance(item.get(key), str) or not item[key].strip()
                       for key in ("title", "text", "action")):
                    raise ValueError("周报风险项缺少事实或建议")
                background = "red-50" if item.get("level") == "risk" else "orange-50"
                color = "red" if item.get("level") == "risk" else "orange"
                elements.append(_block("", [{"tag": "markdown", "content":
                    f"<font color='{color}'>**{_markdown_text(item['title'])}**</font>\n"
                    + _markdown_text(item["text"]) + "\n" + _markdown_text(item["action"])}],
                    background=background))
            hidden = report.get("risk_hidden_count", 0)
            if type(hidden) is not int or hidden < 0:
                raise ValueError("周报隐藏风险数量无效")
            if hidden:
                elements.append(_div(f"另有 {hidden} 项请进入任务事项查看。",
                                     lines=1, secondary=True))
        else:
            elements.append(_block("", [_div("本期未读取到已发生风险或明确预警信号。",
                                                    lines=2)], background="green-50"))
    if include_projects:
        elements.append(_section_title(
            "分项目进展" if page_index <= 2 else "分项目进展（续）"))
        if projects:
            elements.extend(_report_project_block(project) for project in projects)
        else:
            elements.append(_block("", [_div("当前没有推进中的项目。", lines=1)],
                                   background="grey-50"))
    if include_tail:
        elements.append(_section_title("下周管理重点"))
        focus = report.get("management_focus")
        if not isinstance(focus, list):
            raise ValueError("周报下周管理重点无效")
        if focus:
            focus_lines = []
            for item in focus[:3]:
                if any(not isinstance(item.get(key), str) or not item[key].strip()
                       for key in ("title", "project", "owner", "date_text")):
                    raise ValueError("下周管理重点缺少事项、项目、责任人或日期")
                suffix = "　<font color='orange'>**需你介入**</font>" \
                    if item.get("needs_intervention") is True else ""
                focus_lines.append({"tag": "markdown", "content":
                    f"**{_markdown_text(item['title'])}**｜{_markdown_text(item['project'])}｜"
                    f"{_markdown_text(item['owner'])}｜{_markdown_text(item['date_text'])}{suffix}"})
            elements.append(_block("", focus_lines, background="default"))
        else:
            elements.append(_block("", [_div("下周暂无明确排期事项。", lines=1)],
                                   background="grey-50"))
        elements.append(_section_title("数据说明"))
        notes = report.get("data_notes")
        if not isinstance(notes, list) or len(notes) > 2:
            raise ValueError("周报数据说明最多两条")
        note_text = "\n".join("• " + str(note).strip() for note in notes if str(note).strip())
        elements.append(_block("", [_div(note_text or "本期未读取到影响判断的数据缺口。",
                                                   lines=None)], background="blue-50"))
    if page_index == page_count:
        project_url = _trusted_url(report.get("project_url"), "项目推进入口")
        task_url = _trusted_url(report.get("task_url"), "任务事项入口")
        elements.extend([
            {"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px",
             "columns": [
                 {"tag": "column", "width": "weighted", "weight": 1,
                  "elements": [_open_url_button("查看项目推进管理", project_url,
                                                primary=True)]},
                 {"tag": "column", "width": "weighted", "weight": 1,
                  "elements": [_open_url_button("查看任务事项", task_url,
                                                primary=False)]},
             ]},
            _div((f"报告周期：{_full_date(report['period_start'])}—"
                  f"{_full_date(report['period_end'])[5:]}｜"
                  + (f"模拟周期基准：{_full_date(report['period_reference_at'])}｜"
                     if report["simulated_reference"] else "")
                  + ("实际数据读取：" if report["simulated_reference"] else "数据读取：")
                  + f"{_short_datetime(report['data_read_at'])}｜接收人："
                  f"{str(report.get('recipient_name', '')).strip()}"),
                 lines=3, secondary=True),
        ])
    title = ("模拟预览 | " if report["simulated_reference"] else "")
    title += f"项目周报 | {period}"
    if page_count > 1:
        title += f" · {page_index}/{page_count}"
    subtitle = (("模拟周期 · " if report["simulated_reference"] else "")
                + f"{report['active_project_count']} 个项目推进中 · "
                + ("实际数据读取 " if report["simulated_reference"] else "数据截至 ")
                + _short_datetime(report["data_read_at"]))
    return _message("interactive", _card(
        title, subtitle, elements, False, template="blue",
        status_tag=status["label"], status_color=status["color"]))


def render_project_weekly_report_cards(report):
    """Render one weekly card, or an overview followed by complete project details."""
    if (not isinstance(report, dict) or report.get("kind") != "weekly_report"
            or not isinstance(report.get("projects"), list)
            or len(report["projects"]) > 40
            or any(type(report.get(key)) is not int or report[key] < 0 for key in (
                "active_project_count", "completed_count", "task_count",
                "completion_percent", "weekly_completed_count", "attention_count",
                "overdue_count", "due_soon_count", "milestone_watch_count",
                "schedule_gap_count"))
            or not isinstance(report.get("recipient_name"), str)
            or not report["recipient_name"].strip()
            or type(report.get("simulated_reference")) is not bool
            or not isinstance(report.get("period_reference_at"), str)
            or not isinstance(report.get("data_read_at"), str)):
        raise ValueError("周报数据结构不完整")
    projects = report["projects"]
    if len(projects) <= 4:
        return [_render_weekly_card(
            report, projects, include_overview=True, include_projects=True,
            include_tail=True, page_index=1, page_count=1)]
    chunks = [projects[index:index + 4] for index in range(0, len(projects), 4)]
    page_count = len(chunks) + 1
    messages = [_render_weekly_card(
        report, [], include_overview=True, include_projects=False,
        include_tail=False, page_index=1, page_count=page_count)]
    for page_index, chunk in enumerate(chunks, 2):
        messages.append(_render_weekly_card(
            report, chunk, include_overview=False, include_projects=True,
            include_tail=page_index == page_count,
            page_index=page_index, page_count=page_count))
    return messages


def _reminder_metric(value, label, *, background, color="default"):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("提醒指标值不完整")
    return {"tag": "column", "width": "weighted", "weight": 1,
            "background_style": background, "padding": "12px", "vertical_spacing": "4px",
            "elements": [_div(label, lines=1, secondary=True),
                         _div(value, lines=2, text_size="heading-3", text_color=color)]}


def _simulation_preview_note(payload):
    simulated = payload.get("simulated_reference", False)
    if type(simulated) is not bool:
        raise ValueError("提醒模拟口径标识无效")
    if not simulated:
        return None
    reference = payload.get("period_reference_at")
    data_read = payload.get("data_read_at")
    return _div(
        f"模拟预览｜判断日期：{_full_date(reference)}｜"
        f"实际数据读取：{_short_datetime(data_read)}",
        lines=2, secondary=True)


def _reminder_task_block(title, tasks, *, color, count_label, overdue=False):
    if (not isinstance(tasks, list) or not tasks
            or color not in ("orange", "red")
            or not isinstance(count_label, str) or not count_label.strip()):
        raise ValueError("提醒须包含至少一条任务")
    rows = [{"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px",
             "columns": [
                 {"tag": "column", "width": "weighted", "weight": 1,
                  "elements": [{"tag": "markdown", "content": "**" + title + "**"}]},
                 {"tag": "column", "width": "auto", "elements": [
                     {"tag": "markdown", "content":
                      f"<font color='{color}'>**{_markdown_text(count_label)}**</font>"}]},
             ]}, {"tag": "hr"}]
    displayed = tasks[:5]
    for index, item in enumerate(displayed):
        if any(not isinstance(item.get(key), str) or not item[key].strip()
               for key in ("name", "owner", "due_date")):
            raise ValueError("提醒任务缺少名称、责任人或日期")
        if overdue and (type(item.get("overdue_days")) is not int
                        or item["overdue_days"] < 1):
            raise ValueError("逾期提醒任务缺少有效逾期天数")
        state = f"逾期{item['overdue_days']}天" if overdue else "待完成"
        date_label = "原截止时间" if overdue else "截止时间"
        rows.append({"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px",
                     "columns": [
                         {"tag": "column", "width": "weighted", "weight": 1,
                          "vertical_spacing": "4px", "elements": [
                              {"tag": "markdown", "content":
                               f"**{_markdown_text(item['name'])}**"},
                              {"tag": "markdown", "text_size": "notation", "content":
                               f"<font color='grey'>责任人：{_markdown_text(item['owner'])}　"
                               f"{date_label}：{_short_date(item['due_date'])}</font>"},
                          ]},
                         {"tag": "column", "width": "auto", "vertical_align": "center",
                          "elements": [{"tag": "markdown", "content":
                                        f"<font color='{color}'>**{state}**</font>"}]},
                     ]})
        if index < len(displayed) - 1:
            rows.append({"tag": "hr"})
    if len(tasks) > 5:
        rows.append(_div(f"另有 {len(tasks) - 5} 项请进入项目推进管理查看。",
                         lines=1, secondary=True))
    return _block("", rows, background="grey-50")


def render_milestone_reminder_card(reminder):
    """Render the frozen orange reminder for a 3-day or 1-day milestone."""
    if (not isinstance(reminder, dict) or reminder.get("kind") != "milestone_reminder"
            or reminder.get("remaining_days") not in (1, 3)
            or any(not isinstance(reminder.get(key), str) or not reminder[key].strip()
                   for key in ("project_name", "project_short_name", "milestone_name", "due_date"))):
        raise ValueError("里程碑提醒缺少冻结的项目、节点或日期")
    predecessors = reminder.get("predecessors")
    project_url = _trusted_url(reminder.get("project_url"), "项目推进入口")
    count = len(predecessors) if isinstance(predecessors, list) else 0
    simulation_note = _simulation_preview_note(reminder)
    elements = [
        {"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px", "columns": [
            _reminder_metric(reminder["milestone_name"], "里程碑",
                             background="orange-50"),
            _reminder_metric(_short_date(reminder["due_date"]), "节点日期",
                             background="orange-50"),
            _reminder_metric(f"{reminder['remaining_days']}天", "剩余时间",
                             background="orange-50", color="orange"),
        ]},
        _reminder_task_block("未完成前置任务", predecessors, color="orange",
                             count_label=f"{count}项待推进"),
        _block("", [_div("请确认剩余任务能否按期完成；如存在风险，请及时协调推进，避免影响里程碑交付。",
                            lines=3)], background="orange-50"),
        *([simulation_note] if simulation_note else []),
        _open_url_button("查看项目推进管理", project_url, primary=True),
        {"tag": "markdown", "text_size": "notation", "content":
         f"提醒状态：<font color='orange'>**待关注**</font>｜"
         f"里程碑日期：{_full_date(reminder['due_date'])}｜"
         f"[项目推进管理]({project_url})"},
    ]
    title = ("模拟预览 | " if simulation_note else "")
    title += f"里程碑临近 | {reminder['project_name']}"
    subtitle = ("模拟日期口径 · " if simulation_note else "")
    subtitle += f"距离关键节点还有 {reminder['remaining_days']} 天，仍有 {count} 项前置任务未完成"
    return _message("interactive", _card(
        title, subtitle, elements, False, template="orange",
        status_tag="待关注", status_color="orange"))


def render_overdue_task_reminder_card(reminder):
    """Render the frozen red reminder, grouped once per project and condition set."""
    if (not isinstance(reminder, dict) or reminder.get("kind") != "overdue_reminder"
            or type(reminder.get("max_overdue_days")) is not int
            or reminder["max_overdue_days"] < 1
            or any(not isinstance(reminder.get(key), str) or not reminder[key].strip()
                   for key in ("project_name", "project_short_name"))):
        raise ValueError("逾期提醒缺少冻结的项目或逾期天数")
    tasks = reminder.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("逾期提醒须包含至少一条逾期任务")
    project_url = _trusted_url(reminder.get("project_url"), "项目推进入口")
    simulation_note = _simulation_preview_note(reminder)
    elements = [
        {"tag": "column_set", "flex_mode": "none", "horizontal_spacing": "8px", "columns": [
            _reminder_metric(reminder["project_name"], "所属项目", background="red-50"),
            _reminder_metric(f"{len(tasks)}项", "逾期任务", background="red-50",
                             color="red"),
            _reminder_metric(f"{reminder['max_overdue_days']}天", "最长逾期",
                             background="red-50", color="red"),
        ]},
        _reminder_task_block("逾期任务明细", tasks, color="red",
                             count_label=f"{len(tasks)}项需处理", overdue=True),
        _block("", [_div("请确认任务当前进度，并及时更新完成状态或后续处理安排。",
                            lines=2)], background="red-50"),
        *([simulation_note] if simulation_note else []),
        _open_url_button("查看项目推进管理", project_url, primary=True),
        {"tag": "markdown", "text_size": "notation", "content":
         f"提醒状态：<font color='red'>**已逾期**</font>｜"
         f"最长逾期：{reminder['max_overdue_days']}天｜"
         f"[项目推进管理]({project_url})"},
    ]
    title = ("模拟预览 | " if simulation_note else "")
    title += f"任务逾期 | {reminder['project_name']}"
    subtitle = ("模拟日期口径 · " if simulation_note else "")
    subtitle += f"{len(tasks)} 项任务已超过截止时间，当前仍未完成"
    return _message("interactive", _card(
        title, subtitle, elements, False, template="red",
        status_tag="已逾期", status_color="red"))


def validate_input_feedback_reply(reply):
    """Freeze one internally rendered Card 2.0 operational feedback reply."""
    try:
        frozen = json.loads(json.dumps(reply, ensure_ascii=False, allow_nan=False))
    except (TypeError, ValueError):
        raise ValueError("结构化处理反馈不是有效消息") from None
    content = frozen.get("content") if isinstance(frozen, dict) else None
    if (not isinstance(frozen, dict)
            or set(frozen) != {"msg_type", "content"}
            or frozen.get("msg_type") != "interactive"
            or not isinstance(content, dict) or content.get("schema") != "2.0"
            or content.get("config", {}).get("width_mode") != "default"
            or len(json.dumps(content, ensure_ascii=False).encode("utf-8")) > MAX_MESSAGE_BYTES):
        raise ValueError("结构化处理反馈不是受支持的成功卡片")

    def nodes(value):
        if isinstance(value, dict):
            yield value
            for child in value.values():
                yield from nodes(child)
        elif isinstance(value, list):
            for child in value:
                yield from nodes(child)

    all_nodes = list(nodes(content))
    summary = content.get("config", {}).get("summary", {}).get("content")
    if summary == MATERIAL_MISSING_TITLE:
        supplement_buttons = [node for node in all_nodes
                              if node.get("tag") == "button"
                              and node.get("form_action_type") == "submit"
                              and isinstance(node.get("name"), str)
                              and MATERIAL_SUPPLEMENT_ACTION.fullmatch(node["name"])]
        if len(supplement_buttons) != 1:
            raise ValueError("物料缺项卡没有唯一的服务端续接按钮")
        token = MATERIAL_SUPPLEMENT_ACTION.fullmatch(
            supplement_buttons[0]["name"]).group(1)
        for count in range(1, len(MATERIAL_MISSING_FIELDS) + 1):
            for fields in combinations(MATERIAL_MISSING_FIELDS, count):
                if frozen == render_material_missing_card(fields, token):
                    return frozen
        raise ValueError("物料缺项卡不是内部渲染的固定结构")
    if summary == MATERIAL_SUCCESS_TITLE:
        if (content.get("header") != {
                "title": _plain(MATERIAL_SUCCESS_TITLE), "template": "green",
                "icon": {"tag": "standard_icon", "token": "wiki-bitable_colorful"}}
                or len(content.get("body", {}).get("elements", [])) != 2
                or any(node.get("tag") in {
                    "button", "input", "form", "select_static", "multi_select_static",
                    "date_picker", "picker_time", "picker_datetime",
                } for node in all_nodes)):
            raise ValueError("物料提需成功卡不是固定的只读回执")
        return frozen
    legacy_material = isinstance(summary, str) and summary.startswith(
        ("待审核｜", "未通过｜", "已通过｜"))
    if legacy_material:
        expected_template = ("orange" if summary.startswith("待审核｜") else
                             "red" if summary.startswith("未通过｜") else "green")
        if (content.get("header", {}).get("template") != expected_template
                or content.get("header", {}).get("icon") != {
                    "tag": "standard_icon", "token": "image_colorful"}
                or any(node.get("tag") in {
                    "form", "input", "select_static", "multi_select_static",
                    "date_picker", "picker_time", "picker_datetime",
                } for node in all_nodes)):
            raise ValueError("物料审核卡不是已确认的固定结构")
        buttons = [node for node in all_nodes if node.get("tag") == "button"]
        if summary.startswith("待审核｜"):
            def callback_name(node):
                behaviors = node.get("behaviors")
                if (not isinstance(behaviors, list) or len(behaviors) != 1
                        or not isinstance(behaviors[0], dict)
                        or behaviors[0].get("type") != "callback"):
                    return ""
                value = behaviors[0].get("value")
                return value.get("material_action", "") if isinstance(value, dict) else ""

            names = [callback_name(button) for button in buttons]
            matches = [MATERIAL_CARD_ACTION.fullmatch(name) for name in names]
            if (len(buttons) != 2 or any(match is None for match in matches)
                    or [button.get("text", {}).get("content") for button in buttons]
                    != ["审核通过", "退回修改"]
                    or [match.group(1) for match in matches] != ["ap", "rr"]
                    or len({(match.group(2), match.group(3)) for match in matches}) != 1):
                raise ValueError("待审核卡没有绑定同一记录和精确状态")
        elif buttons:
            raise ValueError("物料审核终态卡不得继续提供操作")
        return frozen
    material = isinstance(summary, str) and summary.startswith("内容物料｜")
    if material:
        if content.get("header", {}).get("template") not in {
                "grey", "blue", "orange", "red", "purple", "turquoise", "green"}:
            raise ValueError("物料卡片颜色与状态不匹配")
        buttons = [node for node in all_nodes if node.get("tag") == "button"]
        callback_buttons = [node for node in buttons if node.get("form_action_type") == "submit"]
        open_buttons = [node for node in buttons if "behaviors" in node]

        def valid_open_button(node):
            behaviors = node.get("behaviors")
            if (not isinstance(behaviors, list) or len(behaviors) != 1
                    or not isinstance(behaviors[0], dict)):
                return False
            url = behaviors[0].get("default_url")
            return (behaviors == [{"type": "open_url", "default_url": url}]
                    and isinstance(url, str) and url.startswith("https://"))

        if (not buttons or len(buttons) != len(callback_buttons) + len(open_buttons)
                or any("value" in node or "behaviors" in node for node in callback_buttons)
                or any(len(str(node.get("name") or "")) > 100
                       or not MATERIAL_CARD_ACTION.fullmatch(str(node.get("name") or ""))
                       for node in callback_buttons)
                or any(not valid_open_button(node) for node in open_buttons)
                or len([node for node in all_nodes if node.get("tag") == "form"]) > 1
                or len([node for node in all_nodes if node.get("tag") == "input"]) > 1
                or any(node.get("tag") in {"select_static", "multi_select_static",
                                            "date_picker", "picker_time", "picker_datetime"}
                       for node in all_nodes)):
            raise ValueError("物料卡片回调未绑定精确记录和状态令牌")
    else:
        if content.get("header", {}).get("template") != "green":
            raise ValueError("结构化处理反馈不是受支持的成功卡片")
        forbidden = {"button", "input", "form", "select_static", "multi_select_static",
                     "date_picker", "picker_time", "picker_datetime"}
        if any(node.get("tag") in forbidden for node in all_nodes):
            raise ValueError("项目启动成功卡不得包含按钮、表单或回调控件")
    return frozen


def _answer_message(action, case):
    payload = action["payload"]
    version = payload["version"]
    item = next((value for value in case["versions"] if value["version"] == version), None)
    if action["kind"] == "rejection_notice":
        if item is None or item["status"] != "rejected":
            raise ValueError("否决通知须对应已否决的真实版本")
        text = payload["text"]
        if payload.get("feedback"):
            text += "\n\n导师意见：\n" + payload["feedback"]
        return _post_parts(f"带教答疑 · 答案 v{version} 已否决", text)
    if (item is None or payload.get("text") != item["text"]
            or version != case["answer_version"]
            or item["status"] != payload.get("answer_status")
            or item["status"] not in ("pending", "approved")):
        raise ValueError("待发送答案必须与当前保存的版本、正文和审核状态一致")
    title = "带教答疑 · 完整回答"
    if action["kind"] == "correction":
        state = "已审核通过" if item["status"] == "approved" else "待导师审核"
        title = f"带教答疑 · 答案 v{version} {state}"
        if payload.get("replaces_version") is not None:
            title += f" · 替代旧答复 v{payload['replaces_version']}"
    return _post_parts(title, item["text"])


def _review_identity(action, case, scope):
    payload = action["payload"]
    generation = case.get("activity_generation")
    if (not isinstance(generation, str) or not generation.strip()
            or action.get("activity_generation") != generation
            or payload.get("activity_generation") != generation):
        raise ValueError("审核动作不属于案件当前活动代")
    version = payload.get("review_version", payload.get("answer_version"))
    if type(version) is not int or version < 1:
        raise ValueError("审核动作须绑定正整数答案版本")
    item = next((value for value in case.get("versions", []) if value.get("version") == version), None)
    if item is None:
        raise ValueError("审核动作对应的答案版本不存在")
    expected = answer_content_hash(case["id"], version, case["question"], item["text"])
    if (payload.get("scope") != scope
            or payload.get("case_id") != case["id"]
            or payload.get("version") != version
            or payload.get("answer_version") != version
            or payload.get("text") != item["text"]
            or payload.get("content_hash") != expected):
        raise ValueError("审核动作未绑定同一案件、答案版本和完整内容哈希")
    return version, item, expected


def _review_form(case_id, version, scope, content_hash, activity_generation, *, publish_plan_id=None,
                 knowledge_type=None, value_rating=None):
    knowledge_type, value_rating = validate_answer_metadata(knowledge_type, value_rating)
    if scope == "answer":
        decisions = [("approve", "通过入库"), ("reject", "退回修改")]
        explanation = None
        label = "修改建议"
        placeholder = "退回修改时请填写具体建议"
    elif scope == "publish":
        if not isinstance(publish_plan_id, str) or not publish_plan_id.strip():
            raise ValueError("入库确认须绑定冻结方案 ID")
        decisions = [("approve", "确认本方案入库"), ("reject", "退回入库方案")]
        explanation = "确认后才会把已通过的同一版问答追加到固定 Q&A 合集。退回时请填写明确意见。"
        label = "入库修改意见（退回时必填）"
        placeholder = "需要修改或退回时请写明完整意见。"
    else:
        raise ValueError("不支持的审核范围")
    buttons = []
    for decision, title in decisions:
        buttons.append({"tag": "button", "name": "trainee_review_" + decision,
                        "text": _plain(title), "width": "fill",
                        "type": "primary_filled" if decision == "approve" else
                                "danger_filled" if decision == "reject" and scope == "answer" else
                                "danger" if decision == "reject" else "default",
                        "form_action_type": "submit"})
    rows = [{"tag": "column_set", "flex_mode": "none", "columns": [
        {"tag": "column", "width": "weighted", "weight": 1, "elements": [button]}
        for button in buttons[index:index + 2]]} for index in range(0, len(buttons), 2)]
    input_element = {"tag": "input", "name": "text", "input_type": "multiline_text",
                     "rows": 3, "required": False, "max_length": 1000, "width": "fill",
                     "label": _plain(label), "placeholder": _plain(placeholder)}
    if scope == "answer":
        input_element.update(auto_resize=True, max_rows=5, label_position="top")
    elements = ([] if explanation is None else [_div(explanation, lines=3, secondary=True)]) + [
        input_element, *rows]
    return {"tag": "form", "name": "mentor_review", "vertical_spacing": "8px",
            "elements": elements}


def _answer_review(action, case):
    version, item, content_hash = _review_identity(action, case, "answer")
    knowledge_type, value_rating = validate_answer_metadata(
        item.get("knowledge_type"), item.get("value_rating"))
    if (action["payload"].get("knowledge_type") != knowledge_type
            or action["payload"].get("value_rating") != value_rating):
        raise ValueError("审核动作未绑定当前答案版本的知识类型和价值评级")
    eligible_pending = (item.get("status") == "pending"
                        and case.get("answer_version") == version
                        and case.get("answer_status") == "pending")
    if action["kind"] == "answer_review_update" and eligible_pending:
        raise ValueError("审核结束更新不得重新开放待审卡片")
    pending = action["kind"] == "answer_review" and eligible_pending
    if pending:
        state = "待审核"
    elif item.get("status") == "approved":
        state = {
            "confirmed": "已通过，正在入库",
            "published": "已完成入库",
        }.get(case.get("qa_publish_status"), "已通过，等待入库")
    else:
        state = {"rejected": "本版已结束"}.get(
            item.get("status"), "本版审核已结束")
    asker = (case.get("event") or {}).get("user_name") or (case.get("event") or {}).get("user_id")
    if not isinstance(asker, str) or not asker.strip():
        raise ValueError("审核卡缺少可显示的提问人")

    def elements(compact=False):
        question = ("完整问题已作为本卡片前置文本发送。" if compact else case["question"])
        answer = ("完整回答已作为本卡片前置文本发送。" if compact else item["text"])
        result = [
            _block("问题", [_div(question, lines=None)], background="grey-50",
                   element_id="question"),
            _block("回答", [_div(answer, lines=None)], background="blue-50",
                   element_id="answer"),
            _metadata_row(asker, knowledge_type, value_rating),
        ]
        if pending:
            result.append(_review_form(
                case["id"], version, "answer", content_hash, case["activity_generation"],
                knowledge_type=knowledge_type, value_rating=value_rating))
        if (not pending and item.get("status") == "approved"
                and case.get("qa_publish_status") == "published"
                and isinstance(case.get("qa_publish_plan"), dict)):
            collection_url = qa_collection_url(case["qa_publish_plan"].get("target"))
            result.append({"tag": "markdown", "text_size": "notation",
                           "content": "审核状态：已通过｜[管培带教问答集]("
                                      + collection_url + ")"})
        else:
            status_text = ("审核状态：待审核｜请确认回答是否准确" if pending
                           else "审核状态：" + state)
            result.append(_div(status_text, lines=2, secondary=True))
        return result

    template = "orange" if pending else ("green" if item.get("status") == "approved" else "grey")
    if pending:
        title = "待审核｜管培带教答疑"
    elif case.get("qa_publish_status") == "published":
        title = "已入库｜管培带教答疑"
    elif case.get("qa_publish_status") == "confirmed":
        title = "入库处理中｜管培带教答疑"
    else:
        title = "审核结果｜管培带教答疑"
    subtitle = "新回答已同步至原入口" if pending else f"答案 v{version}｜{state}"
    try:
        card = _message("interactive", _card(title, subtitle, elements(), pending,
            template=template, status_tag=state))
        return [card]
    except ValueError as exc:
        if "安全体积限制" not in str(exc):
            raise
    card = _message("interactive", _card(title, subtitle, elements(compact=True), pending,
        template=template, status_tag=state))
    if action["kind"] == "answer_review_update":
        return [card]
    return [*_post_parts("带教答疑审核 · 原问题", case["question"]),
            *_post_parts(f"带教答疑审核 · 原回答 v{version}", item["text"]), card]


def _publish_review(action, case):
    version, item, content_hash = _review_identity(action, case, "publish")
    payload = action["payload"]
    plan = case.get("qa_publish_plan")
    target = payload.get("target")
    publish_plan_id = payload.get("publish_plan_id")
    knowledge_type, value_rating = validate_answer_metadata(
        item.get("knowledge_type"), item.get("value_rating"))
    if (not isinstance(plan, dict)
            or not isinstance(publish_plan_id, str) or not publish_plan_id.strip()
            or plan.get("publish_plan_id") != publish_plan_id
            or plan.get("case_id") != case["id"]
            or plan.get("answer_version") != version or plan.get("question") != case["question"]
            or plan.get("answer") != item["text"] or plan.get("content_hash") != content_hash
            or plan.get("knowledge_type") != knowledge_type
            or plan.get("value_rating") != value_rating
            or payload.get("knowledge_type") != knowledge_type
            or payload.get("value_rating") != value_rating
            or plan.get("activity_generation") != case.get("activity_generation")
            or plan.get("target") != target):
        raise ValueError("入库确认卡未绑定第一阶段通过的同一问答与固定目标")
    collection_url = qa_collection_url(target)
    collection_title = target["qa_document_title"]
    eligible_pending = (item.get("status") == "approved"
                        and case.get("answer_version") == version
                        and case.get("qa_publish_status") == "pending_confirmation"
                        and plan.get("status") == "pending")
    if action["kind"] == "publish_review_update" and eligible_pending:
        raise ValueError("入库审核结束更新不得重新开放待审卡片")
    pending = action["kind"] == "publish_review" and eligible_pending
    status = case.get("qa_publish_status")
    state = "待确认入库" if pending else {
        "confirmed": "已确认，正在入库", "published": "已完成入库",
        "rejected": "入库方案已退回"
    }.get(status, "本次入库确认已结束")
    elements = [_block("固定保存位置", [
        _div("Q&A 合集：《" + collection_title + "》", lines=2),
        {"tag": "button", "text": _plain("打开 Q&A 合集"), "type": "default",
         "behaviors": [{"type": "open_url", "default_url": collection_url}]}], colored=True),
        _block("本次保存内容", [
            _div(f"答案 v{version}，已绑定第一阶段通过的同一问题、同一答案版本和完整正文。", lines=3),
            _div("确认后按连续序号追加，保持一个问题对应一个答案。", lines=2,
                 secondary=True)])]
    if pending:
        elements.append(_review_form(case["id"], version, "publish", content_hash,
                                     case["activity_generation"],
                                     publish_plan_id=publish_plan_id,
                                     knowledge_type=knowledge_type, value_rating=value_rating))
    return [_message("interactive", _card("Q&A 入库确认 · " + state,
            f"答案 v{version} · 第二阶段保存确认", elements, pending))]


def render_action(action, case):
    """Return ordered Feishu payloads; the caller performs delivery/update."""
    if (not isinstance(action.get("activity_generation"), str)
            or (case is not None and action.get("activity_generation") != case.get("activity_generation"))):
        raise ValueError("动作不属于当前活动代案件")
    if action.get("kind") == "input_feedback":
        if ((isinstance(case, dict) and action.get("case_id") != case.get("id"))
                or (case is None and action.get("case_id") not in (None, ""))):
            raise ValueError("动作和案件不匹配")
        reply = action["payload"].get("reply")
        if reply is not None:
            return [validate_input_feedback_reply(reply)]
        return render_feedback(
            action["payload"].get("text"),
            event_id=action["payload"].get("event_id"),
            feedback_context=action["payload"].get("feedback_context"),
        )
    if not isinstance(case, dict) or action.get("case_id") != case.get("id"):
        raise ValueError("动作和案件不匹配")
    if action.get("kind") in ("answer", "correction", "rejection_notice"):
        return _answer_message(action, case)
    if action.get("kind") in ("answer_review", "answer_review_update"):
        return _answer_review(action, case)
    if action.get("kind") in ("publish_review", "publish_review_update"):
        raise ValueError("第二阶段入库卡已停用；通过首张审核卡后直接写入固定 Q&A 合集")
    if action.get("kind") in ("archive_review", "archive_review_update"):
        raise ValueError("逐题档案审核已停用；请使用固定 Q&A 合集的双阶段确认")
    raise ValueError("此动作不是可渲染消息")
