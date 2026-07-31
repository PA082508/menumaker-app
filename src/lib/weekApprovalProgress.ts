// src/lib/weekApprovalProgress.ts
//
// Плитка «Approval Progress» — ЕДИНСТВЕННОЕ, ради чего странице заявки нужны строки
// недели, и это НЕ счёт еды: считаются подписанные класснедели, а не приёмы.
// Вынесено из страницы, чтобы гард «на странице заявки нет ни одного обращения к
// meal_week_records» был проверяем механически (`claimSingleCounter.test.ts`).
//
// Плитка ИНФОРМАЦИОННАЯ (решение владельца 31.07): подпись не условие счёта.

import { supabase } from '@/lib/supabase'

export interface WeekProgress { approved: number; total: number }

export async function loadWeekApprovalProgress(
  centerId: string, mondays: string[],
): Promise<WeekProgress> {
  if (!centerId || mondays.length === 0) return { approved: 0, total: 0 }
  const [{ data: recs, error: recErr }, { data: cls, error: clsErr }] = await Promise.all([
    supabase.schema('menumaker').from('meal_week_records')
      .select('classroom_id,monday_date,status').eq('center_id', centerId).in('monday_date', mondays),
    supabase.schema('menumaker').from('classrooms')
      .select('id,is_roster').eq('center_id', centerId),
  ])
  // Отказ не глотаем: пустой прогресс выглядел бы как «ни одна неделя не подписана».
  if (recErr) throw recErr
  if (clsErr) throw clsErr
  // Псевдоклассы (Staff, is_roster=false) в знаменатель прогресса не входят.
  const rosterIds = new Set((cls ?? []).filter((c: any) => c.is_roster !== false).map((c: any) => c.id))
  const key = (r: any) => `${r.classroom_id}_${r.monday_date}`
  const rows = (recs ?? []).filter((r: any) => rosterIds.has(r.classroom_id))
  return {
    total: new Set(rows.map(key)).size,
    approved: new Set(rows.filter((r: any) => r.status === 'director_approved').map(key)).size,
  }
}
