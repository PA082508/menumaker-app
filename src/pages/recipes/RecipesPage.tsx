import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import RecipeDocsPanel from '@/components/recipes/RecipeDocsPanel'
import { useProgramConfig } from '@/hooks/useProgramConfig'

interface Recipe {
  id: string
  name: string
  program: string
  base_yield: number
  is_active: boolean
  is_purchased: boolean
  allergens: string[]
  contains_beef: boolean
  is_vegetarian: boolean
  preference_score: number
  cost_tier: string
  season: string[]
  admin_notes: string | null
  source_notes: string | null
  meal_type_id: string | null
  is_standardized: boolean
}

interface Nutrient {
  recipe_id: string
  energy_kcal: number | null
  protein_g: number | null
  sodium_mg: number | null
  fat_total_g: number | null
  calcium_mg: number | null
  iron_mg: number | null
  sodium_flag: boolean
}

interface Ingredient {
  id: string
  name: string
  quantity: number
  unit: string
  sort_order: number
  notes: string | null
}

const ALLERGEN_LABELS: Record<string, string> = {
  eggs: 'Eggs', gluten: 'Gluten', milk: 'Dairy',
  soy: 'Soy', tree_nuts: 'Tree Nuts', peanuts: 'Peanuts',
  fish: 'Fish', sesame: 'Sesame',
}

const COST_COLORS: Record<string, { bg: string; text: string }> = {
  low:    { bg: '#f0fff4', text: '#0f4c35' },
  medium: { bg: '#fff8f0', text: '#b45309' },
  high:   { bg: '#fff0f0', text: '#c0392b' },
}

const PREF_STARS = (score: number) =>
  '★'.repeat(score) + '☆'.repeat(5 - score)

function scaleQty(quantity: number, multiplier: number): string {
  const scaled = quantity * multiplier
  if (scaled >= 10) return Math.round(scaled).toString()
  if (scaled >= 1) return (Math.round(scaled * 4) / 4).toFixed(2).replace(/\.?0+$/, '')
  return (Math.round(scaled * 100) / 100).toFixed(2).replace(/\.?0+$/, '')
}

// ─── Field explanations shown in Edit mode ────────────────────────────────────
const FIELD_HINTS: Record<string, string> = {
  preference_score:
    'Rating 1–5 used by MenuAgent when auto-generating the weekly menu. ' +
    'Higher score = higher priority in rotation. Affects how often this recipe appears.',
  cost_tier:
    'Cost category (low / medium / high) used by PurchaseAgent for budget reports ' +
    'and cost-per-meal calculations. MenuAgent avoids scheduling multiple high-cost ' +
    'dishes back-to-back in the same day.',
  admin_notes:
    'Internal kitchen and director notes. Examples: "Sodium high — limit to 1× per week", ' +
    '"Children prefer with ketchup", "Double batch needed for Supper". ' +
    'Printed on the Batch Sheet.',
  is_active:
    'Controls whether this recipe is included in menu rotation. ' +
    'Set to inactive to temporarily remove it (seasonal unavailability, ' +
    'supplier issue, parent feedback) without deleting it.',
}

export default function RecipesPage() {
  const { isHeadStart } = useProgramConfig()
  const [recipes, setRecipes]     = useState<Recipe[]>([])
  const [nutrients, setNutrients] = useState<Record<string, Nutrient>>({})
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [filter, setFilter]       = useState<'all'|'active'|'pending'|'beef_free'|'vegetarian'>('all')
  const [selected, setSelected]   = useState<Recipe | null>(null)
  const [scaleCount, setScaleCount] = useState(25)

  // Edit mode state
  const [editMode, setEditMode]   = useState(false)
  const [editDraft, setEditDraft] = useState<Partial<Recipe>>({})
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState<'saved' | 'error' | null>(null)
  const [tooltip, setTooltip]     = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: r } = await supabase
        .schema('menumaker')
        .from('recipes')
        .select('*')
        .eq('program', 'child')
        .order('name')

      const { data: n } = await supabase
        .schema('menumaker')
        .from('product_nutrients')
        .select('recipe_id, energy_kcal, protein_g, sodium_mg, fat_total_g, calcium_mg, iron_mg, sodium_flag')

      setRecipes(r || [])
      const nMap: Record<string, Nutrient> = {}
      n?.forEach(x => { nMap[x.recipe_id] = x })
      setNutrients(nMap)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = recipes.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter =
      filter === 'all'        ? true :
      filter === 'active'     ? r.is_active :
      filter === 'pending'    ? r.source_notes?.includes('pending') :
      filter === 'beef_free'  ? !r.contains_beef :
      filter === 'vegetarian' ? r.is_vegetarian : true
    return matchSearch && matchFilter
  })

  const scaleMultiplier = scaleCount / (selected?.base_yield || 25)

  const openEdit = () => {
    if (!selected) return
    setEditDraft({
      preference_score: selected.preference_score,
      cost_tier:        selected.cost_tier,
      admin_notes:      selected.admin_notes,
      is_active:        selected.is_active,
    })
    setSaveMsg(null)
    setEditMode(true)
  }

  const cancelEdit = () => {
    setEditMode(false)
    setEditDraft({})
    setSaveMsg(null)
    setTooltip(null)
  }

  const saveEdit = async () => {
    if (!selected) return
    setSaving(true)
    setSaveMsg(null)
    const { error } = await supabase
      .schema('menumaker')
      .from('recipes')
      .update({
        preference_score: editDraft.preference_score,
        cost_tier:        editDraft.cost_tier,
        admin_notes:      editDraft.admin_notes,
        is_active:        editDraft.is_active,
      })
      .eq('id', selected.id)

    if (error) {
      setSaveMsg('error')
    } else {
      // Update local state
      const updated = { ...selected, ...editDraft } as Recipe
      setRecipes(prev => prev.map(r => r.id === selected.id ? updated : r))
      setSelected(updated)
      setSaveMsg('saved')
      setTimeout(() => {
        setEditMode(false)
        setEditDraft({})
        setSaveMsg(null)
        setTooltip(null)
      }, 1200)
    }
    setSaving(false)
  }

  if (loading) return (
    <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#888' }}>
      Loading recipes...
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      {/* ── LEFT: Recipe List ── */}
      <div style={{
        width: selected ? 380 : '100%',
        maxWidth: selected ? 380 : '100%',
        display: 'flex', flexDirection: 'column',
        borderRight: selected ? '1px solid #e0e0e0' : 'none',
        background: '#fff', transition: 'all 0.2s ease',
      }}>
        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: '#0a3320', marginBottom: 4 }}>
            Recipe Manager
          </div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
            {recipes.filter(r => r.is_active).length} active ·{' '}
            {recipes.filter(r => r.source_notes?.includes('pending')).length} pending RecipeAgent ·{' '}
            {recipes.length} total
          </div>

          <div style={{ position: 'relative', marginBottom: 12 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: 14 }}>🔍</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search recipes..."
              style={{
                width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
                border: '1.5px solid #e8e8e8', fontSize: 13, fontFamily: 'inherit',
                background: '#fafaf8', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([
              ['all','All'], ['active','✓ Active'], ['pending','⏳ Pending'],
              ['beef_free','🚫 No Beef'], ['vegetarian','🌿 Veg'],
            ] as [typeof filter, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)} style={{
                padding: '4px 10px', borderRadius: 6,
                border: `1px solid ${filter === val ? '#0f4c35' : '#e0e0e0'}`,
                background: filter === val ? '#0f4c35' : '#fff',
                color: filter === val ? '#fff' : '#666',
                fontSize: 11, fontWeight: filter === val ? 600 : 400,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(recipe => {
            const n = nutrients[recipe.id]
            const isSelected = selected?.id === recipe.id
            const isPending = recipe.source_notes?.includes('pending')
            return (
              <div key={recipe.id} onClick={() => { setSelected(isSelected ? null : recipe); setEditMode(false) }} style={{
                padding: '14px 20px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer',
                background: isSelected ? '#f0fff4' : 'transparent',
                borderLeft: isSelected ? '3px solid #0f4c35' : '3px solid transparent',
                transition: 'all 0.1s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isPending ? '#888' : '#1a1a1a', marginBottom: 3 }}>
                      {recipe.name}
                      {!recipe.is_active && (
                        <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#f0f0f0', color: '#999', fontWeight: 600 }}>INACTIVE</span>
                      )}
                      {isPending && (
                        <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#fff3e0', color: '#e67e22', fontWeight: 600 }}>PENDING</span>
                      )}
                      {isHeadStart && recipe.is_standardized && (
                        <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4, background: '#f5f3ff', color: '#7c3aed', fontWeight: 600 }}>STD</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: COST_COLORS[recipe.cost_tier]?.bg || '#f0f0f0',
                        color: COST_COLORS[recipe.cost_tier]?.text || '#666', fontWeight: 500,
                      }}>{recipe.cost_tier}</span>
                      {recipe.is_vegetarian && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f0fff4', color: '#0f4c35' }}>🌿 veg</span>}
                      {n?.sodium_flag && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fff0f0', color: '#c0392b' }}>⚠️ Na</span>}
                      {recipe.contains_beef && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fff8f0', color: '#b45309' }}>🥩 beef</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                    {n?.energy_kcal && (
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f4c35' }}>
                        {Math.round(n.energy_kcal)}<span style={{ fontSize: 9, color: '#888', fontWeight: 400 }}>kcal</span>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#f59e0b' }}>{PREF_STARS(recipe.preference_score || 3)}</div>
                  </div>
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>No recipes match your search</div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Recipe Detail ── */}
      {selected && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', lineHeight: 1.1, marginBottom: 6 }}>
                {selected.name}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selected.is_vegetarian   && <Badge color="#0f4c35" bg="#f0fff4">🌿 Vegetarian</Badge>}
                {selected.contains_beef   && <Badge color="#b45309" bg="#fff8f0">🥩 Contains Beef</Badge>}
                {selected.is_purchased    && <Badge color="#2980b9" bg="#f0f6ff">🛒 Purchased</Badge>}
                {!selected.is_active      && <Badge color="#999"    bg="#f0f0f0">⏸ Inactive</Badge>}
                {selected.source_notes?.includes('pending') && <Badge color="#e67e22" bg="#fff8f0">⏳ RecipeAgent Pending</Badge>}
                {isHeadStart && selected.is_standardized && <Badge color="#7c3aed" bg="#f5f3ff">📋 Standardized Recipe</Badge>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {!editMode && (
                <button onClick={openEdit} style={{
                  padding: '6px 14px', borderRadius: 6,
                  border: '1px solid #0f4c35', background: '#0f4c35',
                  color: '#fff', cursor: 'pointer', fontSize: 12,
                  fontWeight: 600, fontFamily: 'inherit',
                }}>✏️ Edit</button>
              )}
              <button onClick={() => { setSelected(null); setEditMode(false) }} style={{
                padding: '6px 12px', borderRadius: 6, border: '1px solid #e0e0e0',
                background: '#fff', cursor: 'pointer', fontSize: 12, color: '#666', fontFamily: 'inherit',
              }}>✕ Close</button>
            </div>
          </div>

          {/* ── EDIT MODE PANEL ── */}
          {editMode && (
            <div style={{
              background: '#fff', border: '2px solid #0f4c35', borderRadius: 14,
              padding: '20px 24px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f4c35', marginBottom: 16 }}>
                ✏️ Edit Recipe Settings
              </div>

              {/* Tooltip display */}
              {tooltip && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8, background: '#f0fff4',
                  border: '1px solid #c0e0c0', fontSize: 12, color: '#2d6a4f',
                  lineHeight: 1.5, marginBottom: 16,
                }}>
                  ℹ️ {tooltip}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                {/* is_active */}
                <EditField
                  label="Active in rotation"
                  hint={FIELD_HINTS.is_active}
                  onHint={setTooltip}
                >
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    {[true, false].map(val => (
                      <button key={String(val)} onClick={() => setEditDraft(d => ({ ...d, is_active: val }))} style={{
                        flex: 1, padding: '8px', borderRadius: 8,
                        border: `1.5px solid ${editDraft.is_active === val ? '#0f4c35' : '#e0e0e0'}`,
                        background: editDraft.is_active === val ? '#0f4c35' : '#fff',
                        color: editDraft.is_active === val ? '#fff' : '#666',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        {val ? '✓ Active' : '⏸ Inactive'}
                      </button>
                    ))}
                  </div>
                </EditField>

                {/* cost_tier */}
                <EditField
                  label="Cost tier"
                  hint={FIELD_HINTS.cost_tier}
                  onHint={setTooltip}
                >
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {(['low','medium','high'] as const).map(tier => (
                      <button key={tier} onClick={() => setEditDraft(d => ({ ...d, cost_tier: tier }))} style={{
                        flex: 1, padding: '8px', borderRadius: 8,
                        border: `1.5px solid ${editDraft.cost_tier === tier ? COST_COLORS[tier].text : '#e0e0e0'}`,
                        background: editDraft.cost_tier === tier ? COST_COLORS[tier].bg : '#fff',
                        color: editDraft.cost_tier === tier ? COST_COLORS[tier].text : '#999',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        textTransform: 'capitalize',
                      }}>
                        {tier}
                      </button>
                    ))}
                  </div>
                </EditField>

                {/* preference_score */}
                <EditField
                  label="Preference score"
                  hint={FIELD_HINTS.preference_score}
                  onHint={setTooltip}
                >
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => setEditDraft(d => ({ ...d, preference_score: n }))} style={{
                        width: 36, height: 36, borderRadius: 8,
                        border: `1.5px solid ${(editDraft.preference_score || 0) >= n ? '#f59e0b' : '#e0e0e0'}`,
                        background: (editDraft.preference_score || 0) >= n ? '#fffbeb' : '#fff',
                        fontSize: 18, cursor: 'pointer', lineHeight: 1,
                      }}>
                        {(editDraft.preference_score || 0) >= n ? '★' : '☆'}
                      </button>
                    ))}
                    <span style={{ fontSize: 12, color: '#888', alignSelf: 'center', marginLeft: 4 }}>
                      {editDraft.preference_score}/5
                    </span>
                  </div>
                </EditField>

                {/* admin_notes — full width */}
                <EditField
                  label="Admin notes"
                  hint={FIELD_HINTS.admin_notes}
                  onHint={setTooltip}
                  fullWidth
                >
                  <textarea
                    value={editDraft.admin_notes || ''}
                    onChange={e => setEditDraft(d => ({ ...d, admin_notes: e.target.value }))}
                    placeholder='e.g. "Sodium high — limit to 1× per week" · Printed on Batch Sheet'
                    rows={3}
                    style={{
                      width: '100%', marginTop: 6, padding: '8px 10px',
                      borderRadius: 8, border: '1.5px solid #e0e0e0',
                      fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
                      outline: 'none', color: '#333', lineHeight: 1.5,
                      boxSizing: 'border-box',
                    }}
                  />
                </EditField>
              </div>

              {/* Save / Cancel */}
              <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
                <button onClick={saveEdit} disabled={saving} style={{
                  padding: '8px 20px', borderRadius: 8,
                  border: 'none', background: saving ? '#aaa' : '#0f4c35',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                }}>
                  {saving ? 'Saving...' : '💾 Save Changes'}
                </button>
                <button onClick={cancelEdit} style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid #e0e0e0', background: '#fff',
                  color: '#666', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  Cancel
                </button>
                {saveMsg === 'saved' && (
                  <span style={{ fontSize: 13, color: '#0f4c35', fontWeight: 600 }}>✓ Saved</span>
                )}
                {saveMsg === 'error' && (
                  <span style={{ fontSize: 13, color: '#c0392b' }}>✗ Error saving — check console</span>
                )}
              </div>
            </div>
          )}

          {/* ── Nutrients + Recipe Info ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

            {/* Nutrients */}
            <div style={{ background: '#fff', border: '1px solid #e8ece9', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                Nutrition Facts · per 100g
              </div>
              {nutrients[selected.id] ? (
                <div>
                  {[
                    { label: 'Calories',   value: nutrients[selected.id].energy_kcal, unit: 'kcal', highlight: false },
                    { label: 'Protein',    value: nutrients[selected.id].protein_g,   unit: 'g',    highlight: (nutrients[selected.id].protein_g || 0) > 10 },
                    { label: 'Total Fat',  value: nutrients[selected.id].fat_total_g, unit: 'g',    highlight: false },
                    { label: 'Sodium',     value: nutrients[selected.id].sodium_mg,   unit: 'mg',   highlight: nutrients[selected.id].sodium_flag },
                    { label: 'Calcium',    value: nutrients[selected.id].calcium_mg,  unit: 'mg',   highlight: (nutrients[selected.id].calcium_mg || 0) > 200 },
                    { label: 'Iron',       value: nutrients[selected.id].iron_mg,     unit: 'mg',   highlight: (nutrients[selected.id].iron_mg || 0) > 1 },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <span style={{ fontSize: 13, color: '#444' }}>{item.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: item.highlight ? (item.label === 'Sodium' ? '#c0392b' : '#0f4c35') : '#1a1a1a' }}>
                        {item.value ? `${Math.round(item.value * 10) / 10} ${item.unit}` : '—'}
                        {item.label === 'Sodium' && nutrients[selected.id].sodium_flag && ' ⚠️'}
                        {item.label === 'Protein' && (nutrients[selected.id].protein_g || 0) > 10 && ' ✓'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#e67e22', fontSize: 13 }}>
                  ⏳ Nutrients pending RecipeAgent
                </div>
              )}
            </div>

            {/* Recipe Info */}
            <div style={{ background: '#fff', border: '1px solid #e8ece9', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                Recipe Info
              </div>
              {[
                { label: 'Base yield',  value: `${selected.base_yield} portions` },
                { label: 'Cost tier',   value: selected.cost_tier },
                { label: 'Preference',  value: PREF_STARS(selected.preference_score || 3) },
                { label: 'Active',      value: selected.is_active ? '✓ Yes' : '⏸ No' },
                { label: 'Season',      value: selected.season?.join(', ') || 'all' },
                { label: 'Source',      value: selected.is_purchased ? 'Purchased product' : 'Kitchen recipe' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: 13, color: '#444' }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: item.label === 'Active' && !selected.is_active ? '#999' : '#1a1a1a' }}>{item.value}</span>
                </div>
              ))}
              {selected.allergens?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Allergens:</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {selected.allergens.map(a => (
                      <span key={a} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#fff0f0', color: '#c0392b', fontWeight: 600 }}>
                        {ALLERGEN_LABELS[a] || a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selected.admin_notes && (
                <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 6, background: '#fafaf8', fontSize: 11, color: '#666', lineHeight: 1.5 }}>
                  📝 {selected.admin_notes}
                </div>
              )}
            </div>
          </div>

          {/* Yield Calculator + Batch Sheet */}
          <div style={{ background: '#fff', border: '1px solid #e8ece9', borderRadius: 14, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
              🍽️ Yield Calculator
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Number of children</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setScaleCount(Math.max(1, scaleCount - 5))} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: 16 }}>−</button>
                  <input type="number" value={scaleCount} onChange={e => setScaleCount(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: 70, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #0f4c35', fontSize: 16, fontWeight: 600, color: '#0f4c35', textAlign: 'center', fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={() => setScaleCount(scaleCount + 5)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: 16 }}>+</button>
                </div>
              </div>
              <div style={{ color: '#aaa', fontSize: 20 }}>→</div>
              <div style={{ padding: '10px 16px', borderRadius: 10, background: '#f0fff4', border: '1px solid #c0e0c0' }}>
                <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>Scale factor</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f4c35' }}>×{scaleMultiplier.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Quick presets</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[25, 50, 100, 150, 208].map(n => (
                    <button key={n} onClick={() => setScaleCount(n)} style={{
                      padding: '4px 10px', borderRadius: 6,
                      border: `1px solid ${scaleCount === n ? '#0f4c35' : '#e0e0e0'}`,
                      background: scaleCount === n ? '#0f4c35' : '#fff',
                      color: scaleCount === n ? '#fff' : '#666',
                      fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    }}>{n}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              {[
                { label: '1-2 years',  milk: '½ cup',  grain: '½ oz eq',  meat: '1 oz',    veg: '⅛ cup', fruit: '⅛ cup' },
                { label: '3-5 years',  milk: '¾ cup',  grain: '½ oz eq',  meat: '1½ oz',   veg: '¼ cup', fruit: '¼ cup' },
                { label: '6-12 years', milk: '1 cup',  grain: '1 oz eq',  meat: '2 oz',    veg: '½ cup', fruit: '¼ cup' },
              ].map(ag => (
                <div key={ag.label} style={{ padding: '12px', borderRadius: 10, background: '#fafaf8', border: '1px solid #e8e8e8' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#0f4c35', marginBottom: 8 }}>{ag.label}</div>
                  {[['Milk',ag.milk],['Meat/Alt',ag.meat],['Grain',ag.grain],['Vegetable',ag.veg],['Fruit',ag.fruit]].map(([c,p]) => (
                    <div key={c} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ color: '#888' }}>{c}</span>
                      <span style={{ fontWeight: 500, color: '#333' }}>{p}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <BatchSheet
              recipeId={selected.id}
              recipeName={selected.name}
              baseYield={selected.base_yield}
              scaleCount={scaleCount}
              scaleMultiplier={scaleMultiplier}
            />
          </div>

          {/* CACFP Components */}
          <div style={{ background: '#fff', border: '1px solid #e8ece9', borderRadius: 14, padding: '20px', marginBottom: isHeadStart ? 16 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
              ✅ CACFP Components Covered
            </div>
            <CACFPCoverage recipeId={selected.id} />
          </div>

          {/* Product Docs — Head Start only */}
          {isHeadStart && (
            <div style={{ background: '#fff', border: '1px solid #e8ece9', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                📁 Product Documents
              </div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
                Standardized recipe cards, CN labels, and product specs. Required for Head Start 1302.44 documentation.
              </div>
              <RecipeDocsPanel recipeId={selected.id} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── EditField wrapper ────────────────────────────────────────────────────────

function EditField({
  label, hint, onHint, fullWidth = false, children,
}: {
  label: string
  hint: string
  onHint: (h: string | null) => void
  fullWidth?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#444' }}>{label}</span>
        <button
          onMouseEnter={() => onHint(hint)}
          onMouseLeave={() => onHint(null)}
          style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '1px solid #c0c0c0', background: '#f5f5f5',
            fontSize: 10, color: '#888', cursor: 'help',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'serif', fontWeight: 700,
          }}
        >?</button>
      </div>
      {children}
    </div>
  )
}

// ─── Batch Sheet ──────────────────────────────────────────────────────────────

function BatchSheet({ recipeId, recipeName, baseYield, scaleCount, scaleMultiplier }: {
  recipeId: string; recipeName: string; baseYield: number
  scaleCount: number; scaleMultiplier: number
}) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const load = async () => {
      const { data } = await supabase
        .schema('menumaker')
        .from('recipe_ingredients')
        .select('id, name_override, quantity, unit, sort_order, notes, products:product_id(name)')
        .eq('recipe_id', recipeId)
        .order('sort_order')

      setIngredients((data || []).map((d: any) => ({
        id: d.id,
        name: d.name_override || d.products?.name || '—',
        quantity: d.quantity,
        unit: d.unit,
        sort_order: d.sort_order,
        notes: d.notes,
      })))
      setLoading(false)
    }
    load()
  }, [recipeId])

  const handlePrint = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`
      <html><head><title>Batch Sheet — ${recipeName}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a1a; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #0f4c35; color: white; padding: 8px 12px; text-align: left; font-size: 12px; }
        td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
        tr:nth-child(even) td { background: #f9f9f9; }
        .qty { font-weight: 700; color: #0f4c35; }
        .footer { margin-top: 20px; font-size: 11px; color: #aaa; }
      </style></head><body>
      <h1>🍽️ Batch Sheet — ${recipeName}</h1>
      <div class="meta">
        Scale: ${baseYield} → <strong>${scaleCount} portions</strong> &nbsp;·&nbsp;
        Factor: ×${scaleMultiplier.toFixed(2)} &nbsp;·&nbsp;
        Printed: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
      <table>
        <thead><tr><th>#</th><th>Ingredient</th><th>Base (${baseYield})</th><th>Scaled (${scaleCount})</th><th>Unit</th><th>Notes</th></tr></thead>
        <tbody>
          ${ingredients.map((ing, i) => `
            <tr>
              <td>${i + 1}</td><td>${ing.name}</td>
              <td>${ing.quantity}</td>
              <td class="qty">${scaleQty(ing.quantity, scaleMultiplier)}</td>
              <td>${ing.unit}</td>
              <td style="color:#888;font-size:11px">${ing.notes || ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="footer">MenuMaker · Play Academy · CACFP Program</div>
      </body></html>`)
    w.document.close()
    w.print()
  }

  if (loading) return <div style={{ padding: '12px 0', color: '#aaa', fontSize: 13 }}>Loading batch sheet...</div>
  if (ingredients.length === 0) return (
    <div style={{ padding: '16px', borderRadius: 10, background: '#fff8f0', border: '1px solid #ffe0b0', fontSize: 13, color: '#b45309' }}>
      ⏳ No ingredients loaded yet — RecipeAgent pending
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.08em' }}>📋 Batch Sheet</span>
          <span style={{ fontSize: 11, color: '#888', marginLeft: 10 }}>
            {baseYield} portions base → <strong style={{ color: '#0f4c35' }}>{scaleCount} portions</strong>
          </span>
        </div>
        <button onClick={handlePrint} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 8, border: '1px solid #0f4c35',
          background: '#0f4c35', color: '#fff', fontSize: 12,
          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>🖨️ Print Batch Sheet</button>
      </div>

      <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e8e8e8' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 100px auto', background: '#0f4c35', padding: '8px 14px', gap: 8 }}>
          {['#','Ingredient',`Base (${baseYield})`,`×${scaleMultiplier.toFixed(1)} → ${scaleCount}`,'Unit','Notes'].map((h, i) => (
            <div key={i} style={{ fontSize: 10, fontWeight: 600, color: '#a8d5b5', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}>{h}</div>
          ))}
        </div>
        {ingredients.map((ing, i) => (
          <div key={ing.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 100px auto', padding: '9px 14px', gap: 8, background: i % 2 === 0 ? '#fff' : '#fafaf8', borderBottom: i < ingredients.length - 1 ? '1px solid #f0f0f0' : 'none', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#ccc', fontWeight: 600 }}>{i + 1}</div>
            <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 500 }}>{ing.name}</div>
            <div style={{ fontSize: 12, color: '#888', textAlign: 'right' }}>{ing.quantity}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f4c35', textAlign: 'right' }}>{scaleQty(ing.quantity, scaleMultiplier)}</div>
            <div style={{ fontSize: 12, color: '#666', textAlign: 'right' }}>{ing.unit}</div>
            <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>{ing.notes || ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: bg, color, fontWeight: 500, border: `1px solid ${color}30` }}>
      {children}
    </span>
  )
}

// ─── CACFP Coverage ───────────────────────────────────────────────────────────

function CACFPCoverage({ recipeId }: { recipeId: string }) {
  const [components, setComponents] = useState<Array<{ component: string; quantity: string; unit: string; age_group: string }>>([])

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .schema('menumaker')
        .from('recipe_components')
        .select('quantity, unit, components:component_id(label, slug), age_groups:age_group_id(label, slug)')
        .eq('recipe_id', recipeId)

      setComponents(data?.map((d: any) => ({
        component: d.components?.label || '',
        quantity: d.quantity,
        unit: d.unit,
        age_group: d.age_groups?.label || '',
      })) || [])
    }
    load()
  }, [recipeId])

  if (components.length === 0) return <div style={{ fontSize: 13, color: '#aaa' }}>No CACFP components data yet</div>

  const grouped: Record<string, typeof components> = {}
  components.forEach(c => {
    if (!grouped[c.component]) grouped[c.component] = []
    grouped[c.component].push(c)
  })

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {Object.entries(grouped).map(([comp, items]) => (
        <div key={comp} style={{ padding: '10px 14px', borderRadius: 10, background: '#f0fff4', border: '1px solid #c0e0c0', minWidth: 140 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f4c35', marginBottom: 6 }}>✓ {comp}</div>
          {items.map((item, i) => (
            <div key={i} style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>
              {item.age_group}: <strong>{item.quantity} {item.unit}</strong>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}