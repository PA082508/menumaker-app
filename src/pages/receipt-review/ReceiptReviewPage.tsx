import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────────

type Receipt = {
  id: string
  vendor: string | null
  receipt_date: string | null
  food_amt: number | null
  nonfood_amt: number | null
  non_cacfp_amt: number | null
  milk_whole: number | null
  milk_skim: number | null
  milk_pct1: number | null
  fiscal_month: string | null
  recon_notes: string | null
  file_path: string | null
  file_paths: string[] | null
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fiscalFromDate(d: string): string {
  return d.length >= 7 ? d.slice(0, 7) : ''
}

function toNum(s: string): number | null {
  const v = parseFloat(s.replace(/[$,\s]/g, ''))
  return isNaN(v) ? null : v
}

function fmtNum(v: number | null): string {
  return v == null ? '' : String(v)
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const labelSt: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#888',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

const inputSt: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0',
  fontSize: 13, fontFamily: 'inherit', outline: 'none',
  width: '100%', boxSizing: 'border-box',
}

// ── Image viewer ───────────────────────────────────────────────────────────────

function ImageViewer({ paths }: { paths: string[] }) {
  const [idx, setIdx] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const [imgErr, setImgErr] = useState(false)

  useEffect(() => {
    setUrl(null)
    setImgErr(false)
    if (!paths.length) return
    supabase.storage.from('receipts').createSignedUrl(paths[idx], 3600)
      .then(({ data, error }) => {
        if (error || !data) { setImgErr(true); return }
        setUrl(data.signedUrl)
      })
  }, [paths, idx])

  if (!paths.length) return (
    <div style={{
      height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f4f6f4', borderRadius: 8, color: '#bbb', fontSize: 13,
    }}>
      Нет фото
    </div>
  )

  return (
    <div>
      <div style={{
        background: '#f0f0f0', borderRadius: 8, overflow: 'hidden',
        minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!url && !imgErr && <div style={{ color: '#bbb', fontSize: 12 }}>Загрузка…</div>}
        {imgErr        && <div style={{ color: '#c0392b', fontSize: 12 }}>Ошибка загрузки фото</div>}
        {url && (
          <img
            src={url}
            alt="Receipt"
            style={{ width: '100%', maxHeight: 440, objectFit: 'contain', display: 'block', cursor: 'zoom-in' }}
            onClick={() => window.open(url, '_blank')}
          />
        )}
      </div>
      {paths.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <button
            onClick={() => setIdx(i => Math.max(0, i - 1))}
            disabled={idx === 0}
            style={{
              padding: '4px 12px', borderRadius: 6,
              border: '1px solid #ddd', background: '#fff',
              cursor: idx === 0 ? 'default' : 'pointer', fontSize: 14,
              color: idx === 0 ? '#ccc' : '#333',
            }}
          >←</button>
          <span style={{ fontSize: 11, color: '#888' }}>{idx + 1} / {paths.length}</span>
          <button
            onClick={() => setIdx(i => Math.min(paths.length - 1, i + 1))}
            disabled={idx === paths.length - 1}
            style={{
              padding: '4px 12px', borderRadius: 6,
              border: '1px solid #ddd', background: '#fff',
              cursor: idx === paths.length - 1 ? 'default' : 'pointer', fontSize: 14,
              color: idx === paths.length - 1 ? '#ccc' : '#333',
            }}
          >→</button>
        </div>
      )}
    </div>
  )
}

// ── Receipt card ───────────────────────────────────────────────────────────────

type CardState = 'idle' | 'saving' | 'saved' | 'bounced' | 'error'

function ReceiptCard({ receipt, onRemove }: { receipt: Receipt; onRemove: (id: string) => void }) {
  const [vendor,      setVendor]      = useState(receipt.vendor ?? '')
  const [date,        setDate]        = useState(receipt.receipt_date ?? '')
  const [foodAmt,     setFoodAmt]     = useState(fmtNum(receipt.food_amt))
  const [nonfoodAmt,  setNonfoodAmt]  = useState(fmtNum(receipt.nonfood_amt))
  const [nonCacfpAmt, setNonCacfpAmt]= useState(fmtNum(receipt.non_cacfp_amt))
  const [milkWhole,   setMilkWhole]   = useState(fmtNum(receipt.milk_whole))
  const [milkSkim,    setMilkSkim]    = useState(fmtNum(receipt.milk_skim))
  const [milkPct1,    setMilkPct1]    = useState(fmtNum(receipt.milk_pct1))
  const [cardState,   setCardState]   = useState<CardState>('idle')
  const [errMsg,      setErrMsg]      = useState('')
  const [confirmDel,  setConfirmDel]  = useState(false)

  const fiscalMonth = fiscalFromDate(date)
  const busy = cardState === 'saving'

  const allPaths = receipt.file_paths?.length
    ? receipt.file_paths
    : receipt.file_path
      ? [receipt.file_path]
      : []

  async function handleSave() {
    setCardState('saving')
    setErrMsg('')
    try {
      const { error } = await supabase.schema('menumaker').from('receipts').update({
        vendor:        vendor.trim() || null,
        receipt_date:  date || null,
        food_amt:      toNum(foodAmt),
        nonfood_amt:   toNum(nonfoodAmt),
        non_cacfp_amt: toNum(nonCacfpAmt),
        milk_whole:    toNum(milkWhole),
        milk_skim:     toNum(milkSkim),
        milk_pct1:     toNum(milkPct1),
        fiscal_month:  fiscalMonth || null,
        status:        'processed',
      }).eq('id', receipt.id)

      if (error) throw error

      // Triggers may bounce it back — re-read to check
      const { data: recheck } = await supabase.schema('menumaker').from('receipts')
        .select('status').eq('id', receipt.id).single()

      if (recheck?.status === 'needs_review') {
        setCardState('bounced')
        setErrMsg('Запись вернулась в очередь — проверьте год и суммы')
      } else {
        setCardState('saved')
        setTimeout(() => onRemove(receipt.id), 600)
      }
    } catch (e: any) {
      setCardState('error')
      setErrMsg(e.message || 'Ошибка сохранения')
    }
  }

  async function handleRequeue() {
    setCardState('saving')
    setErrMsg('')
    try {
      const { error } = await supabase.schema('menumaker').from('receipts')
        .update({ status: 'pending' }).eq('id', receipt.id)
      if (error) throw error
      onRemove(receipt.id)
    } catch (e: any) {
      setCardState('error')
      setErrMsg(e.message || 'Ошибка')
    }
  }

  async function handleDelete() {
    setCardState('saving')
    setErrMsg('')
    try {
      const { error } = await supabase.schema('menumaker').from('receipts')
        .delete().eq('id', receipt.id)
      if (error) throw error
      onRemove(receipt.id)
    } catch (e: any) {
      setCardState('error')
      setErrMsg(e.message || 'Ошибка удаления')
      setConfirmDel(false)
    }
  }

  const borderAccent =
    cardState === 'bounced' ? '1.5px solid #f59e0b' :
    cardState === 'error'   ? '1.5px solid #fcc'    :
    '1.5px solid #e0e0e0'

  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: borderAccent,
      overflow: 'hidden', marginBottom: 20,
    }}>
      {/* recon_notes caption */}
      {receipt.recon_notes && (
        <div style={{
          background: '#fffbeb', borderBottom: '1px solid #fde68a',
          padding: '8px 20px', fontSize: 12, color: '#7a5a00',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span>{receipt.recon_notes}</span>
        </div>
      )}

      {/* bounce / error banner */}
      {cardState === 'bounced' && (
        <div style={{
          background: '#fff8e1', borderBottom: '1px solid #fde68a',
          padding: '7px 20px', fontSize: 12, color: '#7a5a00', fontWeight: 600,
        }}>
          ⚠ {errMsg}
        </div>
      )}
      {cardState === 'error' && (
        <div style={{
          background: '#fce8e6', borderBottom: '1px solid #fcc',
          padding: '7px 20px', fontSize: 12, color: '#b00020', fontWeight: 600,
        }}>
          ✗ {errMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, padding: '20px 24px' }}>

        {/* Left: image viewer */}
        <div>
          <div style={{ ...labelSt, display: 'block', marginBottom: 8 }}>Фото чека</div>
          <ImageViewer paths={allPaths} />
          <div style={{ fontSize: 10, color: '#ccc', marginTop: 6 }}>
            {receipt.created_at
              ? new Date(receipt.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
              : ''}
          </div>
        </div>

        {/* Right: fields + actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Vendor */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={labelSt}>Поставщик (vendor)</span>
            <input
              value={vendor}
              onChange={e => setVendor(e.target.value)}
              disabled={busy}
              style={inputSt}
              placeholder="GFS STORE, COSTCO…"
            />
          </label>

          {/* Date + fiscal_month (read-only) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={labelSt}>Дата чека</span>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                disabled={busy}
                style={inputSt}
              />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={labelSt}>Fiscal month</span>
              <div style={{
                ...inputSt, background: '#f4f6f4', color: '#888',
                display: 'flex', alignItems: 'center',
              }}>
                {fiscalMonth || '—'}
              </div>
            </div>
          </div>

          {/* Amounts */}
          <div>
            <div style={{ ...labelSt, marginBottom: 6 }}>Суммы ($)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {([
                ['Food',      foodAmt,     setFoodAmt],
                ['Non-food',  nonfoodAmt,  setNonfoodAmt],
                ['Non-CACFP', nonCacfpAmt, setNonCacfpAmt],
              ] as [string, string, React.Dispatch<React.SetStateAction<string>>][]).map(([lbl, val, set]) => (
                <label key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={labelSt}>{lbl}</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={val} onChange={e => set(e.target.value)}
                    disabled={busy}
                    style={{ ...inputSt, textAlign: 'right' as const }}
                    placeholder="0.00"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Milk */}
          <div>
            <div style={{ ...labelSt, marginBottom: 6 }}>Молоко (галлоны)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {([
                ['Whole',  milkWhole, setMilkWhole],
                ['Skim',   milkSkim,  setMilkSkim],
                ['1%',     milkPct1,  setMilkPct1],
              ] as [string, string, React.Dispatch<React.SetStateAction<string>>][]).map(([lbl, val, set]) => (
                <label key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={labelSt}>{lbl}</span>
                  <input
                    type="number" min="0" step="0.1"
                    value={val} onChange={e => set(e.target.value)}
                    disabled={busy}
                    style={{ ...inputSt, textAlign: 'right' as const }}
                    placeholder="0"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 4 }}>
            <button
              onClick={handleSave}
              disabled={busy}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 9, border: 'none',
                background: busy ? '#aaa' : '#0a3320', color: '#fff',
                fontSize: 13, fontWeight: 700,
                cursor: busy ? 'default' : 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap' as const,
              }}
            >
              {cardState === 'saving' ? 'Сохранение…' : '✓ Сохранить и провести'}
            </button>

            <button
              onClick={handleRequeue}
              disabled={busy}
              title="Вернуть в OCR-очередь (~2 мин)"
              style={{
                padding: '10px 12px', borderRadius: 9,
                border: '1.5px solid #e0e0e0', background: '#fff', color: '#555',
                fontSize: 12, fontWeight: 500,
                cursor: busy ? 'default' : 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap' as const,
              }}
            >
              🔄 На распознавание
            </button>

            {!confirmDel ? (
              <button
                onClick={() => setConfirmDel(true)}
                disabled={busy}
                style={{
                  padding: '10px 12px', borderRadius: 9,
                  border: '1.5px solid #fcc', background: '#fff', color: '#c0392b',
                  fontSize: 12, fontWeight: 500,
                  cursor: busy ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                🗑
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#c0392b', whiteSpace: 'nowrap' as const }}>Удалить?</span>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  style={{
                    padding: '8px 12px', borderRadius: 7, border: 'none',
                    background: '#c0392b', color: '#fff',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Да
                </button>
                <button
                  onClick={() => setConfirmDel(false)}
                  style={{
                    padding: '8px 12px', borderRadius: 7,
                    border: '1px solid #ddd', background: '#fff', color: '#555',
                    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Отмена
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ReceiptReviewPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.schema('menumaker').from('receipts')
      .select('id,vendor,receipt_date,food_amt,nonfood_amt,non_cacfp_amt,milk_whole,milk_skim,milk_pct1,fiscal_month,recon_notes,file_path,file_paths,created_at')
      .eq('status', 'needs_review')
      .order('created_at', { ascending: false })
    setReceipts(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const removeCard = useCallback((id: string) => {
    setReceipts(prev => prev.filter(r => r.id !== id))
  }, [])

  const count = receipts.length
  const countLabel = count === 0
    ? 'Нет чеков в очереди'
    : count === 1
      ? '1 чек требует проверки'
      : count < 5
        ? `${count} чека требуют проверки`
        : `${count} чеков требуют проверки`

  return (
    <div style={{ padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 }}>
            Проверка чеков
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            {loading ? 'Загрузка…' : countLabel}
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '8px 18px', borderRadius: 9,
            border: '1.5px solid #e0e0e0', background: '#fff', color: '#555',
            fontSize: 12, fontWeight: 500,
            cursor: loading ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          🔄 Обновить
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 80, color: '#aaa', fontSize: 13 }}>
          Загрузка…
        </div>
      )}

      {!loading && receipts.length === 0 && (
        <div style={{
          background: '#fff', borderRadius: 14,
          padding: '64px 40px', textAlign: 'center',
          border: '1px solid #e8e8e8',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0a3320', marginBottom: 6 }}>
            Нет чеков, требующих проверки
          </div>
          <div style={{ fontSize: 13, color: '#888' }}>Все чеки обработаны</div>
        </div>
      )}

      {!loading && receipts.map(r => (
        <ReceiptCard key={r.id} receipt={r} onRemove={removeCard} />
      ))}
    </div>
  )
}
