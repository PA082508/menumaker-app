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
//
// ФОТО ПРИ REGISTER (06.08). Регистрация — единственная минута, когда взрослый
// стоит перед сотрудником и его личность подтверждена присутствием. Снять лицо
// нужно ИМЕННО тогда: у двери сравнивать будет уже некогда и не с чем. Лицо
// живёт в приватном бакете `avatars` теми же рельсами, что лица детей и
// сотрудников (512px webp, чтение по signed URL), путь пишется в
// safepass_trusted_persons.photo_url.
// Отзыв УНОСИТ лицо: сначала RPC гасит колонку и возвращает пути, потом клиент
// сносит объекты. До 06.08 у бакета не было DELETE-политики вовсе — «убрано»
// означало лишь «не показываем», а снимок оставался лежать.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AVATAR } from '@/lib/avatarSizes'
import { supabase } from '@/lib/supabase'
import { safePassLight } from './shared/theme'
import { Link } from 'react-router-dom'
import { useOrg } from '@/contexts/OrgContext'
import Avatar from '@/components/Avatar'
import { uploadAvatar, deleteAvatar } from '@/lib/avatars'

// ⭐ КАНОН ВЛАДЕЛЬЦА 07.08: ЧЁРНЫЙ ФОН НА GATEPULSE ОТВЕРГНУТ. Эта страница была
// собственной тёмной темой (#0a0c12), и на ней дважды за день терялась дверь:
// «← Back to app» мерялась 3.87:1 и не находилась глазами. Своя палитра ушла —
// страница берёт ту же светлую, что и остальные поверхности учителя, и её пары
// меряет scripts/check-contrast.mjs, а не глаз.
const C = safePassLight()
type Candidate = { phone:string; person_name:string; child_count:number; phone_verified:boolean; registered:boolean; photo_url:string|null }
// Вид ПО ДЕТЯМ выбранного класса (заказ 06.08): раскатка идёт комнатами, и
// директор работает список комнаты сверху вниз. Ребёнок без доверенных из списка
// НЕ пропадает — иначе не видно, кого догонять оргработой.
type RoomChild = { id:string; name:string; adults:{ phone:string; person_name:string; photo_url:string|null; registered:boolean; phone_verified:boolean }[] }

export default function SafePassIssueCode() {
  const [cands, setCands] = useState<Candidate[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [search, setSearch] = useState('')
  const [busyPhone, setBusyPhone] = useState('')
  const [err, setErr] = useState('')

  // Фото-захват: лист подтверждения → камера. Кандидат, ради которого открыта
  // камера, держится отдельно — файл прилетает асинхронно, и к моменту возврата
  // список мог перерисоваться.
  // Класс-фильтр. 'all' — прежний плоский список родителей с поиском.
  const { currentCenter } = useOrg()
  const [rooms, setRooms] = useState<{id:string; name:string}[]>([])
  const [roomId, setRoomId] = useState<'all'|string>('all')
  const [roomKids, setRoomKids] = useState<RoomChild[]>([])
  const [roomErr, setRoomErr] = useState('')

  const [sheetFor, setSheetFor] = useState<Candidate|null>(null)
  const [photoFor, setPhotoFor] = useState<Candidate|null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

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

  // Список комнат центра — для фильтра. Центр берём из контекста организации.
  useEffect(() => {
    if (!currentCenter?.id) { setRooms([]); return }
    supabase.schema('menumaker').from('classrooms')
      .select('id,name,sort_order,is_roster').eq('center_id', currentCenter.id).eq('is_active', true)
      .order('sort_order')
      .then(({ data, error }) => {
        // Отказ чтения комнат не смеет выглядеть как «в центре нет классов»:
        // фильтр тогда просто не появится, и человек будет искать его глазами.
        if (error) { setRooms([]); setErr('Could not load the class list — the filter is unavailable. The full list below still works.'); return }
        setRooms(((data ?? []) as any[]).filter(r => r.is_roster !== false).map(r => ({ id: r.id, name: r.name })))
      })
  }, [currentCenter?.id])

  // Вид по детям выбранной комнаты. Ничего не записывает — только показывает.
  useEffect(() => {
    if (roomId === 'all') { setRoomKids([]); setRoomErr(''); return }
    let cancelled = false
    ;(async () => {
      const { data: roster, error: rErr } = await supabase.schema('menumaker').from('roster')
        .select('id,first_name,last_name,child_name')
        .eq('classroom_id', roomId).eq('is_active', true)
      if (cancelled) return
      if (rErr) { setRoomErr('Could not load this room.'); setRoomKids([]); return }
      const ids = (roster ?? []).map((r:any) => r.id as string)
      if (ids.length === 0) { setRoomErr(''); setRoomKids([]); return }
      const { data: tps, error: tErr } = await supabase.schema('menumaker').from('safepass_trusted_persons')
        .select('child_id,person_name,phone,photo_url,registered_at,phone_verified')
        .in('child_id', ids).eq('is_active', true)
      if (cancelled) return
      if (tErr) { setRoomErr('Could not load pickup rights for this room.'); setRoomKids([]); return }
      const byKid = new Map<string, RoomChild['adults']>()
      for (const t of (tps ?? []) as any[]) {
        const arr = byKid.get(t.child_id) ?? []
        arr.push({ phone: t.phone, person_name: t.person_name, photo_url: t.photo_url ?? null,
                   registered: t.registered_at != null, phone_verified: t.phone_verified === true })
        byKid.set(t.child_id, arr)
      }
      setRoomErr('')
      setRoomKids(((roster ?? []) as any[]).map(r => ({
        id: r.id as string,
        name: (r.first_name && r.last_name) ? `${r.first_name} ${r.last_name}` : (r.child_name ?? '—'),
        adults: byKid.get(r.id as string) ?? [],
      })).sort((a,b) => a.name.localeCompare(b.name)))
    })()
    return () => { cancelled = true }
  }, [roomId])

  const byPhone = useMemo(() => new Map(cands.map(c => [c.phone, c])), [cands])
  const candidateFor = (a: RoomChild['adults'][number]): Candidate =>
    byPhone.get(a.phone) ?? { phone: a.phone, person_name: a.person_name, child_count: 1,
      phone_verified: a.phone_verified, registered: a.registered, photo_url: a.photo_url }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return cands
    return cands.filter(c => c.person_name.toLowerCase().includes(q) || c.phone.replace(/\D/g,'').includes(q.replace(/\D/g,'')))
  }, [cands, search])

  // Mark this parent registered — the one staff action. They then sign in by their own number.
  // Фото не блокирует регистрацию: камеры может не быть, а доступ нужен сейчас.
  async function register(c: Candidate) {
    setSheetFor(null)
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

  // Камера открывается ТОЛЬКО по явному тапу — снимок человека не делается вслепую.
  function openCamera(c: Candidate) {
    setSheetFor(null)
    setPhotoFor(c)
    cameraRef.current?.click()
  }

  // Снимок → 512px webp → приватный бакет → путь в photo_url. Регистрация идёт
  // следом: если фото не легло, честнее сказать об этом и НЕ регистрировать молча.
  async function onPhotoPicked(file: File|undefined) {
    const c = photoFor
    setPhotoFor(null)
    if (!c || !file) return
    const digits = c.phone.replace(/\D/g, '')
    setBusyPhone(c.phone); setErr('')
    let path: string
    try {
      path = await uploadAvatar('parent', digits, file)
    } catch {
      setBusyPhone('')
      setErr('The photo did not upload. Check the connection and try again, or register without a photo.')
      return
    }
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_set_person_photo', { p_phone: c.phone, p_path: path })
    setBusyPhone('')
    if (error || !data?.ok) {
      setErr(data?.error === 'not_authorized' ? 'That parent is not in your center.' : 'The photo uploaded but did not save. Try again.')
      return
    }
    setCands(cs => cs.map(x => x.phone === c.phone ? { ...x, photo_url: path } : x))
    if (!c.registered) await register({ ...c, photo_url: path })
  }

  // Kick: kill app access (device-trust + phone verification + registration). Keeps ✓Pickup.
  async function revoke(c: Candidate) {
    if (!window.confirm(`Revoke SafePass access for ${c.person_name}?\n\nTheir phone is signed out on every device and un-registered, and their photo is deleted. They stay on the pickup list — tap Register again to restore access.`)) return
    setBusyPhone(c.phone); setErr('')
    const { data, error } = await supabase.schema('menumaker')
      .rpc('safepass_revoke_parent_trust', { p_phone: c.phone })
    if (error || !data?.ok) {
      setBusyPhone('')
      setErr(data?.error === 'not_authorized' ? 'That parent is not in your center.' : 'Could not revoke access. Try again.')
      return
    }
    // Колонка погашена сервером; объекты сносим тем же жестом. Если снос не
    // прошёл — говорим об этом вслух: молчаливо оставленное лицо и есть та самая
    // канон-дыра, ради которой заход и делался.
    const left: string[] = []
    for (const p of ((data.photos ?? []) as string[])) if (!(await deleteAvatar(p))) left.push(p)
    setBusyPhone('')
    if (left.length) setErr('Access is revoked, but the photo could not be deleted from storage. Tell Nikolay — it must not stay.')
    setCands(cs => cs.map(x => x.phone === c.phone ? { ...x, registered: false, phone_verified: false, photo_url: null } : x))
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
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:16}}>SafePass — Register a parent's phone</div>
          <div style={{fontSize:11,color:C.muted}}>Staff only · tap Register once — the parent signs in with their own number</div>
        </div>
        {/* Страница смонтирована ВНЕ приложения (свой тёмный экран), поэтому дверь
            обратно нужна явная — иначе выход только кнопкой браузера.
            07.08, глаз владельца: «есть на экране ≠ заметна». Ссылка была мелким
            серо-фиолетовым текстом 12px (#6b7299 на карточке #13161f — измерено
            3.87:1, ниже порога AA 4.5 для мелкого текста) и не находилась глазами.
            Лечится тем же классом, что белая Cancel: НАСТОЯЩАЯ кнопка — белый фон,
            тёмный текст, высота тапа 44px. Измерено ОБОИМИ концами:
            текст #0a0c12 на белом — 19.55:1, сама кнопка на карточке — 18.07:1. */}
        <Link to="/children" style={{
          display:'inline-flex', alignItems:'center', justifyContent:'center',
          minHeight:44, padding:'0 16px', borderRadius:10,
          // Белая кнопка была придумана ПРОТИВ тёмного фона; на светлой странице
          // белое на белом — это снова призрак. Класс тот же (дверь видна без
          // поиска), исполнение зеркальное: тёмная заливка на светлом листе.
          // Измерено обоими концами: текст #ffffff на #101521 — 18.3:1,
          // сама кнопка на карточке #ffffff — те же 18.3:1.
          background:C.text, color:C.surface, fontSize:14, fontWeight:700,
          textDecoration:'none', whiteSpace:'nowrap',
        }}>← Back to app</Link>
      </div>

      {/* Класс-фильтр — ПЕРВЫМ, над поиском: раскатка идёт комнатами (Red первым),
          и директор работает список комнаты сверху вниз. */}
      {rooms.length > 0 && (
        <>
          <select value={roomId} onChange={e=>setRoomId(e.target.value as any)}
            style={{...inp, appearance:'none', cursor:'pointer'}}>
            <option value="all">All classes</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <div style={{height:10}}/>
        </>
      )}

      {roomId === 'all' && <><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search parent name or phone…" style={inp} />
      <div style={{height:12}}/></>}
      {roomId !== 'all' ? (
        roomErr ? (
          <div role="alert" style={{padding:'12px 14px',borderRadius:12,background:C.redDim,border:`1.5px solid ${C.red}`,color:C.red,fontSize:13,fontWeight:600}}>{roomErr}</div>
        ) : roomKids.length === 0 ? (
          <div style={{color:C.muted,fontSize:13,textAlign:'center',padding:'22px 8px'}}>No children in this room.</div>
        ) : (
          <>
            {/* Счётчик честный: сколько детей и сколько взрослых уже зарегистрировано. */}
            <div style={{fontSize:11.5,color:C.muted,marginBottom:10}}>
              {roomKids.length} {roomKids.length===1?'child':'children'} · {roomKids.reduce((n,k)=>n+k.adults.filter(a=>a.registered).length,0)} adults registered
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {roomKids.map(k => (
                <div key={k.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'10px 14px'}}>
                  <div style={{fontWeight:700,fontSize:14.5,marginBottom:k.adults.length?8:4}}>{k.name}</div>
                  {k.adults.length === 0 ? (
                    // Ребёнок из списка НЕ пропадает: это работа, а не пустота.
                    <div style={{fontSize:12.5,color:C.amber,fontWeight:600}}>Nobody authorized to pick up yet</div>
                  ) : k.adults.map(a => (
                    <div key={a.phone+a.person_name} style={{display:'flex',alignItems:'center',gap:10,padding:'5px 0'}}>
                      <div onClick={()=>openCamera(candidateFor(a))} style={{cursor:'pointer',flexShrink:0}} title={a.photo_url?'Retake photo':'Take photo'}>
                        <Avatar name={a.person_name} path={a.photo_url} size={AVATAR.row} />
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13.5,fontWeight:600}}>{a.person_name}</div>
                        <div style={{fontSize:11.5,color:C.muted}}>{prettyPhone(a.phone)}</div>
                      </div>
                      {a.registered
                        ? <span style={chip(C.green,C.greenDim)}>✓ registered</span>
                        : <button onClick={()=>setSheetFor(candidateFor(a))} disabled={busyPhone===a.phone}
                            style={btn(busyPhone===a.phone?C.border:C.green)}>{busyPhone===a.phone?'…':'Register'}</button>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )
      ) : loadErr ? (
        <div role="alert" style={{padding:'12px 14px',borderRadius:12,background:C.redDim,border:`1.5px solid ${C.red}`,color:C.red,fontSize:13,fontWeight:600,lineHeight:1.5}}>{loadErr}</div>
      ) : shown.length === 0 ? (
        <div style={{color:C.muted,fontSize:13,textAlign:'center',padding:'22px 8px'}}>{cands.length===0 ? 'No pickup-authorized parents for this center yet.' : 'No match.'}</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {shown.map(c => (
            <div key={c.phone} style={{display:'flex',alignItems:'center',gap:12,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 14px'}}>
              {/* Лицо — то, по чему взрослого узнают у двери. Тап по нему
                  переснимает: человек меняется, снимок должен догонять. */}
              <div onClick={()=>openCamera(c)} style={{cursor:'pointer',flexShrink:0}} title={c.photo_url ? 'Retake photo' : 'Take photo'}>
                <Avatar name={c.person_name} path={c.photo_url} size={AVATAR.row} />
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:15,display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
                  {c.person_name}
                  {c.registered && <span style={chip(C.green,C.greenDim)}>✓ registered</span>}
                  {c.phone_verified && <span style={chip(C.blue,'rgba(91,139,255,0.12)')}>✓ signed in</span>}
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                  {prettyPhone(c.phone)} · {c.child_count} child{c.child_count===1?'':'ren'}
                  {c.registered && !c.photo_url && <> · <span style={{color:C.blue,cursor:'pointer'}} onClick={()=>openCamera(c)}>📷 add photo</span></>}
                </div>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                {c.registered ? (
                  <button onClick={()=>revoke(c)} disabled={busyPhone===c.phone} style={{...btn('transparent',C.red),border:`1px solid ${C.red}`}}>
                    {busyPhone===c.phone ? '…' : 'Revoke'}
                  </button>
                ) : (
                  <button onClick={()=>setSheetFor(c)} disabled={busyPhone===c.phone} style={btn(busyPhone===c.phone?C.border:C.green)}>
                    {busyPhone===c.phone ? '…' : 'Register'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Шаг съёмки: пока лицо грузится, у человека тоже должен быть выход.
          Отступление ничего не пишет — регистрация не начиналась. */}
      {busyPhone && (
        <div style={{marginTop:14,display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:12,background:C.surface,border:`1px solid ${C.border}`}}>
          <span style={{fontSize:13,color:C.muted,flex:1}}>Working on {prettyPhone(busyPhone)}…</span>
          <button onClick={()=>{ setBusyPhone(''); setPhotoFor(null); setErr('') }}
            style={{...btn(C.text,C.surface),padding:'8px 12px',fontSize:13}}>
            ← Cancel
          </button>
        </div>
      )}

      {err && <div role="alert" style={{marginTop:14,padding:'12px 14px',borderRadius:12,background:C.redDim,border:`1.5px solid ${C.red}`,color:C.red,fontSize:13,fontWeight:600}}>{err}</div>}

      {/* Камера. `capture="environment"` — задняя: сотрудник снимает стоящего
          перед ним взрослого, а не себя. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:'none'}}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onPhotoPicked(f) }} />

      {/* Лист регистрации. Фото — предложенный путь, но не запертая дверь:
          «Register without a photo» рядом, потому что доступ нужен сегодня, а
          камера бывает не у всех. */}
      {sheetFor && (
        <div onClick={()=>setSheetFor(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'grid',placeItems:'end center',zIndex:50}}>
          <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:480,background:C.surface,borderRadius:'18px 18px 0 0',border:`1px solid ${C.border}`,padding:'18px 20px 26px'}}>
            <div style={{fontWeight:800,fontSize:16,marginBottom:4}}>Register {sheetFor.person_name}</div>
            <div style={{fontSize:12.5,color:C.muted,lineHeight:1.5,marginBottom:16}}>
              They are standing in front of you — this is the moment to take the photo. At the door
              the photo is what tells staff this is the right adult.
            </div>
            <button onClick={()=>openCamera(sheetFor)} style={{...btn(C.green),width:'100%',padding:'14px 16px',fontSize:15}}>📷 Take photo & register</button>
            <div style={{height:10}}/>
            <button onClick={()=>register(sheetFor)} style={{background:'transparent',border:'none',color:C.muted,fontSize:12.5,cursor:'pointer',fontFamily:'inherit',width:'100%',padding:'8px 0'}}>
              Register without a photo
            </button>
            {/* ВИДИМЫЙ путь назад. Тап мимо листа дверью не считается: невидимую
                дверь человек не находит, а уходить с чужого экрана надо уметь. */}
            {/* Видимая, а не рамочная (слово владельца 06.08): выход должен
                находиться без поиска. На светлой теме (канон 07.08) это тёмная
                заливка — 18.3:1 обоими концами. */}
            <button onClick={()=>setSheetFor(null)}
              style={{...btn(C.text,C.surface),width:'100%',marginTop:4}}>
              ← Cancel — nothing is registered
            </button>
          </div>
        </div>
      )}

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
