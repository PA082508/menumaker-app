import { describe, it, expect } from 'vitest'
import { normalizeForReplica } from './replicaData'

// Живая форма из базы (Broadwater Aaron): дни С ЗАГЛАВНОЙ — реплика их не видела,
// и расписание в бланке было ПУСТЫМ.
const live = {
  child_name: 'Aaron Broadwater', birthdate: '2017-04-02',
  schedule: {
    Mon: { arr1: '9:00', dep1: '5:00', in_care: true, meals: { lunch: true, supper: true, am_snack: true } },
    Fri: { arr1: '9:00', dep1: '5:00', in_care: true, meals: { lunch: true } },
  },
}

describe('перевод данных на язык реплики', () => {
  it('дни приводятся к строчным — иначе бланк рисует пустое расписание', () => {
    const out: any = normalizeForReplica(live)
    expect(Object.keys(out.schedule).sort()).toEqual(['fri', 'mon'])
    expect(out.schedule.mon.arr1).toBe('9:00')
    expect(out.schedule.mon.meals.lunch).toBe(true)
  })

  it('ничего, кроме ключей дней, не меняется', () => {
    const out: any = normalizeForReplica(live)
    expect(out.child_name).toBe('Aaron Broadwater')
    expect(out.birthdate).toBe('2017-04-02')
  })

  it('идемпотентно: уже строчное возвращается тем же объектом', () => {
    const lower = { schedule: { mon: { arr1: '9:00' } } }
    expect(normalizeForReplica(lower)).toBe(lower)
  })

  it('явный строчный ключ СТАРШЕ заглавного — прочитанное не затирается', () => {
    const both: any = normalizeForReplica({ schedule: { mon: { arr1: '8:00' }, Mon: { arr1: '9:00' } } })
    expect(both.schedule.mon.arr1).toBe('8:00')
  })

  it('чужие ключи расписания остаются как есть', () => {
    const out: any = normalizeForReplica({ schedule: { Mon: { arr1: '9:00' }, varies: true } })
    expect(out.schedule.varies).toBe(true)
  })

  it('нет расписания / не объект — отдаём как есть, без выдумок', () => {
    const noSched = { child_name: 'X' }
    expect(normalizeForReplica(noSched)).toBe(noSched)
    expect(normalizeForReplica(null as any)).toBeNull()
    expect(normalizeForReplica('str' as any)).toBe('str')
  })
})
