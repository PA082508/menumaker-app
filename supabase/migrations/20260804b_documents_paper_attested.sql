-- Третье состояние документа: «бумага в деле, подтверждено директором».
-- Канон владельца 01.08; носитель — menumaker.documents.
--
-- ЗАЧЕМ ТРЕТЬЕ СОСТОЯНИЕ. Сегодня у документа два состояния: он либо СОЗДАН нами
-- (`generated`), либо ЗАГРУЖЕН файлом (`uploaded`). Реальность центра третья и
-- самая частая: бумага подписана, лежит в сейфе, скана нет и сегодня не будет.
-- Пока такого состояния нет, директор выбирает между «соврать, что загружено» и
-- «оставить пустым» — и выбирает пустое, отчего живой ребёнок с действующей
-- бумагой числится недокументированным до самой проверки.
--
-- ЗАМЕР 04.08 (почему миграция вообще нужна):
--   · documents_source_check допускает ТОЛЬКО ('generated','uploaded') — строка с
--     source='paper' отбивается на уровне таблицы, до всякой RLS;
--   · колонок attested_by / attested_at НЕТ — засвидетельствовать некому и нечем.
-- Гранты и политики при этом в порядке (authenticated: select/insert/update/delete,
-- org_isolation + deny_teacher + module_cacfp_active), так что ловушки published_menus
-- здесь не повторяется — не хватает ровно формы строки.
--
-- ЧТО НЕ ДОБАВЛЯЕТСЯ И ПОЧЕМУ:
--   · отдельной колонки «документная дата» НЕТ намеренно. У таблицы уже есть
--     valid_from / valid_until, и claim_packet_manifest читает период именно как
--     coalesce(period_start, valid_from) .. coalesce(period_end, valid_until).
--     Дата с бумаги ложится в valid_from, срок — в valid_until, и манифест видит
--     строку БЕЗ ЕДИНОЙ ПРАВКИ. Своя колонка означала бы второй источник периода
--     рядом с тем, что уже считает заявку.
--   · storage_path остаётся nullable и пустым: скан — опция, а не условие. Строка
--     без файла полноценна.
--
-- ЗАСВИДЕТЕЛЬСТВОВАНИЕ — ЭТО НЕ ЗАГРУЗКА. attested_by/attested_at отвечают на
-- вопрос «кто ручается, что бумага существует и лежит в деле», а uploaded_by — на
-- «кто принёс файл». Смешивать их нельзя: у строки третьего состояния файла нет,
-- а ручающийся есть, и при проверке спросят именно его.
--
-- Применено к проекту menumaker (trrmyqfpxntmgxnqkikp) 2026-08-04.

alter table menumaker.documents drop constraint if exists documents_source_check;
alter table menumaker.documents add constraint documents_source_check
  check (source = any (array['generated'::text, 'uploaded'::text, 'paper'::text]));

alter table menumaker.documents add column if not exists attested_by  uuid references auth.users(id);
alter table menumaker.documents add column if not exists attested_at  timestamptz;

-- Бумажная строка обязана нести ручающегося. Форма без него — это снова «пусто,
-- но выглядит заполненным»: ровно то состояние, ради выхода из которого всё это.
alter table menumaker.documents drop constraint if exists documents_paper_needs_attestation;
alter table menumaker.documents add constraint documents_paper_needs_attestation
  check (source <> 'paper' or (attested_by is not null and attested_at is not null));

-- И обязана нести ДАТУ С БУМАГИ. Без неё нельзя сказать, действует ли она сейчас,
-- а значит нечем гасить баннер и нечего показывать манифесту.
alter table menumaker.documents drop constraint if exists documents_paper_needs_date;
alter table menumaker.documents add constraint documents_paper_needs_date
  check (source <> 'paper' or valid_from is not null);

comment on column menumaker.documents.attested_by is
  'Кто ручается, что бумага существует и лежит в деле (source=''paper''). Не то же самое, что uploaded_by: файла у такой строки нет.';
comment on column menumaker.documents.attested_at is
  'Когда засвидетельствовали наличие бумаги. НЕ дата документа — та лежит в valid_from.';
