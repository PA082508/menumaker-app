-- ПЕРЕВОД РЕБЁНКА В ДРУГУЮ КОМНАТУ — событие с датой действия (заход E).
-- Показано владельцу 04.08, применено по слову GO к проекту menumaker
-- (trrmyqfpxntmgxnqkikp) 2026-08-04. Развилка: носитель БЕЗ посева;
-- посев 315 активных детей и экран истории — отдельным заходом после 1 октября.
--
-- (1) ЗАМОК. Замер: событий с field_key='classroom_id' за всё время НОЛЬ.
-- Это не дисциплина, а непроходимая стена: «transfer form» в природе центра нет,
-- а «со слов» было запрещено — комнату меняли мимо системы. Уровень 'marked'
-- (не 'free'): со слов можно И ПОМЕЧАЕТСЯ в истории. `date_in` не участвует
-- вовсе — его затирание при переводе было прежним корнем дрейфа.
update menumaker.child_field_locks
   set lock_level = 'marked', needs_document_text = null
 where field_key = 'classroom_id';

-- (2) НОСИТЕЛЬ. Поле хранит ГДЕ ребёнок сейчас; история — С КАКОГО ДНЯ и почему.
create table if not exists menumaker.child_room_history (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references core.organizations(id),
  center_id         uuid not null references menumaker.centers(id),
  roster_id         uuid not null references menumaker.roster(id),
  from_classroom_id uuid references menumaker.classrooms(id),
  to_classroom_id   uuid not null references menumaker.classrooms(id),
  effective_from    date not null,
  reason            text,
  entered_by        uuid references auth.users(id),
  entered_by_name   text,
  entered_at        timestamptz not null default now()
);

create index if not exists child_room_history_lookup_idx
  on menumaker.child_room_history (roster_id, effective_from desc);

alter table menumaker.child_room_history enable row level security;

drop policy if exists org_isolation on menumaker.child_room_history;
create policy org_isolation on menumaker.child_room_history
  for all using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));

drop policy if exists deny_teacher on menumaker.child_room_history;
create policy deny_teacher on menumaker.child_room_history
  as restrictive for all
  using (not core.has_org_role(org_id, array['teacher']))
  with check (not core.has_org_role(org_id, array['teacher']));

-- ТОЛЬКО чтение и добавление: история переводов ВПЕРЁД. Ошибочный перевод
-- исправляется НОВЫМ переводом, а не правкой старой строки.
grant select, insert on menumaker.child_room_history to authenticated;

comment on column menumaker.child_room_history.effective_from is
  'Transfer Date — день, с которого ребёнок числится в новой комнате. НЕ дата ввода.';

-- (3) Какая комната была у ребёнка в конкретный день.
--
-- `known` СУЩЕСТВУЕТ НАРОЧНО. У 315 активных детей комната есть, а истории нет
-- (посев — после 1 октября). Возвращать им сегодняшнюю комнату как факт о прошлом
-- дне значило бы утверждать, что ребёнок всегда был там, где он сейчас.
-- Функция отвечает честно: вот комната, но это НЕ знание о том дне.
create or replace function menumaker.room_on(p_roster uuid, p_day date)
returns table(classroom_id uuid, known boolean)
language sql stable
set search_path to 'menumaker','public','core'
as $function$
  (
    select h.to_classroom_id, true
      from menumaker.child_room_history h
     where h.roster_id = p_roster and h.effective_from <= p_day
     order by h.effective_from desc, h.entered_at desc
     limit 1
  )
  union all
  (
    select r.classroom_id, false
      from menumaker.roster r
     where r.id = p_roster
       and not exists (select 1 from menumaker.child_room_history h2
                        where h2.roster_id = p_roster and h2.effective_from <= p_day)
     limit 1
  );
$function$;
