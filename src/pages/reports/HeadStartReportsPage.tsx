import { useState } from 'react'
import PIRDataTab from './hs/PIRDataTab'
import MonthlyMealCountTab from './hs/MonthlyMealCountTab'
import NutritionSelfAssessmentTab from './hs/NutritionSelfAssessmentTab'

type Tab = 'pir' | 'meals' | 'self_assess'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'pir',         label: 'PIR Data',          icon: '📋' },
  { id: 'meals',       label: 'Monthly Meal Count', icon: '🍽️' },
  { id: 'self_assess', label: 'Self-Assessment',    icon: '✅' },
]

export default function HeadStartReportsPage() {
  const [tab, setTab] = useState<Tab>('pir')

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 4 }}>
        Head Start Reports
      </div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
        PIR nutrition data · Monthly meal count · Annual self-assessment
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#fff', padding: 4, borderRadius: 10, border: '1px solid #e4e8e4', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: tab === t.id ? '#0f4c35' : 'transparent',
            color: tab === t.id ? '#fff' : '#555',
            fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            transition: 'all 0.15s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e8e4', padding: 24 }}>
        {tab === 'pir'         && <PIRDataTab />}
        {tab === 'meals'       && <MonthlyMealCountTab />}
        {tab === 'self_assess' && <NutritionSelfAssessmentTab />}
      </div>
    </div>
  )
}
