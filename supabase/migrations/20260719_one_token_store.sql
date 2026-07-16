-- 20260719_one_token_store.sql — снести второй токен-стор
--
-- ✅ APPLIED 2026-07-19 по слову Николая («prefill_tokens»).
--
-- READ-BACK (фактический):
--   campaign_issues            → NULL ✓ снесена
--   prefill_tokens FKs         → prefill_tokens_batch_fk, prefill_tokens_child_id_fkey
--   prefill_tokens rows        → 0 (ничего не потеряно)
--   campaigns rows             → 0
--   enrollment_submissions     → approved=18 · pending=4 · rejected=50 (не тронуты)
--   enrollment-autofile v3     → передеплоена тем же заходом, dry-run отработал:
--                                scanned 4, would_file 0, причины «no prefill token…»
--
-- ПРОГОН ДО ПРИМЕНЕНИЯ доказал, что campaign_issues была лишней — обе колонки трекера
-- считаются прямо из prefill_tokens:
--   выдали токен с batch_id = кампания → «отправлено» = 1 · «кому ещё послать» = 8 из 9 в Red.
--
-- ЧТО ПРОИЗОШЛО
-- ─────────────
-- `docs/prefill-engine-spec.md`, «Decisions — LOCKED (Nikolay 2026-07-08)», п.1:
--   «Token store: расширить form_links … НИКАКОЙ НОВОЙ ТАБЛИЦЫ.»
-- 2026-07-16 я создал `campaign_issues` с собственным `issue_token` — новую таблицу и
-- второй токен-стор. Спеку не прочитал: искал по слову «renewal», а решение лежит под
-- «prefill». Это тот же класс ошибки, что «скопированная константа стиля — форк без
-- слияния», только на уровне БД.
--
-- РЕШЕНИЕ НИКОЛАЯ 2026-07-19: **токен-стор = `prefill_tokens`.** Он уже реализует
-- залоченные решения:
--   · mint_prefill_token — authenticated RPC                      (решение 2) ✓
--   · get_prefill        — anon SECURITY DEFINER, whitelist в RPC (решение 3) ✓
--   · expires_at = now() + 30 days                                (решение 4) ✓
--   · on conflict (child_id) do update → ОДИН активный токен на ребёнка, новая выдача
--     перевыпускает и обесценивает старый                          (решение 4) ✓
--   · batch_id                                                     (решение 5) ✓
-- Строить рядом было нечего: оно уже было построено правильно.
--
-- ЧТО ДЕЛАЕМ
-- ──────────
--   · `campaign_issues` — DROP. Целиком.
--   · `campaigns` — ОСТАЁТСЯ: по смыслу это `portion_batch` из решения 5
--     (`form_keys` = `form_set`). Переименовывать не будем — 0 строк, но имя уже в
--     спеке контура и в коде.
--   · `prefill_tokens.batch_id` → FK на `campaigns.id`. Связь уже была задумана, не была
--     объявлена.
--
-- ПОЧЕМУ DROP, А НЕ «оставить как журнал выдач»
-- ─────────────────────────────────────────────
-- Соблазн: `prefill_tokens` делает upsert по child_id, значит истории выдач не хранит —
-- ребёнок, попавший во вторую кампанию, теряет запись о первой. Захотелось оставить
-- `campaign_issues` журналом.
--   Но решение 5 прямо говорит: **«portion_batch (thin)»** и **«статусы = таймстампы
--   событий, счётчики ДЕРИВИРУЮТСЯ»**. Для ОДНОЙ живой кампании
--   `prefill_tokens where batch_id = <кампания>` отвечает и на «отправлено», и на «кому
--   ещё послать» (ростер минус эти дети). История между кампаниями понадобится журналу
--   событий — тогда и заведём, по решению 5, а не заранее и не под видом токен-стора.
--
-- БЕЗОПАСНОСТЬ ЭТОГО DROP: `campaign_issues` — **0 строк**, читатель ровно один
-- (supabase/functions/enrollment-autofile), и он переключается тем же заходом.

begin;

-- 1. Второй токен-стор — снести.
drop table if exists menumaker.campaign_issues;

-- 2. Объявить связь, которая уже подразумевалась.
--    ⚠️ NOT VALID НЕ ставим: строк 0, проверять нечего, пусть валидируется сразу.
alter table menumaker.prefill_tokens
  drop constraint if exists prefill_tokens_batch_fk;
alter table menumaker.prefill_tokens
  add constraint prefill_tokens_batch_fk
  foreign key (batch_id) references menumaker.campaigns(id) on delete set null;

comment on column menumaker.prefill_tokens.batch_id is
  'Порция/кампания, в которой выдан этот токен (menumaker.campaigns = portion_batch, решение 5). '
  'NULL = выдан вне кампании. "Отправлено" в трекере = prefill_tokens WHERE batch_id = <кампания>; '
  '"кому ещё послать" = активный ростер центра МИНУС эти child_id.';

comment on table menumaker.campaigns is
  'portion_batch (prefill-engine-spec, решение 5): form_keys = form_set. Токены живут в '
  'prefill_tokens.batch_id, НЕ здесь — один токен-стор (решение 1, уточнено 2026-07-19).';

commit;

-- ── READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ ──────────────────────────────────────────────
--   select to_regclass('menumaker.campaign_issues');            → NULL  (снесена)
--   select conname from pg_constraint
--    where conrelid='menumaker.prefill_tokens'::regclass and contype='f';  → prefill_tokens_batch_fk
--   select count(*) from menumaker.prefill_tokens;              → 0 (ничего не потеряно)
--   Функция enrollment-autofile передеплоена на prefill_tokens ТЕМ ЖЕ заходом —
--   иначе она читает несуществующую таблицу и каждая строка станет
--   «issue token not found», то есть тихо перестанет файлить.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   alter table menumaker.prefill_tokens drop constraint if exists prefill_tokens_batch_fk;
--   -- campaign_issues восстанавливается из 20260717_renewal_wave1.sql, если понадобится.
--   -- Строк там не было, так что терять нечего.
