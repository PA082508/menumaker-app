// SafePassIssueCode.tsx — route /safepass/issue (STAFF, authenticated)
//
// Staff-issued parent login codes. A staff member (director on a laptop, or the
// centre service-account session on the portal tablet) enters the parent's phone,
// gets a 6-digit code, and reads it to the parent — who then enters it on
// /safepass/parent. The code is delivered out of band; the parent's browser never
// holds it. This is the pilot stand-in for SMS (A2P 10DLC registration is the long
// pole and cannot land this week).
//
// The issue RPC is granted to authenticated only — anon cannot mint codes.
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const C = {
  bg:'#0a0c12', surface:'#13161f', border:'#252a3d', text:'#f0f2ff',
  muted:'#6b7299', green:'#00e896', red:'#ff4d6a',
}

export default function SafePassIssueCode() {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ code:string; person:string; kids:number }|null>(null)
  const [err, setErr] = useState('')

  const normPhone = (p:string) => '+1' + p.replace(/\D/g,'').slice(-10)

  async function issue() {
    setBusy(true); setErr(''); setResult(null)
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_issue_login_code', { p_phone: normPhone(phone) })
    setBusy(false)
    if (error) { setErr('Could not issue a code. Check your connection and that you are signed in.'); return }
    if (!data?.ok) {
      setErr(data?.error === 'not_authorized'
        ? 'That phone is not registered for any child. Add the parent first, then issue a code.'
        : data?.error === 'staff_only'
        ? 'You must be signed in as staff to issue a code.'
        : 'Could not issue a code.')
      return
    }
    setResult({ code: data.code, person: data.person_name ?? 'Parent', kids: data.child_count ?? 0 })
  }

  const wrap: React.CSSProperties = { minHeight:'100vh', background:C.bg, color:C.text,
    fontFamily:"'Inter',sans-serif", display:'flex', flexDirection:'column', alignItems:'center', padding:'24px 0' }
  const card: React.CSSProperties = { width:'100%', maxWidth:460, padding:'0 20px' }
  const inp: React.CSSProperties = { width:'100%', padding:'14px 16px', borderRadius:12,
    border:`1.5px solid ${C.border}`, background:C.surface, color:C.text, fontSize:18,
    fontFamily:'inherit', textAlign:'center', boxSizing:'border-box' }
  const btn = (bg:string): React.CSSProperties => ({ width:'100%', padding:'16px', borderRadius:12,
    border:'none', background:bg, color:C.bg, fontSize:16, fontWeight:700, cursor:'pointer', fontFamily:'inherit' })

  return (
    <div style={wrap}><div style={card}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24}}>
        <div style={{width:36,height:36,borderRadius:10,background:C.green,display:'grid',placeItems:'center',fontSize:18}}>🔑</div>
        <div>
          <div style={{fontWeight:800,fontSize:16}}>SafePass — Issue Login Code</div>
          <div style={{fontSize:11,color:C.muted}}>Staff only · read the code to the parent</div>
        </div>
      </div>

      <div style={{fontSize:13,color:C.muted,marginBottom:8}}>Parent's registered phone number</div>
      <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)}
        placeholder="(555) 000-0000" style={inp} onKeyDown={e=>e.key==='Enter'&&issue()} />
      <div style={{height:14}}/>
      <button onClick={issue} disabled={busy||phone.replace(/\D/g,'').length<10}
        style={btn(phone.replace(/\D/g,'').length>=10?C.green:C.border)}>
        {busy?'Issuing…':'Issue code →'}
      </button>

      {err && (
        <div role="alert" style={{marginTop:16,padding:'12px 14px',borderRadius:12,
          background:'rgba(255,77,106,0.12)',border:`1.5px solid ${C.red}`,color:C.red,
          fontSize:13,fontWeight:600,lineHeight:1.5}}>{err}</div>
      )}

      {result && (
        <div style={{marginTop:20,padding:'20px',borderRadius:14,background:C.surface,
          border:`1.5px solid ${C.green}`,textAlign:'center'}}>
          <div style={{fontSize:12,color:C.muted,marginBottom:6}}>
            Code for {result.person} · {result.kids} child{result.kids===1?'':'ren'}
          </div>
          <div style={{fontSize:44,fontWeight:800,letterSpacing:'0.18em',color:C.green}}>{result.code}</div>
          <div style={{fontSize:12,color:C.muted,marginTop:10,lineHeight:1.5}}>
            Read this to the parent. Valid 15 minutes, one use.<br/>
            They enter it on the SafePass parent screen.
          </div>
        </div>
      )}
    </div></div>
  )
}
