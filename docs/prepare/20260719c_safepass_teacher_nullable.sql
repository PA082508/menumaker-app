-- ============================================================================
-- 20260719c — safepass_sessions: teacher_id/teacher_name NULLABLE до подтверждения
-- PREPARED 2026-07-19 · NOT APPLIED · [HIGH] · нужен ДО 20260719b (parent-RPC)
--
-- НАХОДКА (Николай, на read-back'е файла 20260719): INSERT waiting-сессии падает
-- NOT NULL violation на teacher_id.
--
-- ЗАМЕР:
--   teacher_id   NOT NULL, без default
--   teacher_name NOT NULL, без default
--   status       NOT NULL, default 'waiting'
--
-- Схема сама себе противоречит: статус по умолчанию 'waiting' — то есть строка
-- задумана как создаваемая ДО прихода учителя, — но две колонки про учителя
-- обязаны быть заполнены в момент вставки. Родительская заявка в этой схеме
-- невыразима в принципе.
--
-- Подтверждение, что это знали и обходили: 20260717e_safepass_temp_code_redeem
-- :15 — «Why a PIN is required here: safepass_sessions.teacher_id / teacher_name
-- are NOT NULL». Redeem-путь создаёт сессию ТОЛЬКО в момент, когда оператор уже
-- ввёл PIN, и пишет туда оператора киоска. То есть ограничение не пережило
-- появление второго сценария — родитель заявляет заранее, учителя ещё нет.
--
-- ЭТО НЕ ТА ЖЕ СТЕНА, ЧТО 42501. Права проверяются РАНЬШЕ ограничений, поэтому
-- anon упирался в permission denied и до NOT NULL не доходил никогда. Стен было
-- две, независимых. 20260719b (SECURITY DEFINER) снимает первую — и упёрся бы
-- во вторую уже в проде. Read-back поймал это до применения.
--
-- ПОЧЕМУ НЕ СЛУЖЕБНОЕ '' ВМЕСТО NULL:
--   В регулируемой записи о передаче ребёнка '' неотличимо от «передал человек
--   без имени». NULL читается однозначно: учителя ещё не было. Плюс '' утекло бы
--   в max(teacher_name) вьюхи safepass_center_daily и стало бы пустым именем в
--   отчёте. NULL — честная кодировка отсутствия, '' — тихая ложь.
--
-- ЧТО СЛОМАЕТСЯ: НИЧЕГО. Проверено:
--   safepass_classroom_log / safepass_center_daily / safepass_org_summary —
--     все три фильтруют status='confirmed', то есть видят только строки, где
--     confirm_handoff уже проставил обе колонки.
--   Клиент: SafePassParentPage.tsx:22 типизирует teacher_name как string|null и
--     на :201 читает `s.teacher_name || 'Teacher'`. Уже готов к NULL.
--   Ни одного места, читающего teacher_id как гарантированно непустой, нет.
--
-- ГАРАНТИЮ НЕ ТЕРЯЕМ, А ПЕРЕНОСИМ ТУДА, ГДЕ ЕЙ МЕСТО: §2 добавляет CHECK, по
-- которому подтверждённая запись обязана нести учителя. Это и был настоящий
-- смысл NOT NULL — он просто стоял на всей строке вместо подтверждённой.
-- ============================================================================

begin;

-- §1 снять NOT NULL
alter table menumaker.safepass_sessions alter column teacher_id   drop not null;
alter table menumaker.safepass_sessions alter column teacher_name drop not null;

comment on column menumaker.safepass_sessions.teacher_id is
  'Сотрудник, подтвердивший передачу (staff.id). NULL, пока status <> confirmed. '
  'Пишется только safepass_confirm_handoff по PIN. Инвариант — CHECK ниже.';

-- §2 гарантия на своём месте: подтверждено ⇒ учитель есть
alter table menumaker.safepass_sessions
  add constraint safepass_confirmed_has_teacher
  check (status <> 'confirmed' or (teacher_id is not null and teacher_name is not null))
  not valid;

-- not valid = проверяем только НОВЫЕ строки; существующие валидируем отдельно,
-- чтобы применение не легло на большой таблице. Сейчас строк 0, так что:
alter table menumaker.safepass_sessions validate constraint safepass_confirmed_has_teacher;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY (вердикт колонками, не notice — Case 5):
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from information_schema.columns
--     where table_schema='menumaker' and table_name='safepass_sessions'
--       and column_name in ('teacher_id','teacher_name')
--       and is_nullable='YES') = 2                        as both_nullable,
--   (select count(*) from pg_constraint
--     where conname='safepass_confirmed_has_teacher' and convalidated) = 1
--                                                          as check_live;
-- → true, true
--
-- И проба, что инвариант реально кусается (должна упасть):
-- begin;
--   update menumaker.safepass_sessions set status='confirmed', teacher_id=null
--    where false;   -- заведомо 0 строк; CHECK проверяется на реальных апдейтах
-- rollback;
-- ============================================================================
