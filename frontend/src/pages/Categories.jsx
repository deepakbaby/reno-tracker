import { useEffect, useState, useRef } from 'react'
import { api } from '../api'
import { Spinner, Empty, Toast, PageHeader } from '../components/ui'

export default function Categories({ onLogout }) {
  const [cats, setCats] = useState(null)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(null) // {id, name}
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const addRef = useRef(null)

  const load = async () => {
    try { setCats(await api.listCategories()) }
    catch { setError('Could not load categories.') }
  }
  useEffect(() => { load() }, [])

  const add = async (e) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true); setError('')
    try {
      await api.createCategory(name)
      setNewName('')
      await load()
    } catch (err) {
      setError(err.code === 'A category with that name already exists'
        ? 'That category already exists.' : 'Could not add category.')
    } finally { setBusy(false) }
  }

  const saveEdit = async () => {
    const name = editing.name.trim()
    if (!name) return
    setBusy(true); setError('')
    try {
      await api.renameCategory(editing.id, name)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err.code === 'A category with that name already exists'
        ? 'That name is already taken.' : 'Could not rename category.')
    } finally { setBusy(false) }
  }

  const remove = async (cat) => {
    const msg = cat.expense_count > 0
      ? `Delete "${cat.name}"? Its ${cat.expense_count} expense${cat.expense_count > 1 ? 's' : ''} will be kept but marked Uncategorized.`
      : `Delete "${cat.name}"?`
    if (!confirm(msg)) return
    setBusy(true); setError('')
    try { await api.deleteCategory(cat.id); await load() }
    catch { setError('Could not delete category.') }
    finally { setBusy(false) }
  }

  if (cats === null) return <Spinner />

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Categories"
        subtitle={`${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}`}
        onAdd={() => addRef.current?.focus()}
      />

      <Toast message={error} tone="error" onDismiss={() => setError('')} />

      <form onSubmit={add} className="flex gap-2 mb-5">
        <input
          ref={addRef}
          className="input"
          placeholder="New category name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn-primary px-5" disabled={busy || !newName.trim()}>Add</button>
      </form>

      {cats.length === 0 ? (
        <Empty title="No categories yet" sub="Add your first category above." />
      ) : (
        <div className="card-sm p-0 overflow-hidden">
          {cats.map((cat, i) => (
            <div key={cat.id} className={`flex items-center gap-3 px-4 py-3.5 ${i === 0 ? '' : 'border-t border-line'}`}>
              {editing?.id === cat.id ? (
                <>
                  <input
                    className="input flex-1 py-2"
                    value={editing.name}
                    autoFocus
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                  />
                  <button onClick={saveEdit} className="btn-ghost text-brand-400" disabled={busy}>Save</button>
                  <button onClick={() => setEditing(null)} className="btn-ghost">Cancel</button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{cat.name}</p>
                    <p className="text-xs text-neutral-500">
                      {cat.expense_count} expense{cat.expense_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button onClick={() => setEditing({ id: cat.id, name: cat.name })}
                          className="text-neutral-500 hover:text-neutral-200" aria-label="Rename">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                  <button onClick={() => remove(cat)} className="text-neutral-500 hover:text-danger" aria-label="Delete" disabled={busy}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {onLogout && (
        <button onClick={onLogout} className="btn-secondary w-full mt-8 text-danger">
          Sign out
        </button>
      )}
    </div>
  )
}
