import { useState, useEffect } from 'react'
import { supabase, formatCurrency } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { NavLink } from 'react-router-dom'

export default function CommerceDashboard() {
  const { profile, refreshProfile } = useAuth()
  const [todayStats, setTodayStats] = useState({ recaudo: 0, retiro: 0, count: 0 })
  const [recentTxns, setRecentTxns] = useState([])
  const [wallets, setWallets] = useState([])
  const [mainBalance, setMainBalance] = useState(profile?.commerces?.balance || 0)
  const [loading, setLoading] = useState(true)

  const commerceId = profile?.commerces?.id

  useEffect(() => {
    if (!commerceId) return
    fetchAll()

    // Realtime: saldo principal
    const channel = supabase
      .channel(`dash_${commerceId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'commerces',
        filter: `id=eq.${commerceId}`
      }, (payload) => {
        setMainBalance(payload.new.balance)
      })
      // Realtime: wallets adicionales
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'commerce_wallets',
        filter: `commerce_id=eq.${commerceId}`
      }, () => fetchWallets())
      // Realtime: nuevas transacciones
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'transactions',
        filter: `commerce_id=eq.${commerceId}`
      }, () => { fetchTodayStats(); fetchRecentTxns() })
      // Feature 5: Reversiones también se reflejan aquí
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'transactions',
        filter: `commerce_id=eq.${commerceId}`
      }, () => { fetchTodayStats(); fetchRecentTxns() })
      .subscribe()

    return () => channel.unsubscribe()
  }, [commerceId])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchTodayStats(), fetchRecentTxns(), fetchMainBalance(), fetchWallets()])
    setLoading(false)
  }

  const fetchMainBalance = async () => {
    const { data } = await supabase.from('commerces').select('balance').eq('id', commerceId).single()
    if (data) setMainBalance(data.balance)
  }

  const fetchWallets = async () => {
    const { data } = await supabase
      .from('commerce_wallets')
      .select('*, wallet_types(name, icon, color)')
      .eq('commerce_id', commerceId)
      .eq('is_active', true)
      .order('created_at')
    setWallets(data || [])
  }

  const fetchTodayStats = async () => {
    const today = new Date()
    const pad = n => String(n).padStart(2, '0')
    const todayUTC = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`
    const { data } = await supabase
      .from('transactions')
      .select('type, amount, status')
      .eq('commerce_id', commerceId)
      .gte('created_at', todayUTC + 'T00:00:00.000Z')
      .lte('created_at', todayUTC + 'T23:59:59.999Z')
    if (data) {
      // Solo contar aprobadas para el resumen
      const approved = data.filter(t => t.status === 'approved')
      setTodayStats({
        recaudo: approved.filter(t => t.type === 'recaudo').reduce((s, t) => s + Number(t.amount), 0),
        retiro:  approved.filter(t => t.type === 'retiro').reduce((s, t) => s + Number(t.amount), 0),
        count:   data.length
      })
    }
  }

  const fetchRecentTxns = async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('commerce_id', commerceId)
      .order('created_at', { ascending: false })
      .limit(6)
    setRecentTxns(data || [])
  }

  const commerce = profile?.commerces
  const totalBalance = Number(mainBalance) + wallets.reduce((s, w) => s + Number(w.balance), 0)
  const mainBalanceLow = Number(mainBalance) < 200000

  const typeConfig = {
    recaudo:      { label: 'Recaudo',    color: '#00e676', bg: 'rgba(0,230,118,0.12)',  icon: '📥' },
    retiro:       { label: 'Retiro',     color: '#ff4569', bg: 'rgba(255,69,105,0.12)', icon: '📤' },
    transferencia:{ label: 'Transfer.',  color: '#00d4ff', bg: 'rgba(0,212,255,0.12)',  icon: '🔁' },
    ajuste:       { label: 'Ajuste',     color: '#ffd740', bg: 'rgba(255,215,64,0.12)', icon: '⚙️' },
  }

  return (
    <div>
      <div className="section-title">📊 Mi Panel</div>
      <div className="section-sub">Resumen de operaciones de {commerce?.name}</div>

      {/* Balance principal + wallets integrados — Feature: integrated balances realtime */}
      <div className="balance-display mb-6">
        <div className="balance-label">💼 Saldo Total Combinado</div>
        <div className={`balance-amount ${totalBalance > 200000 ? 'positive' : 'low'}`}>
          {formatCurrency(totalBalance)}
        </div>

        {/* Desglose de saldos */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
          {/* Saldo principal */}
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 12px', minWidth: 120 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
              💵 Principal
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16,
              color: mainBalanceLow ? 'var(--red)' : 'var(--green)'
            }}>
              {formatCurrency(mainBalance)}
            </div>
            {mainBalanceLow && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>⚠️ Saldo bajo</div>}
          </div>

          {/* Wallets adicionales en tiempo real */}
          {wallets.map(w => {
            const isLow = Number(w.balance) < Number(w.alert_threshold)
            return (
              <div key={w.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 12px', minWidth: 120 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
                  {w.wallet_types?.icon} {w.wallet_types?.name}
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16,
                  color: isLow ? 'var(--red)' : w.wallet_types?.color || 'var(--accent)'
                }}>
                  {formatCurrency(w.balance)}
                </div>
                {isLow && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>⚠️ Saldo bajo</div>}
              </div>
            )
          })}
        </div>

        <div className="flex gap-4 mt-3" style={{ flexWrap: 'wrap' }}>
          <span className="text-sm text-muted">Límite diario: <strong style={{ color: 'var(--text-secondary)' }}>{formatCurrency(commerce?.daily_limit)}</strong></span>
          <span className="text-sm text-muted">Estado: <strong style={{ color: commerce?.status === 'active' ? 'var(--green)' : 'var(--red)' }}>
            {commerce?.status === 'active' ? '● Activo' : `● ${commerce?.status}`}
          </strong></span>
        </div>
      </div>

      {/* Today Stats */}
      <div className="metrics-grid mb-6">
        <div className="metric-card" style={{ '--metric-color': '#00e676', '--metric-bg': 'rgba(0,230,118,0.12)' }}>
          <div className="metric-icon">📥</div>
          <div className="metric-value">{formatCurrency(todayStats.recaudo)}</div>
          <div className="metric-label">Recaudado Hoy</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': '#ff4569', '--metric-bg': 'rgba(255,69,105,0.12)' }}>
          <div className="metric-icon">📤</div>
          <div className="metric-value">{formatCurrency(todayStats.retiro)}</div>
          <div className="metric-label">Retirado Hoy</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': '#00d4ff', '--metric-bg': 'rgba(0,212,255,0.12)' }}>
          <div className="metric-icon">🔄</div>
          <div className="metric-value">{todayStats.count}</div>
          <div className="metric-label">Operaciones Hoy</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mb-6">
        <div className="card-header"><div className="card-title">⚡ Acceso Rápido</div></div>
        <div className="pos-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <NavLink to="/commerce/operations" state={{ type: 'recaudo' }} style={{ textDecoration: 'none' }}>
            <div className="pos-btn recaudo">
              <div className="pos-icon">📥</div>
              <div className="pos-label">Recaudo</div>
              <div className="pos-desc">Cobrar al cliente</div>
            </div>
          </NavLink>
          <NavLink to="/commerce/operations" state={{ type: 'retiro' }} style={{ textDecoration: 'none' }}>
            <div className="pos-btn retiro">
              <div className="pos-icon">📤</div>
              <div className="pos-label">Retiro</div>
              <div className="pos-desc">Pagar al cliente</div>
            </div>
          </NavLink>
          <NavLink to="/commerce/operations" state={{ type: 'transferencia' }} style={{ textDecoration: 'none' }}>
            <div className="pos-btn transferencia">
              <div className="pos-icon">🔁</div>
              <div className="pos-label">Transferir</div>
              <div className="pos-desc">Enviar a otro punto</div>
            </div>
          </NavLink>
        </div>
      </div>

      {/* Recent Transactions — Feature 5: reversiones visibles */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🕐 Últimas Operaciones</div>
          <NavLink to="/commerce/history" className="btn btn-secondary text-sm">Ver historial →</NavLink>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Valor</th>
                  <th>Estado</th>
                  <th>Hora</th>
                </tr>
              </thead>
              <tbody>
                {recentTxns.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Sin operaciones</td></tr>
                ) : recentTxns.map(txn => {
                  const t = typeConfig[txn.type] || { label: txn.type, color: 'var(--text-muted)', bg: 'transparent', icon: '' }
                  const isReversed = txn.status === 'reversed'
                  return (
                    <tr key={txn.id} style={{ opacity: isReversed ? 0.5 : 1 }}>
                      <td><span className="mono text-accent" style={{ fontSize: 11 }}>{txn.transaction_code}</span></td>
                      <td>
                        <span className="badge" style={{ background: t.bg, color: t.color }}>{t.icon} {t.label}</span>
                        {isReversed && <span className="badge badge-muted" style={{ marginLeft: 4, fontSize: 10 }}>↩ Revertida</span>}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>{txn.client_document}</td>
                      <td style={{
                        fontFamily: 'var(--font-mono)', fontWeight: 700,
                        color: isReversed ? 'var(--text-muted)'
                          : txn.type === 'recaudo' ? '#00e676'
                          : txn.type === 'retiro' ? '#ff4569'
                          : 'var(--text-primary)',
                        textDecoration: isReversed ? 'line-through' : 'none'
                      }}>
                        {txn.type === 'retiro' ? '−' : txn.type === 'recaudo' ? '+' : ''}{formatCurrency(txn.amount)}
                      </td>
                      <td>
                        {isReversed
                          ? <span className="badge badge-muted">↩ Revertido</span>
                          : <span className="badge badge-success">✓ Aprobado</span>
                        }
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {new Date(txn.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
