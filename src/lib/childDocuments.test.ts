import { describe, it, expect } from 'vitest'
import { hasFile, sortByDocumentDate, unfiledNames, type ChildDocRow } from './childDocuments'

// ============================================================================
// ЕДИНЫЙ СПИСОК ДОКУМЕНТОВ РЕБЁНКА — правила, которые иначе проверяются глазами
// и ровно один раз, в день проверки.
// ============================================================================

const row = (o: Partial<ChildDocRow>): ChildDocRow => ({
  id: 'x', doc_type: 'ieg_application', title: null, source: 'uploaded',
  storage_path: 'children/c1/1_a.pdf', valid_from: '2026-07-15', valid_until: null,
  attested_at: null, status: 'active', created_at: '2026-08-01T00:00:00Z', notes: null, ...o,
})

describe('у бумаги нет файла — и не должно быть кнопок файла', () => {
  it('paper без пути — файла нет', () => {
    expect(hasFile(row({ source: 'paper', storage_path: null }))).toBe(false)
  })

  it('paper НИКОГДА не даёт файла, даже если путь чем-то заполнен', () => {
    // Защита от будущей ошибки: строка «бумага в деле» с путём — это противоречие,
    // и кнопка Download на ней обещала бы файл, которого нет.
    expect(hasFile(row({ source: 'paper', storage_path: 'children/c1/x.pdf' }))).toBe(false)
  })

  it('uploaded и generated с путём — файл есть', () => {
    expect(hasFile(row({ source: 'uploaded' }))).toBe(true)
    expect(hasFile(row({ source: 'generated' }))).toBe(true)
  })

  it('без пути файла нет ни у кого', () => {
    expect(hasFile(row({ source: 'uploaded', storage_path: null }))).toBe(false)
  })
})

describe('порядок — по ДОКУМЕНТНОЙ дате', () => {
  it('новее по бумаге — выше, даже если загружено раньше', () => {
    const older = row({ id: 'a', valid_from: '2026-06-01', created_at: '2026-08-04T10:00:00Z' })
    const newer = row({ id: 'b', valid_from: '2026-07-15', created_at: '2026-06-05T10:00:00Z' })
    expect(sortByDocumentDate([older, newer]).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('строки без документной даты уходят ВНИЗ, а не наверх', () => {
    const dated = row({ id: 'a', valid_from: '2026-06-01' })
    const undated = row({ id: 'b', valid_from: null })
    expect(sortByDocumentDate([undated, dated]).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('одна дата — новее по времени записи выше', () => {
    const first = row({ id: 'a', valid_from: '2026-07-15', created_at: '2026-07-16T00:00:00Z' })
    const second = row({ id: 'b', valid_from: '2026-07-15', created_at: '2026-08-01T00:00:00Z' })
    expect(sortByDocumentDate([first, second]).map(r => r.id)).toEqual(['b', 'a'])
  })
})

describe('Unfiled uploads', () => {
  const dir = 'children/c1'

  it('файл со строкой в списке неразобранных не появляется', () => {
    const rows = [row({ storage_path: `${dir}/1_a.pdf` })]
    expect(unfiledNames(['1_a.pdf', '2_b.pdf'], dir, rows)).toEqual(['2_b.pdf'])
  })

  it('сравнение по ПОЛНОМУ пути: одноимённый файл другого ребёнка не засчитывается', () => {
    const rows = [row({ storage_path: 'children/OTHER/1_a.pdf' })]
    expect(unfiledNames(['1_a.pdf'], dir, rows)).toEqual(['1_a.pdf'])
  })

  it('бумажная строка ничего не «разбирает» — у неё нет пути', () => {
    const rows = [row({ source: 'paper', storage_path: null })]
    expect(unfiledNames(['1_a.pdf'], dir, rows)).toEqual(['1_a.pdf'])
  })
})
