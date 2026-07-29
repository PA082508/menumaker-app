import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// Предикаты вынесены ради негативной пробы — см. guardNegativeProbes.test.ts.
import {
  sendsBareRegistryVersion, usesDeclaredVersion, marksRegistryFallback,
  declaresLiveOrigin, putsManualEntryInFormVersion,
} from './guardPredicates'

// ============================================================================
// PROVENANCE-WIRE GUARD (этап А) — the build fails if the wire is unplugged or
// starts lying.
//
// WHY A STRUCTURAL GUARD. public/embed.js is a plain IIFE served to the browser;
// it cannot be imported, so it is checked the way form-kit.js is checked in
// sampleScopeGuard.test.ts — by reading the file. Fail-closed: unreadable is a
// failure, because "we could not look" must never read as "we looked and it was
// fine".
//
// WHAT IT PROTECTS. form_version must be the edition the SIGNER had open, never
// the registry's `current`. The registry can flip while a parent has the page
// open; recording `current` would assert an edition the person never saw, and
// that cannot be corrected afterwards — the screen is gone. The fallback is
// allowed but must be MARKED ('registry:' prefix), so a reader can tell a
// measurement from a guess.
// ============================================================================

const HERE = dirname(fileURLToPath(import.meta.url))
const EMBED = resolve(HERE, '../../public/embed.js')
const ADD_CHILD = resolve(HERE, '../pages/children/AddChildRouter.tsx')

describe('provenance wire — form_version is what the signer had open', () => {
  it('embed.js does not send the bare registry pointer as form_version', () => {
    const src = readFileSync(EMBED, 'utf8')
    expect(
      sendsBareRegistryVersion(src),
      'embed.js sends the registry pointer as form_version again — that asserts an edition the signer may never have seen',
    ).toBe(false)
  })

  it('embed.js resolves the self-declared version, and marks the fallback', () => {
    const src = readFileSync(EMBED, 'utf8')
    expect(usesDeclaredVersion(src), 'form_version no longer goes through declaredVersion()').toBe(true)
    // preference order must still be: form's own → payload *_version → marked fallback
    expect(/msg\.formVersion/.test(src), 'the form-declared version is no longer preferred').toBe(true)
    expect(/\(\^\|_\)version\$/.test(src), 'the payload *_version lookup is gone').toBe(true)
    expect(marksRegistryFallback(src), 'the registry fallback is no longer MARKED as a fallback').toBe(true)
  })

  it('embed.js declares the record as live', () => {
    const src = readFileSync(EMBED, 'utf8')
    expect(declaresLiveOrigin(src)).toBe(true)
  })

  it('manual entry claims no form edition', () => {
    // A director typing from paper signed no edition of anything. Writing the
    // word 'manual_entry' into form_version made a version out of a source.
    const src = readFileSync(ADD_CHILD, 'utf8')
    expect(
      putsManualEntryInFormVersion(src),
      "AddChildRouter puts 'manual_entry' in form_version again — that is a source, not an edition",
    ).toBe(false)
    expect(declaresLiveOrigin(src), 'manual entry no longer declares its origin').toBe(true)
  })
})
