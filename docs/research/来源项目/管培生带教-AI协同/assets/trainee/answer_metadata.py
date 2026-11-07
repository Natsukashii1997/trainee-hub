"""Domain values attached to one exact answer version."""

import re

KNOWLEDGE_TYPES = (
    "方法论与工具",
    "工作流程",
    "业务知识",
    "规范与标准",
    "项目与任务信息",
    "案例复盘",
    "系统操作",
)

VALUE_RATING_LABELS = {
    "S": "S｜核心必会",
    "A": "A｜高价值",
    "B": "B｜实用参考",
    "C": "C｜情境记录",
}


def validate_answer_metadata(knowledge_type, value_rating):
    if knowledge_type not in KNOWLEDGE_TYPES:
        raise ValueError("答案版本缺少有效知识类型")
    if value_rating not in VALUE_RATING_LABELS:
        raise ValueError("答案版本缺少有效价值评级")
    return knowledge_type, value_rating


_TYPE_PATTERNS = {
    "方法论与工具": (
        (r"5W2H|SMART|MECE|SWOT|PDCA", 8),
        (r"方法论|思维模型|分析框架|工具|诊断|拆解|归因", 4),
        (r"方法|技巧|思路", 2),
    ),
    "工作流程": (
        (r"流程|步骤|环节|闭环|交接", 5),
        (r"先.+再|如何开展|怎么推进|推进顺序|审批|审核|入库", 3),
    ),
    "业务知识": (
        (r"客户|产品|服务|签约|留学|申请|院校|市场|营收|业务", 2),
    ),
    "规范与标准": (
        (r"红线|严禁|禁止|合规|保密|隐私|权限边界", 6),
        (r"规范|制度|准则|口径|验收标准|命名|格式|模板", 4),
        (r"标准|要求|原则", 2),
    ),
    "项目与任务信息": (
        (r"进度|里程碑|关键节点|负责人|截止|排期|交付物|任务状态", 5),
        (r"项目|任务|阶段|验收", 2),
    ),
    "案例复盘": (
        (r"复盘|回顾|经验教训", 6),
        (r"案例|失败原因|成功原因|做得好|没做好", 4),
    ),
    "系统操作": (
        (r"飞书|多维表格|知识库|机器人|系统|后台|页面", 5),
        (r"点击|登录|上传|下载|导出|导入|新增字段|单选字段|配置", 3),
    ),
}

_TYPE_TIE_ORDER = (
    "系统操作", "案例复盘", "工作流程", "规范与标准",
    "项目与任务信息", "方法论与工具", "业务知识",
)


def classify_answer_metadata(question, answer):
    """Classify one already-produced answer without a second model call.

    The rules are deliberately deterministic: the labels are immediate review
    metadata, so the same question and answer always produce the same result.
    """
    if (not isinstance(question, str) or not question.strip()
            or not isinstance(answer, str) or not answer.strip()):
        raise ValueError("知识分类须提供完整问题和答案")
    text = question + "\n" + answer
    scores = {kind: sum(len(re.findall(pattern, text, re.IGNORECASE)) * weight
                        for pattern, weight in patterns)
              for kind, patterns in _TYPE_PATTERNS.items()}
    knowledge_type = max(_TYPE_TIE_ORDER, key=lambda kind: (scores[kind],
                         -_TYPE_TIE_ORDER.index(kind)))
    if scores[knowledge_type] == 0:
        knowledge_type = "业务知识"

    if re.search(r"红线|严禁|禁止|合规|保密|隐私|权限边界|重大风险|法律责任", text):
        value_rating = "S"
    elif (knowledge_type == "项目与任务信息"
          and re.search(r"当前|今天|本周|这周|本月|现在|谁负责|哪一天|什么时候", text)):
        value_rating = "C"
    elif knowledge_type in ("方法论与工具", "工作流程", "规范与标准"):
        value_rating = "A"
    else:
        value_rating = "B"
    return validate_answer_metadata(knowledge_type, value_rating)
