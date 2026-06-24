import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Purchaser {
  id: string
  name: string
  role: string | null
}

interface Product {
  id: string
  name: string
  vendor_id: string | null
  vendor_name: string | null
  purchase_frequency: string | null
  sku: string | null
  package_label: string | null
  package_size: number | null
  package_unit: string | null
}

interface ScanResult {
  name: string
  sku: string | null
  package_size: number | null
  package_unit: string | null
  package_label: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeekStart(): string {
  const d = new Date()
  const diff = (d.getDay() + 6) % 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - diff)
  monday.setHours(0, 0, 0, 0)
  return format(monday, 'yyyy-MM-dd')
}

function pkgStr(p: Product): string {
  if (p.package_label) return p.package_label
  if (p.package_size != null) return `${p.package_size} ${p.package_unit || ''}`.trim()
  return ''
}

const PACKAGE_UNITS = ['lb', 'oz', 'kg', 'g', 'each', 'case', 'bag', 'box', 'flat']

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PurchaserApp() {
  const [view, setView]               = useState<'select' | 'list'>('select')
  const [purchasers, setPurchasers]   = useState<Purchaser[]>([])
  const [purchaserId, setPurchaserId] = useState('')
  const [products, setProducts]       = useState<Product[]>([])
  const [checked, setChecked]         = useState<Record<string, boolean>>({})
  const [loadingList, setLoadingList] = useState(false)

  // Scan state
  const [scanState, setScanState] = useState<'idle' | 'reading' | 'analyzing' | 'done' | 'error'>('idle')
  const [editScan, setEditScan]   = useState<ScanResult | null>(null)
  const [scanSaving, setScanSaving] = useState(false)
  const [scanMsg, setScanMsg]     = useState<'saved' | 'error' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const weekStart = getWeekStart()
  const purchaserName = purchasers.find(p => p.id === purchaserId)?.name || ''

  // Load purchasers
  useEffect(() => {
    supabase.schema('menumaker').from('purchasers')
      .select('id, name, role').eq('is_active', true).order('name')
      .then(({ data }) => setPurchasers(data || []))
  }, [])

  // Load products + checklist when entering list view
  useEffect(() => {
    if (!purchaserId || view !== 'list') return
    setLoadingList(true)
    ;(async () => {
      try {
      const [{ data: prods }, { data: checklist }] = await Promise.all([
        supabase.schema('menumaker').from('products')
          .select('id, name, vendor_id, purchase_frequency, sku, package_label, package_size, package_unit, vendors:vendor_id(name)')
          .eq('is_active', true)
          .not('purchase_frequency', 'is', null)
          .order('name'),
        supabase.schema('menumaker').from('purchase_checklist')
          .select('product_id, checked')
          .eq('purchaser_id', purchaserId)
          .eq('week_start', weekStart),
      ])

      const checkMap: Record<string, boolean> = {}
      ;(checklist || []).forEach((c: any) => { checkMap[c.product_id] = !!c.checked })

      setProducts((prods || []).map((p: any) => ({
        id:                 p.id,
        name:               p.name,
        vendor_id:          p.vendor_id,
        vendor_name:        p.vendors?.name ?? null,
        purchase_frequency: p.purchase_frequency,
        sku:                p.sku ?? null,
        package_label:      p.package_label ?? null,
        package_size:       p.package_size ?? null,
        package_unit:       p.package_unit ?? null,
      })))
      setChecked(checkMap)
      } catch (err) {
        console.error('[PurchaserApp] failed to load purchase list (step 2 transition):', err)
        setProducts([])
        setChecked({})
      } finally {
        setLoadingList(false)
      }
    })()
  }, [purchaserId, view, weekStart])

  async function toggleItem(productId: string, val: boolean) {
    setChecked(c => ({ ...c, [productId]: val }))
    await supabase.schema('menumaker').from('purchase_checklist').upsert({
      purchaser_id: purchaserId,
      product_id:   productId,
      week_start:   weekStart,
      checked:      val,
      checked_at:   val ? new Date().toISOString() : null,
    }, { onConflict: 'purchaser_id,product_id,week_start' })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setScanState('reading')
    setEditScan(null)
    setScanMsg(null)

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

      setScanState('analyzing')
      try {
        const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
        if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY not set')

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key':                              apiKey,
            'anthropic-version':                      '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'content-type':                           'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 512,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
                {
                  type: 'text',
                  text: 'Extract product information from this label. Return ONLY valid JSON with these exact fields: name (string, required), sku (string or null), package_size (number or null), package_unit (one of: lb oz kg g each case bag box flat — or null), package_label (string or null, e.g. "5 lb bag"). No markdown, no explanation — just the JSON object.',
                },
              ],
            }],
          }),
        })

        if (!resp.ok) throw new Error(`API ${resp.status}`)
        const data = await resp.json()
        const text = (data.content?.[0]?.text || '').trim()
        const parsed: ScanResult = JSON.parse(text)
        setEditScan(parsed)
        setScanState('done')
      } catch (err) {
        console.error('Vision error:', err)
        setScanState('error')
      }
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsDataURL(file)
  }

  async function saveScanResult() {
    if (!editScan?.name?.trim()) return
    setScanSaving(true); setScanMsg(null)
    const { error } = await supabase.schema('menumaker').from('products').upsert({
      name:           editScan.name.trim(),
      sku:            editScan.sku           || null,
      package_size:   editScan.package_size  ?? null,
      package_unit:   editScan.package_unit  || null,
      package_label:  editScan.package_label || null,
      is_active:      true,
      is_whole_grain: false,
    }, { onConflict: 'name' })
    if (error) {
      setScanMsg('error')
    } else {
      setScanMsg('saved')
      setTimeout(() => { setScanState('idle'); setEditScan(null); setScanMsg(null) }, 1500)
    }
    setScanSaving(false)
  }

  // Group products by vendor
  const vendorGroups: { vendor: string; vendorId: string | null; items: Product[] }[] = []
  const seenV = new Set<string>()
  products.forEach(p => {
    const key = p.vendor_id ?? '__none__'
    if (!seenV.has(key)) {
      seenV.add(key)
      vendorGroups.push({ vendor: p.vendor_name ?? 'No vendor', vendorId: p.vendor_id, items: [] })
    }
    vendorGroups.find(g => (g.vendorId ?? '__none__') === key)!.items.push(p)
  })

  const totalItems = products.length
  const doneItems  = Object.values(checked).filter(Boolean).length

  // ── Select screen ─────────────────────────────────────────────────────────────
  if (view === 'select') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0f4c35', fontFamily: "'DM Sans', sans-serif", padding: 20,
      }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
        <div style={{
          background: '#fff', borderRadius: 20, padding: '36px 28px',
          maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: '#0a3320' }}>
              Purchase List
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              Pearl Center · Week of {format(new Date(weekStart + 'T12:00:00'), 'MMM d, yyyy')}
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 10 }}>
            Who are you?
          </div>
          {purchasers.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#ccc', fontSize: 13, padding: 20 }}>Loading…</div>
          ) : (
            purchasers.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  try {
                    if (!p?.id) { console.error('[PurchaserApp] selected purchaser has no id', p); return }
                    setPurchaserId(p.id)
                    setView('list')
                  } catch (err) {
                    console.error('[PurchaserApp] failed to select purchaser:', err)
                  }
                }}
                style={{
                  display: 'block', width: '100%', padding: '14px 16px', marginBottom: 10,
                  borderRadius: 12, border: '1.5px solid #e0e0e0', background: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#0f4c35'
                  ;(e.currentTarget as HTMLButtonElement).style.background = '#f4fdf7'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#e0e0e0'
                  ;(e.currentTarget as HTMLButtonElement).style.background = '#fff'
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0a3320' }}>{p.name}</div>
                {p.role && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{p.role}</div>}
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  // ── List screen ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f4', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      {/* Sticky header */}
      <div style={{ background: '#0f4c35', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: '#fff' }}>
                Purchase List
              </div>
              <div style={{ fontSize: 11, color: '#7ee8b0', marginTop: 2 }}>
                {purchaserName} · {format(new Date(weekStart + 'T12:00:00'), 'MMM d')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                  {doneItems}/{totalItems}
                </div>
                <div style={{ fontSize: 9, color: '#7ee8b0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>done</div>
              </div>
              <button
                onClick={() => { setView('select'); setPurchaserId(''); setProducts([]) }}
                style={{
                  padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 12,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                ← Back
              </button>
            </div>
          </div>
          {/* Progress bar */}
          <div style={{ marginTop: 10, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: '#7ee8b0', borderRadius: 2,
              width: `${totalItems > 0 ? (doneItems / totalItems) * 100 : 0}%`,
              transition: 'width 0.3s',
            }}/>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 40px' }}>

        {/* Camera scan card */}
        <div style={{
          background: '#fff', borderRadius: 14, border: '1.5px solid #e0e0e0',
          padding: '14px 16px', marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0a3320' }}>📷 Scan Product Label</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                Photograph a label — AI extracts and saves product info
              </div>
            </div>
            <label style={{
              padding: '9px 16px', borderRadius: 10,
              background: scanState === 'analyzing' ? '#888' : '#0f4c35',
              color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: scanState === 'analyzing' ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              userSelect: 'none',
            } as React.CSSProperties}>
              {scanState === 'analyzing' ? '🔍 Analyzing…' : '📷 Scan'}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                disabled={scanState === 'analyzing'}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          {scanState === 'reading'   && <div style={{ marginTop: 10, fontSize: 12, color: '#888' }}>Reading image…</div>}
          {scanState === 'error'     && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#c0392b' }}>
              ✗ Could not analyze image — try again or check VITE_ANTHROPIC_API_KEY
            </div>
          )}

          {/* Confirm card */}
          {scanState === 'done' && editScan && (
            <div style={{ marginTop: 14, padding: 14, background: '#f4fdf7', borderRadius: 10, border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f4c35', marginBottom: 10 }}>
                ✓ Detected — review and save
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Product name *</span>
                  <input
                    value={editScan.name}
                    onChange={e => setEditScan(s => s ? { ...s, name: e.target.value } : s)}
                    style={{ padding: '9px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pkg size</span>
                    <input
                      type="number" min="0" step="0.1"
                      value={editScan.package_size ?? ''}
                      onChange={e => setEditScan(s => s ? { ...s, package_size: e.target.value === '' ? null : Number(e.target.value) } : s)}
                      style={{ padding: '9px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Unit</span>
                    <select
                      value={editScan.package_unit || ''}
                      onChange={e => setEditScan(s => s ? { ...s, package_unit: e.target.value || null } : s)}
                      style={{ padding: '9px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                    >
                      <option value="">—</option>
                      {PACKAGE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Package label</span>
                  <input
                    value={editScan.package_label || ''}
                    onChange={e => setEditScan(s => s ? { ...s, package_label: e.target.value } : s)}
                    placeholder="e.g. 5 lb bag"
                    style={{ padding: '9px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>SKU</span>
                  <input
                    value={editScan.sku || ''}
                    onChange={e => setEditScan(s => s ? { ...s, sku: e.target.value } : s)}
                    placeholder="Item code"
                    style={{ padding: '9px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 13, fontFamily: 'monospace', outline: 'none' }}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <button
                  onClick={saveScanResult}
                  disabled={scanSaving || !editScan.name?.trim()}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 10, border: 'none',
                    background: (scanSaving || !editScan.name?.trim()) ? '#ccc' : '#0f4c35',
                    color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: (scanSaving || !editScan.name?.trim()) ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {scanSaving ? 'Saving…' : '💾 Save to Products'}
                </button>
                <button
                  onClick={() => { setScanState('idle'); setEditScan(null); setScanMsg(null) }}
                  style={{
                    padding: '11px 14px', borderRadius: 10, border: '1px solid #ddd',
                    background: '#fff', color: '#888', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  ✕
                </button>
              </div>
              {scanMsg === 'saved' && <div style={{ marginTop: 8, fontSize: 12, color: '#0f4c35', fontWeight: 600 }}>✓ Saved!</div>}
              {scanMsg === 'error' && <div style={{ marginTop: 8, fontSize: 12, color: '#c0392b' }}>✗ Save failed</div>}
            </div>
          )}
        </div>

        {/* Loading */}
        {loadingList && (
          <div style={{ textAlign: 'center', padding: 48, color: '#aaa', fontSize: 13 }}>Loading list…</div>
        )}

        {/* Product groups */}
        {!loadingList && vendorGroups.map(group => (
          <div key={group.vendorId ?? 'none'} style={{ marginBottom: 14 }}>
            <div style={{
              padding: '9px 14px', background: '#0a3320', borderRadius: '10px 10px 0 0',
              fontSize: 12, fontWeight: 700, color: '#7ee8b0', letterSpacing: '0.04em',
            }}>
              {group.vendor}
              <span style={{ fontWeight: 400, color: '#3d7a5e', marginLeft: 8, fontSize: 10 }}>
                {group.items.filter(p => checked[p.id]).length}/{group.items.length}
              </span>
            </div>
            <div style={{
              background: '#fff', borderRadius: '0 0 10px 10px',
              border: '1px solid #e0e0e0', borderTop: 'none', overflow: 'hidden',
            }}>
              {group.items.map((p, i) => {
                const isDone = !!checked[p.id]
                const pkg    = pkgStr(p)
                return (
                  <div
                    key={p.id}
                    onClick={() => toggleItem(p.id, !isDone)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '13px 16px', cursor: 'pointer',
                      borderBottom: i < group.items.length - 1 ? '1px solid #f0f0f0' : 'none',
                      background: isDone ? '#f4fdf7' : '#fff',
                      transition: 'background 0.1s',
                    }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                      border: `2px solid ${isDone ? '#0f4c35' : '#d0d0d0'}`,
                      background: isDone ? '#0f4c35' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: '#fff', fontWeight: 700,
                      transition: 'all 0.15s',
                    }}>
                      {isDone && '✓'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 500, lineHeight: 1.2,
                        color: isDone ? '#888' : '#1a1a1a',
                        textDecoration: isDone ? 'line-through' : 'none',
                      }}>
                        {p.name}
                      </div>
                      {(pkg || p.sku) && (
                        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                          {pkg}{pkg && p.sku ? ' · ' : ''}{p.sku ? `SKU: ${p.sku}` : ''}
                        </div>
                      )}
                    </div>
                    {p.purchase_frequency && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        background: '#f0f0f0', color: '#888',
                        textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
                      }}>
                        {p.purchase_frequency}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {!loadingList && products.length === 0 && (
          <div style={{
            background: '#fff', borderRadius: 14, padding: 36, textAlign: 'center',
            color: '#ccc', fontSize: 13, border: '1px solid #e8e8e8',
          }}>
            No products with purchase frequency set
          </div>
        )}
      </div>
    </div>
  )
}
