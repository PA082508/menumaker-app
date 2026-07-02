// src/pages/messages/MessagesPage.tsx
// Internal messaging system — staff only
// Supports: text, files, photos (with document detection), group/individual send

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useOrg } from '@/contexts/OrgContext'
import { detectAndCrop } from '@/lib/detectAndCrop'

type Recipient = { type: 'role' | 'user'; value: string; label: string }
type StaffUser = { id: string; email: string; display_name: string; role: string }
type Message = {
  id: string
  sender_name: string
  body: string
  attachments: string[]
  created_at: string
  recipient_label: string
}

const ROLE_GROUPS = [
  { value: 'teacher', label: '👩‍🏫 All Teachers' },
  { value: 'cook',    label: '👨‍🍳 All Cooks' },
  { value: 'director',label: '📊 All Directors' },
  { value: 'all',     label: '📢 Everyone' },
]

export default function MessagesPage() {
  const { user } = useAuth()
  const { org, currentCenter } = useOrg()
  const [messages, setMessages] = useState<Message[]>([])
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
  const [showIndividual, setShowIndividual] = useState(false)
  const [body, setBody] = useState('')
  const [recipient, setRecipient] = useState<Recipient>(ROLE_GROUPS[3] as any)
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadMessages(); loadStaff() }, [org?.id])

  async function loadStaff() {
    if (!org?.id) return
    const { data } = await supabase.schema('menumaker')
      .from('user_roles')
      .select('user_id, role, org_id')
      .eq('org_id', org.id)
    if (!data?.length) return
    // Get emails from auth via RPC or just use user_id as label
    setStaffUsers(data.map((u: any) => ({
      id: u.user_id,
      email: u.user_id,
      display_name: u.role,
      role: u.role
    })))
  }

  async function loadMessages() {
    if (!org?.id) return
    setLoading(true)
    const { data } = await supabase.schema('menumaker')
      .from('internal_messages')
      .select('*')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setMessages((data || []) as Message[])
    setLoading(false)
  }

  async function handleFiles(incoming: FileList | null) {
    if (!incoming) return
    const processed: File[] = []
    for (const f of Array.from(incoming)) {
      processed.push(await detectAndCrop(f))
    }
    setFiles(prev => [...prev, ...processed])
  }

  async function send() {
    if (!body.trim() && !files.length) return
    setSending(true)
    try {
      // Upload attachments
      const urls: string[] = []
      for (const f of files) {
        const path = `messages/${org?.id}/${Date.now()}_${f.name}`
        const { data } = await supabase.storage.from('org-files').upload(path, f, { upsert: true })
        if (data) urls.push(path)
      }

      // Save message
      await supabase.schema('menumaker').from('internal_messages').insert({
        org_id: org?.id,
        center_id: currentCenter?.id ?? null,
        sender_id: user?.id,
        sender_name: user?.email,
        recipient_type: (recipient as any).type || 'role',
        recipient_value: (recipient as any).value,
        recipient_label: (recipient as any).label,
        body: body.trim(),
        attachments: urls,
      })

      // Send push notification to recipients
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          org_id: org?.id,
          center_id: currentCenter?.id,
          title: `📨 Message from ${user?.email?.split('@')[0]}`,
          body: body.trim().slice(0, 100),
          url: '/messages',
          tag: 'internal-message',
          urgent: false
        })
      })

      setBody(''); setFiles([])
      await loadMessages()
    } finally {
      setSending(false)
    }
  }

  const C = {
    bg:'#f4f7f4', surface:'#fff', border:'#e0ebe0',
    green:'#0f4c35', greenLight:'#7ee8b0', muted:'#6b7280'
  }

  return (
    <div style={{ padding:'24px', fontFamily:"'DM Sans',sans-serif", maxWidth:800, margin:'0 auto' }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:C.green, margin:0 }}>📨 Messages</h1>
        <p style={{ color:C.muted, fontSize:13, margin:'4px 0 0' }}>Send to groups or individuals · files · photos · scans</p>
      </div>

      {/* Compose */}
      <div style={{ background:C.surface, border:`1.5px solid ${C.border}`, borderRadius:14, padding:20, marginBottom:20 }}>
        {/* Recipient selector */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>To</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {ROLE_GROUPS.map(g => (
              <button key={g.value} onClick={() => { setRecipient(g as any); setShowIndividual(false) }}
                style={{ padding:'6px 14px', borderRadius:20, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                  border:`1.5px solid ${(recipient as any).value===g.value && !showIndividual ? C.green : C.border}`,
                  background:(recipient as any).value===g.value && !showIndividual ? C.green : C.surface,
                  color:(recipient as any).value===g.value && !showIndividual ? '#fff' : C.muted }}>
                {g.label}
              </button>
            ))}
            <button onClick={() => setShowIndividual(v => !v)}
              style={{ padding:'6px 14px', borderRadius:20, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                border:`1.5px solid ${showIndividual ? C.green : C.border}`,
                background:showIndividual ? C.green : C.surface,
                color:showIndividual ? '#fff' : C.muted }}>
              👤 Individual
            </button>
          </div>
          {showIndividual && (
            <select onChange={e => {
              const u = staffUsers.find(s => s.id === e.target.value)
              if (u) setRecipient({ type: 'user', value: u.id, label: u.display_name || u.email })
            }} style={{ marginTop:10, width:'100%', padding:'10px 12px', borderRadius:10, border:`1.5px solid ${C.border}`, fontSize:14, fontFamily:'inherit', background:C.surface }}>
              <option value="">Select person...</option>
              {staffUsers.map(u => (
                <option key={u.id} value={u.id}>{u.role} — {u.id.slice(0,8)}</option>
              ))}
            </select>
          )}
        </div>

        {/* Message body */}
        <textarea value={body} onChange={e=>setBody(e.target.value)}
          placeholder="Type your message..."
          style={{ width:'100%', minHeight:100, padding:12, borderRadius:10, border:`1.5px solid ${C.border}`,
            fontSize:14, fontFamily:'inherit', resize:'vertical', outline:'none', boxSizing:'border-box' }}/>

        {/* Attachments preview */}
        {files.length > 0 && (
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', margin:'10px 0' }}>
            {files.map((f,i) => (
              <div key={i} style={{ position:'relative' }}>
                {f.type.startsWith('image/') ? (
                  <img src={URL.createObjectURL(f)} style={{ width:70, height:70, borderRadius:8, objectFit:'cover', border:`1.5px solid ${C.border}` }}/>
                ) : (
                  <div style={{ width:70, height:70, borderRadius:8, background:'#f0f7f4', border:`1.5px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>📄</div>
                )}
                <button onClick={() => setFiles(prev=>prev.filter((_,j)=>j!==i))}
                  style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:'#ff4d6a', border:'none', color:'#fff', cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center' }}>
          <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" style={{ display:'none' }}
            onChange={e=>handleFiles(e.target.files)}/>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
            onChange={e=>handleFiles(e.target.files)}/>
          <button onClick={()=>cameraRef.current?.click()}
            style={{ padding:'8px 14px', borderRadius:8, border:`1.5px solid ${C.border}`, background:C.surface, cursor:'pointer', fontSize:18 }}>
            📷
          </button>
          <button onClick={()=>fileRef.current?.click()}
            style={{ padding:'8px 14px', borderRadius:8, border:`1.5px solid ${C.border}`, background:C.surface, cursor:'pointer', fontSize:18 }}>
            📎
          </button>
          <button onClick={send} disabled={sending || (!body.trim() && !files.length)}
            style={{ marginLeft:'auto', padding:'10px 24px', borderRadius:10, background:C.green, color:'#fff', border:'none',
              cursor:'pointer', fontWeight:700, fontSize:14, fontFamily:'inherit', opacity:sending?0.6:1 }}>
            {sending ? 'Sending…' : 'Send →'}
          </button>
        </div>
      </div>

      {/* Messages list */}
      <div>
        <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Recent Messages</div>
        {loading ? <div style={{ color:C.muted, fontSize:13 }}>Loading…</div> : messages.length === 0 ? (
          <div style={{ color:C.muted, fontSize:13, textAlign:'center', padding:'40px 0' }}>No messages yet</div>
        ) : messages.map(m => (
          <div key={m.id} style={{ background:C.surface, border:`1.5px solid ${C.border}`, borderRadius:12, padding:'14px 16px', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontWeight:700, fontSize:13, color:C.green }}>{m.sender_name?.split('@')[0]}</span>
              <span style={{ fontSize:11, color:C.muted }}>{new Date(m.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
            </div>
            <div style={{ fontSize:11, color:C.muted, marginBottom:6 }}>→ {m.recipient_label}</div>
            <div style={{ fontSize:14, color:'#1a2e1a', lineHeight:1.6 }}>{m.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
