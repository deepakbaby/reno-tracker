import { createPortal } from 'react-dom'

// ─── Formatters ───────────────────────────────────────────────────────────────

export function fmtCents(cents, opts = {}) {
  if (cents == null) return '—'
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency', currency: 'EUR',
    ...opts,
  }).format(cents / 100)
}

export function fmtCentsShort(cents) {
  return fmtCents(cents, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (isNaN(d)) return iso
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

export function todayISO() {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

// ─── Page header (big serif title + subtitle + round add button) ───────────────

export function PageHeader({ title, subtitle, onAdd }) {
  return (
    <div className="flex items-start justify-between pt-2 pb-5">
      <div>
        <h1 className="title text-[2rem] leading-none">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-500 mt-2">{subtitle}</p>}
      </div>
      {onAdd && (
        <button className="btn-add" onClick={onAdd} aria-label="Add">+</button>
      )}
    </div>
  )
}

// ─── Progress / count ring ─────────────────────────────────────────────────────

export function Ring({ value, sub, pct = 100, size = 76 }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const dash = c * Math.min(1, Math.max(0, pct / 100))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.75)"
          strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-lg font-semibold text-white leading-none">{value}</span>
        {sub && <span className="text-[9px] text-white/70 mt-0.5 uppercase tracking-wide">{sub}</span>}
      </div>
    </div>
  )
}

// ─── Misc ──────────────────────────────────────────────────────────────────────

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function Empty({ icon, title = 'Nothing here yet', sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-ink-700 grid place-items-center text-neutral-500 mb-5">
        {icon || <DefaultEmptyIcon />}
      </div>
      <p className="title text-2xl text-neutral-100">{title}</p>
      {sub && <p className="text-sm mt-2 text-neutral-500 max-w-xs">{sub}</p>}
    </div>
  )
}

function DefaultEmptyIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  )
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null
  // Portal to <body> so the modal is anchored to the viewport, not to any
  // transformed ancestor (e.g. a page's fade-up animation).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-ink-850 border border-line rounded-3xl
                      p-5 pb-6 max-h-[88vh] overflow-y-auto shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between mb-5 sticky -top-5 -mt-5 pt-5 -mx-5 px-5
                        bg-ink-850/95 backdrop-blur z-10">
          <h3 className="title text-2xl">{title}</h3>
          <button onClick={onClose} className="btn-ghost text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Toast({ message, tone = 'error', onDismiss }) {
  if (!message) return null
  const tones = {
    error: 'bg-danger/10 border-danger/40 text-red-300',
    success: 'bg-brand-500/10 border-brand-500/40 text-brand-300',
    warn: 'bg-amber-500/10 border-amber-500/40 text-amber-300',
  }
  return (
    <div onClick={onDismiss} className={`text-sm rounded-xl px-4 py-3 border ${tones[tone]} mb-3 cursor-pointer`}>
      {message}
    </div>
  )
}
