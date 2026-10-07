import { useState, useEffect } from 'react'
import { supabase, formatCurrency } from '../../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ fontSize: 13, fontWeight: 600, color: p.color }}>{formatCurrency(p.value)}</p>
        ))}
      </div>
    )
  }
  return null
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState({
    totalCollectedToday: 0, totalWithdrawnToday: 0,
    feesToday: 0, transactionsToday: 0,
    activeCommerces: 0, pendingAlerts: 0
  })
  const [chartData, setChartData] = useState([])
  const [recentTxns, setRecentTxns] = useState([])
  const [companyAccount, setCompanyAccount] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAll()

    // Real-time updates
    const channel = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, () => fetchAll())
      .subscribe()

    return () => channel.unsubscribe()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchMetrics(), fetchChartData(), fetchRecentTxns(), fetchCompanyAccount()])
    setLoading(false)
  }

  const fetchMetrics = async () => {
    const today = new Date().toISOString().split('T')[0]

    const [collected, withdrawn, alerts, commerces] = await Promise.all([
      supabase.from('transactions').select('amount, fee').eq('status', 'approved').eq('type', 'recaudo').gte('created_at', today),
      supabase.from('transactions').select('amount').eq('status', 'approved').eq('type', 'retiro').gte('created_at', today),
      supabase.from('fraud_alerts').select('*', { count: 'exact', head: true }).eq('is_resolved', false),
      supabase.from('commerces').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    ])

    const totalCollected = (collected.data || []).reduce((s, t) => s + Number(t.amount), 0)
    const feesToday = (collected.data || []).reduce((s, t) => s + Number(t.fee || 0), 0)
    const totalWithdrawn = (withdrawn.data || []).reduce((s, t) => s + Number(t.amount), 0)

    const { count: txnCount } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today)

    setMetrics({
      totalCollectedToday: totalCollected,
      totalWithdrawnToday: totalWithdrawn,
      feesToday,
      transactionsToday: txnCount || 0,
      activeCommerces: commerces.count || 0,
      pendingAlerts: alerts.count || 0
    })
  }

  const fetchChartData = async () => {
    const { data } = await supabase
      .from('v_daily_metrics')
      .select('*')
      .limit(7)
      .order('date', { ascending: true })

    if (data) {
      setChartData(data.map(d => ({
        date: new Date(d.date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
        recaudo: Number(d.total_recaudo) || 0,
        retiro: Number(d.total_retiro) || 0,
        txns: Number(d.total_transactions) || 0
      })))
    }
  }

  const fetchRecentTxns = async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*, commerces!transactions_commerce_id_fkey(name), profiles!performed_by(full_name)')
      .order('created_at', { ascending: false })
      .limit(8)

    setRecentTxns(data || [])
  }

  const fetchCompanyAccount = async () => {
    const { data } = await supabase.from('company_account').select('*').single()
    setCompanyAccount(data)
  }

  const txnTypeLabel = {
    recaudo: { label: 'Recaudo', color: 'var(--green)', bg: 'var(--green-dim)' },
    retiro: { label: 'Retiro', color: 'var(--red)', bg: 'var(--red-dim)' },
    transferencia: { label: 'Transfer.', color: 'var(--accent)', bg: 'var(--accent-dim)' },
    ajuste: { label: 'Ajuste', color: 'var(--yellow)', bg: 'var(--yellow-dim)' },
    reverso: { label: 'Reverso', color: 'var(--purple)', bg: 'var(--purple-dim)' },
  }

  const statusLabel = {
    approved: <span className="badge badge-success">✓ Aprobado</span>,
    rejected: <span className="badge badge-danger">✗ Rechazado</span>,
    reversed: <span className="badge badge-purple">↩ Revertido</span>,
    pending: <span className="badge badge-warning">⏳ Pendiente</span>,
  }

  return (
    <div>
      <div className="section-title">Dashboard</div>
      <div className="section-sub">Resumen financiero en tiempo real · {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>

      {/* Company Account Banner */}
      {companyAccount && (
        <div className="balance-display mb-6">
          <div className="balance-label">💼 Cuenta Concentradora · Posición Global</div>
          <div className="balance-amount positive">{formatCurrency(companyAccount.total_balance)}</div>
          <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
            <span className="text-sm text-muted">📥 Total recaudado: <strong style={{ color: 'var(--green)' }}>{formatCurrency(companyAccount.total_collected)}</strong></span>
            <span className="text-sm text-muted">📤 Total retirado: <strong style={{ color: 'var(--red)' }}>{formatCurrency(companyAccount.total_withdrawn)}</strong></span>
            <span className="text-sm text-muted">💰 Comisiones: <strong style={{ color: 'var(--yellow)' }}>{formatCurrency(companyAccount.total_fees)}</strong></span>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="metrics-grid">
        <div className="metric-card" style={{ '--metric-color': 'var(--green)', '--metric-bg': 'var(--green-dim)' }}>
          <div className="metric-icon">📥</div>
          <div className="metric-value">{formatCurrency(metrics.totalCollectedToday)}</div>
          <div className="metric-label">Recaudado Hoy</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': 'var(--red)', '--metric-bg': 'var(--red-dim)' }}>
          <div className="metric-icon">📤</div>
          <div className="metric-value">{formatCurrency(metrics.totalWithdrawnToday)}</div>
          <div className="metric-label">Retirado Hoy</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': 'var(--yellow)', '--metric-bg': 'var(--yellow-dim)' }}>
          <div className="metric-icon">💰</div>
          <div className="metric-value">{formatCurrency(metrics.feesToday)}</div>
          <div className="metric-label">Comisiones Hoy</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': 'var(--accent)', '--metric-bg': 'var(--accent-dim)' }}>
          <div className="metric-icon">🔄</div>
          <div className="metric-value">{metrics.transactionsToday}</div>
          <div className="metric-label">Transacciones Hoy</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': 'var(--purple)', '--metric-bg': 'var(--purple-dim)' }}>
          <div className="metric-icon">🏪</div>
          <div className="metric-value">{metrics.activeCommerces}</div>
          <div className="metric-label">Comercios Activos</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': metrics.pendingAlerts > 0 ? 'var(--red)' : 'var(--green)', '--metric-bg': metrics.pendingAlerts > 0 ? 'var(--red-dim)' : 'var(--green-dim)' }}>
          <div className="metric-icon">🚨</div>
          <div className="metric-value">{metrics.pendingAlerts}</div>
          <div className="metric-label">Alertas Pendientes</div>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">📊 Recaudo vs Retiro (7 días)</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} width={45} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="recaudo" fill="var(--green)" radius={[4, 4, 0, 0]} name="Recaudo" />
              <Bar dataKey="retiro" fill="var(--red)" radius={[4, 4, 0, 0]} name="Retiro" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">📈 Volumen de Transacciones</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="txns" stroke="var(--accent)" strokeWidth={2} dot={{ fill: 'var(--accent)', r: 4 }} name="Transacciones" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🕐 Últimas Transacciones</div>
          <a href="/admin/transactions" className="btn btn-secondary text-sm">Ver todas →</a>
        </div>
        <div className="table-wrapper" style={{ borderRadius: 0, border: 'none', marginTop: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Tipo</th>
                <th>Comercio</th>
                <th>Cliente Doc.</th>
                <th>Valor</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {recentTxns.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No hay transacciones recientes</td></tr>
              ) : recentTxns.map(txn => {
                const type = txnTypeLabel[txn.type] || { label: txn.type, color: 'var(--text-muted)', bg: 'transparent' }
                return (
                  <tr key={txn.id}>
                    <td><span className="mono text-accent">{txn.transaction_code}</span></td>
                    <td>
                      <span className="badge" style={{ background: type.bg, color: type.color }}>{type.label}</span>
                    </td>
                    <td className="text-primary">{txn.commerces?.name || '-'}</td>
                    <td className="mono">{txn.client_document}</td>
                    <td className="text-primary font-bold">{formatCurrency(txn.amount)}</td>
                    <td>{statusLabel[txn.status]}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(txn.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
