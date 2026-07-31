-- 20260731e — журнал печати клеймовых документов. ПРИМЕНЕНО 2026-07-31 по слову
-- владельца («заведите журналирование печати клеймовых документов: кто, что,
-- когда, по какому центру»).
--
-- ЗАЧЕМ. Site Claim Report печатается кнопкой и уходит наружу бумагой. С 17.06 по
-- 31.07 шапка формы была ЗАШИТА на Pearl, то есть распечатка любого центра несла
-- чужое имя, чужой адрес и чужой ДЕЙСТВУЮЩИЙ номер площадки (50020338). Изнутри
-- доказать, печаталось ли это, невозможно: печать не оставляла следа нигде.
-- Документ, уходящий наружу, обязан оставлять запись — иначе вопрос «уходило ли»
-- будет задан ещё раз и снова останется без ответа.
--
-- ЧТО ПИШЕТСЯ: кто · что (документ + период) · когда · по какому центру, и ЧТО
-- ИМЕННО БЫЛО НАПЕЧАТАНО В ШАПКЕ — имя центра и номер площадки на момент печати.
-- Последнее и есть ответ на вопрос «а не чужая ли это была шапка».
--
-- ЧЕГО НЕ ДЕЛАЕМ: не блокируем печать. Журнал — свидетельство, не гейт.

create table if not exists menumaker.claim_print_log (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null,
  center_id          uuid not null,
  document           text not null,              -- 'site_claim_report' | 'claim_recap' | 'cost_details'
  claim_year         int  not null,
  claim_month        int  not null,
  -- Что стояло в шапке в момент печати. Пишется КАК ПОКАЗАНО, а не как в справочнике:
  -- смысл записи — доказать, чьё имя ушло на бумагу.
  center_name_shown  text,
  site_number_shown  text,
  printed_by         uuid default auth.uid(),
  printed_by_name    text,
  printed_at         timestamptz not null default now()
);

create index if not exists claim_print_log_center_idx
  on menumaker.claim_print_log (center_id, claim_year, claim_month, printed_at desc);

alter table menumaker.claim_print_log enable row level security;

-- Читать — свой центр или своя организация; писать — только о себе и о своём центре.
-- Оба предиката парой: user_center_access слеп к орг-уровню (канон 26.07).
drop policy if exists claim_print_log_select on menumaker.claim_print_log;
create policy claim_print_log_select on menumaker.claim_print_log
  for select to authenticated
  using (center_id = any (menumaker.my_center_ids()) or menumaker.is_org_owner(org_id));

drop policy if exists claim_print_log_insert on menumaker.claim_print_log;
create policy claim_print_log_insert on menumaker.claim_print_log
  for insert to authenticated
  with check (
    (center_id = any (menumaker.my_center_ids()) or menumaker.is_org_owner(org_id))
    and printed_by = auth.uid()
  );

-- Запись о печати не редактируется и не удаляется: UPDATE/DELETE политик нет,
-- значит их нет ни у кого, кроме service_role. Свидетельство — forward-only.
