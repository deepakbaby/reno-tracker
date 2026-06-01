import { useEffect, useState, useCallback } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { api } from './api'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Expenses from './pages/Expenses'
import Tasks from './pages/Tasks'
import Categories from './pages/Categories'

export default function App() {
  const [auth, setAuth] = useState('loading') // 'loading' | 'in' | 'out'

  const refresh = useCallback(async () => {
    try {
      const { authenticated } = await api.me()
      setAuth(authenticated ? 'in' : 'out')
    } catch {
      setAuth('out')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  if (auth === 'loading') {
    return <div className="min-h-screen grid place-items-center"><Spinner /></div>
  }
  if (auth === 'out') {
    return <Login onSuccess={() => setAuth('in')} />
  }
  return <Shell onLogout={() => setAuth('out')} />
}

function Shell({ onLogout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [drive, setDrive] = useState(null)

  useEffect(() => {
    api.driveStatus().then(setDrive).catch(() => {})
  }, [])

  const logout = async () => {
    try { await api.logout() } catch { /* ignore */ }
    onLogout()
  }

  return (
    <div className="flex flex-col min-h-screen max-w-lg mx-auto relative">
      <main className="flex-1 overflow-y-auto px-5 pt-safe pb-28">
        {drive?.needs_reauth && (
          <div className="mb-4 text-xs rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/40 text-amber-300">
            ⚠️ Google Drive needs re-authorization — new invoices can’t be saved until you re-run
            the one-time <code className="font-mono">authorize_drive.py</code> step.
          </div>
        )}
        <Routes>
          <Route path="/" element={<Expenses />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/categories" element={<Categories onLogout={logout} />} />
          <Route path="*" element={<Expenses />} />
        </Routes>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bottom-nav
                      bg-ink-900/90 backdrop-blur-xl border-t border-line">
        <div className="flex items-center justify-around px-4 pt-2.5">
          <NavBtn label="Expenses" active={location.pathname === '/'} onClick={() => navigate('/')} icon={<ReceiptIcon />} />
          <NavBtn label="Tasks" active={location.pathname === '/tasks'} onClick={() => navigate('/tasks')} icon={<TaskIcon />} />
          <NavBtn label="Categories" active={location.pathname === '/categories'} onClick={() => navigate('/categories')} icon={<TagIcon />} />
        </div>
      </nav>
    </div>
  )
}

function NavBtn({ label, active, onClick, icon }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-colors
        ${active ? 'text-brand-400' : 'text-neutral-500 hover:text-neutral-300'}`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}

function ReceiptIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  )
}

function TaskIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="6" height="6" rx="1.5" />
      <path d="M5.5 7l1 1 1.5-2" />
      <path d="M12 6h9M12 12h9M12 18h9" />
      <path d="M3.5 14.5 5 16l2-2.5" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z" />
      <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" />
    </svg>
  )
}
