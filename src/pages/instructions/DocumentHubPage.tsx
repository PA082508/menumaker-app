import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { PARENT_FORMS_URL, SHOWCASE_ORIGIN, storefrontOnlyUrl } from '@/config/showcaseLinks'
import StaffJdOnboarding from './StaffJdOnboarding'

const DOCS = [
  // ── Enrollment ────────────────────────────────────────────────────────────
  // Permanent public link + client-side QR (no external API). URL is centralized
  // in config/showcaseLinks.ts so a move off GitHub Pages is a one-line change.
  { id:'parent-forms', title:'Parent Forms', description:'CACFP enrollment & income-eligibility forms for families. Share the link or QR — opens on any device.', audience:'Parent', category:'Enrollment', parentForms:true, driveUrl:PARENT_FORMS_URL },
  { id:'staff-enrollment', title:'Staff Enrollment', description:'New-hire onboarding (§1–§5). Give the link or QR to a new employee — opens on any device; the office reviews & finalizes.', audience:'Staff', category:'Enrollment', parentForms:true, driveUrl:'https://pa082508.github.io/forms/1-data-sources/Staff_Enrollment_v1.html' },

  // ── BYOD ─────────────────────────────────────────────────────────────────
  { id:'byod-agreement', title:'BYOD Device Use Agreement', description:'Sign online — saved securely. Director countersigns digitally.', audience:'Staff', category:'BYOD', canSign:true, highlight:true },
  { id:'byod-policy', title:'BYOD Policy HR-BYOD-001', description:'Voluntary participation, privacy protections.', audience:'Staff', category:'BYOD', driveUrl:'https://drive.google.com/file/d/1BsJks_GR4oGKtccX6jZX58oOnj2QCZQW/view?usp=sharing' },

  // ── SafePass ──────────────────────────────────────────────────────────────
  { id:'safepass-parent-letter', title:'SafePass — Parent Letter (Wickliffe)', description:'Pilot announcement. Registration July 1–14, mandatory July 15.', audience:'Parent', category:'SafePass', driveUrl:'https://drive.google.com/file/d/1pDFFpKA462Cffs_-AS5rfCMRLk37QkGh/view?usp=sharing' },
  { id:'safepass-parent-app', title:'SafePass — Parent App (Wickliffe)', description:'Wickliffe parents: drop-off and pick-up. Open on your phone.', audience:'Parent', category:'SafePass', driveUrl:'https://menumaker-app.vercel.app/safepass/parent' },
  { id:'safepass-teacher-guide', title:'SafePass — Teacher Quick Guide', description:'iPad guide: drop-off, pick-up, unknown person protocol.', audience:'Teacher', category:'SafePass', driveUrl:'https://drive.google.com/file/d/1XkL64gCrgtLj4e-8nLdG4FSD9S580l1i/view?usp=sharing' },
  { id:'safepass-teacher-app', title:'SafePass — Teacher View (App)', description:'Accept and release children. Early Care, Late Care, Transport modes.', audience:'Teacher', category:'SafePass', driveUrl:'https://menumaker-app.vercel.app/safepass/teacher' },
  { id:'safepass-driver', title:'SafePass — Driver (Transport)', description:'Drivers: school-age bus run checklist. 4 transfer points with GPS.', audience:'Staff', category:'SafePass', driveUrl:'https://menumaker-app.vercel.app/safepass/teacher' },
  { id:'safepass-director', title:'SafePass — Director Dashboard', description:'Monitor all classrooms, ratio alerts, Early Care and Late Care overview.', audience:'Director', category:'SafePass', driveUrl:'https://menumaker-app.vercel.app/safepass/teacher' },
  { id:'safepass-concept', title:'SafePass — Concept Document v1.1', description:'Full concept: legal basis, chain of custody, transportation, school partnership.', audience:'Director', category:'SafePass', driveUrl:'https://drive.google.com/file/d/1Qtg9C47ulJEVwXEGKSku7vdu4KUnrp6G/view?usp=sharing' },

  // ── Meal Count ────────────────────────────────────────────────────────────
  { id:'mc-wickliffe-teacher', title:'Meal Count — Wickliffe Teacher', description:'Wickliffe teachers: record daily meals for your classroom.', audience:'Teacher', category:'Meal Count', driveUrl:'https://menumaker-app.vercel.app/portal/teacher/ridge' },
  { id:'mc-parma-teacher', title:'Meal Count — Parma Heights Teacher', description:'Parma Heights teachers: record daily meals for your classroom.', audience:'Teacher', category:'Meal Count', driveUrl:'https://menumaker-app.vercel.app/portal/teacher/pearl' },
  { id:'mc-mayfield-teacher', title:'Meal Count — Mayfield Hills Teacher', description:'Mayfield Hills teachers: record daily meals for your classroom.', audience:'Teacher', category:'Meal Count', driveUrl:'https://menumaker-app.vercel.app/portal/teacher/alpha' },
  { id:'mc-cook-ridge', title:'Meal Count — Cook (Wickliffe)', description:'Wickliffe cook: Current Meal and Week View with CACFP export.', audience:'Staff', category:'Meal Count', driveUrl:'https://menumaker-app.vercel.app/portal/cook/ridge', helpUrl:'https://menumaker-app.vercel.app/meal-count/help?role=cook' },
  { id:'mc-cook-pearl', title:'Meal Count — Cook (Parma Heights)', description:'Parma Heights cook: Current Meal and Week View with CACFP export.', audience:'Staff', category:'Meal Count', driveUrl:'https://menumaker-app.vercel.app/portal/cook/pearl', helpUrl:'https://menumaker-app.vercel.app/meal-count/help?role=cook' },
  { id:'mc-cook-alpha', title:'Meal Count — Cook (Mayfield Hills)', description:'Mayfield Hills cook: Current Meal and Week View with CACFP export.', audience:'Staff', category:'Meal Count', driveUrl:'https://menumaker-app.vercel.app/portal/cook/alpha', helpUrl:'https://menumaker-app.vercel.app/meal-count/help?role=cook' },
  { id:'mc-director-ridge', title:'Meal Count — Director View (Wickliffe)', description:'Review all classroom counts and approve weekly records.', audience:'Director', category:'Meal Count', driveUrl:'https://menumaker-app.vercel.app/portal/director/ridge' },
  { id:'mc-director-pearl', title:'Meal Count — Director View (Parma Heights)', description:'Review all classroom counts and approve weekly records.', audience:'Director', category:'Meal Count', driveUrl:'https://menumaker-app.vercel.app/portal/director/pearl' },
  { id:'mc-director-alpha', title:'Meal Count — Director View (Mayfield Hills)', description:'Review all classroom counts and approve weekly records.', audience:'Director', category:'Meal Count', driveUrl:'https://menumaker-app.vercel.app/portal/director/alpha' },
  { id:'mc-help', title:'Meal Count — Help', description:'Full guide: teachers, cooks, directors and CACFP rules.', audience:'All', category:'Meal Count', driveUrl:'https://menumaker-app.vercel.app/meal-count/help' },

  // ── Purchases ─────────────────────────────────────────────────────────────
  { id:'receipt-buyer', title:'Purchasing Staff App', description:'Larysa, Philippe, Ross, Tatiana: purchase orders and receipt upload.', audience:'Staff', category:'Purchases', driveUrl:'https://pa082508.github.io/cacfp-receipt/purchasing-app.html' },
  { id:'receipt-director', title:'Director — Receipt Upload', description:'Directors: upload food purchase receipts. Place originals in envelope for delivery driver.', audience:'Director', category:'Purchases', driveUrl:'https://pa082508.github.io/cacfp-receipt/' },
]

function SignModal({ onClose }: { onClose: ()=>void }) {
  const { org } = useOrg()
  const [step, setStep] = useState(1)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refId, setRefId] = useState('')
  const [f, setF] = useState({ name:'', position:'', center:'', device:'', phone:'' })
  const set = (k:string, v:string) => setF(p=>({...p,[k]:v}))

  const canvasRef = (node: HTMLCanvasElement|null) => {
    if (!node) return
    const ctx = node.getContext('2d')!
    ctx.strokeStyle='#1a5c3f'; ctx.lineWidth=2.5; ctx.lineCap='round'
  }

  const [canvas, setCanvas] = useState<HTMLCanvasElement|null>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)

  function getPos(e:any, c:HTMLCanvasElement) {
    const r=c.getBoundingClientRect()
    if(e.touches) return {x:(e.touches[0].clientX-r.left)*(c.width/r.width),y:(e.touches[0].clientY-r.top)*(c.height/r.height)}
    return {x:(e.clientX-r.left)*(c.width/r.width),y:(e.clientY-r.top)*(c.height/r.height)}
  }

  async function submit() {
    if(!canvas||!hasSig) return
    setBusy(true)
    const sig = canvas.toDataURL('image/png')
    const { data, error } = await supabase.schema('menumaker').from('byod_signatures')
      .insert({ org_id:org?.id, employee_name:f.name, employee_position:f.position, center_name:f.center, device_make_model:f.device, phone_number:f.phone, employee_signature:sig, status:'pending_director' })
      .select('id').single()
    if(error){ alert('Error: '+error.message); setBusy(false); return }
    setRefId(data.id.slice(0,8).toUpperCase()); setStep(4); setBusy(false)
  }

  const overlay: React.CSSProperties = {position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',overflowY:'auto',padding:'20px 12px'}
  const modal: React.CSSProperties = {background:'#fff',borderRadius:16,width:'100%',maxWidth:520,boxShadow:'0 24px 80px rgba(0,0,0,0.25)'}
  const hdr: React.CSSProperties = {background:'#1a5c3f',color:'#fff',padding:'16px 20px',borderRadius:'16px 16px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}
  const inp: React.CSSProperties = {width:'100%',padding:'10px 12px',border:'1.5px solid #e5e7eb',borderRadius:8,fontSize:14,fontFamily:'inherit',marginTop:4}
  const pb = (ok:boolean):React.CSSProperties => ({width:'100%',padding:13,background:ok?'#1a5c3f':'#9ca3af',color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:600,cursor:ok?'pointer':'not-allowed',fontFamily:'inherit',marginTop:12})

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={hdr}>
          <div><div style={{fontWeight:700,fontSize:16}}>BYOD Device Use Agreement</div><div style={{fontSize:12,opacity:0.8}}>Play Academy Inc. — Online Signing</div></div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'#fff',borderRadius:8,padding:'6px 12px',cursor:'pointer'}}>✕</button>
        </div>
        <div style={{display:'flex',borderBottom:'1px solid #f0f0f0'}}>
          {['Info','Agreement','Sign','Done'].map((s,i)=>(
            <div key={i} style={{flex:1,textAlign:'center',padding:'10px 4px',fontSize:11,fontWeight:600,color:step===i+1?'#1a5c3f':step>i+1?'#059669':'#9ca3af',borderBottom:`3px solid ${step===i+1?'#1a5c3f':step>i+1?'#059669':'transparent'}`}}>
              <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:18,height:18,borderRadius:'50%',marginRight:4,fontSize:10,background:step===i+1?'#1a5c3f':step>i+1?'#059669':'#e5e7eb',color:step>=i+1?'#fff':'#9ca3af'}}>{step>i+1?'✓':i+1}</span>{s}
            </div>
          ))}
        </div>
        <div style={{padding:20}}>
          {step===1 && <div>
            {[{k:'name',l:'Full Name',p:'First Last',t:'text'},{k:'position',l:'Position',p:'e.g. Lead Teacher',t:'text'},{k:'device',l:'Device Make / Model',p:'e.g. iPhone 15',t:'text'},{k:'phone',l:'Phone Number',p:'(555) 000-0000',t:'tel'}].map(({k,l,p,t})=>(
              <div key={k} style={{marginBottom:12}}>
                <label style={{fontSize:12,fontWeight:600,color:'#374151'}}>{l} *</label>
                <input type={t} value={(f as any)[k]} onChange={e=>set(k,e.target.value)} placeholder={p} style={inp}/>
              </div>
            ))}
            <div style={{marginBottom:12}}>
              <label style={{fontSize:12,fontWeight:600,color:'#374151'}}>Center *</label>
              <select value={f.center} onChange={e=>set('center',e.target.value)} style={inp}>
                <option value="">Select...</option>
                <option>Play Academy Wickliffe</option>
                <option>Play Academy Parma Heights</option>
                <option>Play Academy Mayfield Hills</option>
              </select>
            </div>
            <button onClick={()=>{if(!f.name||!f.position||!f.center||!f.device||!f.phone){alert('Fill all fields');return}setStep(2)}} style={pb(true)}>Continue →</button>
          </div>}
          {step===2 && <div>
            <div style={{height:260,overflowY:'auto',border:'1px solid #d1fae5',borderRadius:10,padding:14,fontSize:13,lineHeight:1.7,background:'#f8faf8',marginBottom:14}}>
              <p><strong>Play Academy Inc. BYOD Device Use Agreement</strong></p>
              <p style={{marginTop:10}}><strong>Art.1 Purpose.</strong> Employee voluntarily uses personal device for SafePass and authorized apps. App works ONLY on registered authorized devices.</p>
              <p style={{marginTop:10}}><strong>Art.2 Obligations.</strong> Keep device charged; enable screen lock; not share credentials; report loss immediately; allow app removal upon termination.</p>
              <p style={{marginTop:10}}><strong>Art.3 Company Limits.</strong> Play Academy will NOT access personal content. Work data on Company servers only.</p>
              <p style={{marginTop:10}}><strong>Art.4 Confidentiality.</strong> All child data is confidential. No disclosure to unauthorized persons.</p>
              <p style={{marginTop:10}}><strong>Art.5 Termination.</strong> Either party may terminate. Employee: written notice. Company: immediately upon violation.</p>
              <p style={{marginTop:10}}><strong>Art.6 Governing Law.</strong> Ohio law. Cuyahoga County courts.</p>
              <p style={{marginTop:10}}><strong>Art.7 Push Notifications.</strong> Employee consents to receive work-related Push Notifications through the Play Academy app on their personal device. Notifications may include: CACFP meal count alerts, SafePass child handoff events, schedule reminders, and urgent messages from management. Employee may not disable work notifications during scheduled work hours.</p>
            </div>
            <div style={{display:'flex',gap:10,padding:12,background:'#f0f7f4',borderRadius:8,marginBottom:12}}>
              <input type="checkbox" id="ag" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{width:18,height:18,accentColor:'#1a5c3f'}}/>
              <label htmlFor="ag" style={{fontSize:13,cursor:'pointer'}}>I have read and voluntarily agree to the BYOD Agreement.</label>
            </div>
            <button onClick={()=>setStep(3)} disabled={!agreed} style={pb(agreed)}>Continue to Signature →</button>
            <button onClick={()=>setStep(1)} style={{width:'100%',padding:10,background:'none',border:'none',color:'#6b7280',cursor:'pointer',marginTop:4}}>← Back</button>
          </div>}
          {step===3 && <div>
            <p style={{fontSize:13,color:'#6b7280',marginBottom:12}}>Sign below using finger (mobile) or mouse (desktop).</p>
            <canvas
              ref={node=>{setCanvas(node);if(node){const ctx=node.getContext('2d')!;ctx.strokeStyle='#1a5c3f';ctx.lineWidth=2.5;ctx.lineCap='round'}}}
              width={480} height={140}
              style={{width:'100%',height:140,border:`2px ${hasSig?'solid #1a5c3f':'dashed #d1fae5'}`,borderRadius:10,background:'#fafff9',cursor:'crosshair',touchAction:'none',display:'block'}}
              onMouseDown={e=>{if(!canvas)return;setDrawing(true);const p=getPos(e,canvas);const ctx=canvas.getContext('2d')!;ctx.beginPath();ctx.moveTo(p.x,p.y)}}
              onMouseMove={e=>{if(!drawing||!canvas)return;const p=getPos(e,canvas);const ctx=canvas.getContext('2d')!;ctx.lineTo(p.x,p.y);ctx.stroke();setHasSig(true)}}
              onMouseUp={()=>setDrawing(false)} onMouseLeave={()=>setDrawing(false)}
              onTouchStart={e=>{e.preventDefault();if(!canvas)return;setDrawing(true);const p=getPos(e,canvas);const ctx=canvas.getContext('2d')!;ctx.beginPath();ctx.moveTo(p.x,p.y)}}
              onTouchMove={e=>{e.preventDefault();if(!drawing||!canvas)return;const p=getPos(e,canvas);const ctx=canvas.getContext('2d')!;ctx.lineTo(p.x,p.y);ctx.stroke();setHasSig(true)}}
              onTouchEnd={()=>setDrawing(false)}
            />
            <div style={{display:'flex',gap:8,marginTop:8,alignItems:'center'}}>
              <button onClick={()=>{if(canvas){canvas.getContext('2d')!.clearRect(0,0,480,140);setHasSig(false)}}} style={{padding:'6px 14px',fontSize:12,borderRadius:6,background:'#f3f4f6',border:'none',cursor:'pointer'}}>Clear</button>
              <span style={{fontSize:11,color:hasSig?'#059669':'#9ca3af'}}>{hasSig?'✓ Captured':'Sign above'}</span>
            </div>
            <div style={{marginTop:12,padding:12,background:'#f8faf8',borderRadius:8,fontSize:12,color:'#6b7280'}}>
              <strong>Date:</strong> {new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
            </div>
            <button onClick={submit} disabled={!hasSig||busy} style={pb(hasSig&&!busy)}>{busy?'Submitting...':'Submit Agreement ✓'}</button>
            <button onClick={()=>setStep(2)} style={{width:'100%',padding:10,background:'none',border:'none',color:'#6b7280',cursor:'pointer',marginTop:4}}>← Back</button>
          </div>}
          {step===4 && <div style={{textAlign:'center',padding:'16px 0'}}>
            <div style={{fontSize:52,marginBottom:12}}>✅</div>
            <h2 style={{color:'#1a5c3f',marginBottom:8}}>Agreement Signed!</h2>
            <p style={{color:'#6b7280',fontSize:13}}>Saved securely. Your director will countersign shortly.</p>
            <div style={{background:'#f0f7f4',borderRadius:10,padding:16,margin:'16px 0',textAlign:'left',fontSize:13}}>
              <div><strong>Employee:</strong> {f.name}</div>
              <div><strong>Center:</strong> {f.center}</div>
              <div><strong>Reference ID:</strong> {refId}</div>
              <div><strong>Signed:</strong> {new Date().toLocaleString('en-US')}</div>
            </div>
            <button onClick={onClose} style={pb(true)}>Close</button>
          </div>}
        </div>
      </div>
    </div>
  )
}

// Client-side QR (qrcode.react → <canvas>, no external API). The canvas is
// rendered at high resolution and displayed scaled down, so Download PNG / Print
// stay crisp. Used by the "Parent Forms" card.
function ParentFormsQR({ url, title='Parent Forms', onClose }: { url: string; title?: string; onClose: ()=>void }) {
  const boxRef = useRef<HTMLDivElement>(null)

  const getCanvas = () => boxRef.current?.querySelector('canvas') as HTMLCanvasElement | null

  function downloadPng() {
    const c = getCanvas(); if (!c) return
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = 'parent-forms-qr.png'
    a.click()
  }

  function print() {
    const c = getCanvas(); if (!c) return
    const dataUrl = c.toDataURL('image/png')
    const w = window.open('', '_blank', 'width=480,height=640')
    if (!w) return
    w.document.write(
      `<html><head><title>${title} — QR</title></head>` +
      `<body style="margin:0;font-family:sans-serif;text-align:center;padding:40px">` +
      `<h2 style="color:#0a3320;margin:0 0 6px">${title}</h2>` +
      `<p style="color:#6b7280;font-size:13px;margin:0 0 20px">Scan to open on any device</p>` +
      `<img src="${dataUrl}" style="width:300px;height:300px" onload="window.focus();window.print();window.close()"/>` +
      `<p style="color:#374151;font-size:12px;margin-top:16px;word-break:break-all">${url}</p>` +
      `</body></html>`
    )
    w.document.close()
  }

  const btn: React.CSSProperties = { flex:1, padding:'9px 12px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', border:'none' }

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div onClick={(e:any)=>e.stopPropagation()} style={{background:'#fff',borderRadius:16,padding:32,maxWidth:320,width:'100%',textAlign:'center',boxShadow:'0 24px 80px rgba(0,0,0,0.25)'}}>
        <div style={{fontSize:14,fontWeight:600,color:'#0a3320',marginBottom:4}}>{title}</div>
        <div style={{fontSize:12,color:'#6b7280',marginBottom:18}}>Scan to open on any device</div>
        <div ref={boxRef} style={{display:'inline-block',padding:10,borderRadius:8,border:'1px solid #e5e7eb',background:'#fff'}}>
          <QRCodeCanvas value={url} size={512} level="M" marginSize={2} style={{width:200,height:200}} />
        </div>
        <div style={{display:'flex',gap:8,marginTop:18}}>
          <button onClick={downloadPng} style={{...btn,background:'#0f4c35',color:'#fff'}}>↓ Download PNG</button>
          <button onClick={print} style={{...btn,background:'#f0f7f4',color:'#1a5c3f',border:'1px solid #d1fae5'}}>🖨 Print</button>
        </div>
        <button onClick={onClose} style={{marginTop:12,padding:'8px 24px',borderRadius:8,background:'#f3f4f6',color:'#374151',border:'none',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Close</button>
      </div>
    </div>
  )
}

// Append ?center=<slug> so a shared enrollment/parent/staff form is pre-scoped to
// one center — a parent never picks a center ("формы не обезличены"). Applied to
// the center-scoped form docs; org-view admin (no active center) leaves links
// generic (they scope by picking a center in the header switcher).
function scopeToCenter(url: string, slug: string | null | undefined): string {
  if (!slug) return url
  return url + (url.includes('?') ? '&' : '?') + 'center=' + encodeURIComponent(slug)
}

// ── Library reorg (docs/document-library-structure-final.md): 4 registry-driven
// sections + a "New Period" campaign tab. Sections 1-2 + the §4 forms are driven
// by enroll-registry.json (version + live/dark), never a hand-kept list.
type RegForm = { current?: string | null; versions?: Record<string, string>; fallbackUrl?: string; title?: string }
type Registry = { forms?: Record<string, RegForm> }

const FORM_LABELS: Record<string, string> = {
  dcy_01234: 'Child Enrollment & Health (DCY 01234)',
  dcy_01236: 'Care Plan — Special Needs (DCY 01236)',
  dcy_01217: 'Medication Administration (DCY 01217)',
  dcy_01305: 'Child Medical Statement (DCY 01305)',
  enroll: 'CACFP Enrollment', iea: 'Income Eligibility Application (IEA)',
  usda_waiver: 'USDA Waiver', fluid_milk: 'Fluid Milk Substitution',
  special_diet: 'Special Diet Statement', infant_meals: 'Infant Meals Preference',
  parent_consent: 'Parent Consent for E-Signatures', staff: 'Staff Enrollment',
}
const SEC1 = ['dcy_01234', 'dcy_01236', 'dcy_01217', 'dcy_01305', 'dcy_01218', 'dcy_01225', 'dcy_01226', 'center_parent_information']
const SUTQ_DOCS = ['sutq_family_needs_survey']
const SEC2 = ['enroll', 'iea', 'usda_waiver', 'fluid_milk', 'special_diet', 'infant_meals']
const SEC4_FORMS = ['parent_consent', 'staff']
const OUR_DOCS = ['child_release_authorization', 'parent_responsibilities', 'topical_product_consent', 'transition_into_program', 'building_for_the_future', 'what_to_bring_infant', 'parents_book', 'wic_information', 'start_form']
const CLAIM_EXPORTS = [
  { label: 'Meal counts / attendance (checkmarks)', to: '/reports', note: 'The checkmark export — protected till Oct 1.' },
  { label: 'Menu', to: '/menu/current' },
  { label: 'Purchases / receipts', to: '/purchases' },
  { label: 'F/R/P registry', to: '/submissions?type=income' },
]
// Package scenarios (named doc-set presets) driving the campaign generator.
const SCENARIOS = [
  { id: 'enroll_full', label: 'Child enrollment — full packet', keys: ['parent_consent', 'dcy_01234', 'enroll', 'iea'] },
  { id: 'renewal',     label: 'Renewal (CACFP + IEA)',          keys: ['enroll', 'iea'] },
  { id: 'consent',     label: 'Single — Parent Consent',        keys: ['parent_consent'] },
  { id: 'employee',    label: 'Employee — Staff Enrollment',    keys: ['staff'] },
]

const pill = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color: fg })
const cardS: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 96 }
const openBtnS: React.CSSProperties = { flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#0f4c35', color: '#fff', textDecoration: 'none', textAlign: 'center', fontFamily: 'inherit' }
const ghostS: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, fontSize: 13, background: '#f0f7f4', color: '#1a5c3f', border: '1px solid #d1fae5', cursor: 'pointer', fontFamily: 'inherit' }
// Library palette: per-card Open is a GHOST (the ONE solid fill on screen is the
// storefront "Open packet ↗" CTA); QR is a compact icon, not the word "QR".
const openGhostS: React.CSSProperties = { flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#f0f7f4', color: '#1a5c3f', border: '1px solid #d1fae5', textDecoration: 'none', textAlign: 'center', fontFamily: 'inherit' }
const qrIconBtnS: React.CSSProperties = { padding: '6px 9px', borderRadius: 8, background: '#fff', color: '#1a5c3f', border: '1px solid #d1fae5', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 0, display: 'inline-flex', alignItems: 'center', flex: '0 0 auto' }
const QRGlyph = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path fill="#1a5c3f" d="M1 1h5v5H1V1zm1 1v3h3V2H2zm8-1h5v5h-5V1zm1 1v3h3V2h-3zM1 10h5v5H1v-5zm1 1v3h3v-3H2zm7-1h2v2H9v-2zm4 0h2v2h-2v-2zm-4 3h2v2H9v-2zm2 1h2v2h-2v-2z"/></svg>
)

export default function DocumentHubPage() {
  const { org, currentCenter, isOrgAdmin } = useOrg()
  const [tab, setTab] = useState<'library' | 'newperiod'>('library')
  const [reg, setReg] = useState<Registry | null>(null)
  const [signOpen, setSignOpen] = useState(false)
  const [qrShare, setQrShare] = useState<{ url: string; title: string } | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [scenario, setScenario] = useState('enroll_full')

  useEffect(() => { fetch('/enroll-registry.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(setReg).catch(() => {}) }, [])
  useEffect(() => {
    if (!org?.id) return
    supabase.schema('menumaker').from('byod_signatures').select('id', { count: 'exact', head: true }).eq('org_id', org.id).then(({ count: c }) => setCount(c))
  }, [org?.id, signOpen])

  const slug = currentCenter?.slug

  function resolve(key: string) {
    const f = reg?.forms?.[key]
    const cur = f?.current
    const url = (cur && f?.versions?.[cur]) || f?.fallbackUrl || (f?.versions ? Object.values(f.versions)[0] : null) || null
    return { url, version: cur || (f?.versions ? Object.keys(f.versions)[0] : null), live: !!cur, title: FORM_LABELS[key] || f?.title || key,
             kind: (f as any)?.kind as string | undefined, futureFormKit: !!(f as any)?.futureFormKit }
  }

  function FormCard({ keyId }: { keyId: string }) {
    const { url: raw, version, live, title, kind, futureFormKit } = resolve(keyId)
    const url = raw && raw !== 'PENDING' ? raw : null      // versions:{v1:'PENDING'} → no live asset yet
    const isDoc = kind === 'document'
    const isKeep = kind === 'keep'                          // Keep-doc: download/print, no signature
    // Always center-scope, like the storefront's Keep card does (parent-forms.html
    // uses scoped(url) for every kind). A ?center= is inert on a PDF/docx, but our own
    // Keep documents are center-aware HTML: the WIC flyer resolves its per-center point
    // of contact — an Ohio CACFP requirement — from ?center=, and Download/Print here
    // was handing it a bare URL, so the card fell back to the org-level line.
    const fileUrl = url ? scopeToCenter(url, slug) : null
    // Library QR standard: the storefront only= card (never a raw file URL), through the
    // shared helper — this line used to build the URL itself and dropped `center=` when
    // no centre was active (Organization mode), so the scan hit the storefront's gate.
    // No centre → NO QR: a code that dead-ends is worse than no code, because a director
    // hands it to a family before anyone scans it.
    const onlyLink = slug ? storefrontOnlyUrl(slug, keyId) : null
    return (
      <div style={cardS}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15.5, fontWeight: 700, color: '#0a3320', letterSpacing: '-0.01em' }}>{title}</span>
          {isKeep && <span style={pill('#eaf5ef', '#0f4c35')}>Keep</span>}
          {version && <span style={pill('#eef2ff', '#3730a3')}>{version}</span>}
          {!isKeep && <span style={live ? pill('#dcfce7', '#166534') : pill('#fef3c7', '#92400e')}>{live ? '● live' : '○ dark'}</span>}
          {futureFormKit && <span title="Signature form — planned as an online form-kit form later" style={pill('#f3e8ff', '#6b21a8')}>form-kit planned</span>}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
          {!fileUrl ? (
            <span style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Coming soon</span>
          ) : isKeep ? (
            <>
              <a href={fileUrl} download style={openGhostS}>↓ Download</a>
              <a href={fileUrl} target="_blank" rel="noreferrer" style={ghostS}>Print</a>
              {onlyLink && <button style={qrIconBtnS} title="Show QR code" aria-label="Show QR code" onClick={() => setQrShare({ url: onlyLink, title })}><QRGlyph /></button>}
            </>
          ) : (
            <>
              <a href={fileUrl} target="_blank" rel="noreferrer" style={openGhostS}>{isDoc ? 'Open / download ↗' : 'Open ↗'}</a>
              {/* QR = the storefront only= card, same as the Keep branch above — a scan
                  must follow registry `current`, never the file live when it printed. */}
              {onlyLink && <button style={qrIconBtnS} title="Show QR code" aria-label="Show QR code" onClick={() => setQrShare({ url: onlyLink, title })}><QRGlyph /></button>}
            </>
          )}
        </div>
      </div>
    )
  }

  function SectionHead({ num, title, desc }: { num: number; title: string; desc: string }) {
    return (
      <div style={{ margin: '26px 0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{num}</span>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0a3320', margin: 0 }}>{title}</h2>
        </div>
        <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 4, marginLeft: 34 }}>{desc}</div>
      </div>
    )
  }

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }
  const guides = DOCS.filter(d => !(d as any).parentForms)  // enrollment forms now live in the sections
  const storefront = slug ? `${SHOWCASE_ORIGIN}/parent-forms.html?center=${encodeURIComponent(slug)}` : PARENT_FORMS_URL
  const tabBtn = (on: boolean): React.CSSProperties => ({ padding: '8px 16px', borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: on ? '1.5px solid #0f4c35' : '1.5px solid #e5e7eb', background: on ? '#0f4c35' : '#fff', color: on ? '#fff' : '#374151' })

  return (
    <div style={{ padding: '28px 24px', fontFamily: "'DM Sans',sans-serif", maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4 }}>DOCUMENTS & GUIDES</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0a3320', margin: 0 }}>Library</h1>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Enrollment & CACFP forms, claim exports and our documents — download, print, share via QR, or sign online.</p>
      </div>

      {/* Tabs: Library sections vs the New Period campaign panel */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={tabBtn(tab === 'library')} onClick={() => setTab('library')}>📚 Library</button>
        <button style={tabBtn(tab === 'newperiod')} onClick={() => setTab('newperiod')}>🗓️ New Period 2026-27</button>
      </div>

      {/* Center scope */}
      {currentCenter ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 4, fontSize: 13, color: '#166534' }}>
          <span style={{ fontWeight: 700 }}>📍 {currentCenter.name}</span>
          <span style={{ color: '#15803d' }}>— form links & QR carry <code style={{ background: '#dcfce7', padding: '1px 5px', borderRadius: 4 }}>?center={currentCenter.slug}</code>, so families never pick a center.</span>
        </div>
      ) : isOrgAdmin ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 4, fontSize: 13, color: '#92400e' }}>
          Organization view — pick a center in the header switcher to scope links & QR. Editing packet composition and the document registry is admin-only.
        </div>
      ) : null}

      {tab === 'library' ? (
        <>
          {/* §1 Ohio DCY */}
          <SectionHead num={1} title="Ohio DCY" desc="The state childcare-licensing packet. DCY 01234 is the trigger form; 01236 / 01217 are physician-signed conditionals." />
          <div style={grid}>{SEC1.map(k => <FormCard key={k} keyId={k} />)}</div>
          <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: '#0a3320', marginLeft: 34, marginBottom: 8 }}>↳ Step Up To Quality (SUTQ)</div>
          <div style={{ ...grid, marginLeft: 34 }}>{SUTQ_DOCS.map(k => <FormCard key={k} keyId={k} />)}</div>

          {/* §2 CACFP */}
          <SectionHead num={2} title="CACFP — participation forms" desc="The food-program forms families and officials fill." />
          <div style={{ ...cardS, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0a3320' }}>Parent packet — one page</div>
              <div style={{ fontSize: 12, color: '#15803d' }}>All CACFP + enrollment forms for {currentCenter?.name ?? 'the selected center'}, pre-scoped. Best link to text or email.</div>
            </div>
            <a href={storefront} target="_blank" rel="noreferrer" style={{ ...openBtnS, flex: 'none', padding: '8px 16px' }}>Open packet ↗</a>
            <button style={qrIconBtnS} title="Show QR code" aria-label="Show QR code" onClick={() => setQrShare({ url: storefront, title: 'Parent packet' })}><QRGlyph /></button>
          </div>
          <div style={grid}>{SEC2.map(k => <FormCard key={k} keyId={k} />)}</div>

          {/* §3 Claim results */}
          <SectionHead num={3} title="Claim results" desc="Generated exports that feed a monthly claim — not blank forms." />
          <div style={grid}>
            {CLAIM_EXPORTS.map(x => (
              <Link key={x.label} to={x.to} style={{ ...cardS, textDecoration: 'none' }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: '#0a3320', letterSpacing: '-0.01em' }}>{x.label}</div>
                {x.note && <div style={{ fontSize: 11, color: '#6b7280' }}>{x.note}</div>}
                <div style={{ marginTop: 'auto', fontSize: 13, fontWeight: 600, color: '#0f4c35' }}>Open →</div>
              </Link>
            ))}
            <Link to="/claim-report" style={{ ...cardS, textDecoration: 'none', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: '#0a3320', letterSpacing: '-0.01em' }}>📦 Month claim-packet</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>Assemble the period's claim outputs.</div>
              <div style={{ marginTop: 'auto', fontSize: 13, fontWeight: 600, color: '#0f4c35' }}>Build →</div>
            </Link>
          </div>

          {/* §4 Our documents */}
          <SectionHead num={4} title="Our documents" desc="Play Academy's own documents, staff onboarding, guides and QR cards." />
          <div style={{ ...grid, marginBottom: 14 }}>
            {SEC4_FORMS.map(k => <FormCard key={k} keyId={k} />)}
            {OUR_DOCS.map(k => <FormCard key={k} keyId={k} />)}
            <Link to="/instructions" style={{ ...cardS, textDecoration: 'none', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: '#0a3320', letterSpacing: '-0.01em' }}>📖 Instructions</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>How every feature works — filtered by your role.</div>
              <div style={{ marginTop: 'auto', fontSize: 13, fontWeight: 600, color: '#0f4c35' }}>Open →</div>
            </Link>
          </div>

          {/* Staff onboarding (in-app sign surface) + legacy BYOD self-service */}
          <StaffJdOnboarding />
          <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 12, padding: '14px 18px', margin: '16px 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ color: '#334155', fontWeight: 700, fontSize: 15.5, letterSpacing: '-0.01em' }}>📱 BYOD — existing staff self-service</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>Temporarily unavailable. New hires: use <strong>Staff Onboarding</strong> above.{count !== null && ` · ${count} on file`}</div>
            </div>
            <button disabled title="Temporarily unavailable" style={{ padding: '9px 18px', background: '#e2e8f0', color: '#94a3b8', border: '1px solid #cbd5e1', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'not-allowed', fontFamily: 'inherit' }}>Temporarily unavailable</button>
          </div>

          {/* Guides & portals — operational links (preserved from the flat hub) */}
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0a3320', margin: '4px 0 10px' }}>Guides & portals</div>
          <div style={grid}>
            {guides.map(doc => (
              <div key={doc.id} style={cardS}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>{doc.category}</span>
                  <span style={pill('#f3f4f6', '#374151')}>{doc.audience}</span>
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: '#0a3320', letterSpacing: '-0.01em' }}>{doc.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.45 }}>{doc.description}</div>
                <div style={{ marginTop: 'auto' }}>
                  {(doc as any).canSign ? (
                    <div>
                      <button disabled title="Temporarily unavailable" style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#e5e7eb', color: '#9ca3af', border: 'none', cursor: 'not-allowed', fontFamily: 'inherit' }}>Temporarily unavailable</button>
                    </div>
                  ) : (doc as any).driveUrl ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <a href={(doc as any).driveUrl} target="_blank" rel="noreferrer" style={openGhostS}>↓ Open</a>
                      <button style={qrIconBtnS} title="Show QR code" aria-label="Show QR code" onClick={() => setQrShare({ url: (doc as any).driveUrl, title: doc.title })}><QRGlyph /></button>
                    </div>
                  ) : <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Coming soon</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* ── New Period 2026-27 campaign panel ─────────────────────────────── */
        <div>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0a3320' }}>New Period 2026-27 — issue packets</div>
            <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>Pick a package scenario; every link & QR is pre-scoped to {currentCenter?.name ?? 'the selected center'}. Cross-form prefill carries answers forward automatically.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {SCENARIOS.map(sc => (
                <button key={sc.id} onClick={() => setScenario(sc.id)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: scenario === sc.id ? '1.5px solid #0f4c35' : '1.5px solid #e5e7eb', background: scenario === sc.id ? '#0f4c35' : '#fff', color: scenario === sc.id ? '#fff' : '#374151' }}>{sc.label}</button>
              ))}
            </div>
          </div>

          {!slug ? (
            <div style={{ padding: '28px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14, background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb' }}>Pick a center in the header switcher to generate the packet.</div>
          ) : (
            <div style={grid}>
              {(SCENARIOS.find(s => s.id === scenario)?.keys ?? []).map(k => <FormCard key={k} keyId={k} />)}
            </div>
          )}

          <div style={{ marginTop: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#92400e' }}>
            <strong>Per-child batches, tokenized prefill links, and sent / filled / approved tracking activate with the prefill engine</strong> (get_prefill token DB) — migration is prepared and applies on Nikolay's go. Until then, issue center-scoped packets from <Link to="/issue-packet" style={{ color: '#92400e', fontWeight: 700 }}>Issue Packet →</Link>.
          </div>
        </div>
      )}

      {signOpen && <SignModal onClose={() => setSignOpen(false)} />}
      {qrShare && <ParentFormsQR url={qrShare.url} title={qrShare.title} onClose={() => setQrShare(null)} />}
    </div>
  )
}
