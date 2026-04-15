import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const API = 'http://localhost:5000'

/* ─── design tokens ──────────────────────────────────────────────── */
const C = {
  bg:         '#1a1f2e',
  surface:    '#141927',
  surfaceHov: '#181e2e',
  border:     'rgba(255,255,255,0.06)',
  borderHov:  'rgba(0,220,200,0.3)',
  accent:     '#00dcc8',
  accentDim:  'rgba(0,220,200,0.1)',
  accentGlow: 'rgba(0,220,200,0.25)',
  text:       '#e8e6f0',
  textMuted:  'rgba(255,255,255,0.35)',
  textDim:    'rgba(255,255,255,0.5)',
  green:      '#34d399',
  greenDim:   'rgba(52,211,153,0.15)',
  red:        '#f87171',
  redDim:     'rgba(248,113,113,0.15)',
  yellow:     '#fbbf24',
  mono:       "'Geist Mono', ui-monospace, monospace",
}

/* ─── helpers ────────────────────────────────────────────────────── */
function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtRelative(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function extractDomain(url) {
  if (!url) return null
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
}

/* ─── Sparkline ──────────────────────────────────────────────────── */
function Sparkline({ activity, name, width = 64 }) {
  const points = activity.filter(a => a.competitor === name).slice(0, 12).reverse()
  const w = width, h = 24, pad = 3
  if (points.length < 2) {
    return (
      <svg width={w} height={h} style={{ opacity: 0.2 }}>
        <line x1="0" y1="12" x2={w} y2="12" stroke={C.accent} strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    )
  }
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2))
  const ys = points.map((_, i) => h - pad - (i / (points.length - 1)) * (h - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const area = d + ` L${xs[xs.length-1].toFixed(1)},${h} L${xs[0].toFixed(1)},${h} Z`
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${name}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.3" />
          <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${name})`} />
      <path d={d} fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length-1]} cy={ys[ys.length-1]} r="2.5" fill={C.accent} />
    </svg>
  )
}

/* ─── StatCard ───────────────────────────────────────────────────── */
function StatCard({ label, value, sub, pulse, accentTop, dimValue }) {
  const numericValue = typeof value === 'number' ? value : null
  const isChanges = accentTop === false && dimValue !== undefined
  const valueColor = dimValue
    ? (numericValue > 0 ? C.accent : 'rgba(255,255,255,0.3)')
    : C.accent
  const valueShadow = dimValue && numericValue > 0
    ? '0 0 20px rgba(0,220,200,0.3)'
    : 'none'

  return (
    <div style={{
      flex: 1, minWidth: 160,
      background: '#1e2535',
      border: `1px solid ${C.border}`,
      borderTop: accentTop ? '2px solid rgba(0,220,200,0.4)' : `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '18px 22px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {pulse && (
          <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10 }}>
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: C.accent, animation: 'pulse-ring 1.6s ease-out infinite',
            }} />
            <span style={{ position: 'relative', width: 10, height: 10, borderRadius: '50%', background: C.accent, display: 'block' }} />
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 36, fontWeight: 700, color: valueColor, lineHeight: 1, letterSpacing: '-0.04em', fontFamily: C.mono, textShadow: valueShadow }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

/* ─── AddModal (tabbed) ──────────────────────────────────────────── */
function AddModal({ onClose, onAdded }) {
  const [tab, setTab] = useState('basic')
  const [form, setForm] = useState({
    name: '',
    website: '',
    linkedin_slug: '',
    pricing_url: '',
    changelog_url: '',
    careers_url: '',
    twitter_handle: '',
    linkedin_handle: '',
    producthunt_slug: '',
    schedule_frequency: 'Weekly',
    schedule_day: 'Monday',
    schedule_time: '9:00 AM',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const tabs = [
    { id: 'basic',    label: 'Basic Info' },
    { id: 'pages',    label: 'Pages' },
    { id: 'social',   label: 'Social' },
    { id: 'schedule', label: 'Schedule' },
  ]

  function field(key, label, placeholder, hint, example) {
    return (
      <div style={{ marginBottom: hint ? 20 : 16 }}>
        <label style={{
          display: 'block', fontSize: 11, fontWeight: 500,
          color: C.textMuted, textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 6,
        }}>
          {label}
        </label>
        <input
          value={form[key]}
          onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '10px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${C.border}`,
            borderRadius: 9, color: C.text,
            fontSize: 14, fontFamily: "'Geist', sans-serif",
            outline: 'none', transition: 'border-color 0.15s',
            boxSizing: 'border-box',
          }}
          onFocus={e => e.target.style.borderColor = C.accent}
          onBlur={e => e.target.style.borderColor = C.border}
        />
        {hint && (
          <div style={{ marginTop: 5, fontFamily: C.mono, fontSize: 10, color: 'rgba(255,255,255,0.22)', lineHeight: 1.5 }}>
            {hint}{example && <span style={{ opacity: 0.7 }}> — {example}</span>}
          </div>
        )}
      </div>
    )
  }

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await axios.post(`${API}/api/competitors`, form)
      onAdded()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add competitor')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(10,15,26,0.85)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 520, background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 18, padding: '28px 32px 24px',
        animation: 'modalIn 0.25s ease both',
        boxShadow: `0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px ${C.border}`,
      }} onClick={e => e.stopPropagation()}>

        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: C.text }}>Add Competitor</span>
          <button onClick={onClose} style={btnReset({ color: C.textMuted, fontSize: 22, lineHeight: 1 })}>×</button>
        </div>

        {/* tab bar */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: `1px solid ${C.border}` }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'none', border: 'none', borderBottom: tab === t.id ? `2px solid ${C.accent}` : '2px solid transparent',
              color: tab === t.id ? C.accent : C.textMuted,
              fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              padding: '0 16px 10px', cursor: 'pointer',
              marginBottom: -1,
              fontFamily: "'Geist', sans-serif",
              transition: 'color 0.15s',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          {/* Basic Info */}
          {tab === 'basic' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                {field('name', 'Company Name', 'e.g. Notion')}
                {field('website', 'Website', 'https://notion.so')}
              </div>
              {field('linkedin_slug', 'LinkedIn Slug', 'e.g. notionhq')}
            </div>
          )}

          {/* Pages */}
          {tab === 'pages' && (
            <div>
              {field('pricing_url',   'Pricing URL',   'https://...',
                'The page showing plan tiers and prices. Usually /pricing',
                'e.g. notion.so/pricing, linear.app/pricing')}
              {field('changelog_url', 'Changelog URL', 'https://...',
                'Where the company announces new features and updates. Usually /changelog, /releases, or /whats-new',
                'e.g. notion.so/releases, figma.com/whats-new')}
              {field('careers_url',   'Careers URL',   'https://...',
                'The jobs/hiring page. We monitor this for hiring signals.',
                'e.g. notion.so/careers, linear.app/careers')}
            </div>
          )}

          {/* Social */}
          {tab === 'social' && (
            <div>
              {[
                { key: 'twitter_handle',   label: 'Twitter/X',   placeholder: 'notionhq',      hint: 'Just the handle without @', example: 'e.g. notionhq' },
                { key: 'linkedin_handle',  label: 'LinkedIn',    placeholder: 'company-name',  hint: null },
                { key: 'producthunt_slug', label: 'ProductHunt', placeholder: 'product-slug',  hint: null },
              ].map(({ key, label, placeholder, hint, example }) => (
                <div key={key} style={{ marginBottom: hint ? 20 : 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      width: 100, flexShrink: 0,
                      fontSize: 12, color: C.textMuted,
                      fontFamily: C.mono,
                    }}>
                      {label}
                    </span>
                    <input
                      value={form[key]}
                      onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={{
                        flex: 1, padding: '10px 14px',
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${C.border}`,
                        borderRadius: 9, color: C.text,
                        fontSize: 14, fontFamily: "'Geist', sans-serif",
                        outline: 'none', transition: 'border-color 0.15s',
                      }}
                      onFocus={e => e.target.style.borderColor = C.accent}
                      onBlur={e => e.target.style.borderColor = C.border}
                    />
                  </div>
                  {hint && (
                    <div style={{ marginTop: 5, marginLeft: 112, fontFamily: C.mono, fontSize: 10, color: 'rgba(255,255,255,0.22)', lineHeight: 1.5 }}>
                      {hint}{example && <span style={{ opacity: 0.7 }}> — {example}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Schedule */}
          {tab === 'schedule' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {[
                  {
                    key: 'schedule_frequency', label: 'Frequency',
                    options: ['Weekly', 'Daily', 'Bi-weekly'],
                  },
                  {
                    key: 'schedule_day', label: 'Day',
                    options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                  },
                  {
                    key: 'schedule_time', label: 'Time',
                    options: ['8:00 AM', '9:00 AM', '12:00 PM', '5:00 PM'],
                  },
                ].map(({ key, label, options }) => (
                  <div key={key}>
                    <label style={{
                      display: 'block', fontSize: 11, fontWeight: 500,
                      color: C.textMuted, textTransform: 'uppercase',
                      letterSpacing: '0.08em', marginBottom: 6,
                    }}>
                      {label}
                    </label>
                    <select
                      value={form[key]}
                      onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                      style={{
                        width: '100%', padding: '10px 12px',
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${C.border}`,
                        borderRadius: 9, color: C.text,
                        fontSize: 13, fontFamily: "'Geist', sans-serif",
                        outline: 'none', cursor: 'pointer',
                        appearance: 'none',
                      }}
                    >
                      {options.map(o => <option key={o} value={o} style={{ background: C.surface }}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* error */}
          {error && (
            <div style={{ color: C.red, fontSize: 12, margin: '14px 0 0', padding: '8px 12px', background: C.redDim, borderRadius: 7 }}>
              {error}
            </div>
          )}

          {/* footer buttons — always visible */}
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '10px 0',
              background: 'none',
              border: `1px solid ${C.border}`,
              borderRadius: 9, color: C.textDim,
              fontSize: 14, fontWeight: 500,
              cursor: 'pointer',
              fontFamily: "'Geist', sans-serif",
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
            >
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{
              flex: 2, padding: '10px 0',
              background: loading ? 'rgba(0,220,200,0.15)' : C.accent,
              border: 'none', borderRadius: 9,
              color: loading ? C.accent : '#0a0f1a',
              fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              fontFamily: "'Geist', sans-serif",
              boxShadow: loading ? 'none' : '0 0 14px rgba(0,220,200,0.3)',
            }}>
              {loading ? 'Adding…' : 'Save competitor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── CompetitorAvatar ───────────────────────────────────────────── */
function CompetitorAvatar({ comp }) {
  const [imgFailed, setImgFailed] = useState(false)
  const domain = extractDomain(comp.pricing_url)

  const containerStyle = {
    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
    background: 'rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  }

  if (domain && !imgFailed) {
    return (
      <div style={containerStyle}>
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt={comp.name}
          width={22}
          height={22}
          onError={() => setImgFailed(true)}
          style={{ width: 22, height: 22, objectFit: 'contain' }}
        />
      </div>
    )
  }

  return (
    <div style={{
      ...containerStyle,
      background: `linear-gradient(135deg, ${C.accentDim}, rgba(0,220,200,0.04))`,
      border: `1px solid ${C.border}`,
      fontSize: 13, fontWeight: 700, color: C.accent,
      fontFamily: C.mono,
    }}>
      {comp.name[0]}
    </div>
  )
}

/* ─── CompetitorCard ─────────────────────────────────────────────── */
function CompetitorCard({ comp, activity, onDelete }) {
  const [hov, setHov] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const events = activity.filter(a => a.competitor === comp.name)
  const lastEvent = events[0]

  // three-state status tag
  const statusTag = events.length >= 2
    ? { label: 'changes detected', bg: 'rgba(0,220,200,0.1)',  color: '#00dcc8',               border: 'rgba(0,220,200,0.2)' }
    : events.length === 1
    ? { label: 'monitoring',       bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)', border: 'rgba(255,255,255,0.08)' }
    : { label: 'no changes',       bg: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.2)', border: 'rgba(255,255,255,0.06)' }

  // derive which page types are being tracked
  const trackedPages = ['pricing_url', 'changelog_url', 'careers_url']
    .filter(k => comp[k])
    .map(k => k.replace('_url', ''))
  const pageLabel = trackedPages.length ? trackedPages.join(' · ') : null

  async function handleDelete() {
    if (!confirm(`Remove ${comp.name}?`)) return
    setDeleting(true)
    try { await axios.delete(`${API}/api/competitors/${comp.name}`); onDelete() }
    catch { setDeleting(false) }
  }

  async function handleBattleCard() {
    setGenerating(true)
    try {
      const resp = await axios.post(`${API}/api/battlecard/${comp.name}`, {}, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${comp.name}_battlecard.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* server errors are already logged */ }
    finally { setGenerating(false) }
  }

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'rgba(0,220,200,0.03)' : C.surface,
        border: `1px solid ${hov ? C.borderHov : C.border}`,
        borderLeft: `3px solid rgba(0,220,200,0.3)`,
        borderRadius: 14, padding: '14px 20px 14px 17px',
        display: 'flex', alignItems: 'center', gap: 14,
        transition: 'all 0.18s ease',
        animation: 'fadeIn 0.3s ease both',
        cursor: 'default',
      }}>

      <CompetitorAvatar comp={comp} />

      {/* info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>{comp.name}</span>
          <span style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
            padding: '2px 8px', borderRadius: 20,
            background: statusTag.bg,
            color: statusTag.color,
            border: `1px solid ${statusTag.border}`,
          }}>
            {statusTag.label}
          </span>
        </div>
        {pageLabel && (
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.25)',
            fontFamily: C.mono, marginBottom: 2,
          }}>
            {pageLabel}
          </div>
        )}
        {lastEvent && (
          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono }}>
            last seen {fmtRelative(lastEvent.scraped_at)}
          </div>
        )}
      </div>

      {/* sparkline */}
      <div style={{ flexShrink: 0 }}>
        <Sparkline activity={activity} name={comp.name} width={80} />
      </div>

      {/* actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        <a href={comp.pricing_url} target="_blank" rel="noreferrer"
          style={{ ...iconBtn, color: C.textMuted }} title="Pricing">
          <LinkIcon />
        </a>
        <button onClick={handleBattleCard} disabled={generating} title="Generate battle card"
          style={{
            ...iconBtn,
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 9px', borderRadius: 7,
            border: `1px solid ${generating ? C.border : 'rgba(0,220,200,0.3)'}`,
            color: generating ? C.textMuted : C.accent,
            fontSize: 11, fontWeight: 500,
            opacity: generating ? 0.6 : 1,
          }}>
          {generating ? <Spinner size={11} color={C.accent} /> : <CardIcon />}
          {generating ? 'Generating…' : 'Battle card'}
        </button>
        <button onClick={handleDelete} disabled={deleting}
          style={{ ...iconBtn, color: deleting ? C.textMuted : C.red, opacity: deleting ? 0.5 : 1 }}
          title="Remove">
          <TrashIcon />
        </button>
      </div>
    </div>
  )
}

/* ─── ActivityTimeline ───────────────────────────────────────────── */
function ActivityTimeline({ activity, loading }) {
  const colors = { pricing: C.accent, changelog: C.green, linkedin: C.yellow }

  if (loading) return (
    <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
      <Spinner />
    </div>
  )
  if (!activity.length) return (
    <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
      No activity yet. Run the scraper to collect data.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {activity.map((row, i) => {
        const dotColor = colors[row.page_type] || C.textMuted
        return (
          <div key={row.id} style={{
            display: 'flex', gap: 12, padding: '10px 0',
            borderBottom: i < activity.length - 1 ? `1px solid ${C.border}` : 'none',
            animation: 'fadeIn 0.3s ease both',
            animationDelay: `${i * 0.03}s`,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0, paddingTop: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: `0 0 6px ${dotColor}`, flexShrink: 0 }} />
              {i < activity.length - 1 && <div style={{ width: 1, flex: 1, background: C.border, marginTop: 4 }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{row.competitor}</span>
                <span style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, flexShrink: 0 }}>
                  {fmtRelative(row.scraped_at)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                <span style={{
                  display: 'inline-block', padding: '1px 6px', borderRadius: 4, marginRight: 6,
                  background: `${dotColor}22`, color: dotColor, fontSize: 10, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  {row.page_type}
                </span>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textMuted }}>
                  {row.content_hash?.slice(0, 8)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── TopNav ─────────────────────────────────────────────────────── */
function TopNav({ nav, setNav, clock, competitors, activity, running, runStatus, runScraper, setShowAdd }) {
  const navItems = [
    { id: 'dashboard',   label: 'Dashboard' },
    { id: 'competitors', label: 'Competitors' },
    { id: 'activity',    label: 'Activity' },
  ]

  return (
    <div style={{
      height: 58, flexShrink: 0,
      background: 'rgba(20,25,39,0.9)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(0,220,200,0.06)',
      display: 'flex', alignItems: 'center',
      padding: '0 28px', gap: 0,
    }}>

      {/* left: logo + brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 40, flexShrink: 0 }}>
        <svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="36" height="36" rx="9" fill="rgba(0,220,200,0.1)" stroke="rgba(0,220,200,0.2)" strokeWidth="1"/>
          <path d="M6 18 Q10 10 14 18 Q18 26 22 18 Q26 10 30 18"
            stroke="#00dcc8" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
          <circle cx="30" cy="18" r="2" fill="#00dcc8"/>
        </svg>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: '-0.02em', lineHeight: 1 }}>Watchr</div>
          <div style={{ fontSize: 9, color: C.textMuted, fontFamily: C.mono, letterSpacing: '0.1em', marginTop: 2 }}>COMPETITOR INTEL</div>
        </div>
      </div>

      {/* center: nav tabs */}
      <nav style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: 1, justifyContent: 'center', height: '100%' }}>
        {navItems.map(item => {
          const isActive = nav === item.id
          return (
            <button key={item.id} onClick={() => setNav(item.id)} style={{
              background: 'none', border: 'none',
              borderBottom: isActive ? `2px solid ${C.accent}` : '2px solid transparent',
              color: isActive ? C.accent : 'rgba(255,255,255,0.35)',
              fontSize: 13, fontWeight: isActive ? 600 : 400,
              padding: '0 20px',
              cursor: 'pointer',
              fontFamily: "'Geist', sans-serif",
              transition: 'color 0.15s, border-color 0.15s',
              letterSpacing: '-0.01em',
            }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
            >
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* right: clock + run status + buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 40 }}>
        {clock && (
          <span style={{ fontFamily: C.mono, fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.04em' }}>
            {clock}
          </span>
        )}
        {runStatus === 'ok' && (
          <span style={{ fontSize: 11, color: C.green, padding: '3px 9px', background: C.greenDim, borderRadius: 6 }}>
            Run complete
          </span>
        )}
        {runStatus === 'error' && (
          <span style={{ fontSize: 11, color: C.red, padding: '3px 9px', background: C.redDim, borderRadius: 6 }}>
            Run failed
          </span>
        )}
        <button onClick={() => setShowAdd(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 8,
          border: `1px solid ${C.border}`,
          background: 'transparent', color: C.text,
          fontSize: 13, fontWeight: 500,
          cursor: 'pointer', transition: 'border-color 0.15s',
          fontFamily: "'Geist', sans-serif",
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,220,200,0.3)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
        >
          <PlusIcon /> Add
        </button>
        <button onClick={runScraper} disabled={running} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '7px 15px', borderRadius: 8, border: 'none',
          background: running ? 'rgba(0,220,200,0.15)' : C.accent,
          color: running ? C.accent : '#0a0f1a',
          fontSize: 13, fontWeight: 600,
          cursor: running ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
          fontFamily: "'Geist', sans-serif",
          boxShadow: running ? 'none' : '0 0 14px rgba(0,220,200,0.3)',
        }}>
          {running ? <Spinner size={13} color={C.accent} /> : <PlayIcon />}
          {running ? 'Running…' : 'Run Now'}
        </button>
      </div>
    </div>
  )
}

/* ─── ActivityFeed (full-width, richer rows) ─────────────────────── */
function ActivityFeed({ activity, loading }) {
  const colors = { pricing: C.accent, changelog: C.green, linkedin: C.yellow }

  if (loading) return (
    <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  )
  if (!activity.length) return (
    <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '48px 0' }}>
      No activity yet. Run the scraper to collect data.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {activity.map((row, i) => {
        const dotColor = colors[row.page_type] || C.textMuted
        return (
          <div key={row.id} style={{
            display: 'flex', gap: 16, padding: '14px 0',
            borderBottom: i < activity.length - 1 ? `1px solid ${C.border}` : 'none',
            animation: 'fadeIn 0.3s ease both',
            animationDelay: `${i * 0.025}s`,
          }}>
            {/* dot + line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0, paddingTop: 5 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, boxShadow: `0 0 7px ${dotColor}`, flexShrink: 0 }} />
              {i < activity.length - 1 && <div style={{ width: 1, flex: 1, background: C.border, marginTop: 5 }} />}
            </div>
            {/* content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>{row.competitor}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
                    padding: '2px 8px', borderRadius: 20,
                    background: `${dotColor}22`, color: dotColor,
                    border: `1px solid ${dotColor}44`,
                  }}>
                    {row.page_type}
                  </span>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: C.textDim, fontFamily: C.mono }}>{fmtRelative(row.scraped_at)}</div>
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, marginTop: 2 }}>{fmtTime(row.scraped_at)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {row.content_hash && (
                  <span style={{ fontFamily: C.mono, fontSize: 11, color: C.textMuted }}>
                    hash <span style={{ color: C.textDim }}>{row.content_hash.slice(0, 12)}</span>
                  </span>
                )}
                {row.url && (
                  <a href={row.url} target="_blank" rel="noreferrer" style={{
                    fontFamily: C.mono, fontSize: 11, color: C.textMuted,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                    onMouseEnter={e => e.currentTarget.style.color = C.accent}
                    onMouseLeave={e => e.currentTarget.style.color = C.textMuted}
                  >
                    <LinkIcon />{row.url.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── CompetitorsTable ───────────────────────────────────────────── */
function CompetitorsTable({ competitors, activity, loading, onDelete, onAdd }) {
  if (loading) return (
    <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  )
  if (!competitors.length) return (
    <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '48px 0' }}>
      No competitors yet. <button onClick={onAdd} style={{ ...btnReset({ color: C.accent, fontSize: 13, textDecoration: 'underline' }) }}>Add one</button>
    </div>
  )

  const thStyle = {
    padding: '0 14px 12px', fontSize: 10, fontWeight: 600,
    color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em',
    textAlign: 'left', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border}`,
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, paddingLeft: 0, width: 28 }}></th>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Pricing</th>
            <th style={thStyle}>Changelog</th>
            <th style={thStyle}>Careers</th>
            <th style={thStyle}>Social</th>
            <th style={thStyle}>Last Event</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {competitors.map((comp, i) => {
            const events = activity.filter(a => a.competitor === comp.name)
            const lastEvent = events[0]
            return <CompetitorsTableRow key={comp.name} comp={comp} lastEvent={lastEvent} eventCount={events.length} onDelete={onDelete} isLast={i === competitors.length - 1} />
          })}
        </tbody>
      </table>
    </div>
  )
}

function CompetitorsTableRow({ comp, lastEvent, eventCount, onDelete, isLast }) {
  const [deleting, setDeleting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [hov, setHov] = useState(false)

  async function handleDelete() {
    if (!confirm(`Remove ${comp.name}?`)) return
    setDeleting(true)
    try { await axios.delete(`${API}/api/competitors/${comp.name}`); onDelete() }
    catch { setDeleting(false) }
  }

  async function handleBattleCard() {
    setGenerating(true)
    try {
      const resp = await axios.post(`${API}/api/battlecard/${comp.name}`, {}, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = `${comp.name}_battlecard.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch {}
    finally { setGenerating(false) }
  }

  const tdStyle = {
    padding: '12px 14px',
    borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
    fontSize: 12, color: C.textDim, verticalAlign: 'middle',
    background: hov ? C.surfaceHov : 'transparent',
    transition: 'background 0.15s',
  }

  function UrlCell({ url, label }) {
    if (!url) return <span style={{ color: C.border }}>—</span>
    const display = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{
        color: C.textDim, textDecoration: 'none', fontFamily: C.mono, fontSize: 11,
        display: 'flex', alignItems: 'center', gap: 4,
      }}
        onMouseEnter={e => e.currentTarget.style.color = C.accent}
        onMouseLeave={e => e.currentTarget.style.color = C.textDim}
      >
        <LinkIcon />{display.split('/').slice(1).join('/') || display.split('/')[0]}
      </a>
    )
  }

  return (
    <tr onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <td style={{ ...tdStyle, paddingLeft: 0, paddingRight: 8 }}>
        <CompetitorAvatar comp={comp} />
      </td>
      <td style={tdStyle}>
        <div style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{comp.name}</div>
        {eventCount > 0 && (
          <div style={{
            fontSize: 10, color: C.accent, marginTop: 2,
            fontFamily: C.mono,
          }}>{eventCount} events</div>
        )}
      </td>
      <td style={tdStyle}><UrlCell url={comp.pricing_url} /></td>
      <td style={tdStyle}><UrlCell url={comp.changelog_url} /></td>
      <td style={tdStyle}><UrlCell url={comp.careers_url} /></td>
      <td style={tdStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {comp.twitter_handle && (
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textMuted }}>𝕏 @{comp.twitter_handle}</span>
          )}
          {comp.linkedin_handle && (
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textMuted }}>in {comp.linkedin_handle}</span>
          )}
          {comp.producthunt_slug && (
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textMuted }}>PH {comp.producthunt_slug}</span>
          )}
          {!comp.twitter_handle && !comp.linkedin_handle && !comp.producthunt_slug && (
            <span style={{ color: C.border }}>—</span>
          )}
        </div>
      </td>
      <td style={tdStyle}>
        {lastEvent ? (
          <div>
            <div style={{ fontSize: 11, color: C.textDim }}>{fmtRelative(lastEvent.scraped_at)}</div>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: C.mono, marginTop: 2 }}>{lastEvent.page_type}</div>
          </div>
        ) : <span style={{ color: C.border }}>—</span>}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button onClick={handleBattleCard} disabled={generating} style={{
            ...iconBtn,
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 9px', borderRadius: 7,
            border: `1px solid ${generating ? C.border : 'rgba(0,220,200,0.3)'}`,
            color: generating ? C.textMuted : C.accent,
            fontSize: 11, fontWeight: 500,
            opacity: generating ? 0.6 : 1,
          }}>
            {generating ? <Spinner size={10} color={C.accent} /> : <CardIcon />}
            {generating ? 'Generating…' : 'Battle card'}
          </button>
          <button onClick={handleDelete} disabled={deleting}
            style={{ ...iconBtn, color: deleting ? C.textMuted : C.red, opacity: deleting ? 0.5 : 1 }}
            title="Remove">
            <TrashIcon />
          </button>
        </div>
      </td>
    </tr>
  )
}

/* ─── App ────────────────────────────────────────────────────────── */
export default function App() {
  const [nav, setNav] = useState('dashboard')
  const [competitors, setCompetitors] = useState([])
  const [activity, setActivity]       = useState([])
  const [loadingC, setLoadingC]       = useState(true)
  const [loadingA, setLoadingA]       = useState(true)
  const [showAdd, setShowAdd]         = useState(false)
  const [running, setRunning]         = useState(false)
  const [runStatus, setRunStatus]     = useState(null)
  const [clock, setClock]             = useState('')

  useEffect(() => {
    function tick() {
      const now = new Date()
      const day  = now.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()
      const date = now.getDate()
      const mon  = now.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()
      const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      setClock(`${day} ${date} ${mon} · ${time}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const fetchCompetitors = useCallback(async () => {
    setLoadingC(true)
    try { const r = await axios.get(`${API}/api/competitors`); setCompetitors(r.data) }
    catch {}
    finally { setLoadingC(false) }
  }, [])

  const fetchActivity = useCallback(async () => {
    setLoadingA(true)
    try { const r = await axios.get(`${API}/api/activity`); setActivity(r.data) }
    catch {}
    finally { setLoadingA(false) }
  }, [])

  useEffect(() => { fetchCompetitors(); fetchActivity() }, [])

  async function runScraper() {
    setRunning(true); setRunStatus(null)
    try {
      await axios.post(`${API}/api/run`)
      setRunStatus('ok')
      await fetchActivity()
    } catch { setRunStatus('error') }
    finally { setRunning(false) }
    setTimeout(() => setRunStatus(null), 4000)
  }

  const lastScrape = activity[0]?.scraped_at

  // count competitors that have any activity (= changes detected)
  const changesCount = competitors.filter(c =>
    activity.some(a => a.competitor === c.name)
  ).length

  const stats = [
    { label: 'Competitors Tracked', value: competitors.length, sub: 'actively monitored', accentTop: true },
    { label: 'Changes Detected',    value: changesCount, sub: 'competitors with activity', dimValue: true },
    { label: 'Last Run',            value: lastScrape ? fmtRelative(lastScrape) : '—', sub: lastScrape ? fmtTime(lastScrape) : 'never run' },
    { label: 'Agent Status',        value: 'Live', sub: 'scraping on demand', pulse: true },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: C.bg }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring {
          0%   { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      <TopNav
        nav={nav} setNav={setNav}
        clock={clock}
        competitors={competitors}
        activity={activity}
        running={running}
        runStatus={runStatus}
        runScraper={runScraper}
        setShowAdd={setShowAdd}
      />

      {/* ticker strip */}
      {(() => {
        const sep = '      |      '
        const actItems = activity.slice(0, 8).map(r =>
          `● ${r.competitor} · ${r.page_type} updated ${fmtRelative(r.scraped_at)}`
        )
        const staticItems = ['● Agent status: live', '● Next run: Monday 8:00 AM']
        const all = [...actItems, ...staticItems].join(sep)
        const content = all + sep
        return (
          <div style={{
            height: 28, background: '#0d1117',
            borderBottom: '1px solid rgba(0,220,200,0.08)',
            overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center',
          }}>
            <div style={{
              display: 'inline-flex', whiteSpace: 'nowrap',
              animation: 'ticker 30s linear infinite',
              fontFamily: C.mono, fontSize: 10,
              color: 'rgba(0,220,200,0.5)',
              letterSpacing: '0.03em',
            }}>
              <span>{content}</span>
              <span>{content}</span>
            </div>
          </div>
        )
      })()}

      {/* scroll area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 28, background: C.bg }}>

        {/* ── Dashboard: stat cards + two-column layout ── */}
        {nav === 'dashboard' && (
          <>
            <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
              {stats.map(s => <StatCard key={s.label} {...s} />)}
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px' }}>
                  <SectionHeader
                    title="Competitors"
                    sub={`${competitors.length} tracked`}
                    action={<button onClick={() => setShowAdd(true)} style={ghostBtn}>+ Add</button>}
                  />
                  {loadingC ? (
                    <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
                  ) : competitors.length === 0 ? (
                    <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: '32px 0' }}>No competitors yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {competitors.map(c => (
                        <CompetitorCard key={c.name} comp={c} activity={activity} onDelete={fetchCompetitors} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ width: 300, flexShrink: 0 }}>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px' }}>
                  <SectionHeader title="Activity" sub="Recent events" />
                  <ActivityTimeline activity={activity} loading={loadingA} />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Competitors: full-width detail table ── */}
        {nav === 'competitors' && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px' }}>
            <SectionHeader
              title="All Competitors"
              sub={`${competitors.length} tracked`}
              action={<button onClick={() => setShowAdd(true)} style={ghostBtn}>+ Add</button>}
            />
            <CompetitorsTable
              competitors={competitors}
              activity={activity}
              loading={loadingC}
              onDelete={fetchCompetitors}
              onAdd={() => setShowAdd(true)}
            />
          </div>
        )}

        {/* ── Activity: full-width feed ── */}
        {nav === 'activity' && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px' }}>
            <SectionHeader title="Activity Log" sub="Last 20 scrape events" />
            <ActivityFeed activity={activity} loading={loadingA} />
          </div>
        )}
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdded={fetchCompetitors} />}
    </div>
  )
}

/* ─── small shared components ────────────────────────────────────── */
function SectionHeader({ title, sub, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: '-0.02em' }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

function Spinner({ size = 16, color = C.accent }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `2px solid ${color}30`,
      borderTopColor: color,
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

/* ─── style helpers ──────────────────────────────────────────────── */
const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '5px', borderRadius: 6, display: 'flex', alignItems: 'center',
  transition: 'color 0.15s, background 0.15s',
  fontFamily: "'Geist', sans-serif",
}
const ghostBtn = {
  background: 'none', border: `1px solid ${C.border}`,
  borderRadius: 7, color: C.textDim, fontSize: 11,
  padding: '4px 10px', cursor: 'pointer',
  fontFamily: "'Geist', sans-serif",
}
function btnReset(extra) {
  return { background: 'none', border: 'none', cursor: 'pointer', ...extra }
}

/* ─── SVG icons ──────────────────────────────────────────────────── */
function GridIcon() {
  return <svg width="14" height="14" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
}
function RadarIcon({ size = 14, color = 'currentColor' }) {
  return <svg width={size} height={size} fill="none" viewBox="0 0 16 16" stroke={color} strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="1" fill={color} stroke="none"/><line x1="8" y1="8" x2="13" y2="3" strokeDasharray="2 1.5"/></svg>
}
function ActivityIcon() {
  return <svg width="14" height="14" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"><polyline points="1,8 4,4 7,10 10,6 13,8 15,7"/></svg>
}
function PlayIcon() {
  return <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M3 2.5l10 5.5-10 5.5V2.5z"/></svg>
}
function PlusIcon() {
  return <svg width="12" height="12" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
}
function LinkIcon() {
  return <svg width="13" height="13" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"><path d="M6 10l4-4M9 5h3v3"/><path d="M7 4H4a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V9"/></svg>
}
function TrashIcon() {
  return <svg width="13" height="13" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/></svg>
}
function CardIcon() {
  return <svg width="12" height="12" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="10" rx="2"/><line x1="1" y1="7" x2="15" y2="7"/><line x1="4" y1="11" x2="7" y2="11"/></svg>
}
