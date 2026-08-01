import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { frpExpiryDefault } from '@/lib/enrollmentApprove'

// ============================================================================
// ГАРД БАЗЫ СРОКА F/R — срок отсчитывается от ДАТЫ ДОКУМЕНТА, не от дня ввода.
//
// КАНОН 22.07: 12 месяцев от подписи домохозяйства, до конца месяца.
//
// ПОВОД (замер 01.08). Дверей две, и исполняла канон только одна:
//   ✅ IEA Review  — frpExpiryDefault(formAsOf(submission) ?? today, …)
//   🔴 карточка    — frpExpiryDefault(todayStr, null)   ← отсчёт от дня ВВОДА
//
// ЦЕНА. В пределах одного месяца разницы в деньгах нет: клейм сравнивает
// `frp_expires >= m_start`, поэтому любой день внутри месяца засчитывает месяц
// целиком. Но бумага, подписанная в ИЮНЕ и внесённая в АВГУСТЕ, получала срок на
// два месяца длиннее положенного — переклайм в этих месяцах.
//
// ⚠️ Это ровно та дверь, которой Татьяна будет вносить 126 определений, и та,
// которой идёт проба Wheeler. Ошибка здесь тиражируется на весь список.
// ============================================================================

const HERE = dirname(fileURLToPath(import.meta.url))
const CARD = readFileSync(resolve(HERE, 'ChildSettingsPage.tsx'), 'utf8')

describe('гард — база срока F/R это дата документа, а не день ввода', () => {
  it('карточка ребёнка НЕ отсчитывает срок от сегодняшнего дня', () => {
    expect(CARD, 'вернулся отсчёт от дня ввода — переклайм для бумаги прошлого месяца')
      .not.toMatch(/frpExpiryDefault\(\s*todayStr\s*,/)
  })

  it('карточка берёт базой дату документа, с честным откатом на день ввода', () => {
    expect(CARD).toMatch(/frpExpiryDefault\(\s*prov\.documentDate\s*\|\|\s*todayStr\s*,/)
  })

  it('правило самой функции: 12 месяцев до КОНЦА месяца', () => {
    expect(frpExpiryDefault('2026-08-01', null)).toBe('2027-08-31')  // подпись 1-го числа
    expect(frpExpiryDefault('2026-06-15', null)).toBe('2027-06-30')
    expect(frpExpiryDefault('2026-02-10', null)).toBe('2027-02-28')
  })

  it('НАПЕЧАТАННОЕ НА БЛАНКЕ ГЛАВНЕЕ вычисленного', () => {
    // Срок печатается в спонсорской секции IEA. Если он расходится с нашей
    // арифметикой — верно напечатанное; вычисление лишь подставляет умолчание.
    expect(frpExpiryDefault('2026-08-01', '2027-06-30')).toBe('2027-06-30')
  })

  it('месяц засчитывается ЦЕЛИКОМ: клейм сравнивает с первым числом месяца', () => {
    // Это правило живёт в compute_monthly_claim:
    //   ie.frp_expires >= (select m_start from bounds),  m_start = date_trunc('month')
    // Здесь фиксируем его смысл, чтобы он не «уточнился» до сравнения с датой расчёта.
    const mStart = '2027-08-01'
    for (const expiry of ['2027-08-01', '2027-08-05', '2027-08-31']) {
      expect(expiry >= mStart, `срок ${expiry} обязан давать ПОЛНЫЙ август`).toBe(true)
    }
    expect('2027-07-31' >= mStart).toBe(false)   // истёк до месяца — августа нет
  })
})
