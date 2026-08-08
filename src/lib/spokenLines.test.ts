import { describe, it, expect } from 'vitest'
import {
  directorAlertBody, spokenArrival, spokenClock, spokenHandoff, spokenMarkRefusal,
  changeRequestBody, changeRequestRow,
} from './spokenLines'
import { muteNoteLine } from './soundMute'

// ============================================================================
// ЯРУС «ГОЛОС» — проверяется здесь, потому что услышать машиной нельзя, а
// сверить произносимое с письменной квитанцией — можно, и это единственное, что
// в голосе вообще можно проверить. Расхождение голоса с полосой = два разных
// свидетельства об одной передаче ребёнка.
// ============================================================================

const at = (h: number, m: number) => {
  const d = new Date(2026, 7, 4, h, m, 0)
  return d.toISOString()
}

describe('час в голосе', () => {
  it('утро — 12-часовой без ведущего нуля', () => {
    expect(spokenClock(at(8, 2))).toBe('8:02')
  })
  it('вечер — 5:12, а не «семнадцать двенадцать»', () => {
    expect(spokenClock(at(17, 12))).toBe('5:12')
  })
  it('полдень и полночь не превращаются в ноль', () => {
    expect(spokenClock(at(12, 0))).toBe('12:00')
    expect(spokenClock(at(0, 30))).toBe('12:30')
  })
})

describe('квитанция передачи вслух', () => {
  it('приём — образец владельца дословно', () => {
    expect(spokenHandoff({ action: 'drop_off', childName: 'Emma Carter', atISO: at(8, 2) }))
      .toBe('Emma Carter — accepted, 8:02')
  })

  it('выдача — с именем принимающего', () => {
    expect(spokenHandoff({
      action: 'pick_up', childName: 'Emma Carter', personName: 'Maria Lopez', atISO: at(17, 12),
    })).toBe('Emma Carter — released to Maria Lopez, 5:12')
  })

  it('без имени принимающего «to» не выдумывается', () => {
    const line = spokenHandoff({ action: 'pick_up', childName: 'Emma Carter', personName: '  ', atISO: at(17, 12) })
    expect(line).toBe('Emma Carter — released, 5:12')
    expect(line).not.toContain(' to ')
  })
})

describe('объявление прихода родителя', () => {
  it('называет пришедшего и ребёнка', () => {
    expect(spokenArrival('Maria Lopez', 'Emma Carter')).toBe('Maria Lopez is here for Emma Carter')
  })
  it('без имени — «Someone», но ребёнок назван', () => {
    expect(spokenArrival(null, 'Emma Carter')).toBe('Someone is here for Emma Carter')
  })
})

describe('отказ записи отметки', () => {
  // Язык — английский, как и весь интерфейс (правило владельца 04.08): русская
  // фраза над английской полосой была бы вторым сообщением об одном отказе.
  it('говорит имя ребёнка и что делать — тем же языком, что полоса', () => {
    expect(spokenMarkRefusal('Peter Ivanov')).toBe('Mark not saved: Peter Ivanov. Mark it again.')
  })
  it('без имени всё равно говорит главное', () => {
    expect(spokenMarkRefusal('')).toBe('Mark not saved. Mark it again.')
  })
})

describe('сообщение директору на 15-й минуте', () => {
  const base = { className: 'Green Room', slotLabel: 'AM Snack', startedHHMM: '09:30', minutesIn: 15 }

  it('первой строкой — класс, приём и время начала', () => {
    const body = directorAlertBody(base)
    expect(body.split('\n')[0]).toBe('Green Room · AM Snack · window opened 09:30 — no marks 15 minutes in.')
  })

  it('без заглушённого звука строки о тишине НЕТ', () => {
    expect(directorAlertBody({ ...base, muteLine: muteNoteLine(null) })).not.toContain('muted')
  })

  it('заглушённый планшет назван в сообщении — иначе молчание класса прочтут как «слышали и не пошли»', () => {
    const body = directorAlertBody({ ...base, muteLine: muteNoteLine('12:40') })
    expect(body).toContain('sound muted since 12:40')
    expect(body).toContain('did not hear')
  })
})

// ============================================================================
// НАГРУЗКА СООБЩЕНИЯ ДИРЕКТОРУ — по ЗАМЕРЕННЫМ колонкам.
// PostgREST отбивает ВЕСЬ insert на одной чужой колонке. Ступень одноразовая:
// второй попытки не будет, и «отправлено» без строки в базе значит, что
// директора не позвали вовсе.
// ============================================================================

import { directorAlertRow, INTERNAL_MESSAGE_COLUMNS, INTERNAL_MESSAGE_REQUIRED } from './spokenLines'

describe('строка internal_messages', () => {
  const row = directorAlertRow({
    className: 'Green Room', slotLabel: 'AM Snack', startedHHMM: '09:30', minutesIn: 15,
    orgId: 'org-1', centerId: 'center-1', centerName: 'Play Academy Pearl', senderId: 'user-1',
  })

  it('не несёт НИ ОДНОЙ колонки, которой нет в таблице', () => {
    const unknown = Object.keys(row).filter(k => !(INTERNAL_MESSAGE_COLUMNS as readonly string[]).includes(k))
    expect(unknown).toEqual([])
  })

  it('несёт все обязательные колонки', () => {
    for (const c of INTERNAL_MESSAGE_REQUIRED) expect(row[c]).toBeTruthy()
  })

  it('подписана отправителем-планшетом: политика send_as_self требует sender_id', () => {
    expect(row.sender_id).toBe('user-1')
    expect(row.sender_name).toBe('Meal window alert')
  })

  it('адресована роли директора этого центра', () => {
    expect(row.recipient_type).toBe('role')
    expect(row.recipient_value).toBe('director')
    expect(row.recipient_label).toBe('Director · Play Academy Pearl')
  })
})

// ── Заявка на правку замкнутого приёма (08.08) ──────────────────────────────
describe('заявка учителя директору', () => {
  const base = {
    personName: 'Carolyn Hercik', className: 'Red', slotLabel: 'Lunch',
    dayLabel: 'Friday, Aug 7',
  }

  it('тело несёт четыре опоры будущей правки: кто · комната · приём · день', () => {
    const b = changeRequestBody(base)
    expect(b).toContain('Carolyn Hercik')
    expect(b).toContain('Red')
    expect(b).toContain('Lunch')
    expect(b).toContain('Friday, Aug 7')
  })

  it('пустая заметка не выдумывается', () => {
    expect(changeRequestBody({ ...base, note: '   ' })).not.toMatch(/note/i)
    expect(changeRequestBody({ ...base, note: 'Mia finished after the bell' }))
      .toMatch(/Mia finished after the bell/)
  })

  it('строка несёт только колонки, которые у таблицы ЕСТЬ, и все обязательные', () => {
    const row = changeRequestRow({ ...base, orgId: 'org-1', centerId: 'c-1',
      centerName: 'Play Academy Wickliffe', senderId: 'user-1' })
    for (const k of Object.keys(row)) expect(INTERNAL_MESSAGE_COLUMNS).toContain(k as any)
    for (const k of INTERNAL_MESSAGE_REQUIRED) expect(row[k]).toBeTruthy()
    expect(row.recipient_label).toBe('Director · Play Academy Wickliffe')
    // Директор видит имя просящего, не открывая тело.
    expect(String(row.sender_name)).toContain('Carolyn Hercik')
  })
})
