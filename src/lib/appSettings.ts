// src/lib/appSettings.ts
// Настройки организации поверх платформенных умолчаний (menumaker.app_settings).
//
// УСТРОЙСТВО ТАБЛИЦЫ (замерено 04.08, а не взято по памяти): ключ + `org_id`,
// где строка с `org_id IS NULL` — платформенное умолчание, а строка с org_id —
// переопределение этой организации. Так уже живут `claim_filing_window_days`
// (федеральные 60 против огайских 45) и молочные ключи. Новый ключ садится в
// тот же механизм, а не заводит рядом свой.
//
// ЗАЧЕМ ВООБЩЕ НАСТРОЙКА ПРО СКАНЫ. Скан бумажной формы — это ПОЛЕЗНО, но не
// обязательно: бумага в сейфе полноценна и без него (третье состояние, канон
// 01.08). Разные организации решают это по-разному, и решение не должно жить в
// коде. Ключ управляет ТОЛЬКО ТРЕБОВАНИЕМ — просить, напоминать, подсказывать.
// Он НИКОГДА не управляет возможностью: зона догрузки на вкладке Documents
// работает при любом его положении, потому что запретить приложить документ —
// это не настройка, это поломка.

import { supabase } from '@/lib/supabase'
import { warnIf } from '@/lib/queryError'

/** Просить ли скан к бумажной форме. Умолчание платформы — false (не просить). */
export const ATTACH_SCANS_KEY = 'attach_scans_of_paper_forms'

/**
 * Значение ключа для организации: строка org_id, иначе платформенная, иначе
 * `fallback`. ЧИСТАЯ — чтобы правило «своё перекрывает общее» проверялось
 * тестом, а не читалось на глаз в трёх местах.
 */
export function resolveSetting<T>(
  rows: { org_id: string | null; value: unknown }[], orgId: string | null, fallback: T,
): T {
  const own = rows.find(r => r.org_id && r.org_id === orgId)
  if (own && own.value !== null && own.value !== undefined) return own.value as T
  const platform = rows.find(r => !r.org_id)
  if (platform && platform.value !== null && platform.value !== undefined) return platform.value as T
  return fallback
}

/** Прочитать булев ключ. Отказ чтения НЕ глотается: молчаливое `false` здесь
 *  означало бы «организация выключила», хотя её об этом никто не спрашивал. */
export async function readBoolSetting(
  key: string, orgId: string | null, fallback = false,
): Promise<boolean> {
  const { data, error } = await supabase.schema('menumaker').from('app_settings')
    .select('org_id, value').eq('key', key)
  if (warnIf(error, `appSettings/${key}`)) return fallback
  return resolveSetting<boolean>((data ?? []) as any[], orgId, fallback)
}

/**
 * Записать переопределение организации.
 *
 * ВЫБОР-ПОТОМ-ЗАПИСЬ, А НЕ UPSERT — и это замер, а не вкус: уникальность в
 * таблице стоит ВЫРАЖЕНИЕМ
 *   (coalesce(org_id, '000…0'), key, coalesce(effective_date, '0001-01-01')),
 * а PostgREST умеет `on_conflict` только по колонкам. `upsert` с
 * `onConflict:'key,org_id'` отбился бы целиком — и, судя по истории этого
 * репозитория, отбился бы МОЛЧА.
 */
export async function writeBoolSetting(
  key: string, orgId: string, value: boolean, description?: string,
): Promise<string | null> {
  const { data: existing, error: readErr } = await supabase.schema('menumaker').from('app_settings')
    .select('id').eq('key', key).eq('org_id', orgId).is('effective_date', null).limit(1)
  if (readErr) return readErr.message

  const patch = { value, description: description ?? null, updated_at: new Date().toISOString() }
  // Запрос СОБИРАЕТСЯ, потом ОДИН раз ожидается с привязкой error. Тернарник с
  // двумя `await` внутри выглядит короче, но у каждой ветки результат не связан —
  // это ровно тот идиом, на котором в этом репозитории терялись записи.
  const q = existing?.[0]?.id
    ? supabase.schema('menumaker').from('app_settings').update(patch).eq('id', existing[0].id)
    : supabase.schema('menumaker').from('app_settings').insert({ key, org_id: orgId, ...patch })
  const { error } = await q
  return error ? error.message : null
}
