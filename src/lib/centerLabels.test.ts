import { describe, it, expect } from 'vitest'
import { ORG_LABEL, centerLabel, centerOfficialName, sortCentersForSwitcher, CENTER_DISPLAY_BY_SLUG } from './centerLabels'

// ============================================================================
// ПОДПИСИ — ТОЛЬКО ПОДПИСИ. Официальное имя центра живёт на бланке и в снимке
// опубликованного меню; подменить его разговорным значит подделать документ.
// Проба сторожит, что через эти функции проходит ИНТЕРФЕЙС, а не бланк.
// ============================================================================

const RIDGE = { slug: 'ridge', name: 'Play Academy Ridge' }
const PEARL = { slug: 'pearl', name: 'Play Academy Pearl' }
const ALPHA = { slug: 'alpha', name: 'Play Academy Highland Heights' }

describe('подписи', () => {
  it('Ridge зовётся Wickliffe, Pearl — Parma Heights', () => {
    expect(centerLabel(RIDGE)).toBe('Wickliffe')
    expect(centerLabel(PEARL)).toBe('Parma Heights')
  })

  it('Highland Heights как есть — город и есть привычное имя', () => {
    expect(centerLabel(ALPHA)).toBe('Highland Heights')
  })

  it('организационный вход — Main Office', () => {
    expect(ORG_LABEL).toBe('Main Office')
  })

  it('ключ — SLUG, а не имя: имя в базе однажды поправят, и подпись отвяжется молча', () => {
    expect(centerLabel({ slug: 'ridge', name: 'Совсем другое имя' })).toBe('Wickliffe')
    expect(Object.keys(CENTER_DISPLAY_BY_SLUG)).toEqual(['ridge', 'pearl'])
  })

  it('неизвестный центр не исчезает и не ломается', () => {
    expect(centerLabel({ slug: 'newtown', name: 'Play Academy Newtown' })).toBe('Newtown')
    expect(centerLabel({})).toBe('—')
  })
})

describe('порядок в переключателе', () => {
  it('сверху вниз: Wickliffe · Highland Heights · Parma Heights', () => {
    expect(sortCentersForSwitcher([PEARL, ALPHA, RIDGE]).map(centerLabel))
      .toEqual(['Wickliffe', 'Highland Heights', 'Parma Heights'])
  })

  it('новый центр идёт СЛЕДОМ, а не встаёт первым молча', () => {
    const NEW = { slug: 'newtown', name: 'Play Academy Newtown' }
    expect(sortCentersForSwitcher([NEW, RIDGE]).map(centerLabel)).toEqual(['Wickliffe', 'Newtown'])
  })
})

// ── Официальное имя (канон владельца 08.08) ─────────────────────────────────
// Клички Ridge · Alpha · Pearl наружу не выходят НИГДЕ — ни в шапке App, ни в
// письме, ни на печатном листе. Наружу центр зовётся по городу.
describe('официальное имя', () => {
  it('кличка в имени базы заменяется городом', () => {
    expect(centerOfficialName(RIDGE)).toBe('Play Academy Wickliffe')
    expect(centerOfficialName(PEARL)).toBe('Play Academy Parma Heights')
    expect(centerOfficialName(ALPHA)).toBe('Play Academy Highland Heights')
  })

  it('ключ — slug: имя в базе поправят, официальное не отвяжется', () => {
    expect(centerOfficialName({ slug: 'ridge', name: 'Play Academy Ridge' }))
      .toBe('Play Academy Wickliffe')
  })

  it('незнакомый центр отдаётся как есть — город ему не выдумывается', () => {
    expect(centerOfficialName({ slug: 'zzdemo', name: 'ZZ Demo' })).toBe('ZZ Demo')
    expect(centerOfficialName({ name: 'Play Academy Somewhere' })).toBe('Play Academy Somewhere')
  })

  it('ни одна кличка не остаётся в выдаче ни одной из подписей', () => {
    for (const c of [RIDGE, PEARL, ALPHA]) {
      expect(`${centerLabel(c)} ${centerOfficialName(c)}`).not.toMatch(/\b(Ridge|Pearl|Alpha)\b/)
    }
  })
})
