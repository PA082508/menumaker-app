import { describe, it, expect } from 'vitest'
import { ORG_LABEL, centerLabel, sortCentersForSwitcher, CENTER_DISPLAY_BY_SLUG } from './centerLabels'

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
