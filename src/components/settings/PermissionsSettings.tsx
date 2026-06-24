// src/components/settings/PermissionsSettings.tsx
// Variant B — Settings → "Permissions" (owners only).
//
// Renders the role × module access matrix from rpc('role_module_matrix') and
// lets an owner change each cell (none/view/edit) via rpc('set_role_module_access').
// Cells overridden for this org (is_override) are highlighted. Below the matrix
// is an optional per-user override tool (rpc('set_user_module_override');
// p_access = null clears the override).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import type { ModuleAccess } from '@/lib/modules'

interface MatrixRow {
  role: string
  module_code: string
  label: string
  category: string | null
  sort_order: number
  access: ModuleAccess
  is_override: boolean
}

interface Cell { access: ModuleAccess; is_override: boolean }

// Preferred role column order; unknown roles append alphabetically.
const ROLE_ORDER = [
  'admin', 'office_manager', 'director', 'cook',
  'cacfp_inspector', 'accountant', 'purchaser', 'driver', 'teacher',
]
const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', office_manager: 'Office Manager', director: 'Director',
  cook: 'Cook', cacfp_inspector: 'CACFP Inspector', accountant: 'Accountant',
  purchaser: 'Purchaser', driver: 'Driver', teacher: 'Teacher',
}
const ACCESS_OPTIONS: ModuleAccess[] = ['none', 'view', 'edit']

const cellKey = (role: string, code: string) => `${role}::${code}`

export default function PermissionsSettings() {
  const { org } = useOrg()
  const orgId = org?.id ?? ''

  const [modules, setModules] = useState<{ code: string; label: string; category: string | null; sort_order: number }[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [cells, setCells] = useState<Map<string, Cell>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    const { data, error } = await (supabase.schema('menumaker').rpc as any)('role_module_matrix', { p_org_id: orgId })
    setLoading(false)
    if (error) { setError(error.message); return }

    const rows = (data ?? []) as MatrixRow[]

    // Unique modules ordered by sort_order.
    const modMap = new Map<string, { code: string; label: string; category: string | null; sort_order: number }>()
    for (const r of rows) {
      if (!modMap.has(r.module_code)) {
        modMap.set(r.module_code, { code: r.module_code, label: r.label, category: r.category, sort_order: r.sort_order })
      }
    }
    const mods = [...modMap.values()].sort((a, b) => a.sort_order - b.sort_order)

    // Unique roles ordered by preference, then alpha.
    const roleSet = [...new Set(rows.map(r => r.role))]
    roleSet.sort((a, b) => {
      const ia = ROLE_ORDER.indexOf(a); const ib = ROLE_ORDER.indexOf(b)
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      return a.localeCompare(b)
    })

    const map = new Map<string, Cell>()
    for (const r of rows) map.set(cellKey(r.role, r.module_code), { access: r.access, is_override: r.is_override })

    setModules(mods)
    setRoles(roleSet)
    setCells(map)
  }, [orgId])

  useEffect(() => { load() }, [load])

  async function changeCell(role: string, code: string, access: ModuleAccess) {
    const key = cellKey(role, code)
    const prev = cells.get(key)
    // optimistic
    setCells(m => new Map(m).set(key, { access, is_override: true }))
    setSavingKey(key)
    const { error } = await (supabase.schema('menumaker').rpc as any)('set_role_module_access', {
      p_org_id: orgId, p_role: role, p_module_code: code, p_access: access,
    })
    setSavingKey(null)
    if (error) {
      // revert
      setCells(m => { const n = new Map(m); if (prev) n.set(key, prev); return n })
      alert(`Could not update access: ${error.message}`)
    }
  }

  if (loading) return <div style={{ padding: 24, color: '#888', fontSize: 13 }}>Loading permissions…</div>
  if (error) return <div style={{ padding: 16, color: '#c0392b', fontSize: 13 }}>❌ {error}</div>

  return (
    <div>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 12, maxWidth: 720, lineHeight: 1.5 }}>
        Controls which sections each role sees in the navigation. Cells highlighted in green are
        overridden for this organization (otherwise the global default applies). This governs
        <b> visibility</b> only — data access is enforced separately by row-level security.
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e8e8e8', borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, fontFamily: 'inherit' }}>
          <thead>
            <tr>
              <th style={{ ...TH, position: 'sticky', left: 0, zIndex: 2, background: '#0f4c35', minWidth: 150, textAlign: 'left' }}>
                Section
              </th>
              {roles.map(r => (
                <th key={r} style={{ ...TH, minWidth: 92 }} title={r}>{ROLE_LABEL[r] ?? r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((mod, i) => (
              <tr key={mod.code} style={{ background: i % 2 ? '#fafdfa' : '#fff' }}>
                <td style={{
                  ...TD, position: 'sticky', left: 0, zIndex: 1,
                  background: i % 2 ? '#fafdfa' : '#fff', fontWeight: 600, whiteSpace: 'nowrap',
                }} title={mod.category ?? ''}>
                  {mod.label}
                  {mod.category && <span style={{ color: '#aaa', fontWeight: 400, marginLeft: 6, fontSize: 10 }}>{mod.category}</span>}
                </td>
                {roles.map(role => {
                  const key = cellKey(role, mod.code)
                  const cell = cells.get(key)
                  const access = cell?.access ?? 'none'
                  return (
                    <td key={role} style={{ ...TD, textAlign: 'center', padding: '4px 6px' }}>
                      <select
                        value={access}
                        disabled={savingKey === key}
                        onChange={e => changeCell(role, mod.code, e.target.value as ModuleAccess)}
                        style={{
                          fontFamily: 'inherit', fontSize: 12, padding: '3px 4px', borderRadius: 6,
                          border: `1.5px solid ${cell?.is_override ? '#0f4c35' : '#e0e0e0'}`,
                          background: cell?.is_override ? '#eef6ef' : '#fff',
                          color: access === 'none' ? '#999' : '#0a3320',
                          fontWeight: cell?.is_override ? 600 : 400, cursor: 'pointer', outline: 'none',
                        }}
                      >
                        {ACCESS_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UserOverride orgId={orgId} modules={modules} />
    </div>
  )
}

// ─── Per-user override tool ─────────────────────────────────────────────────────

function UserOverride({ orgId, modules }: {
  orgId: string
  modules: { code: string; label: string }[]
}) {
  const [userId, setUserId] = useState('')
  const [moduleCode, setModuleCode] = useState('')
  const [access, setAccess] = useState<'view' | 'edit' | 'none' | '__clear__'>('view')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function apply() {
    setMsg(null)
    if (!userId.trim() || !moduleCode) {
      setMsg({ kind: 'err', text: 'Enter a user ID and pick a section.' })
      return
    }
    setBusy(true)
    const { error } = await (supabase.schema('menumaker').rpc as any)('set_user_module_override', {
      p_org_id: orgId,
      p_user_id: userId.trim(),
      p_module_code: moduleCode,
      p_access: access === '__clear__' ? null : access,
    })
    setBusy(false)
    if (error) { setMsg({ kind: 'err', text: error.message }); return }
    setMsg({ kind: 'ok', text: access === '__clear__' ? '✓ Override removed' : '✓ Override applied' })
  }

  return (
    <div style={{ marginTop: 24, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: 18, maxWidth: 720 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0a3320', marginBottom: 4 }}>
        Per-user override
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
        Grant or remove a single section for one user — e.g. give a specific teacher the Menu Planner.
        “Remove override” reverts them to their role-based access.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 150px auto', gap: 12, alignItems: 'end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={LABEL}>User ID (auth uid)</span>
          {/* TODO: replace with a user picker once a user-listing source is available */}
          <input value={userId} onChange={e => setUserId(e.target.value)} placeholder="uuid…" style={INPUT} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={LABEL}>Section</span>
          <select value={moduleCode} onChange={e => setModuleCode(e.target.value)} style={INPUT}>
            <option value="">— select —</option>
            {modules.map(m => <option key={m.code} value={m.code}>{m.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={LABEL}>Access</span>
          <select value={access} onChange={e => setAccess(e.target.value as any)} style={INPUT}>
            <option value="view">view</option>
            <option value="edit">edit</option>
            <option value="none">none</option>
            <option value="__clear__">remove override</option>
          </select>
        </label>
        <button onClick={apply} disabled={busy} style={{
          padding: '8px 16px', borderRadius: 7, border: 'none', fontFamily: 'inherit',
          background: busy ? '#ccc' : '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600,
          cursor: busy ? 'default' : 'pointer',
        }}>
          {busy ? 'Applying…' : 'Apply'}
        </button>
      </div>

      {msg && (
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: msg.kind === 'ok' ? '#0f4c35' : '#c0392b' }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}

// ─── styles ─────────────────────────────────────────────────────────────────────
const TH: React.CSSProperties = { background: '#0f4c35', color: '#fff', padding: '8px 10px', fontSize: 11, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0 }
const TD: React.CSSProperties = { borderBottom: '1px solid #f0f3f0', padding: '6px 10px' }
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555' }
const INPUT: React.CSSProperties = { padding: '7px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0', fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' }
