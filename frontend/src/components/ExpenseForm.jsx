import { useState } from 'react'
import { api } from '../api'
import { Modal, Toast, todayISO } from './ui'
import { maybeResizeImage } from '../lib/image'

export default function ExpenseForm({ open, onClose, onSaved, categories, expense }) {
  const editing = !!expense
  const [amount, setAmount] = useState(
    expense ? (expense.amount_cents / 100).toFixed(2) : ''
  )
  const [date, setDate] = useState(expense?.date || todayISO())
  const [name, setName] = useState(expense?.name || '')
  const [vendor, setVendor] = useState(expense?.vendor || '')
  const [categoryId, setCategoryId] = useState(
    expense?.category_id != null ? String(expense.category_id) : ''
  )
  const [note, setNote] = useState(expense?.note || '')
  const [file, setFile] = useState(null)
  const [removeInvoice, setRemoveInvoice] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const hadInvoice = !!expense?.drive_link

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt < 0) { setError('Enter a valid amount.'); return }
    if (!date) { setError('Pick a date.'); return }
    if (!name.trim()) { setError('Enter a name.'); return }

    setBusy(true); setError('')
    try {
      const form = new FormData()
      form.append('amount', amount)
      form.append('date', date)
      form.append('name', name.trim())
      form.append('vendor', vendor.trim())
      form.append('category_id', categoryId || 'null')
      form.append('note', note.trim())
      if (file) {
        const prepared = await maybeResizeImage(file)
        form.append('invoice', prepared, prepared.name)
      } else if (editing && removeInvoice) {
        form.append('remove_invoice', 'true')
      }

      if (editing) {
        await api.updateExpense(expense.id, form)
      } else {
        await api.createExpense(form)
      }
      onSaved()
    } catch (err) {
      if (err.code === 'drive_reauth_required') {
        setError('Google Drive needs re-authorization — the expense was not saved. Re-run authorize_drive.py.')
      } else {
        setError('Could not save. Please try again.')
      }
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit expense' : 'Add expense'}>
      <form onSubmit={submit} className="space-y-4">
        <Toast message={error} tone="error" onDismiss={() => setError('')} />

        <div>
          <label className="label">Amount (EUR)</label>
          <input
            className="input mt-1" inputMode="decimal" placeholder="0.00"
            value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={!editing}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input mt-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Name</label>
          <input
            className="input mt-1" placeholder="e.g. Living room sofa"
            value={name} onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Vendor (optional)</label>
          <input
            className="input mt-1" placeholder="e.g. IKEA"
            value={vendor} onChange={(e) => setVendor(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Note (optional)</label>
          <input
            className="input mt-1" placeholder="e.g. Living room sofa"
            value={note} onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Invoice (photo or PDF)</label>
          {editing && hadInvoice && !file && !removeInvoice && (
            <div className="flex items-center justify-between mt-1 text-sm bg-ink-800 border border-line rounded-xl px-4 py-3">
              <a href={expense.drive_link} target="_blank" rel="noreferrer" className="text-brand-400 underline">
                Current invoice
              </a>
              <button type="button" onClick={() => setRemoveInvoice(true)} className="text-red-400">Remove</button>
            </div>
          )}
          {editing && removeInvoice && (
            <div className="flex items-center justify-between mt-1 text-sm text-slate-400">
              <span>Invoice will be removed.</span>
              <button type="button" onClick={() => setRemoveInvoice(false)} className="text-brand-400">Undo</button>
            </div>
          )}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="input mt-1 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-ink-700 file:text-neutral-200"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setRemoveInvoice(false) }}
          />
          {file && <p className="text-xs text-slate-500 mt-1">{file.name}</p>}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
        </button>
      </form>
    </Modal>
  )
}
