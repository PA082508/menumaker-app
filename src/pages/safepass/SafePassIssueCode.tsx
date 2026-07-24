// SafePassIssueCode.tsx — route /safepass/issue (STAFF, authenticated)
//
// NUMBER-GATE registration (primary). Staff picks a ✓Pickup parent and taps "Register" ONCE.
// The parent then opens the center's shared SafePass link on THEIR phone and signs in by typing
// their own registered number — no code, no QR. Physical presence at the desk (staff confirming
// the person) is the authorization; the "Register" tap records who/when (registered_at/by).
//
// Revoke (kick) kills app access for a parent — device-trust sessions dropped and the phone
// un-verified/de-registered — without removing them from the ✓Pickup list (that lever lives in
// Family). A kicked parent needs a fresh "Register" tap to come back.
//
// The typed one-time code stays as a QUIET fallback only (a NON-parent pickup, or a parent with
// no way to open the link) — collapsed at the bottom, never the default path.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  bg:'#0a0c12', surface:'#13161f', surface2:'#1c2030', border:'#252a3d', text:'#f0f2ff',
  muted:'#6b7299', green:'#00e896', greenDim:'rgba(0,232,150,0.1)', red:'#ff4d6a', redDim:'rgba(255,77,106,0.1)', blue:'#5b8bff',
}
type Candidate = { phone:string; person_name:string; child_count:number; phone_verified:boolean; registered:boolean }

export default function SafePassIssueCode() {
  const [cands, setCands] = useState<Candidate[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [search, setSearch] = useState('')
  const [busyPhone, setBusyPhone] = useState('')
  const [err, setErr] = useState('')

  // Fallback (typed one-time code) — collapsed, non-parent pickup only
  const [showFallback, setShowFallback] = useState(false)
  const [fbPhone, setFbPhone] = useState('')
  const [fbBusy, setFbBusy] = useState(false)
  const [fbResult, setFbResult] = useState<{ code:string; person:string; kids:number }|null>(null)
  const [fbErr, setFbErr] = useState('')

  const normPhone = (p:string) => '+1' + p.replace(/\D/g,'').slice(-10)
  const prettyPhone = (p:string) => { const d = p.replace(/\D/g,'').slice(-10); return d.length===10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : p }

  function loadCandidates() {
    supabase.schema('menumaker').rpc('safepass_pickup_candidates').then(({ data, error }) => {
      // A failed read must be loud — not a silent empty list that reads as "no parents".
      if (error || !data?.ok) { setLoadErr('Could not load the pickup list. Check your connection and that you are signed in as staff.'); return }
      setLoadErr('')
      setCands((data.candidates ?? []) as Candidate[])
    })
  }
  useEffect(() => { loadCandidates() }, [])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return cands
    return cands.filter(c => c.person_name.toLowerCase().includes(q) || c.phone.replace(/\D/g,'').includes(q.replace(/\D/g,'')))
  }, [cands, search])

  // Mark this parent registered — the one staff action. They then sign in by their own number.
  async function register(c: Candidate) {
    setBusyPhone(c.phone); setErr('')
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_mark_person_registered', { p_phone: c.phone })
    setBusyPhone('')
    if (error || !data?.ok) {
      setErr(data?.error === 'staff_only' ? 'You must be signed in as staff.' : 'Could not register this phone. Try again.')
      return
    }
    setCands(cs => cs.map(x => x.phone === c.phone ? { ...x, registered: true } : x))
  }

  // Kick: kill app access (device-trust + phone verification + registration). Keeps ✓Pickup.
  async function revoke(c: Candidate) {
    if (!window.confirm(`Revoke SafePass access for ${c.person_name}?\n\nTheir phone is signed out on every device and un-registered. They stay on the pickup list — tap Register again to restore access.`)) return
    setBusyPhone(c.phone); setErr('')
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_revoke_parent_trust', { p_phone: c.phone })
    setBusyPhone('')
    if (error || !data?.ok) {
      setErr(data?.error === 'not_authorized' ? 'That parent is not in your center.' : 'Could not revoke access. Try again.')
      return
    }
    setCands(cs => cs.map(x => x.phone === c.phone ? { ...x, registered: false, phone_verified: false } : x))
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
  const chip = (color:string, bg:string): React.CSSProperties => ({ fontSize:10, fontWeight:700, color, background:bg, borderRadius:999, padding:'1px 7px' })

  return (
    <div style={wrap}><div style={card}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18}}>
        <div style={{width:36,height:36,borderRadius:10,background:C.green,display:'grid',placeItems:'center',fontSize:18}}>📲</div>
        <div>
          <div style={{fontWeight:800,fontSize:16}}>SafePass — Register a parent's phone</div>
          <div style={{fontSize:11,color:C.muted}}>Staff only · tap Register once — the parent signs in with their own number</div>
        </div>
      </div>

      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search parent name or phone…" style={inp} />
      <div style={{height:12}}/>
      {loadErr ? (
        <div role="alert" style={{padding:'12px 14px',borderRadius:12,background:C.redDim,border:`1.5px solid ${C.red}`,color:C.red,fontSize:13,fontWeight:600,lineHeight:1.5}}>{loadErr}</div>
      ) : shown.length === 0 ? (
        <div style={{color:C.muted,fontSize:13,textAlign:'center',padding:'22px 8px'}}>{cands.length===0 ? 'No pickup-authorized parents for this center yet.' : 'No match.'}</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {shown.map(c => (
            <div key={c.phone} style={{display:'flex',alignItems:'center',gap:12,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 14px'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:15,display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
                  {c.person_name}
                  {c.registered && <span style={chip(C.green,C.greenDim)}>✓ registered</span>}
                  {c.phone_verified && <span style={chip(C.blue,'rgba(91,139,255,0.12)')}>✓ signed in</span>}
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>{prettyPhone(c.phone)} · {c.child_count} child{c.child_count===1?'':'ren'}</div>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                {c.registered ? (
                  <button onClick={()=>revoke(c)} disabled={busyPhone===c.phone} style={{...btn('transparent',C.red),border:`1px solid ${C.red}`}}>
                    {busyPhone===c.phone ? '…' : 'Revoke'}
                  </button>
                ) : (
                  <button onClick={()=>register(c)} disabled={busyPhone===c.phone} style={btn(busyPhone===c.phone?C.border:C.green)}>
                    {busyPhone===c.phone ? '…' : 'Register'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {err && <div role="alert" style={{marginTop:14,padding:'12px 14px',borderRadius:12,background:C.redDim,border:`1.5px solid ${C.red}`,color:C.red,fontSize:13,fontWeight:600}}>{err}</div>}

      {/* Quiet fallback: one-time typed code (NON-parent pickup / can't open the link) */}
      <div style={{marginTop:22,borderTop:`1px solid ${C.border}`,paddingTop:14}}>
        <button onClick={()=>setShowFallback(s=>!s)} style={{background:'transparent',border:'none',color:C.muted,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
          {showFallback?'▾':'▸'} Non-parent pickup / can't open the link — issue a one-time code instead
        </button>
        {showFallback && (
          <div style={{marginTop:10}}>
            <input type="tel" value={fbPhone} onChange={e=>setFbPhone(e.target.value)} placeholder="Phone (555) 000-0000" style={inp} onKeyDown={e=>e.key==='Enter'&&issueFallback()} />
            <div style={{height:8}}/>
            <button onClick={issueFallback} disabled={fbBusy||fbPhone.replace(/\D/g,'').length<10} style={{...btn(fbPhone.replace(/\D/g,'').length>=10?C.blue:C.border),width:'100%'}}>{fbBusy?'Issuing…':'Issue one-time code →'}</button>
            {fbErr && <div style={{color:C.red,fontSize:12.5,marginTop:8}}>{fbErr}</div>}
            {fbResult && (
              <div style={{marginTop:12,padding:'14px',borderRadius:12,background:C.surface,border:`1px solid ${C.border}`,textAlign:'center'}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Code for {fbResult.person} · {fbResult.kids} child{fbResult.kids===1?'':'ren'}</div>
                <div style={{fontSize:34,fontWeight:800,letterSpacing:'0.16em',color:C.blue}}>{fbResult.code}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:8}}>Read to the parent — valid 15 min, one use. They enter it on the SafePass sign-in screen.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div></div>
  )
}
