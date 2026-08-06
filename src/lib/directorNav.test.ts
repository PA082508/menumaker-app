// directorNav.test.ts — что видит директор в боковой панели, проверено на НАСТОЯЩЕЙ
// структуре меню, а не на выдуманной.
//
// Повод (03.08): директорам открыли Reports → Attendance Blank. Раздел Reports несёт
// восемь страниц, из них директору положена ОДНА. Гейт здесь ровно один — набор
// DIRECTOR_PATHS; ошибиться в нём значит открыть директору Site Claim или Custom
// Export молча, потому что раздел появится целиком. Поэтому тест проверяет не
// «Attendance Blank видна», а «видна ОНА И БОЛЬШЕ НИЧЕГО из Reports».
//
// Охват данных (свой центр) этим тестом НЕ проверяется — он держится не меню, а
// OrgContext + RLS; см. отчёт 03.08.
import { describe, it, expect } from 'vitest'
import { SECTIONS, DIRECTOR_PATHS, directorSections } from '@/components/layout/AppLayout'

const dir = () => directorSections(SECTIONS)
const section = (id: string) => dir().find(s => s.id === id)
const paths = (id: string) => (section(id)?.items ?? []).map(i => i.path)

describe('боковая панель директора', () => {
  it('Reports открыт и несёт ровно одну страницу — Attendance Blank', () => {
    const reports = section('reports')
    expect(reports, 'раздела Reports нет у директора').toBeDefined()
    expect(paths('reports')).toEqual(['/attendance-blank'])
    expect(reports!.items![0].label).toBe('Attendance Blank')
  })

  it('остальные отчёты директору не видны', () => {
    const hidden = [
      '/claim-report',                 // Site Claim
      '/eligibility-reconciliation',
      '/skeleton-reconciliation',
      '/reports',                      // Meal Count Summary
      '/staff/time-log',               // Time Log Summary
      '/submissions',                  // Income Eligibility
      '/export',                       // Custom Export
    ]
    for (const p of hidden) expect(paths('reports')).not.toContain(p)
  })

  it('открытие Reports не протащило ничего в другие разделы', () => {
    // Разделы, которых у директора нет вовсе.
    for (const id of ['budget', 'resources', 'other', 'settings']) {
      expect(section(id), `раздел ${id} не должен быть виден директору`).toBeUndefined()
    }
    // Меню остаётся только на просмотр: планировщика нет.
    expect(paths('planning')).toEqual(['/menu/current'])
    // Кухонная дверь остаётся у повара, директор ходит в свою.
    expect(paths('operations')).toEqual(['/meal-count-director'])
  })

  it('People несёт дверь Parent access, и она названа НЕ словом Issue', () => {
    // Замер 04.08: ссылки на /safepass/issue не было ни в одном меню — директор
    // не мог начать активацию родителей, не зная адреса наизусть.
    const people = paths('people')
    expect(people, 'двери Parent access у директора нет').toContain('/safepass/issue')
    const item = section('people')!.items!.find(i => i.path === '/safepass/issue')!
    expect(item.label).toBe('Parent access')
    // Рядом стоит «Issue Renewal» — продление зачисления. Два пункта на одно
    // слово в одном меню это неверный тап, поэтому слово занято и повторно не берётся.
    expect(item.label.toLowerCase()).not.toContain('issue')
  })

  it('фильтр пропускает ровно то, что перечислено в DIRECTOR_PATHS', () => {
    const shown = dir().flatMap(s => (s.items ?? []).map(i => i.path))
    for (const p of shown) expect(DIRECTOR_PATHS.has(p)).toBe(true)
    expect(shown).toContain('/attendance-blank')
  })

  it('админский охват не тронут: полное меню Reports осталось при себе', () => {
    const full = SECTIONS.find(s => s.id === 'reports')!
    expect(full.items!.length).toBe(8)
    expect(full.items!.map(i => i.path)).toContain('/claim-report')
  })
})

// ── ДВЕРЬ ВИДНА, А НЕ ПРОСТО ЧИСЛИТСЯ (замер 06.08) ──────────────────────────
//
// Пункт «Parent access» стоял в карте меню, тест это стерёг — и всё равно
// владелец не нашёл его на экране: раздел раскрывался ТОЛЬКО наведением мыши,
// а тап и клик не делали ничего. Тест карты ≠ тест меню.
//
// Здесь проверяется то, что ближе к человеку: пункт приходит в ОБОИХ наборах
// (админском и директорском), и раздел, который его несёт, вообще раскрываем —
// то есть у него есть items, а не noFlyout-заглушка. Полный рендер сайдбара
// проверяется глазами: у проекта нет DOM-рендерера в тестах, и притворяться,
// что есть, значило бы снова стеречь не то.
describe('дверь Parent access', () => {
  const peopleOf = (secs: ReturnType<typeof dir>) => secs.find(s => s.id === 'people')

  it('пункт приходит в АДМИНСКОМ наборе и раздел раскрываем', () => {
    const people = SECTIONS.find(s => s.id === 'people')!
    expect(people.noFlyout, 'раздел-заглушка не раскрывается — пункт был бы недостижим').toBeFalsy()
    expect(people.items!.map(i => i.path)).toContain('/safepass/issue')
  })

  it('пункт приходит в ДИРЕКТОРСКОМ наборе и раздел раскрываем', () => {
    const people = peopleOf(dir())
    expect(people, 'у директора нет раздела People').toBeDefined()
    expect(people!.noFlyout).toBeFalsy()
    expect(people!.items!.map(i => i.path)).toContain('/safepass/issue')
  })

  it('у пункта есть ярлык и иконка — пустая строка в меню невидима так же, как её отсутствие', () => {
    for (const set of [SECTIONS, dir()]) {
      const item = set.find(s => s.id === 'people')!.items!.find(i => i.path === '/safepass/issue')!
      expect(item.label.trim().length).toBeGreaterThan(0)
      expect(item.icon.trim().length).toBeGreaterThan(0)
    }
  })
})
