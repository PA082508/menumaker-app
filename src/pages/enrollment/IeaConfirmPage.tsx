// IeaConfirmPage.tsx — маршрут /iea-confirm. Построчное подтверждение бумажных
// заявлений о доходе, ПО СЕМЬЯМ.
//
// ЗАЧЕМ ЭКРАН СУЩЕСТВУЕТ. В сейфе центра лежит стопка подписанных IEA, а в
// системе у тех же детей категория стоит без носителя — то есть заявка их не
// считает. Разносить эту стопку через карточку каждого ребёнка значит открыть
// сто двадцать шесть карточек и в каждой набрать одну и ту же дату.
//
// ПОЧЕМУ СТРОКА — СЕМЬЯ. Заявление подаётся на ДОМОХОЗЯЙСТВО: одна бумага
// определяет всех детей семьи разом (household-правило). Список по детям
// заставил бы вносить одну бумагу трижды для трёх братьев, и на третьем разе
// даты разъедутся.
//
// ЧТО ПИШЕТ ОДИН ВВОД — КАЖДОМУ ребёнку семьи ДВЕ записи:
//   1. `documents` (source='paper') — бумага в деле: гасит жёлтую плашку;
//   2. `recordDetermination` — носитель, которым СЧИТАЕТСЯ ЗАЯВКА.
// Одной без другой не бывает: документ без определения — бумага, которую никто
// не применил; определение без документа — категория, которую нечем обосновать.
//
// ДОСТУП. Доход виден только орг-уровню (канон IEA-маршрутизации): директору
// центра эта страница не показывается вовсе, у него остаётся содержательно
// пустой признак «определение на файле» в других местах.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { warnIf } from '@/lib/queryError'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'
import { parseIeaFiscalYear, frpExpiryDefault, recordDetermination } from '@/lib/enrollmentApprove'
import { IEA_DOC_TYPE, loadIeaOnFile, needsIeaOnFile } from '@/lib/ieaOnFile'
import {
  confirmRefusal, mergeHouseholds, nameMatches, searchFamilies, sortFamiliesByWork, whyNotListed,
  type ConfirmInput, type FamilyChild, type FamilyRow, type Frp,
} from '@/lib/ieaConfirm'
import ScrollToTop from '@/components/common/ScrollToTop'

const GREEN = '#0f4c35'
const wrap: React.CSSProperties = { padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1080 }
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1.5px solid #c0d8c0', fontSize: 13, fontFamily: 'inherit', background: '#fff' }
// Подсветка совпадения. Тёплый фон, а не цвет текста: строка и так разноцветная
// (✓/○, комната, категория), и ещё один оттенок в ней потерялся бы.
const hiRow: React.CSSProperties = { background: '#fef3c7', borderRadius: 5, padding: '1px 5px', boxShadow: 'inset 0 0 0 1px #fcd34d' }

// `children` — кого показывает строка (ждут заявления), `household` — кому пишет
// подтверждение (household-правило: одна бумага определяет всех АКТИВНЫХ детей
// семьи), `former` — ушедшие: они видны серым, но ни в счёт, ни в запись не идут.
type Row0 = FamilyRow & { household: FamilyChild[]; former: FamilyChild[] }
type Row = Row0 & { input: ConfirmInput; busy?: boolean; done?: string | null; err?: string | null }

export default function IeaConfirmPage() {
  const { org, currentCenter } = useOrg()
  const { user, roles } = useAuth()
  // Доход — орг-уровень. Директору центра страница не показывается.
  const allowed = roles.includes('admin') || roles.includes('office_manager')

  const [rows, setRows] = useState<Row[]>([])
  // Дети центра, которых список НЕ держит — включая целые дома, где ждать нечего.
  // Нужны поиску: запрос, совпавший с таким ребёнком, обязан ответить ЕГО ИМЕНЕМ
  // и причиной, а не общим «здесь такого нет».
  const [offList, setOffList] = useState<FamilyChild[]>([])
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [fy, setFy] = useState<string | null>(null)
  // Поиск идёт по имени РЕБЁНКА: строка подписана опекуном, а родители зачастую
  // носят другую фамилию, и по подписи строки ребёнка не найти.
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/enroll-registry.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { const iea = j?.forms?.iea; setFy(parseIeaFiscalYear(iea?.versions?.[iea?.current] ?? iea?.fallbackUrl)) })
      .catch(() => setFy(null))
  }, [])

  const load = useCallback(async () => {
    if (!allowed || !currentCenter?.id || !fy) return
    setLoading(true); setLoadErr(null)

    const { data: roster, error: rErr } = await supabase.schema('menumaker').from('roster')
      .select('id, child_id, child_name, first_name, last_name, classroom_id, frp, date_out, is_active')
      .eq('center_id', currentCenter.id)
    // Пустой список здесь читался бы как «все подтверждены». Отказ обязан сказать.
    if (rErr) { setLoadErr(`The roster could not be read — ${rErr.message}`); setLoading(false); return }

    // Ребёнок БЕЗ `child_id` в списке остаётся. Связь с опекуном идёт через
    // `child_id`, и раньше такие строки просто отбрасывались — на Wickliffe это
    // ровно 6 детей F/R, из-за которых экран показывал 58 там, где плашка знает 64.
    // Молча потерять ребёнка, которого ждёт заявление, хуже, чем показать его
    // без опекуна: он уйдёт в секцию «No guardian on file», где его увидят.
    const kids = (roster ?? [])
    if (kids.length === 0) { setRows([]); setLoading(false); return }
    const childIds = kids.map(r => r.child_id).filter(Boolean) as string[]

    // Каждый отказ связывается ОТДЕЛЬНО. Молча потерять любой значит показать
    // «семей нет» или «все подтверждены» — оба ответа ложные и оба выглядят
    // как работа. «Есть IEA» спрашивается ОБЩЕЙ функцией `loadIeaOnFile` — той же,
    // что отвечает жёлтой плашке Site Claim.
    const today = new Date().toISOString().slice(0, 10)
    const [qLinks, qRooms, onFile] = await Promise.all([
      childIds.length
        ? supabase.schema('menumaker').from('child_guardian').select('child_id, guardian_id').in('child_id', childIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      supabase.schema('menumaker').from('classrooms').select('id, name, is_roster').eq('center_id', currentCenter.id),
      loadIeaOnFile(currentCenter.id, fy, today),
    ])
    const firstErr = qLinks.error ?? qRooms.error
    if (firstErr) {
      setLoadErr(`The list could not be built — ${firstErr.message}. Nothing is shown rather than a partial list.`)
      setLoading(false); return
    }
    const links = qLinks.data, rooms = qRooms.data

    const gIds = Array.from(new Set((links ?? []).map(l => l.guardian_id as string)))
    const gq = gIds.length
      ? await supabase.schema('menumaker').from('guardian').select('id, first_name, last_name').in('id', gIds)
      : null
    warnIf(gq?.error, 'ieaConfirm/guardian')
    const gs = (gq?.data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]

    const roomName = new Map((rooms ?? []).map(r => [r.id as string, r.name as string]))
    const staffRooms = new Set((rooms ?? []).filter(r => (r as any).is_roster === false).map(r => r.id as string))
    const kidByCid = new Map(kids.filter(r => r.child_id).map(r => [r.child_id as string, r]))
    const gName = new Map(gs.map(g => [g.id, `${g.first_name ?? ''} ${g.last_name ?? ''}`.trim() || '—']))

    const asChild = (k: any): FamilyChild => ({
      rosterId: k.id as string,
      name: (k.child_name as string) || `${k.first_name ?? ''} ${k.last_name ?? ''}`.trim(),
      room: roomName.get(k.classroom_id as string) ?? '—',
      frp: (k.frp as string) ?? null,
      onFile: onFile.has(k.id as string),
      active: k.is_active !== false,
      dateOut: (k.date_out as string | null) ?? null,
    })
    // СТРОКОЙ ИДЁТ ТОЛЬКО ТОТ, КОГО ЖДЁТ ЗАЯВЛЕНИЕ: активный, F или R, не персонал,
    // не ушедший, без действующей IEA. Предикат общий с жёлтой плашкой; `is_active`
    // проверяется отдельно, потому что плашка отбирает активных ещё в запросе.
    const needs = (k: any) => k.is_active !== false && needsIeaOnFile(k, onFile, staffRooms, today)

    // СЕМЬЯ — ГРУППА ДЕТЕЙ, СВЯЗАННЫХ ОБЩИМИ ОПЕКУНАМИ, а не строка опекуна.
    // У Bates шесть детей и два доверенных лица: строкой-опекуном выходило восемь
    // строк на одну семью, и одну бумагу вносили дважды.
    const guardiansOf = new Map<string, string[]>()
    for (const l of (links ?? []) as any[]) {
      const cid = l.child_id as string
      if (!guardiansOf.has(cid)) guardiansOf.set(cid, [])
      const arr = guardiansOf.get(cid)!
      if (!arr.includes(l.guardian_id as string)) arr.push(l.guardian_id as string)
    }
    const kidById = new Map(kids.map(k => [k.id as string, k]))
    const households = mergeHouseholds(kids.map(k => ({
      rosterId: k.id as string,
      guardianIds: guardiansOf.get(k.child_id as string) ?? [],
    })))

    const rowsBuilt: Row0[] = households.map(h => {
      const members = h.rosterIds.map(id => kidById.get(id)).filter(Boolean) as any[]
      const names = h.guardianIds.map(g => gName.get(g) ?? '—').filter(Boolean)
      return {
        guardianId: h.key,
        // Перечислены ВСЕ опекуны дома: строка подписана семьёй, а не первым из них.
        guardianName: names.length ? names.join(' · ') : 'No guardian on file',
        children: members.filter(needs).map(asChild),
        household: members.filter(k => k.is_active !== false).map(asChild),
        former: members.filter(k => k.is_active === false).map(asChild),
        // Ищутся ВСЕ дети дома, включая тех, кого строка не показывает: человек
        // набирает имя с бумаги, и «нет такого ребёнка» про ребёнка этого дома —
        // самый дорогой ответ из возможных.
        others: members.filter(k => !needs(k)).map(asChild),
      }
    })

    // Семья без единого ожидающего ребёнка на этом экране делать нечего — но её
    // дети остаются в поисковом индексе: закрытый дом это не «нет такого ребёнка».
    const withWork = rowsBuilt.filter(f => f.children.length > 0)
    const listed = new Set(withWork.flatMap(f => f.children.map(c => c.rosterId)))
    setOffList(
      rowsBuilt.flatMap(f => [...f.household, ...f.former])
        .filter(c => !listed.has(c.rosterId))
        .filter((c, i, arr) => arr.findIndex(x => x.rosterId === c.rosterId) === i),
    )
    setRows(sortFamiliesByWork(withWork)
      .map(f => ({ ...(f as Row0), input: { frp: '', documentDate: '', paperInSafe: false } })))
    setLoading(false)
  }, [allowed, currentCenter?.id, fy])

  useEffect(() => { load() }, [load])

  const patch = (gid: string, p: Partial<ConfirmInput>) =>
    setRows(rs => rs.map(r => r.guardianId === gid ? { ...r, input: { ...r.input, ...p }, err: null, done: null } : r))

  async function confirmFamily(row: Row) {
    const refusal = confirmRefusal(row.input)
    if (refusal) { setRows(rs => rs.map(r => r.guardianId === row.guardianId ? { ...r, err: refusal } : r)); return }
    if (!org?.id || !currentCenter?.id || !fy) return

    setRows(rs => rs.map(r => r.guardianId === row.guardianId ? { ...r, busy: true, err: null, done: null } : r))
    const frp = row.input.frp as Frp
    const docDate = row.input.documentDate || null
    const expires = (frp === 'F' || frp === 'R') && docDate ? frpExpiryDefault(docDate, null) : null
    const who = (user?.user_metadata?.full_name as string) || (user?.email?.split('@')[0]) || 'Staff'
    const problems: string[] = []

    for (const c of row.household) {
      try {
        // 1) НОСИТЕЛЬ — им считается заявка.
        await recordDetermination({
          roster_id: c.rosterId, org_id: org.id, center_id: currentCenter.id,
          frp, frp_expires: expires, fiscal_year: fy,
          eligibility_source: 'manual', ieSource: 'profile_edit',
          determined_by: user?.id ?? '', determined_by_name: who,
        })
      } catch (e: any) { problems.push(`${c.name}: determination — ${e?.message ?? e}`); continue }

      // 2) БУМАГА В ДЕЛЕ — она гасит жёлтую плашку. Только когда бумага названа.
      if (docDate && row.input.paperInSafe) {
        const { error } = await supabase.schema('menumaker').from('documents').insert({
          org_id: org.id, center_id: currentCenter.id, doc_type: IEA_DOC_TYPE,
          title: 'Income eligibility application — paper on file',
          roster_id: c.rosterId, source: 'paper', storage_path: null,
          valid_from: docDate, valid_until: expires, status: 'active',
          attested_by: user?.id ?? null, attested_at: new Date().toISOString(),
        })
        if (error) problems.push(`${c.name}: paper record — ${error.message}`)
      }
    }

    setRows(rs => rs.map(r => r.guardianId === row.guardianId
      ? { ...r, busy: false,
          err: problems.length ? problems.join(' · ') : null,
          done: problems.length ? null : `✓ ${row.household.length} child${row.household.length === 1 ? '' : 'ren'} recorded`,
          children: problems.length ? r.children : r.children.map(c => ({ ...c, onFile: true, frp })) }
      : r))
  }

  if (!allowed) {
    return <div style={wrap}><div style={{ color: '#6b7280', fontSize: 14 }}>
      Income determinations are handled at the organisation level. This page is not part of a centre director's work.
    </div></div>
  }

  const shown = searchFamilies(rows, q)
  // Совпадения среди тех, кого список не держит вовсе (закрытые дома, Paid, ушедшие).
  const offMatches = q.trim()
    ? offList.filter(c => nameMatches(c.name, q))
    : []
  // Счётчик считает РЕБЁНКА ОДИН РАЗ. Строка списка — опекун, и у ребёнка с тремя
  // доверенными лицами три строки; сложить длины строк значило бы показать число
  // втрое больше того, что знает жёлтая плашка.
  const openKids = new Set(rows.flatMap(r => r.children.map(c => c.rosterId))).size

  return (
    <div style={wrap}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 4 }}>
        Paper applications — confirm by family
      </div>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 18 }}>
        {currentCenter?.name ?? '—'} · {fy ?? 'fiscal year unresolved'} · one application covers the whole household
        {' · '}
        {/* Две двери в одну запись: стопка бумаг — здесь, один ребёнок и одно
            событие — в карточке. Правила за обеими одинаковы, и инструкция об этом. */}
        <a href="/instructions?doc=income-categories" target="_blank" rel="noreferrer"
           style={{ color: GREEN, fontWeight: 600, textDecoration: 'underline' }}>How this works</a>
      </div>

      {!fy && (
        <div role="alert" style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>
          The current IEA fiscal year could not be resolved from the form registry — nothing can be recorded against the right year. Check <code>/enroll-registry.json</code>.
        </div>
      )}
      {loadErr && (
        <div role="alert" style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{loadErr}</div>
      )}

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search by child or guardian name…"
          aria-label="Search by child or guardian name"
          title="Any word, any order — a child is found by their own surname, which is often not the guardian's."
          style={{ ...inp, minWidth: 260, flex: '0 1 300px' }}
        />
        {/* Галочки «только открытые» здесь больше нет и не должно быть: список
            И ТАК состоит только из тех, кого заявление ждёт. Переключатель,
            который ничего не переключает, хуже отсутствующего. */}
        <span style={{ fontSize: 12.5, color: '#6b7280' }}>
          {q.trim()
            ? <>{shown.length} of {rows.length} famil{rows.length === 1 ? 'y' : 'ies'} match</>
            : <>{rows.length} famil{rows.length === 1 ? 'y' : 'ies'} · <strong>{openKids}</strong> child{openKids === 1 ? '' : 'ren'} with Free/Reduced and no application on file</>}
        </span>
        {/* Массового «подтвердить всё» здесь НЕТ и не будет: сто определений,
            за которыми не стоит ни одной названной бумаги, — это сто строк,
            которые нечем обосновать на проверке. */}
      </div>

      {loading ? <div style={{ color: '#aaa', fontSize: 13 }}>Loading…</div>
        /* Пустота обязана СКАЗАТЬ, почему она пуста, и назвать, кого этот список
           не показывает вовсе. Иначе человек, ищущий ребёнка с Paid или уже
           подтверждённого, прочтёт «нет такого ребёнка» — и пойдёт искать
           ошибку в данных, которых никто не ломал. */
        : shown.length === 0 && q.trim() ? (
          <div style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.6 }}>
            {offMatches.length > 0 ? (
              <>
                {/* НАЙДЕН, НО НЕ ЗДЕСЬ. Общее «такого здесь нет» про ребёнка, который
                    в центре есть, отправляет человека искать поломку в данных. */}
                Found at {currentCenter?.name ?? 'this centre'}, but not waiting for an application:
                <div style={{ marginTop: 6 }}>
                  {offMatches.slice(0, 6).map(c => (
                    <div key={c.rosterId} data-offlist="1" style={{ padding: '2px 0' }}>
                      <strong style={{ color: '#0a3320' }}>{c.name}</strong>
                      <span style={{ color: '#92400e' }}> — {whyNotListed(c)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 6 }}>
                  This list holds only children with <strong>Free or Reduced</strong> and no application on file.
                </div>
              </>
            ) : (
              <>
                No family waiting for an application matches <strong style={{ color: '#0a3320' }}>{q.trim()}</strong> at {currentCenter?.name ?? 'this centre'}.
                <br />This list holds only children with <strong>Free or Reduced</strong> and no application on file.
                A child who is Paid, or whose application is already filed, is not here — and neither is a spelling that does not match.
              </>
            )}
          </div>
        )
        : shown.length === 0 ? <div style={{ color: '#6b7280', fontSize: 13 }}>Nothing waiting — every Free/Reduced child at this centre has an application on file.</div>
        : shown.map(hit => {
          const r = hit.row
          const refusal = confirmRefusal(r.input)
          return (
            <div key={r.guardianId} style={{ border: '1.5px solid #e8f0e8', borderRadius: 12, padding: '12px 14px', marginBottom: 10, background: '#fff' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0a3320' }}>
                    <span style={hit.guardianHit ? hiRow : undefined}>{r.guardianName}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3, lineHeight: 1.8 }}>
                    {/* Подсвечен ИМЕННО совпавший ребёнок: глаз должен сразу увидеть,
                        почему эта семья выпала в результат, а не пересчитывать детей. */}
                    {r.children.map(c => {
                      const hi = hit.childIds.includes(c.rosterId)
                      return (
                        <span key={c.rosterId}
                          data-match={hi ? 'child' : undefined}
                          style={{ marginRight: 10, whiteSpace: 'nowrap', ...(hi ? hiRow : null) }}>
                          {hi ? <strong style={{ color: '#0a3320' }}>{c.name}</strong> : c.name}
                          {' '}<span style={{ color: '#9ca3af' }}>· {c.room} · {c.frp ?? '—'}</span>
                        </span>
                      )
                    })}
                  </div>
                  {/* Кнопка пишет ВСЕМУ домохозяйству — household-правило. Когда в семье
                      есть дети, которых этот список не показывает (Paid или уже
                      подтверждённые), число на кнопке обязано быть объяснено ЗДЕСЬ,
                      иначе оно читается как ошибка счёта. */}
                  {/* Совпавший ребёнок, которого строка не показывает, называется
                      ВМЕСТЕ С ПРИЧИНОЙ. Молча не показать найденного — то же самое,
                      что сказать «такого ребёнка нет». */}
                  {hit.otherIds.length > 0 && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      {(r.others ?? []).filter(c => hit.otherIds.includes(c.rosterId)).map(c => (
                        <span key={c.rosterId} data-match="other" style={{ ...hiRow, marginRight: 8, whiteSpace: 'nowrap' }}>
                          {c.name} <span style={{ color: '#92400e' }}>· {whyNotListed(c)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Ушедшие дети семьи ВИДНЫ, но серым и без действия: они не в счёте
                      и не в записи. Спрятать их значило бы заставить человека гадать,
                      почему в семье «не хватает» ребёнка с бумаги. */}
                  {r.former.length > 0 && (
                    <div style={{ fontSize: 12, color: '#b0b7c0', marginTop: 3, lineHeight: 1.7 }}>
                      {r.former.map(c => (
                        <span key={c.rosterId} data-former="1" style={{ marginRight: 10, whiteSpace: 'nowrap', textDecoration: 'line-through' }}>
                          {c.name}
                        </span>
                      ))}
                      <span style={{ textDecoration: 'none', color: '#9ca3af' }}>
                        · {r.former.map(c => c.dateOut ? `left ${c.dateOut.slice(5, 7)}/${c.dateOut.slice(8, 10)}` : 'no longer enrolled').join(' · ')}
                      </span>
                    </div>
                  )}
                  {r.household.length > r.children.length && (
                    <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4 }}>
                      household of {r.household.length} — the record is written to every active child, including
                      {' '}{r.household.length - r.children.length} not listed above (Paid, or already on file)
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={r.input.frp} onChange={e => patch(r.guardianId, { frp: e.target.value as Frp | '' })} style={inp}>
                    <option value="">category…</option>
                    <option value="F">Free</option>
                    <option value="R">Reduced</option>
                    <option value="P">Paid</option>
                  </select>
                  <input type="date" value={r.input.documentDate} title="Date printed on the application"
                    onChange={e => patch(r.guardianId, { documentDate: e.target.value })} style={inp} />
                  <label style={{ fontSize: 12.5, color: GREEN, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <input type="checkbox" checked={r.input.paperInSafe}
                      onChange={e => patch(r.guardianId, { paperInSafe: e.target.checked })} style={{ accentColor: GREEN }} />
                    📄 in the safe
                  </label>
                  <button onClick={() => confirmFamily(r)} disabled={!!r.busy || !!refusal || !fy}
                    title={refusal ?? undefined}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: refusal || r.busy ? 'default' : 'pointer',
                      background: refusal || r.busy ? '#e5e7eb' : GREEN, color: refusal || r.busy ? '#9ca3af' : '#fff',
                      fontSize: 13, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {r.busy ? 'Recording…' : `Confirm · ${r.household.length}`}
                  </button>
                </div>
              </div>
              {refusal && !r.done && <div style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>{refusal}</div>}
              {r.err && <div role="alert" style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{r.err}</div>}
              {r.done && <div style={{ fontSize: 12, color: GREEN, fontWeight: 700, marginTop: 8 }}>{r.done}</div>}
            </div>
          )
        })}
      <ScrollToTop />
    </div>
  )
}
