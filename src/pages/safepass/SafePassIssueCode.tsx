// SafePassIssueCode.tsx — route /safepass/issue (STAFF, authenticated)
//
// CODELESS device activation (primary). Staff picks a ✓Pickup parent from the list, taps
// "Activate this phone", and shows the parent a QR on this screen. The parent scans it on
// THEIR phone → SafePass opens already signed-in and the device is trusted — no code typed.
// Physical presence (the parent scanning the staff screen) is the verification, and the
// parent's phone is marked verified along the way.
//
// The typed 6-digit code stays as a QUIET fallback only (a non-parent pickup, or a parent with
// no camera) — collapsed at the bottom, not the default path.
import { useEffect, useMemo, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '@/lib/supabase'

const C = {
  bg:'#0a0c12', surface:'#13161f', surface2:'#1c2030', border:'#252a3d', text:'#f0f2ff',
  muted:'#6b7299', green:'#00e896', greenDim:'rgba(0,232,150,0.1)', red:'#ff4d6a', blue:'#5b8bff',
}
type Candidate = { phone:string; person_name:string; child_count:number; phone_verified:boolean }

export default function SafePassIssueCode() {
  const [cands, setCands] = useState<Candidate[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [search, setSearch] = useState('')
  const [busyPhone, setBusyPhone] = useState('')
  const [activated, setActivated] = useState<{ link:string; person:string; phone:string; kids:number }|null>(null)
  const [err, setErr] = useState('')

  // Fallback (typed code) — collapsed
  const [showFallback, setShowFallback] = useState(false)
  const [fbPhone, setFbPhone] = useState('')
  const [fbBusy, setFbBusy] = useState(false)
  const [fbResult, setFbResult] = useState<{ code:string; person:string; kids:number }|null>(null)
  const [fbErr, setFbErr] = useState('')

  const normPhone = (p:string) => '+1' + p.replace(/\D/g,'').slice(-10)
  const prettyPhone = (p:string) => { const d = p.replace(/\D/g,'').slice(-10); return d.length===10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : p }

  useEffect(() => {
    let dead = false
    supabase.schema('menumaker').rpc('safepass_pickup_candidates').then(({ data, error }) => {
      if (dead) return
      // A failed read must be loud — not a silent empty list that reads as "no parents".
      if (error || !data?.ok) { setLoadErr('Could not load the pickup list. Check your connection and that you are signed in as staff.'); return }
      setCands((data.candidates ?? []) as Candidate[])
    })
    return () => { dead = true }
  }, [])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return cands
    return cands.filter(c => c.person_name.toLowerCase().includes(q) || c.phone.replace(/\D/g,'').includes(q.replace(/\D/g,'')))
  }, [cands, search])

  // Mint a one-time activation link for this parent and show its QR. Reuses the login-code as
  // the one-time token — but it lives ONLY in the link, never read aloud.
  async function activate(c: Candidate) {
    setBusyPhone(c.phone); setErr(''); setActivated(null)
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_issue_login_code', { p_phone: c.phone })
    setBusyPhone('')
    if (error || !data?.ok) {
      setErr(data?.error === 'staff_only' ? 'You must be signed in as staff.' : 'Could not activate this phone. Try again.')
      return
    }
    const link = `${window.location.origin}/safepass/parent?p=${encodeURIComponent(c.phone)}&a=${encodeURIComponent(data.code)}`
    setActivated({ link, person: data.person_name ?? c.person_name, phone: c.phone, kids: data.child_count ?? c.child_count })
  }

  async function issueFallback() {
    setFbBusy(true); setFbErr(''); setFbResult(null)
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_issue_login_code', { p_phone: normPhone(fbPhone) })
    setFbBusy(false)
    if (error || !data?.ok) {
      setFbErr(data?.error === 'not_authorized' ? 'That phone is not registered for any child.' : data?.error === 'staff_only' ? 'You must be signed in as staff.' : 'Could not issue a code.')
      return
    }
    setFbResult({ code: data.code, person: data.person_name ?? 'Parent', kids: data.child_count ?? 0 })
  }

  const wrap: React.CSSProperties = { minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'Inter',sans-serif", display:'flex', flexDirection:'column', alignItems:'center', padding:'24px 0' }
  const card: React.CSSProperties = { width:'100%', maxWidth:480, padding:'0 20px' }
  const inp: React.CSSProperties = { width:'100%', padding:'12px 14px', borderRadius:12, border:`1.5px solid ${C.border}`, background:C.surface, color:C.text, fontSize:15, fontFamily:'inherit', boxSizing:'border-box' }
  const btn = (bg:string, color=C.bg): React.CSSProperties => ({ padding:'12px 16px', borderRadius:12, border:'none', background:bg, color, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' })

  return (
    <div style={wrap}><div style={card}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
        <div style={{width:36,height:36,borderRadius:10,background:C.green,display:'grid',placeItems:'center',fontSize:18}}>📲</div>
        <div>
          <div style={{fontWeight:800,fontSize:16}}>SafePass — Activate a parent's phone</div>
          <div style={{fontSize:11,color:C.muted}}>Staff only · pick the parent, show them the QR to scan</div>
        </div>
      </div>

      {activated ? (
        <div style={{padding:'20px',borderRadius:16,background:C.surface,border:`1.5px solid ${C.green}`,textAlign:'center'}}>
          <div style={{fontSize:12,color:C.muted,marginBottom:4}}>Have <strong style={{color:C.text}}>{activated.person}</strong> scan this on their phone</div>
          <div style={{fontSize:11,color:C.muted,marginBottom:14}}>{activated.kids} child{activated.kids===1?'':'ren'} · valid 15 min, one use</div>
          <div style={{background:'#fff',display:'inline-block',padding:12,borderRadius:12}}>
            <QRCodeCanvas value={activated.link} size={220} level="M" marginSize={1} />
          </div>
          <div style={{fontSize:13,color:C.green,fontWeight:700,marginTop:14,lineHeight:1.5}}>
            No code to type — scanning trusts their phone.
          </div>
          <div style={{fontSize:10.5,color:C.muted,wordBreak:'break-all',margin:'10px 0 4px',fontFamily:'ui-monospace,Menlo,monospace'}}>{activated.link}</div>
          <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:12,flexWrap:'wrap'}}>
            <button onClick={()=>{navigator.clipboard?.writeText(activated.link)}} style={btn(C.surface2,C.text)}>🔗 Copy link</button>
            <button onClick={()=>setActivated(null)} style={btn(C.green)}>Done — next parent</button>
          </div>
        </div>
      ) : (
        <>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search parent name or phone…" style={inp} />
          <div style={{height:12}}/>
          {loadErr ? (
            <div role="alert" style={{padding:'12px 14px',borderRadius:12,background:'rgba(255,77,106,0.12)',border:`1.5px solid ${C.red}`,color:C.red,fontSize:13,fontWeight:600,lineHeight:1.5}}>{loadErr}</div>
          ) : shown.length === 0 ? (
            <div style={{color:C.muted,fontSize:13,textAlign:'center',padding:'22px 8px'}}>{cands.length===0 ? 'No pickup-authorized parents for this center yet.' : 'No match.'}</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {shown.map(c => (
                <div key={c.phone} style={{display:'flex',alignItems:'center',gap:12,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 14px'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:15,display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
                      {c.person_name}
                      {c.phone_verified && <span style={{fontSize:10,fontWeight:700,color:C.green,background:C.greenDim,borderRadius:999,padding:'1px 7px'}}>✓ activated</span>}
                    </div>
                    <div style={{fontSize:12,color:C.muted,marginTop:2}}>{prettyPhone(c.phone)} · {c.child_count} child{c.child_count===1?'':'ren'}</div>
                  </div>
                  <button onClick={()=>activate(c)} disabled={busyPhone===c.phone} style={btn(busyPhone===c.phone?C.border:C.green)}>
                    {busyPhone===c.phone ? '…' : 'Activate this phone'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {err && <div role="alert" style={{marginTop:14,padding:'12px 14px',borderRadius:12,background:'rgba(255,77,106,0.12)',border:`1.5px solid ${C.red}`,color:C.red,fontSize:13,fontWeight:600}}>{err}</div>}

          {/* Quiet fallback: typed 6-digit code (non-parent pickup / no camera) */}
          <div style={{marginTop:22,borderTop:`1px solid ${C.border}`,paddingTop:14}}>
            <button onClick={()=>setShowFallback(s=>!s)} style={{background:'transparent',border:'none',color:C.muted,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
              {showFallback?'▾':'▸'} No camera / non-parent pickup — issue a typed code instead
            </button>
            {showFallback && (
              <div style={{marginTop:10}}>
                <input type="tel" value={fbPhone} onChange={e=>setFbPhone(e.target.value)} placeholder="Phone (555) 000-0000" style={inp} onKeyDown={e=>e.key==='Enter'&&issueFallback()} />
                <div style={{height:8}}/>
                <button onClick={issueFallback} disabled={fbBusy||fbPhone.replace(/\D/g,'').length<10} style={{...btn(fbPhone.replace(/\D/g,'').length>=10?C.blue:C.border),width:'100%'}}>{fbBusy?'Issuing…':'Issue typed code →'}</button>
                {fbErr && <div style={{color:C.red,fontSize:12.5,marginTop:8}}>{fbErr}</div>}
                {fbResult && (
                  <div style={{marginTop:12,padding:'14px',borderRadius:12,background:C.surface,border:`1px solid ${C.border}`,textAlign:'center'}}>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Code for {fbResult.person} · {fbResult.kids} child{fbResult.kids===1?'':'ren'}</div>
                    <div style={{fontSize:34,fontWeight:800,letterSpacing:'0.16em',color:C.blue}}>{fbResult.code}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:8}}>Read to the parent — valid 15 min, one use. They enter it on the SafePass parent screen.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div></div>
  )
}
