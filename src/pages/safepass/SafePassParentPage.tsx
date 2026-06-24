// ============================================================
// SafePassParentPage.tsx — route /safepass/parent (PUBLIC, no role gate)
// Parent PWA — Step 3: app auth method, full ping-pong with the teacher iPad.
//
// Visual reference: safepass-parent.html (dark mobile theme, max 430px, Inter).
// Screens: Agreement → Home → Waiting → Confirmed.
//   • Sign  → INSERT safepass_agreements (signature_method 'pin'); cached in localStorage.
//   • Drop/Pick → INSERT safepass_sessions (status='waiting', auth_method='app').
//   • Subscribe safepass:parent:{session_id}; UPDATE status='confirmed' → Confirmed.
//
// Step-3 test parent is hardcoded (real parent auth comes later). The page runs
// the shared Supabase client, so during testing the logged-in tester's JWT
// satisfies RLS; truly anonymous parents need parent auth + anon policies later.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── hardcoded test parent (Blue Room · Pearl) ────────────────────────────────
const ORG_ID = '3a9a290e-7e49-491e-946b-ad86f2399910'
const CENTER_ID = '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b'
const CLASSROOM_ID = '26d73e53-3e95-4969-a015-005b01fa641d'
const CLASSROOM_NAME = 'Blue Room'
const CENTER_NAME = 'Pearl'
const PARENT_ID = 'PRL-PARENT-001'
const PARENT_NAME = 'Elena Ivanova'
const CHILD_ID = 'PRL-001'
const CHILD_NAME = 'Masha Ivanova'
const CHILD_FIRST = 'Masha'
const DOC_VERSION = '1.0'

// ─── palette (from safepass-parent.html) ──────────────────────────────────────
const C = {
  bg: '#0a0c12', surface: '#13161f', surface2: '#1c2030', border: '#252a3d',
  text: '#f0f2ff', muted: '#6b7299',
  green: '#00e896', greenDim: 'rgba(0,232,150,0.1)',
  amber: '#ffb740', amberDim: 'rgba(255,183,64,0.1)',
  red: '#ff4d6a', blue: '#5b8bff',
}

type Action = 'drop_off' | 'pick_up'
type Screen = 'loading' | 'agreement' | 'home' | 'waiting' | 'confirmed'
type Sess = { id: string; action_type: Action; status: string; teacher_name: string | null; teacher_confirmed_at: string | null }

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'
const startOfTodayISO = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }
function deviceId() {
  let d = localStorage.getItem('safepass_device_id')
  if (!d) { d = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('safepass_device_id', d) }
  return d
}

const AGREEMENT_RULES = [
  <><strong>Entering the building does not transfer responsibility.</strong> My child remains my responsibility until I physically place them into the teacher's hands and the teacher taps <strong>Accept</strong> in SafePass.</>,
  <><strong>Leaving the building does not end the center's responsibility.</strong> The center remains responsible until the teacher physically places my child into my hands and taps <strong>Release</strong> — not when I walk through the door.</>,
  <>I must complete the physical handoff to the teacher <strong>in person</strong> — I may not leave my child at the entrance, hallway, or classroom door unattended.</>,
  <>I must wait for ✅ confirmation on my phone <strong>before stepping away</strong> — confirmation means the teacher has physically received my child.</>,
  <>If the teacher doesn't respond within 30 seconds, I use the <strong>Remind</strong> button and remain present with my child until confirmed.</>,
  <>Bypassing this system — including leaving without confirmation — releases Play Academy from all liability for that period.</>,
  <>All SafePass records are legally valid documents and may be used in any safety or liability dispute.</>,
]

export default function SafePassParentPage() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [confirmedList, setConfirmedList] = useState<Sess[]>([])
  const [action, setAction] = useState<Action>('drop_off')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [waitSecs, setWaitSecs] = useState(0)
  const [remindCount, setRemindCount] = useState(0)
  const [remindCooldown, setRemindCooldown] = useState(false)
  const [confirmedInfo, setConfirmedInfo] = useState<{ teacher: string; time: string; action: Action } | null>(null)
  const [signing, setSigning] = useState(false)
  const waitTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── derived child status from today's confirmed sessions ─────────────────────
  const last = confirmedList[confirmedList.length - 1]
  const atCenter = last?.action_type === 'drop_off'
  const statusTime = hhmm(last?.teacher_confirmed_at ?? null)

  const loadHome = useCallback(async () => {
    const { data } = await supabase.schema('menumaker').from('safepass_sessions')
      .select('id,action_type,status,teacher_name,teacher_confirmed_at')
      .eq('child_id', CHILD_ID).eq('status', 'confirmed')
      .gte('created_at', startOfTodayISO())
      .order('teacher_confirmed_at', { ascending: true })
    setConfirmedList((data ?? []) as Sess[])
  }, [])

  // ── first launch: agreement gate ─────────────────────────────────────────────
  useEffect(() => {
    if (localStorage.getItem(`safepass_agreement_${PARENT_ID}`)) { setScreen('home'); loadHome(); return }
    ;(async () => {
      const { data } = await supabase.schema('menumaker').from('safepass_agreements')
        .select('id').eq('person_type', 'parent').eq('person_id', PARENT_ID).eq('document_version', DOC_VERSION).limit(1).maybeSingle()
      if (data) { localStorage.setItem(`safepass_agreement_${PARENT_ID}`, '1'); setScreen('home'); loadHome() }
      else setScreen('agreement')
    })()
  }, [loadHome])

  async function sign() {
    setSigning(true)
    const { error } = await supabase.schema('menumaker').from('safepass_agreements').insert({
      org_id: ORG_ID, center_id: CENTER_ID, person_type: 'parent', person_id: PARENT_ID,
      person_name: PARENT_NAME, document_version: DOC_VERSION, signature_method: 'pin', device_id: deviceId(),
    })
    setSigning(false)
    // 23505 = already signed → treat as success
    if (error && error.code !== '23505') { alert('Could not save agreement — ' + error.message); return }
    localStorage.setItem(`safepass_agreement_${PARENT_ID}`, '1')
    setScreen('home'); loadHome()
  }

  // ── start a handoff: insert waiting session + subscribe ──────────────────────
  async function startHandoff(act: Action) {
    const { data, error } = await supabase.schema('menumaker').from('safepass_sessions').insert({
      org_id: ORG_ID, center_id: CENTER_ID, classroom_id: CLASSROOM_ID,
      child_id: CHILD_ID, child_name: CHILD_NAME,
      parent_id: PARENT_ID, parent_name: PARENT_NAME, parent_device_id: deviceId(),
      auth_method: 'app', action_type: act, location: 'classroom',
      teacher_id: 'pending', teacher_name: '—', status: 'waiting',
    }).select('id').single()
    if (error || !data) { alert('Could not start — ' + (error?.message ?? 'unknown')); return }
    setAction(act)
    setSessionId(data.id)
    setWaitSecs(0); setRemindCount(0); setRemindCooldown(false)
    setScreen('waiting')
  }

  // ── waiting: timer + realtime subscription on this session ───────────────────
  useEffect(() => {
    if (screen !== 'waiting' || !sessionId) return
    waitTimer.current = setInterval(() => setWaitSecs(s => s + 1), 1000)

    const channel = supabase
      .channel(`safepass:parent:${sessionId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'menumaker', table: 'safepass_sessions', filter: `id=eq.${sessionId}` },
        ({ new: s }: any) => {
          if (s.status === 'confirmed') {
            setConfirmedInfo({ teacher: s.teacher_name || 'Teacher', time: hhmm(s.teacher_confirmed_at), action: s.action_type })
            setScreen('confirmed')
          }
        })
      .subscribe()

    return () => {
      if (waitTimer.current) clearInterval(waitTimer.current)
      supabase.removeChannel(channel)
    }
  }, [screen, sessionId])

  async function sendReminder() {
    if (!sessionId || remindCooldown) return
    const next = remindCount + 1
    const { error } = await supabase.schema('menumaker').from('safepass_sessions')
      .update({ reminder_count: next, reminder_sent_at: new Date().toISOString() }).eq('id', sessionId)
    if (error) return
    setRemindCount(next); setRemindCooldown(true)
    setTimeout(() => setRemindCooldown(false), 10000)
  }

  function doneToHome() {
    setSessionId(null); setConfirmedInfo(null); setScreen('home'); loadHome()
  }

  // ─── shared styles ───────────────────────────────────────────────────────────
  const page: React.CSSProperties = {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif", background: C.bg, color: C.text,
    minHeight: '100vh', maxWidth: 430, margin: '0 auto', display: 'flex', flexDirection: 'column', position: 'relative',
  }
  const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: C.muted, margin: '24px 0 12px' }
  const fonts = <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
  const spin = <style>{`@keyframes sp-spin{to{transform:rotate(360deg)}}@keyframes sp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes sp-pop{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>

  const mm = Math.floor(waitSecs / 60), ss = String(waitSecs % 60).padStart(2, '0')
  const drop = action === 'drop_off'

  // ── LOADING ──────────────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return <div style={{ ...page, alignItems: 'center', justifyContent: 'center' }}>{fonts}<div style={{ color: C.muted, fontSize: 14 }}>Loading…</div></div>
  }

  // ── AGREEMENT ────────────────────────────────────────────────────────────────
  if (screen === 'agreement') {
    return (
      <div style={page}>{fonts}
        <div style={{ height: 44, background: C.bg }} />
        <div style={{ padding: '24px 20px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <div style={{ width: 44, height: 44, background: C.green, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛡️</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>SafePass</div>
              <div style={{ fontSize: 13, color: C.muted }}>Play Academy · {CENTER_NAME} Center</div>
            </div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 20, fontSize: 14, lineHeight: 1.8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Parent Responsibility Agreement</h3>
            {AGREEMENT_RULES.map((r, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < AGREEMENT_RULES.length - 1 ? `1px solid ${C.border}` : 'none', color: C.text, display: 'flex', gap: 10 }}>
                <span style={{ color: C.green, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
          <button onClick={sign} disabled={signing} style={{ width: '100%', padding: 18, borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 800, cursor: 'pointer', background: C.green, color: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: signing ? 0.6 : 1 }}>
            {signing ? 'Signing…' : '🔒 Sign with PIN · Agree'}
          </button>
        </div>
      </div>
    )
  }

  // ── WAITING ──────────────────────────────────────────────────────────────────
  if (screen === 'waiting') {
    const remindDisabled = waitSecs < 30 || remindCooldown
    return (
      <div style={page}>{fonts}{spin}
        <div style={{ height: 44, background: C.bg }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 28px 80px' }}>
          <div style={{ fontSize: 72, marginBottom: 24, animation: 'sp-float 3s ease-in-out infinite' }}>{drop ? '👧' : '🚗'}</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.6, marginBottom: 8 }}>
            {drop ? 'Waiting for teacher to accept' : `Waiting for teacher to release ${CHILD_FIRST}`}
          </div>
          <div style={{ fontSize: 16, color: C.muted, lineHeight: 1.6, marginBottom: 32 }}>
            {drop
              ? <>Stay with your child until you receive ✅.<br />Do not leave until the teacher physically takes your child.</>
              : <>Stay at the classroom — your child is still under the center's care.<br />You will be notified when the teacher is ready for handoff.</>}
          </div>
          <div style={{ width: 80, height: 80, borderRadius: '50%', border: `3px solid ${C.border}`, borderTopColor: C.green, animation: 'sp-spin 1.2s linear infinite', marginBottom: 24 }} />
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 100, padding: '10px 24px', fontSize: 14, color: C.muted, marginBottom: 32 }}>
            Waiting <span style={{ color: C.amber, fontWeight: 700 }}>{mm}:{ss}</span>
          </div>
          <button onClick={sendReminder} disabled={remindDisabled}
            style={{ background: C.amberDim, border: `1px solid ${C.amber}`, color: C.amber, padding: '14px 32px', borderRadius: 100, fontSize: 15, fontWeight: 700, cursor: remindDisabled ? 'default' : 'pointer', opacity: remindDisabled ? 0.4 : 1, marginBottom: 16 }}>
            {remindCount > 0 && remindCooldown ? `✓ Reminder sent (${remindCount})` : '🔔 Remind Teacher'}
          </button>
          <div style={{ fontSize: 13, color: C.muted, maxWidth: 280 }}>
            Stay with {CHILD_FIRST} until ✅ — you can't leave this screen until the teacher confirms.
          </div>
        </div>
      </div>
    )
  }

  // ── CONFIRMED ────────────────────────────────────────────────────────────────
  if (screen === 'confirmed' && confirmedInfo) {
    const cdrop = confirmedInfo.action === 'drop_off'
    return (
      <div style={page}>{fonts}{spin}
        <div style={{ height: 44, background: C.bg }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 28px 80px' }}>
          <div style={{ width: 100, height: 100, borderRadius: '50%', background: C.greenDim, border: `3px solid ${C.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, marginBottom: 24, animation: 'sp-pop 0.5s cubic-bezier(0.34,1.56,0.64,1)' }}>✅</div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.7, marginBottom: 8, color: C.green }}>
            {CHILD_FIRST} {cdrop ? 'Accepted' : 'Released'} ✅
          </div>
          <div style={{ fontSize: 16, color: C.muted, lineHeight: 1.6, marginBottom: 32 }}>
            {cdrop
              ? <>{CHILD_FIRST} is now under the center's care.<br />You may leave safely.</>
              : <>You may now take {CHILD_FIRST}.<br />Teacher has confirmed handoff.</>}
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, width: '100%', textAlign: 'left', marginBottom: 16 }}>
            {[
              ['Child', CHILD_NAME], ['Action', cdrop ? 'Drop-off' : 'Pick-up'],
              ['Teacher', confirmedInfo.teacher], ['Time', confirmedInfo.time, true],
              ['Center', `${CENTER_NAME} · ${CLASSROOM_NAME}`],
            ].map(([label, value, green], i, arr) => (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: 14 }}>
                <span style={{ color: C.muted }}>{label as string}</span>
                <span style={{ fontWeight: 600, color: green ? C.green : C.text }}>{value as string}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: C.amber, marginBottom: 28, fontWeight: 600 }}>📋 This time = write it in the paper log.</div>
          <button onClick={doneToHome} style={{ background: C.green, color: C.bg, padding: '16px 48px', borderRadius: 100, border: 'none', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    )
  }

  // ── HOME ─────────────────────────────────────────────────────────────────────
  return (
    <div style={page}>{fonts}
      <div style={{ height: 44, background: C.bg }} />
      <div style={{ flex: 1, padding: '0 20px 100px' }}>
        <div style={{ padding: '16px 0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: C.muted }}>Welcome</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginTop: 2 }}>{PARENT_NAME}</div>
          </div>
          <div style={{ width: 40, height: 40, background: C.surface2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, border: `1px solid ${C.border}` }}>🔔</div>
        </div>

        {/* Child card */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 22, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#5b8bff,#00e896)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>👧</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{CHILD_FIRST}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{CLASSROOM_NAME} · {CENTER_NAME}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: C.surface2, borderRadius: 12, fontSize: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: atCenter ? C.green : C.muted, boxShadow: atCenter ? `0 0 6px ${C.green}` : 'none' }} />
            <div style={{ fontWeight: 600, flex: 1 }}>{atCenter ? 'At center' : 'Not yet arrived'}</div>
            <div style={{ color: C.muted, fontSize: 13 }}>{atCenter ? `in since ${statusTime}` : 'today'}</div>
          </div>

          {atCenter ? (
            <button onClick={() => startHandoff('pick_up')} style={{ width: '100%', padding: 16, borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: C.amber, color: C.bg }}>
              🚗 I'm here to pick up {CHILD_FIRST}
            </button>
          ) : (
            <button onClick={() => startHandoff('drop_off')} style={{ width: '100%', padding: 16, borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: C.blue, color: '#fff' }}>
              👋 I'm here to drop off {CHILD_FIRST}
            </button>
          )}
        </div>

        {/* Today's activity */}
        <div style={sectionTitle}>Today's Activity</div>
        {confirmedList.length === 0 && <div style={{ fontSize: 13, color: C.muted }}>No handoffs yet today.</div>}
        {[...confirmedList].reverse().map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: C.surface, borderRadius: 12, marginBottom: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 18 }}>{s.action_type === 'drop_off' ? '✅' : '🔄'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{CHILD_FIRST} {s.action_type === 'drop_off' ? 'dropped off' : 'picked up'}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Confirmed by {s.teacher_name || 'teacher'}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>{hhmm(s.teacher_confirmed_at)}</div>
          </div>
        ))}
      </div>

      {/* bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: 'rgba(10,12,18,0.9)', backdropFilter: 'blur(20px)', borderTop: `1px solid ${C.border}`, display: 'flex', padding: '12px 0 28px' }}>
        {[['🏠', 'Home', true], ['📋', 'Agreement', false], ['📅', 'History', false], ['⚙️', 'Settings', false]].map(([icon, label, active]) => (
          <div key={label as string} onClick={() => { if (label === 'Agreement') setScreen('agreement') }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 10, color: active ? C.green : C.muted, cursor: 'pointer', padding: 4 }}>
            <div style={{ fontSize: 22 }}>{icon as string}</div>{label as string}
          </div>
        ))}
      </div>
    </div>
  )
}
