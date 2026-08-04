import { describe, it, expect } from 'vitest'
import { nextVersionByCenter } from './publishVersions'

// ============================================================================
// ВЕРСИЯ СЧИТАЕТСЯ ПО ЦЕНТРУ, А НЕ ПО НАЖАТИЮ.
// Одно нажатие «Publish» на планировщике публикует месяц по всем центрам, но
// история у центров РАЗНАЯ: админ мог переиздать один центр точечно. Общий
// счётчик на всё нажатие налетел бы на уникальный индекс
// (program, center_id, year, month, version) или перепрыгнул номер у остальных.
// ============================================================================

const PEARL = '881ef4ce'
const RIDGE = '4aed7d5a'
const ALPHA = '099c404b'

describe('nextVersionByCenter', () => {
  it('первая публикация месяца — v1 у каждого центра', () => {
    expect(nextVersionByCenter([PEARL, RIDGE, ALPHA], [])).toEqual({
      [PEARL]: 1, [RIDGE]: 1, [ALPHA]: 1,
    })
  })

  it('центр с более длинной историей получает своё следующее число, остальные — своё', () => {
    // Pearl переиздавали точечно (v1, v2, v3), Ridge публиковали один раз,
    // Alpha — ни разу.
    const prev = [
      { center_id: PEARL, version: 1 },
      { center_id: PEARL, version: 3 },
      { center_id: PEARL, version: 2 },
      { center_id: RIDGE, version: 1 },
    ]
    expect(nextVersionByCenter([PEARL, RIDGE, ALPHA], prev)).toEqual({
      [PEARL]: 4, [RIDGE]: 2, [ALPHA]: 1,
    })
  })

  it('порядок строк из базы не влияет на результат', () => {
    const asc = [{ center_id: PEARL, version: 1 }, { center_id: PEARL, version: 2 }]
    const desc = [{ center_id: PEARL, version: 2 }, { center_id: PEARL, version: 1 }]
    expect(nextVersionByCenter([PEARL], asc)).toEqual(nextVersionByCenter([PEARL], desc))
  })

  it('центр, которого нет в публикуемом наборе, не заводит строку в ответе', () => {
    const out = nextVersionByCenter([PEARL], [{ center_id: RIDGE, version: 7 }])
    expect(out).toEqual({ [PEARL]: 1 })
  })

  it('пустая версия в строке не роняет счёт до нуля', () => {
    expect(nextVersionByCenter([PEARL], [{ center_id: PEARL, version: null }])).toEqual({ [PEARL]: 1 })
  })
})
