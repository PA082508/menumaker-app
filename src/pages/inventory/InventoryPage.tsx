import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const KITCHEN_ID = 'ec46ac9f-f2e3-42e7-922c-0de8a87a1a14'

type Product = {
  id: string
  name: string
  vendor_name: string | null
  package_size: number | null
  package_unit: string | null
  package_label: string | null
  unit_cost: number | null
  packages_on_hand: number
  inv_updated_at: string | null
}

type Snapshot = {
  id: string
  snapshot_date: string
  notes: string | null
}

type CellState = 'idle' | 'saving' | 'saved' | 'error'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtCost(n: number | null): string {
  if (n == null) return '—'
  return '$' + n.toFixed(2)
}

function sizeLabel(p: Product): string {
  if (p.package_label) return p.package_label
  if (p.package_size && p.package_unit) return `${p.package_size} ${p.package_unit}`
  return '—'
}

export default function InventoryPage() {
  const [products, setProducts]   = useState<Product[]>([])
  const [draft, setDraft]         = useState<Record<string, string>>({})
  const [cellState, setCellState] = useState<Record<string, CellState>>({})
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [snapshotDate, setSnapshotDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-09-30`
  })
  const [snapshotNotes, setSnapshotNotes]   = useState('')
  const [snapshotSaving, setSnapshotSaving] = useState(false)
  const [snapshotDone, setSnapshotDone]     = useState(false)
  const [tab, setTab] = useState<'current' | 'history'>('current')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: prods }, { data: inv }, { data: snaps }] = await Promise.all([
      supabase.schema('menumaker').from('products')
        .select('id, name, vendors(name), package_size, package_unit, package_label, unit_cost')
        .eq('is_active', true)
        .order('name'),
      supabase.schema('menumaker').from('inventory')
        .select('product_id, packages_on_hand, updated_at')
        .eq('center_id', KITCHEN_ID),
      supabase.schema('menumaker').from('inventory_snapshots')
        .select('id, snapshot_date, notes')
        .eq('center_id', KITCHEN_ID)
        .order('snapshot_date', { ascending: false })
        .limit(20),
    ])

    const invMap: Record<string, { packages_on_hand: number; updated_at: string }> = {}
    ;(inv || []).forEach((i: any) => {
      invMap[i.product_id] = { packages_on_hand: i.packages_on_hand ?? 0, updated_at: i.updated_at }
    })

    const mapped: Product[] = (prods || []).map((p: any) => ({
      id:               p.id,
      name:             p.name,
      vendor_name:      p.vendors?.name ?? null,
      package_size:     p.package_size ?? null,
      package_unit:     p.package_unit ?? null,
      package_label:    p.package_label ?? null,
      unit_cost:        p.unit_cost ?? null,
      packages_on_hand: invMap[p.id]?.packages_on_hand ?? 0,
      inv_updated_at:   invMap[p.id]?.updated_at ?? null,
    }))

    setProducts(mapped)
    const d: Record<string, string> = {}
    mapped.forEach(r => { d[r.id] = r.packages_on_hand > 0 ? String(r.packages_on_hand) : '' })
    setDraft(d)
    setSnapshots(snaps || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function save(pid: string) {
    const qty = Math.max(0, Math.floor(parseInt(draft[pid] ?? '') || 0))
    setCellState(s => ({ ...s, [pid]: 'saving' }))
    const { error } = await supabase.schema('menumaker').from('inventory').upsert({
      center_id:        KITCHEN_ID,
      product_id:       pid,
      packages_on_hand: qty,
      updated_at:       new Date().toISOString(),
    }, { onConflict: 'center_id,product_id' })
    if (error) {
      setCellState(s => ({ ...s, [pid]: 'error' }))
    } else {
      setProducts(prev => prev.map(p => p.id === pid
        ? { ...p, packages_on_hand: qty, inv_updated_at: new Date().toISOString() } : p))
      setCellState(s => ({ ...s, [pid]: 'saved' }))
      setTimeout(() => setCellState(s => ({ ...s, [pid]: 'idle' })), 1500)
    }
  }

  async function takeSnapshot() {
    if (!snapshotDate) return
    setSnapshotSaving(true)
    const items = products
      .filter(p => p.packages_on_hand > 0)
      .map(p => ({
        center_id:        KITCHEN_ID,
        product_id:       p.id,
        packages_on_hand: p.packages_on_hand,
        snapshot_date:    snapshotDate,
        notes:            snapshotNotes || null,
      }))

    const { error } = await supabase.schema('menumaker').from('inventory_snapshots')
      .upsert(items, { onConflict: 'center_id,product_id,snapshot_date' })

    setSnapshotSaving(false)
    if (!error) {
      setSnapshotDone(true)
      setTimeout(() => setSnapshotDone(false), 2000)
      load()
    }
  }

  const visible = products.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.vendor_name?.toLowerCase().includes(search.toLowerCase()))
  )

  const totalOnHand  = products.filter(p => p.packages_on_hand > 0).length
  const grandTotal   = products.reduce((sum, p) => {
    if (!p.unit_cost || !p.packages_on_hand) return sum
    return sum + p.packages_on_hand * p.unit_cost
  }, 0)

  const S = {
    page:    { padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' } as React.CSSProperties,
    title:   { fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 } as React.CSSProperties,
    sub:     { fontSize: 12, color: '#888', marginBottom: 20 } as React.CSSProperties,
    tabs:    { display: 'flex', gap: 4, background: '#fff', padding: 5, borderRadius: 10, border: '1px solid #e0e0e0', width: 'fit-content', marginBottom: 20 } as React.CSSProperties,
    card:    { background: '#fff', borderRadius: 12, border: '1px solid #e8ece8', padding: '16px 20px', marginBottom: 16 } as React.CSSProperties,
    stat:    { display: 'flex', gap: 24, marginBottom: 20 } as React.CSSProperties,
    statBox: { background: '#fff', borderRadius: 10, border: '1px solid #e0e0e0', padding: '12px 20px', textAlign: 'center' } as React.CSSProperties,
    statN:   { fontSize: 24, fontWeight: 600, color: '#0a3320' } as React.CSSProperties,
    statL:   { fontSize: 11, color: '#888', marginTop: 2 } as React.CSSProperties,
    search:  { padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, width: 240, fontFamily: 'inherit', outline: 'none' } as React.CSSProperties,
    table:   { width: '100%', borderCollapse: 'collapse' } as React.CSSProperties,
    th:      { textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #e8ece8', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 } as React.CSSProperties,
    thR:     { textAlign: 'right', padding: '8px 12px', borderBottom: '1px solid #e8ece8', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 } as React.CSSProperties,
    td:      { padding: '8px 12px', borderBottom: '1px solid #f0f2f0', verticalAlign: 'middle', fontSize: 13 } as React.CSSProperties,
    tdR:     { padding: '8px 12px', borderBottom: '1px solid #f0f2f0', verticalAlign: 'middle', fontSize: 13, textAlign: 'right' } as React.CSSProperties,
    input:   { width: 72, padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', textAlign: 'right', outline: 'none' } as React.CSSProperties,
    snapCard: { background: '#fff', borderRadius: 12, border: '1px solid #e8ece8', padding: '20px 24px', marginBottom: 16 } as React.CSSProperties,
    label:   { fontSize: 12, color: '#666', marginBottom: 4, display: 'block' } as React.CSSProperties,
  }

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    background: active ? '#0a3320' : 'transparent', color: active ? '#fff' : '#555', transition: 'all 0.15s',
  })

  const saveBtn = (state: CellState): React.CSSProperties => ({
    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
    background: state === 'saved' ? '#dcfce7' : state === 'error' ? '#fee2e2' : '#0a3320',
    color: state === 'saved' ? '#166534' : state === 'error' ? '#991b1b' : '#fff',
    opacity: state === 'saving' ? 0.6 : 1, transition: 'all 0.15s', marginLeft: 6,
  })

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      <div style={{ marginBottom: 20 }}>
        <div style={S.title}>Inventory</div>
        <div style={S.sub}>Play Academy Kitchen · on-hand stock</div>
      </div>

      <div style={S.tabs}>
        {([['current', '📦 Current Stock'], ['history', '📋 Snapshots']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} style={tabBtn(tab === v)}>{l}</button>
        ))}
      </div>

      {tab === 'current' && (
        <>
          <div style={S.stat}>
            <div style={S.statBox}>
              <div style={S.statN}>{totalOnHand}</div>
              <div style={S.statL}>items on hand</div>
            </div>
            <div style={S.statBox}>
              <div style={S.statN}>{products.length}</div>
              <div style={S.statL}>total products</div>
            </div>
            <div style={S.statBox}>
              <div style={S.statN}>${grandTotal.toFixed(2)}</div>
              <div style={S.statL}>total inventory value</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <input
              style={S.search}
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <span style={{ fontSize: 12, color: '#aaa' }}>{visible.length} products</span>
          </div>

          <div style={S.card}>
            {loading ? (
              <div style={{ color: '#aaa', fontSize: 13, padding: 20 }}>Loading...</div>
            ) : (
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Item</th>
                    <th style={S.th}>Size &amp; Description</th>
                    <th style={S.thR}>No. On Hand</th>
                    <th style={S.thR}>Unit Cost</th>
                    <th style={S.thR}>Total Cost</th>
                    <th style={S.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(p => {
                    const state = cellState[p.id] || 'idle'
                    const qty = p.packages_on_hand
                    const totalCost = qty && p.unit_cost ? qty * p.unit_cost : null
                    return (
                      <tr key={p.id} style={{ background: qty > 0 ? '#fff' : '#fafafa' }}>
                        <td style={S.td}>
                          <div style={{ fontWeight: 500, color: '#1a1a1a' }}>{p.name}</div>
                          {p.vendor_name && <div style={{ fontSize: 11, color: '#aaa' }}>{p.vendor_name}</div>}
                        </td>
                        <td style={S.td}>
                          <span style={{ fontSize: 12, color: '#666' }}>{sizeLabel(p)}</span>
                        </td>
                        <td style={S.tdR}>
                          <input
                            style={S.input}
                            type="number"
                            step="1"
                            min="0"
                            value={draft[p.id] ?? ''}
                            onChange={e => setDraft(d => ({ ...d, [p.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && save(p.id)}
                            placeholder="0"
                          />
                        </td>
                        <td style={S.tdR}>
                          <span style={{ fontSize: 12, color: '#555' }}>{fmtCost(p.unit_cost)}</span>
                        </td>
                        <td style={S.tdR}>
                          <span style={{ fontSize: 13, fontWeight: totalCost ? 500 : 400, color: totalCost ? '#0a3320' : '#ccc' }}>
                            {totalCost != null ? fmtCost(totalCost) : '—'}
                          </span>
                        </td>
                        <td style={S.td}>
                          <button style={saveBtn(state)} onClick={() => save(p.id)} disabled={state === 'saving'}>
                            {state === 'saving' ? '…' : state === 'saved' ? '✓ Saved' : state === 'error' ? '✗ Error' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f4f6f4' }}>
                    <td style={{ ...S.td, fontWeight: 600, color: '#0a3320', borderTop: '2px solid #e0e0e0', borderBottom: 'none' }} colSpan={4}>
                      TOTAL
                    </td>
                    <td style={{ ...S.tdR, fontWeight: 700, color: '#0a3320', fontSize: 14, borderTop: '2px solid #e0e0e0', borderBottom: 'none' }}>
                      ${grandTotal.toFixed(2)}
                    </td>
                    <td style={{ ...S.td, borderTop: '2px solid #e0e0e0', borderBottom: 'none' }}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'history' && (
        <>
          <div style={S.snapCard}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0a3320', marginBottom: 16 }}>Take Inventory Snapshot</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={S.label}>Snapshot Date</label>
                <input
                  type="date"
                  value={snapshotDate}
                  onChange={e => setSnapshotDate(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
              <div>
                <label style={S.label}>Notes (optional)</label>
                <input
                  type="text"
                  value={snapshotNotes}
                  onChange={e => setSnapshotNotes(e.target.value)}
                  placeholder="e.g. End of fiscal year"
                  style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 240 }}
                />
              </div>
              <button
                onClick={takeSnapshot}
                disabled={snapshotSaving}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                  fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s',
                  background: snapshotDone ? '#dcfce7' : '#0a3320',
                  color: snapshotDone ? '#166534' : '#fff',
                }}
              >
                {snapshotSaving ? 'Saving…' : snapshotDone ? '✓ Snapshot saved' : '📸 Save Snapshot'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 10 }}>
              Captures packages on hand for all {products.filter(p => p.packages_on_hand > 0).length} products with stock.
              Default date is September 30 for annual CACFP reporting.
            </div>
          </div>

          <div style={S.card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 12 }}>Past Snapshots</div>
            {snapshots.length === 0 ? (
              <div style={{ fontSize: 13, color: '#aaa', padding: '12px 0' }}>No snapshots yet.</div>
            ) : (
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Date</th>
                    <th style={S.th}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map(s => (
                    <tr key={s.id}>
                      <td style={S.td}><span style={{ fontWeight: 500 }}>{fmtDate(s.snapshot_date)}</span></td>
                      <td style={S.td}><span style={{ fontSize: 12, color: '#888' }}>{s.notes || '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
