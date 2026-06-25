/**
 * CenterInfoSettings.tsx
 *
 * Settings → Center Configuration → "Center Info".
 *
 * Editable form for the currently-selected center (from OrgContext). Loads the
 * full row from menumaker.centers by currentCenter.id, lets the user edit the
 * identity / licensing fields, and saves with an UPDATE … WHERE id = center.id.
 *
 * The center selector itself lives in the SettingsPage header, so this panel
 * just reacts to currentCenter changes (re-fetches the row). Self-contained:
 * re-creates the local Field helper, inputStyle and primary-button idioms used
 * by SettingsPage rather than importing them.
 *
 * RLS: centers has a permissive auth_manage (true) + restrictive org_isolation
 * and module_cacfp_active, so any authenticated member of the center's org can
 * update it — no service key / edge function needed.
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

// ─── Local style idioms (mirrors SettingsPage) ─────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '8px 11px', borderRadius: 7, border: '1.5px solid #e0e0e0',
  fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff',
  color: '#1a1a1a', boxSizing: 'border-box', width: '100%',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{label}</span>
      {children}
    </label>
  )
}

// ─── Row shape (editable subset of menumaker.centers) ──────────────────────────

interface CenterRow {
  name: string
  address: string
  phone: string
  license_number: string
  license_capacity: string        // kept as strings for controlled inputs
  license_capacity_under2: string
  license_issued: string          // yyyy-mm-dd
  site_number: string
  administrator: string
  program_type: string
  fso_license_number: string
  fso_license_expires: string     // yyyy-mm-dd
}

const EMPTY: CenterRow = {
  name: '', address: '', phone: '', license_number: '',
  license_capacity: '', license_capacity_under2: '', license_issued: '',
  site_number: '', administrator: '', program_type: '',
  fso_license_number: '', fso_license_expires: '',
}

// db value → string for a controlled input
const s = (v: unknown): string => (v == null ? '' : String(v))

// Center selector styled as a clear, clickable button with a ▾ arrow.
const selStyle: React.CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  background: "#fff url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M1 1l4 4 4-4' fill='none' stroke='%230f4c35' stroke-width='1.5'/></svg>\") no-repeat right 12px center",
  border: '1.5px solid #0f4c35', borderRadius: 8, padding: '6px 30px 6px 12px',
  fontSize: 13, fontFamily: 'inherit', color: '#0f4c35', fontWeight: 600, cursor: 'pointer', outline: 'none',
}

export default function CenterInfoSettings() {
  const { currentCenter, centers, setCurrentCenter } = useOrg()
  const centerId = currentCenter?.id ?? null

  const [form, setForm]       = useState<CenterRow>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!centerId) { setLoading(false); return }
    setLoading(true)
    setMsg(null)
    const { data, error } = await supabase
      .schema('menumaker')
      .from('centers')
      .select('name, address, phone, license_number, license_capacity, license_capacity_under2, license_issued, site_number, administrator, program_type, fso_license_number, fso_license_expires')
      .eq('id', centerId)
      .single()
    if (error) {
      setMsg({ kind: 'err', text: 'Failed to load center — ' + error.message })
    } else if (data) {
      setForm({
        name: s(data.name), address: s(data.address), phone: s(data.phone),
        license_number: s(data.license_number),
        license_capacity: s(data.license_capacity),
        license_capacity_under2: s(data.license_capacity_under2),
        license_issued: s(data.license_issued).slice(0, 10),
        site_number: s(data.site_number),
        administrator: s(data.administrator),
        program_type: s(data.program_type),
        fso_license_number: s(data.fso_license_number),
        fso_license_expires: s(data.fso_license_expires).slice(0, 10),
      })
    }
    setLoading(false)
  }, [centerId])

  useEffect(() => { load() }, [load])

  const set = (k: keyof CenterRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // integer | null from a controlled string field
  const toInt = (v: string): number | null => {
    const t = v.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? Math.trunc(n) : null
  }

  async function save() {
    if (!centerId) return
    if (!form.name.trim()) { setMsg({ kind: 'err', text: 'Center name is required.' }); return }
    if (!form.program_type.trim()) { setMsg({ kind: 'err', text: 'Program type is required.' }); return }
    setSaving(true)
    setMsg(null)
    const { error } = await supabase
      .schema('menumaker')
      .from('centers')
      .update({
        name:                    form.name.trim(),
        address:                 form.address.trim() || null,
        phone:                   form.phone.trim() || null,
        license_number:          form.license_number.trim() || null,
        license_capacity:        toInt(form.license_capacity),
        license_capacity_under2: toInt(form.license_capacity_under2),
        license_issued:          form.license_issued || null,
        site_number:             form.site_number.trim() || null,
        administrator:           form.administrator.trim() || null,
        program_type:            form.program_type.trim(),
        fso_license_number:      form.fso_license_number.trim() || null,
        fso_license_expires:     form.fso_license_expires || null,
      })
      .eq('id', centerId)
    setSaving(false)
    if (error) {
      setMsg({ kind: 'err', text: 'Save failed — ' + error.message })
    } else {
      setMsg({ kind: 'ok', text: '✓ Center info saved' })
      setTimeout(() => setMsg(null), 2500)
    }
  }

  // Title row with inline center selector — shown in every state so the user
  // can pick a center even from Organization view.
  const titleRow = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap', marginBottom: 4 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0a3320' }}>🏢 Center Info</div>
      {centers.length > 1 && (
        <select
          value={currentCenter?.id ?? ''}
          onChange={e => { const v = e.target.value; setCurrentCenter(v ? (centers.find(c => c.id === v) ?? null) : null) }}
          style={selStyle}
        >
          <option value="">🏢 Organization (all centers)</option>
          {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
    </div>
  )

  const outer: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', padding: '22px 24px', maxWidth: 760 }

  if (!centerId) {
    return (
      <div style={outer}>
        {titleRow}
        <div style={{ padding: '28px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Select a center to edit its info.</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={outer}>
        {titleRow}
        <div style={{ padding: '28px 0', color: '#aaa', fontSize: 13 }}>Loading center info…</div>
      </div>
    )
  }

  return (
    <div style={outer}>
      {titleRow}
      <div style={{ fontSize: 12, color: '#888', margin: '2px 0 18px' }}>
        {currentCenter?.name} · Identity &amp; licensing details
      </div>

      {/* Identity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <Field label="Center name *">
          <input value={form.name} onChange={set('name')} placeholder="Center name" style={inputStyle} />
        </Field>
        <Field label="Program type *">
          <input value={form.program_type} onChange={set('program_type')} placeholder="e.g. Head Start, CACFP" style={inputStyle} />
        </Field>
        <Field label="Address">
          <input value={form.address} onChange={set('address')} placeholder="Street, City, State ZIP" style={inputStyle} />
        </Field>
        <Field label="Phone">
          <input value={form.phone} onChange={set('phone')} placeholder="(555) 123-4567" style={inputStyle} />
        </Field>
        <Field label="Administrator name(s)">
          <input value={form.administrator} onChange={set('administrator')} placeholder="e.g. Jane Doe" style={inputStyle} />
        </Field>
        <Field label="Site number">
          <input value={form.site_number} onChange={set('site_number')} placeholder="e.g. 042" style={inputStyle} />
        </Field>
      </div>

      {/* Licensing */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '6px 0 10px' }}>
        Licensing
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 18 }}>
        <Field label="License number">
          <input value={form.license_number} onChange={set('license_number')} placeholder="e.g. C-123456" style={inputStyle} />
        </Field>
        <Field label="License issued date">
          <input type="date" value={form.license_issued} onChange={set('license_issued')} style={inputStyle} />
        </Field>
        <div />
        <Field label="License capacity">
          <input type="number" min="0" step="1" value={form.license_capacity} onChange={set('license_capacity')} placeholder="0" style={inputStyle} />
        </Field>
        <Field label="License capacity (under 2)">
          <input type="number" min="0" step="1" value={form.license_capacity_under2} onChange={set('license_capacity_under2')} placeholder="0" style={inputStyle} />
        </Field>
        <div />
        <Field label="FSO license number">
          <input value={form.fso_license_number} onChange={set('fso_license_number')} placeholder="Food Service Operation license" style={inputStyle} />
        </Field>
        <Field label="FSO license expires">
          <input type="date" value={form.fso_license_expires} onChange={set('fso_license_expires')} style={inputStyle} />
        </Field>
        <div />
      </div>

      {/* Save bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={save} disabled={saving} style={{
          padding: '8px 20px', borderRadius: 7, border: 'none',
          background: saving ? '#ccc' : '#0f4c35', color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
        }}>
          {saving ? 'Saving…' : '💾 Save Center Info'}
        </button>
        {msg && (
          <span style={{ fontSize: 13, fontWeight: 600, color: msg.kind === 'ok' ? '#0f4c35' : '#c0392b' }}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}
