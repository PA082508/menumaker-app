// MealCountHelpPage.tsx — route /meal-count/help
import { useState } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'

const C = {
  bg:'#f9fafb', surface:'#ffffff', border:'#e5e7eb',
  text:'#0a3320', muted:'#6b7280', green:'#1a5c3f',
  greenLight:'#f0f7f4', amber:'#92400e', amberLight:'#fef3c7',
  red:'#991b1b', redLight:'#fef2f2',
}
type S = 'overview'|'teacher'|'cook'|'director'|'rules'|'offline'

// Add-to-Home-Screen — installs the app so it opens full-screen and works with
// no WiFi (the shell is precached; meal marks queue on-device until sync).
const INSTALL_STEPS = [
  {icon:'📲', title:'On iPad / iPhone (Safari)', desc:'Open this app in Safari. Tap the Share button (□ with ↑), scroll down, and tap "Add to Home Screen". Confirm — an app icon appears on your Home Screen. Always open the app from that icon.'},
  {icon:'🤖', title:'On Android (Chrome)', desc:'Open the app in Chrome, tap the ⋮ menu, then "Add to Home screen" / "Install app". Confirm to place the icon.'},
  {icon:'📶', title:'When the WiFi is down', desc:'Keep marking meals exactly as usual. Each check is saved on the device immediately. A yellow "N marks waiting" badge shows how many are not yet sent, and waiting checks have a yellow ◷ outline.'},
  {icon:'✅', title:'When the WiFi comes back', desc:'The app sends the waiting marks automatically — the badge drops to 0 and the ◷ outline clears. You do not need to re-enter anything. If it ever shows a red "retry" badge, tap it.'},
  {icon:'🔒', title:'Point-of-service time is preserved', desc:'For CACFP, each mark records the time you actually checked it on the device — not the time it later syncs. Marking during an outage stays compliant.'},
]

const TEACHER_STEPS = [
  {icon:'1️⃣', title:'Select Your Center and Classroom', desc:'At the top of the screen, make sure your center (Wickliffe, Parma Heights, or Mayfield Hills) is selected. Then choose your classroom tab.'},
  {icon:'2️⃣', title:'Select the Meal', desc:'Choose the meal: Breakfast, AM Snack, Lunch, or Supper. The current meal is highlighted automatically based on the time of day.'},
  {icon:'3️⃣', title:'Select the Day', desc:'Click the day column for today. Monday through Friday are shown for the current week.'},
  {icon:'4️⃣', title:'Check Each Child Present', desc:'You will see your class roster. Check the box next to each child who is present AND eating this meal. Do NOT check absent children or children who brought their own food.'},
  {icon:'5️⃣', title:'Milk is Automatic', desc:'Milk type and ounces are set automatically based on each child\'s age. You do not need to change anything. If a child has a special diet or allergy, it is noted next to their name.'},
  {icon:'6️⃣', title:'Submit', desc:'When all present children are checked, the count is saved automatically. You will see the number of checked children update in real time.'},
  {icon:'7️⃣', title:'Repeat for Each Meal', desc:'Do this for every meal served during the day. Each meal and day is recorded separately.'},
]

const COOK_STEPS = [
  {icon:'1️⃣', title:'Open Kitchen View', desc:'Go to Operations → Kitchen View. This shows you the total meal counts for all classrooms combined, organized by meal and day.'},
  {icon:'2️⃣', title:'Check the Totals', desc:'For each meal you will see: total children, breakdown by age group (infant/toddler/preschool/school-age), and milk totals in cups.'},
  {icon:'3️⃣', title:'Week View', desc:'Switch to Week View to see the full week at a glance. Use this for weekly food planning and ordering.'},
  {icon:'4️⃣', title:'Kitchen Report', desc:'Go to Operations → Kitchen Report to print or export the weekly summary for your records.'},
  {icon:'5️⃣', title:'Export for Google Sheets', desc:'Use the Export button in the top right corner to download the meal count data as a spreadsheet for CACFP reporting.'},
]

const DIRECTOR_STEPS = [
  {icon:'1️⃣', title:'Director View', desc:'In the top right corner of Meal Count, click Director to switch to the director summary view showing all classrooms.'},
  {icon:'2️⃣', title:'Review Counts', desc:'Verify that all classrooms have submitted counts for each meal. Missing counts appear as 0 or empty.'},
  {icon:'3️⃣', title:'Week View', desc:'Use Week View to review the full week before submitting to CACFP. Totals must match your site claim report.'},
  {icon:'4️⃣', title:'Export for Google Sheets', desc:'Click Export for Google Sheets in the top right. This downloads the data in CACFP-ready format.'},
  {icon:'5️⃣', title:'Site Claim Report', desc:'Go to Reports → Site Claim to generate the monthly CACFP report based on the meal counts entered during the month.'},
]

const RULES = [
  {title:'Count only present children', desc:'Only check children who are physically present at the center AND eating the meal. Never count absent children or children who brought their own lunch.'},
  {title:'Count at meal time', desc:'Enter counts at the time of the meal, not before or after. CACFP requires that counts reflect actual participation.'},
  {title:'Milk is by age', desc:'Milk type and serving size are determined by each child\'s date of birth — automatically. Infants: formula (not counted in CACFP milk). Ages 1-2: whole milk 4 oz. Ages 2+: 1% milk.'},
  {title:'No guessing', desc:'If you are unsure whether a child is present, check with the teacher before submitting. Inaccurate counts can result in CACFP audit findings.'},
  {title:'Same-day entry', desc:'Meal counts must be entered on the day of service. Do not enter counts for previous days unless correcting an error — contact your director first.'},
  {title:'Staff meals', desc:'Staff meals are tracked separately. Click the Staff tab in your classroom view to record staff meal participation.'},
]

export default function MealCountHelpPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  // history.back() no-ops when Help was opened via a deep link / refresh / new tab
  // (no in-app history entry). location.key === 'default' flags that first entry;
  // fall back to the Meal Count page instead of a dead button.
  const goBack = () =>
    location.key !== 'default' ? navigate(-1) : navigate('/meal-count')
  const role = searchParams.get('role') // 'teacher' | 'cook' | 'director' | null

  // Tabs visible per role (null = show all)
  const ROLE_TABS: Record<string, S[]> = {
    teacher:  ['teacher', 'offline', 'rules'],
    cook:     ['cook', 'offline', 'rules'],
    director: ['director', 'offline', 'rules'],
  }
  const visibleTabs = role && ROLE_TABS[role] ? ROLE_TABS[role] : ['overview','teacher','cook','director','offline','rules'] as S[]

  const [s, setS] = useState<S>(role && ROLE_TABS[role] ? ROLE_TABS[role][0] : 'overview')

  const nb = (v: S, label: string) => (
    <button key={v} onClick={() => setS(v)} style={{
      padding:'8px 18px', borderRadius:20, fontSize:14, fontWeight:600,
      cursor:'pointer', fontFamily:'inherit', border:`1.5px solid ${s===v?C.green:C.border}`,
      background: s===v ? C.green : C.surface, color: s===v ? '#fff' : C.muted,
    }}>{label}</button>
  )

  const sc = (step: {icon:string;title:string;desc:string}, i: number) => (
    <div key={i} style={{ background:C.surface, border:`1.5px solid ${C.border}`, borderRadius:14, padding:'18px 20px', marginBottom:12 }}>
      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
        <div style={{ fontSize:32, flexShrink:0 }}>{step.icon}</div>
        <div>
          <div style={{ fontWeight:700, fontSize:16, color:C.text, marginBottom:6 }}>{step.title}</div>
          <div style={{ fontSize:14, color:C.muted, lineHeight:1.7 }}>{step.desc}</div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'Inter','DM Sans',sans-serif" }}>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'18px 24px', display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:C.green, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, color:'#fff', fontWeight:800 }}>M</div>
        <div>
          <div style={{ fontWeight:800, fontSize:18, color:C.text }}>Meal Count — Help Guide</div>
          <div style={{ fontSize:13, color:C.muted }}>Play Academy · CACFP meal recording instructions</div>
        </div>
        <button onClick={goBack}
          style={{ marginLeft:'auto', padding:'10px 20px', borderRadius:10, background:C.green, color:'#fff', border:'none', cursor:'pointer', fontSize:14, fontFamily:'inherit', fontWeight:700 }}>
          ← Back
        </button>
        <button onClick={() => window.print()}
          style={{ padding:'10px 16px', borderRadius:10, background:C.surface, color:C.muted, border:`1px solid ${C.border}`, cursor:'pointer', fontSize:13, fontFamily:'inherit', marginLeft:8 }}>
          🖨 Print
        </button>
        <a href="/instructions" style={{ padding:'10px 16px', borderRadius:10, background:C.greenLight, color:C.green, border:`1px solid ${C.border}`, fontSize:13, fontFamily:'inherit', marginLeft:8, textDecoration:'none', fontWeight:600 }}>
          📖 All Instructions
        </a>
      </div>

      {/* Nav */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', padding:'14px 24px', background:C.surface, borderBottom:`1px solid ${C.border}` }}>
        {visibleTabs.includes('overview') && nb('overview','📋 Overview')}
        {visibleTabs.includes('teacher') && nb('teacher','👩‍🏫 For Teachers')}
        {visibleTabs.includes('cook') && nb('cook','👨‍🍳 For Cooks')}
        {visibleTabs.includes('director') && nb('director','📊 For Directors')}
        {visibleTabs.includes('offline') && nb('offline','📶 Install & Offline')}
        {visibleTabs.includes('rules') && nb('rules','⚖️ CACFP Rules')}
      </div>

      {/* Content */}
      <div style={{ maxWidth:780, margin:'0 auto', padding:'28px 24px' }}>

        {s === 'overview' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:10 }}>How Meal Count Works</div>
            <div style={{ fontSize:16, color:C.muted, marginBottom:28, lineHeight:1.7 }}>
              Meal Count records daily meal participation for CACFP reimbursement. Every child present at every meal must be counted accurately. The system calculates milk and portions automatically based on each child's age.
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:28 }}>
              {[
                {icon:'👩‍🏫', role:'Teachers', color:'#1a5c3f', desc:'Check each present child for each meal served. Takes 30 seconds per meal.'},
                {icon:'👨‍🍳', role:'Cooks', color:'#92400e', desc:'View Kitchen totals to plan portions. Export weekly summary for ordering.'},
                {icon:'📊', role:'Directors', color:'#1e40af', desc:'Review all classroom counts. Export for CACFP site claim report.'},
                {icon:'🥛', role:'Milk & Portions', color:'#6b7280', desc:'Age-based automatically. No manual entry needed — set by date of birth.'},
              ].map(m => (
                <div key={m.role} style={{ background:C.surface, borderRadius:14, padding:'16px 18px', border:`1.5px solid ${C.border}` }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>{m.icon}</div>
                  <div style={{ fontWeight:700, fontSize:15, color:m.color, marginBottom:6 }}>{m.role}</div>
                  <div style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>{m.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ background:C.amberLight, border:`1.5px solid #f59e0b`, borderRadius:12, padding:'16px 20px' }}>
              <div style={{ fontWeight:800, fontSize:16, color:C.amber, marginBottom:8 }}>⚠️ CACFP Compliance</div>
              <div style={{ fontSize:14, color:C.amber, lineHeight:1.7 }}>
                Meal counts are the foundation of your CACFP reimbursement claim. Inaccurate counts — counting absent children, missing meals, or entering counts late — can result in claim disallowances and audit findings.<br/>
                <strong>Count only children who are present and eating the meal.</strong>
              </div>
            </div>
          </div>
        )}

        {s === 'teacher' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:6 }}>👩‍🏫 Teacher Instructions</div>
            <div style={{ fontSize:15, color:C.muted, marginBottom:24 }}>Check present children for each meal. Takes about 30 seconds.</div>
            {TEACHER_STEPS.map(sc)}
            <div style={{ background:C.greenLight, border:`1.5px solid #d1fae5`, borderRadius:12, padding:'14px 18px', marginTop:8 }}>
              <div style={{ fontWeight:700, fontSize:14, color:C.green, marginBottom:4 }}>💡 Tip</div>
              <div style={{ fontSize:13, color:C.green, lineHeight:1.6 }}>
                Do this for every meal every day. The count takes less time than signing a paper sheet and is automatically saved to CACFP records.
              </div>
            </div>
          </div>
        )}

        {s === 'cook' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:6 }}>👨‍🍳 Cook Instructions</div>
            <div style={{ fontSize:15, color:C.muted, marginBottom:24 }}>Use Kitchen View for meal planning and weekly totals.</div>
            {COOK_STEPS.map(sc)}
          </div>
        )}

        {s === 'director' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:6 }}>📊 Director Instructions</div>
            <div style={{ fontSize:15, color:C.muted, marginBottom:24 }}>Review counts and prepare CACFP site claim reports.</div>
            {DIRECTOR_STEPS.map(sc)}
          </div>
        )}

        {s === 'offline' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:6 }}>📶 Install & Work Offline</div>
            <div style={{ fontSize:15, color:C.muted, marginBottom:24 }}>Add the app to your Home Screen so it opens full-screen and keeps working when the internet is down.</div>
            {INSTALL_STEPS.map(sc)}
            <div style={{ background:C.greenLight, border:`1.5px solid #d1fae5`, borderRadius:12, padding:'14px 18px', marginTop:8 }}>
              <div style={{ fontWeight:700, fontSize:14, color:C.green, marginBottom:4 }}>💡 Nothing to remember</div>
              <div style={{ fontSize:13, color:C.green, lineHeight:1.6 }}>
                There is no "offline mode" to turn on. Just keep marking — the app handles the rest. Marks are safe on the device even if you close the app or restart the iPad before it syncs.
              </div>
            </div>
          </div>
        )}

        {s === 'rules' && (
          <div>
            <div style={{ fontSize:26, fontWeight:800, color:C.text, marginBottom:6 }}>⚖️ CACFP Rules</div>
            <div style={{ fontSize:15, color:C.muted, marginBottom:24 }}>Federal rules for CACFP meal count accuracy.</div>
            {RULES.map((r,i) => (
              <div key={i} style={{ background:C.surface, border:`1.5px solid ${C.border}`, borderLeft:`5px solid ${C.green}`, borderRadius:14, padding:'16px 20px', marginBottom:12 }}>
                <div style={{ fontWeight:700, fontSize:15, color:C.green, marginBottom:6 }}>{r.title}</div>
                <div style={{ fontSize:14, color:C.muted, lineHeight:1.7 }}>{r.desc}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
