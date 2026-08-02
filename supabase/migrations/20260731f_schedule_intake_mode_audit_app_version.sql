-- 1. Признак приёма: событие по расписанию или «по приходу» (накопительный).
--    Влияет ТОЛЬКО на своевременность. Ни на задвоение, ни на счёт заявки не влияет.
alter table menumaker.meal_schedule
  add column if not exists intake_mode text not null default 'event'
  check (intake_mode in ('event','on_arrival'));

comment on column menumaker.meal_schedule.intake_mode is
  'event = приём в точке времени: окно применимо, метрика и запрет работают. '
  'on_arrival = накопительный (дети кормятся по приходу): окна нет, своевременность НЕ измеряется '
  '(ответ «не измеряется», НЕ ноль), запрет отметки до окна НЕ ставится. '
  'ВЛИЯЕТ ТОЛЬКО НА СВОЕВРЕМЕННОСТЬ: проверка задвоения и счёт заявки этот признак НЕ читают.';

-- Завтрак — по приходу (канон владельца 31.07). Остальные приёмы — события.
update menumaker.meal_schedule set intake_mode = 'on_arrival' where slot = 'breakfast';

-- 2. След правки окна: кто, когда, что было, что стало.
--    Окно решает, кто «опоздал», — менять его молча нельзя.
create table if not exists menumaker.meal_schedule_events (
  id             uuid primary key default gen_random_uuid(),
  schedule_id    uuid,
  classroom_id   uuid not null,
  center_id      uuid,
  org_id         uuid,
  slot           text not null,
  action         text not null,
  old_start      time, old_end      time, old_mode text,
  new_start      time, new_end      time, new_mode text,
  changed_by     uuid default auth.uid(),
  changed_at     timestamptz not null default now()
);
create index if not exists meal_schedule_events_room_idx
  on menumaker.meal_schedule_events (classroom_id, slot, changed_at desc);

alter table menumaker.meal_schedule_events enable row level security;
drop policy if exists msched_events_select on menumaker.meal_schedule_events;
create policy msched_events_select on menumaker.meal_schedule_events
  for select to authenticated
  using (center_id = any (menumaker.my_center_ids()) or menumaker.is_org_owner(org_id));
grant select on menumaker.meal_schedule_events to authenticated;

create or replace function menumaker.log_meal_schedule_change() returns trigger
language plpgsql security definer set search_path to 'menumaker','public' as $fn$
begin
  if tg_op = 'INSERT' then
    insert into menumaker.meal_schedule_events
      (schedule_id, classroom_id, center_id, org_id, slot, action,
       new_start, new_end, new_mode)
    values (new.id, new.classroom_id, new.center_id, new.org_id, new.slot, 'insert',
            new.start_time, new.end_time, new.intake_mode);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.start_time is distinct from new.start_time
       or old.end_time is distinct from new.end_time
       or old.intake_mode is distinct from new.intake_mode then
      insert into menumaker.meal_schedule_events
        (schedule_id, classroom_id, center_id, org_id, slot, action,
         old_start, old_end, old_mode, new_start, new_end, new_mode)
      values (new.id, new.classroom_id, new.center_id, new.org_id, new.slot, 'update',
              old.start_time, old.end_time, old.intake_mode,
              new.start_time, new.end_time, new.intake_mode);
    end if;
    return new;
  else
    insert into menumaker.meal_schedule_events
      (schedule_id, classroom_id, center_id, org_id, slot, action,
       old_start, old_end, old_mode)
    values (old.id, old.classroom_id, old.center_id, old.org_id, old.slot, 'delete',
            old.start_time, old.end_time, old.intake_mode);
    return old;
  end if;
end $fn$;

drop trigger if exists meal_schedule_audit on menumaker.meal_schedule;
create trigger meal_schedule_audit
  after insert or update or delete on menumaker.meal_schedule
  for each row execute function menumaker.log_meal_schedule_change();

-- 3. Версия клиента в каждой отметке. Отметка БЕЗ версии = старый клиент —
--    косвенный признак («нет строки журнала») становится прямым.
alter table menumaker.meal_count_marks add column if not exists app_version text;
