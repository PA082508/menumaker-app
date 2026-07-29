-- ============================================================================
-- ПОСЛЕПОЛЁТ, половина «основание» — работают ли ежедневные ходы.
--
-- ПОВОД (Николай, 2026-07-28): «отказ пушить без послеполёта верный: шестой
-- ручной прогон ничего нового не докажет». Ручная проверка, повторённая пять
-- раз одинаково, — это скрипт, который ещё не написали.
--
-- ЧТО ЭТО. Один блок, один прогон, одна таблица ответов. Он не смотрит на код —
-- он ДЕЛАЕТ то, что делает директор за день, и смотрит, что вышло. Ходы идут ОТ
-- ИМЕНИ ДИРЕКТОРА, а не суперпользователя: суперпользователь проходит сквозь
-- защиты, ради которых всё и затевалось, и тогда прогон доказывает лишь то, что
-- защит нет.
--
-- ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА: ОТКАЗ ЗАСЧИТЫВАЕТСЯ, ТОЛЬКО ЕСЛИ ОТКАЗАЛ ТОТ
-- МЕХАНИЗМ, КОТОРЫЙ ПРОВЕРЯЮТ. Первый черновик радовался ЛЮБОМУ отказу — и дал
-- два ложных зелёных подряд: «замок держит» на самом деле означало «нет входа в
-- систему», «ловушка держит» — «такой колонки нет». Проверка, довольная чужим
-- отказом, хуже отсутствующей: она говорит «проверено» там, где не проверено
-- ничего. Поэтому каждый отказ сверяется со СВОИМ текстом.
--
-- И У КАЖДЫХ ВОРОТ ЕСТЬ ВТОРАЯ ПОЛОВИНА (7b, 8b): ворота должны не только не
-- пускать лишнее, но и пропускать нужное. Ворота, закрытые всегда, выглядят в
-- отчёте так же хорошо, как исправные.
--
-- НИЧЕГО НЕ ОСТАЁТСЯ. Весь блок — одна транзакция, которая в конце намеренно
-- падает. Всё написанное откатывается, включая временного ребёнка, которого
-- блок заводит сам, чтобы не трогать журнал настоящего ребёнка даже на миг.
-- Прогон безопасен на проде и задуман именно для прода.
--
-- ПРОВАЛ ЗАКРЫТЫЙ. Ход, который не удалось выполнить, — ❌, а не пропуск.
--
-- ЗАПУСК: перед каждым пушем, целиком, одной вставкой. Ответ приходит в тексте
-- ошибки — так и задумано: ошибка и есть откат.
-- ============================================================================

do $$
declare
  r text := E'\n';
  v_org uuid; v_center uuid; v_class uuid; v_roster uuid; v_res jsonb;
  v_dir uuid; v_monday date; v_locked text; v_lock_text text;
  v_n int; v_txt text; v_w int; v_tot int; v_rec record;
  v_sealed uuid; v_unsealed uuid;
  -- живые носители ролей: пробы обязаны ходить под НАСТОЯЩИМИ логинами
  c_dir  constant uuid := '5998a5de-ba02-4569-958c-53ab16dd1895';  -- директор Alpha
  c_gd   constant uuid := '1567bda4-93fb-44ca-9813-58b2502e588d';  -- офис-менеджер, org-уровень
  c_cook constant uuid := 'bd8e98cd-240d-43a7-ba8a-2d19ef0c23a3';  -- alpha.cook, служебный (дверь)
  -- поле БЕЗ замка: его нет в child_field_locks, значит оно свободно
  c_free constant text := 'child_address';
begin
  select id, org_id into v_center, v_org from menumaker.centers where is_demo limit 1;
  select id into v_class from menumaker.classrooms where center_id = v_center limit 1;
  select u.id into v_dir from auth.users u
    join menumaker.user_roles ur on ur.user_id = u.id where ur.role='director' limit 1;
  if v_center is null or v_dir is null then
    raise exception 'ПОСЛЕПОЛЁТ НЕ ВЫПОЛНЕН: нет демо-центра или директора для прогона';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_dir, 'role','authenticated')::text, true);

  insert into menumaker.roster (org_id, center_id, classroom_id, child_name, first_name, last_name, birthday, is_active)
  values (v_org, v_center, v_class, 'ZZPOSTFLIGHT Probe', 'ZZPOSTFLIGHT', 'Probe', date '2022-03-04', true)
  returning id into v_roster;
  r := r || format('  подготовка: ростер %s в демо-центре, действует директор%s', left(v_roster::text,8), E'\n');

  -- ── 1. карточка ребёнка открывается ─────────────────────────────────────
  select count(*) into v_n from menumaker.roster where id = v_roster;
  r := r || case when v_n = 1 then '  ✅ 1. карточка ребёнка открывается'
                 else '  ❌ 1. карточка ребёнка НЕ читается' end || E'\n';

  -- ── 2. сохранение идёт защищённым путём и оставляет след ────────────────
  begin
    perform menumaker.record_child_field_change(
      v_roster, c_free, 'roster', c_free, '1234 Postflight Ave', 'verbal',
      null, null, null, 'postflight probe', 'postflight');
    select count(*) into v_n from menumaker.child_field_events where roster_id = v_roster;
    r := r || case when v_n >= 1
      then format('  ✅ 2. защищённый путь записи оставил %s событие(й) [%s]', v_n, c_free)
      else '  ❌ 2. запись прошла, СЛЕДА В ЖУРНАЛЕ НЕТ — путь обойдён' end || E'\n';
  exception when others then r := r || '  ❌ 2. защищённый путь НЕ РАБОТАЕТ: '||left(sqlerrm,70)||E'\n'; end;

  -- ── 3. замок отказывает СВОИМ текстом ──────────────────────────────────
  select field_key, needs_document_text into v_locked, v_lock_text
    from menumaker.child_field_locks where lock_level='document' order by field_key limit 1;
  begin
    perform menumaker.record_child_field_change(
      v_roster, v_locked, 'roster', v_locked, '2020-01-01', 'verbal',
      null, null, null, null, 'postflight');
    r := r || format('  ❌ 3. замок ПРОПУСТИЛ «%s» без документа', v_locked) || E'\n';
  exception when others then v_txt := sqlerrm;
    r := r || case when v_txt = v_lock_text
      then format('  ✅ 3. замок отказал СВОИМ текстом [%s]', v_locked)
      else format('  ❌ 3. отказал НЕ ЗАМОК — замок НЕ ПРОВЕРЕН: «%s»', left(v_txt,60)) end || E'\n';
  end;

  -- ── 4. снятие ребёнка — с документом, как в жизни ──────────────────────
  begin
    perform menumaker.set_child_active_state(
      v_roster, false, current_date, 'postflight probe',
      'free_document', current_date, null, 'postflight');
    select is_active into v_n from (select case when is_active then 1 else 0 end as is_active
                                      from menumaker.roster where id=v_roster) z;
    r := r || case when v_n = 0 then '  ✅ 4. снятие ребёнка прошло защищённым путём и подействовало'
                   else '  ❌ 4. снятие вернулось без ошибки, но ребёнок остался активным' end || E'\n';
  exception when others then r := r || '  ❌ 4. снятие ребёнка: '||left(sqlerrm,70)||E'\n'; end;

  -- ── 5. зачисление ВЫДАЁТ КЛЮЧ (течь, ради которой всё) ─────────────────
  begin
    v_res := menumaker.resolve_or_create_child(v_org, 'ZZPOSTFLIGHT', 'Probe', date '2022-03-04', null);
    r := r || case when (v_res->>'child_id') is not null
      then format('  ✅ 5. зачисление выдаёт ключ ребёнка (%s…, match=%s)', left(v_res->>'child_id',8), v_res->>'match')
      else '  ❌ 5. зачисление вернуло ПУСТОЙ ключ — течь открыта' end || E'\n';
  exception when others then r := r || '  ❌ 5. выдача ключа СЛОМАНА: '||left(sqlerrm,70)||E'\n'; end;

  -- ── 6. кандидаты показываются ДО создания сущности ─────────────────────
  -- Считаем ОТВЕТ, а не «вызов не упал» (канон 29.07). Предыдущая редакция
  -- зеленела при ЛЮБОМ числе, включая ноль: функция, честно возвращающая пустоту
  -- на заведомого двойника, выглядела бы исправной. Двойник только что заведён
  -- ходом 5 — не найти его нельзя.
  begin
    select count(*) into v_n from menumaker.find_child_candidates(v_org,'ZZPOSTFLIGHT','Probe',date '2022-03-04');
    r := r || case when v_n >= 1
      then format('  ✅ 6. вопрос о кандидатах НАШЁЛ заведомого двойника (%s)', v_n)
      else '  ❌ 6. кандидатов НОЛЬ на заведомом двойнике — вопрос до человека не дойдёт' end || E'\n';
  exception when others then r := r || '  ❌ 6. вопрос о кандидатах СЛОМАН: '||left(sqlerrm,70)||E'\n'; end;

  -- ── 7. ворота недели: не пускают текущую… ──────────────────────────────
  v_monday := date_trunc('week', current_date)::date;
  begin
    perform menumaker.approve_meal_week(v_center, v_class, v_monday, 'ZZ', 'postflight');
    r := r || '  ❌ 7. ТЕКУЩАЯ неделя утвердилась — серверные ворота не держат' || E'\n';
  exception when others then v_txt := sqlerrm;
    r := r || case when v_txt ~* 'still in progress|approval opens'
      then format('  ✅ 7. текущая неделя отказана СВОИМИ воротами: «%s…»', left(v_txt,58))
      else format('  ❌ 7. отказали НЕ ворота недели — ворота НЕ ПРОВЕРЕНЫ: «%s»', left(v_txt,58)) end || E'\n';
  end;
  -- …и пропускают прошедшую. Ворота, закрытые всегда, в отчёте неотличимы от исправных.
  begin
    perform menumaker.approve_meal_week(v_center, v_class, v_monday - 7, 'ZZ', 'postflight');
    r := r || '  ✅ 7b. прошедшая неделя утверждается — ворота держат ровно нужное' || E'\n';
  exception when others then v_txt := sqlerrm;
    r := r || case when v_txt ~* 'still in progress|approval opens'
      then '  ❌ 7b. ворота держат ЛИШНЕЕ — прошедшую неделю тоже не пускают'
      else format('  ✅ 7b. ворота пропустили прошедшую (дальше отказ по делу: «%s…»)', left(v_txt,45)) end || E'\n';
  end;

  -- ── 8. ловушка зонда: не пускает в боевой центр… ───────────────────────
  begin
    insert into menumaker.enrollment_submissions (org_id, center_id, submission_type, form_data, source, record_origin)
    select org_id, id, 'dcy_01234', '{}'::jsonb, 'online', 'rehearsal'
      from menumaker.centers where not coalesce(is_demo,false) limit 1;
    r := r || '  ❌ 8. ЗОНД СЕЛ В БОЕВОЙ ЦЕНТР — ловушка не держит' || E'\n';
  exception when others then v_txt := sqlerrm;
    r := r || case when v_txt ~* 'REHEARSAL PROBE REFUSED'
      then format('  ✅ 8. зонд вне демо отказан СВОЕЙ ловушкой: «%s…»', left(v_txt,58))
      else format('  ❌ 8. отказала НЕ ловушка — ловушка НЕ ПРОВЕРЕНА: «%s»', left(v_txt,58)) end || E'\n';
  end;
  -- …и пускает в демо-центр, помечая структурно.
  begin
    insert into menumaker.enrollment_submissions (org_id, center_id, submission_type, form_data, source, record_origin)
    values (v_org, v_center, 'dcy_01234', '{}'::jsonb, 'online', 'rehearsal');
    r := r || '  ✅ 8b. в демо-центре зонд садится — ловушка держит ровно нужное' || E'\n';
  exception when others then r := r || '  ❌ 8b. ловушка держит ЛИШНЕЕ: '||left(sqlerrm,60)||E'\n'; end;

  -- ── S-1/S-2. staff: карточка открывается, pin_hash — нет ───────────────
  -- Колонковые права НЕ распространяются на колонки, добавленные позже: новая
  -- колонка окажется нечитаемой, и экран сотрудника опустеет молча.
  --
  -- Обе проверки спрашивали СПРАВОЧНИК ПРАВ (has_column_privilege) — это ВХОД.
  -- 29.07 права были в точности такими, как задумано, и ровно в этот момент
  -- карточка сотрудника на боевом была мертва десять часов: экран просил
  -- `select *`, а звёздочка задевает и закрытую колонку. Справочник прав об
  -- этом сказать не мог. Поэтому теперь — ПОПЫТКА, от имени authenticated:
  -- что ответит база на тот же запрос, что шлёт экран.
  execute 'set local role authenticated';
  begin
    execute 'select 1 from menumaker.staff limit 1' into v_n;
    -- полный список колонок, кроме закрытой, — так просит починенная карточка
    execute (select 'select 1 from (select '||string_agg(quote_ident(column_name), ', ')||
                    ' from menumaker.staff limit 1) z'
               from information_schema.columns
              where table_schema='menumaker' and table_name='staff' and column_name <> 'pin_hash');
    r := r || '  ✅ S-1. карточка сотрудника читается: явный список колонок проходит' || E'\n';
  exception when others then
    r := r || format('  ❌ S-1. КАРТОЧКА СОТРУДНИКА МЕРТВА: «%s»', left(sqlerrm,60)) || E'\n'; end;
  begin
    execute 'select 1 from (select pin_hash from menumaker.staff limit 1) z';
    r := r || '  ❌ S-2. pin_hash ЧИТАЕТСЯ — PIN открывает выдачу ребёнка' || E'\n';
  exception when others then v_txt := sqlerrm;
    r := r || case when v_txt ~* 'permission denied'
      then '  ✅ S-2. pin_hash отказан СВОИМ механизмом (permission denied)'
      else format('  ❌ S-2. отказало НЕ право, а что-то другое: «%s»', left(v_txt,55)) end || E'\n';
  end;
  -- И звёздочка, которой карточка просила до 29.07: она обязана быть красной.
  begin
    execute 'select 1 from (select * from menumaker.staff limit 1) z';
    r := r || '  ⚠ S-2b. `select *` по staff ПРОХОДИТ — значит закрытой колонки нет' || E'\n';
  exception when others then
    r := r || '  ✅ S-2b. `select *` по staff отказан — экран обязан просить явный список' || E'\n'; end;
  execute 'reset role';

  -- ── S-3. демо-центр не остался meal site ───────────────────────────────
  select count(*) into v_n from menumaker.centers where is_demo and is_meal_site;
  r := r || case when v_n = 0 then '  ✅ S-3. демо-центр не является meal site'
                 else '  ⚠ S-3. демо-центр всё ещё meal site — на время съёмки так и надо, но это таймер' end || E'\n';

  -- ── S-4/S-5. сужение строк staff: ВИДИТ и ПРАВИТ, под живыми ролями ────
  -- Две колонки, а не одна, и это правило навсегда (канон 29.07): ворота,
  -- закрытые ВСЕГДА, в отчёте выглядят точно так же хорошо, как исправные.
  -- Считается ОТВЕТ («сколько строк вернёт запрос»), а не вход формулы
  -- («сколько центров у логина») — вход был правильным и показал бы зелёное
  -- там, где бухгалтер видел ноль.
  --
  -- Роль переключается по-настоящему: суперпользователь проходит СКВОЗЬ RLS,
  -- и прогон от его имени доказал бы лишь то, что защиты нет.
  perform set_config('request.jwt.claims',
    json_build_object('sub','5998a5de-ba02-4569-958c-53ab16dd1895','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from menumaker.staff;
  begin
    update menumaker.staff set updated_at = updated_at where true;
    get diagnostics v_w = row_count;
  exception when others then v_w := -1; end;
  execute 'reset role';
  r := r || case when v_n = 24 and v_w = 24
                 then '  ✅ S-4. директор Alpha: видит 24 своих и правит те же 24 (не 105)'
                 else format('  ❌ S-4. директор Alpha: видит %s, правит %s — ожидалось 24/24', v_n, v_w) end || E'\n';

  perform set_config('request.jwt.claims',
    json_build_object('sub','1567bda4-93fb-44ca-9813-58b2502e588d','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from menumaker.staff;
  begin
    update menumaker.staff set updated_at = updated_at where true;
    get diagnostics v_w = row_count;
  exception when others then v_w := -1; end;
  execute 'reset role';
  r := r || case when v_n = 105 and v_w = 105
                 then '  ✅ S-5. офис-менеджер: видит все 105 и правит все 105'
                 else format('  ❌ S-5. офис-менеджер: видит %s, правит %s — ПУСТО ЗДЕСЬ ЗНАЧИТ ПРОВАЛ И ОТКАТ', v_n, v_w) end || E'\n';

  -- Бухгалтер: тот самый, кого вечерняя формула ослепила бы молча.
  perform set_config('request.jwt.claims',
    json_build_object('sub','096f730d-3df2-4f30-92b9-f3ed8c6ecba0','role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from menumaker.staff;
  execute 'reset role';
  r := r || case when v_n = 105 then '  ✅ S-6. бухгалтер видит все 105 (его роли нет в core.memberships)'
                 else format('  ❌ S-6. бухгалтер видит %s — org-половина снова спрашивает один источник', v_n) end || E'\n';

  -- Аноним: расписание кормлений было публичным до 20260729b.
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  select count(*) into v_n from menumaker.meal_schedule;
  execute 'reset role';
  r := r || case when v_n = 0 then '  ✅ S-7. аноним не видит расписание кормлений'
                 else format('  ❌ S-7. аноним видит %s строк расписания — публичная политика вернулась', v_n) end || E'\n';

  -- ══════════════════════════════════════════════════════════════════════
  -- П-1…П-5. ПРОБЫ ЗАЩИТ, КОТОРЫЕ ДО 29.07 МЫ ЗНАЛИ ТОЛЬКО ЗЕЛЁНЫМИ.
  --
  -- «Гард, никогда не красневший, — гипотеза, а не защита». Порядок задан
  -- владельцем и обоснован не интуицией: печать держит всю неделю провенанса,
  -- граница кухни УЖЕ отказала (pin_hash), журналы — слой доказательств.
  -- У каждой пробы ОБЕ половины: отказ своим текстом И законный путь проходит.
  -- ══════════════════════════════════════════════════════════════════════
  r := r || E'  ── пробы защит ──\n';

  -- ── П-1. ПЕЧАТЬ ПОДПИСАННОГО ────────────────────────────────────────────
  -- На своей строке: настоящих подписанных не трогаем даже на миг отката.
  insert into menumaker.enrollment_submissions
    (org_id, center_id, submission_type, form_data, source, record_origin, content_hash)
  values (v_org, v_center, 'dcy_01234', '{"zz":"probe"}'::jsonb, 'online', 'rehearsal', 'zzprobehash')
  returning id into v_sealed;
  insert into menumaker.enrollment_submissions
    (org_id, center_id, submission_type, form_data, source, record_origin)
  values (v_org, v_center, 'dcy_01234', '{"zz":"open"}'::jsonb, 'online', 'rehearsal')
  returning id into v_unsealed;

  foreach v_txt in array array['postgres','service_role'] loop
    execute format('set local role %I', v_txt);
    begin
      update menumaker.enrollment_submissions set form_data = '{"hacked":1}'::jsonb where id = v_sealed;
      r := r || format('  ❌ П-1 UPDATE прошёл под %s — печать НЕ держит%s', v_txt, E'\n');
    exception when others then
      r := r || case when sqlerrm ~* 'запечатана' then format('  ✅ П-1 UPDATE отказан ПЕЧАТЬЮ под %s%s', v_txt, E'\n')
                     else format('  ❌ П-1 под %s отказала НЕ печать: «%s»%s', v_txt, left(sqlerrm,45), E'\n') end;
    end;
    begin
      delete from menumaker.enrollment_submissions where id = v_sealed;
      r := r || format('  ❌ П-1 DELETE прошёл под %s — печать НЕ держит%s', v_txt, E'\n');
    exception when others then
      r := r || case when sqlerrm ~* 'запечатана' then format('  ✅ П-1 DELETE отказан ПЕЧАТЬЮ под %s%s', v_txt, E'\n')
                     else format('  ❌ П-1 DELETE под %s отказала НЕ печать%s', v_txt, E'\n') end;
    end;
    execute 'reset role';
  end loop;

  perform set_config('request.jwt.claims', json_build_object('sub', c_dir, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update menumaker.enrollment_submissions set form_data = '{"hacked":1}'::jsonb where id = v_sealed;
    get diagnostics v_w = row_count;
    r := r || case when v_w = 0 then '  ⚠ П-1 под директором строка не видна — печать этой ролью НЕ ПРОВЕРЕНА'
                   else '  ❌ П-1 UPDATE прошёл под директором — печать НЕ держит' end || E'\n';
  exception when others then
    r := r || case when sqlerrm ~* 'запечатана' then '  ✅ П-1 UPDATE отказан ПЕЧАТЬЮ под директором'
                   else format('  ⚠ П-1 под директором отказала НЕ печать: «%s»', left(sqlerrm,45)) end || E'\n';
  end;
  execute 'reset role';

  begin  -- вторая половина: незамороженное поле правится, незапечатанное удаляется
    update menumaker.enrollment_submissions set status = 'approved' where id = v_sealed;
    get diagnostics v_w = row_count;
    r := r || case when v_w = 1 then '  ✅ П-1b незамороженное поле (status) правится — печать держит ровно нужное'
                   else '  ❌ П-1b незамороженное поле НЕ правится' end || E'\n';
  exception when others then r := r || format('  ❌ П-1b законный путь отказан: «%s»%s', left(sqlerrm,50), E'\n'); end;
  begin
    delete from menumaker.enrollment_submissions where id = v_unsealed;
    r := r || '  ✅ П-1c НЕзапечатанная строка удаляется — печать не держит лишнего' || E'\n';
  exception when others then r := r || format('  ❌ П-1c незапечатанную удалить нельзя: «%s»%s', left(sqlerrm,50), E'\n'); end;

  -- ── П-2. ГРАНИЦА КУХНИ ──────────────────────────────────────────────────
  -- Основание порядка (владелец): эта граница УЖЕ отказала на этой неделе —
  -- pin_hash с общего кухонного планшета. Семейство с известным провалом
  -- вероятнее имеет соседей.
  select count(*) into v_n from core.memberships where role = 'teacher';
  r := r || case when v_n = 0
    then '  🔴 П-2 НОСИТЕЛЯ НЕТ: роли «teacher» нет ни у кого — deny_teacher не может покраснеть НИКОГДА'
    else format('  ✅ П-2 носитель есть: %s логинов с ролью teacher', v_n) end || E'\n';
  v_n := 0;
  for v_rec in select distinct tablename as t from pg_policies
                where schemaname='menumaker' and policyname='deny_teacher' order by 1
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', c_cook, 'role','authenticated')::text, true);
    execute 'set local role authenticated';
    begin execute format('select count(*) from menumaker.%I', v_rec.t) into v_w;
    exception when others then v_w := 0; end;
    execute 'reset role';
    if v_w > 0 then v_n := v_n + 1; end if;
  end loop;
  r := r || case when v_n = 0 then '  ✅ П-2b кухня не видит ни одной таблицы из-под deny_teacher'
                 else format('  🔴 П-2b кухня ВИДИТ %s таблиц из-под deny_teacher (дети, медкарты, опекуны, чеки)', v_n) end || E'\n';

  -- ── П-3. ЖУРНАЛЫ — СЛОЙ ДОКАЗАТЕЛЬСТВ ───────────────────────────────────
  -- Строка заводится ЗАКОННЫМ путём (это и есть вторая половина), потом её
  -- пробуют править. Раньше проба отступала на «журнал пуст» — отступление
  -- в отчёте выглядит как зелёное.
  select count(*) into v_n from menumaker.child_field_events where roster_id = v_roster;
  r := r || case when v_n >= 1 then '  ✅ П-3b дозапись защищённым путём проходит'
                 else '  ❌ П-3b дозапись не оставила события' end || E'\n';
  begin
    update menumaker.child_field_events set new_value = 'hacked' where roster_id = v_roster;
    r := r || '  ❌ П-3 UPDATE по child_field_events ПРОШЁЛ — журнал не журнал' || E'\n';
  exception when others then
    r := r || case when sqlerrm ~* 'только на дозапись' then '  ✅ П-3 UPDATE по child_field_events отказан СВОИМ текстом'
                   else format('  ❌ отказал НЕ журнал: «%s»', left(sqlerrm,40)) end || E'\n';
  end;
  begin
    delete from menumaker.child_field_events where roster_id = v_roster;
    r := r || '  ❌ П-3 DELETE по child_field_events ПРОШЁЛ' || E'\n';
  exception when others then
    r := r || case when sqlerrm ~* 'только на дозапись' then '  ✅ П-3 DELETE по child_field_events отказан СВОИМ текстом'
                   else '  ❌ DELETE отказал НЕ журнал' end || E'\n';
  end;
  begin
    update menumaker.meal_week_status_events set org_id = org_id;
    r := r || '  ❌ П-3 UPDATE по meal_week_status_events ПРОШЁЛ' || E'\n';
  exception when others then
    r := r || case when sqlerrm ~* 'только на дозапись' then '  ✅ П-3 UPDATE по meal_week_status_events отказан СВОИМ текстом'
                   else '  ❌ отказал НЕ журнал' end || E'\n';
  end;

  -- ── П-4. СВЕДЕНИЯ О ДОХОДЕ ИДУТ МИМО ДИРЕКТОРА ──────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', c_dir, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from menumaker.enrollment_submissions
   where submission_type in ('iea','usda_waiver');
  execute 'reset role';
  r := r || case when v_n = 0 then '  ✅ П-4 директор не видит НИ ОДНОЙ строки о доходе'
                 else format('  ❌ П-4 директор видит %s строк о доходе', v_n) end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', c_gd, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from menumaker.enrollment_submissions
   where submission_type in ('iea','usda_waiver');
  execute 'reset role';
  r := r || case when v_n > 0 then format('  ✅ П-4b org-роль видит все %s — ворота пропускают нужное', v_n)
                 else '  ❌ П-4b org-роль не видит ни одной — ворота держат ЛИШНЕЕ' end || E'\n';

  -- ── П-5. ОБЛАСТЬ ДВЕРИ ──────────────────────────────────────────────────
  select count(*) into v_tot from menumaker.roster;
  perform set_config('request.jwt.claims', json_build_object('sub', c_cook, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from menumaker.roster;
  begin
    insert into menumaker.roster (org_id, center_id, child_name, first_name, last_name, is_active)
    select org_id, center_id, 'ZZDOOR Probe', 'ZZDOOR', 'Probe', true from menumaker.roster limit 1;
    v_w := 1;
  exception when others then v_w := 0; end;
  execute 'reset role';
  r := r || case when v_n < v_tot and v_n > 0
                 then format('  ✅ П-5 дверь видит свой центр: %s из %s', v_n, v_tot)
                 else format('  ❌ П-5 дверь видит %s из %s — область не держит', v_n, v_tot) end || E'\n';
  r := r || case when v_w = 0 then '  ✅ П-5b дверь не может ЗАВЕСТИ ребёнка'
                 else '  ❌ П-5b дверь завела строку ростера' end || E'\n';

  raise exception E'%\n  ── всё написанное откачено, ничего не осталось ──', r;
end $$;
