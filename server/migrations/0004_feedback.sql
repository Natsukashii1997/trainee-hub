-- PRD v3.0 第一阶段（总纲 6.1、6.2、7.1；issue #45）：任务标准的三个字段、反馈条目、反馈的验证记录。

-- 1. 任务标准：里程碑已有目标（为什么做、交付什么）和验收标准（怎样算好），再加三项
alter table milestone add column common_mistakes text not null default '';   -- 常见失误，一行一条
alter table milestone add column escalation      text not null default '';   -- 升级条件：什么情况要及时找带教
alter table milestone add column sample_links    jsonb not null default '[]' -- 样例链接：[{ "title": "…", "url": "…" }]
  check (jsonb_typeof(sample_links) = 'array');

-- 2. 反馈条目：评审时分条写（source = review），或带教随手记的口头反馈（source = verbal，总纲 C29）
create table feedback_item (
  id            text primary key default gen_random_uuid()::text,
  trainee_id    text not null references app_user (id),          -- 这条反馈属于谁
  source        text not null check (source in ('review', 'verbal')),
  review_id     text references review (id) on delete cascade,   -- 来源评审
  submission_id text references submission (id) on delete cascade, -- 挂靠的成果版本（可空）
  milestone_id  text references milestone (id) on delete cascade,  -- 挂靠的里程碑（可空）
  no            integer not null default 1 check (no >= 1),         -- 同一次评审里的第几条（同一事务里写的几条 created_at 相同，按它排）
  content       text not null check (btrim(content) <> ''),
  tags          text[] not null default '{}' check (cardinality(tags) <= 2),  -- 自由标签，不从预设里选
  nature        text check (nature in ('standard', 'personal', 'situational')), -- 通用标准问题 / 个人发展问题 / 情境性判断
  needs_action  boolean not null default false,                  -- 这一版就要补上
  verify_next   boolean not null default false,                  -- 下次验证：带教想在之后的成果里看它有没有改
  created_by    text not null references app_user (id),
  created_at    timestamptz not null default now(),
  check ((source = 'review') = (review_id is not null))
);
create index feedback_item_trainee on feedback_item (trainee_id, created_at);
create index feedback_item_review on feedback_item (review_id);

-- 3. 验证记录：一条反馈在一份成果版本上验证一次。「仍存在」「这次没涉及」之后反馈仍待验证，可以在后面的版本上再验证；
--    只有一条「已改善」能说明它改了（总纲 7.3：反馈已记录 ≠ 反馈已被吸收）
create table feedback_verification (
  id            text primary key default gen_random_uuid()::text,
  feedback_id   text not null references feedback_item (id) on delete cascade,
  submission_id text not null references submission (id) on delete cascade,
  result        text not null check (result in ('improved', 'persisting', 'not_covered')),
  verified_by   text not null references app_user (id),
  verified_at   timestamptz not null default now(),
  unique (feedback_id, submission_id)
);
create index feedback_verification_submission on feedback_verification (submission_id);
