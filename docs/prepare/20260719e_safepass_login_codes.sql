-- ============================================================================
-- 20260719e — SafePass: staff-issued parent LOGIN codes
-- PREPARED 2026-07-19 · NOT APPLIED · нужен go
--
-- ЗАЧЕМ. Родительский вход = телефон + 6-значный код. Код сегодня генерится В
-- БРАУЗЕРЕ родителя и печатается в console — на телефоне нечитаемо. Настоящей
-- доставки (SMS) на пилотной неделе не будет: A2P 10DLC-регистрация оператора —
-- дни-недели, гейт не наш. Поэтому код ВЫДАЁТ ПЕРСОНАЛ: сотрудник под своим
-- логином жмёт «выдать код», называет его родителю голосом/на бумаге, родитель
-- вводит на своём телефоне. Это и есть «код от Play Academy» из письма v2.
--
-- НЕ ПУТАТЬ с safepass_temp_codes / safepass_redeem_temp_code: та пара — КАССА
-- (сотрудник вводит код НА ПЛАНШЕТЕ со своим PIN и сразу создаёт pickup-сессию).
-- Здесь другое: код нужен РОДИТЕЛЮ, чтобы войти на СВОЙ экран. Отдельный контур.
--
-- БЕЗОПАСНОСТЬ — два раздельных права, это главное:
--   ВЫДАЧА  (issue)  — только authenticated (персонал). Код возвращается тому,
--                      кто залогинен, и никогда браузеру родителя.
--   ПРОВЕРКА(verify)  — anon. Родитель шлёт телефон+код, сервер сверяет с
--                      таблицей. Браузер родителя НИКОГДА не видит правильный код
--                      заранее — в этом вся разница с нынешним in-browser OTP.
--   Один и тот же код на выдаче показан только персоналу; на проверке — только
--   сверяется. Знать код, не получив его от персонала, неоткуда.
--
-- НЕ ОРАКУЛ: verify на неизвестный телефон и на неверный код отвечает ОДИНАКОВО
-- (ok:false, error:'invalid'). issue на незарегистрированный телефон — тоже
-- слитно not_authorized, чтобы по кнопке нельзя было проверять номера.
-- ============================================================================

begin;

-- §1 таблица
create table if not exists menumaker.safepass_login_codes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  center_id   uuid,
  phone       text not null,
  code        text not null,
  person_name text,
  issued_by   text,                         -- auth.uid() выдавшего сотрудника
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  is_active   boolean not null default true
);
create index if not exists safepass_login_codes_lookup
  on menumaker.safepass_login_codes (phone, code) where used_at is null and is_active;

alter table menumaker.safepass_login_codes enable row level security;
-- Прямого доступа к таблице ни у кого нет — только через RPC ниже (SECURITY
-- DEFINER). Никаких политик = никакого прямого select/insert даже у authenticated.
-- Код в открытом виде живёт ≤15 мин и виден только через issue его выдавшему.

-- §2 ВЫДАЧА — только персонал (authenticated). Возвращает код ему.
create or replace function menumaker.safepass_issue_login_code(p_phone text)
returns jsonb
language plpgsql security definer set search_path = menumaker, public, extensions as $$
declare
  v_tp    record;
  v_code  text;
  v_kids  int;
begin
  -- только вошедший сотрудник. anon сюда не допущен грантом, но проверяем и тут:
  -- SECURITY DEFINER выполняется от владельца, auth.uid() = вызывающий.
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'staff_only');
  end if;

  select org_id, center_id, person_name into v_tp
    from menumaker.safepass_trusted_persons
   where phone = p_phone and is_active
   order by created_at limit 1;
  if not found then
    -- слитный отказ: по кнопке нельзя выяснять, зарегистрирован ли номер
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  select count(distinct child_id) into v_kids
    from menumaker.safepass_trusted_persons
   where phone = p_phone and is_active;

  -- гасим прежние невыданные коды этого телефона — один живой код за раз
  update menumaker.safepass_login_codes
     set is_active = false
   where phone = p_phone and used_at is null and is_active;

  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');

  insert into menumaker.safepass_login_codes
    (org_id, center_id, phone, code, person_name, issued_by, expires_at)
  values (v_tp.org_id, v_tp.center_id, p_phone, v_code, v_tp.person_name,
          auth.uid()::text, now() + interval '15 minutes');

  return jsonb_build_object('ok', true, 'code', v_code,
    'person_name', v_tp.person_name, 'child_count', v_kids,
    'expires_in_min', 15);
end $$;

-- §3 ПРОВЕРКА — anon. Родитель вводит телефон+код на своём экране.
create or replace function menumaker.safepass_verify_login_code(
  p_phone text, p_code text)
returns jsonb
language plpgsql security definer set search_path = menumaker, public, extensions as $$
declare v_row record;
begin
  select * into v_row from menumaker.safepass_login_codes
   where phone = p_phone and code = p_code
     and used_at is null and is_active and now() < expires_at
   for update;
  if not found then
    -- одинаковый ответ на «нет такого телефона» и «неверный код»
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update menumaker.safepass_login_codes set used_at = now(), is_active = false
   where id = v_row.id;

  return jsonb_build_object('ok', true, 'person_name', v_row.person_name);
end $$;

grant execute on function menumaker.safepass_issue_login_code(text)  to authenticated;
grant execute on function menumaker.safepass_verify_login_code(text,text) to anon, authenticated;
-- issue НЕ выдаётся anon намеренно: код должен доставлять персонал вне браузера.

commit;

-- ---------------------------------------------------------------------------
-- VERIFY (вердикт колонками, Case 5). Подставить реальный Red-телефон вместо
-- ВСТАВЬ_ТЕЛЕФОН только ПОСЛЕ того, как в trusted_persons появятся Red-семьи
-- (сейчас их 0 — см. отдельную задачу привязки). Для проверки самих функций
-- достаточно ZZZSMOKE-номера +19999999999.
-- ---------------------------------------------------------------------------
-- 1) обе функции созданы:
-- select count(*) = 2 as both_created from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='menumaker' and p.proname in
--    ('safepass_issue_login_code','safepass_verify_login_code');
--
-- 2) anon НЕ может выдавать (право issue не выдано anon):
-- select has_function_privilege('anon',
--   'menumaker.safepass_issue_login_code(text)', 'EXECUTE') = false as issue_denied_to_anon;
--
-- 3) выдача от лица персонала + проверка тем же кодом (в откате, ПИШЕТ):
-- begin;
--   select menumaker.safepass_issue_login_code('+19999999999') as issued;   -- вернёт code
--   -- взять code из issued и подставить:
--   select menumaker.safepass_verify_login_code('+19999999999','ВСТАВЬ_КОД') ->> 'ok' as verify_ok; -- true
--   select menumaker.safepass_verify_login_code('+19999999999','000000')    ->> 'error' as wrong_code; -- 'invalid'
--   select menumaker.safepass_verify_login_code('+10000000000','ВСТАВЬ_КОД')->> 'error' as unknown_phone; -- 'invalid' (тот же)
-- rollback;
-- ============================================================================
