import { describe, it, expect } from 'vitest'
import { displayChildName, enrollmentDisplayName } from './childName'

// ============================================================================
// ДВА КОНТУРА — ДВА ПОРЯДКА ИМЕНИ (владелец, 04.08).
// Бланк CACFP требует «Фамилия Имя»; контур зачисления разговаривает с семьёй и
// показывает «Имя Фамилия». Это не непоследовательность, а два разных читателя,
// и проба сторожит, чтобы одно не «починили» под другое.
// ============================================================================


describe('имя в контуре зачисления — «Имя Фамилия»', () => {
  it('собирается из СТРУКТУРНЫХ колонок, а не из витринной child_name', () => {
    // Ровно случай владельца: в реестре лежит «Mathews Harlei», показать надо наоборот.
    expect(enrollmentDisplayName({
      first_name: 'Harlei', last_name: 'Mathews', child_name: 'Mathews Harlei',
    })).toBe('Harlei Mathews')
  })

  it('бланковый порядок остаётся у бланкового показа — две функции не сливаются', () => {
    const c = { first_name: 'Harlei', last_name: 'Mathews', child_name: 'Mathews Harlei' }
    expect(displayChildName(c)).toBe('Mathews Harlei')
    expect(enrollmentDisplayName(c)).toBe('Harlei Mathews')
  })

  it('нет одной из колонок — показывается то, что есть, без пустого места', () => {
    expect(enrollmentDisplayName({ first_name: 'Harlei' })).toBe('Harlei')
    expect(enrollmentDisplayName({ last_name: 'Mathews' })).toBe('Mathews')
  })

  it('структурных колонок нет вовсе — витрина как последний путь', () => {
    // Порядок такой строки прочитать нельзя (у импорта Master List он «Last First»,
    // у заведённых формой — «First Last»), поэтому она отдаётся как есть.
    expect(enrollmentDisplayName({ child_name: 'Mathews Harlei' })).toBe('Mathews Harlei')
    expect(enrollmentDisplayName({})).toBe('—')
  })
})
