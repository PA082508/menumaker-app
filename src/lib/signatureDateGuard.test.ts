import { describe, it, expect } from 'vitest'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error — детектор один на гард и на пробу, он .mjs без типов
import { scanSignatureDate, violationsIn, ALLOW } from '../../scripts/signatureDateScan.mjs'

// ============================================================================
// ГАРД: documentDateOf — ЕДИНСТВЕННЫЙ ВХОД к документной дате.
//
// ПОВОД (Николай, 29.07). Закрыв тихую ошибку порядком чтения, мы завели
// ОТЛОЖЕННУЮ: 12 запечатанных строк не получат колонку НИКОГДА (signature_date
// в замороженном списке печати), все бумажные до правки — тоже. Их покрывает
// documentDateOf: колонка → form_data. Но тот, кто через три месяца напишет
// запрос ПРЯМО ПО КОЛОНКЕ, получит для них пустоту и не заметит.
//
// Тот же случай, для которого стоит гард на child_name: инвариант проверяется
// там, где его МОЖНО нарушить.
//
// В БАЗЕ проверено отдельно (гард сборки туда не достанет): колонку упоминают
// ровно две функции — печать (замораживает) и submit_enrollment_form (пишет).
// Ни одного вида и ни одного читателя, 29.07.
// ============================================================================

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '..')

describe('guard — документная дата берётся только через documentDateOf', () => {
  const { offenders, allowedSeen } = scanSignatureDate(SRC + '/')

  it('никто не читает signature_date напрямую, кроме названного списка', () => {
    expect(
      offenders.map((o: any) => `${o.rel}:${o.lines.join(',')}`),
      'прямое чтение колонки signature_date. У запечатанных и старых бумажных строк она ПУСТА — ' +
      'дата лежит в form_data. Читать через documentDateOf(); если случай особый, добавить файл в ' +
      'ALLOW (scripts/signatureDateScan.mjs) С ПРИЧИНОЙ.',
    ).toEqual([])
  })

  it('у каждого исключения названа причина', () => {
    for (const [file, why] of Object.entries(ALLOW as Record<string, string>)) {
      expect(String(why).length, `исключение ${file} без причины`).toBeGreaterThan(20)
    }
  })

  it('список исключений не разбух молча — каждый в нём ещё нужен', () => {
    // Файл, попавший в ALLOW и переставший читать колонку, должен уйти из списка:
    // мёртвое исключение завтра прикроет живое нарушение.
    const stale = Object.keys(ALLOW as Record<string, string>).filter(f => !allowedSeen.includes(f))
    expect(stale, 'эти файлы больше не читают signature_date — убрать из ALLOW').toEqual([])
  })
})

describe('негативная проба — гард ловит нарушение и не краснеет на похожем', () => {
  it('ловит прямое чтение колонки', () => {
    expect(violationsIn(`const d = submission.signature_date`)).toHaveLength(1)
    expect(violationsIn(`.select('id,signature_date,form_data')`)).toHaveLength(1)
  })

  it('не считает нарушением ДРУГИЕ поля с похожим именем', () => {
    expect(violationsIn(`const d = med.physician_signature_date`)).toHaveLength(0)
    expect(violationsIn(`const d = fd.parent_signature_date`)).toHaveLength(0)
  })

  it('не считает нарушением разговор о правиле', () => {
    expect(violationsIn(`// signature_date читаем только через documentDateOf`)).toHaveLength(0)
    expect(violationsIn(`/*\n * signature_date у старых строк пуст\n */`)).toHaveLength(0)
  })
})
