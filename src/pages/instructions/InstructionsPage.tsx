import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

type DocItem = {
  id: string; title: string; description: string
  audience: 'parent'|'teacher'|'director'|'staff'|'all'
  category: string; driveUrl?: string; canSign?: boolean
  comingSoon?: boolean; date?: string; highlight?: boolean
}

const DOCS: DocItem[] = [
  { id:'safepass-parent', title:'SafePass — Parent Letter (Wickliffe)', description:'Pilot announcement. Registration July 1–14, mandatory July 15.', audience:'parent', category:'SafePass', date:'July 2026', comingSoon:true },
  { id:'safepass-teacher', title:'SafePass — Teacher Quick Guide (Wickliffe)', description:'iPad guide: drop-off, pick-up, unknown person protocol.', audience:'teacher', category:'SafePass', date:'July 2026', comingSoon:true },
  { id:'safepass-concept', title:'SafePass — Complete Concept Document v1.1', description:'Philosophy, legal basis, chain of custody, transportation, school partnership.', audience:'director', category:'SafePass', date:'July 2026', comingSoon:true },
  { id:'byod-policy', title:'BYOD Policy — HR-BYOD-001', description:'Company policy: voluntary, $20/month stipend, privacy protections.', audience:'staff', category:'BYOD', date:'July 2026', comingSoon:true },
  { id:'byod-agreement', title:'BYOD Device Use Agreement', description:'Individual employee agreement. Sign online — saved securely. Director countersigns digitally.', audience:'staff', category:'BYOD', date:'July 2026', canSign:true, highlight:true },
  { id:'mealcount-teacher', title:'Meal Count — Teacher Guide', description:'How to record breakfast, lunch, and snacks in ClickClaim.', audience:'teacher', category:'Meal Count', comingSoon:true },
  { id:'mealcount-director', title:'Meal Count — Director Guide', description:'Approving meal counts, reviewing submissions, monthly close.', audience:'director', category:'Meal Count', comingSoon:true },
  { id:'timelog', title:'Daily Time Log — Teacher Guide', description:'CACFP labor time log — monthly record.', audience:'teacher', category:'Staff', comingSoon:true },
  { id:'receipts', title:'Receipt Upload — Guide', description:'How to photograph and upload food purchase receipts.', audience:'all', category:'Purchases', comingSoon:true },
]

const CATS = [...new Set(DOCS.map(d=>d.category))]
const AUD: Record<string,string> = { parent:'Parent', teacher:'Teacher', director:'Director', staff:'Staff', all:'All' }
const ACOL: Record<string,{bg:string;text:string}> = {
  parent:{bg:'#dbeafe',text:'#1e40af'}, teacher:{bg:'#dcfce7',text:'#166534'},
  director:{bg:'#fef3c7',text:'#92400e'}, staff:{bg:'#fce7f3',text:'#9d174d'}, all:{bg:'#f3e8ff',text:'#6b21a8'},
}

function BYODModal({ onClose }: { onClose: ()=>void }) {
  const { org } = useOrg()
  const cvs = useRef<HTMLCanvasElement>(null)
  const [step, setStep] = useState(1)
  const [draw, setDraw] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refId, setRefId] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [f, setF] = useState({ name:'', position:'', center:'', device:'', phone:'' })
  const set = (k:string,v:string) => setF(p=>({...p,[k]:v}))
  const STEPS = ['','Your Info','Read Agreement','Sign','Done']

  useEffect(()=>{
    if(step!==3||!cvs.current)return
    const ctx=cvs.current.getContext('2d')!
    ctx.strokeStyle='#1a5c3f';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round'
  },[step])

  function pos(e:any){
    const r=cvs.current!.getBoundingClientRect()
    const sx=cvs.current!.width/r.width,sy=cvs.current!.height/r.height
    if(e.touches)return{x:(e.touches[0].clientX-r.left)*sx,y:(e.touches[0].clientY-r.top)*sy}
    return{x:(e.clientX-r.left)*sx,y:(e.clientY-r.top)*sy}
  }
  function down(e:any){setDraw(true);const p=pos(e);const ctx=cvs.current!.getContext('2d')!;ctx.beginPath();ctx.moveTo(p.x,p.y)}
  function move(e:any){if(!draw)return;const p=pos(e);const ctx=cvs.current!.getContext('2d')!;ctx.lineTo(p.x,p.y);ctx.stroke();setHasSig(true)}
  function clear(){cvs.current!.getContext('2d')!.clearRect(0,0,512,140);setHasSig(false)}

  async function submit(){
    setBusy(true)
    const sig=cvs.current!.toDataURL('image/png')
    const{data,error}=await supabase.schema('menumaker').from('byod_signatures')
      .insert({org_id:org?.id,employee_name:f.name,employee_position:f.position,center_name:f.center,device_make_model:f.device,phone_number:f.phone,employee_signature:sig,status:'pending_director'})
      .select('id').single()
    if(error){alert('Error: '+error.message);setBusy(false);return}
    setRefId(data.id.slice(0,8).toUpperCase());setStep(4);setBusy(false)
  }

  const G:React.CSSProperties={width:'100%',padding:'10px 12px',border:'1.5px solid #e5e7eb',borderRadius:8,fontSize:14,fontFamily:'inherit',background:'#fafafa'}
  const PB=(ok:boolean):React.CSSProperties=>({width:'100%',padding:13,background:ok?'#1a5c3f':'#9ca3af',color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:600,cursor:ok?'pointer':'not-allowed',fontFamily:'inherit',marginTop:12})

  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,overflowY:'auto',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px 12px'}}>
      <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:540,boxShadow:'0 24px 80px rgba(0,0,0,0.25)'}}>
        <div style={{background:'#1a5c3f',color:'#fff',padding:'18px 24px',borderRadius:'16px 16px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div style={{fontWeight:700,fontSize:16}}>BYOD Device Use Agreement</div><div style={{fontSize:12,opacity:0.8}}>Play Academy Inc. — Online Signing</div></div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'#fff',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:13}}>✕</button>
        </div>
        <div style={{display:'flex',borderBottom:'1px solid #f0f0f0'}}>
          {[1,2,3,4].map(n=>(
            <div key={n} style={{flex:1,textAlign:'center',padding:'10px 4px',fontSize:11,fontWeight:600,color:n===step?'#1a5c3f':n<step?'#059669':'#9ca3af',borderBottom:`3px solid ${n===step?'#1a5c3f':n<step?'#059669':'transparent'}`}}>
              <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:20,height:20,borderRadius:'50%',marginRight:4,fontSize:10,background:n===step?'#1a5c3f':n<step?'#059669':'#e5e7eb',color:n<=step?'#fff':'#9ca3af'}}>{n<step?'✓':n}</span>
              {STEPS[n]}
            </div>
          ))}
        </div>
        <div style={{padding:24}}>
          {step===1&&<div>
            <p style={{fontSize:13,color:'#6b7280',marginBottom:16}}>Fill in your information to begin.</p>
            {[['Full Name','name','text','First Last'],['Position','position','text','e.g. Lead Teacher'],['Device Make / Model','device','text','e.g. iPhone 15 Pro'],['Phone Number','phone','tel','(555) 000-0000']].map(([l,k,t,p])=>(
              <div key={k} style={{marginBottom:12}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>{l} *</label>
                <input type={t} value={(f as any)[k]} onChange={e=>set(k,e.target.value)} placeholder={p} style={G}/>
              </div>
            ))}
            <div style={{marginBottom:12}}>
              <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:4}}>Center *</label>
              <select value={f.center} onChange={e=>set('center',e.target.value)} style={G}>
                <option value="">Select...</option>
                <option>Play Academy Wickliffe</option>
                <option>Play Academy Parma Heights</option>
                <option>Play Academy Mayfield Hills</option>
              </select>
            </div>
            <button onClick={()=>{if(!f.name||!f.position||!f.center||!f.device||!f.phone){alert('Fill all fields');return}setStep(2)}} style={PB(true)}>Continue to Agreement →</button>
          </div>}
          {step===2&&<div>
            <div style={{height:280,overflowY:'auto',border:'1px solid #d1fae5',borderRadius:10,padding:'14px 16px',fontSize:13,lineHeight:1.7,color:'#374151',background:'#f8faf8',marginBottom:14}}>
              <p><strong>This Agreement</strong> is between <strong>Play Academy Inc.</strong> and the Employee named above.</p>
              <p style={{marginTop:10}}><strong>Art. 1. Purpose.</strong> Voluntary use of personal device for SafePass and authorized apps. <strong>App works ONLY on registered authorized devices.</strong></p>
              <p style={{marginTop:10}}><strong>Art. 2. Compensation.</strong> Monthly stipend of <strong>$20.00</strong> in regular paycheck. Ceases upon termination.</p>
              <p style={{marginTop:10}}><strong>Art. 3. Obligations.</strong> Keep device charged; enable screen lock; install only authorized apps; not share credentials; report loss immediately; allow app removal upon termination.</p>
              <p style={{marginTop:10}}><strong>Art. 4. Company Limits.</strong> Play Academy will NOT access personal content. Work data on Company servers only. Apps removed within 24 hours of termination.</p>
              <p style={{marginTop:10}}><strong>Art. 5. Confidentiality.</strong> All child data is confidential under Ohio and federal law. No disclosure to unauthorized persons.</p>
              <p style={{marginTop:10}}><strong>Art. 6. Termination.</strong> Either party may terminate. Employee: written notice; Company device within 5 days. Company: immediately upon violation.</p>
              <p style={{marginTop:10}}><strong>Art. 7. Governing Law.</strong> Ohio law. Cuyahoga County courts.</p>
            </div>
            <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:12,background:'#f0f7f4',borderRadius:8,marginBottom:12}}>
              <input type="checkbox" id="ag" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{width:18,height:18,marginTop:2,accentColor:'#1a5c3f',flexShrink:0}}/>
              <label htmlFor="ag" style={{fontSize:13,color:'#374151',cursor:'pointer'}}>I have read and fully understand this Agreement and voluntarily agree.</label>
            </div>
            <button onClick={()=>setStep(3)} style={PB(agreed)} disabled={!agreed}>Continue to Signature →</button>
            <button onClick={()=>setStep(1)} style={{width:'100%',padding:10,background:'none',border:'none',color:'#6b7280',fontSize:13,cursor:'pointer',marginTop:4}}>← Back</button>
          </div>}
          {step===3&&<div>
            <p style={{fontSize:13,color:'#6b7280',marginBottom:14}}>Sign below using finger (mobile) or mouse (desktop).</p>
            <canvas ref={cvs} width={512} height={140}
              style={{width:'100%',height:140,border:`2px ${hasSig?'solid #1a5c3f':'dashed #d1fae5'}`,borderRadius:10,background:'#fafff9',cursor:'crosshair',touchAction:'none',display:'block'}}
              onMouseDown={down} onMouseMove={move} onMouseUp={()=>setDraw(false)} onMouseLeave={()=>setDraw(false)}
              onTouchStart={e=>{e.preventDefault();down(e)}} onTouchMove={e=>{e.preventDefault();move(e)}} onTouchEnd={()=>setDraw(false)}
            />
            <div style={{display:'flex',gap:8,marginTop:8,alignItems:'center'}}>
              <button onClick={clear} style={{padding:'6px 14px',fontSize:12,borderRadius:6,background:'#f3f4f6',color:'#6b7280',border:'none',cursor:'pointer'}}>Clear</button>
              <span style={{fontSize:11,color:hasSig?'#059669':'#9ca3af'}}>{hasSig?'✓ Captured':'Sign above'}</span>
            </div>
            <div style={{marginTop:14,padding:12,background:'#f8faf8',borderRadius:8,fontSize:12,color:'#6b7280',lineHeight:1.6}}>
              <strong>Date:</strong> {new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}<br/>
              Electronic signature has same legal effect as handwritten under Ohio law.
            </div>
            <button onClick={submit} disabled={!hasSig||busy} style={PB(hasSig&&!busy)}>{busy?'Submitting...':'Submit Agreement ✓'}</button>
            <button onClick={()=>setStep(2)} style={{width:'100%',padding:10,background:'none',border:'none',color:'#6b7280',fontSize:13,cursor:'pointer',marginTop:4}}>← Back</button>
          </div>}
          {step===4&&<div style={{textAlign:'center',padding:'16px 0'}}>
            <div style={{fontSize:52,marginBottom:14}}>✅</div>
            <h2 style={{color:'#1a5c3f',fontSize:20,marginBottom:8}}>Agreement Signed!</h2>
            <p style={{color:'#6b7280',fontSize:13,lineHeight:1.6}}>Submitted and saved. Your director will countersign shortly.</p>
            <div style={{background:'#f0f7f4',borderRadius:10,padding:16,margin:'16px 0',textAlign:'left',fontSize:13}}>
              {[['Employee',f.name],['Center',f.center],['Device',f.device],['Signed',new Date().toLocaleString('en-US')],['Reference ID',refId]].map(([l,v])=>(
                <div key={l} style={{marginBottom:5}}><span style={{color:'#1a5c3f',fontWeight:600}}>{l}:</span> {v}</div>
              ))}
            </div>
            <div style={{background:'#fef3c7',borderRadius:10,padding:14,fontSize:13,color:'#92400e',textAlign:'left',marginBottom:16}}>
              ⏳ Your BYOD stipend of <strong>$20.00/month</strong> begins after director confirmation.
            </div>
            <button onClick={onClose} style={PB(true)}>Close</button>
          </div>}
        </div>
      </div>
    </div>
  )
}

function QRModal({doc,onClose}:{doc:DocItem;onClose:()=>void}){
  const url=doc.driveUrl||`${window.location.origin}/instructions`
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:16,padding:32,maxWidth:300,width:'100%',textAlign:'center',boxShadow:'0 24px 80px rgba(0,0,0,0.25)'}}>
        <div style={{fontSize:14,fontWeight:600,color:'#0a3320',marginBottom:4}}>{doc.title}</div>
        <div style={{fontSize:12,color:'#6b7280',marginBottom:18}}>Scan to open on any device</div>
        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`} alt="QR" style={{width:200,height:200,borderRadius:8,border:'1px solid #e5e7eb'}}/>
        <button onClick={onClose} style={{marginTop:16,padding:'8px 24px',borderRadius:8,background:'#1a5c3f',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>Close</button>
      </div>
    </div>
  )
}

export default function InstructionsPage(){
  const[cat,setCat]=useState('all')
  const[aud,setAud]=useState('all')
  const[qrDoc,setQrDoc]=useState<DocItem|null>(null)
  const[signOpen,setSignOpen]=useState(false)
  const[count,setCount]=useState<number|null>(null)
  const{org}=useOrg()

  useEffect(()=>{
    supabase.schema('menumaker').from('byod_signatures')
      .select('id',{count:'exact',head:true}).eq('org_id',org?.id)
      .then(({count:c})=>setCount(c))
  },[signOpen,currentOrg?.id])

  const docs=DOCS.filter(d=>(cat==='all'||d.category===cat)&&(aud==='all'||d.audience===aud||d.audience==='all'))
  const TB=(a:boolean):React.CSSProperties=>({padding:'5px 14px',borderRadius:20,fontSize:12,cursor:'pointer',fontFamily:'inherit',border:'none',background:a?'#0f4c35':'#f3f4f6',color:a?'#fff':'#374151',fontWeight:a?600:400})

  return(
    <div style={{padding:'28px 24px',fontFamily:"'DM Sans',sans-serif",maxWidth:1100,margin:'0 auto'}}>
      <div style={{marginBottom:22}}>
        <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',color:'#6b7280',marginBottom:4}}>DOCUMENTS & GUIDES</div>
        <h1 style={{fontSize:24,fontWeight:700,color:'#0a3320',margin:0,fontFamily:"'DM Serif Display',serif"}}>Document Hub</h1>
        <p style={{margin:'4px 0 0',color:'#6b7280',fontSize:13}}>All instructions, guides and policies — download, print, share via QR, or sign online</p>
      </div>
      <div style={{background:'linear-gradient(135deg,#1a5c3f,#2d7a56)',borderRadius:12,padding:'16px 20px',marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <div style={{color:'#fff',fontWeight:700,fontSize:15}}>📱 BYOD Agreement — Online Signing</div>
          <div style={{color:'rgba(255,255,255,0.8)',fontSize:13,marginTop:2}}>{count===null?'Loading...':`${count} employee${count!==1?'s':''} signed`} · Director countersignature pending</div>
        </div>
        <button onClick={()=>setSignOpen(true)} style={{padding:'10px 20px',background:'#fff',color:'#1a5c3f',border:'none',borderRadius:8,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>Sign Now →</button>
      </div>
      <div style={{display:'flex',gap:20,marginBottom:18,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:'#6b7280',marginBottom:5,letterSpacing:'0.06em',textTransform:'uppercase'}}>Category</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {['all',...CATS].map(c=><button key={c} onClick={()=>setCat(c)} style={TB(cat===c)}>{c==='all'?'All':c}</button>)}
          </div>
        </div>
        <div>
          <div style={{fontSize:11,fontWeight:600,color:'#6b7280',marginBottom:5,letterSpacing:'0.06em',textTransform:'uppercase'}}>For</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {['all','parent','teacher','director','staff'].map(a=><button key={a} onClick={()=>setAud(a)} style={TB(aud===a)}>{a==='all'?'Everyone':AUD[a]}</button>)}
          </div>
        </div>
      </div>
      <div style={{fontSize:12,color:'#9ca3af',marginBottom:14}}>{docs.length} document{docs.length!==1?'s':''}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:14}}>
        {docs.map(doc=>{
          const ac=ACOL[doc.audience]
          return(
            <div key={doc.id} style={{background:doc.highlight?'linear-gradient(135deg,#f0fdf4,#ecfdf5)':'#fff',borderRadius:12,padding:'16px 18px',border:`1.5px solid ${doc.highlight?'#6ee7b7':!doc.comingSoon?'#d1fae5':'#e5e7eb'}`,boxShadow:doc.highlight?'0 4px 16px rgba(26,92,63,0.12)':'0 1px 4px rgba(0,0,0,0.04)',display:'flex',flexDirection:'column',gap:10,opacity:doc.comingSoon?0.6:1,position:'relative'}}>
              {doc.highlight&&<div style={{position:'absolute',top:-1,right:14,background:'#1a5c3f',color:'#fff',fontSize:10,fontWeight:700,padding:'2px 10px',borderRadius:'0 0 6px 6px',letterSpacing:'0.05em'}}>SIGN ONLINE</div>}
              <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',gap:6}}>
                  <span style={{fontSize:10,fontWeight:700,color:'#6b7280',letterSpacing:'0.07em',textTransform:'uppercase'}}>{doc.category}</span>
                  <span style={{fontSize:11,fontWeight:600,padding:'1px 8px',borderRadius:20,background:ac.bg,color:ac.text}}>{AUD[doc.audience]}</span>
                </div>
                {doc.date&&<span style={{fontSize:11,color:'#9ca3af'}}>{doc.date}</span>}
              </div>
              <div>
                <div style={{fontSize:14,fontWeight:600,color:'#0a3320',marginBottom:4,lineHeight:1.3}}>{doc.title}</div>
                <div style={{fontSize:12,color:'#6b7280',lineHeight:1.5}}>{doc.description}</div>
              </div>
              <div style={{marginTop:'auto'}}>
                {doc.comingSoon?<div style={{fontSize:12,color:'#9ca3af',fontStyle:'italic'}}>Coming soon</div>
                :doc.canSign?<div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setSignOpen(true)} style={{flex:1,padding:'8px 12px',borderRadius:8,fontSize:13,fontWeight:600,background:'#1a5c3f',color:'#fff',border:'none',cursor:'pointer',fontFamily:'inherit'}}>✍️ Sign Online</button>
                  <button onClick={()=>setQrDoc(doc)} style={{padding:'8px 14px',borderRadius:8,fontSize:13,background:'#f0f7f4',color:'#1a5c3f',border:'1px solid #d1fae5',cursor:'pointer',fontFamily:'inherit'}}>QR</button>
                </div>
                :<div style={{display:'flex',gap:8}}>
                  <a href={doc.driveUrl} target="_blank" rel="noreferrer" style={{flex:1,padding:'8px 12px',borderRadius:8,fontSize:13,fontWeight:500,background:'#0f4c35',color:'#fff',textDecoration:'none',textAlign:'center',fontFamily:'inherit'}}>↓ Download</a>
                  <button onClick={()=>setQrDoc(doc)} style={{padding:'8px 14px',borderRadius:8,fontSize:13,background:'#f0f7f4',color:'#1a5c3f',border:'1px solid #d1fae5',cursor:'pointer',fontFamily:'inherit'}}>QR</button>
                </div>}
              </div>
            </div>
          )
        })}
      </div>
      {qrDoc&&<QRModal doc={qrDoc} onClose={()=>setQrDoc(null)}/>}
      {signOpen&&<BYODModal onClose={()=>setSignOpen(false)}/>}
    </div>
  )
}