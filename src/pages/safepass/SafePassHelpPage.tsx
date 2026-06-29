import { useState } from 'react'

const C = {
  bg:'#0f1117', surface:'#1a1d27', surface2:'#22263a', border:'#2e3350',
  text:'#f0f2ff', muted:'#a0a8cc', green:'#00e896', greenDim:'rgba(0,232,150,0.12)',
  amber:'#ffb740', amberDim:'rgba(255,183,64,0.12)', red:'#ff4d6a', blue:'#5b8bff',
}
type S = 'overview'|'regular'|'early'|'late'|'transport'|'rules'

const STEPS = {
  regular:[
    {icon:'1️⃣',title:'Select Your Classroom',desc:'Choose your classroom from the dropdown at the top. The system shows only children enrolled in your class.'},
    {icon:'2️⃣',title:'Wait for Incoming Requests',desc:"When a parent taps Drop Off or Pick Up in their app, the child's name appears in the Incoming Requests panel."},
    {icon:'3️⃣',title:'Physically Receive the Child',desc:'Go to the parent. Take the child physically into your care. The child must be in your hands before you tap Accept.'},
    {icon:'4️⃣',title:'Tap ACCEPT',desc:'Once the child is physically with you, tap ACCEPT. This creates a legal timestamp. The parent receives ✅ on their phone.'},
    {icon:'5️⃣',title:'Pick-Up: Verify the Person',desc:'Check the person is listed as Authorized. If you do not recognize them, request photo ID. If not authorized — do not release, call your director.'},
    {icon:'6️⃣',title:'Hand Over Physically',desc:"Place the child physically into the authorized person's hands. Only then tap RELEASE."},
    {icon:'7️⃣',title:'Tap RELEASE',desc:'Tap RELEASE. The parent receives confirmation. The handoff is legally recorded.'},
  ],
  early:[
    {icon:'1️⃣',title:'Switch to Early Care Mode',desc:'Tap ☀️ Early Care at the top. You will see children from ALL classrooms who arrived before their Lead Teacher.'},
    {icon:'2️⃣',title:'Receive Each Child',desc:'Accept each child normally. Each child shows a timer for how long they have been waiting.'},
    {icon:'3️⃣',title:'Monitor the Ratio',desc:'Ohio minimums apply. Ratio is set by the youngest child present. Yellow = warning. Red = over limit.'},
    {icon:'4️⃣',title:'Transfer to Class',desc:'When a Lead Teacher arrives, tap Transfer to Class for each of their children.'},
    {icon:'5️⃣',title:'Escalate if Needed',desc:'15+ min → tap Call. 45+ min → tap CPS and notify your director immediately.'},
  ],
  late:[
    {icon:'1️⃣',title:'Switch to Late Care Mode',desc:'Tap 🌙 Late Care when closing time has passed and children remain.'},
    {icon:'2️⃣',title:'Shift Cannot Close',desc:'The system blocks shift close while children are present. You are responsible for every child on your screen.'},
    {icon:'3️⃣',title:'15 Minutes — Call Parent',desc:'Call the parent directly. Tap 📞 Call to log this action.'},
    {icon:'4️⃣',title:'30 Minutes — Alert Director',desc:'Tap 📋 Director. Your director contacts the parent and emergency contacts.'},
    {icon:'5️⃣',title:'45 Minutes — Emergency Contacts',desc:'Tap 🚨 911. Director contacts all emergency persons on file.'},
    {icon:'6️⃣',title:'60 Minutes — CPS',desc:'Tap 🚨 CPS. Director initiates Ohio CPS notification. Stay with the child.'},
    {icon:'7️⃣',title:'Parent Arrives',desc:'Tap ✓ Parent Arrived. Verify identity. Hand over child physically. System records the time.'},
  ],
  transport:[
    {icon:'1️⃣',title:'Switch to Transport Mode',desc:"Tap 🚌 Transport to see today's school-age bus runs."},
    {icon:'2️⃣',title:'Point 1 — Center to Driver',desc:'Check each child name before boarding. Tap Boarded for each child.'},
    {icon:'3️⃣',title:'Point 2 — Driver to School',desc:"Driver completes checklist at school drop-off with GPS timestamp. Play Academy responsibility ends at the school's designated drop-off point."},
    {icon:'4️⃣',title:'Point 3 — School to Driver',desc:'School staff confirms children boarding the return vehicle.'},
    {icon:'5️⃣',title:'Point 4 — Driver to Center',desc:'Confirm each child returned. Tap ✓ Confirm All Children Returned to complete the run.'},
  ],
}

const RULES = [
  {title:'Physical handoff only',desc:'Responsibility transfers at physical handoff — not when a parent enters the building. The child must be physically in your hands (Accept) or in their hands (Release) before you tap.'},
  {title:'Never tap in advance',desc:'Do not tap Accept before the child is with you. Do not tap Release before handing the child over. Your tap is your legal signature.'},
  {title:'Unrecognized persons',desc:'Request a government-issued photo ID. If the person is NOT on the authorized list, do not release the child — call your director immediately.'},
  {title:'Unknown phone alert',desc:'If the system flags an unregistered device attempting pick-up, keep the child with you and contact your director.'},
  {title:'Ratio compliance',desc:'Monitor your child count at all times. In Early Care, Ohio minimum ratios apply based on the youngest child present.'},
  {title:'Shift close',desc:'You cannot close your shift while children are present. Every child must be transferred or picked up before your shift ends.'},
]

export default function SafePassHelpPage() {
  const [s, setS] = useState<S>('overview')

  const nb = (v: S, label: string) => (
    <button key={v} onClick={() => setS(v)} style={{
      padding:'10px 20px', borderRadius:20, fontSize:15, fontWeight:600,
      cursor:'pointer', fontFamily:'inherit', border:'none',
      background: s===v ? C.green : C.surface2,
      color: s===v ? C.bg : C.muted,
    }}>{label}</button>
  )

  const sc = (step: {icon:string;title:string;desc:string}, i: number) => (
    <div key={i} style={{ background:C.surface, border:`1.5px solid ${C.border}`, borderRadius:14, padding:'20px 22px', marginBottom:12 }}>
      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
        <div style={{ fontSize:36, flexShrink:0 }}>{step.icon}</div>
        <div>
          <div style={{ fontWeight:700, fontSize:17, color:C.text, marginBottom:6 }}>{step.title}</div>
          <div style={{ fontSize:15, color:C.muted, lineHeight:1.7 }}>{step.desc}</div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'Inter','DM Sans',sans-serif" }}>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'18px 24px', display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:C.green, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🔒</div>
        <div>
          <div style={{ fontWeight:800, fontSize:18, color:C.text }}>SafePass — Teacher Guide</div>
          <div style={{ fontSize:13, color:C.muted }}>Play Academy Wickliffe · Step-by-step instructions</div>
        </div>
        <button onClick={() => window.location.href='/safepass/teacher'}
          style={{ marginLeft:'auto', padding:'12px 24px', borderRadius:10, background:'#1a5c3f', color:'#ffffff', border:'none', cursor:'pointer', fontSize:15, fontFamily:'inherit', fontWeight:700 }}>
          ← Back to SafePass
        </button>
        <button onClick={() => window.print()}
          style={{ padding:'12px 20px', borderRadius:10, background:C.surface2, color:C.muted, border:`1px solid ${C.border}`, cursor:'pointer', fontSize:14, fontFamily:'inherit', marginLeft:8 }}>
          🖨 Print
        </button>
      </div>

      {/* Nav */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', padding:'14px 24px', background:C.surface, borderBottom:`1px solid ${C.border}` }}>
        {nb('overview','📋 Overview')}
        {nb('regular','✅ Regular Day')}
        {nb('early','☀️ Early Care')}
        {nb('late','🌙 Late Care')}
        {nb('transport','🚌 Transport')}
        {nb('rules','⚖️ Rules')}
      </div>

      {/* Content */}
      <div style={{ maxWidth:780, margin:'0 auto', padding:'28px 24px' }}>

        {s === 'overview' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:10 }}>How SafePass Works</div>
            <div style={{ fontSize:16, color:C.muted, marginBottom:28, lineHeight:1.7 }}>
              SafePass records every child transfer with a legal timestamp. Your tap of Accept or Release is your signature. Parents receive instant confirmation on their phones.
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:28 }}>
              {[
                {icon:'✅',mode:'Regular',color:C.green,desc:'Normal daily drop-off and pick-up. Your classroom, your children only.'},
                {icon:'☀️',mode:'Early Care',color:C.amber,desc:'Before classes — duty teacher manages all arriving children across classes.'},
                {icon:'🌙',mode:'Late Care',color:C.blue,desc:'After closing — escalation protocol for delayed parents.'},
                {icon:'🚌',mode:'Transport',color:C.muted,desc:'School-age bus runs — 4 legal transfer points with GPS confirmation.'},
              ].map(m => (
                <div key={m.mode} style={{ background:C.surface, borderRadius:14, padding:'18px 20px', border:`1.5px solid ${C.border}` }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>{m.icon}</div>
                  <div style={{ fontWeight:700, fontSize:16, color:m.color, marginBottom:6 }}>{m.mode}</div>
                  <div style={{ fontSize:14, color:C.muted, lineHeight:1.6 }}>{m.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'rgba(255,77,106,0.08)', border:`1.5px solid ${C.red}`, borderRadius:14, padding:'20px 22px' }}>
              <div style={{ fontWeight:800, fontSize:17, color:C.red, marginBottom:10 }}>⚖️ The One Rule That Never Changes</div>
              <div style={{ fontSize:16, color:C.text, lineHeight:1.7 }}>
                <strong>Responsibility transfers at physical handoff — not at the door.</strong><br/>
                A parent entering the building does not transfer responsibility.<br/>
                <strong>Only the physical handoff + your tap creates the legal transfer.</strong>
              </div>
            </div>
          </div>
        )}

        {s === 'regular' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:6 }}>✅ Regular Day — Drop-Off & Pick-Up</div>
            <div style={{ fontSize:15, color:C.muted, marginBottom:24 }}>Your classroom, your children, one by one.</div>
            {STEPS.regular.map(sc)}
          </div>
        )}

        {s === 'early' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:6 }}>☀️ Early Care Mode</div>
            <div style={{ fontSize:15, color:C.muted, marginBottom:10 }}>Before classes — you receive children from all classrooms.</div>
            <div style={{ background:C.amberDim, border:`1px solid ${C.amber}`, borderRadius:10, padding:'12px 16px', fontSize:14, color:C.amber, marginBottom:22, fontWeight:600 }}>
              ⚠️ Ohio minimum ratios apply in Early Care. Ratio is always set by the youngest child present.
            </div>
            {STEPS.early.map(sc)}
          </div>
        )}

        {s === 'late' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:6 }}>🌙 Late Care Mode</div>
            <div style={{ fontSize:15, color:C.muted, marginBottom:10 }}>Escalation at 15, 30, 45, 60 minutes.</div>
            <div style={{ background:'rgba(255,77,106,0.08)', border:`1px solid ${C.red}`, borderRadius:10, padding:'12px 16px', fontSize:14, color:C.red, marginBottom:22, fontWeight:600 }}>
              🔒 Your shift CANNOT close while children are present. This is required by Ohio law.
            </div>
            {STEPS.late.map(sc)}
          </div>
        )}

        {s === 'transport' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:6 }}>🚌 Transport Mode</div>
            <div style={{ fontSize:15, color:C.muted, marginBottom:10 }}>4 transfer points — every child accounted for at each step.</div>
            <div style={{ background:C.greenDim, border:`1px solid ${C.green}`, borderRadius:10, padding:'12px 16px', fontSize:14, color:C.green, marginBottom:22, fontWeight:600 }}>
              Per Ohio law, Play Academy responsibility ends at the school's designated drop-off point. GPS + checklist = legal proof.
            </div>
            {STEPS.transport.map(sc)}
          </div>
        )}

        {s === 'rules' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:6 }}>⚖️ Rules & Legal Notes</div>
            <div style={{ fontSize:15, color:C.muted, marginBottom:24 }}>Every rule is grounded in Ohio law and Play Academy policy.</div>
            {RULES.map((r, i) => (
              <div key={i} style={{ background:C.surface, border:`1.5px solid ${C.border}`, borderLeft:`5px solid ${C.green}`, borderRadius:14, padding:'18px 20px', marginBottom:12 }}>
                <div style={{ fontWeight:700, fontSize:16, color:C.green, marginBottom:8 }}>{r.title}</div>
                <div style={{ fontSize:15, color:C.muted, lineHeight:1.7 }}>{r.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
