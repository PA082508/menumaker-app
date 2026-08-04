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
import { IEA_DOC_TYPE } from '@/lib/ieaOnFile'
import {
  confirmRefusal, sortFamiliesByWork, type ConfirmInput, type FamilyRow, type Frp,
} from '@/lib/ieaConfirm'

const GREEN = '#0f4c35'
const wrap: React.CSSProperties = { padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1080 }
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1.5px solid #c0d8c0', fontSize: 13, fontFamily: 'inherit', background: '#fff' }

type Row = FamilyRow & { input: ConfirmInput; busy?: boolean; done?: string | null; err?: string | null }

export default function IeaConfirmPage() {
  const { org, currentCenter } = useOrg()
  const { user, roles } = useAuth()
  // Доход — орг-уровень. Директору центра страница не показывается.
  const allowed = roles.includes('admin') || roles.includes('office_manager')

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [fy, setFy] = useState<string | null>(null)
  const [onlyOpen, setOnlyOpen] = useState(true)

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
      .select('id, child_id, child_name, first_name, last_name, classroom_id, frp')
      .eq('center_id', currentCenter.id).eq('is_active', true)
    // Пустой список здесь читался бы как «все подтверждены». Отказ обязан сказать.
    if (rErr) { setLoadErr(`The roster could not be read — ${rErr.message}`); setLoading(false); return }

    const kids = (roster ?? []).filter(r => r.child_id)
    if (kids.length === 0) { setRows([]); setLoading(false); return }
    const childIds = kids.map(r => r.child_id as string)

    // Каждый отказ связывается ОТДЕЛЬНО. Молча потерять любой из четырёх значит
    // показать «семей нет» или «все подтверждены» — оба ответа ложные и оба
    // выглядят как работа.
    const [qLinks, qRooms, qIe, qPaper] = await Promise.all([
      supabase.schema('menumaker').from('child_guardian').select('child_id, guardian_id').in('child_id', childIds),
      supabase.schema('menumaker').from('classrooms').select('id, name').eq('center_id', currentCenter.id),
      supabase.schema('menumaker').from('income_eligibility').select('roster_id').eq('center_id', currentCenter.id).eq('fiscal_year', fy),
      supabase.schema('menumaker').from('documents').select('roster_id')
        .eq('center_id', currentCenter.id).eq('doc_type', IEA_DOC_TYPE).eq('source', 'paper').eq('status', 'active'),
    ])
    const firstErr = qLinks.error ?? qRooms.error ?? qIe.error ?? qPaper.error
    if (firstErr) {
      setLoadErr(`The list could not be built — ${firstErr.message}. Nothing is shown rather than a partial list.`)
      setLoading(false); return
    }
    const links = qLinks.data, rooms = qRooms.data, ie = qIe.data, paper = qPaper.data

    const gIds = Array.from(new Set((links ?? []).map(l => l.guardian_id as string)))
    const gq = gIds.length
      ? await supabase.schema('menumaker').from('guardian').select('id, first_name, last_name').in('id', gIds)
      : null
    warnIf(gq?.error, 'ieaConfirm/guardian')
    const gs = (gq?.data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]

    const onFile = new Set<string>([
      ...((ie ?? []) as any[]).map(r => r.roster_id as string),
      ...((paper ?? []) as any[]).map(r => r.roster_id as string),
    ])
    const roomName = new Map((rooms ?? []).map(r => [r.id as string, r.name as string]))
    const kidByCid = new Map(kids.map(r => [r.child_id as string, r]))
    const gName = new Map(gs.map(g => [g.id, `${g.first_name ?? ''} ${g.last_name ?? ''}`.trim() || '—']))

    const byGuardian = new Map<string, FamilyRow>()
    for (const l of (links ?? []) as any[]) {
      const kid = kidByCid.get(l.child_id as string)
      if (!kid) continue
      const gid = l.guardian_id as string
      if (!byGuardian.has(gid)) byGuardian.set(gid, { guardianId: gid, guardianName: gName.get(gid) ?? '—', children: [] })
      const fam = byGuardian.get(gid)!
      if (fam.children.some(c => c.rosterId === kid.id)) continue     // один ребёнок — один раз в семье
      fam.children.push({
        rosterId: kid.id as string,
        name: (kid.child_name as string) || `${kid.first_name ?? ''} ${kid.last_name ?? ''}`.trim(),
        room: roomName.get(kid.classroom_id as string) ?? '—',
        frp: (kid.frp as string) ?? null,
        onFile: onFile.has(kid.id as string),
      })
    }

    // Дети БЕЗ опекуна не исчезают: они собираются в псевдо-семью, иначе экран
    // «всё подтверждено» врал бы ровно про тех, до кого никто не дошёл.
    const covered = new Set(Array.from(byGuardian.values()).flatMap(f => f.children.map(c => c.rosterId)))
    const orphans = kids.filter(k => !covered.has(k.id as string))
    if (orphans.length) {
      byGuardian.set('__no_guardian__', {
        guardianId: '__no_guardian__',
        guardianName: 'No guardian on file',
        children: orphans.map(k => ({
          rosterId: k.id as string,
          name: (k.child_name as string) || `${k.first_name ?? ''} ${k.last_name ?? ''}`.trim(),
          room: roomName.get(k.classroom_id as string) ?? '—',
          frp: (k.frp as string) ?? null,
          onFile: onFile.has(k.id as string),
        })),
      })
    }

    setRows(sortFamiliesByWork(Array.from(byGuardian.values()))
      .map(f => ({ ...f, input: { frp: '', documentDate: '', paperInSafe: false } })))
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

    for (const c of row.children) {
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
          done: problems.length ? null : `✓ ${row.children.length} child${row.children.length === 1 ? '' : 'ren'} recorded`,
          children: problems.length ? r.children : r.children.map(c => ({ ...c, onFile: true, frp })) }
      : r))
  }

  if (!allowed) {
    return <div style={wrap}><div style={{ color: '#6b7280', fontSize: 14 }}>
      Income determinations are handled at the organisation level. This page is not part of a centre director's work.
    </div></div>
  }

  const shown = onlyOpen ? rows.filter(r => r.children.some(c => !c.onFile)) : rows
  const openKids = rows.flatMap(r => r.children).filter(c => !c.onFile).length

  return (
    <div style={wrap}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 4 }}>
        Paper applications — confirm by family
      </div>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 18 }}>
        {currentCenter?.name ?? '—'} · {fy ?? 'fiscal year unresolved'} · one application covers the whole household
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
        <label style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} style={{ accentColor: GREEN }} />
          Only families with someone still open
        </label>
        <span style={{ fontSize: 12.5, color: '#6b7280' }}>
          {rows.length} famil{rows.length === 1 ? 'y' : 'ies'} · <strong>{openKids}</strong> child{openKids === 1 ? '' : 'ren'} without an application on file
        </span>
        {/* Массового «подтвердить всё» здесь НЕТ и не будет: сто определений,
            за которыми не стоит ни одной названной бумаги, — это сто строк,
            которые нечем обосновать на проверке. */}
      </div>

      {loading ? <div style={{ color: '#aaa', fontSize: 13 }}>Loading…</div>
        : shown.length === 0 ? <div style={{ color: '#6b7280', fontSize: 13 }}>Nothing open — every child here has an application on file.</div>
        : shown.map(r => {
          const refusal = confirmRefusal(r.input)
          return (
            <div key={r.guardianId} style={{ border: '1.5px solid #e8f0e8', borderRadius: 12, padding: '12px 14px', marginBottom: 10, background: '#fff' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0a3320' }}>{r.guardianName}</div>
                  <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3, lineHeight: 1.5 }}>
                    {r.children.map(c => (
                      <span key={c.rosterId} style={{ marginRight: 10, whiteSpace: 'nowrap' }}>
                        {c.onFile ? '✓' : '○'} {c.name} <span style={{ color: '#9ca3af' }}>· {c.room} · {c.frp ?? '—'}</span>
                      </span>
                    ))}
                  </div>
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
                    {r.busy ? 'Recording…' : `Confirm · ${r.children.length}`}
                  </button>
                </div>
              </div>
              {refusal && !r.done && <div style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>{refusal}</div>}
              {r.err && <div role="alert" style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{r.err}</div>}
              {r.done && <div style={{ fontSize: 12, color: GREEN, fontWeight: 700, marginTop: 8 }}>{r.done}</div>}
            </div>
          )
        })}
    </div>
  )
}
