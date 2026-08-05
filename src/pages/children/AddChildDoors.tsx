// AddChildDoors.tsx — «Add Child» показывает ДВЕ ДВЕРИ, а не одну.
//
// ЗАЧЕМ. Кнопка открывала пакетное окно — путь «семья заполнит сама». Второй путь
// существовал, но о нём надо было знать: директор с подписанной бумагой на столе
// заполнять онлайн-пакет не будет, ему нужно завести ребёнка руками. Дверь, о
// которой надо знать, — это дверь, которой не пользуются.
//
// ОБЕ ДВЕРИ РАВНОПРАВНЫ. Ни одна не «правильнее»: онлайн — когда семья ещё не
// приходила, ручной — когда бумага уже подписана и лежит в руках.
const GREEN = '#0f4c35'

const door: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
  padding: '18px 20px', borderRadius: 12, border: '1.5px solid #e8f0e8',
  background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
  width: '100%',
}

export default function AddChildDoors({ onOnline, onManual, onClose }: {
  onOnline: () => void; onManual: () => void; onClose: () => void
}) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,32,25,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#f8faf8', borderRadius: 16, width: 'min(560px, 96vw)', overflow: 'hidden',
        boxShadow: '0 18px 50px rgba(0,0,0,0.28)', fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ background: GREEN, color: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>➕ Add Child</div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30,
            borderRadius: '50%', cursor: 'pointer', fontSize: 18, fontFamily: 'inherit',
          }}>×</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button data-door="online" onClick={onOnline} style={door}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0a3320' }}>🔗 Online — send the packet</span>
            <span style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }}>
              Link or QR for the family to fill on their own phone. The signed forms arrive in the
              Enrollment Inbox, and the child appears once you approve them.
            </span>
          </button>

          <button data-door="manual" onClick={onManual} style={door}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0a3320' }}>✍️ Manual entry — paper on the desk</span>
            <span style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }}>
              You type the child in. Nothing goes through the inbox — there is nothing to review, no
              form was submitted. The child is in the roster and the meal grid at once, and the full
              card opens straight after so the rest of the fields get filled while the paper is in hand.
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
