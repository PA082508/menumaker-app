import { supabase } from '@/lib/supabase'
import { throwIf } from '@/lib/queryError'
import { nextVersionByCenter } from '@/lib/publishVersions'
import { buildCombos, type Lookup, type Holiday, type Combos } from './OfficialMenu'

/**
 * Публикация официального месячного меню.
 *
 * Меню в системе ОДНО на организацию (menu_cycles + menu_items не знают центра),
 * а хранение снимков — ПО-ЦЕНТРОВОЕ: published_menus уникален по
 * (program, center_id, year, month, version). Отсюда деление здесь:
 *
 *   loadMenuSource()        — общая половина снимка (цикл, блюда, комбо-рецепты)
 *   loadHolidaysByCenter()  — половина, которая у каждого центра СВОЯ (праздники)
 *   publishMonth()          — собирает по строке на центр и кладёт их ОДНИМ insert
 *
 * Кнопка «Publish» на планировщике публикует месяц по всем доступным центрам одним
 * нажатием; по-центровая кнопка на print-official (только админ) — точечное
 * переиздание одного центра. Обе идут через publishMonth, поэтому форма снимка у
 * них не может разъехаться.
 *
 * Публикация — только вперёд: повторная публикация месяца НИКОГДА не переписывает
 * старую версию, а добавляет новую (version = max + 1, отдельно по каждому центру).
 */

export interface MenuSource {
  cycleId: string | null
  cycleStart: string | null
  totalWeeks: number
  lookup: Lookup
  combos: Combos
}

export interface PublishCenter {
  id: string
  slug: string
  name: string
}

export interface PublishedRow {
  center: PublishCenter
  version: number
}

/**
 * Общая (не зависящая от центра) половина снимка: цикл + блюда + комбо-рецепты.
 *
 * Отказ чтения здесь БРОСАЕТ, а не возвращает пустоту: пустой lookup — это не
 * «меню без блюд», это официальный бланк, ушедший родителям с пустыми клетками.
 * Вызывающий обязан поймать и сказать словами.
 */
export async function loadMenuSource(program: string = 'child'): Promise<MenuSource | null> {
  const { data: cycles, error: cycleErr } = await supabase.schema('menumaker')
    .from('menu_cycles')
    .select('id, total_weeks, start_date')
    .eq('program', program)
    .order('created_at', { ascending: false })
    .limit(1)
  throwIf(cycleErr, 'меню не прочитано (цикл)')

  const cycle = cycles?.[0]
  if (!cycle) return null

  const { data: items, error: itemsErr } = await supabase.schema('menumaker')
    .from('menu_items')
    .select(`week_number, day_of_week, item_text, recipe_id,
             meal_types:meal_type_id(label),
             components:component_id(slug),
             recipes:recipe_id(is_whole_grain)`)
    .eq('cycle_id', cycle.id)
    .order('sort_order')
  throwIf(itemsErr, 'меню не прочитано (блюда цикла)')

  const lookup: Lookup = {}
  const recipeIds = new Set<string>()
  for (const it of (items || []) as any[]) {
    const meal = it.meal_types?.label as string | undefined
    const comp = it.components?.slug as string | undefined
    if (!meal || !comp) continue
    if (it.recipe_id) recipeIds.add(it.recipe_id)
    ;((((lookup[it.week_number] ??= {})[it.day_of_week] ??= {})[meal] ??= {})[comp] ??= []).push({
      text: it.item_text || '',
      wg: !!it.recipes?.is_whole_grain,
      recipeId: it.recipe_id ?? null,
    })
  }

  // Комбинированные блюда: рецепты, кредитующие 2+ компонента (кроме Extras).
  let combos: Combos = {}
  if (recipeIds.size) {
    const { data: rcs, error: rcErr } = await supabase.schema('menumaker')
      .from('recipe_components')
      .select('recipe_id, quantity, unit, recipes:recipe_id(name, menu_form_primary_component), components:component_id(slug,label), age_groups:age_group_id(slug)')
      .in('recipe_id', [...recipeIds])
    throwIf(rcErr, 'меню не прочитано (состав рецептов)')
    combos = buildCombos((rcs || []).map((r: any) => ({
      recipe_id: r.recipe_id, name: r.recipes?.name || '', quantity: r.quantity, unit: r.unit,
      comp_slug: r.components?.slug, comp_label: r.components?.label, age_slug: r.age_groups?.slug,
      primary_override: r.recipes?.menu_form_primary_component ?? null,
    })))
  }

  return {
    cycleId: cycle.id,
    cycleStart: cycle.start_date ?? null,
    totalWeeks: cycle.total_weeks || 4,
    lookup,
    combos,
  }
}

/** Праздники/короткие дни по каждому центру: centerId → { 'YYYY-M-D': Holiday }. */
export async function loadHolidaysByCenter(
  centerIds: string[],
): Promise<Record<string, Record<string, Holiday>>> {
  const byCenter: Record<string, Record<string, Holiday>> = {}
  for (const id of centerIds) byCenter[id] = {}
  if (!centerIds.length) return byCenter

  const { data, error } = await supabase.schema('menumaker')
    .from('holidays')
    .select('center_id, year, month, day, name, type, close_time')
    .in('center_id', centerIds)
  // Тихо потерянные праздники = бланк, где закрытый день расписан как рабочий.
  throwIf(error, 'праздники центра не прочитаны')

  for (const h of (data || []) as any[]) {
    const bucket = (byCenter[h.center_id] ??= {})
    bucket[`${h.year}-${h.month}-${h.day}`] = { type: h.type, name: h.name, close_time: h.close_time }
  }
  return byCenter
}

/**
 * Публикует месяц по перечисленным центрам одной операцией.
 * Версия считается ОТДЕЛЬНО по каждому центру (max существующей + 1), строки
 * уходят одним insert — либо публикуются все центры, либо ни один.
 */
export async function publishMonth(opts: {
  centers: PublishCenter[]
  year: number
  month: number
  orgId?: string | null
  userId?: string | null
  program?: string
  /** Уже загруженные данные — чтобы страница не читала их второй раз. */
  source?: MenuSource
  holidaysByCenter?: Record<string, Record<string, Holiday>>
}): Promise<{ published: PublishedRow[]; error?: string }> {
  const { centers, year, month, orgId, userId, program = 'child' } = opts
  if (!centers.length) return { published: [], error: 'No centers available to publish for.' }
  if (!year || !month) return { published: [], error: 'No month selected.' }

  let source: MenuSource | null
  let holidaysByCenter: Record<string, Record<string, Holiday>>
  const ids = centers.map(c => c.id)
  try {
    source = opts.source ?? await loadMenuSource(program)
    holidaysByCenter = opts.holidaysByCenter ?? await loadHolidaysByCenter(ids)
  } catch (e: any) {
    return { published: [], error: e?.message ?? 'the database refused the request' }
  }
  if (!source) return { published: [], error: 'No active menu cycle found.' }

  // Следующая версия по каждому центру. Ошибку чтения НЕ глотаем: молча начать
  // нумерацию с 1 — значит налететь на уникальный индекс или, хуже, выдать
  // «опубликовано v1» поверх уже существующей истории.
  const { data: prev, error: prevErr } = await supabase.schema('menumaker')
    .from('published_menus')
    .select('center_id, version')
    .eq('program', program).eq('year', year).eq('month', month)
    .in('center_id', ids)
  if (prevErr) return { published: [], error: prevErr.message }

  const nextVersion = nextVersionByCenter(ids, (prev || []) as any[])

  const rows = centers.map(c => ({
    org_id: orgId ?? undefined,
    program,
    center_id: c.id,
    cycle_id: source.cycleId,
    year,
    month,
    version: nextVersion[c.id],
    snapshot: {
      centerName: c.name,
      cycleStart: source.cycleStart,
      totalWeeks: source.totalWeeks,
      lookup: source.lookup,
      holidayByDate: holidaysByCenter[c.id] ?? {},
      combos: source.combos,
    },
    published_by: userId ?? null,
  }))

  const { error } = await supabase.schema('menumaker').from('published_menus').insert(rows)
  if (error) return { published: [], error: error.message }

  return { published: centers.map(c => ({ center: c, version: nextVersion[c.id] })) }
}
