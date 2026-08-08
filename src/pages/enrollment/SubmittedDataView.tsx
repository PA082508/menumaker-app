// SubmittedDataView.tsx — «первоисточника нет, но показать есть что».
//
// ЗАЧЕМ. У части типов заявок нет локальной реплики бланка (`originalFormReplicas`):
// на 08.08 реплики есть только у `dcy_01234` и `cacfp_enrollment`, а `iea`,
// `parent_consent`, `child_release_authorization`, `parents_book_ack`, `other`
// остаются без неё. Раньше кнопка «View original form» у таких типов просто
// ИСЧЕЗАЛА — молча, и человек читал это как «первоисточника не существует».
//
// Здесь показывается ТО, ЧТО ЕСТЬ: поля, как их прислала семья, и подписи.
// Реконструкция НИКОГДА не выдаётся за скан: пометка «rendered from submission —
// original not on file» стоит на экране И НА ПЕЧАТИ, снять её нельзя. Канон
// «артефакт объявляет своё происхождение» (23.07) — здесь он важнее всего:
// распечатанный лист уходит из приложения и дальше живёт сам.
//
// Экран НИЧЕГО не пишет.
import { useEffect } from 'react'

const MARK = 'rendered from submission — original not on file'

const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && !v.trim()) ||
  (Array.isArray(v) && v.length === 0)

/** Человеческая подпись ключа: `day_phone` → «Day phone». Служебные ключи
 *  (`_ocr`, `_manual`…) не показываем вовсе — это следы обработки, не форма. */
const label = (k: string) =>
  k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

function Value({ v }: { v: unknown }) {
  if (typeof v === 'string' && /^data:image\//.test(v)) {
    // Подпись — картинкой, как её нарисовали. Пересказывать её словами нельзя.
    return <img src={v} alt="signature" style={{ maxWidth: 260, maxHeight: 80, display: 'block' }} />
  }
  if (Array.isArray(v)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {v.map((item, i) => (
          <div key={i} style={{ paddingLeft: 8, borderLeft: '2px solid #e5e7eb' }}>
            {typeof item === 'object' && item !== null
              ? Object.entries(item as Record<string, unknown>)
                  .filter(([, x]) => !isBlank(x))
                  .map(([k, x]) => <div key={k}><b>{label(k)}:</b> {String(x)}</div>)
              : String(item)}
          </div>
        ))}
      </div>
    )
  }
  if (typeof v === 'object' && v !== null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => !isBlank(x))
          .map(([k, x]) => <div key={k}><b>{label(k)}:</b> {String(x)}</div>)}
      </div>
    )
  }
  return <>{String(v)}</>
}

export default function SubmittedDataView({
  submissionType, formData, signatures, signatureDate, submittedAt, childName, onClose,
}: {
  submissionType: string
  formData: any
  signatures?: Record<string, any> | null
  signatureDate?: string | null
  submittedAt?: string | null
  childName?: string
  onClose: () => void
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const fields = Object.entries((formData ?? {}) as Record<string, unknown>)
    .filter(([k, v]) => !k.startsWith('_') && !isBlank(v))
  const sigs = Object.entries((signatures ?? {}) as Record<string, unknown>).filter(([, v]) => !isBlank(v))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000,
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 20, overflow: 'auto',
    }}>
      {/* Пометка ПЕЧАТАЕТСЯ вместе с листом — она часть артефакта, а не подсказка экрана. */}
      <style>{`@media print {
        body * { visibility: hidden; }
        .sdv-sheet, .sdv-sheet * { visibility: visible; }
        .sdv-sheet { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; }
        .sdv-noprint { display: none !important; }
      }`}</style>

      <div className="sdv-noprint" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => window.print()} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid #c0d8c0',
          background: '#fff', color: '#0f4c35', fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>🖨 Print</button>
        <button onClick={onClose} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
          background: '#fff', color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>✕ Close</button>
      </div>

      <div className="sdv-sheet" style={{
        background: '#fff', borderRadius: 12, maxWidth: 820, width: '100%', padding: '28px 32px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#111827',
      }}>
        <div style={{ borderBottom: '2px solid #0f4c35', paddingBottom: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{label(submissionType)}{childName ? ` — ${childName}` : ''}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {submittedAt ? `Submitted ${new Date(submittedAt).toLocaleString('en-US')}` : 'Submitted date not recorded'}
            {signatureDate ? ` · signed ${signatureDate}` : ''}
          </div>
        </div>

        {/* НЕСМЫВАЕМАЯ ПОМЕТКА. Не выдавать реконструкцию за скан — прямое слово
            владельца и канон следа подписи. */}
        <div role="note" style={{
          background: '#fff8e6', border: '1.5px solid #f0a020', color: '#7a4b00',
          borderRadius: 8, padding: '9px 12px', fontSize: 12.5, fontWeight: 700, marginBottom: 16,
        }}>
          ⚠️ {MARK}
          <span style={{ display: 'block', fontWeight: 400, marginTop: 2 }}>
            These are the values the family submitted, laid out by the app — not a photograph of a
            signed sheet. Nothing here has been edited.
          </span>
        </div>

        {fields.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>This submission carries no fields.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: '10px 16px', fontSize: 13.5 }}>
            {fields.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <div style={{ color: '#6b7280', fontWeight: 600 }}>{label(k)}</div>
                <div><Value v={v} /></div>
              </div>
            ))}
          </div>
        )}

        {sigs.length > 0 && (
          <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
              Signatures as filed
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: '10px 16px', fontSize: 13.5 }}>
              {sigs.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>{label(k)}</div>
                  <div><Value v={v} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 22, fontSize: 11, color: '#9ca3af' }}>{MARK}</div>
      </div>
    </div>
  )
}
