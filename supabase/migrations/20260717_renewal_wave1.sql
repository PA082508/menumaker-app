-- 20260717_renewal_wave1.sql — RENEWAL КОНТУР, ВОЛНА 1
--
-- ✅ APPLIED 2026-07-16 on Nikolay's go. Spec: docs/specs/renewal-contour-spec.md §5.
--
-- READ-BACK (actual): refresh_action_items(<org>) now returns ELEVEN keys —
--   pre-existing, all survived: licenses 2 · claims 3 · documents 4 · eligibility 3
--     · substitutions 0 · approvals 2 · licenses_no_date 1 · duplicates 16
--     · duplicates_fuzzy 0
--   new: renewal_signatures 1 · renewal_unmatched 3
-- Nine out of nine old keys present = no block was dropped by the rewrite.
--
-- HOW THE WIRING WAS DONE — better than the plan below, so recording it:
--   the two edits were applied to pg_get_functiondef() output INSIDE the same
--   transaction, via a DO block that replace()s three anchors (each asserted to
--   exist exactly once, aborting if not) and EXECUTEs the result. The 13KB body was
--   never copied into this file or through my hands, so the drift this file warned
--   about was made structurally impossible rather than merely watched for.
--
-- DRY RUN 2026-07-16 — весь пакет выполнен на ЖИВОЙ базе внутри транзакции и
-- откачен. Не «должно скомпилироваться», а скомпилировалось и отработало:
--   refresh_renewal_action_items(<org>) → {"renewal_signatures": 1, "renewal_unmatched": 3}
-- Проверка отката: campaigns / campaign_issues / refresh_renewal_action_items —
-- не существуют; CHECK статуса вернулся к трём значениям; action_items с
-- source='renewal_scan' — 0 строк. База нетронута.
--
-- ЧТО ВНУТРИ И ЗАЧЕМ
-- ─────────────────
--   A. campaigns        — кампания как минимальная сущность (решение 6)
--   B. campaign_issues  — факт выдачи prefill. ЕДИНСТВЕННЫЙ источник стадии
--                         «отправлено» и колонки «кому ещё послать». Критический путь:
--                         без неё нет трекера, поэтому это первая миграция контура.
--   C. status 'received' — авто-файл (решение 3) без ручного Approve
--   D. refresh_renewal_action_items — блок красной цифры в ЕДИНОМ примитиве
--                         (решение 5), а не четвёртый ad-hoc счётчик
--   E. attendance: НЕ ЗДЕСЬ — см. хвост файла
--
-- ГЛАВНЫЙ ИНВАРИАНТ ЦИФРЫ (решение 4): красная цифра = подписи директора +
-- расхождения/несматченные. АВТО-ФАЙЛЕННОЕ В ЦИФРУ НЕ ВХОДИТ. Иначе сигнал снова
-- станет «150» и умрёт. Авто-филенное видно в трекере как 'received' — видно ≠ actionable.
-- «Не отправлено» — тоже НЕ в цифре: отдельная вкладка/счётчик.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Кампания = минимальная сущность
--    Реестрово, БЕЗ хардкода «июль 2026»: кампания — это набор форм × набор детей
--    × срок. Тот же контур обслуживает zero-migration onboarding нового клиента.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists menumaker.campaigns (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  center_id   uuid,                       -- null = вся организация
  title       text not null,
  -- Ключи РЕЕСТРА, не URL. Издание берётся из registry.current в момент выдачи,
  -- поэтому «продлить» = указать на новое current, а фискальный год выпадает из
  -- токена издания сам (parseIeaFiscalYear) — никакой арифметики по датам.
  form_keys   text[] not null check (cardinality(form_keys) > 0),
  starts_on   date,
  due_on      date,
  status      text not null default 'draft' check (status in ('draft','active','closed')),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  check (due_on is null or starts_on is null or due_on >= starts_on)
);
create index if not exists campaigns_org_status_idx on menumaker.campaigns (org_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Факт выдачи prefill
--    Сегодня НИГДЕ не фиксируется, что семье выдали ссылку. Без этой таблицы
--    «отправлено» неоткуда взять, а «кому ещё послать» = ростер МИНУС эта таблица.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists menumaker.campaign_issues (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  campaign_id uuid not null references menumaker.campaigns(id) on delete cascade,
  center_id   uuid not null,
  child_id    uuid,                        -- → roster(id); null = адресат без матча
  guardian_id uuid,
  form_key    text not null,
  issued_at   timestamptz not null default now(),
  issued_by   uuid,
  channel     text check (channel in ('link','qr','email','paper')),
  -- Едет в prefill-ссылке и возвращается в сабмите — так «заполнено» смыкается
  -- с «отправлено» БЕЗ гадания.
  issue_token uuid not null default gen_random_uuid(),
  revoked_at  timestamptz
);
-- Повторная выдача той же формы тому же ребёнку в той же кампании — это не новая
-- выдача, а переотправка. Уникальность не даёт трекеру двоиться.
create unique index if not exists campaign_issues_unique_live
  on menumaker.campaign_issues (campaign_id, child_id, form_key)
  where revoked_at is null and child_id is not null;
create unique index if not exists campaign_issues_token_idx on menumaker.campaign_issues (issue_token);
create index if not exists campaign_issues_center_idx on menumaker.campaign_issues (center_id, campaign_id);

-- RLS по образцу сиблингов (auth_manage + org_isolation).
-- ⚠️ deny_teacher НЕ вешаем: политика RESTRICTIVE и ALL-deny; см.
--    docs/specs/identity-teacher-spec.md §0.2 — она убила бы доступ в день
--    появления реальной роли. Граница учителя решается там, а не здесь.
alter table menumaker.campaigns       enable row level security;
alter table menumaker.campaign_issues enable row level security;

create policy auth_manage   on menumaker.campaigns       for all to authenticated using (true) with check (true);
create policy org_isolation on menumaker.campaigns       as restrictive for all to authenticated
  using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));
create policy auth_manage   on menumaker.campaign_issues for all to authenticated using (true) with check (true);
create policy org_isolation on menumaker.campaign_issues as restrictive for all to authenticated
  using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));

grant select, insert, update, delete on menumaker.campaigns       to authenticated;
grant select, insert, update, delete on menumaker.campaign_issues to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. status 'received' — авто-файл без ручного Approve
--    CHECK сегодня прибит к ('pending','approved','rejected')
--    (20260703_enrollment_submissions.sql:32).
-- ─────────────────────────────────────────────────────────────────────────────
alter table menumaker.enrollment_submissions drop constraint if exists enrollment_submissions_status_check;
alter table menumaker.enrollment_submissions add constraint enrollment_submissions_status_check
  check (status in ('pending','approved','rejected','received'));

comment on column menumaker.enrollment_submissions.status is
  'pending = ждёт человека · approved = проведён руками · rejected · received = АВТО-ФАЙЛ '
  '(renewal, сматчен с ростером, валидация чистая, форма несёт auto_file и НЕ требует '
  'контрподписи). received виден в трекере, но НИКОГДА не входит в красную цифру.';

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Красная цифра — блок в едином примитиве (решение 5)
--    Отдельная функция, а не переписывание 200-строчной refresh_action_items:
--    см. «ВНИМАНИЕ ПРИ ПРИМЕНЕНИИ» в хвосте.
-- ─────────────────────────────────────────────────────────────────────────────
-- Формы с requires_countersign='director' (решение 1). Одно место, а не строковый
-- литерал в двух запросах.
--
-- ⚠️ ЗНАЧЕНИЯ СВЕРЕНЫ С ЖИВОЙ БД 2026-07-16, И ОДНО ИЗ РЕШЕНИЯ НЕ СУЩЕСТВУЕТ.
--   Фактические submission_type в enrollment_submissions:
--     cacfp_enrollment · child_release_authorization · dcy_01234 · iea · other · parent_consent
--   • 'release_auth'            — ТАКОГО ТИПА НЕТ. Реальный = 'child_release_authorization'
--                                 (2 строки). Ключ реестра тоже child_release_authorization.
--   • 'transition_into_program' — строк НЕТ: форма ещё не флипнута (DARK). Оставлена
--                                 на будущее, сегодня просто ничего не матчит.
--   • 'dcy_01234'              — есть (1 pending). ✅
create or replace function menumaker.renewal_countersign_types()
returns text[] language sql immutable set search_path to '' as $function$
  select array['transition_into_program','dcy_01234','child_release_authorization']::text[]
$function$;
grant execute on function menumaker.renewal_countersign_types() to authenticated;

create or replace function menumaker.refresh_renewal_action_items(
  p_org_id uuid, p_as_of date default current_date)
returns jsonb
language plpgsql security definer set search_path to 'menumaker','core','public'
as $function$
declare rec record; v_sign int := 0; v_mismatch int := 0;
begin
  if auth.uid() is not null and not core.is_org_member(p_org_id) then
    raise exception 'not a member of org %', p_org_id using errcode = '42501';
  end if;

  update menumaker.action_items set status='resolved', resolved_at=now(), updated_at=now()
   where org_id=p_org_id and source='renewal_scan' and status='open';

  -- (1) Ждёт подписи директора. Форма несёт requires_countersign='director'
  --     (transition_into_program, dcy_01234, release_auth) — такие НИКОГДА не
  --     авто-филятся, даже при чистой валидации.
  for rec in
    select es.center_id, ct.name center_name, count(*) n
    from menumaker.enrollment_submissions es
    left join menumaker.centers ct on ct.id = es.center_id
    where es.org_id = p_org_id
      and es.status = 'pending'
      and es.submission_type = any (menumaker.renewal_countersign_types())
    group by 1,2
  loop
    perform menumaker.raise_action_item(p_org_id,'enrollment','high',
      'Awaiting director signature: '||rec.n||' ('||coalesce(rec.center_name,'?')||')',
      'These forms require the director to countersign before they can be filed.',
      'renewal_scan','enrollment_submissions',null,
      'renewal:sign:'||rec.center_id, null);
    v_sign := v_sign + 1;
  end loop;

  -- (2) Расхождения / несматченные. child_id is null = сабмит не сомкнулся с
  --     ребёнком ростера → руками. Гадать нельзя: неверный авто-матч тихо кладёт
  --     документ в чужую карточку.
  for rec in
    select es.center_id, ct.name center_name, count(*) n
    from menumaker.enrollment_submissions es
    left join menumaker.centers ct on ct.id = es.center_id
    where es.org_id = p_org_id
      and es.status = 'pending'
      and es.child_id is null
      and not (es.submission_type = any (menumaker.renewal_countersign_types()))
      and es.submission_type <> 'staff'
    group by 1,2
  loop
    perform menumaker.raise_action_item(p_org_id,'enrollment','high',
      'Submissions not matched to a child: '||rec.n||' ('||coalesce(rec.center_name,'?')||')',
      'A renewal that cannot be matched to a roster child is never auto-filed — it waits '
      'for a person. New enrolments live here too.',
      'renewal_scan','enrollment_submissions',null,
      'renewal:unmatched:'||rec.center_id, null);
    v_mismatch := v_mismatch + 1;
  end loop;

  -- ⚠️ НАМЕРЕННО НЕ СЧИТАЕМ:
  --   status='received'  — авто-файленное. Решение 4. Видно в трекере, не в цифре.
  --   «не отправлено»    — отдельная вкладка/счётчик трекера, не красная цифра.
  return jsonb_build_object('renewal_signatures', v_sign, 'renewal_unmatched', v_mismatch);
end $function$;

revoke execute on function menumaker.refresh_renewal_action_items(uuid, date) from public, anon;
grant  execute on function menumaker.refresh_renewal_action_items(uuid, date) to authenticated;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ ВНИМАНИЕ ПРИ ПРИМЕНЕНИИ — ДВА ШАГА, КОТОРЫХ НЕТ В ЭТОМ ФАЙЛЕ, И ПОЧЕМУ
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 1) ВКЛЮЧЕНИЕ БЛОКА В refresh_action_items.
--    Postgres не умеет «добавить строку в функцию» — только CREATE OR REPLACE со
--    ВСЕМ телом. refresh_action_items — ~200 строк живой логики (9 блоков).
--    Вставлять сюда её копию НЕЛЬЗЯ: копия протухнет между prepare и go, и мы
--    молча откатим чей-то блок. Это ровно та ошибка, что уже стоила нам дня
--    (20260715:96-97 — комментарий вместо запроса).
--
--    Поэтому на шаге go тело берётся из ЖИВОЙ базы и правится двумя строками:
--      a) перед `return jsonb_build_object(...)`:
--             v_ren := menumaker.refresh_renewal_action_items(p_org_id, p_as_of);
--         (+ `v_ren jsonb;` в declare)
--      b) в return: `|| v_ren`  → счётчики контура едут в тот же jsonb.
--
--    Генерировать так:
--      select pg_get_functiondef('menumaker.refresh_action_items(uuid,date)'::regprocedure);
--    → внести две правки → применить. Read-back: вызвать refresh_action_items и
--      убедиться, что в jsonb появились renewal_signatures / renewal_unmatched,
--      А ВСЕ ДЕВЯТЬ прежних ключей на месте (licenses, claims, documents,
--      eligibility, substitutions, approvals, licenses_no_date, duplicates,
--      duplicates_fuzzy). Пропажа ключа = снесённый блок.
--
-- 2) КОД, КОТОРЫЙ НАДО ПРАВИТЬ ВМЕСТЕ С 'received' — иначе авто-файленное
--    ИСЧЕЗНЕТ ИЗ ВИДА, а не уйдёт из цифры:
--      · EnrollmentInboxPage.tsx:143   .eq('status','pending')  — жёстко прибит
--      · CenterRosterPage.tsx:239      ad-hoc счётчик бейджа
--      · StaffPage.tsx:53              ad-hoc счётчик бейджа
--    Общего примитива у бейджа нет — эти два счётчика и есть «единый примитив»,
--    который решение 5 просит свести в action_items.
--
-- 3) ATTENDANCE ЗДЕСЬ НЕТ, И ЭТО НАМЕРЕННО.
--    Заказ: «attendance action_type CHECK → ('in','out','transfer') — если таблица
--    ещё не катана, просто в SQL пакета». Таблицы attendance_records НЕ существует
--    (проверено), и создавать её в renewal-пакете нельзя: это другой контур, другой
--    go, и её форма ещё ждёт ответа про transfer. Решение зафиксировано в
--    docs/specs/attendance-module-spec.md — при создании таблицы CHECK сразу
--    трёхзначный: check (kind in ('in','out','transfer')).
--
-- 4) ⚠️ У АВТО-ФАЙЛА НЕТ ИСПОЛНИТЕЛЯ — ВОПРОС К НИКОЛАЮ ДО GO.
--    Кто именно ставит status='received'? Сегодня — некому:
--      · submit_enrollment_form кладёт status='pending', child_id=null и на этом всё;
--      · матчинг (matchRoster) и валидация (validateSubmission) — это КЛИЕНТСКИЙ код,
--        живёт в браузере и выполняется, только когда человек ОТКРЫЛ Inbox;
--      · фонового процесса нет.
--    Значит «авто-файл без ручного Approve» пока не имеет рантайма: строка так и
--    останется pending, пока её не увидит человек — то есть ровно то, от чего контур
--    уходит.
--
--    Замер, который это подтверждает: из 72 строк enrollment_submissions
--    child_id заполнен ТОЛЬКО у 17 approved. У всех pending/rejected — null.
--    То есть child_id проставляет Approve, а не приём. Следствие для блока (2):
--    сегодня `child_id is null` означает не «расхождение», а «ещё никто не смотрел»,
--    и цифра посчитает ВСЁ pending — снова «150».
--
--    Варианты рантайма (решение Николая):
--      (а) внутри submit_enrollment_form — матч+валидация в SQL при приёме. Честно и
--          мгновенно, но матчинг придётся переписать с TS на SQL (Левенштейн есть:
--          extensions.levenshtein уже используется в дубль-детекторе).
--      (б) edge-функция по вебхуку/крону — переиспользует TS-матчинг as-is.
--      (в) блок в refresh_action_items — но это скан, а не запись; ставить статусы
--          из скана = смешивать наблюдение с действием.
--    Рекомендую (б): matchRoster/validateSubmission переезжают без переписывания,
--    а submit остаётся тонким.
--
--    ДО ЭТОГО РЕШЕНИЯ блок (2) считает «всё pending без матча» — что верно как
--    «ждёт человека», но НЕ является обещанным сужением. Сужение включится вместе
--    с рантаймом авто-файла.
--
-- ROLLBACK:
--   drop function if exists menumaker.refresh_renewal_action_items(uuid, date);
--   alter table menumaker.enrollment_submissions drop constraint enrollment_submissions_status_check;
--   alter table menumaker.enrollment_submissions add constraint enrollment_submissions_status_check
--     check (status in ('pending','approved','rejected'));   -- ⚠️ упадёт, если 'received' уже записан
--   drop table if exists menumaker.campaign_issues;
--   drop table if exists menumaker.campaigns;
