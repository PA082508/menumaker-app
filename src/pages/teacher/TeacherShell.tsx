// TeacherShell.tsx — App учителя v1, адрес /teacher.
//
// ЧТО ЭТО. Дом с ТРЕМЯ вкладками под ОДНИМ входом: ДЕТИ · ПИТАНИЕ · МОЁ ВРЕМЯ.
// v1 — СБОРКА из готовых кусков, а не новые функции: «Дети» — существующий
// SafePassTeacherPage целиком, «Питание» — существующий MealCountPage в том же
// портальном режиме, что и раньше. Новое ровно одно — вкладка «Моё время».
//
// КТО И ГДЕ. Токен устройства говорит ГДЕ мы (центр и комната), PIN говорит КТО.
// Канон 07.08 «PIN не повышает роль» (docs/specs/2026-08-07-pin-capability-split.md):
// сервер сперва проверяет точку и охват (живое устройство, сотрудник ЭТОГО центра),
// и только потом сверяет подпись — порядок держится внутри safepass_identify_by_pin.
//
// ИМЯ НЕ ХРАНИТСЯ. Опознание живёт В ПАМЯТИ вкладки и умирает вместе с ней: планшет
// общий, и «кто вошёл» не должно пережить перезагрузку. Единственное, что хранится
// на устройстве, — токен, он про место, а не про человека.
//
// ГЛАВНАЯ ОПАСНОСТЬ, КОТОРУЮ ЭТОТ ЭКРАН ОБЯЗАН ЗАКРЫТЬ: имя, залипшее на чужих
// галочках. Поэтому имя вошедшего видно ВСЕГДА в шапке, кнопка «Switch person»
// стоит постоянно (слово владельца), а 5 минут без касаний возвращают к вводу PIN.
// Именные отметки, сделанные под чужим именем, хуже безымянных — они врут фамилией.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PinPad, { humanPinError } from '@/pages/safepass/shared/PinPad'
import { safePassPalette } from '@/pages/safepass/shared/theme'
import {
  adoptDeviceTokenFromUrl, fetchDeviceContext, identifyByPin, fetchMyTime,
  type DeviceContext, type TeacherIdentity, type HandoffResult,
} from '@/lib/safepassDevice'
import { pairShifts, sumShiftHours, type Shift } from '@/lib/staffHours'
import { supabase } from '@/lib/supabase'
import SafePassTeacherPage from '@/pages/safepass/SafePassTeacherPage'
import MealCountPage from '@/pages/meal-count/MealCountPage'

const P = safePassPalette()

// Пять минут без касаний — слово владельца 07.08. Смена человека за планшетом
// не рвёт его ЧАСЫ: чек-аут остаётся отдельным осознанным жестом во вкладке
// «Дети», а таймаут только закрывает ИМЯ.
const IDLE_MS = 5 * 60 * 1000

// Служебные учётки по центрам — те же, что у /portal/teacher/<центр>. Вкладка
// «Питание» это существующий MealCountPage, а он живёт под сессией; заводить для
// него второй механизм входа значило бы развести два способа делать одно и то же.
const CENTER_CREDENTIALS: Record<string, { email: string; password: string }> = {
  ridge: { email: 'playacademyusa+ridge.cook@gmail.com', password: 'Ridge2026!' },
  pearl: { email: 'playacademyusa+pearl.cook@gmail.com', password: 'Pearl2026!' },
  alpha: { email: 'playacademyusa+alpha.cook@gmail.com', password: 'Alpha2026!' },
}

type Tab = 'children' | 'meals' | 'time'
const TABS: { key: Tab; label: string; needsRoom: boolean }[] = [
  { key: 'children', label: '👶 Children', needsRoom: true },
  { key: 'meals',    label: '🍽 Meals',     needsRoom: true },
  { key: 'time',     label: '🕒 My time',   needsRoom: false },
]

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' })

export default function TeacherShell() {
  const [token] = useState<string | null>(() => adoptDeviceTokenFromUrl())
  const [ctx, setCtx] = useState<DeviceContext | null>(null)
  const [bootError, setBootError] = useState<string>('')
  // Опознание и хэш PIN живут ТОЛЬКО в памяти: хэш нужен, чтобы спросить свои
  // смены, и уходит вместе с человеком.
  const [who, setWho] = useState<TeacherIdentity | null>(null)
  const [pinRef, setPinRef] = useState<string>('')
  const [tab, setTab] = useState<Tab>('children')
  const pending = useRef<TeacherIdentity | null>(null)

  // ── Add to Home Screen: своё имя, своя иконка, своё окно ───────────────────
  // Требование спеки, тот же приём, что у водительской двери: теги висят, ПОКА
  // открыт этот экран, — домашний экран меняется только у того, кто на нём стоит,
  // и ничей чужой ярлык не переписывается. iOS читает apple-touch-icon и метки
  // apple-mobile-*, Chrome — манифест; поэтому ставится и то, и другое.
  // Проба людская: ставится на живой iPhone и живой Android и смотрится глазами —
  // в вёрстке этого не увидеть.
  useEffect(() => {
    const added: HTMLElement[] = []
    const put = (tag: string, attrs: Record<string, string>) => {
      const el = document.createElement(tag)
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
      document.head.appendChild(el); added.push(el)
    }
    put('link', { rel: 'manifest', href: '/teacher.webmanifest' })
    put('link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/teacher-icon-180.png' })
    put('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' })
    put('meta', { name: 'apple-mobile-web-app-title', content: 'Teacher' })
    put('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' })
    put('meta', { name: 'theme-color', content: '#0f4c35' })
    const prevTitle = document.title
    document.title = 'Teacher'
    return () => { added.forEach(el => el.remove()); document.title = prevTitle }
  }, [])

  // ── ГДЕ мы: токен ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setBootError('no-token'); return }
    let cancelled = false
    fetchDeviceContext(token)
      .then(c => { if (!cancelled) setCtx(c) })
      .catch(e => { if (!cancelled) setBootError(humanPinError(e?.message ?? '')) })
    return () => { cancelled = true }
  }, [token])

  // ── Таймаут бездействия: закрывает ИМЯ, не смену ───────────────────────────
  const lastTouch = useRef<number>(Date.now())
  useEffect(() => {
    if (!who) return
    const touch = () => { lastTouch.current = Date.now() }
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const
    for (const e of events) window.addEventListener(e, touch, { passive: true })
    const t = setInterval(() => {
      if (Date.now() - lastTouch.current >= IDLE_MS) { setWho(null); setPinRef('') }
    }, 10_000)
    return () => {
      for (const e of events) window.removeEventListener(e, touch)
      clearInterval(t)
    }
  }, [who])

  // ── Сессия служебной учётки — только ради вкладки «Питание» ────────────────
  const [mealsReady, setMealsReady] = useState(false)
  const [mealsError, setMealsError] = useState('')
  useEffect(() => {
    if (tab !== 'meals' || !who) return
    let cancelled = false
    ;(async () => {
      // Ошибку сессии связываем и говорим вслух: молчаливый провал здесь дал бы
      // пустой экран питания с уверенным видом (канон «проглоченная ошибка — это
      // экран, который врёт»).
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) {
        if (!cancelled) setMealsError('Meals could not open on this tablet — tell the office. Nothing was lost.')
        return
      }
      if (data.session) { if (!cancelled) setMealsReady(true); return }
      const creds = CENTER_CREDENTIALS[who.center_slug]
      if (!creds) { if (!cancelled) setMealsError(`No service account for “${who.center_slug}” — tell the office.`); return }
      const { error } = await supabase.auth.signInWithPassword(creds)
      if (cancelled) return
      if (error) setMealsError('Meals could not open on this tablet — tell the office. Nothing was lost.')
      else setMealsReady(true)
    })()
    return () => { cancelled = true }
  }, [tab, who])

  // ── «Моё время» ────────────────────────────────────────────────────────────
  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const [timeError, setTimeError] = useState('')
  useEffect(() => {
    if (tab !== 'time' || !who || !token || !pinRef) return
    let cancelled = false
    setShifts(null); setTimeError('')
    fetchMyTime(token, pinRef, 7)
      .then(r => { if (!cancelled) setShifts(pairShifts(r.events)) })
      .catch(e => { if (!cancelled) setTimeError(humanPinError(e?.message ?? '')) })
    return () => { cancelled = true }
  }, [tab, who, token, pinRef])

  const verify = useCallback(async (hash: string): Promise<HandoffResult> => {
    const id = await identifyByPin(token!, hash)
    pending.current = id
    setPinRef(hash)
    return { ok: true, staff_id: id.staff_id, staff_name: id.staff_name }
  }, [token])

  const onSuccess = useCallback(() => {
    const id = pending.current
    if (!id) return
    setWho(id)
    lastTouch.current = Date.now()
    // Без комнаты «Дети» и «Питание» показать нечего — открываем то, что работает.
    setTab(id.has_classroom ? 'children' : 'time')
  }, [])

  // ── Экраны до входа ────────────────────────────────────────────────────────
  if (bootError === 'no-token') return <Boot title="This tablet is not set up yet"
    text="Ask your director to register it in Settings → Devices. It takes a minute, and nothing is lost meanwhile." />
  if (bootError) return <Boot title="This tablet cannot open the teacher app" text={bootError} />
  if (!ctx) return <Boot title="Opening…" text="One moment." />

  if (!who) {
    return (
      <div style={{ minHeight: '100vh', background: P.bg, display: 'grid', placeItems: 'center', padding: 20 }}>
        <PinPad
          centerId={ctx.center_id}
          title="Enter your PIN"
          subtitle={`${ctx.classroom_name} · your 4-digit PIN opens Children, Meals and My time`}
          onVerify={verify}
          onSuccess={onSuccess}
          onCancel={() => { /* уйти отсюда некуда: это и есть дверь */ }}
        />
      </div>
    )
  }

  const visibleTabs = TABS
  return (
    <div style={{ minHeight: '100vh', background: P.bg, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Шапка: имя вошедшего видно ВСЕГДА, и рядом — постоянная дверь смены человека. */}
      <header style={{
        background: P.surface, borderBottom: `1px solid ${P.border}`, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: P.text }}>You: {who.staff_name}</div>
          <div style={{ fontSize: 12, color: P.muted }}>
            {who.center_name} · {ctx.classroom_name}
            {who.position ? ` · ${who.position}` : ''}
          </div>
        </div>
        <button onClick={() => { setWho(null); setPinRef(''); setShifts(null) }}
          style={{
            padding: '9px 14px', borderRadius: 10, border: `1.5px solid ${P.border}`,
            background: '#ffffff', color: P.text, fontSize: 13.5, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
          ⇄ Switch person
        </button>
      </header>

      <nav style={{ display: 'flex', gap: 6, padding: '8px 12px', background: P.surface2, borderBottom: `1px solid ${P.border}` }}>
        {visibleTabs.map(t => {
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13.5, fontWeight: 700,
              border: `1.5px solid ${active ? P.green : P.border}`,
              background: active ? P.green : '#ffffff',
              color: active ? P.onAccent : P.text,
            }}>{t.label}</button>
          )
        })}
      </nav>

      <main>
        {/* Без комнаты человек не заперт: «Моё время» работает полноценно, а две
            другие вкладки говорят словами, чего не хватает и к кому идти. */}
        {tab !== 'time' && !who.has_classroom && (
          <Stub text="This section is tied to a classroom — you're not assigned. Ask your director.
Your hours are recorded and visible in “My time”." />
        )}

        {tab === 'children' && who.has_classroom && <SafePassTeacherPage />}

        {tab === 'meals' && who.has_classroom && (
          mealsError ? <Stub text={mealsError} />
          : !mealsReady ? <Stub text="Opening meals…" />
          : <MealCountPage portalRoles={['cook']} />
        )}

        {tab === 'time' && (
          <MyTime shifts={shifts} error={timeError} name={who.staff_name} />
        )}
      </main>
    </div>
  )
}

// ─── Мелкие экраны ───────────────────────────────────────────────────────────
function Boot({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ minHeight: '100vh', background: P.bg, display: 'grid', placeItems: 'center', padding: 24,
                  fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 460, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, padding: '22px 24px' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: P.text, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: P.muted, whiteSpace: 'pre-line' }}>{text}</div>
      </div>
    </div>
  )
}

function Stub({ text }: { text: string }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 560, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14,
                    padding: '18px 20px', fontSize: 13.5, lineHeight: 1.65, color: P.text, whiteSpace: 'pre-line' }}>
        {text}
      </div>
    </div>
  )
}

// ─── Моё время ───────────────────────────────────────────────────────────────
// ТОЛЬКО ЧАСЫ (слово владельца 07.08): ни ставок, ни сумм, ни намёка на расчёт
// оплаты. Обещаем отражение отработанных часов, не прозрачность оплаты.
function MyTime({ shifts, error, name }: { shifts: Shift[] | null; error: string; name: string }) {
  const total = useMemo(() => (shifts ? sumShiftHours(shifts) : 0), [shifts])
  if (error) return <Stub text={error} />
  if (!shifts) return <Stub text="Loading your shifts…" />
  if (!shifts.length) {
    // Пустота объясняет себя словами, а не показывает ноль: ноль и «планшет ничего
    // не записал» — разные вещи, и человек имеет право знать, какая из них перед ним.
    return <Stub text={`No shifts recorded for you in the last 7 days, ${name.split(' ')[0]}.
This shows taps made on a classroom tablet — if you worked and it is empty here, tell your director.`} />
  }
  return (
    <div style={{ padding: 20 }}>
      <div style={{ maxWidth: 640, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${P.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: P.text }}>My shifts — last 7 days</div>
          <div style={{ fontSize: 12, color: P.muted, marginTop: 2 }}>Hours worked, as recorded by the tablet.</div>
        </div>
        {shifts.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '11px 18px',
                                borderBottom: `1px solid ${P.border}`, fontSize: 13.5, color: P.text }}>
            <span style={{ minWidth: 84, fontWeight: 700 }}>{fmtDay(s.in_at)}</span>
            <span style={{ flex: 1 }}>
              {fmtTime(s.in_at)} → {s.out_at ? fmtTime(s.out_at) : <em style={{ color: P.amber }}>still open</em>}
              {s.classroom_name ? <span style={{ color: P.muted }}> · {s.classroom_name}</span> : null}
            </span>
            <span style={{ fontWeight: 800, color: P.green, minWidth: 46, textAlign: 'right' }}>
              {s.hours === null ? '—' : s.hours.toFixed(1)}
            </span>
          </div>
        ))}
        {/* Итог = сумма ВИДИМЫХ часов. Тот же инвариант, что закрыт 07.08 в карточке:
            складывает он ровно то, что человек видит строками, и ничего не считает сам. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 18px',
                      background: P.surface2, fontWeight: 800, color: P.text, fontSize: 14 }}>
          <span>Total this week</span><span style={{ color: P.green }}>{total.toFixed(1)}h</span>
        </div>
      </div>
    </div>
  )
}
