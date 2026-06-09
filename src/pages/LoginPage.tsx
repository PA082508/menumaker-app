import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { signIn } = useAuth()
  const navigate   = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a3320 0%, #0f4c35 40%, #1a6b4a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet"/>

      {/* Background decorative circles */}
      {[
        { size: 400, top: -100, right: -100, opacity: 0.06 },
        { size: 250, bottom: -80, left: -80, opacity: 0.08 },
        { size: 150, top: '40%', left: '10%', opacity: 0.05 },
      ].map((c, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: c.size, height: c.size,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.2)',
          top: c.top, right: c.right,
          bottom: c.bottom, left: c.left,
          opacity: c.opacity,
          background: 'rgba(255,255,255,0.05)',
        }}/>
      ))}

      <div style={{
        width: '100%',
        maxWidth: 420,
        padding: '0 24px',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64, height: 64,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)',
            marginBottom: 20,
            fontSize: 28,
          }}>
            🍽️
          </div>
          <div style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 36,
            color: '#fff',
            letterSpacing: '-0.02em',
            lineHeight: 1,
            marginBottom: 8,
          }}>
            MenuMaker
          </div>
          <div style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}>
            Play Academy · CACFP
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 20,
          padding: '36px 32px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        }}>
          <div style={{
            fontSize: 20,
            fontWeight: 600,
            color: '#0f4c35',
            marginBottom: 6,
          }}>
            Welcome back
          </div>
          <div style={{
            fontSize: 13,
            color: '#888',
            marginBottom: 28,
          }}>
            Sign in to your account to continue
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                color: '#444',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 6,
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@playacademy.com"
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1.5px solid #e0e0e0',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  background: '#fafaf8',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#0f4c35'}
                onBlur={e => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                color: '#444',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 6,
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1.5px solid #e0e0e0',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  background: '#fafaf8',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = '#0f4c35'}
                onBlur={e => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: '#fff0f0',
                border: '1px solid #fcc',
                color: '#c0392b',
                fontSize: 13,
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: 10,
                border: 'none',
                background: loading
                  ? '#ccc'
                  : 'linear-gradient(135deg, #0f4c35, #1a6b4a)',
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: loading ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em',
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div style={{
            marginTop: 20,
            textAlign: 'center',
            fontSize: 12,
            color: '#aaa',
          }}>
            Contact your administrator to reset your password
          </div>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          marginTop: 24,
          fontSize: 11,
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.06em',
        }}>
          MENUMAKER v0.1 · PLAY ACADEMY INC · MENTOR, OH
        </div>
      </div>
    </div>
  )
}
