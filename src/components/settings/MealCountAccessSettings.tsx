/**
 * MealCountAccessSettings.tsx
 *
 * Settings tab: "Meal Count Access" — admin/office_manager provisioning form.
 *
 * Lets an administrator create a login account that can access the Meal Count
 * feature for a specific center. The form collects an email + password, a
 * category (Director or Cook; Teacher is reserved/disabled), and the target
 * center (populated from OrgContext — never hardcoded).
 *
 * On submit it calls the `provision-access` Supabase edge function with
 * { email, password, category, center_id }. Success is signalled by
 * `data.ok === true` (the function also returns `data.user_id`). The function
 * returns a Russian error string in `data.error` for handled errors (e.g. a
 * 409 when the email is already taken); we surface that string preferentially,
 * falling back to the transport-level `error.message`.
 *
 * Self-contained: re-creates the local `Field` helper, `inputStyle`, and the
 * primary-button idioms used by SettingsPage rather than importing them.
 *
 * Rendered only for admin/office_manager (parent gates access; no re-gate here).
 */

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

// ─── Local style idioms (mirrors SettingsPage) ─────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 7, border: '1.5px solid #e0e0e0',
  fontSize: 12, fontFamily: 'inherit', outline: 'none', background: '#fff',
  color: '#1a1a1a', boxSizing: 'border-box', width: '100%',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{label}</span>
      {children}
    </label>
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Category = 'Director' | 'Cook'

const CATEGORIES: Category[] = ['Director', 'Cook']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── Component ────────────────────────────────────────────────────────────────

export default function MealCountAccessSettings() {
  const { centers } = useOrg()
  const activeCenters = centers.filter(c => c.is_active)

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [category, setCategory] = useState<Category | ''>('')
  const [centerId, setCenterId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [success, setSuccess]       = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  function resetForm() {
    setEmail('')
    setPassword('')
    setCategory('')
    setCenterId('')
  }

  function validate(): string | null {
    if (!email.trim())              return 'Enter an email.'
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email.'
    if (password.length < 8)        return 'Password must be at least 8 characters.'
    if (category !== 'Director' && category !== 'Cook') return 'Choose a category.'
    if (!centerId)                  return 'Choose a center.'
    return null
  }

  async function handleSubmit() {
    setError(null)
    setSuccess(false)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('provision-access', {
        body: {
          email: email.trim(),
          password,
          category,            // exactly "Director" or "Cook"
          center_id: centerId,
        },
      })

      // Prefer the handled (Russian) error string from the function body.
      const bodyError: string | undefined = data?.error

      if (fnError) {
        const status = (fnError as any)?.context?.status
        const isConflict =
          status === 409 ||
          (bodyError && /занят|409/i.test(bodyError))

        if (isConflict) {
          setError('This email is already taken.')
        } else {
          setError(bodyError || fnError.message || 'Could not create access.')
        }
        return
      }

      if (bodyError) {
        if (/занят|409/i.test(bodyError)) {
          setError('This email is already taken.')
        } else {
          setError(bodyError)
        }
        return
      }

      if (data?.ok === true) {
        setSuccess(true)
        resetForm()
      } else {
        setError('Could not create access.')
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <div style={{
        background: '#fff', border: '1px solid #e8e8e8', borderRadius: 14, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0a3320', marginBottom: 2 }}>
            Create Meal Count Access
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>
            One account — one category and one center.
          </div>
        </div>

        <Field label="Email *">
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="user@example.com"
            style={inputStyle}
          />
        </Field>

        <Field label="Password *">
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ ...inputStyle, paddingRight: 42 }}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                color: '#888', display: 'flex', alignItems: 'center',
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <span style={{ fontSize: 10, color: '#aaa' }}>min 8 characters</span>
        </Field>

        <Field label="Category *">
          <div style={{ display: 'flex', gap: 8 }}>
            {CATEGORIES.map(cat => {
              const active = category === cat
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, fontFamily: 'inherit', cursor: 'pointer',
                    border:     `1.5px solid ${active ? '#0f4c35' : '#e0e0e0'}`,
                    background: active ? '#0f4c35' : '#fff',
                    color:      active ? '#fff' : '#888',
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  {cat === 'Director' ? '🗂️ Director' : '👨‍🍳 Cook'}
                </button>
              )
            })}
            <button
              type="button"
              disabled
              title="Coming soon"
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 8, fontFamily: 'inherit', cursor: 'not-allowed',
                border: '1.5px dashed #e0e0e0', background: '#fafafa', color: '#bbb',
                fontSize: 11, fontWeight: 600,
              }}
            >
              Teacher (coming soon)
            </button>
          </div>
        </Field>

        <Field label="Center *">
          <select
            value={centerId}
            onChange={e => setCenterId(e.target.value)}
            style={inputStyle}
          >
            <option value="">— select a center —</option>
            {activeCenters.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        {error && (
          <div style={{
            fontSize: 12, fontWeight: 500, color: '#c0392b',
            background: '#fff0f0', border: '1px solid #f5c6c6',
            borderRadius: 7, padding: '8px 10px',
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            fontSize: 12, fontWeight: 600, color: '#0f4c35',
            background: '#f0fff4', border: '1px solid #bbf7d0',
            borderRadius: 7, padding: '8px 10px',
          }}>
            ✓ Access created
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            padding: '9px 18px', borderRadius: 7, border: 'none', fontFamily: 'inherit',
            background: submitting ? '#ccc' : '#0f4c35', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          {submitting ? 'Creating…' : 'Create access'}
        </button>
      </div>
    </div>
  )
}
