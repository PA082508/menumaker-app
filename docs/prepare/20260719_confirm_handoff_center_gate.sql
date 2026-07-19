-- ============================================================================
-- 20260719 — confirm_handoff: гейт по ЦЕНТРУ устройства, комната = контекст
-- PREPARED 2026-07-18 · NOT APPLIED · нужно ДО вечернего деплоя teacher-ветки
--
-- ЗАКАЗ (Николай, 18.07): утренний приём идёт в сборной комнате. Дети РАЗНЫХ
-- классов принимаются на планшете Red. Поэтому:
--   гейт приёма       = центр устройства
--   комната устройства = КОНТЕКСТ записи, не фильтр по классу ребёнка
--
-- ЗАМЕР ТЕКУЩЕГО ПОВЕДЕНИЯ (по телу функции, не по памяти):
--   select * into v_sess from menumaker.safepass_sessions
--    where id = p_session_id and classroom_id = v_dev.classroom_id;
--   if not found then raise exception 'session not in this room'; end if;
-- → RPC ОТВЕРГАЕТ чужую комнату. Ребёнок Blue на девайсе Red сегодня падает
--   в 'session not in this room'. Ослабление ТРЕБУЕТСЯ, подтверждено.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- §1 Где физически произошла передача.
--
--     classroom_id НЕ ТРОГАЕМ: это класс РЕБЁНКА, на нём висит очередь
--     teacher-страницы и realtime-канал. Перезапись потеряла бы класс ребёнка
--     и сломала бы фильтр. Комната устройства едет отдельной колонкой.
-- ---------------------------------------------------------------------------
alter table menumaker.safepass_sessions
  add column if not exists confirmed_classroom_id uuid references menumaker.classrooms(id);

comment on column menumaker.safepass_sessions.confirmed_classroom_id is
  'Комната УСТРОЙСТВА, на котором подтвердили передачу — где это физически '
  'произошло. Отличается от classroom_id (класс ребёнка) при приёме в сборной '
  'комнате. Пишется safepass_confirm_handoff. NULL у записей до 20260719.';

-- ---------------------------------------------------------------------------
-- §2 Функция: гейт на центр, комната пишется как контекст.
--     Меняются РОВНО две вещи. Всё остальное — байт в байт как было.
-- ---------------------------------------------------------------------------
create or replace function menumaker.safepass_confirm_handoff(
  p_token text, p_session_id uuid, p_pin_hash text,
  p_occurred_at timestamp with time zone default now())
returns jsonb language plpgsql security definer
set search_path to 'menumaker', 'public', 'extensions'
as $function$
declare v_dev record; v_staff record; v_sess record; v_offline boolean; begin
  select * into v_dev from menumaker.safepass_devices
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and is_active and revoked_at is null;
  if not found then raise exception 'device not registered'; end if;

  select id, first_name, last_name into v_staff
    from menumaker.staff
   where center_id = v_dev.center_id and is_active and pin_hash = p_pin_hash;
  if not found then raise exception 'invalid PIN'; end if;

  -- ⚠️ ИЗМЕНЕНИЕ 1: было `classroom_id = v_dev.classroom_id`.
  -- Центр — настоящая граница доверия: устройство Ridge не должно подтверждать
  -- ребёнка Pearl. Комната границей быть перестала — это была модель
  -- «один класс = один планшет», которой утро не соответствует.
  select * into v_sess from menumaker.safepass_sessions
   where id = p_session_id and center_id = v_dev.center_id;
  if not found then raise exception 'session not in this center'; end if;

  if v_sess.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'already', true,
                              'staff_id', v_staff.id,
                              'staff_name', v_staff.first_name || ' ' || v_staff.last_name);
  end if;

  v_offline := p_occurred_at < now() - interval '5 seconds';
  update menumaker.safepass_sessions
     set status                 = 'confirmed',
         teacher_confirmed_at   = p_occurred_at,
         teacher_id             = v_staff.id::text,
         teacher_name           = v_staff.first_name || ' ' || v_staff.last_name,
         confirmed_classroom_id = v_dev.classroom_id,   -- ⚠️ ИЗМЕНЕНИЕ 2
         offline_created        = coalesce(offline_created, v_offline),
         offline_synced_at      = case when v_offline then now() else offline_synced_at end
   where id = p_session_id;

  return jsonb_build_object('ok', true,
                            'staff_id', v_staff.id,
                            'staff_name', v_staff.first_name || ' ' || v_staff.last_name,
                            'confirmed_in', v_dev.classroom_id);
end $function$;

commit;

-- ---------------------------------------------------------------------------
-- §3 READ-BACK — заказанный тест: ребёнок Blue на девайсе Red.
--     Выполнять в транзакции с ROLLBACK: он ПИШЕТ (в этом весь смысл теста).
--     Read-back никогда не пишет — поэтому откат здесь обязателен, не опция.
-- ---------------------------------------------------------------------------
-- begin;
--   -- подставить: :tok — токен девайса Red, :blue_child — ребёнок из Blue
--   -- 1. создать тестовую сессию для ребёнка Blue в центре Ridge
--   -- 2. вызвать confirm_handoff с токеном Red и ВЕРНЫМ PIN
--   -- 3. ожидаем: НЕ 'session not in this room' и НЕ 'session not in this center'
--   select menumaker.safepass_confirm_handoff(:'tok', :'blue_session', :'good_hash');
--   -- 4. запись несёт комнату УСТРОЙСТВА, а класс ребёнка сохранён:
--   select (confirmed_classroom_id = (select classroom_id from menumaker.safepass_devices
--                                      where token_hash = encode(digest(:'tok','sha256'),'hex')))
--            as confirmed_in_red,
--          (classroom_id <> confirmed_classroom_id) as child_class_preserved,
--          status = 'confirmed'                     as confirmed
--     from menumaker.safepass_sessions where id = :'blue_session';
-- rollback;

-- ============================================================================
-- §4 ⚠️ ОДНОГО ЭТОГО НЕ ХВАТИТ — следствие на клиенте, нужно решение
--
-- RPC теперь ПРИМЕТ ребёнка Blue на девайсе Red. Но карточка этого ребёнка на
-- планшет Red сегодня не попадёт вообще: SafePassTeacherPage грузит очередь
-- как `.eq('classroom_id', classId)` и подписывается на realtime-канал
-- `safepass:classroom:{classId}`. Сессия ребёнка Blue несёт classroom_id=Blue,
-- поэтому в очереди Red её не будет — воспитателю нечего нажимать.
--
-- То есть «сборная комната» — это ДВЕ правки, а не одна:
--   (1) эта миграция — сервер перестаёт отвергать;   ← готово, ждёт go
--   (2) клиент — очередь сборной комнаты грузится по ЦЕНТРУ, а не по классу.  ← НЕ СДЕЛАНО
--
-- (2) не сделан намеренно: это меняет то, что видит воспитатель на экране, и
-- вариантов минимум два —
--   а) режим «сборная комната» переключателем: очередь по центру, в карточке
--      показывать класс ребёнка (иначе Carolyn не поймёт, чей ребёнок);
--   б) очередь всегда по центру, а класс — просто колонка.
-- (а) ближе к утреннему сценарию и не меняет поведение остальных комнат.
-- Жду слова, какой; после этого правка ложится в ту же teacher-ветку ДО
-- вечернего деплоя.
--
-- 'transfer' (переход ребёнка в свой класс позже) из модели attendance этим
-- заходом НЕ вводится — confirmed_classroom_id как раз даёт ему опору.
-- ============================================================================
