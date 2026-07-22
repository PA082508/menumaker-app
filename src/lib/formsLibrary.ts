// formsLibrary.ts — the ONE layer the Packet-Set editor reads the form library through.
//
// Today it resolves the library from the static enroll-registry.json (reg.forms). When the
// forms registry later moves to the DB, ONLY this hook changes — the editor works with
// FormLibItem and never knows where the list came from. That is the whole point of the
// seam: the screen must not fetch or shape the registry itself.
//
// It also surfaces — in DATA, not UI — whether an entry is a vetted government form vs an
// ordinary one. reg.forms already distinguishes them (requiringOrg / requires_countersign /
// intakeMode). A future editor can warn when a director swaps a gov form; today it is just
// metadata the screen may show as a badge, nothing more.

import { useEffect, useMemo, useState } from 'react'

export interface FormLibItem {
  key: string
  title: string
  requiringOrg?: string
  requiresCountersign?: string
  intakeMode?: string
  /** Derived: a vetted government form (state/federal) vs a plain center form. Metadata only. */
  isGovForm: boolean
  /**
   * The map-is-the-gate flag: is this form actually publishable to a family today?
   * True when it resolves to a live version (current → a real versions[current] URL,
   * or a per-center URL object). False when the registry still marks it PENDING /
   * current:null — the document isn't built yet, so a packet must NOT offer it.
   */
  publishable: boolean
  /** When !publishable, a short human reason for the editor to show. */
  unpublishedReason?: string
}

interface RawForm {
  title?: string
  requiringOrg?: string
  requires_countersign?: string
  intakeMode?: string
  /** current edition key, indexing into versions{}. null = nothing published yet. */
  current?: string | null
  /** edition → URL (string) or per-center URL map (object). A "PENDING" string = not built. */
  versions?: Record<string, unknown> | null
  /** Last-resort URL when no versions entry resolves. */
  fallbackUrl?: string | null
  /** Label-only alias: this key shows its own title but IS the form at forms[sameAs]. */
  sameAs?: string
}

/**
 * Does a form resolve to a live, openable version today? A per-center URL object counts
 * (parents_book), a real string URL counts; a null current, a missing versions entry, or a
 * literal "PENDING" placeholder does NOT. Pure — exported for tests.
 */
export function isPublishable(f: RawForm | undefined | null): boolean {
  if (!f) return false
  if (f.fallbackUrl && String(f.fallbackUrl).trim()) return true
  const cur = f.current
  if (!cur) return false
  const v = (f.versions ?? {})[cur]
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0 && v.trim().toUpperCase() !== 'PENDING'
  // object (per-center URL map) or any other truthy structure → publishable
  return typeof v === 'object'
}

/** Pure mapping registry.forms → FormLibItem[], sorted by title. Exported for tests. */
export function toFormLibItems(forms: Record<string, RawForm> | undefined | null): FormLibItem[] {
  if (!forms) return []
  return Object.entries(forms)
    // `_`-prefixed keys are registry meta (e.g. _alias_note), never forms.
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, f]) => {
      // Alias key: gov status + metadata + publishability come from the TARGET (sameAs) —
      // one source of truth for the document — while the title stays the alias's own label.
      // An alias with a missing target resolves against its own (empty) record → not publishable.
      const meta = f?.sameAs ? (forms[f.sameAs] ?? f) : f
      const publishable = isPublishable(meta)
      return {
        key,
        title: f?.title || key,
        requiringOrg: meta?.requiringOrg,
        requiresCountersign: meta?.requires_countersign,
        intakeMode: meta?.intakeMode,
        isGovForm: !!(meta?.requiringOrg || meta?.requires_countersign === 'director' || meta?.intakeMode === 'paper_scan'),
        publishable,
        unpublishedReason: publishable ? undefined : 'Not published yet',
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title))
}

/**
 * The DIRECTOR-ACCESS gate — a SECOND, independent gate from `publishable`.
 *
 *   publishable  = "is this form built?" (registry PENDING / current:null → greyed, unpickable)
 *   composable   = "did the General Director ALLOW directors to put this form in their own sets?"
 *
 * They never merge: a form can be built but not opened to directors (hidden from a director's
 * Add-from-library), or opened but not built (shown greyed). The access map is a thin per-org
 * overlay (menumaker.form_access) the GD toggles; the registry itself is never touched. Absence
 * of a row = NOT composable (closed until the GD opens it) — the safe default. Pure; the caller
 * (PacketSetsPage) owns the org-scoped fetch, exactly as it owns the registry fetch.
 */
export type FormAccessMap = Record<string, boolean>
export function isDirectorComposable(key: string, access: FormAccessMap | null | undefined): boolean {
  return !!access && access[key] === true
}

export interface FormsLibrary {
  items: FormLibItem[]
  byKey: Map<string, FormLibItem>
  loading: boolean
  error: string | null
}

/** The seam. Swap the body (fetch → DB) later; consumers stay untouched. */
export function useFormsLibrary(): FormsLibrary {
  const [items, setItems] = useState<FormLibItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let dead = false
    setLoading(true)
    fetch('/enroll-registry.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('registry ' + r.status))))
      .then(j => { if (!dead) { setItems(toFormLibItems(j?.forms)); setError(null) } })
      .catch(e => { if (!dead) setError(e?.message ?? 'failed to load forms library') })
      .finally(() => { if (!dead) setLoading(false) })
    return () => { dead = true }
  }, [])

  const byKey = useMemo(() => new Map(items.map(i => [i.key, i])), [items])
  return { items, byKey, loading, error }
}
