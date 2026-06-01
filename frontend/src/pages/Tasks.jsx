import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import { Spinner, Empty, Toast, PageHeader, Modal, fmtDate, todayISO } from '../components/ui'

const FILTERS = [
  { key: null, label: 'All' },
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
]

// Tap the circle to cycle through states.
const NEXT_STATUS = { todo: 'in_progress', in_progress: 'done', done: 'todo' }

export default function Tasks() {
  const [filter, setFilter] = useState(null)
  const [todos, setTodos] = useState(null)
  const [counts, setCounts] = useState({ remaining: 0, all: 0, todo: 0, in_progress: 0, done: 0 })
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    try {
      const { todos, counts } = await api.listTodos(filter)
      setTodos(todos); setCounts(counts)
    } catch {
      setError('Could not load tasks.'); setTodos([])
    }
  }, [filter])

  useEffect(() => { setTodos(null); load() }, [load])

  const cycle = async (todo) => {
    try {
      await api.updateTodo(todo.id, { status: NEXT_STATUS[todo.status] })
      await load()
    } catch { setError('Could not update task.') }
  }

  const remove = async (todo) => {
    if (!confirm(`Delete "${todo.title}"?`)) return
    try { await api.deleteTodo(todo.id); await load() }
    catch { setError('Could not delete task.') }
  }

  const onSaved = async () => { setFormOpen(false); setEditing(null); await load() }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Tasks"
        subtitle={`${counts.remaining} remaining`}
        onAdd={() => { setEditing(null); setFormOpen(true) }}
      />

      <Toast message={error} tone="error" onDismiss={() => setError('')} />

      <p className="label mb-3">Tasks</p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            className={`chip ${filter === f.key ? 'chip-active' : 'chip-inactive'}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {todos === null ? (
        <Spinner />
      ) : todos.length === 0 ? (
        <Empty
          icon={<CheckIcon />}
          title="No tasks yet"
          sub="Add tasks to keep track of what needs to be done."
        />
      ) : (
        <div className="space-y-2">
          {todos.map((t) => (
            <TodoRow key={t.id} todo={t}
                     onCycle={() => cycle(t)}
                     onEdit={() => { setEditing(t); setFormOpen(true) }}
                     onDelete={() => remove(t)} />
          ))}
        </div>
      )}

      {formOpen && (
        <TodoForm
          open
          onClose={() => { setFormOpen(false); setEditing(null) }}
          onSaved={onSaved}
          todo={editing}
        />
      )}
    </div>
  )
}

function TodoRow({ todo, onCycle, onEdit, onDelete }) {
  const done = todo.status === 'done'
  return (
    <div className="card-sm flex items-center gap-3">
      <StatusCircle status={todo.status} onClick={onCycle} />
      <div className="flex-1 min-w-0" onClick={onEdit} role="button">
        <p className={`font-medium truncate ${done ? 'line-through text-neutral-500' : ''}`}>
          {todo.title}
        </p>
        <p className="text-xs mt-1 flex items-center gap-2 flex-wrap">
          <PriorityTag priority={todo.priority} />
          <StatusBadge status={todo.status} />
          {todo.due_date && <span className="text-neutral-500">· Due {fmtDate(todo.due_date)}</span>}
        </p>
        {todo.note && <p className="text-xs text-neutral-500 mt-1 truncate">{todo.note}</p>}
      </div>
      <button onClick={onDelete} className="text-neutral-600 hover:text-danger shrink-0" aria-label="Delete">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
      </button>
    </div>
  )
}

function StatusCircle({ status, onClick }) {
  const base = 'w-6 h-6 rounded-full shrink-0 grid place-items-center transition-colors'
  if (status === 'done') {
    return (
      <button onClick={onClick} className={`${base} bg-brand-500 text-ink-900`} aria-label="Mark not done">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </button>
    )
  }
  if (status === 'in_progress') {
    return (
      <button onClick={onClick} className={`${base} border-2 border-amber-400`} aria-label="Mark done">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
      </button>
    )
  }
  return (
    <button onClick={onClick} className={`${base} border-2 border-neutral-600`} aria-label="Start task" />
  )
}

function PriorityTag({ priority = 'medium' }) {
  const map = {
    high: ['High', 'bg-red-500/15 text-red-400'],
    medium: ['Medium', 'bg-ink-700 text-neutral-400'],
    low: ['Low', 'bg-ink-700 text-neutral-500'],
  }
  const [label, cls] = map[priority] || map.medium
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{label}</span>
}

function StatusBadge({ status }) {
  const map = {
    todo: ['To do', 'text-neutral-400'],
    in_progress: ['In progress', 'text-amber-400'],
    done: ['Done', 'text-brand-400'],
  }
  const [label, cls] = map[status]
  return <span className={`font-medium ${cls}`}>{label}</span>
}

function CheckIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="7" height="7" rx="1.5" /><path d="M5 7.5 6.3 9 8.5 6" />
      <path d="M13 6h8M13 12h8M13 18h8" />
    </svg>
  )
}

// ─── Add / edit form ──────────────────────────────────────────────────────────

function TodoForm({ open, onClose, onSaved, todo }) {
  const editing = !!todo
  const [title, setTitle] = useState(todo?.title || '')
  const [due, setDue] = useState(todo?.due_date || '')
  const [note, setNote] = useState(todo?.note || '')
  const [status, setStatus] = useState(todo?.status || 'todo')
  const [priority, setPriority] = useState(todo?.priority || 'medium')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (!title.trim()) { setError('Enter a task.'); return }
    setBusy(true); setError('')
    try {
      const body = { title: title.trim(), due_date: due || null, note: note.trim() || null, status, priority }
      if (editing) await api.updateTodo(todo.id, body)
      else await api.createTodo(body)
      onSaved()
    } catch {
      setError('Could not save task.'); setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit task' : 'New task'}>
      <form onSubmit={submit} className="space-y-4">
        <Toast message={error} tone="error" onDismiss={() => setError('')} />

        <div>
          <label className="label">Task</label>
          <input className="input mt-1" placeholder="e.g. Call the plumber"
                 value={title} autoFocus={!editing} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Priority</label>
            <select className="input mt-1" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Due date</label>
          <input type="date" className="input mt-1" value={due || ''} onChange={(e) => setDue(e.target.value)} />
        </div>

        <div>
          <label className="label">Note (optional)</label>
          <input className="input mt-1" placeholder="Details" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {due && (
          <button type="button" onClick={() => setDue('')} className="text-xs text-neutral-500 hover:text-neutral-300">
            Clear due date
          </button>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add task'}
        </button>
      </form>
    </Modal>
  )
}
