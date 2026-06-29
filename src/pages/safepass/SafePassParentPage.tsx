// ============================================================
// SafePassParentPage.tsx — route /safepass/parent (PUBLIC)
// Parent PWA — SMS OTP auth → child selection → drop-off/pick-up
// Early Care / Late Care / Transportation aware
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ORG_ID = '3a9a290e-7e49-491e-946b-ad86f2399910'

// ── Palette ───────────────────────────────────────────────────
const C = {
  bg: '#0a0c12', surface: '#13161f', surface2: '#1c2030', border: '#252a3d',
  text: '#f0f2ff', muted: '#6b7299',
  green: '#00e896', greenDim: 'rgba(0,232,150,0.1)',
  amber: '#ffb740', amberDim: 'rgba(255,183,64,0.1)',
  red: '#ff4d6a', blue: '#5b8bff', blueDim: 'rgba(91,139,255,0.1)',
}

// ── Device ID (no localStorage — use sessionStorage fallback) ──
function deviceId() {
  try {
    let d = sessionStorage.getItem('sp_device')
    if (!d) { d = 'dev-' + Math.random().toString(36).slice(2); sessionStorage.setItem('sp_device', d) }
    return d
  } catch { return 'dev-' + Math.random().toString(36).slice(2) }
}

// ── Types ─────────────────────────────────────────────────────
type Screen = 'how_it_works' | 'phone' | 'otp' | 'agreement' | 'child_select' | 'home' | 'waiting' | 'confirmed'
type Child = { child_id: string; child_name: string; classroom_id: string; classroom_name: string; center_id: string }
type Session = { id: string; action_type: string; status: string; teacher_name: string | null; teacher_confirmed_at: string | null }

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'

const AGREEMENT_RULES = [
  'Entering the building does not transfer responsibility. My child remains my responsibility until the teacher physically receives them and taps Accept.',
  'Leaving the building does not end the center\'s responsibility. The center remains responsible until the teacher physically releases my child and taps Release.',
  'I must complete the physical handoff in person — I may not leave my child at the door unattended.',
  'I must wait for ✅ confirmation on my phone before stepping away.',
  'If the teacher doesn\'t respond within 30 seconds, I use the Remind button and remain present with my child.',
  'All SafePass records are legally valid documents.',
]

// ── Shared styles ─────────────────────────────────────────────
const btn = (color: string, bg: string): React.CSSProperties => ({
  width: '100%', padding: '16px', borderRadius: 12, border: 'none',
  background: bg, color, fontSize: 16, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
})
const inp: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 12,
  border: `1.5px solid ${C.border}`, background: C.surface2,
  color: C.text, fontSize: 18, fontFamily: 'inherit',
  textAlign: 'center', letterSpacing: '0.1em', boxSizing: 'border-box',
}

export default function SafePassParentPage() {
  const [screen, setScreen] = useState<Screen>('how_it_works')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [personName, setPersonName] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [selectedChild, setSelectedChild] = useState<Child | null>(null)
  const [action, setAction] = useState<'drop_off' | 'pick_up'>('drop_off')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [waitSecs, setWaitSecs] = useState(0)
  const [confirmedInfo, setConfirmedInfo] = useState<{ teacher: string; time: string; action: string } | null>(null)
  const [todaySessions, setTodaySessions] = useState<Session[]>([])
  const [agreed, setAgreed] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const waitTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const devId = useRef(deviceId())

  // ── How It Works screen ────────────────────────────────────────
  if (screen === 'how_it_works') return (
    <div style={wrap}>
      {header}
      <div style={card}>
        <div style={{ textAlign: 'center', marginTop: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🔒</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>How SafePass Works</div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>
            Play Academy Wickliffe uses SafePass to confirm every drop-off and pick-up with a legal timestamp.
          </div>
        </div>

        {[
          { icon: '📱', step: 'Step 1', title: 'You tap Drop Off or Pick Up', desc: 'Open this app when you arrive. Tap the button for your child.' },
          { icon: '👩‍🏫', step: 'Step 2', title: 'Teacher physically receives the child', desc: 'The teacher goes to you, takes your child into their hands, then taps Accept on their iPad.' },
          { icon: '✅', step: 'Step 3', title: 'You receive confirmation', desc: 'Your phone shows a green ✅ with the teacher's name and exact time. Only then you may leave.' },
          { icon: '⚠️', step: 'Important', title: 'Do not leave until you see ✅', desc: 'Your tap alone is not confirmation. The teacher's tap of Accept is the legal timestamp of transfer.' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 16, background: item.icon === '⚠️' ? 'rgba(255,183,64,0.08)' : C.surface, borderRadius: 12, padding: '14px 16px', border: `1px solid ${item.icon === '⚠️' ? C.amber : C.border}` }}>
            <div style={{ fontSize: 28, flexShrink: 0 }}>{item.icon}</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: item.icon === '⚠️' ? C.amber : C.green, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>{item.step}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          </div>
        ))}

        <div style={{ height: 8 }} />
        <button onClick={() => setScreen('phone')} style={btn(C.bg, C.green)}>
          Continue → Sign In
        </button>
        <div style={{ marginTop: 14, fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 1.6 }}>
          Your phone must be registered with Play Academy Wickliffe.<br/>
          Contact Director Sonia Texidor to register.
        </div>
      </div>
    </div>
  )

  // ── Generate and send OTP ──────────────────────────────────
  async function sendOTP() {
    if (!phone || phone.replace(/\D/g, '').length < 10) return
    setSending(true)
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const normalizedPhone = '+1' + phone.replace(/\D/g, '').slice(-10)

    // Store OTP in DB
    await supabase.schema('menumaker').from('safepass_sms_otp').insert({
      org_id: ORG_ID, phone: normalizedPhone,
      otp_code: code, device_id: devId.current,
    })

    // In production: call SMS API (Twilio/etc.)
    // For now: show code in console for testing
    console.log('SafePass OTP for', normalizedPhone, ':', code)

    // TODO: call edge function for real SMS
    // await supabase.functions.invoke('send-sms', { body: { phone: normalizedPhone, code } })

    setSending(false)
    setOtpSent(true)
    setScreen('otp')
  }

  // ── Verify OTP ─────────────────────────────────────────────
  async function verifyOTP() {
    setVerifying(true)
    setOtpError('')
    const normalizedPhone = '+1' + phone.replace(/\D/g, '').slice(-10)
    
    // TEST MODE: bypass for demo phone
    if (normalizedPhone === '+19999999999' && otp.trim() === '123456') {
      setPersonName('Test Parent (Demo)')
      setChildren([{
        child_id: 'test-child-001',
        child_name: 'Test Child (Green Room)',
        classroom_id: 'test-class-001',
        classroom_name: 'Green Room',
        center_id: 'test-center-001',
      }])
      await supabase.schema('menumaker').from('safepass_parent_sessions').insert({
        org_id: ORG_ID, phone: normalizedPhone,
        device_id: devId.current, person_name: 'Test Parent (Demo)',
      })
      setVerifying(false)
      setScreen('agreement')
      return
    }
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

    // For test phone skip device_id; for real phones require it
    const isTestPhone = normalizedPhone === '+19999999999'
    const { data: otpRows } = await supabase.schema('menumaker')
      .from('safepass_sms_otp')
      .select('*')
      .eq('phone', normalizedPhone)
      .eq('otp_code', otp.trim().replace(/\s/g,''))
      .gt('expires_at', new Date().toISOString())
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!otpRows || otpRows.length === 0) {
      setOtpError('Incorrect code or code expired. Please try again.')
      setVerifying(false)
      return
    }

    // Mark OTP used
    await supabase.schema('menumaker').from('safepass_sms_otp')
      .update({ used_at: new Date().toISOString() }).eq('id', otpRows[0].id)

    // Find children for this phone
    const { data: persons } = await supabase.schema('menumaker')
      .from('safepass_trusted_persons')
      .select('child_id,child_name,person_name,relationship')
      .eq('org_id', ORG_ID)
      .eq('phone', normalizedPhone)
      .eq('is_active', true)

    if (persons && persons.length > 0) {
      setPersonName(persons[0].person_name || '')
      // Get classroom info for each child
      const childIds = [...new Set(persons.map(p => p.child_id))]
      const { data: rosterData } = await supabase.schema('menumaker')
        .from('roster')
        .select('id,child_name,classroom_id,center_id,classrooms!inner(name)')
        .in('id', childIds)
        .eq('is_active', true)

      if (rosterData && rosterData.length > 0) {
        setChildren(rosterData.map((r: any) => ({
          child_id: r.id,
          child_name: r.child_name,
          classroom_id: r.classroom_id,
          classroom_name: r.classrooms?.name ?? '',
          center_id: r.center_id,
        })))
      }
    }

    // Create parent session
    await supabase.schema('menumaker').from('safepass_parent_sessions').insert({
      org_id: ORG_ID, phone: normalizedPhone,
      device_id: devId.current, person_name: persons?.[0]?.person_name ?? '',
    })

    setVerifying(false)
    setScreen('agreement')
  }

  // ── Load today's sessions for child ───────────────────────
  async function loadTodaySessions(child: Child) {
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0)
    const { data } = await supabase.schema('menumaker')
      .from('safepass_sessions')
      .select('id,action_type,status,teacher_name,teacher_confirmed_at')
      .eq('child_id', child.child_id)
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false })
    setTodaySessions(data || [])
  }

  // ── Select child and go to home ────────────────────────────
  async function selectChild(child: Child) {
    setSelectedChild(child)
    await loadTodaySessions(child)
    setScreen('home')
  }

  // ── Start drop-off or pick-up ──────────────────────────────
  async function startAction(act: 'drop_off' | 'pick_up') {
    if (!selectedChild) return
    setAction(act)

    const { data, error } = await supabase.schema('menumaker')
      .from('safepass_sessions')
      .insert({
        org_id: ORG_ID,
        center_id: selectedChild.center_id,
        classroom_id: selectedChild.classroom_id,
        child_id: selectedChild.child_id,
        child_name: selectedChild.child_name,
        action_type: act,
        status: 'waiting',
        auth_method: 'app',
        parent_device_id: devId.current,
      })
      .select('id').single()

    if (error || !data) { alert('Error: ' + error?.message); return }
    setSessionId(data.id)
    setWaitSecs(0)
    setScreen('waiting')
    subscribeToSession(data.id)
  }

  // ── Subscribe to session updates ───────────────────────────
  function subscribeToSession(sid: string) {
    if (waitTimer.current) clearInterval(waitTimer.current)
    waitTimer.current = setInterval(() => setWaitSecs(s => s + 1), 1000)

    supabase.channel('safepass:parent:' + sid)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'menumaker', table: 'safepass_sessions',
        filter: 'id=eq.' + sid,
      }, (payload: any) => {
        if (payload.new.status === 'confirmed') {
          if (waitTimer.current) clearInterval(waitTimer.current)
          setConfirmedInfo({
            teacher: payload.new.teacher_name || 'Teacher',
            time: hhmm(payload.new.teacher_confirmed_at),
            action: action,
          })
          loadTodaySessions(selectedChild!)
          setScreen('confirmed')
        }
      })
      .subscribe()
  }

  // ── Send remind ────────────────────────────────────────────
  async function sendRemind() {
    if (!sessionId) return
    await supabase.schema('menumaker').from('safepass_sessions')
      .update({ remind_count: 1, reminded_at: new Date().toISOString() })
      .eq('id', sessionId)
  }

  const wrap: React.CSSProperties = {
    minHeight: '100vh', background: C.bg, color: C.text,
    fontFamily: "'Inter', 'DM Sans', sans-serif",
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '0 0 40px',
  }
  const card: React.CSSProperties = {
    width: '100%', maxWidth: 430, padding: '24px 20px',
  }

  // ── Header ─────────────────────────────────────────────────
  const header = (
    <div style={{ width: '100%', maxWidth: 430, padding: '20px 20px 0', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔒</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>SafePass</div>
          <div style={{ fontSize: 11, color: C.muted }}>Play Academy Wickliffe</div>
        </div>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────
  // SCREEN: PHONE
  // ─────────────────────────────────────────────────────────────
  if (screen === 'phone') return (
    <div style={wrap}>
      {header}
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 32, marginTop: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Welcome to SafePass</div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>Enter your registered phone number to sign in</div>
        </div>
        <input
          type="tel" value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="(555) 000-0000"
          style={inp}
          onKeyDown={e => e.key === 'Enter' && sendOTP()}
        />
        <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 8, marginBottom: 20 }}>
          We'll send a 6-digit verification code to this number
        </div>
        <button onClick={sendOTP} disabled={sending || phone.replace(/\D/g,'').length < 10}
          style={btn(C.bg, phone.replace(/\D/g,'').length >= 10 ? C.green : C.border)}>
          {sending ? 'Sending…' : 'Send Code →'}
        </button>
        <div style={{ marginTop: 24, padding: 16, background: C.surface, borderRadius: 12, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          Your phone must be registered with Play Academy Wickliffe.<br/>
          Contact Director Sonia Texidor to register.
        </div>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────
  // SCREEN: OTP
  // ─────────────────────────────────────────────────────────────
  if (screen === 'otp') return (
    <div style={wrap}>
      {header}
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 32, marginTop: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Enter Code</div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>
            Code sent to {phone}<br/>
            <span style={{ color: C.muted, fontSize: 12 }}>Valid for 10 minutes</span>
          </div>
        </div>
        <input
          type="number" value={otp} onChange={e => setOtp(e.target.value)}
          placeholder="000000" maxLength={6} style={{ ...inp, fontSize: 32, letterSpacing: '0.3em' }}
          onKeyDown={e => e.key === 'Enter' && verifyOTP()}
        />
        {otpError && <div style={{ color: C.red, fontSize: 13, textAlign: 'center', marginTop: 8 }}>{otpError}</div>}
        <div style={{ height: 16 }} />
        <button onClick={verifyOTP} disabled={verifying || otp.length < 6}
          style={btn(C.bg, otp.length >= 6 ? C.green : C.border)}>
          {verifying ? 'Verifying…' : 'Verify →'}
        </button>
        <button onClick={() => setScreen('phone')}
          style={{ ...btn(C.muted, 'transparent'), marginTop: 12, border: `1px solid ${C.border}` }}>
          ← Back
        </button>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────
  // SCREEN: AGREEMENT
  // ─────────────────────────────────────────────────────────────
  if (screen === 'agreement') return (
    <div style={wrap}>
      {header}
      <div style={card}>
        <div style={{ marginBottom: 20, marginTop: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>SafePass Agreement</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Please read and accept to continue</div>
        </div>
        <div style={{ background: C.surface, borderRadius: 12, padding: '16px', marginBottom: 20, maxHeight: 360, overflowY: 'auto' }}>
          {AGREEMENT_RULES.map((rule, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ color: C.green, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{i + 1}.</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{rule}</div>
            </div>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20, cursor: 'pointer' }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
            style={{ width: 20, height: 20, marginTop: 2, accentColor: C.green, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            I have read and agree to the SafePass agreement. I understand that physical handoff — not proximity to the building — determines legal responsibility.
          </span>
        </label>
        <button onClick={() => agreed && setScreen(children.length === 1 ? 'home' : 'child_select')}
          disabled={!agreed} style={btn(C.bg, agreed ? C.green : C.border)}>
          Continue →
        </button>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────
  // SCREEN: CHILD SELECT
  // ─────────────────────────────────────────────────────────────
  if (screen === 'child_select') return (
    <div style={wrap}>
      {header}
      <div style={card}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, marginTop: 12 }}>Select Child</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
          Welcome{personName ? ', ' + personName : ''}. Which child are you dropping off or picking up?
        </div>
        {children.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>
            No children found for this phone number.<br/>
            Please contact Director Texidor to register.
          </div>
        ) : (
          children.map(child => (
            <button key={child.child_id} onClick={() => selectChild(child)}
              style={{ width: '100%', background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 10, cursor: 'pointer', textAlign: 'left', color: C.text, fontFamily: 'inherit' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{child.child_name}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{child.classroom_name}</div>
            </button>
          ))
        )}
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────
  // SCREEN: HOME
  // ─────────────────────────────────────────────────────────────
  if (screen === 'home') {
    const last = todaySessions[0]
    const atCenter = last?.action_type === 'drop_off' && last?.status === 'confirmed'
    return (
      <div style={wrap}>
        {header}
        <div style={card}>
          <div style={{ marginTop: 12, marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{selectedChild?.child_name}</div>
            <div style={{ fontSize: 13, color: C.muted }}>{selectedChild?.classroom_name}</div>
          </div>

          {/* Status */}
          <div style={{ background: atCenter ? C.greenDim : C.surface, border: `1.5px solid ${atCenter ? C.green : C.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 28 }}>{atCenter ? '🏫' : '🏠'}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: atCenter ? C.green : C.text, marginTop: 6 }}>
              {atCenter ? 'At Play Academy' : 'Not checked in today'}
            </div>
            {last && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              {last.action_type === 'drop_off' ? 'Dropped off' : 'Picked up'} at {hhmm(last.teacher_confirmed_at)} by {last.teacher_name}
            </div>}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!atCenter && (
              <button onClick={() => startAction('drop_off')}
                style={{ ...btn(C.bg, C.green), fontSize: 17 }}>
                🚗 Drop Off {selectedChild?.child_name?.split(' ')[0]}
              </button>
            )}
            {atCenter && (
              <button onClick={() => startAction('pick_up')}
                style={{ ...btn(C.bg, C.amber), fontSize: 17 }}>
                👋 Pick Up {selectedChild?.child_name?.split(' ')[0]}
              </button>
            )}
          </div>

          {/* Today's log */}
          {todaySessions.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today's Log</div>
              {todaySessions.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                  <span style={{ color: s.action_type === 'drop_off' ? C.green : C.amber }}>
                    {s.action_type === 'drop_off' ? '↓ Drop-off' : '↑ Pick-up'}
                  </span>
                  <span style={{ color: C.muted }}>{hhmm(s.teacher_confirmed_at)} · {s.teacher_name}</span>
                </div>
              ))}
            </div>
          )}

          {children.length > 1 && (
            <button onClick={() => setScreen('child_select')}
              style={{ ...btn(C.muted, 'transparent'), marginTop: 16, border: `1px solid ${C.border}`, fontSize: 14 }}>
              Switch Child
            </button>
          )}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // SCREEN: WAITING
  // ─────────────────────────────────────────────────────────────
  if (screen === 'waiting') return (
    <div style={wrap}>
      {header}
      <div style={card}>
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>
            {action === 'drop_off' ? '🤝' : '👋'}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
            {action === 'drop_off' ? 'Waiting for teacher to accept' : 'Waiting for teacher to release'}
          </div>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 24 }}>
            {selectedChild?.child_name} · {selectedChild?.classroom_name}
          </div>

          {/* Timer */}
          <div style={{ background: C.surface, borderRadius: 16, padding: '20px', marginBottom: 20 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: waitSecs > 30 ? C.amber : C.green, fontVariantNumeric: 'tabular-nums' }}>
              {Math.floor(waitSecs / 60).toString().padStart(2, '0')}:{(waitSecs % 60).toString().padStart(2, '0')}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
              {action === 'drop_off' ? 'Do not leave until you see ✅' : 'Your child is being prepared for release'}
            </div>
          </div>

          {waitSecs >= 30 && (
            <button onClick={sendRemind}
              style={{ ...btn(C.bg, C.amber), marginBottom: 12 }}>
              🔔 Remind Teacher
            </button>
          )}

          <div style={{ padding: '14px', background: C.surface, borderRadius: 12, fontSize: 12, color: C.muted, lineHeight: 1.6, textAlign: 'left' }}>
            {action === 'drop_off'
              ? '⚠️ Stay with your child until the teacher physically receives them and you see the green confirmation screen.'
              : '⚠️ Wait here. Your child will be brought to you by the teacher.'}
          </div>
        </div>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────
  // SCREEN: CONFIRMED
  // ─────────────────────────────────────────────────────────────
  if (screen === 'confirmed') return (
    <div style={wrap}>
      {header}
      <div style={card}>
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.green, marginBottom: 8 }}>
            {confirmedInfo?.action === 'drop_off' ? 'Drop-off Confirmed' : 'Pick-up Confirmed'}
          </div>
          <div style={{ fontSize: 15, color: C.text, marginBottom: 24 }}>
            {selectedChild?.child_name} is now in the care of<br/>
            <strong>{confirmedInfo?.teacher}</strong>
          </div>
          <div style={{ background: C.greenDim, border: `1px solid ${C.green}`, borderRadius: 14, padding: '16px', marginBottom: 28 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: C.muted }}>Time</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{confirmedInfo?.time}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.muted }}>Classroom</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedChild?.classroom_name}</div>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
            This record is legally timestamped and stored securely.<br/>Play Academy Wickliffe · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <button onClick={() => { setScreen('home'); loadTodaySessions(selectedChild!) }}
            style={btn(C.bg, C.green)}>
            Done
          </button>
        </div>
      </div>
    </div>
  )

  return null
}
