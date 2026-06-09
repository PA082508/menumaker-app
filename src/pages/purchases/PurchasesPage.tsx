import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductRow {
  product_id: string
  name: string
  vendor_id: string | null
  vendor_name: string | null
  component_label: string | null
  purchase_frequency: string | null
  sku: string | null
  package_label: string | null
  package_size: number | null
  package_unit: string | null
  quantity_g: number
  inv_updated_at: string | null
}

interface PurchaserInfo {
  id: string
  name: string
  role: string | null
}

type CellState = 'idle' | 'saving' | 'saved' | 'error'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LBS_PER_G = 1 / 453.592

function gToLbs(g: number): number { return g * LBS_PER_G }
function lbsToG(lbs: number): number { return lbs * 453.592 }

function fmtLbs(g: number): string {
  const lbs = gToLbs(g)
  if (lbs === 0) return ''
  return (Math.round(lbs * 100) / 100).toString()
}

function fmtTs(ts: string | null): string {
  if (!ts) return ''
  try { return 'Updated: ' + format(new Date(ts), 'MMM d, yyyy h:mm a') } catch { return '' }
}

// Cycle week: anchor = Jan 5, 2026 (Monday of week 2)
const ANCHOR = new Date('2026-01-05T00:00:00')

function getThisMonday(d: Date): Date {
  const diff = (d.getDay() + 6) % 7
  const m = new Date(d)
  m.setDate(d.getDate() - diff)
  m.setHours(0, 0, 0, 0)
  return m
}

function getCycleWeek(d: Date): number {
  const monday = getThisMonday(d)
  const weeks = Math.round((monday.getTime() - ANCHOR.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return ((weeks + 1) % 4 + 4) % 4 + 1
}

function getWeekDateRange(d: Date): string {
  const mon = getThisMonday(d)
  const fri = new Date(mon)
  fri.setDate(mon.getDate() + 4)
  const sameMonth = mon.getMonth() === fri.getMonth()
  return sameMonth
    ? format(mon, 'MMM d') + '–' + format(fri, 'd, yyyy')
    : format(mon, 'MMM d') + '–' + format(fri, 'MMM d, yyyy')
}

function pkgDisplay(row: { package_label: string | null; package_size: number | null; package_unit: string | null }): string {
  if (row.package_label) return row.package_label
  if (row.package_size != null) return `${row.package_size} ${row.package_unit || ''}`.trim()
  return ''
}

function toGrams(qty: number, unit: string | null): number {
  switch ((unit || '').toLowerCase().trim()) {
    case 'kg':                               return qty * 1000
    case 'lb': case 'lbs': case 'pound':    return qty * 453.592
    case 'oz': case 'ounce':                return qty * 28.3495
    case 'l':  case 'liter':                return qty * 1000
    case 'cup':                             return qty * 240
    case 'tbsp': case 'tablespoon':         return qty * 15
    case 'tsp':  case 'teaspoon':           return qty * 5
    default:                                return qty   // assume grams
  }
}

// ─── Purchase Order Modal ─────────────────────────────────────────────────────

function PurchaseOrderModal({
  rows, required, onHandDraft, purchasers, onClose,
}: {
  rows: ProductRow[]
  required: Record<string, string>
  onHandDraft: Record<string, string>
  purchasers: PurchaserInfo[]
  onClose: () => void
}) {
  const today = new Date()
  const cycleWeek = getCycleWeek(today)
  const weekRange = getWeekDateRange(today)
  const title = `Purchase Order — Week ${cycleWeek} · ${weekRange}`

  const [selectedPurchaser, setSelectedPurchaser] = useState('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const orderItems = rows
    .map(r => {
      const req   = parseFloat(required[r.product_id] || '0') || 0
      const onH   = parseFloat(onHandDraft[r.product_id] || '0') || 0
      return { ...r, to_order: Math.max(0, req - onH) }
    })
    .filter(r => r.to_order > 0)
    .sort((a, b) => {
      const va = (a.vendor_name || 'zzz').toLowerCase()
      const vb = (b.vendor_name || 'zzz').toLowerCase()
      return va !== vb ? va.localeCompare(vb) : a.name.localeCompare(b.name)
    })

  const vendorGroups: { vendor: string; vendorId: string | null; items: typeof orderItems }[] = []
  const seenV = new Set<string>()
  orderItems.forEach(r => {
    const key = r.vendor_id ?? '__none__'
    if (!seenV.has(key)) {
      seenV.add(key)
      vendorGroups.push({ vendor: r.vendor_name ?? 'No vendor', vendorId: r.vendor_id, items: [] })
    }
    vendorGroups.find(g => (g.vendorId ?? '__none__') === key)!.items.push(r)
  })

  const grandTotal = orderItems.reduce((s, r) => s + r.to_order, 0)

  function handlePrint() {
    const pName = purchasers.find(p => p.id === selectedPurchaser)?.name || ''
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return

    const bodyRows = vendorGroups.map(g => {
      const vRows = g.items.map(r => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;"><input type="checkbox" ${checked[r.product_id] ? 'checked' : ''}></td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;color:#333;">${g.vendor}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.name}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#c2670a;">${r.to_order.toFixed(1)} lbs</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;">${pkgDisplay(r)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;color:#888;">${r.sku || ''}</td>
        </tr>`).join('')
      const sub = g.items.reduce((s, r) => s + r.to_order, 0)
      return vRows + `
        <tr style="background:#f0f9f4;">
          <td colspan="3" style="padding:5px 10px;font-weight:700;font-size:11px;color:#0a3320;border-bottom:2px solid #d1e8da;">
            Subtotal: ${g.vendor}
          </td>
          <td style="padding:5px 10px;text-align:right;font-weight:700;border-bottom:2px solid #d1e8da;">${sub.toFixed(1)} lbs</td>
          <td colspan="2" style="border-bottom:2px solid #d1e8da;"></td>
        </tr>`
    }).join('')

    w.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;margin:0;padding:20px;color:#1a1a1a}
        h1{font-size:16px;margin:0 0 4px;color:#0a3320}
        .meta{font-size:11px;color:#888;margin-bottom:16px}
        table{width:100%;border-collapse:collapse}
        th{background:#0f4c35;color:#a8d5b5;font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:7px 10px;text-align:left}
        th:nth-child(4){text-align:right}
        .grand{font-size:13px;font-weight:700;text-align:right;padding:10px;border-top:2px solid #0f4c35;color:#0a3320}
        @media print{body{padding:0}}
      </style>
      </head><body>
      <h1>${title}</h1>
      <div class="meta">Purchaser: ${pName || '—'} &nbsp;·&nbsp; Printed: ${format(new Date(), 'MMM d, yyyy h:mm a')}</div>
      <table>
        <thead><tr>
          <th style="width:28px;">☐</th><th>Vendor</th><th>Product</th>
          <th style="text-align:right;">To order</th><th>Package</th><th>SKU</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div class="grand">Grand total: ${grandTotal.toFixed(1)} lbs</div>
      <script>setTimeout(()=>window.print(),400)<\/script>
      </body></html>`)
    w.document.close()
  }

  const COL_M = '32px 160px 1fr 110px 130px 100px'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 1000, overflowY: 'auto', padding: '24px 16px 60px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 860,
          boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', background: '#0f4c35', borderRadius: '16px 16px 0 0',
        }}>
          <div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: '#fff' }}>{title}</div>
            <div style={{ fontSize: 11, color: '#7ee8b0', marginTop: 2 }}>
              {orderItems.length} items · {grandTotal.toFixed(1)} lbs total
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.3)',
            background: 'rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: 16, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Purchaser + print */}
        <div style={{
          padding: '14px 24px', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Purchaser:</span>
          <select
            value={selectedPurchaser}
            onChange={e => setSelectedPurchaser(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit',
              color: '#333', outline: 'none',
              border: `1.5px solid ${selectedPurchaser ? '#0f4c35' : '#e0e0e0'}`,
              background: selectedPurchaser ? '#f4fdf7' : '#fff',
            }}
          >
            <option value="">— select purchaser —</option>
            {purchasers.map(p => <option key={p.id} value={p.id}>{p.name}{p.role ? ` (${p.role})` : ''}</option>)}
          </select>
          {!selectedPurchaser && (
            <span style={{ fontSize: 11, color: '#c2670a' }}>Required before printing</span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #e0e0e0',
              background: '#fff', color: '#666', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Close
            </button>
            <button
              onClick={handlePrint}
              disabled={!selectedPurchaser}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none', fontFamily: 'inherit',
                background: selectedPurchaser ? '#0f4c35' : '#ccc', color: '#fff',
                fontSize: 12, fontWeight: 600,
                cursor: selectedPurchaser ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              🖨 Print List
            </button>
          </div>
        </div>

        {/* Table */}
        {orderItems.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#ccc', fontSize: 13 }}>
            No items to order — set Required amounts so "to order" &gt; 0
          </div>
        ) : (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: COL_M,
              padding: '8px 24px', gap: 10, background: '#fafaf8', borderBottom: '1px solid #f0f0f0',
            }}>
              {['', 'Vendor', 'Product', 'To order', 'Package', 'SKU'].map((h, i) => (
                <div key={i} style={{
                  fontSize: 10, fontWeight: 700, color: '#aaa',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  textAlign: i === 3 ? 'right' : 'left',
                }}>{h}</div>
              ))}
            </div>

            {vendorGroups.map(group => {
              const sub = group.items.reduce((s, r) => s + r.to_order, 0)
              return (
                <div key={group.vendorId ?? 'none'}>
                  {group.items.map((row, i) => (
                    <div key={row.product_id} style={{
                      display: 'grid', gridTemplateColumns: COL_M,
                      padding: '9px 24px', gap: 10, alignItems: 'center',
                      background: i % 2 === 0 ? '#fff' : '#fafaf8',
                      borderBottom: '1px solid #f5f5f5',
                    }}>
                      <input
                        type="checkbox"
                        checked={!!checked[row.product_id]}
                        onChange={e => setChecked(c => ({ ...c, [row.product_id]: e.target.checked }))}
                        style={{ width: 16, height: 16, accentColor: '#0f4c35', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 12, color: '#555' }}>{row.vendor_name ?? '—'}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{row.name}</span>
                      <span style={{ textAlign: 'right' }}>
                        <span style={{
                          fontSize: 13, fontWeight: 700, color: '#c2670a',
                          background: '#fff8f0', padding: '2px 8px', borderRadius: 5,
                          border: '1px solid #fde68a',
                        }}>
                          {row.to_order.toFixed(1)}
                        </span>
                      </span>
                      <span style={{ fontSize: 11, color: '#666' }}>{pkgDisplay(row) || '—'}</span>
                      <span style={{ fontSize: 11, color: '#999', fontFamily: 'monospace' }}>{row.sku || '—'}</span>
                    </div>
                  ))}
                  {/* Vendor subtotal */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: COL_M,
                    padding: '6px 24px', gap: 10, alignItems: 'center',
                    background: '#f0f9f4', borderBottom: '2px solid #d1e8da',
                  }}>
                    <div />
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0a3320', gridColumn: '2/4' }}>
                      Subtotal: {group.vendor}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0f4c35' }}>
                      {sub.toFixed(1)} lbs
                    </div>
                    <div /><div />
                  </div>
                </div>
              )
            })}

            {/* Grand total */}
            <div style={{
              padding: '14px 24px', display: 'flex', justifyContent: 'flex-end', gap: 16,
              alignItems: 'center', borderTop: '2px solid #0f4c35',
              background: '#f4fdf7', borderRadius: '0 0 16px 16px',
            }}>
              <span style={{ fontSize: 13, color: '#555' }}>Grand total:</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#0a3320' }}>
                {grandTotal.toFixed(1)} lbs
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const [rows, setRows]             = useState<ProductRow[]>([])
  const [centerId, setCenterId]     = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [invMode, setInvMode]       = useState(false)
  const [fVendor, setFVendor]       = useState('')
  const [vendors, setVendors]       = useState<{ id: string; name: string }[]>([])
  const [purchasers, setPurchasers] = useState<PurchaserInfo[]>([])
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [calcOpen, setCalcOpen]       = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [calcedWeek, setCalcedWeek]   = useState<number | null>(null)

  const [onHandDraft, setOnHandDraft] = useState<Record<string, string>>({})
  const [required, setRequired]       = useState<Record<string, string>>({})
  const [cellState, setCellState]     = useState<Record<string, CellState>>({})
  const [tooltip, setTooltip]         = useState<string | null>(null)
  const tooltipRef                    = useRef<HTMLDivElement | null>(null)
  const calcRef                       = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!calcOpen) return
    function onClickOutside(e: MouseEvent) {
      if (calcRef.current && !calcRef.current.contains(e.target as Node)) setCalcOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [calcOpen])

  useEffect(() => {
    ;(async () => {
      const { data: center } = await supabase
        .schema('menumaker').from('centers')
        .select('id').eq('slug', 'pearl').single()
      if (center) setCenterId(center.id)
    })()
  }, [])

  useEffect(() => {
    if (!centerId) return
    ;(async () => {
      setLoading(true)
      const [{ data: products }, { data: inventory }, { data: vend }] = await Promise.all([
        supabase.schema('menumaker').from('products')
          .select('id, name, vendor_id, purchase_frequency, sku, package_label, package_size, package_unit, vendors:vendor_id(name), components:component_id(label)')
          .eq('is_active', true)
          .order('name'),
        supabase.schema('menumaker').from('inventory')
          .select('product_id, quantity_g, updated_at')
          .eq('center_id', centerId),
        supabase.schema('menumaker').from('vendors').select('id, name').order('name'),
      ])

      const { data: purchasersData } = await supabase
        .schema('menumaker')
        .from('purchasers')
        .select('id, name, role')
        .order('name')
      console.log('modal purchasers:', purchasersData)
      const fallback = [
        { id: 'f350b2-dad0-4ae0-9a13-74923b0ddcd5', name: 'Philippe', role: 'Purchasing Staff' },
        { id: '55d2f9-f00c-4eac-aef4-0bcba9b147af', name: 'Larysa',   role: 'Purchasing Staff' },
        { id: '03d4df-4d70-4140-abe2-370d6bf2f9a5', name: 'Tatiana',  role: 'Purchasing Staff' },
        { id: '36d93d-3eaa-4368-bd6c-c9009672c86b', name: 'Ross',     role: 'Purchasing Staff' },
      ]
      setPurchasers(purchasersData?.length ? purchasersData : fallback)

      const invMap: Record<string, { quantity_g: number; updated_at: string | null }> = {}
      ;(inventory || []).forEach((i: any) => {
        invMap[i.product_id] = { quantity_g: i.quantity_g, updated_at: i.updated_at }
      })

      const mapped: ProductRow[] = (products || []).map((p: any) => ({
        product_id:         p.id,
        name:               p.name,
        vendor_id:          p.vendor_id,
        vendor_name:        p.vendors?.name ?? null,
        component_label:    p.components?.label ?? null,
        purchase_frequency: p.purchase_frequency,
        sku:                p.sku ?? null,
        package_label:      p.package_label ?? null,
        package_size:       p.package_size ?? null,
        package_unit:       p.package_unit ?? null,
        quantity_g:         invMap[p.id]?.quantity_g ?? 0,
        inv_updated_at:     invMap[p.id]?.updated_at ?? null,
      }))

      setRows(mapped)
      setVendors(vend || [])

      const draft: Record<string, string> = {}
      mapped.forEach(r => { draft[r.product_id] = fmtLbs(r.quantity_g) })
      setOnHandDraft(draft)

      setLoading(false)
    })()
  }, [centerId])

  const visible = rows.filter(r => !fVendor || r.vendor_id === fVendor)

  const grouped: { vendor: string; vendorId: string | null; items: ProductRow[] }[] = []
  const seen = new Set<string>()
  visible.forEach(r => {
    const key = r.vendor_id ?? '__none__'
    if (!seen.has(key)) {
      seen.add(key)
      grouped.push({ vendor: r.vendor_name ?? 'No vendor', vendorId: r.vendor_id, items: [] })
    }
    grouped.find(g => (g.vendorId ?? '__none__') === key)!.items.push(r)
  })

  function toOrderLbs(pid: string): number {
    const req = parseFloat(required[pid] || '0') || 0
    const onH = parseFloat(onHandDraft[pid] || '0') || 0
    return Math.max(0, req - onH)
  }

  async function saveOnHand(pid: string) {
    if (!centerId) return
    const g = lbsToG(parseFloat(onHandDraft[pid] ?? '') || 0)
    setCellState(s => ({ ...s, [pid]: 'saving' }))
    const { error } = await supabase.schema('menumaker').from('inventory').upsert({
      center_id:  centerId,
      product_id: pid,
      quantity_g: g,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'center_id,product_id' })

    if (error) {
      setCellState(s => ({ ...s, [pid]: 'error' }))
    } else {
      setRows(prev => prev.map(r => r.product_id === pid
        ? { ...r, quantity_g: g, inv_updated_at: new Date().toISOString() } : r))
      setCellState(s => ({ ...s, [pid]: 'saved' }))
      setTimeout(() => setCellState(s => ({ ...s, [pid]: 'idle' })), 1500)
    }
  }

  async function calculateFromMenu(weekNum: number) {
    setCalculating(true)
    setCalcOpen(false)

    // Get supper meal_type_id
    const { data: mealTypes } = await supabase.schema('menumaker')
      .from('meal_types').select('id, name')
    const supperTypeId = (mealTypes || []).find(
      (m: any) => m.name.toLowerCase().includes('supper')
    )?.id

    // Load menu items for the chosen week — both recipe and direct-product paths
    const { data: menuItems } = await supabase.schema('menumaker')
      .from('menu_items')
      .select(`
        id, meal_type_id, week_number,
        recipe:recipe_id (
          id, name,
          recipe_ingredients (
            quantity, unit,
            product:product_id (
              id, name, sku, package_label, package_size, package_unit,
              vendor:vendor_id ( id, name, purchase_type )
            )
          )
        ),
        direct_product:product_id (
          id, name, sku, package_label, package_size, package_unit,
          vendor:vendor_id ( id, name, purchase_type )
        )
      `)
      .eq('week_number', weekNum)

    // Aggregate product totals in grams
    const totals: Record<string, number> = {}

    for (const item of (menuItems || []) as any[]) {
      const isSupper = supperTypeId && item.meal_type_id === supperTypeId
      const servings = isSupper ? 208 : 145

      if (item.direct_product?.id) {
        // Path A: direct product — 100g per serving
        const pid = item.direct_product.id
        totals[pid] = (totals[pid] || 0) + 100 * servings
      } else if (item.recipe?.recipe_ingredients) {
        // Path B: recipe — quantity (g) × servings
        for (const ing of item.recipe.recipe_ingredients as any[]) {
          const pid = ing.product?.id
          if (!pid) continue
          totals[pid] = (totals[pid] || 0) + toGrams(ing.quantity || 0, ing.unit) * servings
        }
      }
    }

    // Convert to lbs and populate required
    setRequired(prev => {
      const next = { ...prev }
      for (const [pid, totalG] of Object.entries(totals)) {
        const lbs = totalG / 453.592
        next[pid] = (Math.round(lbs * 10) / 10).toString()
      }
      return next
    })

    setCalcedWeek(weekNum)
    setCalculating(false)
  }

  const COL = invMode
    ? '1fr 110px 160px 110px 130px 130px 110px'
    : '1fr 110px 160px 110px 130px 130px'

  if (loading) return (
    <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#aaa' }}>Loading…</div>
  )

  return (
    <div style={{ padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 }}>
            Purchase Manager
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>Pearl Center · {rows.length} active products</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={fVendor} onChange={e => setFVendor(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0',
              fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#555', outline: 'none',
            }}
          >
            <option value="">All vendors</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>

          <button
            onClick={() => setInvMode(m => !m)}
            style={{
              padding: '7px 16px', borderRadius: 9, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              background: invMode ? '#0f4c35' : '#fff', color: invMode ? '#fff' : '#555',
              border: `1.5px solid ${invMode ? '#0f4c35' : '#d0d0d0'}`,
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
            } as React.CSSProperties}
          >
            <span style={{ fontSize: 14 }}>📦</span>
            {invMode ? 'Inventory ON' : 'Inventory Mode'}
          </button>

          {/* From Menu calculator */}
          <div ref={calcRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setCalcOpen(o => !o)}
              disabled={calculating}
              style={{
                padding: '7px 14px', borderRadius: 9, border: `1.5px solid ${calcedWeek ? '#0f4c35' : '#d0d0d0'}`,
                cursor: calculating ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                background: calcedWeek ? '#f4fdf7' : '#fff', color: calcedWeek ? '#0f4c35' : '#555',
                display: 'flex', alignItems: 'center', gap: 6,
              } as React.CSSProperties}
            >
              <span style={{ fontSize: 13 }}>📊</span>
              {calculating ? 'Calculating…' : calcedWeek ? `Week ${calcedWeek} ✓` : 'From Menu'}
            </button>

            {calcOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: '#fff', borderRadius: 10, border: '1px solid #e0e0e0',
                boxShadow: '0 8px 28px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 180, overflow: 'hidden',
              }}>
                <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Populate Required from menu:
                </div>
                {[1, 2, 3, 4].map(w => (
                  <button key={w} onClick={() => calculateFromMenu(w)} style={{
                    display: 'block', width: '100%', padding: '9px 14px', border: 'none',
                    background: calcedWeek === w ? '#f4fdf7' : '#fff', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: calcedWeek === w ? 600 : 400,
                    color: calcedWeek === w ? '#0f4c35' : '#333', textAlign: 'left',
                    borderBottom: w < 4 ? '1px solid #f5f5f5' : 'none',
                  }}>
                    Week {w} {calcedWeek === w ? '✓' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowOrderModal(true)}
            style={{
              padding: '7px 16px', borderRadius: 9, border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              background: '#0f4c35', color: '#fff',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>🛒</span>
            Purchase Order
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: COL,
          padding: '8px 18px', gap: 10, background: '#0f4c35',
        }}>
          {[
            'Product', 'Component', 'Vendor', 'Frequency',
            'Required (lbs)',
            ...(invMode ? ['On hand (lbs)', 'To order (lbs)'] : ['To order (lbs)']),
          ].map((h, i) => (
            <div key={i} style={{
              fontSize: 10, fontWeight: 700, color: '#a8d5b5',
              textTransform: 'uppercase', letterSpacing: '0.07em',
              textAlign: i >= 4 ? 'right' : 'left',
            }}>{h}</div>
          ))}
        </div>

        {grouped.map(group => (
          <div key={group.vendorId ?? 'none'}>
            <div style={{
              padding: '6px 18px', background: '#fafaf8',
              borderBottom: '1px solid #f0f0f0', borderTop: '1px solid #f0f0f0',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0a3320' }}>{group.vendor}</span>
              <span style={{ fontSize: 10, color: '#bbb' }}>{group.items.length} items</span>
            </div>

            {group.items.map((row, i) => {
              const pid     = row.product_id
              const cs      = cellState[pid] ?? 'idle'
              const toOrder = toOrderLbs(pid)
              const ts      = fmtTs(row.inv_updated_at)

              return (
                <div key={pid} style={{
                  display: 'grid', gridTemplateColumns: COL,
                  padding: '9px 18px', gap: 10, alignItems: 'center',
                  background: i % 2 === 0 ? '#fff' : '#fafaf8',
                  borderBottom: '1px solid #f5f5f5',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{row.name}</span>
                  <span style={{ fontSize: 11, color: '#888' }}>
                    {row.component_label || <span style={{ color: '#ddd' }}>—</span>}
                  </span>
                  <span style={{ fontSize: 11, color: '#666' }}>
                    {row.vendor_name || <span style={{ color: '#ddd' }}>—</span>}
                  </span>
                  <span style={{ fontSize: 11, color: '#888', textTransform: 'capitalize' }}>
                    {row.purchase_frequency || <span style={{ color: '#ddd' }}>—</span>}
                  </span>

                  {/* Required */}
                  <div style={{ textAlign: 'right' }}>
                    <input
                      type="number" min="0" step="0.1"
                      value={required[pid] ?? ''}
                      onChange={e => setRequired(r => ({ ...r, [pid]: e.target.value }))}
                      placeholder="0"
                      style={{
                        width: 80, padding: '4px 8px', borderRadius: 6,
                        border: '1.5px solid #e0e0e0', fontSize: 12,
                        fontFamily: 'inherit', textAlign: 'right', outline: 'none',
                        background: '#fafaf8', color: '#333',
                      }}
                    />
                  </div>

                  {/* On hand */}
                  {invMode && (
                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                      <div
                        style={{ position: 'relative' }}
                        onMouseEnter={ts ? () => setTooltip(ts + '||' + pid) : undefined}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <input
                          type="number" min="0" step="0.1"
                          value={onHandDraft[pid] ?? ''}
                          onChange={e => {
                            setOnHandDraft(d => ({ ...d, [pid]: e.target.value }))
                            if (cellState[pid] === 'error') setCellState(s => ({ ...s, [pid]: 'idle' }))
                          }}
                          onBlur={() => saveOnHand(pid)}
                          placeholder="0"
                          style={{
                            width: 80, padding: '4px 8px', borderRadius: 6, fontSize: 12,
                            fontFamily: 'inherit', textAlign: 'right', outline: 'none',
                            border:     cs === 'error' ? '1.5px solid #c0392b' : cs === 'saving' ? '1.5px solid #f59e0b' : '1.5px solid #c0e0c0',
                            background: cs === 'error' ? '#fff5f5' : '#f4fdf7',
                            color: '#0a3320', transition: 'border-color 0.15s',
                          }}
                        />
                        {tooltip && tooltip.endsWith('||' + pid) && (
                          <div style={{
                            position: 'absolute', bottom: '120%', right: 0,
                            background: '#1a1a1a', color: '#fff', fontSize: 10,
                            padding: '4px 8px', borderRadius: 5, whiteSpace: 'nowrap',
                            pointerEvents: 'none', zIndex: 50,
                          }}>
                            {tooltip.split('||')[0]}
                          </div>
                        )}
                      </div>
                      {cs === 'saving' && <span style={{ fontSize: 11, color: '#f59e0b' }}>…</span>}
                      {cs === 'saved'  && <span style={{ fontSize: 13, color: '#0f4c35', fontWeight: 700 }}>✓</span>}
                      {cs === 'error'  && <span style={{ fontSize: 10, color: '#c0392b' }}>✗</span>}
                    </div>
                  )}

                  {/* To order */}
                  <div style={{ textAlign: 'right' }}>
                    {toOrder > 0 ? (
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: '#c2670a',
                        background: '#fff8f0', padding: '2px 8px', borderRadius: 5,
                        border: '1px solid #fde68a',
                      }}>
                        {(Math.round(toOrder * 100) / 100).toFixed(1)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#bbb' }}>—</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {visible.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#ccc', fontSize: 13 }}>No active products</div>
        )}
      </div>

      {invMode && (
        <div style={{ marginTop: 14, display: 'flex', gap: 16, fontSize: 11, color: '#888' }}>
          <span>📦 Inventory Mode: edits auto-save on blur</span>
          <span style={{ color: '#0f4c35', fontWeight: 600 }}>✓</span><span>Saved</span>
          <span style={{ color: '#c0392b' }}>✗</span><span>Error — retry by editing the cell again</span>
          <span style={{ marginLeft: 8 }}>Hover on-hand cell to see last update time</span>
        </div>
      )}

      {showOrderModal && (
        <PurchaseOrderModal
          rows={rows}
          required={required}
          onHandDraft={onHandDraft}
          purchasers={purchasers}
          onClose={() => setShowOrderModal(false)}
        />
      )}
    </div>
  )
}
