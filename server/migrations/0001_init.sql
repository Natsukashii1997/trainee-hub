-- 0001 初始迁移：PRD v1.1 第 9 节的核心对象（issue #1）。
-- 本条建：团队、期次、用户、路径模板（模板 / 阶段 / 模块 / 任务模板）、个人路径、站、任务实例、提交、点评、事件日志、待办。
-- 其余对象（周期任务规则、工作日日历、交接要点、资产、通知等）由后续各票的迁移补上；
-- task_instance.recurring_rule_id 先不加外键，等 recurring_rule 建表时补。
-- 约定：主键是文本 id（与前端示例数据同形），时间一律 timestamptz（存 UTC，显示时按北京时间格式化），日期用 date。

create table team (
  id         text primary key default gen_random_uuid()::text,
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- 路径模板带版本；被期次绑定后只读（frozen），改动另存新版本
create table path_template (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  version     text not null,
  frozen      boolean not null default false,
  based_on_id text references path_template (id),
  created_at  timestamptz not null default now(),
  unique (name, version)
);

create table stage (
  id          text primary key default gen_random_uuid()::text,
  template_id text not null references path_template (id) on delete cascade,
  no          integer not null,
  name        text not null,
  days        integer not null check (days > 0),
  description text not null default '',
  unique (template_id, no)
);

-- 模块 = 岗位；line 是业务线（轮岗排期着色）
create table module (
  id       text primary key default gen_random_uuid()::text,
  stage_id text not null references stage (id) on delete cascade,
  no       integer not null,
  name     text not null,
  line     text check (line in ('客户线', '老师线', '市场线', 'AIBP')),
  days     integer not null check (days > 0),
  unique (stage_id, no)
);

-- 截止规则 = 锚点（站开始 / 站结束）+ 偏移 N 个工作日 + 时刻（北京时间）
create table task_template (
  id                       text primary key default gen_random_uuid()::text,
  module_id                text not null references module (id) on delete cascade,
  no                       integer not null,
  name                     text not null,
  description              text not null default '',
  requirements             jsonb not null default '[]',
  output                   text not null check (output in ('文档', '路演', '表格', '复盘', '录音')),
  days                     integer not null check (days > 0),
  deadline_anchor          text not null check (deadline_anchor in ('station_start', 'station_end')),
  deadline_offset_workdays integer not null default 0,
  deadline_time            time not null,
  unique (module_id, no)
);

create table cohort (
  id          text primary key default gen_random_uuid()::text,
  name        text not null unique,
  template_id text not null references path_template (id),
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  status      text not null default 'preparing' check (status in ('preparing', 'running', 'ended')),
  -- 预置名单：[{ "openId": "...", "name": "..." }]，名单里的人首次登录直接成为本期管培生
  roster      jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

-- 「带教人」不存在用户上，取当前所在站的站带教（personal_module.station_mentor_id）
create table app_user (
  id               text primary key default gen_random_uuid()::text,
  feishu_open_id   text unique,
  name             text not null,
  avatar_url       text,
  role             text not null default 'colleague' check (role in ('trainee', 'mentor', 'admin', 'colleague')),
  team_id          text references team (id),
  cohort_id        text references cohort (id),
  joined_on        date,
  first_login_at   timestamptz,
  role_assigned_at timestamptz,
  stopped_at       timestamptz,
  created_at       timestamptz not null default now()
);

-- 主带教可空：空 = 管理员担任
create table personal_path (
  id             text primary key default gen_random_uuid()::text,
  user_id        text not null references app_user (id),
  cohort_id      text not null references cohort (id),
  start_date     date not null,
  end_date       date not null check (end_date >= start_date),
  main_mentor_id text references app_user (id),
  status         text not null default 'pending' check (status in ('pending', 'running', 'ended')),
  created_at     timestamptz not null default now(),
  unique (user_id, cohort_id)
);

-- 站：带教关系的唯一来源。站带教可空：空 = 由管理员接。时间位置、结清是推算的，不存
create table personal_module (
  id                text primary key default gen_random_uuid()::text,
  path_id           text not null references personal_path (id) on delete cascade,
  module_id         text not null references module (id),
  no                integer not null,
  start_date        date not null,
  end_date          date not null check (end_date >= start_date),
  station_mentor_id text references app_user (id),
  prepared_at       timestamptz,
  unique (path_id, no)
);

-- 任务实例：负责带教不存（路径任务 = 站带教，周期任务 = 主带教）；逾期是查询时算的标记，不是状态
create table task_instance (
  id                text primary key default gen_random_uuid()::text,
  path_id           text not null references personal_path (id) on delete cascade,
  station_id        text references personal_module (id),
  source            text not null check (source in ('template', 'rule')),
  task_template_id  text references task_template (id),
  recurring_rule_id text,
  name              text not null,
  note              text not null default '',
  output            text not null check (output in ('文档', '路演', '表格', '复盘', '录音')),
  completion        text not null default 'link' check (completion in ('link', 'bot-weekly', 'bot-quiz', 'declare')),
  open_at           timestamptz not null,
  due_at            timestamptz not null,
  original_due_at   timestamptz,
  due_adjust_reason text,
  revise_due_at     timestamptz,
  status            text not null default 'todo' check (status in ('todo', 'doing', 'submitted', 'revise', 'passed')),
  created_at        timestamptz not null default now(),
  check (due_at >= open_at),
  check ((source = 'template') = (task_template_id is not null)),
  check ((source = 'rule') = (recurring_rule_id is not null)),
  check (source = 'rule' or station_id is not null)
);
create index task_instance_path_due on task_instance (path_id, due_at);

-- 提交：只收飞书链接（机器人收的周报、本人声明可以没有链接）；再交（第 2 版起）必须写修改说明
create table submission (
  id           text primary key default gen_random_uuid()::text,
  task_id      text not null references task_instance (id) on delete cascade,
  url          text,
  submitted_at timestamptz not null default now(),
  version      integer not null check (version >= 1),
  channel      text not null check (channel in ('web', 'bot')),
  note         text,
  change_note  text,
  unique (task_id, version),
  check (version = 1 or coalesce(btrim(change_note), '') <> '')
);

create table review (
  id            text primary key default gen_random_uuid()::text,
  submission_id text not null references submission (id) on delete cascade,
  mentor_id     text not null references app_user (id),
  grade         text not null check (grade in ('优秀', '达标', '需改进')),
  comment       text not null default '',
  created_at    timestamptz not null default now()
);

-- 事件日志：只追加，不改不删（下方触发器拦截）；推算事件用去重键保证只写一次
create table event_log (
  id           text primary key default gen_random_uuid()::text,
  type         text not null,
  subject_type text not null,
  subject_id   text not null,
  person_id    text references app_user (id),
  actor_id     text references app_user (id),
  source       text not null check (source in ('web', 'bot', 'feishu', 'system')),
  occurred_at  timestamptz not null default now(),
  visibility   text not null check (visibility in ('public', 'restricted', 'owner', 'admin')),
  payload      jsonb not null default '{}',
  dedup_key    text unique
);
create index event_log_person_time on event_log (person_id, occurred_at);
create index event_log_subject on event_log (subject_type, subject_id);

create function event_log_append_only() returns trigger language plpgsql as $$
begin
  raise exception '事件日志只追加，不能修改或删除' using errcode = 'check_violation';
end $$;
create trigger event_log_append_only before update or delete on event_log
  for each row execute function event_log_append_only();

-- 待办：同一规则 + 对象 + 负责人只能有一条未关闭（下方部分唯一索引）；期限待定的规则（R01、R10、R11）为空
create table todo (
  id                 text primary key default gen_random_uuid()::text,
  rule               text not null check (rule ~ '^R(0[1-9]|1[0-2])$'),
  subject_type       text not null check (subject_type in ('user', 'station', 'task', 'asset', 'integration')),
  subject_id         text not null,
  person_id          text references app_user (id),
  owner_id           text not null references app_user (id),
  title              text not null,
  appear_at          timestamptz not null default now(),
  due_at             timestamptz,
  priority           integer not null default 0,
  status             text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  event_id           text references event_log (id),
  closed_by_event_id text references event_log (id),
  closed_at          timestamptz,
  cc                 text[] not null default '{}',
  escalated          boolean not null default false,
  check ((status = 'open') = (closed_at is null))
);
create unique index todo_one_open on todo (rule, subject_type, subject_id, owner_id) where status = 'open';
create index todo_owner_open on todo (owner_id) where status = 'open';
