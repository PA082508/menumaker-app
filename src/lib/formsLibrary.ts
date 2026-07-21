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
}

interface RawForm {
  title?: string
  requiringOrg?: string
  requires_countersign?: string
  intakeMode?: string
}

/** Pure mapping registry.forms → FormLibItem[], sorted by title. Exported for tests. */
export function toFormLibItems(forms: Record<string, RawForm> | undefined | null): FormLibItem[] {
  if (!forms) return []
  return Object.entries(forms)
    .map(([key, f]) => ({
      key,
      title: f?.title || key,
      requiringOrg: f?.requiringOrg,
      requiresCountersign: f?.requires_countersign,
      intakeMode: f?.intakeMode,
      isGovForm: !!(f?.requiringOrg || f?.requires_countersign === 'director' || f?.intakeMode === 'paper_scan'),
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
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
