import { describe, it, expect } from 'vitest'
import { similarChildren, candidateLine, type DedupCandidate } from './childDedup'

// ============================================================================
// ФОНОВЫЙ ДЕДУП. Проверка, которую надо запускать, не запускается: её делает
// тот, кто сомневается, а двойников заводит тот, кто уверен.
// ============================================================================

const kid = (o: Partial<DedupCandidate> & { rosterId: string; childName: string }): DedupCandidate => ({
  firstName: null, lastName: null, birthday: null, room: 'Red', isActive: true, ...o,
})

const LIST: DedupCandidate[] = [
  kid({ rosterId: 'r1', childName: 'Mathews Harlei', firstName: 'Harlei', lastName: 'Mathews', birthday: '2022-04-11', room: 'Purple' }),
  kid({ rosterId: 'r2', childName: 'Bates Kylie',    firstName: 'Kylie',  lastName: 'Bates',   birthday: '2019-09-02' }),
  kid({ rosterId: 'r3', childName: 'Bates Armani',   firstName: 'Armani', lastName: 'Bates',   birthday: '2021-01-30' }),
  kid({ rosterId: 'r4', childName: 'Bates Tyree Jr', firstName: 'Tyree',  lastName: 'Bates',   birthday: '2020-06-15', isActive: false }),
]

describe('фоновый поиск двойника', () => {
  it('оба слова имени совпали — двойник найден', () => {
    const r = similarChildren(LIST, { first: 'Harlei', last: 'Mathews' })
    expect(r.map(c => c.rosterId)).toEqual(['r1'])
  })

  it('порядок слов не важен: в системе «Фамилия Имя», в бумаге «Имя Фамилия»', () => {
    expect(similarChildren(LIST, { first: 'Mathews', last: 'Harlei' }).map(c => c.rosterId)).toEqual(['r1'])
  })

  it('ОДНОЙ фамилии не хватает — иначе шесть подсказок на каждого Bates', () => {
    expect(similarChildren(LIST, { first: 'Zoe', last: 'Bates' })).toEqual([])
  })

  it('фамилия + дата рождения — хватает: имя в бумаге бывает другим', () => {
    const r = similarChildren(LIST, { first: 'TJ', last: 'Bates', birthday: '2020-06-15' })
    expect(r.map(c => c.rosterId)).toEqual(['r4'])
  })

  it('начало имени тоже совпадает — человек ещё дописывает', () => {
    expect(similarChildren(LIST, { first: 'Harl', last: 'Math' }).map(c => c.rosterId)).toEqual(['r1'])
  })

  it('на двух буквах молчим: подсказка не должна опережать ввод', () => {
    expect(similarChildren(LIST, { first: 'Ha', last: 'Ma' })).toEqual([])
  })

  it('ушедший ребёнок тоже находится, но идёт после действующих', () => {
    const list = [...LIST, kid({ rosterId: 'r5', childName: 'Bates Tyree', firstName: 'Tyree', lastName: 'Bates', birthday: '2020-06-15' })]
    const r = similarChildren(list, { first: 'Tyree', last: 'Bates' })
    expect(r[0].isActive).not.toBe(false)
    expect(r.map(c => c.rosterId).sort()).toEqual(['r4', 'r5'])
  })

  it('регистр и диакритика не мешают', () => {
    const list = [kid({ rosterId: 'x', childName: 'Núñez Sofía', firstName: 'Sofía', lastName: 'Núñez' })]
    expect(similarChildren(list, { first: 'sofia', last: 'nunez' }).map(c => c.rosterId)).toEqual(['x'])
  })

  it('подпись кандидата несёт комнату и дату рождения', () => {
    expect(candidateLine(LIST[0])).toBe('Mathews Harlei · Purple · b.04/11/2022')
  })

  it('у ушедшего в подписи сказано, что он не числится', () => {
    expect(candidateLine(LIST[3])).toContain('no longer enrolled')
  })
})
