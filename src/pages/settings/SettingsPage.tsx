import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import MilkRatesSettings from '@/components/settings/MilkRatesSettings'
import MealCountSettings from '@/components/settings/MealCountSettings'
import MealCountAccessSettings from '@/components/settings/MealCountAccessSettings'
import PermissionsSettings from '@/components/settings/PermissionsSettings'
import ScheduleHolidaysSettings from '@/components/settings/ScheduleHolidaysSettings'
import CenterInfoSettings from '@/components/settings/CenterInfoSettings'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  vendor_id: string | null
  component_id: string | null
  purchase_frequency: string | null
  sku: string | null
  package_size: number | null
  package_unit: string | null
  package_label: string | null
  unit_cost: number | null
  assigned_purchaser_id: string | null
  is_whole_grain: boolean
  is_active: boolean
  notes: string | null
  // joined
  vendor_name?: string
  component_label?: string
  component_slug?: string
  purchaser_name?: string
}

interface Vendor {
  id: string
  name: string
  purchase_type: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  order_day: string | null
  lead_days: number | null
  delivery_terms: string | null
}

interface Purchaser {
  id: string
  name: string
  role: string | null
  phone: string | null
  email: string | null
  notes: string | null
  is_active: boolean
}

type Tab = 'products' | 'vendors' | 'purchasers' | 'assign' | 'milk' | 'mealcount' | 'access' | 'permissions' | 'schedule'

// ─── Constants ────────────────────────────────────────────────────────────────

const PURCHASE_TYPE: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  online_delivery: { label: 'Online · Delivery', bg: '#eff6ff', color: '#1e40af', icon: '🚚' },
  online_pickup:   { label: 'Online · Pickup',   bg: '#f0f9ff', color: '#0369a1', icon: '📦' },
  direct_purchase: { label: 'Direct Purchase',   bg: '#f0fff4', color: '#0f4c35', icon: '🛒' },
  will_call:       { label: 'Will Call',         bg: '#fff8f0', color: '#c2670a', icon: '📞' },
  standing_order:  { label: 'Standing Order',    bg: '#fdf4ff', color: '#6b21a8', icon: '🔄' },
  emergency:       { label: 'Emergency',         bg: '#fff0f0', color: '#c0392b', icon: '🆘' },
}

const FREQ_OPTIONS = [
  'daily', 'weekly', 'biweekly', 'monthly', 'as_needed', 'standing',
]

const ORDER_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const PACKAGE_UNITS = ['lb', 'oz', 'kg', 'g', 'each', 'case', 'bag', 'box', 'flat']

// component slug → short badge label
const COMP_ABBR: Record<string, string> = {
  fruit: 'F', grain: 'G', 'grain/bread': 'G',
  meat: 'M', protein: 'M', 'meat/protein': 'M',
  vegetable: 'V', milk: 'Mi',
}
const COMP_COLOR: Record<string, { bg: string; color: string }> = {
  F:  { bg: '#fff0f0', color: '#b91c1c' },
  G:  { bg: '#fffbeb', color: '#92400e' },
  M:  { bg: '#eff6ff', color: '#1e40af' },
  V:  { bg: '#f0fff4', color: '#166534' },
  Mi: { bg: '#fdf4ff', color: '#6b21a8' },
}

// ─── Shared micro-components ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{label}</span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0',
  fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff',
  color: '#1a1a1a', boxSizing: 'border-box', width: '100%',
}

function SaveBar({ onSave, onCancel, saving, msg }: {
  onSave: () => void; onCancel: () => void
  saving: boolean; msg: 'saved' | 'error' | null
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button onClick={onSave} disabled={saving} style={{
        padding: '7px 18px', borderRadius: 7, border: 'none',
        background: saving ? '#ccc' : '#0f4c35', color: '#fff',
        fontSize: 12, fontWeight: 600, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
      }}>
        {saving ? 'Saving…' : '💾 Save'}
      </button>
      <button onClick={onCancel} style={{
        padding: '7px 12px', borderRadius: 7, border: '1px solid #ddd',
        background: '#fff', color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
      }}>
        Cancel
      </button>
      {msg === 'saved' && <span style={{ fontSize: 12, color: '#0f4c35', fontWeight: 600 }}>✓ Saved</span>}
      {msg === 'error' && <span style={{ fontSize: 12, color: '#c0392b' }}>✗ Error</span>}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, padding: '28px',
          maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: '#0a3320' }}>{title}</div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: '50%', border: '1px solid #e0e0e0',
            background: '#f5f5f5', cursor: 'pointer', fontSize: 14, color: '#888',
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab() {
  const [items, setItems]         = useState<Product[]>([])
  const [vendors, setVendors]     = useState<{ id: string; name: string }[]>([])
  const [comps, setComps]         = useState<{ id: string; label: string; slug: string }[]>([])
  const [purchaserList, setPurchaserList] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [fVendor, setFVendor]     = useState('')
  const [fComp, setFComp]         = useState('')
  const [fFreq, setFFreq]         = useState('')
  const [fPurchaser, setFPurchaser] = useState('')
  const [openId, setOpenId]       = useState<string | null>(null)
  const [draft, setDraft]         = useState<Pick<Product, 'purchase_frequency' | 'sku' | 'notes' | 'package_size' | 'package_unit' | 'package_label' | 'unit_cost' | 'assigned_purchaser_id'>>({ purchase_frequency: null, sku: null, notes: null, package_size: null, package_unit: null, package_label: null, unit_cost: null, assigned_purchaser_id: null })
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<'saved' | 'error' | null>(null)
  const [showModal, setShowModal]     = useState(false)
  const [newP, setNewP]               = useState<Partial<Product>>({ is_whole_grain: false })
  const [modalSaving, setModalSaving] = useState(false)
  const [modalMsg, setModalMsg]       = useState<'saved' | 'error' | null>(null)

  useEffect(() => {
    ;(async () => {
      const [{ data: p }, { data: v }, { data: c }, { data: pur }] = await Promise.all([
        supabase.schema('menumaker').from('products')
          .select('*, vendors:vendor_id(name), components:component_id(label,slug), purchasers:assigned_purchaser_id(name)')
          .order('name'),
        supabase.schema('menumaker').from('vendors').select('id,name').order('name'),
        supabase.schema('menumaker').from('components').select('id,label,slug').order('label'),
        supabase.schema('menumaker').from('purchasers').select('id,name').order('name'),
      ])
      setItems((p || []).map((d: any) => ({
        ...d,
        vendor_name:     d.vendors?.name,
        component_label: d.components?.label,
        component_slug:  d.components?.slug,
        purchaser_name:  d.purchasers?.name,
      })))
      setVendors(v || [])
      setComps(c || [])
      setPurchaserList(pur || [])
      setLoading(false)
    })()
  }, [])

  const visible = items.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (fVendor && p.vendor_id !== fVendor) return false
    if (fComp && p.component_id !== fComp) return false
    if (fFreq && p.purchase_frequency !== fFreq) return false
    if (fPurchaser === '__none__' && p.assigned_purchaser_id !== null) return false
    if (fPurchaser && fPurchaser !== '__none__' && p.assigned_purchaser_id !== fPurchaser) return false
    return true
  })

  function expandRow(p: Product) {
    setOpenId(p.id)
    setDraft({ purchase_frequency: p.purchase_frequency, sku: p.sku, notes: p.notes, package_size: p.package_size, package_unit: p.package_unit, package_label: p.package_label, unit_cost: p.unit_cost, assigned_purchaser_id: p.assigned_purchaser_id })
    setMsg(null)
  }

  async function toggleActive(p: Product, e: React.MouseEvent) {
    e.stopPropagation()
    const next = !p.is_active
    await supabase.schema('menumaker').from('products').update({ is_active: next }).eq('id', p.id)
    setItems(prev => prev.map(x => x.id === p.id ? { ...x, is_active: next } : x))
  }

  async function save() {
    if (!openId) return
    setSaving(true); setMsg(null)
    const { error } = await supabase.schema('menumaker').from('products').update({
      purchase_frequency:   draft.purchase_frequency || null,
      sku:                  draft.sku  || null,
      notes:                draft.notes || null,
      package_size:         draft.package_size ?? null,
      package_unit:         draft.package_unit || null,
      package_label:        draft.package_label || null,
      unit_cost:            draft.unit_cost ?? null,
      assigned_purchaser_id: draft.assigned_purchaser_id || null,
    }).eq('id', openId)
    if (error) {
      setMsg('error')
    } else {
      const pname = purchaserList.find(p => p.id === draft.assigned_purchaser_id)?.name
      setItems(prev => prev.map(x => x.id === openId ? { ...x, ...draft, purchaser_name: pname } : x))
      setMsg('saved')
      setTimeout(() => { setOpenId(null); setMsg(null) }, 1100)
    }
    setSaving(false)
  }

  async function addProduct() {
    if (!newP.name?.trim()) return
    setModalSaving(true); setModalMsg(null)
    const { data, error } = await supabase.schema('menumaker').from('products').insert({
      name:                  newP.name,
      vendor_id:             newP.vendor_id          || null,
      component_id:          newP.component_id       || null,
      purchase_frequency:    newP.purchase_frequency || null,
      sku:                   newP.sku                || null,
      package_size:          newP.package_size       ?? null,
      package_unit:          newP.package_unit       || null,
      package_label:         newP.package_label      || null,
      unit_cost:             newP.unit_cost          ?? null,
      assigned_purchaser_id: newP.assigned_purchaser_id || null,
      is_whole_grain:        newP.is_whole_grain     ?? false,
      is_active:             true,
      notes:                 newP.notes              || null,
    }).select('*, vendors:vendor_id(name), components:component_id(label,slug), purchasers:assigned_purchaser_id(name)').single()
    if (error) {
      setModalMsg('error')
    } else {
      const mapped = { ...data, vendor_name: (data as any).vendors?.name, component_label: (data as any).components?.label, component_slug: (data as any).components?.slug, purchaser_name: (data as any).purchasers?.name }
      setItems(prev => [...prev, mapped].sort((a, b) => a.name.localeCompare(b.name)))
      setModalMsg('saved')
      setTimeout(() => { setShowModal(false); setModalMsg(null); setNewP({ is_whole_grain: false }) }, 1100)
    }
    setModalSaving(false)
  }

  const COL = '24px 1fr 130px 110px 100px 100px 80px 100px 44px 60px'

  if (loading) return <Spinner />

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', overflow: 'hidden' }}>

      {/* Filters */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          style={{ ...inputStyle, width: 200, padding: '7px 12px' }}
        />
        {[
          { val: fVendor,   set: setFVendor,   label: 'All vendors',    opts: vendors.map(v => ({ v: v.id,   l: v.name })) },
          { val: fComp,     set: setFComp,     label: 'All components', opts: comps.map(c => ({ v: c.id,    l: c.label })) },
          { val: fFreq,     set: setFFreq,     label: 'All frequencies',opts: FREQ_OPTIONS.map(f => ({ v: f, l: f })) },
        ].map(({ val, set, label, opts }) => (
          <select key={label} value={val} onChange={e => set(e.target.value)}
            style={{ ...inputStyle, width: 'auto', padding: '7px 10px' }}>
            <option value="">{label}</option>
            {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        ))}
        <select value={fPurchaser} onChange={e => setFPurchaser(e.target.value)}
          style={{ ...inputStyle, width: 'auto', padding: '7px 10px' }}>
          <option value="">All purchasers</option>
          <option value="__none__">Unassigned</option>
          {purchaserList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#aaa' }}>{visible.length} items</span>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => { setShowModal(true); setModalMsg(null); setNewP({ is_whole_grain: false }) }}
          style={{
            padding: '6px 14px', borderRadius: 8, border: 'none', fontFamily: 'inherit',
            background: '#0f4c35', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ➕ Add Product
        </button>
      </div>

      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '7px 16px', gap: 8, background: '#fafaf8', borderBottom: '1px solid #f0f0f0' }}>
        {['', 'Name', 'Vendor', 'Component', 'Frequency', 'Purchaser', 'SKU', 'Package', 'WG', 'Active'].map((h, i) => (
          <div key={i} style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      {visible.map((p, i) => {
        const abbr  = (p.component_slug && COMP_ABBR[p.component_slug.toLowerCase()]) || (p.component_label ? p.component_label[0].toUpperCase() : null)
        const cc    = abbr ? (COMP_COLOR[abbr] || { bg: '#f0f0f0', color: '#666' }) : null
        const isOpen = openId === p.id

        return (
          <div key={p.id}>
            <div
              onClick={() => isOpen ? setOpenId(null) : expandRow(p)}
              style={{
                display: 'grid', gridTemplateColumns: COL,
                padding: '9px 16px', gap: 8, alignItems: 'center',
                cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                background: isOpen ? '#f4fdf7' : i % 2 === 0 ? '#fff' : '#fafaf8',
                borderLeft: `3px solid ${isOpen ? '#0f4c35' : 'transparent'}`,
                transition: 'background 0.1s',
              }}
            >
              <span style={{ fontSize: 12, color: '#bbb' }}>{isOpen ? '▾' : '▸'}</span>

              <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{p.name}</span>

              <span style={{ fontSize: 12, color: '#555' }}>{p.vendor_name || <Dash />}</span>

              <span>
                {abbr && cc ? (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: cc.bg, color: cc.color }}>
                    {abbr}{p.component_label ? ` · ${p.component_label}` : ''}
                  </span>
                ) : <Dash />}
              </span>

              <span style={{ fontSize: 12, color: '#555', textTransform: 'capitalize' }}>
                {p.purchase_frequency || <Dash />}
              </span>

              <span style={{ fontSize: 11, color: '#555' }}>
                {p.purchaser_name
                  ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>{p.purchaser_name}</span>
                  : <Dash />}
              </span>

              <span style={{ fontSize: 11, color: '#777', fontFamily: 'monospace' }}>
                {p.sku || <Dash />}
              </span>

              <span style={{ fontSize: 11, color: '#666' }}>
                {p.package_label || (p.package_size != null ? `${p.package_size} ${p.package_unit || ''}`.trim() : null) || <Dash />}
              </span>

              <span>
                {p.is_whole_grain && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>WG</span>
                )}
              </span>

              <span onClick={e => toggleActive(p, e)}>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                  background: p.is_active ? '#f0fff4' : '#f5f5f5',
                  color:      p.is_active ? '#0f4c35' : '#aaa',
                  border:     `1px solid ${p.is_active ? '#bbf7d0' : '#e0e0e0'}`,
                }}>
                  {p.is_active ? 'On' : 'Off'}
                </span>
              </span>
            </div>

            {/* Inline edit */}
            {isOpen && (
              <div style={{ padding: '14px 20px', background: '#f4fdf7', borderBottom: '2px solid #0f4c35' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '160px 140px 140px 1fr', gap: 14, marginBottom: 12 }}>
                  <Field label="Purchase frequency">
                    <select
                      value={draft.purchase_frequency || ''}
                      onChange={e => setDraft(d => ({ ...d, purchase_frequency: e.target.value || null }))}
                      style={inputStyle}
                    >
                      <option value="">— none —</option>
                      {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </Field>
                  <Field label="Assigned purchaser">
                    <select
                      value={draft.assigned_purchaser_id || ''}
                      onChange={e => setDraft(d => ({ ...d, assigned_purchaser_id: e.target.value || null }))}
                      style={inputStyle}
                    >
                      <option value="">— none —</option>
                      {purchaserList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </Field>
                  <Field label="SKU / Item code">
                    <input
                      value={draft.sku || ''}
                      onChange={e => setDraft(d => ({ ...d, sku: e.target.value }))}
                      placeholder="e.g. FNS-1234"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Notes">
                    <textarea
                      value={draft.notes || ''}
                      onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '90px 130px 1fr', gap: 14, marginBottom: 14 }}>
                  <Field label="Pkg size">
                    <input
                      type="number" min="0" step="0.1"
                      value={draft.package_size ?? ''}
                      onChange={e => setDraft(d => ({ ...d, package_size: e.target.value === '' ? null : Number(e.target.value) }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Pkg unit">
                    <select
                      value={draft.package_unit || ''}
                      onChange={e => setDraft(d => ({ ...d, package_unit: e.target.value || null }))}
                      style={inputStyle}
                    >
                      <option value="">—</option>
                      {PACKAGE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                  <Field label="Package label">
                    <input
                      value={draft.package_label || ''}
                      onChange={e => setDraft(d => ({ ...d, package_label: e.target.value }))}
                      placeholder="e.g. 5 lb bag"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Unit Cost ($)">
                    <input type="number" step="0.01" min="0"
                      value={draft.unit_cost ?? ''}
                      onChange={e => setDraft(d => ({ ...d, unit_cost: e.target.value === '' ? null : Number(e.target.value) }))}
                      style={inputStyle} placeholder="0.00" />
                  </Field>
                </div>
                <SaveBar onSave={save} onCancel={() => setOpenId(null)} saving={saving} msg={msg} />
              </div>
            )}
          </div>
        )
      })}

      {visible.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#ccc', fontSize: 13 }}>No products match filters</div>
      )}

      {showModal && (
        <Modal title="Add Product" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Name *">
              <input autoFocus value={newP.name || ''} onChange={e => setNewP(p => ({ ...p, name: e.target.value }))} placeholder="Product name" style={inputStyle} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Vendor">
                <select value={newP.vendor_id || ''} onChange={e => setNewP(p => ({ ...p, vendor_id: e.target.value || null }))} style={inputStyle}>
                  <option value="">— none —</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </Field>
              <Field label="Component">
                <select value={newP.component_id || ''} onChange={e => setNewP(p => ({ ...p, component_id: e.target.value || null }))} style={inputStyle}>
                  <option value="">— none —</option>
                  {comps.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Purchase frequency">
                <select value={newP.purchase_frequency || ''} onChange={e => setNewP(p => ({ ...p, purchase_frequency: e.target.value || null }))} style={inputStyle}>
                  <option value="">— none —</option>
                  {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="SKU">
                <input value={newP.sku || ''} onChange={e => setNewP(p => ({ ...p, sku: e.target.value }))} placeholder="e.g. FNS-1234" style={inputStyle} />
              </Field>
              <Field label="Assigned purchaser">
                <select value={newP.assigned_purchaser_id || ''} onChange={e => setNewP(p => ({ ...p, assigned_purchaser_id: e.target.value || null }))} style={inputStyle}>
                  <option value="">— none —</option>
                  {purchaserList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 130px 1fr', gap: 14 }}>
              <Field label="Pkg size">
                <input
                  type="number" min="0" step="0.1"
                  value={newP.package_size ?? ''}
                  onChange={e => setNewP(p => ({ ...p, package_size: e.target.value === '' ? null : Number(e.target.value) }))}
                  style={inputStyle}
                />
              </Field>
              <Field label="Pkg unit">
                <select
                  value={newP.package_unit || ''}
                  onChange={e => setNewP(p => ({ ...p, package_unit: e.target.value || null }))}
                  style={inputStyle}
                >
                  <option value="">—</option>
                  {PACKAGE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Package label">
                <input
                  value={newP.package_label || ''}
                  onChange={e => setNewP(p => ({ ...p, package_label: e.target.value }))}
                  placeholder="e.g. 5 lb bag"
                  style={inputStyle}
                />
              </Field>
              <Field label="Unit Cost ($)">
                <input type="number" step="0.01" min="0"
                  value={newP.unit_cost ?? ''}
                  onChange={e => setNewP(p => ({ ...p, unit_cost: e.target.value === '' ? null : Number(e.target.value) }))}
                  style={inputStyle} placeholder="0.00" />
              </Field>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: '#333' }}>
              <input type="checkbox" checked={!!newP.is_whole_grain} onChange={e => setNewP(p => ({ ...p, is_whole_grain: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: '#0f4c35' }} />
              Whole grain (WG)
            </label>
            <Field label="Notes">
              <textarea value={newP.notes || ''} onChange={e => setNewP(p => ({ ...p, notes: e.target.value }))} rows={3}
                style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <SaveBar onSave={addProduct} onCancel={() => setShowModal(false)} saving={modalSaving} msg={modalMsg} />
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Vendors Tab ──────────────────────────────────────────────────────────────

function VendorsTab() {
  const [vendors, setVendors]     = useState<Vendor[]>([])
  const [loading, setLoading]     = useState(true)
  const [openId, setOpenId]       = useState<string | null>(null)
  const [draft, setDraft]         = useState<Partial<Vendor>>({})
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<'saved' | 'error' | null>(null)
  const [showModal, setShowModal]     = useState(false)
  const [newV, setNewV]               = useState<Partial<Vendor>>({})
  const [modalSaving, setModalSaving] = useState(false)
  const [modalMsg, setModalMsg]       = useState<'saved' | 'error' | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.schema('menumaker').from('vendors').select('*').order('name')
      setVendors(data || [])
      setLoading(false)
    })()
  }, [])

  function openEdit(v: Vendor) {
    setOpenId(v.id)
    setDraft({ ...v })
    setMsg(null)
  }

  async function save() {
    if (!openId) return
    setSaving(true); setMsg(null)
    const { error } = await supabase.schema('menumaker').from('vendors').update({
      contact_name:   draft.contact_name   || null,
      phone:          draft.phone          || null,
      email:          draft.email          || null,
      purchase_type:  draft.purchase_type  || null,
      order_day:      draft.order_day      || null,
      lead_days:      draft.lead_days      ?? null,
      delivery_terms: draft.delivery_terms || null,
    }).eq('id', openId)
    if (error) {
      setMsg('error')
    } else {
      setVendors(prev => prev.map(v => v.id === openId ? { ...v, ...draft } as Vendor : v))
      setMsg('saved')
      setTimeout(() => { setOpenId(null); setMsg(null) }, 1100)
    }
    setSaving(false)
  }

  async function addVendor() {
    if (!newV.name?.trim()) return
    setModalSaving(true); setModalMsg(null)
    const { data, error } = await supabase.schema('menumaker').from('vendors').insert({
      name:           newV.name,
      purchase_type:  newV.purchase_type  || null,
      contact_name:   newV.contact_name   || null,
      phone:          newV.phone          || null,
      email:          newV.email          || null,
      order_day:      newV.order_day      || null,
      lead_days:      newV.lead_days      ?? null,
      delivery_terms: newV.delivery_terms || null,
    }).select().single()
    if (error) {
      setModalMsg('error')
    } else {
      setVendors(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setModalMsg('saved')
      setTimeout(() => { setShowModal(false); setModalMsg(null); setNewV({}) }, 1100)
    }
    setModalSaving(false)
  }

  if (loading) return <Spinner />

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          onClick={() => { setShowModal(true); setModalMsg(null); setNewV({}) }}
          style={{
            padding: '7px 14px', borderRadius: 8, border: 'none', fontFamily: 'inherit',
            background: '#0f4c35', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          ➕ Add Vendor
        </button>
      </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {vendors.map(v => {
        const pt    = PURCHASE_TYPE[v.purchase_type || ''] || { label: v.purchase_type || '—', bg: '#f0f0f0', color: '#888', icon: '' }
        const isOpen = openId === v.id

        return (
          <div key={v.id} style={{
            background: '#fff', borderRadius: 14, overflow: 'hidden',
            border:     `1px solid ${isOpen ? '#0f4c35' : '#e8e8e8'}`,
            boxShadow:  isOpen ? '0 0 0 3px #0f4c3518' : '0 1px 4px rgba(0,0,0,0.05)',
            transition: 'all 0.15s',
          }}>

            {/* Card face */}
            <div
              onClick={() => isOpen ? setOpenId(null) : openEdit(v)}
              style={{ padding: '16px 18px', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0a3320', lineHeight: 1.2 }}>{v.name}</span>
                <span style={{
                  flexShrink: 0, marginLeft: 8,
                  fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 5,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  background: pt.bg, color: pt.color,
                }}>{pt.icon} {pt.label}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {v.contact_name && <Row icon="👤" text={v.contact_name} />}
                {v.phone        && <Row icon="📞" text={v.phone} />}
                {v.email        && <Row icon="✉"  text={v.email} color="#2563eb" />}
              </div>

              {(v.order_day || v.lead_days != null) && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {v.order_day   && <Chip>{v.order_day}</Chip>}
                  {v.lead_days != null && <Chip>{v.lead_days}d lead</Chip>}
                </div>
              )}

              <div style={{ marginTop: 10, fontSize: 11, color: isOpen ? '#0f4c35' : '#bbb', fontWeight: 500 }}>
                {isOpen ? '▲ Close' : '✏️ Edit'}
              </div>
            </div>

            {/* Inline edit */}
            {isOpen && (
              <div style={{ padding: '14px 18px', borderTop: '2px solid #0f4c35', background: '#f4fdf7' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <Field label="Contact name">
                    <input value={draft.contact_name || ''} onChange={e => setDraft(d => ({ ...d, contact_name: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Phone">
                    <input value={draft.phone || ''} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Email">
                    <input type="email" value={draft.email || ''} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Purchase type">
                    <select value={draft.purchase_type || ''} onChange={e => setDraft(d => ({ ...d, purchase_type: e.target.value }))} style={inputStyle}>
                      <option value="">— none —</option>
                      {Object.entries(PURCHASE_TYPE).map(([k, c]) => <option key={k} value={k}>{c.icon} {c.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Order day">
                    <select value={draft.order_day || ''} onChange={e => setDraft(d => ({ ...d, order_day: e.target.value }))} style={inputStyle}>
                      <option value="">— none —</option>
                      {ORDER_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="Lead days">
                    <input
                      type="number" min={0} max={30}
                      value={draft.lead_days ?? ''}
                      onChange={e => setDraft(d => ({ ...d, lead_days: e.target.value === '' ? null : Number(e.target.value) }))}
                      style={inputStyle}
                    />
                  </Field>
                </div>
                <Field label="Delivery terms">
                  <input value={draft.delivery_terms || ''} onChange={e => setDraft(d => ({ ...d, delivery_terms: e.target.value }))} placeholder="e.g. Net 30" style={inputStyle} />
                </Field>
                <div style={{ marginTop: 12 }}>
                  <SaveBar onSave={save} onCancel={() => setOpenId(null)} saving={saving} msg={msg} />
                </div>
              </div>
            )}
          </div>
        )
      })}

      {vendors.length === 0 && (
        <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: '#ccc', fontSize: 13 }}>No vendors found</div>
      )}
    </div>

      {showModal && (
        <Modal title="Add Vendor" onClose={() => setShowModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Name *">
              <input autoFocus value={newV.name || ''} onChange={e => setNewV(v => ({ ...v, name: e.target.value }))} placeholder="Vendor name" style={inputStyle} />
            </Field>
            <Field label="Purchase type">
              <select value={newV.purchase_type || ''} onChange={e => setNewV(v => ({ ...v, purchase_type: e.target.value || null }))} style={inputStyle}>
                <option value="">— none —</option>
                {Object.entries(PURCHASE_TYPE).map(([k, c]) => <option key={k} value={k}>{c.icon} {c.label}</option>)}
              </select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Contact name">
                <input value={newV.contact_name || ''} onChange={e => setNewV(v => ({ ...v, contact_name: e.target.value }))} style={inputStyle} />
              </Field>
              <Field label="Phone">
                <input value={newV.phone || ''} onChange={e => setNewV(v => ({ ...v, phone: e.target.value }))} style={inputStyle} />
              </Field>
              <Field label="Email">
                <input type="email" value={newV.email || ''} onChange={e => setNewV(v => ({ ...v, email: e.target.value }))} style={inputStyle} />
              </Field>
              <Field label="Order day">
                <select value={newV.order_day || ''} onChange={e => setNewV(v => ({ ...v, order_day: e.target.value || null }))} style={inputStyle}>
                  <option value="">— none —</option>
                  {ORDER_DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Lead days">
                <input type="number" min={0} max={30} value={newV.lead_days ?? ''}
                  onChange={e => setNewV(v => ({ ...v, lead_days: e.target.value === '' ? null : Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="Delivery terms">
                <input value={newV.delivery_terms || ''} onChange={e => setNewV(v => ({ ...v, delivery_terms: e.target.value }))} placeholder="e.g. Net 30" style={inputStyle} />
              </Field>
            </div>
            <SaveBar onSave={addVendor} onCancel={() => setShowModal(false)} saving={modalSaving} msg={modalMsg} />
          </div>
        </Modal>
      )}
    </>
  )
}

// ─── Purchasers Tab ───────────────────────────────────────────────────────────

const EMPTY: Omit<Purchaser, 'id' | 'is_active'> = { name: '', role: '', phone: '', email: '', notes: '' }

function PurchasersTab() {
  const [rows, setRows]           = useState<Purchaser[]>([])
  const [loading, setLoading]     = useState(true)
  const [openId, setOpenId]       = useState<string | null>(null)
  const [draft, setDraft]         = useState<Partial<Purchaser>>({})
  const [showAdd, setShowAdd]     = useState(false)
  const [newP, setNewP]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<'saved' | 'error' | null>(null)
  const [addSaving, setAddSaving] = useState(false)
  const [addMsg, setAddMsg]       = useState<'saved' | 'error' | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .schema('menumaker')
        .from('purchasers')
        .select('id, name, role, phone, email, notes, is_active')
        .order('name')
      console.log('purchasers result:', data, error)
      setRows(data || [])
      setLoading(false)
    })()
  }, [])

  function openEdit(p: Purchaser) {
    setOpenId(p.id); setShowAdd(false)
    setDraft({ ...p })
    setMsg(null)
  }

  async function save() {
    if (!openId) return
    setSaving(true); setMsg(null)
    const { error } = await supabase.schema('menumaker').from('purchasers').update({
      name: draft.name || null, role: draft.role || null,
      phone: draft.phone || null, email: draft.email || null,
      notes: draft.notes || null, is_active: draft.is_active,
    }).eq('id', openId)
    if (error) {
      setMsg('error')
    } else {
      setRows(prev => prev.map(r => r.id === openId ? { ...r, ...draft } as Purchaser : r))
      setMsg('saved')
      setTimeout(() => { setOpenId(null); setMsg(null) }, 1100)
    }
    setSaving(false)
  }

  async function addNew() {
    if (!newP.name.trim()) return
    setAddSaving(true); setAddMsg(null)
    const { data, error } = await supabase.schema('menumaker').from('purchasers').insert({
      name: newP.name, role: newP.role || null, phone: newP.phone || null,
      email: newP.email || null, notes: newP.notes || null, is_active: true,
    }).select().single()
    if (error) {
      setAddMsg('error')
    } else {
      setRows(prev => [...prev, data])
      setNewP(EMPTY); setAddMsg('saved')
      setTimeout(() => { setShowAdd(false); setAddMsg(null) }, 1100)
    }
    setAddSaving(false)
  }

  const COL = '1fr 140px 160px 200px 74px 46px'

  if (loading) return <Spinner />

  return (
    <div>
      {/* Add form */}
      {showAdd && (
        <div style={{ background: '#fff', borderRadius: 14, border: '2px solid #0f4c35', padding: '18px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f4c35', marginBottom: 14 }}>➕ New Purchaser</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 200px', gap: 12, marginBottom: 12 }}>
            <Field label="Name *">
              <input value={newP.name} onChange={e => setNewP(p => ({ ...p, name: e.target.value }))} placeholder="Full name" style={inputStyle} />
            </Field>
            <Field label="Role">
              <input value={newP.role || ''} onChange={e => setNewP(p => ({ ...p, role: e.target.value }))} placeholder="Director, Cook…" style={inputStyle} />
            </Field>
            <Field label="Phone">
              <input value={newP.phone || ''} onChange={e => setNewP(p => ({ ...p, phone: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={newP.email || ''} onChange={e => setNewP(p => ({ ...p, email: e.target.value }))} style={inputStyle} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={newP.notes || ''} onChange={e => setNewP(p => ({ ...p, notes: e.target.value }))} rows={2}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: 12 }} />
          </Field>
          <SaveBar onSave={addNew} onCancel={() => { setShowAdd(false); setNewP(EMPTY) }} saving={addSaving} msg={addMsg} />
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#aaa' }}>{rows.length} purchasers</span>
          <button onClick={() => { setShowAdd(s => !s); setOpenId(null) }} style={{
            padding: '7px 14px', borderRadius: 8, border: 'none', fontFamily: 'inherit',
            background: showAdd ? '#e8e8e8' : '#0f4c35', color: showAdd ? '#666' : '#fff',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            {showAdd ? '✕ Cancel' : '➕ Add Purchaser'}
          </button>
        </div>

        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '7px 16px', gap: 8, background: '#fafaf8', borderBottom: '1px solid #f0f0f0' }}>
          {['Name', 'Role', 'Phone', 'Email', 'Status', ''].map((h, i) => (
            <div key={i} style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {rows.map((p, i) => {
          const isOpen = openId === p.id
          return (
            <div key={p.id}>
              <div style={{
                display: 'grid', gridTemplateColumns: COL,
                padding: '10px 16px', gap: 8, alignItems: 'center',
                background: isOpen ? '#f4fdf7' : i % 2 === 0 ? '#fff' : '#fafaf8',
                borderBottom: '1px solid #f5f5f5',
                borderLeft: `3px solid ${isOpen ? '#0f4c35' : 'transparent'}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{p.name}</span>
                <span style={{ fontSize: 12, color: '#555' }}>{p.role || <Dash />}</span>
                <span style={{ fontSize: 12, color: '#555' }}>{p.phone || <Dash />}</span>
                <span style={{ fontSize: 11, color: '#2563eb' }}>{p.email || <Dash />}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
                  background: p.is_active ? '#f0fff4' : '#f5f5f5',
                  color:      p.is_active ? '#0f4c35' : '#aaa',
                  border:     `1px solid ${p.is_active ? '#bbf7d0' : '#e0e0e0'}`,
                }}>
                  {p.is_active ? 'Active' : 'Off'}
                </span>
                <button onClick={() => isOpen ? setOpenId(null) : openEdit(p)} style={{
                  padding: '4px 9px', borderRadius: 6, fontFamily: 'inherit',
                  border:      `1px solid ${isOpen ? '#0f4c35' : '#e0e0e0'}`,
                  background:  isOpen ? '#0f4c35' : '#fff',
                  color:       isOpen ? '#fff' : '#666',
                  fontSize: 11, cursor: 'pointer',
                }}>
                  {isOpen ? '✕' : '✏️'}
                </button>
              </div>

              {/* Inline edit */}
              {isOpen && (
                <div style={{ padding: '14px 20px', background: '#f4fdf7', borderBottom: '2px solid #0f4c35' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 200px', gap: 12, marginBottom: 12 }}>
                    <Field label="Name">
                      <input value={draft.name || ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={inputStyle} />
                    </Field>
                    <Field label="Role">
                      <input value={draft.role || ''} onChange={e => setDraft(d => ({ ...d, role: e.target.value }))} style={inputStyle} />
                    </Field>
                    <Field label="Phone">
                      <input value={draft.phone || ''} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} style={inputStyle} />
                    </Field>
                    <Field label="Email">
                      <input type="email" value={draft.email || ''} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} style={inputStyle} />
                    </Field>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12, marginBottom: 12 }}>
                    <Field label="Notes">
                      <textarea value={draft.notes || ''} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} rows={2}
                        style={{ ...inputStyle, resize: 'vertical' }} />
                    </Field>
                    <Field label="Status">
                      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                        {([true, false] as const).map(val => (
                          <button key={String(val)} onClick={() => setDraft(d => ({ ...d, is_active: val }))} style={{
                            flex: 1, padding: '8px 4px', borderRadius: 8, fontFamily: 'inherit', cursor: 'pointer',
                            border:     `1.5px solid ${draft.is_active === val ? '#0f4c35' : '#e0e0e0'}`,
                            background: draft.is_active === val ? '#0f4c35' : '#fff',
                            color:      draft.is_active === val ? '#fff' : '#888',
                            fontSize: 11, fontWeight: 600,
                          }}>
                            {val ? '✓ Active' : 'Inactive'}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <SaveBar onSave={save} onCancel={() => setOpenId(null)} saving={saving} msg={msg} />
                </div>
              )}
            </div>
          )
        })}

        {rows.length === 0 && !showAdd && (
          <div style={{ padding: 40, textAlign: 'center', color: '#ccc', fontSize: 13 }}>No purchasers yet</div>
        )}
      </div>
    </div>
  )
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function Dash() {
  return <span style={{ color: '#ddd' }}>—</span>
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#f0f0f0', color: '#666' }}>
      {children}
    </span>
  )
}

function Row({ icon, text, color }: { icon: string; text: string; color?: string }) {
  return (
    <div style={{ fontSize: 12, color: color || '#555', display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ wordBreak: 'break-all' }}>{text}</span>
    </div>
  )
}

function Spinner() {
  return <div style={{ padding: 40, color: '#aaa', fontSize: 13 }}>Loading…</div>
}

// ─── Assign Purchasers Tab ────────────────────────────────────────────────────

function AssignTab() {
  const [purchasers, setPurchasers] = useState<{ id: string; name: string; role: string | null }[]>([])
  const [products,   setProducts]   = useState<{ id: string; name: string; vendor_id: string | null; vendor_name: string | null; component_slug: string | null; assigned_purchaser_id: string | null }[]>([])
  const [vendors,    setVendors]    = useState<{ id: string; name: string }[]>([])
  const [selected,   setSelected]   = useState<string | null>(null)
  const [saving,     setSaving]     = useState<Record<string, boolean>>({})
  const [done,       setDone]       = useState<Record<string, boolean>>({})
  const [fVendor,    setFVendor]    = useState('')
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    ;(async () => {
      const [{ data: pur }, { data: pro }, { data: ven }] = await Promise.all([
        supabase.schema('menumaker').from('purchasers').select('id,name,role').order('name'),
        supabase.schema('menumaker').from('products')
          .select('id,name,vendor_id,assigned_purchaser_id,vendors:vendor_id(name),components:component_id(slug)')
          .eq('is_active', true).order('name'),
        supabase.schema('menumaker').from('vendors').select('id,name').order('name'),
      ])
      setPurchasers(pur || [])
      setProducts((pro || []).map((d: any) => ({
        id: d.id, name: d.name, vendor_id: d.vendor_id,
        vendor_name: d.vendors?.name || null,
        component_slug: d.components?.slug || null,
        assigned_purchaser_id: d.assigned_purchaser_id,
      })))
      setVendors(ven || [])
      setLoading(false)
    })()
  }, [])

  async function assign(productId: string, purchaserId: string | null) {
    setSaving(s => ({ ...s, [productId]: true }))
    const { error } = await supabase.schema('menumaker').from('products')
      .update({ assigned_purchaser_id: purchaserId }).eq('id', productId)
    if (!error) {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, assigned_purchaser_id: purchaserId } : p))
      setDone(d => ({ ...d, [productId]: true }))
      setTimeout(() => setDone(d => ({ ...d, [productId]: false })), 1200)
    }
    setSaving(s => ({ ...s, [productId]: false }))
  }

  if (loading) return <Spinner />

  const sel = purchasers.find(p => p.id === selected)
  const assigned  = products.filter(p => p.assigned_purchaser_id === selected)
  const available = products.filter(p => p.assigned_purchaser_id !== selected && (fVendor ? p.vendor_id === fVendor : true))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>

      {/* Left — purchaser cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Purchasers</div>
        {purchasers.map(p => {
          const count = products.filter(x => x.assigned_purchaser_id === p.id).length
          const active = selected === p.id
          return (
            <button key={p.id} onClick={() => setSelected(active ? null : p.id)} style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              background: active ? '#0f4c35' : '#fff',
              color:      active ? '#fff'    : '#1a1a1a',
              border:     `1px solid ${active ? '#0f4c35' : '#e8e8e8'}`,
              boxShadow:  active ? '0 2px 8px rgba(15,76,53,0.2)' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.15s',
            } as React.CSSProperties}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 11, marginTop: 3, opacity: 0.7 }}>{p.role || 'Purchaser'} · {count} product{count !== 1 ? 's' : ''}</div>
            </button>
          )
        })}
      </div>

      {/* Right — product panels */}
      {!selected ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#ccc', fontSize: 13 }}>← Select a purchaser to manage their products</div>
      ) : (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0a3320', marginBottom: 14 }}>
            {sel?.name} — product assignments
          </div>

          {/* Assigned */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Assigned ({assigned.length})
            </div>
            {assigned.length === 0 ? (
              <div style={{ fontSize: 12, color: '#ccc', padding: '10px 0' }}>No products assigned yet</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {assigned.map(p => (
                  <button key={p.id} onClick={() => assign(p.id, null)} disabled={saving[p.id]} title="Click to unassign" style={{
                    padding: '5px 10px', borderRadius: 8, border: '1.5px solid #bbf7d0', fontFamily: 'inherit', cursor: 'pointer',
                    background: done[p.id] ? '#dcfce7' : '#f0fff4', color: '#0f4c35', fontSize: 12, fontWeight: 500,
                    opacity: saving[p.id] ? 0.5 : 1, transition: 'all 0.15s',
                  }}>
                    {done[p.id] ? '✓ ' : '✕ '}{p.name}
                    {p.vendor_name && <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 5 }}>{p.vendor_name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Available */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Available
              </div>
              <select value={fVendor} onChange={e => setFVendor(e.target.value)}
                style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 11 }}>
                <option value="">All vendors</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            {available.length === 0 ? (
              <div style={{ fontSize: 12, color: '#ccc', padding: '10px 0' }}>No more products available</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, max-content))', gap: 6, gridAutoFlow: 'column', gridTemplateRows: `repeat(${Math.ceil(available.length / 3)}, auto)` }}>
                {available.map(p => {
                  const currentHolder = purchasers.find(x => x.id === p.assigned_purchaser_id)
                  return (
                    <button key={p.id} onClick={() => assign(p.id, selected)} disabled={saving[p.id]} title={currentHolder ? `Currently: ${currentHolder.name}` : 'Click to assign'} style={{
                      padding: '5px 10px', borderRadius: 8, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
                      border: `1.5px solid ${currentHolder ? '#fed7aa' : '#e0e0e0'}`,
                      background: done[p.id] ? '#dcfce7' : currentHolder ? '#fff7ed' : '#fafaf8',
                      color: currentHolder ? '#c2670a' : '#555', fontSize: 12, fontWeight: 500,
                      opacity: saving[p.id] ? 0.5 : 1, transition: 'all 0.15s',
                    }}>
                      {done[p.id] ? '✓ ' : '+ '}{p.name}
                      {p.vendor_name && <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 5 }}>{p.vendor_name}</span>}
                      {currentHolder && <span style={{ fontSize: 10, marginLeft: 5, fontStyle: 'italic' }}>({currentHolder.name})</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Capacity & Ratio Settings ────────────────────────────────────────────────

// Ohio Appendix A to Rule 5180:2-12-18 (effective 10/29/2021)
// Multi-teacher: groupMax multiplies by number of teachers (2 teachers = 2x groupMax)
// Mixed infant room (0-18m): ratio governed by youngest child = 1:5
// School-age max age: <15 years. Children 15+ cannot be in licensed childcare.
const OHIO_RATIOS: Record<string, { label: string; max: number; groupMax: number; minMonths: number; maxMonths: number; note?: string }> = {
  young_infant:      { label: 'Young Infant (0–<12m)',          max: 5,  groupMax: 12, minMonths: 0,   maxMonths: 11,  },
  mixed_infant:      { label: 'Mixed Infant (0–<18m)',          max: 5,  groupMax: 12, minMonths: 0,   maxMonths: 17,  note: 'Ratio by youngest child (1:5). Use when room serves both 0–12m and 12–18m.' },
  older_infant:      { label: 'Older Infant (12–<18m)',         max: 6,  groupMax: 12, minMonths: 12,  maxMonths: 17,  },
  young_toddler:     { label: 'Young Toddler (18m–<2.5yr)',     max: 7,  groupMax: 14, minMonths: 18,  maxMonths: 29,  },
  older_toddler:     { label: 'Older Toddler (2.5–<3yr)',       max: 8,  groupMax: 16, minMonths: 30,  maxMonths: 35,  },
  young_preschool:   { label: 'Young Preschool (3–<4yr)',       max: 12, groupMax: 24, minMonths: 36,  maxMonths: 47,  },
  older_preschool:   { label: 'Older Preschool (4yr–pre-K)',    max: 14, groupMax: 28, minMonths: 48,  maxMonths: 71,  },
  young_schoolage:   { label: 'Young School-Age (K–<11yr)',     max: 18, groupMax: 36, minMonths: 60,  maxMonths: 131, },
  older_schoolage:   { label: 'Older School-Age (11–<15yr)',    max: 20, groupMax: 40, minMonths: 132, maxMonths: 179, },
}

type ClassroomCapacity = {
  id: string; name: string; center_name: string
  age_group_primary: string; capacity_ohio: number
  capacity_internal: number; capacity_room_max: number
  max_younger_children: number; is_early_care: boolean; is_late_care: boolean
  teachers_count: number
  room_sqft: number
}

function CapacitySettings() {
  const { org } = useOrg()
  const [rooms, setRooms] = useState<ClassroomCapacity[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    if (!org?.id) return
    supabase.schema('menumaker')
      .from('classrooms')
      .select('id,name,age_group_primary,capacity_ohio,capacity_internal,capacity_room_max,max_younger_children,is_early_care,is_late_care,centers!inner(name)')
      .eq('org_id', org.id)
      .eq('is_active', true)
      .not('class_key', 'ilike', '%Staff%')
      .order('name')
      .then(({ data }) => {
        if (data) setRooms(data.map((r: any) => ({ ...r, center_name: r.centers?.name ?? '', teachers_count: r.teachers_count ?? 1, room_sqft: r.room_sqft ?? 0 })))
      })
  }, [org?.id])

  async function save(room: ClassroomCapacity) {
    setSaving(room.id)
    await supabase.schema('menumaker').from('classrooms').update({
      age_group_primary:    room.age_group_primary,
      capacity_internal:    room.capacity_internal,
      capacity_room_max:    room.capacity_room_max,
      max_younger_children: room.max_younger_children,
      is_early_care:        room.is_early_care,
      is_late_care:         room.is_late_care,
      teachers_count:       room.teachers_count,
      room_sqft:            room.room_sqft,
    }).eq('id', room.id)
    setSaving(null); setSaved(room.id)
    setTimeout(() => setSaved(null), 2000)
  }

  function upd(id: string, field: keyof ClassroomCapacity, val: any) {
    setRooms(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r))
  }

  const AGE_ORDER = ['young_infant','older_infant','young_toddler','older_toddler','young_preschool','older_preschool','young_schoolage','older_schoolage']
  const centers = [...Array.from(new Set(rooms.map(r => r.center_name))).sort()]
  // Auto-select first center when rooms load
  useEffect(() => {
    if (rooms.length > 0 && (filter === 'all' || !centers.includes(filter))) {
      setFilter(centers[0] ?? 'all')
    }
  }, [rooms])
  const filtered = rooms
    .filter(r => filter === 'all' || r.center_name === filter)
    .sort((a,b) => AGE_ORDER.indexOf(a.age_group_primary) - AGE_ORDER.indexOf(b.age_group_primary))

  const inp: React.CSSProperties = {
    width: 68, padding: '6px 8px', border: '1.5px solid #e5e7eb',
    borderRadius: 7, fontSize: 13, fontFamily: 'inherit', textAlign: 'center' as const,
  }
  const sel: React.CSSProperties = {
    padding: '6px 8px', border: '1.5px solid #e5e7eb',
    borderRadius: 7, fontSize: 12, fontFamily: 'inherit',
  }

  return (
    <div>
      {/* Info banner */}
      <div style={{ background: '#f0f7f4', border: '1px solid #d1fae5', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
        <strong style={{ color: '#1a5c3f' }}>Ohio State Minimums (OAC 5180:2-12-08)</strong> are shown for reference only — they cannot be changed.<br/>
        Set your <strong>Internal Limit</strong> (your own standard, usually stricter) and <strong>Room Max</strong> (physical capacity by square footage).<br/>
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          Early Care hours use Ohio minimums automatically. Mixed age rule: up to N younger children allowed before ratio changes.
        </span>
      </div>

      {/* Ohio reference */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#1a5c3f', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
          Ohio State Ratio Reference (OAC 5180:2-12-08) — read only
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {Object.entries(OHIO_RATIOS).map(([key, val]) => (
            <div key={key} style={{ background: '#f8faf8', borderRadius: 8, padding: '8px 14px', fontSize: 12, textAlign: 'center' as const, border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 700, color: '#0a3320', fontSize: 14 }}>1 : {val.max}</div>
              <div style={{ color: '#6b7280', marginTop: 2, fontSize: 11 }}>{val.label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, lineHeight: 1.5 }}>
          Mixed age: ratio set by youngest child present. Exception: up to the configured number of younger children does not trigger ratio change. Infant (&lt;12m) always triggers 1:5 ratio immediately regardless of count.
        </div>
      </div>

      {/* Center tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' as const }}>
        {centers.map(cn => (
          <button key={cn} onClick={() => setFilter(cn)} style={{
            padding: '7px 16px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit', border: `1.5px solid ${filter === cn ? '#0f4c35' : '#e5e7eb'}`,
            background: filter === cn ? '#0f4c35' : '#fff',
            color: filter === cn ? '#fff' : '#374151',
            fontWeight: filter === cn ? 600 : 400,
          }}>{cn.replace('Play Academy ', '')}</button>
        ))}
      </div>

      {/* Rooms */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
        {filtered.map(room => {
          const ohioMax = OHIO_RATIOS[room.age_group_primary]?.max ?? 12
          const overLimit = room.capacity_internal > ohioMax
          return (
            <div key={room.id} style={{
              background: '#fff', borderRadius: 12,
              border: `1.5px solid ${overLimit ? '#fca5a5' : '#e5e7eb'}`,
              padding: '14px 18px', display: 'flex', gap: 14,
              alignItems: 'center', flexWrap: 'wrap' as const,
            }}>
              {/* Name */}
              <div style={{ minWidth: 150, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0a3320' }}>{room.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{room.center_name}</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' as const }}>
                  {room.is_early_care && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#dbeafe', color: '#1e40af' }}>EARLY CARE</span>}
                {OHIO_RATIOS[room.age_group_primary]?.note && <div style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '3px 7px', marginTop: 4 }}>ℹ️ {OHIO_RATIOS[room.age_group_primary]?.note}</div>}
                  {room.is_late_care && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#fce7f3', color: '#9d174d' }}>LATE CARE</span>}
                </div>
              </div>

              {/* Age group */}
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' as const }}>Age Group</div>
                <select value={room.age_group_primary} onChange={e => upd(room.id, 'age_group_primary', e.target.value)} style={sel}>
                  {Object.entries(OHIO_RATIOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              {/* Ohio — read only */}
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' as const }}>Ohio Min</div>
                <div style={{ width: 68, padding: '7px 8px', background: '#f8faf8', borderRadius: 7, fontSize: 13, textAlign: 'center' as const, color: '#9ca3af', border: '1.5px solid #f0f0f0', fontWeight: 700 }}>
                  1 : {ohioMax}
                </div>
                <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>read-only</div>
              </div>

              {/* Internal */}
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#1a5c3f', marginBottom: 4, textTransform: 'uppercase' as const }}>Internal Max</div>
                <input type="number" value={room.capacity_internal} min={1} max={30}
                  onChange={e => upd(room.id, 'capacity_internal', parseInt(e.target.value) || 1)}
                  style={{ ...inp, borderColor: overLimit ? '#fca5a5' : '#e5e7eb' }}
                />
                {overLimit && <div style={{ fontSize: 9, color: '#dc2626', marginTop: 2 }}>Exceeds Ohio!</div>}
              </div>

              {/* Room max */}
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' as const }}>Room Max</div>
                <input type="number" value={room.capacity_room_max} min={1}
                  onChange={e => upd(room.id, 'capacity_room_max', parseInt(e.target.value) || 1)}
                  style={inp}
                />
              </div>

              {/* Max younger */}
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' as const }}>Max Younger</div>
                <input type="number" value={room.max_younger_children} min={0} max={5}
                  onChange={e => upd(room.id, 'max_younger_children', parseInt(e.target.value) || 0)}
                  style={inp}
                />
                <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>before ratio↑</div>
              </div>

              {/* Teachers + Room sqft + Effective capacity */}
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, minWidth: 200 }}>

                {/* Teachers */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#2d5a45', marginBottom: 4, textTransform: 'uppercase' as const }}>Teachers on Shift</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1,2,3].map(n => (
                      <button key={n} onClick={() => upd(room.id, 'teachers_count', n)}
                        style={{ width: 34, height: 34, borderRadius: 8, border: `2px solid ${room.teachers_count === n ? '#1a5c3f' : '#e5e7eb'}`, background: room.teachers_count === n ? '#1a5c3f' : '#fff', color: room.teachers_count === n ? '#fff' : '#374151', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Room sqft */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' as const }}>Room Area (sq ft)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="number" value={room.room_sqft || ''} min={0} placeholder="e.g. 700"
                      onChange={e => upd(room.id, 'room_sqft', parseInt(e.target.value) || 0)}
                      style={{ ...inp, width: 90 }}
                    />
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>ft²</span>
                  </div>
                  <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 3, lineHeight: 1.4 }}>
                    Wall-to-wall usable area only.<br/>
                    Exclude: hallways, storage, bathrooms<br/>
                    <span style={{ color: '#059669' }}>Include bathrooms only if used exclusively by enrolled children (OAC 5180:2-12-11)</span>
                  </div>
                  {room.room_sqft > 0 && (
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4, fontWeight: 600 }}>
                      {room.room_sqft} ft² ÷ 35 = {Math.floor(room.room_sqft / 35)} children max
                    </div>
                  )}
                </div>

                {/* Effective capacity — the real limit */}
                {(() => {
                  const ratioMax = (OHIO_RATIOS[room.age_group_primary]?.groupMax ?? 12) * room.teachers_count
                  const sqftMax = room.room_sqft > 0 ? Math.floor(room.room_sqft / 35) : ratioMax
                  const effectiveMax = Math.min(ratioMax, sqftMax)
                  const limitedBySpace = room.room_sqft > 0 && sqftMax < ratioMax
                  return (
                    <div style={{ background: limitedBySpace ? '#fef3c7' : '#f0f7f4', borderRadius: 8, padding: '8px 12px', border: `1.5px solid ${limitedBySpace ? '#fbbf24' : '#d1fae5'}` }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, marginBottom: 4 }}>
                        {limitedBySpace ? '⚠️ Limited by Room Size' : '✓ Effective Capacity'}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: limitedBySpace ? '#92400e' : '#1a5c3f' }}>
                        {effectiveMax} children
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                        {limitedBySpace
                          ? `Room: ${sqftMax} · Ohio ratio: ${ratioMax} → room wins`
                          : `Ohio: ${ratioMax} · Room: ${room.room_sqft > 0 ? sqftMax : '—'}`}
                      </div>
                      {limitedBySpace && (
                        <div style={{ fontSize: 10, color: '#92400e', marginTop: 4, fontWeight: 600 }}>
                          To add a {room.teachers_count + 1}rd teacher you need ≥ {Math.ceil(ratioMax * 2 / room.teachers_count * 35)} sq ft
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={room.is_early_care}
                    onChange={e => upd(room.id, 'is_early_care', e.target.checked)}
                    style={{ accentColor: '#1a5c3f' }}/>
                  Early Care
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={room.is_late_care}
                    onChange={e => upd(room.id, 'is_late_care', e.target.checked)}
                    style={{ accentColor: '#1a5c3f' }}/>
                  Late Care
                </label>
              </div>

              {/* Save */}
              <button onClick={() => save(room)} disabled={saving === room.id}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: saved === room.id ? '#059669' : '#0f4c35',
                  color: '#fff', border: 'none',
                  cursor: saving === room.id ? 'wait' : 'pointer',
                  fontFamily: 'inherit', minWidth: 80, transition: 'background 0.2s',
                }}>
                {saving === room.id ? '...' : saved === room.id ? '✓ Saved' : 'Save'}
              </button>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center' as const, padding: 40, color: '#9ca3af', background: '#f9fafb', borderRadius: 12 }}>
            No classrooms found
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Settings landing cards ───────────────────────────────────────────────────

type SectionKey = Tab | 'center_info' | 'cacfp_rates' | 'delivery_settings' | 'capacity'

interface CardDef {
  key: SectionKey
  icon: string
  title: string
  desc: string
  placeholder?: boolean
}

interface CardGroup {
  heading: string
  cards: CardDef[]
}

function SettingCard({ card, onClick }: { card: CardDef; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        padding: '20px 22px', borderRadius: 14,
        border: `1px solid ${hover ? '#0f4c35' : '#e8e8e8'}`,
        background: hover ? '#0f4c35' : '#fff',
        color: hover ? '#fff' : '#1a1a1a',
        boxShadow: hover ? '0 6px 18px rgba(15,76,53,0.25)' : '0 1px 4px rgba(0,0,0,0.05)',
        transition: 'all 0.15s',
        display: 'flex', flexDirection: 'column', gap: 8,
        opacity: card.placeholder && !hover ? 0.75 : 1,
      }}
    >
      <div style={{ fontSize: 30, lineHeight: 1 }}>{card.icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
        {card.title}
        {card.placeholder && (
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            background: hover ? 'rgba(255,255,255,0.2)' : '#f0f0f0',
            color: hover ? '#fff' : '#999',
          }}>Soon</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: hover ? 'rgba(255,255,255,0.85)' : '#888', lineHeight: 1.4 }}>
        {card.desc}
      </div>
    </button>
  )
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: '1px dashed #d8ddd8',
      padding: '48px 40px', textAlign: 'center', color: '#aaa',
    }}>
      <div style={{ fontSize: 34, marginBottom: 10 }}>🚧</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#888', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12 }}>This section is coming soon.</div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [view, setView] = useState<SectionKey | null>(null)
  const { currentCenter, orgRole } = useOrg()
  const { role } = useAuth()
  const canManageAccess = role === 'admin' || role === 'office_manager' || orgRole === 'admin'
  const isOwner = orgRole === 'admin'
  const canSchedule = canManageAccess || role === 'director' || orgRole === 'director'

  const groups: CardGroup[] = ([
    {
      heading: '🍽️ Program & Schedule',
      cards: [
        { key: 'mealcount', icon: '🍽️', title: 'Meal Slots', desc: 'Which meals each center serves' },
        ...(canSchedule ? [{ key: 'schedule', icon: '📅', title: 'Schedule & Holidays', desc: 'Meal times, holidays & short days' } as CardDef] : []),
        { key: 'milk', icon: '🥛', title: 'Milk Rates', desc: 'Milk amounts by age group' },
      ],
    },
    {
      heading: '🛒 Purchasing',
      cards: [
        { key: 'products', icon: '📦', title: 'Products', desc: 'Catalog of purchasable items' },
        { key: 'vendors', icon: '🏪', title: 'Vendors', desc: 'Suppliers & order details' },
        { key: 'purchasers', icon: '👤', title: 'Purchasers', desc: 'People who place orders' },
        { key: 'assign', icon: '🔗', title: 'Assign Purchasers', desc: 'Map products to purchasers' },
      ],
    },
    {
      heading: '👥 Access & Staff',
      cards: [
        ...(canManageAccess ? [{ key: 'access', icon: '🔐', title: 'Meal Count Access', desc: 'Who can record meal counts' } as CardDef] : []),
        ...(isOwner ? [{ key: 'permissions', icon: '🛡️', title: 'Permissions', desc: 'Roles & access control' } as CardDef] : []),
      ],
    },
    {
      heading: '⚙️ Center Configuration',
      cards: [
        ...(canManageAccess ? [{ key: 'center_info', icon: '🏢', title: 'Center Info', desc: 'Name, address, licensing & contacts' } as CardDef] : []),
        { key: 'cacfp_rates', icon: '💵', title: 'CACFP Rates', desc: 'Reimbursement rates', placeholder: true },
        { key: 'delivery_settings', icon: '🚚', title: 'Delivery Settings', desc: 'Dispatch & delivery options', placeholder: true },
        ...(canManageAccess ? [{ key: 'capacity', icon: '📊', title: 'Capacity & Ratio', desc: 'Classroom limits, age groups, Ohio rules & internal standards' } as CardDef] : []),
      ],
    },
  ] as CardGroup[]).filter(g => g.cards.length > 0)

  const activeCard = groups.flatMap(g => g.cards).find(c => c.key === view) ?? null

  function renderSection() {
    switch (view) {
      case 'products':    return <ProductsTab />
      case 'vendors':     return <VendorsTab />
      case 'purchasers':  return <PurchasersTab />
      case 'assign':      return <AssignTab />
      case 'milk':        return <MilkRatesSettings />
      case 'mealcount':   return <MealCountSettings />
      case 'access':      return canManageAccess ? <MealCountAccessSettings /> : null
      case 'permissions': return isOwner ? <PermissionsSettings /> : null
      case 'schedule':    return canSchedule ? <ScheduleHolidaysSettings /> : null
      case 'center_info': return canManageAccess ? <CenterInfoSettings /> : null
      case 'capacity':    return canManageAccess ? <CapacitySettings /> : null
      default:            return <ComingSoon title={activeCard?.title ?? 'Coming soon'} />
    }
  }

  return (
    <div style={{ padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          {view !== null && (
            <button
              onClick={() => setView(null)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8,
                padding: '5px 12px', borderRadius: 8, border: '1px solid #d8ddd8',
                background: '#fff', color: '#0f4c35', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              ← Back to Settings
            </button>
          )}
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 }}>
            {activeCard ? `${activeCard.icon} ${activeCard.title}` : 'Settings'}
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            {currentCenter?.name ?? '—'}{activeCard ? ` · ${activeCard.desc}` : ' · Configure your program'}
          </div>
        </div>
        {/* Center selection now lives inline inside specific sections (Schedule
            & Holidays, Milk Rates) and in the left-sidebar switcher — no
            page-level selector here. */}
      </div>

      {view === null ? (
        /* Landing — card grid grouped into sections */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 760 }}>
          {groups.map(group => (
            <div key={group.heading}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                {group.heading}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                {group.cards.map(card => (
                  <SettingCard key={card.key} card={card} onClick={() => setView(card.key)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        renderSection()
      )}
    </div>
  )
}
