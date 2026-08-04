// src/lib/ieaOnFile.ts
// «У ребёнка есть действующая IEA» — ОДИН ответ на два экрана.
//
// ПОЧЕМУ ОДНА ФУНКЦИЯ. Вопрос задают Site Claim (жёлтая плашка «N Free/Reduced
// without a current IEA on file») и страница сверки. Две реализации одного
// вопроса — это два счётчика на одних данных, и однажды они разойдутся; в этом
// репозитории такое уже стоило денег (spec meal count §8 п.9).
//
// ДВА ИСТОЧНИКА, ОДИН СМЫСЛ (канон третьего состояния, 01.08):
//   1. `income_eligibility` за текущий фискальный год — решение, принятое в системе;
//   2. `documents` со `source='paper'` — бумага, которая ЛЕЖИТ В ДЕЛЕ и за которую
//      кто-то поручился. Скана у неё нет и не будет, и это законное состояние.
// Ребёнок, у которого есть ЛЮБОЕ из двух, документирован. Пока второго источника
// не было, директор с полным сейфом бумаг видел красную цифру и не мог её погасить
// ничем, кроме как соврав «загружено».
//
// ПОЧЕМУ НЕ ЧЕРЕЗ claim_packet_manifest. Манифест — ЦЕНТРОВОЙ по замыслу: он
// отвечает «тип документа присутствует у центра», а не «у этого ребёнка есть его
// IEA». Спрашивать его про ребёнка значит получить «да» на весь центр, как только
// хоть у кого-то бумага есть. Поэтому здесь прямой запрос по `roster_id`.

import { supabase } from '@/lib/supabase'
import { warnIf } from '@/lib/queryError'

/** Код типа из реестра 28 (menumaker.document_types). Бумажная IEA — он же. */
export const IEA_DOC_TYPE = 'ieg_application'

export interface PaperDocPeriod {
  roster_id: string | null
  /** Дата С БУМАГИ. У строки source='paper' она обязательна (CHECK в базе). */
  valid_from: string | null
  /** Срок действия. Пусто — считаем действующей без конца. */
  valid_until: string | null
}

/**
 * Действует ли бумага на указанный день. ЧИСТАЯ — проверяется тестом, потому что
 * «действующий период» это ровно то место, где ошибка не видна глазами: она
 * гасит плашку у ребёнка с просроченной бумагой.
 *
 * Границы ВКЛЮЧИТЕЛЬНЫЕ с обеих сторон: бумага, подписанная сегодня, действует
 * сегодня; бумага, истекающая сегодня, ещё действует сегодня — так же считает
 * заявку `compute_monthly_claim` (`frp_expires >= m_start`).
 */
export function paperCoversDay(d: PaperDocPeriod, dayISO: string): boolean {
  if (!d.roster_id) return false
  if (!d.valid_from) return false
  if (d.valid_from > dayISO) return false
  if (d.valid_until && d.valid_until < dayISO) return false
  return true
}

/**
 * Набор roster_id, у которых IEA считается имеющейся: решение в системе ИЛИ
 * бумага в деле. Отказ чтения НЕ глотается — пустой набор здесь означает
 * «у всех нет документов», то есть красную цифру на весь центр.
 */
export async function loadIeaOnFile(
  centerId: string, fiscalYear: string, dayISO: string,
): Promise<Set<string>> {
  const onFile = new Set<string>()

  const [{ data: ie, error: ieErr }, { data: paper, error: paperErr }] = await Promise.all([
    supabase.schema('menumaker').from('income_eligibility')
      .select('roster_id').eq('center_id', centerId).eq('fiscal_year', fiscalYear),
    supabase.schema('menumaker').from('documents')
      .select('roster_id, valid_from, valid_until')
      .eq('center_id', centerId).eq('doc_type', IEA_DOC_TYPE)
      .eq('source', 'paper').eq('status', 'active'),
  ])
  warnIf(ieErr, 'ieaOnFile/income_eligibility')
  warnIf(paperErr, 'ieaOnFile/documents-paper')

  for (const r of (ie ?? []) as { roster_id: string | null }[]) if (r.roster_id) onFile.add(r.roster_id)
  for (const d of (paper ?? []) as PaperDocPeriod[]) if (paperCoversDay(d, dayISO)) onFile.add(d.roster_id!)

  return onFile
}

/**
 * Документное поле карточки → тип документа из реестра 28, которым оно
 * доказывается. Карта НАМЕРЕННО узкая: строка «бумага в деле» пишется только
 * там, где мы точно знаем, КАКОЙ бумагой значение доказывается. Поле без записи
 * в этой карте подтверждения не порождает — выдумывать тип документа за
 * директора хуже, чем не записать ничего.
 */
export const PAPER_DOC_TYPE_BY_FIELD: Record<string, string> = {
  frp: IEA_DOC_TYPE,
  frp_expires: IEA_DOC_TYPE,
}
