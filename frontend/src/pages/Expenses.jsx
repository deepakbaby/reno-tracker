import { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '../api'
import {
  Spinner, Empty, Toast, PageHeader, Ring,
  fmtCents, fmtCentsShort, fmtDate,
} from '../components/ui'
import ExpenseForm from '../components/ExpenseForm'

export default function Expenses() {
  const [categories, setCategories] = useState([])
  const [filter, setFilter] = useState(null) // category_id or null for all
  const [expenses, setExpenses] = useState(null)
  const [totals, setTotals] = useState(null)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const loadCategories = useCallback(async () => {
    try { setCategories(await api.listCategories()) } catch { /* non-fatal */ }
  }, [])

  const load = useCallback(async () => {
    try {
      const [exp, tot] = await Promise.all([
        api.listExpenses(filter),
        api.getTotals(filter),
      ])
      setExpenses(exp)
      setTotals(tot)
    } catch {
      setError('Could not load expenses.')
      setExpenses([])
    }
  }, [filter])

  useEffect(() => { loadCategories() }, [loadCategories])
  useEffect(() => { setExpenses(null); load() }, [load])

  const openAdd = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (exp) => { setEditing(exp); setFormOpen(true) }

  const onSaved = async () => {
    setFormOpen(false); setEditing(null)
    await Promise.all([load(), loadCategories()])
  }

  const remove = async (exp) => {
    if (!confirm(`Delete the ${fmtCents(exp.amount_cents)} expense from ${exp.vendor}?`)) return
    try {
      await api.deleteExpense(exp.id)
      await Promise.all([load(), loadCategories()])
    } catch { setError('Could not delete expense.') }
  }

  // Derived stats for the 3-column row (from the currently shown list).
  const stats = useMemo(() => {
    if (!expenses) return null
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    let month = 0, week = 0
    for (const e of expenses) {
      const d = new Date(`${e.date}T00:00:00`)
      if (d >= monthStart) month += e.amount_cents
      if (d >= weekAgo) week += e.amount_cents
    }
    const count = expenses.length
    const avg = count ? Math.round((totals?.total_cents || 0) / count) : 0
    return { month, week, avg }
  }, [expenses, totals])

  const filterName = filter
    ? categories.find((c) => c.id === filter)?.name || 'Category'
    : null

  const breakdown = (totals?.by_category || []).filter((b) => b.count > 0)

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Expenses"
        subtitle={totals ? `${fmtCents(totals.total_cents)} · ${totals.count} logged` : ' '}
        onAdd={openAdd}
      />

      <Toast message={error} tone="error" onDismiss={() => setError('')} />

      {/* Hero */}
      <div className="hero flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-white/70">
            {filterName ? `${filterName} total` : 'Total spent'}
          </p>
          <p className="num text-4xl font-semibold text-white mt-1.5">
            {totals ? fmtCents(totals.total_cents) : '—'}
          </p>
          <p className="text-sm text-white/70 mt-1.5">
            {totals ? `${totals.count} expense${totals.count === 1 ? '' : 's'}` : ' '}
          </p>
        </div>
        <Ring value={totals?.count ?? 0} sub="items" />
      </div>

      {/* 3-stat row */}
      <div className="card-sm flex divide-x divide-line mb-5 p-0">
        <Stat label="This month" value={stats ? fmtCentsShort(stats.month) : '—'} />
        <Stat label="This week" value={stats ? fmtCentsShort(stats.week) : '—'} />
        <Stat label="Avg" value={stats ? fmtCentsShort(stats.avg) : '—'} />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 mb-4">
        <button className={`chip ${filter === null ? 'chip-active' : 'chip-inactive'}`} onClick={() => setFilter(null)}>
          All
        </button>
        {categories.map((c) => (
          <button key={c.id} className={`chip ${filter === c.id ? 'chip-active' : 'chip-inactive'}`} onClick={() => setFilter(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      {/* Per-category breakdown (All view only) */}
      {filter === null && breakdown.length > 0 && (
        <div className="card-sm mb-5 p-0 overflow-hidden">
          <p className="label px-4 pt-4 pb-2">By category</p>
          <ul>
            {breakdown.map((b) => (
              <li key={b.category_id ?? 'uncat'}>
                <button
                  className="w-full flex items-center justify-between px-4 py-3 border-t border-line text-left disabled:opacity-100"
                  onClick={() => b.category_id && setFilter(b.category_id)}
                  disabled={!b.category_id}
                >
                  <span className="text-sm text-neutral-300">
                    {b.category_name}<span className="text-neutral-600"> · {b.count}</span>
                  </span>
                  <span className="num text-sm font-medium">{fmtCentsShort(b.total_cents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* List */}
      <p className="label mb-3">{filterName || 'All expenses'}</p>
      {expenses === null ? (
        <Spinner />
      ) : expenses.length === 0 ? (
        <Empty title="No expenses yet" sub="Tap the + button to log your first one." />
      ) : (
        <div className="card-sm p-0 overflow-hidden">
          {expenses.map((exp, i) => (
            <ExpenseRow
              key={exp.id} exp={exp} first={i === 0}
              onEdit={() => openEdit(exp)} onDelete={() => remove(exp)}
            />
          ))}
        </div>
      )}

      <ExpenseForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        onSaved={onSaved}
        categories={categories}
        expense={editing}
      />
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="flex-1 px-3 py-4 text-center">
      <p className="num text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-neutral-500 mt-1">{label}</p>
    </div>
  )
}

function ExpenseRow({ exp, first, onEdit, onDelete }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 ${first ? '' : 'border-t border-line'}`}>
      <div className="flex-1 min-w-0" onClick={onEdit} role="button">
        <p className="font-medium truncate">{exp.vendor}</p>
        <p className="text-xs text-neutral-500 mt-0.5">
          {fmtDate(exp.date)}
          {' · '}
          <span className={exp.category_name ? '' : 'italic text-neutral-600'}>
            {exp.category_name || 'Uncategorized'}
          </span>
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="num font-semibold">{fmtCents(exp.amount_cents)}</p>
        {exp.drive_link ? (
          <a href={exp.drive_link} target="_blank" rel="noreferrer"
             className="text-xs text-brand-400 hover:text-brand-300">📎 Invoice</a>
        ) : (
          <span className="text-xs text-neutral-600">No invoice</span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 pl-1 text-neutral-500">
        <button onClick={onEdit} className="hover:text-neutral-200" aria-label="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        </button>
        <button onClick={onDelete} className="hover:text-danger" aria-label="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
        </button>
      </div>
    </div>
  )
}
