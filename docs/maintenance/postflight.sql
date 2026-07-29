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
  v_n int; v_txt text; v_w int;
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
  begin
    select count(*) into v_n from menumaker.find_child_candidates(v_org,'ZZPOSTFLIGHT','Probe',date '2022-03-04');
    r := r || format('  ✅ 6. вопрос о кандидатах работает (нашёл %s)', v_n) || E'\n';
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

  -- ── S-1/S-2. staff: pin_hash закрыт, остальное открыто ─────────────────
  -- Колонковые права НЕ распространяются на колонки, добавленные позже: новая
  -- колонка окажется нечитаемой, и экран сотрудника опустеет молча. Здесь это
  -- перестаёт быть молчаливым.
  select count(*) into v_n from information_schema.columns c
   where c.table_schema='menumaker' and c.table_name='staff' and c.column_name <> 'pin_hash'
     and not has_column_privilege('authenticated','menumaker.staff', c.column_name, 'select');
  r := r || case when v_n = 0 then '  ✅ S-1. все колонки staff, кроме pin_hash, доступны экранам'
                 else format('  ❌ S-1. %s колонок staff НЕ выданы — экран сотрудника будет пуст', v_n) end || E'\n';
  r := r || case when has_column_privilege('authenticated','menumaker.staff','pin_hash','select')
                   or has_column_privilege('authenticated','menumaker.staff','pin_hash','update')
                 then '  ❌ S-2. pin_hash СНОВА достижим — PIN открывает выдачу ребёнка'
                 else '  ✅ S-2. pin_hash закрыт и на чтение, и на запись' end || E'\n';

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

  raise exception E'%\n  ── всё написанное откачено, ничего не осталось ──', r;
end $$;
