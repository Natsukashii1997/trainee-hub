-- 0002 数据关系加固（PR #27 第 1 轮审核意见 P2-03、P2-04、P3-03）。0001 已在本机开发库执行过，按约定不改它，补在这里。

-- 1) 任务的站必须属于同一条个人路径（防止 A 的任务挂到 B 的站上，影响站带教归属和点评权限）。
--    周期任务没有站（station_id 为空），复合外键不检查。
alter table personal_module add constraint personal_module_id_path unique (id, path_id);
alter table task_instance add constraint task_instance_station_same_path
  foreign key (station_id, path_id) references personal_module (id, path_id);

-- 2) 截止时间调整过（记了原截止）就必须写调整原因（PRD 第 9 节）。
alter table task_instance add constraint task_instance_due_adjust_reason
  check (original_due_at is null or coalesce(btrim(due_adjust_reason), '') <> '');

-- 3) 路径模板被期次绑定后只读（PRD 第 4.1 节）：frozen 的模板本身，以及它的阶段、模块、任务模板，
--    都不能改、删、新增；要改另存新版本。冻结（frozen 由 false 改为 true）本身允许。
create function path_template_frozen_guard() returns trigger language plpgsql as $$
begin
  if old.frozen then
    raise exception '路径模板已被期次绑定，只读；要改请另存新版本' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
create trigger path_template_frozen before update or delete on path_template
  for each row execute function path_template_frozen_guard();

create function path_template_child_frozen_guard() returns trigger language plpgsql as $$
declare
  r jsonb;
  t text;
begin
  -- 改之前和改之后的行都查：既不能改冻结模板里的行，也不能把行挪进冻结模板
  foreach r in array array[case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end] loop
    continue when r is null;
    t := case tg_table_name
      when 'stage' then r ->> 'template_id'
      when 'module' then (select s.template_id from stage s where s.id = r ->> 'stage_id')
      when 'task_template' then (select s.template_id from module m join stage s on s.id = m.stage_id where m.id = r ->> 'module_id')
    end;
    if (select frozen from path_template where id = t) then
      raise exception '路径模板已被期次绑定，只读：阶段、模块、任务模板都不能改；要改请另存新版本' using errcode = 'check_violation';
    end if;
  end loop;
  return coalesce(new, old);
end $$;
create trigger stage_frozen before insert or update or delete on stage
  for each row execute function path_template_child_frozen_guard();
create trigger module_frozen before insert or update or delete on module
  for each row execute function path_template_child_frozen_guard();
create trigger task_template_frozen before insert or update or delete on task_template
  for each row execute function path_template_child_frozen_guard();

-- 4) 事件日志只追加：行级触发器挡不住 TRUNCATE，再加一道语句级的。
create trigger event_log_no_truncate before truncate on event_log
  for each statement execute function event_log_append_only();
