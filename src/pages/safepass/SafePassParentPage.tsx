// SafePassParentPage.tsx — route /safepass/parent (PUBLIC)
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ORG_ID = '3a9a290e-7e49-491e-946b-ad86f2399910'
const DEFAULT_CENTER_ID = '4aed7d5a-00d0-4a4c-ac99-311046ad2027' // Ridge / Wickliffe — fallback when the child's center is unknown
const POLICY_KEY = 'safepass_addendum'
const C = {
  bg:'#0a0c12', surface:'#13161f', surface2:'#1c2030', border:'#252a3d',
  text:'#f0f2ff', muted:'#6b7299', green:'#00e896', greenDim:'rgba(0,232,150,0.1)',
  amber:'#ffb740', amberDim:'rgba(255,183,64,0.1)', red:'#ff4d6a', blue:'#5b8bff',
}
function devId() {
  try {
    let d = sessionStorage.getItem('sp_dev')
    if (!d) { d = 'dev-' + Math.random().toString(36).slice(2); sessionStorage.setItem('sp_dev', d) }
    return d
  } catch { return 'dev-fallback' }
}
type Screen = 'howto'|'phone'|'otp'|'activating'|'agreement'|'child_select'|'home'|'waiting'|'confirmed'
type Child = { child_id:string; child_name:string; classroom_id:string; classroom_name:string; center_id:string }
type Session = { id:string; action_type:string; status:string; teacher_name:string|null; teacher_confirmed_at:string|null }
const hhmm = (iso:string|null) => iso ? new Date(iso).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false}) : '--:--'
const RULES = [
  'Entering the building does not transfer responsibility. My child remains my responsibility until the teacher physically receives them and taps Accept.',
  "Leaving the building does not end the center's responsibility. The center is responsible until the teacher physically releases my child and taps Release.",
  'I must complete the physical handoff in person — I may not leave my child at the door unattended.',
  'I must wait for the green confirmation on my screen before stepping away.',
  "If the teacher doesn't respond within 30 seconds, I use the Remind button and remain present with my child.",
  'All SafePass records are legally valid documents.',
]

export default function SafePassParentPage() {
  const [screen, setScreen] = useState<Screen>('howto')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpErr, setOtpErr] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [personName, setPersonName] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [selectedChild, setSelectedChild] = useState<Child|null>(null)
  const [action, setAction] = useState<'drop_off'|'pick_up'>('drop_off')
  const [sessionId, setSessionId] = useState<string|null>(null)
  const [waitSecs, setWaitSecs] = useState(0)
  const [confirmedInfo, setConfirmedInfo] = useState<{teacher:string;time:string;action:string}|null>(null)
  const [todaySessions, setTodaySessions] = useState<Session[]>([])
  const [agreed, setAgreed] = useState(false)
  const [personId, setPersonId] = useState('')          // normalized phone = parent identity
  const [centerId, setCenterId] = useState(DEFAULT_CENTER_ID)
  const [activePolicy, setActivePolicy] = useState<{ version: string; title: string; body: string|null }|null>(null)
  const [signing, setSigning] = useState(false)
  // A failed write must be LOUD. Silence used to mean "denied" here; now it means
  // nothing at all, and this banner says what did not happen.
  const [fatal, setFatal] = useState('')
  const waitTimer = useRef<ReturnType<typeof setInterval>|null>(null)
  const didAuto = useRef(false)   // codeless deep-link fires once

  const normPhone = (p:string) => '+1' + p.replace(/\D/g,'').slice(-10)

  // The code is issued by staff (safepass_issue_login_code) and given to the parent
  // out of band — never generated in this browser. So "Get Code" just advances to
  // the entry screen; there is nothing to send from here. Real SMS, when it exists,
  // will call the same issue RPC server-side and text the code.
  function sendOTP() {
    if (phone.replace(/\D/g,'').length < 10) return
    setOtpErr('')
    setScreen('otp')
  }

  async function verifyOTP() {
    setVerifying(true); setOtpErr('')
    const np = normPhone(phone)
    const entered = otp.trim().replace(/\D/g,'')
    // Server-side check against the staff-issued code (typed fallback path). Unknown
    // phone and wrong code return the same 'invalid'.
    const { data:v, error:vErr } = await supabase.schema('menumaker')
      .rpc('safepass_verify_login_code', { p_phone: np, p_code: entered })
    if (vErr || !v?.ok) {
      setOtpErr('Incorrect or expired code. Ask Play Academy staff for a new one.')
      setVerifying(false); return
    }
    await continueAfterAuth(np)
  }

  // CODELESS activation (primary path). Staff mints a one-time link (QR) for a ✓Pickup
  // parent; the parent opens it on THEIR phone. Nothing is typed — physical presence is the
  // verification. The token is consumed, the device is trusted, phone_verified is set, then
  // we continue exactly like a verified login.
  async function autoActivate(rawPhone: string, token: string) {
    setScreen('activating'); setOtpErr('')
    const np = normPhone(rawPhone)
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_activate_device', { p_phone: np, p_token: token, p_device_id: devId() })
    if (error || !data?.ok) {
      setPhone(rawPhone.replace(/\D/g,''))
      setOtpErr('This activation link is invalid or expired. Please ask Play Academy staff to activate your phone again.')
      setScreen('phone'); return
    }
    await continueAfterAuth(np)
  }

  // Shared continuation once the phone is authenticated (codeless or typed): load children,
  // gate on the active policy, then route to home / child picker.
  async function continueAfterAuth(np: string) {
    setVerifying(true)
    setPersonId(np)
    // Via RPC, not the table: it resolves the real classroom from roster (anon has no
    // readable roster policy, which is why classroom was hardcoded here before).
    const { data:list, error:listErr } = await supabase.schema('menumaker')
      .rpc('safepass_children_for_phone', { p_phone: np })
    if (listErr || !list?.ok) {
      setOtpErr('Could not load your children. Check your connection.')
      setScreen('otp'); setVerifying(false); return
    }
    setPersonName(list.person_name ?? 'Parent')
    const kids: Child[] = (list.children ?? []).map((p:any) => ({
      child_id: p.child_id, child_name: p.child_name,
      classroom_id: p.classroom_id ?? '', classroom_name: p.classroom_name ?? '—',
      center_id: p.center_id || '',
    }))
    if (kids[0]?.center_id) setCenterId(kids[0].center_id)
    // No silent stand-in child. A phone with no children says so.
    if (kids.length === 0) {
      setOtpErr('This number is not registered for any child. Please see the office.')
      setScreen('otp'); setVerifying(false); return
    }
    setChildren(kids)

    // Policy gate: must have signed the CURRENT ACTIVE addendum version to proceed.
    const { data:pol } = await supabase.schema('menumaker')
      .from('policy_documents').select('version,title,body')
      .eq('key', POLICY_KEY).eq('status', 'active')
      .order('version', { ascending:false }).limit(1)
    const active = pol?.[0] ?? null
    setActivePolicy(active)
    let signed = false
    if (active) {
      const { data:has } = await supabase.schema('menumaker')
        .rpc('safepass_has_signed', { p_org: ORG_ID, p_person_type: 'parent', p_person_id: np, p_key: POLICY_KEY })
      signed = has === true
    }
    setVerifying(false)
    if (signed || !active) proceedAfterAgreement(kids)
    else setScreen('agreement')
  }

  // Codeless deep-link from the staff screen's QR: /safepass/parent?p=<phone>&a=<token>.
  useEffect(() => {
    if (didAuto.current) return
    const q = new URLSearchParams(window.location.search)
    const p = q.get('p'), a = q.get('a')
    if (p && a) { didAuto.current = true; autoActivate(p, a) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Route past the agreement: single child → home, else child picker.
  function proceedAfterAgreement(kids: Child[]) {
    if (kids.length === 1) { setSelectedChild(kids[0]); loadSessions(kids[0]); setScreen('home') }
    else setScreen('child_select')
  }

  // Record consent to the active addendum version, then continue.
  async function acceptAgreement() {
    if (!agreed || signing) return
    setSigning(true)
    if (activePolicy) {
      await supabase.schema('menumaker').rpc('safepass_sign', {
        p_org: ORG_ID, p_center: centerId, p_person_type: 'parent',
        p_person_id: personId, p_person_name: personName || 'Parent',
        p_key: POLICY_KEY, p_signature_method: 'consent', p_device_id: devId(), p_source: 'app',
      })
    }
    setSigning(false)
    proceedAfterAgreement(children)
  }

  // Every write below goes through a SECURITY DEFINER RPC, not the table: anon has
  // no INSERT/UPDATE on safepass_sessions and no readable policy on it. The old
  // direct-table calls could never succeed — and, because none of them bound
  // `error`, a hard permission denial looked exactly like a quiet no-op. Errors are
  // bound here and surfaced in the red banner; a parent must never be left thinking
  // the teacher was notified when nothing was written.
  async function loadSessions(child: Child) {
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_parent_sessions', { p_phone: personId, p_child_id: child.child_id })
    if (error || !data?.ok) { setFatal('Could not load today’s record. Check your connection.'); return }
    setFatal('')
    setTodaySessions((data.sessions ?? []) as Session[])
  }

  async function selectChild(child: Child) {
    setSelectedChild(child); await loadSessions(child); setScreen('home')
  }

  async function startAction(act: 'drop_off'|'pick_up') {
    if (!selectedChild) return
    setAction(act)
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_request_handoff', {
        p_phone: personId, p_child_id: selectedChild.child_id,
        p_action: act, p_device_id: devId(),
      })
    if (error || !data?.ok) {
      setFatal(data?.error === 'no_classroom'
        ? 'Your child is not assigned to a classroom yet. Please see the office.'
        : 'Could not send your request — the teacher has NOT been notified. Try again, or go to the office.')
      return
    }
    setFatal('')
    setSessionId(data.session_id); setWaitSecs(0); setScreen('waiting')
    if (waitTimer.current) clearInterval(waitTimer.current)
    waitTimer.current = setInterval(() => setWaitSecs(s => s+1), 1000)
  }

  // Realtime is impossible for anon here — postgres_changes honours RLS and there is
  // no anon policy on safepass_sessions, so the old channel never fired. Poll the
  // read RPC instead, only while the parent is on the waiting screen.
  useEffect(() => {
    if (screen !== 'waiting' || !sessionId || !selectedChild) return
    let stop = false
    const t = setInterval(async () => {
      const { data, error } = await supabase.schema('menumaker')
        .rpc('safepass_parent_sessions', { p_phone: personId, p_child_id: selectedChild.child_id })
      if (stop || error || !data?.ok) return
      const s = (data.sessions ?? []).find((x: Session) => x.id === sessionId)
      if (s?.status === 'confirmed') {
        if (waitTimer.current) clearInterval(waitTimer.current)
        setConfirmedInfo({ teacher: s.teacher_name || 'Teacher', time: hhmm(s.teacher_confirmed_at), action })
        setTodaySessions((data.sessions ?? []) as Session[])
        setScreen('confirmed')
      }
    }, 3000)
    return () => { stop = true; clearInterval(t) }
  }, [screen, sessionId, selectedChild, personId, action])

  async function remind() {
    if (!sessionId) return
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_remind', { p_phone: personId, p_session_id: sessionId })
    if (error || !data?.ok) setFatal('Could not send the reminder. Stay with your child and go to the office.')
    else setFatal('')
  }

  const W: React.CSSProperties = { minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'Inter',sans-serif", display:'flex', flexDirection:'column', alignItems:'center', padding:'0 0 40px' }
  const CARD: React.CSSProperties = { width:'100%', maxWidth:430, padding:'24px 20px' }
  const BTN = (color:string, bg:string): React.CSSProperties => ({ width:'100%', padding:'16px', borderRadius:12, border:'none', background:bg, color, fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:'inherit' })
  const INP: React.CSSProperties = { width:'100%', padding:'14px 16px', borderRadius:12, border:`1.5px solid ${C.border}`, background:C.surface2, color:C.text, fontSize:18, fontFamily:'inherit', textAlign:'center', boxSizing:'border-box' }

  const HDR = (
    <div style={{width:'100%',maxWidth:430,padding:'20px 20px 0',marginBottom:8}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:36,height:36,borderRadius:10,background:C.green,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🔒</div>
        <div><div style={{fontWeight:800,fontSize:16}}>SafePass</div><div style={{fontSize:11,color:C.muted}}>Play Academy Wickliffe</div></div>
      </div>
      {fatal && (
        <div role="alert" style={{marginTop:12,padding:'12px 14px',borderRadius:12,
          background:'rgba(255,77,106,0.12)',border:`1.5px solid ${C.red}`,
          color:C.red,fontSize:13,fontWeight:600,lineHeight:1.5}}>{fatal}</div>
      )}
    </div>
  )

  if (screen === 'howto') return (
    <div style={W}>{HDR}<div style={CARD}>
      <div style={{textAlign:'center',marginTop:16,marginBottom:24}}>
        <div style={{fontSize:48,marginBottom:10}}>🔒</div>
        <div style={{fontSize:22,fontWeight:800}}>How SafePass Works</div>
        <div style={{fontSize:14,color:C.muted,marginTop:6,lineHeight:1.6}}>Play Academy Wickliffe confirms every drop-off and pick-up with a legal timestamp.</div>
      </div>
      {[
        {icon:'📱',step:'Step 1',title:'You tap Drop Off or Pick Up',desc:'Open this app when you arrive. Tap the button for your child.'},
        {icon:'👩‍🏫',step:'Step 2',title:'Teacher receives the child',desc:'The teacher comes to you, takes your child physically, then taps Accept on their iPad.'},
        {icon:'✅',step:'Step 3',title:'You receive confirmation',desc:'Your screen shows green with the teacher name and exact time. Only then you may leave.'},
        {icon:'⚠️',step:'Important',title:'Do not leave until you see ✅',desc:'Your tap alone is not confirmation. The teacher tap of Accept is the legal timestamp.'},
      ].map((item,i) => (
        <div key={i} style={{display:'flex',gap:14,marginBottom:14,background:item.icon==='⚠️'?C.amberDim:C.surface,borderRadius:12,padding:'14px 16px',border:`1px solid ${item.icon==='⚠️'?C.amber:C.border}`}}>
          <div style={{fontSize:28,flexShrink:0}}>{item.icon}</div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:item.icon==='⚠️'?C.amber:C.green,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>{item.step}</div>
            <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:4}}>{item.title}</div>
            <div style={{fontSize:13,color:C.muted,lineHeight:1.5}}>{item.desc}</div>
          </div>
        </div>
      ))}
      <div style={{height:8}}/>
      <button onClick={()=>setScreen('phone')} style={BTN(C.bg,C.green)}>Continue → Sign In</button>
    </div></div>
  )

  if (screen === 'activating') return (
    <div style={W}>{HDR}<div style={CARD}>
      <div style={{textAlign:'center',marginTop:48}}>
        <div style={{fontSize:48,marginBottom:16}}>🔒</div>
        <div style={{fontSize:20,fontWeight:800}}>Activating this phone…</div>
        <div style={{fontSize:14,color:C.muted,marginTop:8,lineHeight:1.6}}>One moment — setting up SafePass on your device. No code needed.</div>
      </div>
    </div></div>
  )

  if (screen === 'phone') return (
    <div style={W}>{HDR}<div style={CARD}>
      <div style={{textAlign:'center',marginBottom:28,marginTop:20}}>
        <div style={{fontSize:48,marginBottom:12}}>📱</div>
        <div style={{fontSize:22,fontWeight:800}}>Welcome to SafePass</div>
        <div style={{fontSize:14,color:C.muted,marginTop:8}}>Enter your registered phone number</div>
      </div>
      <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(555) 000-0000" style={INP} onKeyDown={e=>e.key==='Enter'&&sendOTP()}/>
      <div style={{fontSize:11,color:C.muted,textAlign:'center',margin:'8px 0 20px'}}>Play Academy staff will give you a 6-digit code</div>
      <button onClick={sendOTP} disabled={phone.replace(/\D/g,'').length<10}
        style={BTN(C.bg,phone.replace(/\D/g,'').length>=10?C.green:C.border)}>
        I have a code →
      </button>
    </div></div>
  )

  if (screen === 'otp') return (
    <div style={W}>{HDR}<div style={CARD}>
      <div style={{textAlign:'center',marginBottom:28,marginTop:20}}>
        <div style={{fontSize:48,marginBottom:12}}>💬</div>
        <div style={{fontSize:22,fontWeight:800}}>Enter Code</div>
        <div style={{fontSize:14,color:C.muted,marginTop:8}}>Enter the 6-digit code Play Academy gave you<br/><span style={{fontSize:12}}>Valid for 15 minutes</span></div>
      </div>
      <input type="number" value={otp} onChange={e=>setOtp(e.target.value)} placeholder="000000"
        style={{...INP,fontSize:32,letterSpacing:'0.3em'}} onKeyDown={e=>e.key==='Enter'&&verifyOTP()}/>
      {otpErr&&<div style={{color:C.red,fontSize:13,textAlign:'center',marginTop:8}}>{otpErr}</div>}
      <div style={{height:16}}/>
      <button onClick={verifyOTP} disabled={verifying||otp.length<6}
        style={BTN(C.bg,otp.length>=6?C.green:C.border)}>{verifying?'Verifying…':'Verify →'}</button>
      <button onClick={()=>setScreen('phone')} style={{...BTN(C.muted,'transparent'),marginTop:12,border:`1px solid ${C.border}`}}>← Back</button>
    </div></div>
  )

  if (screen === 'agreement') return (
    <div style={W}>{HDR}<div style={CARD}>
      <div style={{fontSize:18,fontWeight:800,marginBottom:6,marginTop:12}}>{activePolicy?.title ?? 'SafePass Agreement'}</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
        Please read and accept to continue{activePolicy ? ` · v${activePolicy.version}` : ''}
      </div>
      <div style={{background:C.surface,borderRadius:12,padding:16,marginBottom:16,maxHeight:320,overflowY:'auto'}}>
        {activePolicy?.body && !activePolicy.body.startsWith('[') ? (
          <div style={{fontSize:13,color:C.text,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{activePolicy.body}</div>
        ) : (
          RULES.map((rule,i)=>(
            <div key={i} style={{display:'flex',gap:10,marginBottom:12}}>
              <div style={{color:C.green,fontWeight:700,fontSize:13,flexShrink:0}}>{i+1}.</div>
              <div style={{fontSize:13,color:C.text,lineHeight:1.6}}>{rule}</div>
            </div>
          ))
        )}
      </div>
      <label style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:16,cursor:'pointer'}}>
        <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{width:20,height:20,marginTop:2,accentColor:C.green,flexShrink:0}}/>
        <span style={{fontSize:13,color:C.text,lineHeight:1.6}}>I have read and agree to the SafePass agreement.</span>
      </label>
      <button onClick={acceptAgreement}
        disabled={!agreed||signing} style={BTN(C.bg,agreed&&!signing?C.green:C.border)}>{signing?'Saving…':'Agree & Continue →'}</button>
    </div></div>
  )

  if (screen === 'child_select') return (
    <div style={W}>{HDR}<div style={CARD}>
      <div style={{fontSize:18,fontWeight:800,marginBottom:6,marginTop:12}}>Select Child</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Welcome{personName?', '+personName:''}. Which child?</div>
      {children.map(child=>(
        <button key={child.child_id} onClick={()=>selectChild(child)}
          style={{width:'100%',background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:14,padding:'16px 18px',marginBottom:10,cursor:'pointer',textAlign:'left',color:C.text,fontFamily:'inherit'}}>
          <div style={{fontWeight:700,fontSize:16}}>{child.child_name}</div>
          <div style={{fontSize:12,color:C.muted,marginTop:4}}>{child.classroom_name}</div>
        </button>
      ))}
    </div></div>
  )

  if (screen === 'home') {
    const last = todaySessions[0]
    const atCenter = last?.action_type==='drop_off'&&last?.status==='confirmed'
    return (
      <div style={W}>{HDR}<div style={CARD}>
        <div style={{marginTop:12,marginBottom:20}}>
          <div style={{fontSize:20,fontWeight:800}}>{selectedChild?.child_name}</div>
          <div style={{fontSize:13,color:C.muted}}>{selectedChild?.classroom_name}</div>
        </div>
        <div style={{background:atCenter?C.greenDim:C.surface,border:`1.5px solid ${atCenter?C.green:C.border}`,borderRadius:14,padding:'16px 18px',marginBottom:20,textAlign:'center'}}>
          <div style={{fontSize:28}}>{atCenter?'🏫':'🏠'}</div>
          <div style={{fontWeight:700,fontSize:15,color:atCenter?C.green:C.text,marginTop:6}}>{atCenter?'At Play Academy':'Not checked in today'}</div>
          {last&&<div style={{fontSize:12,color:C.muted,marginTop:4}}>{last.action_type==='drop_off'?'Dropped off':'Picked up'} at {hhmm(last.teacher_confirmed_at)}</div>}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {!atCenter&&<button onClick={()=>startAction('drop_off')} style={{...BTN(C.bg,C.green),fontSize:17}}>🚗 Drop Off</button>}
          {atCenter&&<button onClick={()=>startAction('pick_up')} style={{...BTN(C.bg,C.amber),fontSize:17}}>👋 Pick Up</button>}
        </div>
        {children.length>1&&<button onClick={()=>setScreen('child_select')} style={{...BTN(C.muted,'transparent'),marginTop:14,border:`1px solid ${C.border}`,fontSize:14}}>Switch Child</button>}
      </div></div>
    )
  }

  if (screen === 'waiting') return (
    <div style={W}>{HDR}<div style={CARD}>
      <div style={{textAlign:'center',marginTop:32}}>
        <div style={{fontSize:56,marginBottom:16}}>{action==='drop_off'?'🤝':'👋'}</div>
        <div style={{fontSize:20,fontWeight:800,marginBottom:8}}>{action==='drop_off'?'Waiting for teacher to accept':'Waiting for teacher to release'}</div>
        <div style={{fontSize:14,color:C.muted,marginBottom:20}}>{selectedChild?.child_name}</div>
        <div style={{background:C.surface,borderRadius:16,padding:20,marginBottom:16}}>
          <div style={{fontSize:40,fontWeight:800,color:waitSecs>30?C.amber:C.green}}>
            {Math.floor(waitSecs/60).toString().padStart(2,'0')}:{(waitSecs%60).toString().padStart(2,'0')}
          </div>
          <div style={{fontSize:12,color:C.muted,marginTop:6}}>Do not leave until you see ✅</div>
        </div>
        {waitSecs>=30&&<button onClick={remind} style={{...BTN(C.bg,C.amber),marginBottom:12}}>🔔 Remind Teacher</button>}
      </div>
    </div></div>
  )

  if (screen === 'confirmed') return (
    <div style={W}>{HDR}<div style={CARD}>
      <div style={{textAlign:'center',marginTop:32}}>
        <div style={{fontSize:72,marginBottom:16}}>✅</div>
        <div style={{fontSize:22,fontWeight:800,color:C.green,marginBottom:8}}>{confirmedInfo?.action==='drop_off'?'Drop-off Confirmed':'Pick-up Confirmed'}</div>
        <div style={{fontSize:15,marginBottom:20}}>{selectedChild?.child_name} is in the care of <strong>{confirmedInfo?.teacher}</strong></div>
        <div style={{background:C.greenDim,border:`1px solid ${C.green}`,borderRadius:14,padding:16,marginBottom:24}}>
          <div style={{fontSize:18,fontWeight:800,color:C.green}}>{confirmedInfo?.time}</div>
          <div style={{fontSize:12,color:C.muted,marginTop:4}}>Legally timestamped</div>
        </div>
        <button onClick={()=>{setScreen('home');loadSessions(selectedChild!)}} style={BTN(C.bg,C.green)}>Done</button>
      </div>
    </div></div>
  )

  return null
}
