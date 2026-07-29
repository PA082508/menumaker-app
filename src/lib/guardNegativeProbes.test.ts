import { describe, it, expect } from 'vitest'
import {
  importsTypedRenderer, hasDrawTypeToggle, emitsTypedMethod, showsScriptFaces,
  declaredSampleScope,
  sendsBareRegistryVersion, usesDeclaredVersion, marksRegistryFallback,
  declaresLiveOrigin, putsManualEntryInFormVersion,
  kitIncludesBelow, hasBareKitInclude,
} from './guardPredicates'
// @ts-expect-error — детектор один на карту и на гард, он .mjs без типов
import { scanErrorDiscards } from '../../scripts/errorDiscardScan.mjs'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ============================================================================
// НЕГАТИВНЫЕ ПРОБЫ ГАРДОВ — гард без такой пробы есть ЗАЯВЛЕНИЕ, а не гард.
//
// ПОВОД (Николай, 29.07): четыре гарда неделю объявляли «the build fails», не
// будучи подключены к сборке. Подключить их — половина дела; вторая половина —
// узнать, что они вообще СРАБАТЫВАЮТ. Проверка, никогда не видевшая нарушения,
// в отчёте выглядит точно так же хорошо, как работающая.
//
// Каждая проба кормит предикат гарда заведомо ПЛОХИМ образцом и требует, чтобы
// он покраснел. Образцы синтетические: настоящий код портить незачем, а «сборка
// падает» доказывается попыткой сделать запрещённое, а не формулировкой.
// ============================================================================

describe('негативная проба — гард подписи ловит возврат печатного имени', () => {
  it('видит импорт печатного рендерера', () => {
    expect(importsTypedRenderer(`import { renderTypedSignature } from '../lib/typedSignature'`)).toBe(true)
    expect(importsTypedRenderer(`import { drawPad } from '../lib/signaturePad'`)).toBe(false)
  })
  it('видит вернувшийся переключатель draw/type', () => {
    expect(hasDrawTypeToggle(`const [mode, setMode] = useState<'draw' | 'type'>('draw')`)).toBe(true)
    expect(hasDrawTypeToggle(`const [mode, setMode] = useState<'draw'>('draw')`)).toBe(false)
  })
  it("видит method:'typed' в записи подписи", () => {
    expect(emitsTypedMethod(`await save({ method: 'typed', name })`)).toBe(true)
    expect(emitsTypedMethod(`await save({ method: 'drawn', name })`)).toBe(false)
  })
  it('видит рукописные начертания', () => {
    expect(showsScriptFaces(`const SIG_FACES = ['Dancing Script']`)).toBe(true)
    expect(showsScriptFaces(`const FACES = ['Inter']`)).toBe(false)
  })
})

describe('негативная проба — гард полки образцов ловит включённую полку', () => {
  it('читает объявление и отличает включённое от выключенного', () => {
    expect(declaredSampleScope(`var SAMPLE_SCOPE = 'director';`)).toBe('director')
    expect(declaredSampleScope(`var SAMPLE_SCOPE = 'none';`)).toBe('none')
  })
  it('пропажу объявления читает как отказ, а не как «выключено»', () => {
    // Молчание файла — не то же самое, что «нет, выключено»: флаг могли
    // переименовать, и тогда полка живёт под другим именем.
    expect(declaredSampleScope(`// SAMPLE_SCOPE обсуждается тут словами`)).toBeNull()
  })
})

describe('негативная проба — гард провода происхождения ловит подмену редакции', () => {
  it('видит указатель реестра, выданный за редакцию подписанта', () => {
    expect(sendsBareRegistryVersion(`p_form_version: version,`)).toBe(true)
    expect(sendsBareRegistryVersion(`p_form_version: declaredVersion(msg),`)).toBe(false)
  })
  it('видит вырванный declaredVersion', () => {
    expect(usesDeclaredVersion(`function declaredVersion(m){} ... p_form_version: declaredVersion(m),`)).toBe(true)
    expect(usesDeclaredVersion(`p_form_version: registry.current,`)).toBe(false)
  })
  it('видит НЕпомеченный запасной путь', () => {
    expect(marksRegistryFallback(`v = 'registry:' + cur`)).toBe(true)
    expect(marksRegistryFallback(`v = cur`)).toBe(false)
  })
  it('видит запись, не объявившую себя живой', () => {
    expect(declaresLiveOrigin(`p_record_origin: 'live',`)).toBe(true)
    expect(declaresLiveOrigin(`p_record_origin: origin,`)).toBe(false)
  })
  it("видит 'manual_entry', подставленный в поле редакции", () => {
    expect(putsManualEntryInFormVersion(`p_form_version: 'manual_entry',`)).toBe(true)
    expect(putsManualEntryInFormVersion(`p_form_version: null,`)).toBe(false)
  })
})

describe('негативная проба — пол версии кита ловит просроченное включение', () => {
  it('видит включение ниже пола', () => {
    expect(kitIncludesBelow(`<script src="form-kit.js?v=11"></script>`, 13)).toEqual(['11'])
    expect(kitIncludesBelow(`<script src="form-kit.js?v=13"></script>`, 13)).toEqual([])
  })
  it('видит включение вовсе без версии', () => {
    expect(hasBareKitInclude(`<script src="../1-data-sources/form-kit.js"></script>`)).toBe(true)
    expect(hasBareKitInclude(`<script src="../1-data-sources/form-kit.js?v=13"></script>`)).toBe(false)
  })
})

describe('негативная проба — гард выброшенного error ловит оба идиома', () => {
  // Этот гард сканирует дерево, поэтому пробе нужно дерево: временное, из двух
  // файлов — по одному на каждую сегодняшнюю аварию.
  const dir = mkdtempSync(join(tmpdir(), 'zzguard-'))
  writeFileSync(join(dir, 'reader.ts'),
    `const { data } = await supabase.schema('menumaker').from('roster').select('id')\n`)
  writeFileSync(join(dir, 'writer.ts'),
    `const { data: kid } = await supabase.schema('menumaker').rpc('resolve_or_create_child', {})\n`)
  writeFileSync(join(dir, 'clean.ts'),
    `const { data, error } = await supabase.schema('menumaker').from('roster').select('id')\n` +
    `// error-ignored: telemetry only, a miss changes nothing on screen\n` +
    `const { data: t } = await supabase.schema('menumaker').from('ping').select('id')\n`)
  const { app, byVerb } = scanErrorDiscards(dir + '/')
  rmSync(dir, { recursive: true, force: true })

  it('ловит читателя и писателя, и различает их по глаголу', () => {
    expect(app.map((h: any) => h.rel).sort()).toEqual(['reader.ts', 'writer.ts'])
    expect(byVerb['чтение']).toBe(1)
    expect(byVerb['rpc']).toBe(1)
  })

  it('не краснеет на связанном error и на названной причине', () => {
    expect(app.some((h: any) => h.rel === 'clean.ts')).toBe(false)
  })
})
