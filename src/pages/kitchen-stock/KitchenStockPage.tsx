import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const KITCHEN_ID = 'ec46ac9f-f2e3-42e7-922c-0de8a87a1a14'
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY

type Tab = 'receive' | 'issue' | 'stock'

type Product = {
  id: string
  name: string
  vendor_name: string | null
  package_label: string | null
  package_size: number | null
  package_unit: string | null
  unit_cost: number | null
  on_hand: number
}

type Movement = {
  id: string
  product_id: string
  product_name: string
  movement_type: 'in' | 'out' | 'adjust'
  packages: number
  unit_cost: number | null
  notes: string | null
  created_by: string | null
  created_at: string
}

type ReceiptLine = {
  name: string
  package_label: string
  qty: number
  unit_cost: number
  matched_id: string | null
  confirmed: boolean
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const S = {
  page:     { padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' } as React.CSSProperties,
  title:    { fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 } as React.CSSProperties,
  sub:      { fontSize: 12, color: '#888', marginBottom: 20 } as React.CSSProperties,
  tabs:     { display: 'flex', gap: 4, background: '#fff', padding: 5, borderRadius: 10, border: '1px solid #e0e0e0', width: 'fit-content', marginBottom: 24 } as React.CSSProperties,
  tabBtn:   (a: boolean): React.CSSProperties => ({ padding: '8px 20px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', background: a ? '#0a3320' : 'transparent', color: a ? '#fff' : '#555', transition: 'all 0.15s' }),
  card:     { background: '#fff', borderRadius: 12, border: '1px solid #e8ece8', padding: '20px 24px', marginBottom: 16 } as React.CSSProperties,
  btn:      (color = '#0a3320'): React.CSSProperties => ({ padding: '10px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', background: color, color: '#fff', transition: 'all 0.15s' }),
  table:    { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th:       { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '1px solid #e8ece8', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  td:       { padding: '10px 12px', borderBottom: '1px solid #f0f2f0', verticalAlign: 'middle' as const },
}

// ─── RECEIVE TAB ──────────────────────────────────────────────────────────────
function ReceiveTab({ products, onDone }: { products: Product[], onDone: () => void }) {
  const [files, setFiles]         = useState<File[]>([])
  const [lines, setLines]         = useState<ReceiptLine[]>([])
  const [scanning, setScanning]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [savedBy, setSavedBy]     = useState('')
  const [done, setDone]           = useState(false)
  const [error, setError]         = useState('')

  async function scanReceipt() {
    if (!files.length) return
    setScanning(true); setError('')
    try {
      const toBase64 = (f: File) => new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res((r.result as string).split(',')[1])
        r.onerror = rej
        r.readAsDataURL(f)
      })
      const images = await Promise.all(files.map(async f => ({
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: f.type as 'image/jpeg', data: await toBase64(f) }
      })))

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-opus-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: [
            ...images,
            { type: 'text', text: `Extract all purchased food/supply items from this receipt. Return ONLY valid JSON array, no markdown:
[{"name":"product name","package_label":"size/description like 5lb bag or 40.7oz","qty":1,"unit_cost":0.00}]
- name: short product name
- package_label: exact size from receipt (e.g. "5 lbs", "40.7 oz", "1000 ct", "3 pk")
- qty: quantity purchased (integer)
- unit_cost: price per unit (total/qty), 2 decimal places
Include all line items. Skip subtotals, taxes, fees.` }
          ]}]
        })
      })
      const data = await resp.json()
      const text = data.content?.[0]?.text || ''
      const parsed: ReceiptLine[] = JSON.parse(text).map((item: any) => ({
        ...item,
        matched_id: products.find(p =>
          p.name.toLowerCase().includes(item.name.toLowerCase().split(' ')[0]) ||
          item.name.toLowerCase().includes(p.name.toLowerCase().split(' ')[0])
        )?.id ?? null,
        confirmed: true,
      }))
      setLines(parsed)
    } catch (e: any) {
      setError('Could not parse receipt: ' + e.message)
    }
    setScanning(false)
  }

  async function saveReceipt() {
    if (!lines.filter(l => l.confirmed).length) return
    setSaving(true)
    const movements = lines.filter(l => l.confirmed && l.matched_id).map(l => ({
      product_id:    l.matched_id,
      movement_type: 'in',
      packages:      l.qty,
      unit_cost:     l.unit_cost,
      notes:         l.package_label,
      created_by:    savedBy || 'Kitchen',
      created_at:    new Date().toISOString(),
    }))

    for (const l of lines.filter(l => l.confirmed && l.matched_id)) {
      await supabase.schema('menumaker').from('products').update({
        package_label: l.package_label,
        unit_cost: l.unit_cost,
      }).eq('id', l.matched_id!)
    }

    const { error } = await supabase.schema('menumaker').from('stock_movements').insert(movements)
    setSaving(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => { setLines([]); setFiles([]); setDone(false); onDone() }, 2000)
  }

  if (done) return (
    <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#0a3320' }}>Receipt saved!</div>
      <div style={{ fontSize: 13, color: '#888', marginTop: 6 }}>Stock updated</div>
    </div>
  )

  return (
    <div>
      <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0a3320', marginBottom: 16 }}>📷 Photograph Receipt</div>
        <input type="file" accept="image/*,application/pdf" multiple
          onChange={e => setFiles(Array.from(e.target.files || []))}
          style={{ fontSize: 13, marginBottom: 12 }} />
        {files.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {files.map((f, i) => (
              <img key={i} src={URL.createObjectURL(f)} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd' }} />
            ))}
          </div>
        )}
        <button style={S.btn(scanning ? '#aaa' : '#0a3320')} onClick={scanReceipt} disabled={!files.length || scanning}>
          {scanning ? '🔍 Scanning…' : '🔍 Scan Receipt'}
        </button>
        {error && <div style={{ color: '#c00', fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>

      {lines.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0a3320', marginBottom: 16 }}>
            Confirm Items ({lines.filter(l => l.confirmed).length} of {lines.length})
          </div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>✓</th>
                <th style={S.th}>Item</th>
                <th style={S.th}>Size</th>
                <th style={S.th}>Qty</th>
                <th style={S.th}>Unit Cost</th>
                <th style={S.th}>Matched Product</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ background: l.confirmed ? '#fff' : '#fafafa', opacity: l.confirmed ? 1 : 0.5 }}>
                  <td style={S.td}>
                    <input type="checkbox" checked={l.confirmed}
                      onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, confirmed: e.target.checked } : x))} />
                  </td>
                  <td style={S.td}><span style={{ fontWeight: 500 }}>{l.name}</span></td>
                  <td style={S.td}><span style={{ fontSize: 12, color: '#888' }}>{l.package_label}</span></td>
                  <td style={S.td}>{l.qty}</td>
                  <td style={S.td}>${l.unit_cost.toFixed(2)}</td>
                  <td style={S.td}>
                    <select value={l.matched_id || ''} style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid #ddd' }}
                      onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, matched_id: e.target.value || null } : x))}>
                      <option value="">— no match —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
            <input placeholder="Your name" value={savedBy} onChange={e => setSavedBy(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 160 }} />
            <button style={S.btn(saving ? '#aaa' : '#0a3320')} onClick={saveReceipt} disabled={saving}>
              {saving ? 'Saving…' : '✓ Save to Stock'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ISSUE TAB ────────────────────────────────────────────────────────────────
function IssueTab({ products, onDone }: { products: Product[], onDone: () => void }) {
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [issuedBy, setIssuedBy] = useState('')
  const [saving, setSaving]     = useState(false)
  const [done, setDone]         = useState(false)
  const [search, setSearch]     = useState('')

  const visible = products.filter(p =>
    p.on_hand > 0 &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  )

  function tap(id: string) {
    setSelected(s => ({ ...s, [id]: (s[id] || 0) + 1 }))
  }
  function dec(id: string) {
    setSelected(s => {
      const n = (s[id] || 0) - 1
      if (n <= 0) { const { [id]: _, ...rest } = s; return rest }
      return { ...s, [id]: n }
    })
  }

  async function saveIssue() {
    const items = Object.entries(selected).filter(([_, q]) => q > 0)
    if (!items.length) return
    setSaving(true)
    const movements = items.map(([pid, qty]) => ({
      product_id:    pid,
      movement_type: 'out',
      packages:      qty,
      created_by:    issuedBy || 'Kitchen',
      created_at:    new Date().toISOString(),
    }))
    await supabase.schema('menumaker').from('stock_movements').insert(movements)
    setSaving(false)
    setDone(true)
    setTimeout(() => { setSelected({}); setDone(false); onDone() }, 2000)
  }

  if (done) return (
    <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#0a3320' }}>Issued!</div>
    </div>
  )

  const total = Object.keys(selected).length

  return (
    <div>
      {total > 0 && (
        <div style={{ ...S.card, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#166534', marginBottom: 10 }}>
            Selected ({total} products)
          </div>
          {Object.entries(selected).map(([pid, qty]) => {
            const p = products.find(x => x.id === pid)!
            return (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                <button onClick={() => dec(pid)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontSize: 15, fontWeight: 600, minWidth: 24, textAlign: 'center' }}>{qty}</span>
                <button onClick={() => tap(pid)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
            <input placeholder="Your name" value={issuedBy} onChange={e => setIssuedBy(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 140 }} />
            <button style={S.btn(saving ? '#aaa' : '#0a3320')} onClick={saveIssue} disabled={saving}>
              {saving ? 'Saving…' : '✓ Confirm Issue'}
            </button>
          </div>
        </div>
      )}

      <input placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, fontFamily: 'inherit', outline: 'none', width: 280, marginBottom: 16 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        {visible.map(p => {
          const qty = selected[p.id] || 0
          return (
            <button key={p.id} onClick={() => tap(p.id)} style={{
              padding: '16px 12px', borderRadius: 12, border: `2px solid ${qty > 0 ? '#0a3320' : '#e0e0e0'}`,
              background: qty > 0 ? '#f0fdf4' : '#fff', cursor: 'pointer', fontFamily: 'inherit',
              textAlign: 'left', transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{p.package_label || p.vendor_name || '—'}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#aaa' }}>{p.on_hand} on hand</span>
                {qty > 0 && <span style={{ fontSize: 16, fontWeight: 700, color: '#0a3320' }}>{qty}</span>}
              </div>
            </button>
          )
        })}
        {visible.length === 0 && (
          <div style={{ color: '#aaa', fontSize: 13, gridColumn: '1/-1', padding: 20 }}>No products with stock found.</div>
        )}
      </div>
    </div>
  )
}

// ─── STOCK TAB ────────────────────────────────────────────────────────────────
function StockTab({ products, movements }: { products: Product[], movements: Movement[] }) {
  const [search, setSearch] = useState('')
  const visible = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  )
  const totalValue = products.reduce((sum, p) => sum + p.on_hand * (p.unit_cost || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        {[
          { n: products.filter(p => p.on_hand > 0).length, l: 'in stock' },
          { n: products.filter(p => p.on_hand === 0).length, l: 'out of stock' },
          { n: `$${totalValue.toFixed(2)}`, l: 'total value' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e0e0e0', padding: '12px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#0a3320' }}>{s.n}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 240, marginBottom: 12 }} />

      <div style={S.card}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Product</th>
              <th style={S.th}>Size</th>
              <th style={S.th} align="right">On Hand</th>
              <th style={S.th} align="right">Unit Cost</th>
              <th style={S.th} align="right">Value</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(p => (
              <tr key={p.id} style={{ background: p.on_hand === 0 ? '#fafafa' : '#fff' }}>
                <td style={S.td}>
                  <div style={{ fontWeight: 500, color: p.on_hand === 0 ? '#bbb' : '#1a1a1a' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{p.vendor_name}</div>
                </td>
                <td style={S.td}><span style={{ fontSize: 12, color: '#888' }}>{p.package_label || '—'}</span></td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <span style={{ fontWeight: 600, color: p.on_hand === 0 ? '#ccc' : p.on_hand < 3 ? '#c2670a' : '#0a3320' }}>
                    {p.on_hand}
                  </span>
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <span style={{ fontSize: 12, color: '#888' }}>{p.unit_cost ? `$${p.unit_cost.toFixed(2)}` : '—'}</span>
                </td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <span style={{ fontSize: 12, color: '#555' }}>
                    {p.unit_cost && p.on_hand > 0 ? `$${(p.on_hand * p.unit_cost).toFixed(2)}` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f4f6f4' }}>
              <td colSpan={4} style={{ ...S.td, fontWeight: 600, fontSize: 13 }}>TOTAL</td>
              <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#0a3320' }}>
                ${totalValue.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {movements.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 12 }}>Recent Movements</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Product</th>
                <th style={S.th}>Type</th>
                <th style={S.th} align="right">Packages</th>
                <th style={S.th}>By</th>
                <th style={S.th}>When</th>
              </tr>
            </thead>
            <tbody>
              {movements.slice(0, 20).map(m => (
                <tr key={m.id}>
                  <td style={S.td}><span style={{ fontWeight: 500 }}>{m.product_name}</span></td>
                  <td style={S.td}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                      background: m.movement_type === 'in' ? '#dcfce7' : '#fee2e2',
                      color: m.movement_type === 'in' ? '#166534' : '#991b1b' }}>
                      {m.movement_type === 'in' ? '▲ IN' : '▼ OUT'}
                    </span>
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{m.packages}</td>
                  <td style={S.td}><span style={{ fontSize: 12, color: '#888' }}>{m.created_by || '—'}</span></td>
                  <td style={S.td}><span style={{ fontSize: 11, color: '#aaa' }}>{fmtDate(m.created_at)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function KitchenStockPage() {
  const [tab, setTab]             = useState<Tab>('stock')
  const [products, setProducts]   = useState<Product[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: prods }, { data: movs }] = await Promise.all([
      supabase.schema('menumaker').from('products')
        .select('id, name, vendors(name), package_label, package_size, package_unit, unit_cost')
        .eq('is_active', true).order('name'),
      supabase.schema('menumaker').from('stock_movements')
        .select('id, product_id, movement_type, packages, unit_cost, notes, created_by, created_at, products(name)')
        .order('created_at', { ascending: false }).limit(100),
    ])

    const inMap: Record<string, number> = {}
    const outMap: Record<string, number> = {}
    ;(movs || []).forEach((m: any) => {
      if (m.movement_type === 'in')  inMap[m.product_id]  = (inMap[m.product_id]  || 0) + m.packages
      if (m.movement_type === 'out') outMap[m.product_id] = (outMap[m.product_id] || 0) + m.packages
    })

    const mapped: Product[] = (prods || []).map((p: any) => ({
      id:            p.id,
      name:          p.name,
      vendor_name:   p.vendors?.name ?? null,
      package_label: p.package_label ?? null,
      package_size:  p.package_size ?? null,
      package_unit:  p.package_unit ?? null,
      unit_cost:     p.unit_cost ?? null,
      on_hand:       (inMap[p.id] || 0) - (outMap[p.id] || 0),
    }))

    const mappedMovs: Movement[] = (movs || []).map((m: any) => ({
      id:            m.id,
      product_id:    m.product_id,
      product_name:  (m.products as any)?.name ?? '—',
      movement_type: m.movement_type,
      packages:      m.packages,
      unit_cost:     m.unit_cost,
      notes:         m.notes,
      created_by:    m.created_by,
      created_at:    m.created_at,
    }))

    setProducts(mapped)
    setMovements(mappedMovs)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <div style={{ marginBottom: 20 }}>
        <div style={S.title}>Kitchen Stock</div>
        <div style={S.sub}>Play Academy Kitchen · stock movements & inventory</div>
      </div>

      <div style={S.tabs}>
        {([
          ['receive', '📦 Receive'],
          ['issue',   '🍳 Issue'],
          ['stock',   '📊 Stock'],
        ] as [Tab, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} style={S.tabBtn(tab === v)}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 13, padding: 20 }}>Loading…</div>
      ) : (
        <>
          {tab === 'receive' && <ReceiveTab products={products} onDone={load} />}
          {tab === 'issue'   && <IssueTab   products={products} onDone={load} />}
          {tab === 'stock'   && <StockTab   products={products} movements={movements} />}
        </>
      )}
    </div>
  )
}
