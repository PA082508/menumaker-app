import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SIGNATURE_MODE_POLICY, SIGNATURE_METHODS, typedSignaturesEnabled } from './signatureMethods'

// ============================================================================
// DRAW-ONLY GUARD — the build fails if a typed autograph comes back anywhere in
// the app. It survived the 2026-07-27 pass by living on the ADMINISTRATIVE
// surface while that pass cleared the parent forms; nobody looked, and it stayed
// live in production for a fortnight. A deleted branch would not have stopped
// that. A failing build will.
//
// Fail-closed: an unreadable tree fails too — "we could not look" must never
// read as "we looked and it was off". Same shape as sampleScopeGuard.test.ts.
// ============================================================================

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '..')
const RENDERER = join(SRC, 'lib', 'typedSignature.ts')
const THIS_FILE = 'signatureMethodsGuard.test.ts'

/** Every .ts/.tsx under src/, except this guard itself. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) { sourceFiles(p, out); continue }
    if (!/\.tsx?$/.test(entry)) continue
    if (entry === THIS_FILE) continue
    out.push(p)
  }
  return out
}

describe('draw-only guard — a typed name is not a signature', () => {
  it('the policy constant says draw-only', () => {
    expect(SIGNATURE_MODE_POLICY).toBe('draw-only')
    expect(typedSignaturesEnabled()).toBe(false)
  })

  it('drawn is the ONLY method a signature may carry', () => {
    expect([...SIGNATURE_METHODS]).toEqual(['drawn'])
  })

  it('nothing in the app imports the typed renderer', () => {
    const files = sourceFiles(SRC)
    expect(files.length, 'could not read src/ — the guard fails closed').toBeGreaterThan(50)

    const importers = files.filter(f => /from\s+['"][^'"]*typedSignature['"]/.test(readFileSync(f, 'utf8')))
    expect(
      importers.map(f => f.slice(SRC.length + 1)),
      'the typed autograph renderer is imported again — a typed name is not a signature (docs/compliance/e-signature.md)',
    ).toEqual([])
  })

  it('the countersign surface offers no mode toggle and never emits "typed"', () => {
    const modal = readFileSync(join(SRC, 'pages', 'enrollment', 'EnrollmentReviewModal.tsx'), 'utf8')
    expect(/'draw'\s*\|\s*'type'/.test(modal), 'a draw/type mode toggle is back in the countersign field').toBe(false)
    expect(/method:\s*'typed'/.test(modal), "the countersign field emits method:'typed' again").toBe(false)
    expect(/SIG_FACES|renderTypedSignature/.test(modal), 'the script faces are back on the countersign field').toBe(false)
  })

  it('the renderer is KEPT on disk — a conserved capability, not a deletion', () => {
    // Ohio says no; another jurisdiction may not. Deleting it would make the
    // future rebuild guess at what was already decided and measured. Same
    // reasoning that kept the signature-sample machinery behind SAMPLE_SCOPE.
    expect(
      existsSync(RENDERER),
      'src/lib/typedSignature.ts was deleted — conserve the socket, do not remove it (see signatureMethods.ts)',
    ).toBe(true)
  })
})
