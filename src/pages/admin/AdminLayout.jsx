import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

function NavItem({ to, icon, label, badge }) {
  return (
    <NavLink
      to={to}
      end={to.split('/').length <= 2}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      <span className="nav-icon">{icon}</span>
      <span>{label}</span>
      {badge > 0 && (
        <span style={{ marginLeft: 'auto', background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, minWidth: 18, textAlign: 'center' }}>
          {badge}
        </span>
      )}
    </NavLink>
  )
}

export default function AdminLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    fetchAlertCount()
    const subscription = supabase
      .channel('fraud_alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fraud_alerts' }, fetchAlertCount)
      .subscribe()
    return () => subscription.unsubscribe()
  }, [])

  const fetchAlertCount = async () => {
    const { count } = await supabase.from('fraud_alerts').select('*', { count: 'exact', head: true }).eq('is_resolved', false)
    setAlertCount(count || 0)
  }

  const handleSignOut = async () => { await signOut(); navigate('/login') }
  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'AD'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">💳</div>
          <div>
            <div className="logo-text">Fin<span>Pay</span></div>
            <div className="logo-sub">Panel Administrador</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Principal</div>
          <NavItem to="/admin" icon="📊" label="Dashboard" />

          <div className="nav-section-label">Operaciones</div>
          <NavItem to="/admin/commerces" icon="🏪" label="Comercios" />
          <NavItem to="/admin/transactions" icon="💸" label="Transacciones" />
          <NavItem to="/admin/alerts" icon="🚨" label="Alertas" badge={alertCount} />

          <div className="nav-section-label">Gestión</div>
          <NavItem to="/admin/users" icon="👥" label="Usuarios" />
          <NavItem to="/admin/clients" icon="👤" label="Clientes y Grupos" />
          <NavItem to="/admin/wallets" icon="💼" label="Saldos" />

          <div className="nav-section-label">Reportes</div>
          <NavItem to="/admin/reports" icon="📈" label="Reportes" />
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">{profile?.full_name}</div>
              <div className="user-role">Administrador</div>
            </div>
            <button onClick={handleSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }} title="Cerrar sesión">🚪</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div className="topbar-title">Panel de Administración</div>
          <div className="topbar-actions">
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            {alertCount > 0 && (
              <NavLink to="/admin/alerts" style={{ textDecoration: 'none' }}>
                <span className="badge badge-danger">🚨 {alertCount} alertas</span>
              </NavLink>
            )}
          </div>
        </div>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
