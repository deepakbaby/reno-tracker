import { useState } from 'react'
import { api } from '../api'
import { Toast } from '../components/ui'

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true); setError('')
    try {
      await api.login(password)
      onSuccess()
    } catch (err) {
      setError(err.status === 429
        ? 'Too many attempts. Wait a moment and try again.'
        : 'Incorrect password.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-7 max-w-sm mx-auto">
      <div className="mb-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-forest-600 to-forest-700 grid place-items-center mx-auto mb-6">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" />
          </svg>
        </div>
        <h1 className="title text-4xl">House Expenses</h1>
        <p className="text-sm text-neutral-500 mt-3">Private — enter the password to continue.</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <Toast message={error} tone="error" onDismiss={() => setError('')} />
        <input
          type="password"
          className="input text-center"
          placeholder="Password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn-primary w-full" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
