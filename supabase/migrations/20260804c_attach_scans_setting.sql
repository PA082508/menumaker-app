-- Настройка «прикладывать скан к бумажной форме».
--
-- Управляет ТОЛЬКО требованием (просить · подсказывать · напоминать) и НИКОГДА
-- возможностью: зона догрузки на вкладке Documents работает при любом положении
-- ключа. Запретить приложить документ — это не настройка, это поломка.
--
-- Умолчание платформы — false: бумага в сейфе полноценна без скана (третье
-- состояние документа, канон 01.08), и по умолчанию система молчит о сканах.
-- Play Academy включает — у них скан желателен, но не обязателен.
--
-- Механизм умолчаний НЕ изобретается: строка с org_id IS NULL — платформенная,
-- строка с org_id — переопределение организации. Так уже живут
-- claim_filing_window_days (федеральные 60 против огайских 45) и молочные ключи.
--
-- Применено к проекту menumaker (trrmyqfpxntmgxnqkikp) 2026-08-04.
insert into menumaker.app_settings (org_id, key, value, description, source)
select null, 'attach_scans_of_paper_forms', 'false'::jsonb,
       'Ask for a scan alongside a paper form. Controls prompting only — never the ability to upload.',
       'Platform default — a paper form filed in the safe is complete without a scan.'
where not exists (select 1 from menumaker.app_settings
                   where key='attach_scans_of_paper_forms' and org_id is null);

insert into menumaker.app_settings (org_id, key, value, description, source)
select '3a9a290e-7e49-491e-946b-ad86f2399910', 'attach_scans_of_paper_forms', 'true'::jsonb,
       'Play Academy: a scan is desirable but never required — the hint appears, nothing is blocked or marked incomplete.',
       'Owner, 2026-08-04.'
where not exists (select 1 from menumaker.app_settings
                   where key='attach_scans_of_paper_forms'
                     and org_id='3a9a290e-7e49-491e-946b-ad86f2399910');
