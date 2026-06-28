import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

type Sig = {
  id:string; employee_name:string; employee_position:string; center_name:string
  device_make_model:string; phone_number:string; employee_signature:string
  director_name:string|null; director_signature:string|null
  director_signed_at:string|null; signed_at:string; status:string
}

export default function BYODDirectorPage() {
  const { org } = useOrg()
  const [sigs, setSigs] = useState<Sig[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all'|'pending'|'signed'>('all')
  const [signing, setSigning] = useState<Sig|null>(null)
  const [detail, setDetail] = useState<Sig|null>(null)
  const [dirName, setDirName] = useState('Sonia Texidor')
  const cvs = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async()=>{
    setLoading(true)
    const{data}=await supabase.schema('menumaker').from('byod_signatures')
      .select('*').eq('org_id',org?.id).order('signed_at',{ascending:false})
    setSigs(data||[]); setLoading(false)
  },[org?.id])

  useEffect(()=>{load()},[load])

  const pending = sigs.filter(s=>s.status!=='signed').length
  const signed = sigs.filter(s=>s.status==='signed').length
  const filtered = sigs.filter(s=>filter==='all'?true:filter==='pending'?s.status!=='signed':s.status==='signed')

  function pos(e:any, c:HTMLCanvasElement) {
    const r=c.getBoundingClientRect()
    if(e.touches) return {x:(e.touches[0].clientX-r.left)*(c.width/r.width),y:(e.touches[0].clientY-r.top)*(c.height/r.height)}
    return {x:(e.clientX-r.left)*(c.width/r.width),y:(e.clientY-r.top)*(c.height/r.height)}
  }

  async function countersign() {
    if(!signing||!cvs.current||!hasSig) return
    setBusy(true)
    const dirSig = cvs.current.toDataURL('image/png')
    const{error}=await supabase.schema('menumaker').from('byod_signatures')
      .update({director_name:dirName,director_signature:dirSig,director_signed_at:new Date().toISOString(),status:'signed'})
      .eq('id',signing.id)
    if(error){alert('Error: '+error.message);setBusy(false);return}
    setSigning(null); setHasSig(false); setBusy(false); load()
  }

  function openSign(sig:Sig){
    setSigning(sig); setHasSig(false)
    setTimeout(()=>{
      if(cvs.current){const ctx=cvs.current.getContext('2d')!;ctx.clearRect(0,0,512,140);ctx.strokeStyle='#1a5c3f';ctx.lineWidth=2.5;ctx.lineCap='round'}
    },50)
  }

  const pb=(ok:boolean):React.CSSProperties=>({width:'100%',padding:13,background:ok?'#1a5c3f':'#9ca3af',color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:600,cursor:ok?'pointer':'not-allowed',fontFamily:'inherit',marginTop:12})

  return (
    <div style={{padding:'28px 24px',fontFamily:"'DM Sans',sans-serif",maxWidth:1000,margin:'0 auto'}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:11,fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',color:'#6b7280',marginBottom:4}}>BYOD MANAGEMENT</div>
        <h1 style={{fontSize:24,fontWeight:700,color:'#0a3320',margin:0}}>BYOD Agreements</h1>
        <p style={{margin:'4px 0 0',color:'#6b7280',fontSize:13}}>Review and countersign employee device use agreements</p>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total',v:sigs.length,c:'#1a5c3f',b:'#f0f7f4'},{l:'Pending',v:pending,c:'#92400e',b:'#fef3c7'},{l:'Signed',v:signed,c:'#065f46',b:'#d1fae5'}].map(s=>(
          <div key={s.l} style={{background:s.b,borderRadius:12,padding:'16px 20px',textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:800,color:s.c}}>{s.v}</div>
            <div style={{fontSize:12,color:'#6b7280',marginTop:4}}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap',marginBottom:20}}>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:4}}>Signing as</label>
          <select value={dirName} onChange={e=>setDirName(e.target.value)} style={{padding:'8px 12px',border:'1.5px solid #e5e7eb',borderRadius:8,fontSize:14,fontFamily:'inherit'}}>
            <option>Sonia Texidor</option><option>Theresa Rolf</option><option>Carmen Santiago</option>
          </select>
        </div>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:4}}>Filter</label>
          <div style={{display:'flex',gap:6}}>
            {(['all','pending','signed'] as const).map(f=>(
              <button key={f} onClick={()=>setFilter(f)} style={{padding:'7px 14px',borderRadius:8,fontSize:12,cursor:'pointer',fontFamily:'inherit',border:'none',fontWeight:600,background:filter===f?'#1a5c3f':'#f3f4f6',color:filter===f?'#fff':'#374151'}}>
                {f==='all'?'All':f==='pending'?`Pending (${pending})`:`Signed (${signed})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading?<div style={{textAlign:'center',padding:40,color:'#6b7280'}}>Loading...</div>
      :filtered.length===0?<div style={{textAlign:'center',padding:40,color:'#9ca3af',background:'#f9fafb',borderRadius:12}}>No agreements found</div>
      :<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {filtered.map(sig=>(
          <div key={sig.id} style={{background:'#fff',borderRadius:12,padding:'16px 20px',border:`1.5px solid ${sig.status==='signed'?'#d1fae5':'#fde68a'}`,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
            <img src={sig.employee_signature} alt="sig" style={{width:80,height:44,objectFit:'contain',border:'1px solid #e5e7eb',borderRadius:6,background:'#fafff9',flexShrink:0}}/>
            <div style={{flex:1,minWidth:180}}>
              <div style={{fontWeight:700,fontSize:14,color:'#0a3320'}}>{sig.employee_name}</div>
              <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{sig.employee_position} · {sig.center_name}</div>
              <div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>{sig.device_make_model} · {sig.phone_number}</div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              {sig.status==='signed'?<span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:'#d1fae5',color:'#065f46'}}>✓ Signed</span>:<span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:'#fef3c7',color:'#92400e'}}>⏳ Pending</span>}
              <div style={{fontSize:11,color:'#9ca3af',marginTop:4}}>{new Date(sig.signed_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
            </div>
            <div style={{display:'flex',gap:8,flexShrink:0}}>
              <button onClick={()=>setDetail(sig)} style={{padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:600,background:'#f0f7f4',color:'#1a5c3f',border:'1px solid #d1fae5',cursor:'pointer',fontFamily:'inherit'}}>View</button>
              {sig.status!=='signed'&&<button onClick={()=>openSign(sig)} style={{padding:'7px 14px',borderRadius:8,fontSize:12,fontWeight:600,background:'#1a5c3f',color:'#fff',border:'none',cursor:'pointer',fontFamily:'inherit'}}>✍️ Sign</button>}
            </div>
          </div>
        ))}
      </div>}

      {signing&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',overflowY:'auto',padding:'20px 12px'}}>
          <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:520,boxShadow:'0 24px 80px rgba(0,0,0,0.25)'}}>
            <div style={{background:'#1a5c3f',color:'#fff',padding:'16px 20px',borderRadius:'16px 16px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:700}}>Director Countersignature</div>
              <button onClick={()=>setSigning(null)} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'#fff',borderRadius:8,padding:'6px 12px',cursor:'pointer'}}>✕</button>
            </div>
            <div style={{padding:20}}>
              <div style={{background:'#f0f7f4',borderRadius:10,padding:16,marginBottom:16,fontSize:13}}>
                {[['Employee',signing.employee_name],['Position',signing.employee_position],['Center',signing.center_name],['Device',signing.device_make_model]].map(([l,v])=>(
                  <div key={l} style={{display:'flex',gap:8,marginBottom:4}}><span style={{color:'#6b7280',minWidth:90}}>{l}:</span><strong>{v}</strong></div>
                ))}
              </div>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Employee Signature</div>
                <img src={signing.employee_signature} alt="emp" style={{width:'100%',height:90,objectFit:'contain',border:'1px solid #d1fae5',borderRadius:8,background:'#fafff9'}}/>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Your Signature * ({dirName})</div>
                <canvas ref={cvs} width={480} height={130}
                  style={{width:'100%',height:130,border:`2px ${hasSig?'solid #1a5c3f':'dashed #d1fae5'}`,borderRadius:10,background:'#fafff9',cursor:'crosshair',touchAction:'none',display:'block'}}
                  onMouseDown={e=>{if(!cvs.current)return;setDrawing(true);const p=pos(e,cvs.current);const ctx=cvs.current.getContext('2d')!;ctx.beginPath();ctx.moveTo(p.x,p.y)}}
                  onMouseMove={e=>{if(!drawing||!cvs.current)return;const p=pos(e,cvs.current);const ctx=cvs.current.getContext('2d')!;ctx.lineTo(p.x,p.y);ctx.stroke();setHasSig(true)}}
                  onMouseUp={()=>setDrawing(false)} onMouseLeave={()=>setDrawing(false)}
                  onTouchStart={e=>{e.preventDefault();if(!cvs.current)return;setDrawing(true);const p=pos(e,cvs.current);const ctx=cvs.current.getContext('2d')!;ctx.beginPath();ctx.moveTo(p.x,p.y)}}
                  onTouchMove={e=>{e.preventDefault();if(!drawing||!cvs.current)return;const p=pos(e,cvs.current);const ctx=cvs.current.getContext('2d')!;ctx.lineTo(p.x,p.y);ctx.stroke();setHasSig(true)}}
                  onTouchEnd={()=>setDrawing(false)}
                />
                <div style={{display:'flex',gap:8,marginTop:8}}>
                  <button onClick={()=>{if(cvs.current){cvs.current.getContext('2d')!.clearRect(0,0,480,130);setHasSig(false)}}} style={{padding:'6px 14px',fontSize:12,borderRadius:6,background:'#f3f4f6',border:'none',cursor:'pointer'}}>Clear</button>
                  <span style={{fontSize:11,color:hasSig?'#059669':'#9ca3af'}}>{hasSig?'✓ Captured':'Sign above'}</span>
                </div>
              </div>
              <button onClick={countersign} disabled={!hasSig||busy} style={{width:'100%',padding:13,background:hasSig&&!busy?'#1a5c3f':'#9ca3af',color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:600,cursor:hasSig?'pointer':'not-allowed',fontFamily:'inherit'}}>{busy?'Saving...':'Confirm & Sign ✓'}</button>
            </div>
          </div>
        </div>
      )}

      {detail&&(
        <div onClick={()=>setDetail(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:480,padding:24,boxShadow:'0 24px 80px rgba(0,0,0,0.25)'}}>
            <div style={{fontWeight:700,fontSize:16,color:'#0a3320',marginBottom:16}}>Agreement Detail</div>
            <div style={{background:'#f0f7f4',borderRadius:10,padding:16,marginBottom:16,fontSize:13}}>
              {[['ID',detail.id.slice(0,8).toUpperCase()],['Employee',detail.employee_name],['Position',detail.employee_position],['Center',detail.center_name],['Device',detail.device_make_model],['Phone',detail.phone_number],['Signed',new Date(detail.signed_at).toLocaleString('en-US')],['Status',detail.status==='signed'?'✅ Fully Signed':'⏳ Pending']]
                .map(([l,v])=>(<div key={l} style={{display:'flex',gap:8,marginBottom:5}}><span style={{color:'#6b7280',minWidth:90,fontSize:12}}>{l}:</span><strong style={{fontSize:13}}>{v}</strong></div>))}
            </div>
            <div style={{marginBottom:detail.director_signature?16:0}}>
              <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Employee Signature</div>
              <img src={detail.employee_signature} alt="sig" style={{width:'100%',height:90,objectFit:'contain',border:'1px solid #d1fae5',borderRadius:8,background:'#fafff9'}}/>
            </div>
            {detail.director_signature&&<div style={{marginTop:16}}>
              <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>Director Signature ({detail.director_name})</div>
              <img src={detail.director_signature} alt="dir" style={{width:'100%',height:90,objectFit:'contain',border:'1px solid #d1fae5',borderRadius:8,background:'#fafff9'}}/>
            </div>}
            <button onClick={()=>setDetail(null)} style={{width:'100%',padding:12,background:'#1a5c3f',color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',marginTop:16}}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}