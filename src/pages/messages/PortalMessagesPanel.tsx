// src/pages/messages/PortalMessagesPanel.tsx
// Simplified messaging panel for teacher/cook portal
// Can only: receive messages + send to director

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useOrg } from '@/contexts/OrgContext'
import { detectAndCrop } from '@/lib/detectAndCrop'

export default function PortalMessagesPanel({ centerCode, portalRole }: { centerCode: string; portalRole: string }) {
  const { user } = useAuth()
  const { org, currentCenter } = useOrg()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (org?.id) loadMessages()
  }, [org?.id, open])

  async function loadMessages() {
    if (!org?.id) return
    const { data } = await supabase.schema('menumaker')
      .from('internal_messages')
      .select('*')
      .eq('org_id', org.id)
      .or(`recipient_value.eq.${user?.id},recipient_value.eq.teacher,recipient_value.eq.cook,recipient_value.eq.all`)
      .order('created_at', { ascending: false })
      .limit(20)
    setMessages(data || [])
    setUnread((data || []).filter((m: any) => !m.read_by?.includes(user?.id)).length)
  }

  async function send() {
    if (!body.trim() && !files.length) return
    setSending(true)
    try {
      const urls: string[] = []
      for (const f of files) {
        const path = `messages/${org?.id}/${Date.now()}_${f.name}`
        const { data } = await supabase.storage.from('org-files').upload(path, f, { upsert: true })
        if (data) urls.push(path)
      }
      await supabase.schema('menumaker').from('internal_messages').insert({
        org_id: org?.id,
        center_id: currentCenter?.id ?? null,
        sender_id: user?.id,
        sender_name: `${portalRole} (${centerCode})`,
        recipient_type: 'role',
        recipient_value: 'director',
        recipient_label: '📊 Director',
        body: body.trim(),
        attachments: urls,
      })
      setBody(''); setFiles([])
      await loadMessages()
    } finally { setSending(false) }
  }

  const C = { green:'#0f4c35', light:'#7ee8b0', border:'#e0ebe0', muted:'#6b7280' }

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>
      {/* Toggle button */}
      <button onClick={() => setOpen(v => !v)} style={{
        width:'100%', padding:'14px 20px', background: open ? '#0a3320' : '#f0f7f4',
        border:'none', borderTop:`2px solid ${C.border}`, cursor:'pointer',
        display:'flex', alignItems:'center', gap:10, fontFamily:'inherit'
      }}>
        <span style={{ fontSize:20 }}>📨</span>
        <span style={{ fontWeight:700, fontSize:15, color: open ? '#7ee8b0' : C.green }}>Messages</span>
        {unread > 0 && (
          <span style={{ marginLeft:'auto', background:'#ff4d6a', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700 }}>
            {unread} new
          </span>
        )}
        <span style={{ marginLeft: unread > 0 ? 8 : 'auto', color:C.muted, fontSize:13 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding:16, background:'#f9fafb' }}>
          {/* Compose — to director only */}
          <div style={{ background:'#fff', border:`1.5px solid ${C.border}`, borderRadius:12, padding:14, marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', marginBottom:8 }}>
              To: 📊 Director
            </div>
            <textarea value={body} onChange={e=>setBody(e.target.value)}
              placeholder="Write to your director..."
              rows={3}
              style={{ width:'100%', padding:10, borderRadius:8, border:`1.5px solid ${C.border}`,
                fontSize:14, fontFamily:'inherit', resize:'none', outline:'none', boxSizing:'border-box' }}/>

            {files.length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', margin:'8px 0' }}>
                {files.map((f,i) => (
                  <div key={i} style={{ position:'relative' }}>
                    {f.type.startsWith('image/') ? (
                      <img src={URL.createObjectURL(f)} style={{ width:60, height:60, borderRadius:8, objectFit:'cover' }}/>
                    ) : (
                      <div style={{ width:60, height:60, borderRadius:8, background:'#f0f7f4', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>📄</div>
                    )}
                    <button onClick={() => setFiles(p=>p.filter((_,j)=>j!==i))}
                      style={{ position:'absolute', top:-5, right:-5, width:18, height:18, borderRadius:'50%', background:'#ff4d6a', border:'none', color:'#fff', cursor:'pointer', fontSize:10 }}>×</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:'flex', gap:8, marginTop:10 }}>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
                onChange={async e => { const f = e.target.files?.[0]; if(f) setFiles(p=>[...p, f]) }}/>
              <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx" style={{ display:'none' }}
                onChange={async e => {
                  const fs = Array.from(e.target.files||[])
                  const cropped = await Promise.all(fs.map(detectAndCrop))
                  setFiles(p=>[...p,...cropped])
                }}/>
              <button onClick={()=>cameraRef.current?.click()}
                style={{ padding:'8px 12px', borderRadius:8, border:`1.5px solid ${C.border}`, background:'#fff', cursor:'pointer', fontSize:16 }}>📷</button>
              <button onClick={()=>fileRef.current?.click()}
                style={{ padding:'8px 12px', borderRadius:8, border:`1.5px solid ${C.border}`, background:'#fff', cursor:'pointer', fontSize:16 }}>📎</button>
              <button onClick={send} disabled={sending||(!body.trim()&&!files.length)}
                style={{ marginLeft:'auto', padding:'8px 20px', borderRadius:8, background:C.green, color:'#fff',
                  border:'none', cursor:'pointer', fontWeight:700, fontSize:13, fontFamily:'inherit', opacity:sending?0.6:1 }}>
                {sending ? 'Sending…' : 'Send →'}
              </button>
            </div>
          </div>

          {/* Received messages */}
          <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', marginBottom:8 }}>Received</div>
          {messages.length === 0 ? (
            <div style={{ color:C.muted, fontSize:13, textAlign:'center', padding:'20px 0' }}>No messages yet</div>
          ) : messages.map((m:any) => (
            <div key={m.id} style={{ background:'#fff', border:`1.5px solid ${C.border}`, borderRadius:10, padding:'12px 14px', marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontWeight:700, fontSize:12, color:C.green }}>{m.sender_name?.split('@')[0]}</span>
                <span style={{ fontSize:11, color:C.muted }}>{new Date(m.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
              </div>
              <div style={{ fontSize:13, color:'#1a2e1a', lineHeight:1.6 }}>{m.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
