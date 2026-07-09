import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { PARENT_FORMS_URL } from '@/config/showcaseLinks'
import StaffJdOnboarding from './StaffJdOnboarding'

const DOCS = [
  // ── Enrollment ────────────────────────────────────────────────────────────
  // Permanent public link + client-side QR (no external API). URL is centralized
  // in config/showcaseLinks.ts so a move off GitHub Pages is a one-line change.
  { id:'parent-forms', title:'Parent Forms', description:'CACFP enrollment & income-eligibility forms for families. Share the link or QR — opens on any device.', audience:'Parent', category:'Enrollment', parentForms:true, driveUrl:PARENT_FORMS_URL },

  // ── BYOD ─────────────────────────────────────────────────────────────────
  { id:'byod-agreement', title:'BYOD Device Use Agreement', description:'Sign online — saved securely. Director countersigns digitally.', audience:'Staff', category:'BYOD', canSign:true, highlight:true },
  { id:'byod-policy', title:'BYOD Policy HR-BYOD-001', description:'Voluntary participation, $20/month stipend, privacy protections.', audience:'Staff', category:'BYOD', driveUrl:'https://drive.google.com/file/d/1BsJks_GR4oGKtccX6jZX58oOnj2QCZQW/view?usp=sharing' },

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
  { id:'mc-cook', title:'Meal Count — Cook (Kitchen View)', description:'All cooks: Current Meal and Week View with CACFP export.', audience:'Staff', category:'Meal Count', driveUrl:'https://menumaker-app.vercel.app/portal/cook', helpUrl:'https://menumaker-app.vercel.app/meal-count/help?role=cook' },
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
              <p style={{marginTop:10}}><strong>Art.2 Compensation.</strong> Monthly stipend of $20.00 in regular paycheck.</p>
              <p style={{marginTop:10}}><strong>Art.3 Obligations.</strong> Keep device charged; enable screen lock; not share credentials; report loss immediately; allow app removal upon termination.</p>
              <p style={{marginTop:10}}><strong>Art.4 Company Limits.</strong> Play Academy will NOT access personal content. Work data on Company servers only.</p>
              <p style={{marginTop:10}}><strong>Art.5 Confidentiality.</strong> All child data is confidential. No disclosure to unauthorized persons.</p>
              <p style={{marginTop:10}}><strong>Art.6 Termination.</strong> Either party may terminate. Employee: written notice. Company: immediately upon violation.</p>
              <p style={{marginTop:10}}><strong>Art.7 Governing Law.</strong> Ohio law. Cuyahoga County courts.</p>
              <p style={{marginTop:10}}><strong>Art.8 Push Notifications.</strong> Employee consents to receive work-related Push Notifications through the Play Academy app on their personal device. Notifications may include: CACFP meal count alerts, SafePass child handoff events, schedule reminders, and urgent messages from management. Employee may not disable work notifications during scheduled work hours.</p>
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
            <div style={{background:'#fef3c7',borderRadius:10,padding:14,fontSize:13,color:'#92400e',marginBottom:16}}>
              ⏳ BYOD stipend of <strong>$20/month</strong> begins after director confirmation.
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
function ParentFormsQR({ url, onClose }: { url: string; onClose: ()=>void }) {
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
      `<html><head><title>Parent Forms — QR</title></head>` +
      `<body style="margin:0;font-family:sans-serif;text-align:center;padding:40px">` +
      `<h2 style="color:#0a3320;margin:0 0 6px">Parent Forms</h2>` +
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
        <div style={{fontSize:14,fontWeight:600,color:'#0a3320',marginBottom:4}}>Parent Forms</div>
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

export default function DocumentHubPage() {
  const { org } = useOrg()
  const [cat, setCat] = useState('all')
  const [aud, setAud] = useState('all')
  const [signOpen, setSignOpen] = useState(false)
  const [qrDoc, setQrDoc] = useState<any>(null)
  const [parentQrOpen, setParentQrOpen] = useState(false)
  const [count, setCount] = useState<number|null>(null)

  useEffect(()=>{
    if(!org?.id) return
    supabase.schema('menumaker').from('byod_signatures')
      .select('id',{count:'exact',head:true}).eq('org_id',org.id)
      .then(({count:c})=>setCount(c))
  },[org?.id, signOpen])

  const cats = ['all',...[...new Set(DOCS.map(d=>d.category))]]
  const auds = ['all','Parent','Teacher','Director','Staff','All']
  const audColors: Record<string,{bg:string;text:string}> = {
    Parent:{bg:'#dbeafe',text:'#1e40af'}, Teacher:{bg:'#dcfce7',text:'#166534'},
    Director:{bg:'#fef3c7',text:'#92400e'}, Staff:{bg:'#fce7f3',text:'#9d174d'}, All:{bg:'#f3e8ff',text:'#6b21a8'},
  }
  const docs = DOCS.filter(d=>(cat==='all'||d.category===cat)&&(aud==='all'||d.audience===aud))
  const tb = (a:boolean):React.CSSProperties => ({padding:'5px 14px',borderRadius:20,fontSize:12,cursor:'pointer',fontFamily:'inherit',border:'none',background:a?'#0f4c35':'#f3f4f6',color:a?'#fff':'#374151',fontWeight:a?600:400})

  return (
    <div style={{padding:'28px 24px',fontFamily:"'DM Sans',sans-serif",maxWidth:1100,margin:'0 auto'}}>
      <div style={{marginBottom:22}}>
        <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',color:'#6b7280',marginBottom:4}}>DOCUMENTS & GUIDES</div>
        <h1 style={{fontSize:24,fontWeight:700,color:'#0a3320',margin:0}}>Document Hub</h1>
        <p style={{margin:'4px 0 0',color:'#6b7280',fontSize:13}}>All instructions, guides and policies — download, print, share via QR, or sign online</p>
      </div>

      <div style={{background:'linear-gradient(135deg,#1a5c3f,#2d7a56)',borderRadius:12,padding:'16px 20px',marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <div style={{color:'#fff',fontWeight:700,fontSize:15}}>📱 BYOD Agreement — Online Signing</div>
          <div style={{color:'rgba(255,255,255,0.8)',fontSize:13,marginTop:2}}>{count===null?'Loading...': `${count} employee${count!==1?'s':''} signed`} · Director countersignature pending</div>
        </div>
        <button onClick={()=>setSignOpen(true)} style={{padding:'10px 20px',background:'#fff',color:'#1a5c3f',border:'none',borderRadius:8,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>Sign Now →</button>
      </div>

      <StaffJdOnboarding />

      <div style={{display:'flex',gap:20,marginBottom:18,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:'#6b7280',marginBottom:5,textTransform:'uppercase'}}>Category</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{cats.map(c=><button key={c} onClick={()=>setCat(c)} style={tb(cat===c)}>{c==='all'?'All':c}</button>)}</div>
        </div>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:'#6b7280',marginBottom:5,textTransform:'uppercase'}}>For</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{auds.map(a=><button key={a} onClick={()=>setAud(a)} style={tb(aud===a)}>{a==='all'?'Everyone':a}</button>)}</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
        {(cat==='all') && (
          <Link to="/instructions" style={{textDecoration:'none',background:'linear-gradient(135deg,#0f4c35,#1a6b4a)',borderRadius:12,padding:'16px 18px',border:'1.5px solid #0f4c35',boxShadow:'0 4px 16px rgba(15,76,53,0.18)',display:'flex',flexDirection:'column',gap:8}}>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <span style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.7)',textTransform:'uppercase'}}>Guides</span>
              <span style={{fontSize:11,fontWeight:600,padding:'1px 8px',borderRadius:20,background:'rgba(255,255,255,0.2)',color:'#fff'}}>Everyone</span>
            </div>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:'#fff',marginBottom:4}}>📖 Instructions</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,0.85)',lineHeight:1.5}}>How every feature works — searchable, filtered by your role. Updated with each new feature.</div>
            </div>
            <div style={{marginTop:'auto',fontSize:13,fontWeight:600,color:'#fff'}}>Open Instructions →</div>
          </Link>
        )}
        {docs.map(doc=>{
          const ac = audColors[doc.audience] || {bg:'#f3f4f6',text:'#374151'}
          const hl = (doc as any).highlight
          return (
            <div key={doc.id} style={{background:hl?'linear-gradient(135deg,#f0fdf4,#ecfdf5)':'#fff',borderRadius:12,padding:'16px 18px',border:`1.5px solid ${hl?'#6ee7b7':'#e5e7eb'}`,boxShadow:hl?'0 4px 16px rgba(26,92,63,0.12)':'0 1px 4px rgba(0,0,0,0.04)',display:'flex',flexDirection:'column',gap:10,position:'relative'}}>
              {hl&&<div style={{position:'absolute',top:-1,right:14,background:'#1a5c3f',color:'#fff',fontSize:10,fontWeight:700,padding:'2px 10px',borderRadius:'0 0 6px 6px'}}>SIGN ONLINE</div>}
              <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',gap:6}}>
                  <span style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase'}}>{doc.category}</span>
                  <span style={{fontSize:11,fontWeight:600,padding:'1px 8px',borderRadius:20,background:ac.bg,color:ac.text}}>{doc.audience}</span>
                </div>
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:'#0a3320',marginBottom:4}}>{doc.title}</div>
                <div style={{fontSize:12,color:'#6b7280',lineHeight:1.5}}>{doc.description}</div>
              </div>
              <div style={{marginTop:'auto'}}>
                {(doc as any).parentForms ? (
                  <div style={{display:'flex',gap:8}}>
                    <a href={PARENT_FORMS_URL} target="_blank" rel="noreferrer" style={{flex:1,padding:'8px 12px',borderRadius:8,fontSize:13,fontWeight:500,background:'#0f4c35',color:'#fff',textDecoration:'none',textAlign:'center' as const,fontFamily:'inherit'}}>Open ↗</a>
                    <button onClick={()=>setParentQrOpen(true)} style={{padding:'8px 14px',borderRadius:8,fontSize:13,background:'#f0f7f4',color:'#1a5c3f',border:'1px solid #d1fae5',cursor:'pointer',fontFamily:'inherit'}}>QR</button>
                  </div>
                ) : (doc as any).canSign ? (
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>setSignOpen(true)} style={{flex:1,padding:'8px 12px',borderRadius:8,fontSize:13,fontWeight:600,background:'#1a5c3f',color:'#fff',border:'none',cursor:'pointer',fontFamily:'inherit'}}>✍️ Sign Online</button>
                    {(doc as any).driveUrl && <button onClick={()=>setQrDoc(doc)} style={{padding:'8px 14px',borderRadius:8,fontSize:13,background:'#f0f7f4',color:'#1a5c3f',border:'1px solid #d1fae5',cursor:'pointer',fontFamily:'inherit'}}>QR</button>}
                  </div>
                ) : (doc as any).driveUrl ? (
                  <div style={{display:'flex',gap:8}}>
                    <a href={(doc as any).driveUrl} target="_blank" rel="noreferrer" style={{flex:1,padding:'8px 12px',borderRadius:8,fontSize:13,fontWeight:500,background:'#0f4c35',color:'#fff',textDecoration:'none',textAlign:'center' as const,fontFamily:'inherit'}}>↓ Download</a>
                    <button onClick={()=>setQrDoc(doc)} style={{padding:'8px 14px',borderRadius:8,fontSize:13,background:'#f0f7f4',color:'#1a5c3f',border:'1px solid #d1fae5',cursor:'pointer',fontFamily:'inherit'}}>QR</button>
                  </div>
                ) : (
                  <div style={{fontSize:12,color:'#9ca3af',fontStyle:'italic'}}>Coming soon</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {signOpen && <SignModal onClose={()=>setSignOpen(false)}/>}
      {parentQrOpen && <ParentFormsQR url={PARENT_FORMS_URL} onClose={()=>setParentQrOpen(false)}/>}
      {qrDoc && (
        <div onClick={()=>setQrDoc(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={(e:any)=>e.stopPropagation()} style={{background:'#fff',borderRadius:16,padding:32,maxWidth:300,width:'100%',textAlign:'center',boxShadow:'0 24px 80px rgba(0,0,0,0.25)'}}>
            <div style={{fontSize:14,fontWeight:600,color:'#0a3320',marginBottom:4}}>{qrDoc.title}</div>
            <div style={{fontSize:12,color:'#6b7280',marginBottom:18}}>Scan to open on any device</div>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrDoc.driveUrl||'')}`} alt="QR" style={{width:200,height:200,borderRadius:8,border:'1px solid #e5e7eb'}}/>
            <button onClick={()=>setQrDoc(null)} style={{marginTop:16,padding:'8px 24px',borderRadius:8,background:'#1a5c3f',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}// drive urls added Sun Jun 28 20:00:14 EDT 2026
