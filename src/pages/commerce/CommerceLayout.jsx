import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase, formatCurrency } from '../../lib/supabase'

function NavItem({ to, icon, label }) {
  return (
    <NavLink to={to} end={to.split('/').length <= 2} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
    </NavLink>
  )
}

export default function CommerceLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [balance, setBalance] = useState(profile?.commerces?.balance || 0)
  const [walletCount, setWalletCount] = useState(0)

  const commerce = profile?.commerces
  const commerceId = commerce?.id

  useEffect(() => {
    if (!commerceId) return
    fetchBalance()
    fetchWalletCount()

    const channel = supabase
      .channel(`layout_${commerceId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commerces', filter: `id=eq.${commerceId}` },
        (payload) => setBalance(payload.new.balance))
      .subscribe()

    return () => channel.unsubscribe()
  }, [commerceId])

  const fetchBalance = async () => {
    const { data } = await supabase.from('commerces').select('balance').eq('id', commerceId).single()
    if (data) setBalance(data.balance)
  }

  const fetchWalletCount = async () => {
    const { count } = await supabase.from('commerce_wallets').select('*', { count: 'exact', head: true }).eq('commerce_id', commerceId).eq('is_active', true)
    setWalletCount(count || 0)
  }

  const handleSignOut = async () => { await signOut(); navigate('/login') }
  const initials = commerce?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'CO'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">💳</div>
          <div>
            <div className="logo-text">Fin<span>Pay</span></div>
            <div className="logo-sub" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {commerce?.name || 'Comercio'}
            </div>
          </div>
        </div>

        {/* Balance principal */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Saldo Principal</div>
          <div style={{
            fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', letterSpacing: -1,
            color: Number(balance) > 200000 ? 'var(--green)' : Number(balance) > 0 ? 'var(--yellow)' : 'var(--red)'
          }}>
            {formatCurrency(balance)}
          </div>
          {walletCount > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              + {walletCount} tipo{walletCount !== 1 ? 's' : ''} de saldo adicional
            </div>
          )}
          {commerce?.status === 'suspended' && <div className="badge badge-warning mt-1">⏸ Suspendido</div>}
          {commerce?.status === 'blocked' && <div className="badge badge-danger mt-1">🔒 Bloqueado</div>}
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Operaciones</div>
          <NavItem to="/commerce" icon="📊" label="Mi Panel" />
          <NavItem to="/commerce/operations" icon="💸" label="Nueva Operación" />

          <div className="nav-section-label">Finanzas</div>
          <NavItem to="/commerce/wallets" icon="💼" label="Mis Saldos" />
          <NavItem to="/commerce/history" icon="📋" label="Historial" />
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">{profile?.full_name}</div>
              <div className="user-role">{commerce?.name}</div>
            </div>
            <button onClick={handleSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }} title="Cerrar sesión">🚪</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div className="topbar-title">{commerce?.name || 'Panel de Comercio'}</div>
          <div className="topbar-actions">
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {new Date().toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            {commerce?.status === 'active'
              ? <span className="badge badge-success">● Activo</span>
              : <span className="badge badge-danger">● {commerce?.status}</span>
            }
          </div>
        </div>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
