-- 0003 v2.0 骨架版的业务表（issue #35，PRD 第 13 节 A 级）。
-- 0001、0002 已在本机开发库执行过，按约定不改，在这里改：
--   - 角色只留管培生、带教，加管理权限字段；带教信息统一记在 mentorship（唯一来源），站和个人路径上的带教字段去掉；
--   - 待办表去掉：骨架期待办是对事实对象的查询，第二轮按 PRD 下篇 R5 重建；
--   - 成果、评审按 v2 重建（成果可挂节点或培养任务，带评审负责人快照；评审的下一步行动移到 next_action）；
--   - 新增项目、节点、受阻、截止调整、下一步行动、认定、能力项、能力证据、带教关系。
-- 现在没有真实业务数据（PRD 4.1：骨架期只用初始化脚本生成的合成数据），所以成果、评审直接重建。
-- 状态值用英文代码，界面按 PRD 4.3 显示中文：
--   项目 draft 草拟 / active 推进中 / ended 已结束；节点、培养任务 todo 未开始 / doing 进行中 / submitted 待评审 / revise 需修改 / passed 已通过（节点另有 cancelled 已取消）。

-- 1. 去掉 v1.1 的待办与旧的成果、评审
drop table todo;
drop table review;
drop table submission;

-- 2. 人员：两种角色 + 管理权限
alter table app_user add column is_admin boolean not null default false;
alter table app_user drop constraint app_user_role_check;
update app_user set is_admin = (role = 'admin'), role = case when role = 'trainee' then 'trainee' else 'mentor' end;
alter table app_user alter column role set default 'trainee';
alter table app_user add constraint app_user_role_check check (role in ('trainee', 'mentor'));
alter table app_user add constraint app_user_admin_is_mentor check (not is_admin or role = 'mentor');
alter table app_user drop column role_assigned_at;

-- 3. 路径与站上不再存带教
alter table personal_path drop column main_mentor_id;
alter table personal_module drop column station_mentor_id;
alter table personal_module drop column prepared_at;

-- 4. 项目
create table project (
  id                  text primary key default gen_random_uuid()::text,
  name                text not null,
  goal                text not null,
  acceptance_criteria text not null,
  acceptor_name       text,                       -- 业务验收人，只记名字，不进系统
  doc_url             text,
  status              text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  created_by          text not null references app_user (id),
  created_at          timestamptz not null default now(),
  confirmed_by        text references app_user (id),
  confirmed_at        timestamptz,
  end_type            text check (end_type in ('done', 'aborted')),
  abort_reason        text,
  closed_by           text references app_user (id),
  closed_at           timestamptz,
  check ((confirmed_by is null) = (confirmed_at is null)),
  check (status <> 'active' or confirmed_at is not null),
  check ((status = 'ended') = (end_type is not null)),
  check ((status = 'ended') = (closed_at is not null)),
  check (end_type is distinct from 'aborted' or coalesce(btrim(abort_reason), '') <> '')
);

-- 项目成员：主责只能一位（部分唯一索引），主责只记在这里，项目上不另存
create table project_member (
  project_id text not null references project (id) on delete cascade,
  trainee_id text not null references app_user (id),
  role       text not null check (role in ('lead', 'member')),
  primary key (project_id, trainee_id)
);
create unique index project_one_lead on project_member (project_id) where role = 'lead';

create table project_station (
  project_id text not null references project (id) on delete cascade,
  station_id text not null references personal_module (id),
  primary key (project_id, station_id)
);

-- 项目结论：交付结论与业务验证分开（PRD 5.3）；结项后仍可补记业务验证（C19）
create table project_conclusion (
  project_id                text primary key references project (id) on delete cascade,
  delivery                  text not null check (delivery in ('met', 'partial', 'unmet')),
  delivery_evidence         text[] not null default '{}',   -- 成果版本 id
  verification_status       text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'na')),
  verification_result       text check (verification_result in ('met', 'partial', 'unmet', 'unknown')),
  verification_source       text,
  verification_evidence_url text,
  verification_confirmer    text,                            -- 可以是只记名字的业务验收人
  verification_confirmed_at timestamptz,
  verification_updated_by   text references app_user (id),
  verification_updated_at   timestamptz,
  lessons                   text not null default '',
  suggestions               text not null default '',
  written_by                text not null references app_user (id),
  updated_at                timestamptz not null default now(),
  check ((verification_status = 'verified') = (verification_result is not null))
);

-- 5. 带教关系：带教信息的唯一来源（PRD 2.4）；范围是全程、某一站或某个项目
create table mentorship (
  id         text primary key default gen_random_uuid()::text,
  mentor_id  text not null references app_user (id),
  trainee_id text not null references app_user (id),
  scope      text not null check (scope in ('all', 'station', 'project')),
  station_id text references personal_module (id),
  project_id text references project (id),
  start_date date not null,
  end_date   date,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check ((scope = 'station') = (station_id is not null)),
  check ((scope = 'project') = (project_id is not null)),
  check (mentor_id <> trainee_id)
);
create index mentorship_trainee on mentorship (trainee_id, scope);

-- 6. 关键节点、节点关联的培养任务、受阻、截止调整
create table milestone (
  id                  text primary key default gen_random_uuid()::text,
  project_id          text not null references project (id) on delete cascade,
  name                text not null,
  goal                text not null default '',
  acceptance_criteria text not null,
  original_due_at     timestamptz not null,
  due_at              timestamptz not null,
  status              text not null default 'todo' check (status in ('todo', 'doing', 'submitted', 'revise', 'passed', 'cancelled')),
  cancel_reason       text,
  created_by          text not null references app_user (id),
  created_at          timestamptz not null default now(),
  check ((status = 'cancelled') = (coalesce(btrim(cancel_reason), '') <> ''))
);
create index milestone_project on milestone (project_id);

-- 培养任务：加「在项目中完成」与关联项目（关联的节点见 milestone_task）
alter table task_instance add column in_project boolean not null default false;
alter table task_instance add column project_id text references project (id);
alter table task_instance add constraint task_instance_in_project_has_project check (not in_project or project_id is not null);

create table milestone_task (
  milestone_id text not null references milestone (id) on delete cascade,
  task_id      text not null references task_instance (id) on delete cascade,
  primary key (milestone_id, task_id)
);

-- 受阻记录：响应不等于解除（PRD 4.4）；一个节点同时最多一条未解除的
create table blocker (
  id            text primary key default gen_random_uuid()::text,
  milestone_id  text not null references milestone (id) on delete cascade,
  reason        text not null check (btrim(reason) <> ''),
  decider       text,                                   -- 需要谁决定
  handler_id    text references app_user (id),          -- 当前处理责任人，默认项目带教
  status        text not null default 'open' check (status in ('open', 'responded', 'resolved')),
  created_by    text not null references app_user (id),
  created_at    timestamptz not null default now(),
  resolved_by   text references app_user (id),
  resolved_at   timestamptz,
  resolve_note  text,
  check ((status = 'resolved') = (resolved_at is not null)),
  check ((resolved_by is null) = (resolved_at is null))
);
create unique index blocker_one_unresolved on blocker (milestone_id) where status <> 'resolved';

create table blocker_response (
  id           text primary key default gen_random_uuid()::text,
  blocker_id   text not null references blocker (id) on delete cascade,
  content      text not null check (btrim(content) <> ''),
  responder_id text not null references app_user (id),
  created_at   timestamptz not null default now()
);

create table deadline_change (
  id           text primary key default gen_random_uuid()::text,
  subject_type text not null check (subject_type in ('milestone', 'task')),
  subject_id   text not null,
  old_due_at   timestamptz not null,
  new_due_at   timestamptz not null,
  reason       text not null check (btrim(reason) <> ''),
  actor_id     text not null references app_user (id),
  created_at   timestamptz not null default now()
);
create index deadline_change_subject on deadline_change (subject_type, subject_id);

-- 7. 成果版本、评审、下一步行动、认定
-- 成果挂一个节点或一个培养任务；提交时存评审负责人快照（PRD 2.4），之后带教关系变了不自动改
create table submission (
  id             text primary key default gen_random_uuid()::text,
  milestone_id   text references milestone (id) on delete cascade,
  task_id        text references task_instance (id) on delete cascade,
  version        integer not null check (version >= 1),
  url            text not null check (btrim(url) <> ''),
  note           text,
  change_note    text,
  channel        text not null default 'web' check (channel in ('web', 'bot')),
  submitter_id   text not null references app_user (id),
  submitted_at   timestamptz not null default now(),
  reviewer_id    text not null references app_user (id),
  review_state   text not null default 'pending' check (review_state in ('pending', 'reviewed')),
  prev_review_id text,                                   -- 再交时关联上一版的评审，外键在 review 建表后补
  check (num_nonnulls(milestone_id, task_id) = 1),
  check (version = 1 or coalesce(btrim(change_note), '') <> ''),
  check ((version = 1) = (prev_review_id is null)),
  unique (milestone_id, version),
  unique (task_id, version)
);
create index submission_reviewer_pending on submission (reviewer_id) where review_state = 'pending';

-- 评审：一个成果版本最多一条评审
create table review (
  id            text primary key default gen_random_uuid()::text,
  submission_id text not null unique references submission (id) on delete cascade,
  reviewer_id   text not null references app_user (id),
  grade         text not null check (grade in ('优秀', '达标', '需改进')),
  comment       text not null default '',
  key_issue     text,                                    -- 深反馈：关键问题
  judgment      text,                                    -- 深反馈：带教判断
  level         text not null default 'light' check (level in ('light', 'deep')),
  created_at    timestamptz not null default now()
);
alter table submission add constraint submission_prev_review foreign key (prev_review_id) references review (id);

-- 下一步行动：修改再交 / 推进后续节点 / 建议（PRD 7.3）
create table next_action (
  id                  text primary key default gen_random_uuid()::text,
  review_id           text not null references review (id) on delete cascade,
  kind                text not null check (kind in ('revise', 'advance', 'suggest')),
  content             text not null check (btrim(content) <> ''),
  owner_id            text references app_user (id),
  target_milestone_id text references milestone (id),
  status              text not null default 'open' check (status in ('open', 'done', 'dropped')),
  resolution          text,                              -- 完成依据或不再需要的原因
  done_submission_id  text references submission (id),   -- 修改再交时自动完成，依据是新版本
  done_at             timestamptz,
  check (kind = 'suggest' or owner_id is not null),
  check ((status = 'open') = (done_at is null))
);
create index next_action_owner_open on next_action (owner_id) where status = 'open';

-- 认定：一个成果版本 + 一个培养任务实例（一人一任务，PRD 3.3）；同一任务最多一条已认定
create table submission_credit (
  id            text primary key default gen_random_uuid()::text,
  submission_id text not null references submission (id) on delete cascade,
  task_id       text not null references task_instance (id) on delete cascade,
  status        text not null default 'credited' check (status in ('pending', 'credited')),
  credited_by   text references app_user (id),
  credited_at   timestamptz,
  unique (submission_id, task_id),
  check ((status = 'credited') = (credited_at is not null)),
  check ((credited_by is null) = (credited_at is null))
);
create unique index submission_credit_one_per_task on submission_credit (task_id) where status = 'credited';

-- 8. 能力项与能力证据（PRD 第 8 节）
create table competency_item (
  id          text primary key default gen_random_uuid()::text,
  no          integer not null,
  name        text not null,
  description text not null default '',
  version     integer not null default 1 check (version >= 1),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (name, version)
);

create table competency_evidence (
  id           text primary key default gen_random_uuid()::text,
  trainee_id   text not null references app_user (id),
  item_id      text not null references competency_item (id),
  source_type  text not null check (source_type in ('submission', 'review', 'observation')),
  source_id    text,
  summary      text not null check (btrim(summary) <> ''),
  -- 证据链按需填：situation 情境与事实 / basis 判断与依据 / action 行动 / result 结果与验证 / revision 反馈后的修改
  detail       jsonb not null default '{}',
  judgment     text not null check (judgment in ('insufficient', 'guided', 'independent')),
  status       text not null default 'confirmed' check (status in ('pending', 'confirmed', 'returned')),
  confirmed_by text references app_user (id),
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  check (source_type = 'observation' or source_id is not null),
  check ((status = 'confirmed') = (confirmed_at is not null))
);
create index competency_evidence_trainee on competency_evidence (trainee_id, item_id);

-- 9. 事件日志：加所属项目；来源加初始化脚本、调试（PRD 4.1）；可见级别骨架期不用
alter table event_log add column project_id text references project (id);
alter table event_log drop constraint event_log_source_check;
alter table event_log add constraint event_log_source_check check (source in ('web', 'bot', 'feishu', 'system', 'script', 'debug'));
alter table event_log alter column visibility drop not null;
create index event_log_project_time on event_log (project_id, occurred_at);
