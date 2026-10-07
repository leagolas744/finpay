import { useState, useEffect } from 'react'
import { supabase, formatCurrency, formatDate } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

const severityConfig = {
  low: { label: 'Baja', color: 'var(--green)', badge: 'badge-success' },
  medium: { label: 'Media', color: 'var(--yellow)', badge: 'badge-warning' },
  high: { label: 'Alta', color: 'var(--orange)', badge: 'badge-orange' },
  critical: { label: 'Crítica', color: 'var(--red)', badge: 'badge-danger' },
}

const typeConfig = {
  high_amount: { label: 'Monto Alto', icon: '💰' },
  unusual_frequency: { label: 'Frecuencia Inusual', icon: '⚡' },
  suspicious_pattern: { label: 'Patrón Sospechoso', icon: '🔍' },
  manual: { label: 'Manual', icon: '👤' },
}

export default function AdminAlerts() {
  const { profile } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [resolveModal, setResolveModal] = useState(null)
  const [blockModal, setBlockModal] = useState(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchAlerts()
    const channel = supabase
      .channel('alerts_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fraud_alerts' }, fetchAlerts)
      .subscribe()
    return () => channel.unsubscribe()
  }, [filter])

  const fetchAlerts = async () => {
    setLoading(true)
    let query = supabase
      .from('fraud_alerts')
      .select('*, commerces!fraud_alerts_commerce_id_fkey(name, status), transactions(transaction_code, amount, type, client_document)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (filter === 'pending') query = query.eq('is_resolved', false)
    if (filter === 'resolved') query = query.eq('is_resolved', true)

    const { data } = await query
    setAlerts(data || [])
    setLoading(false)
  }

  const handleResolve = async () => {
    setSaving(true)
    await supabase.from('fraud_alerts').update({
      is_resolved: true,
      resolved_by: profile.id,
      resolved_at: new Date().toISOString(),
      resolution_notes: resolutionNotes
    }).eq('id', resolveModal.id)
    setResolveModal(null)
    setResolutionNotes('')
    setSaving(false)
    fetchAlerts()
  }

  const handleBlockCommerce = async () => {
    await supabase.from('commerces').update({ status: 'blocked' }).eq('id', blockModal.commerce_id)
    await supabase.from('fraud_alerts').update({
      is_resolved: true, resolved_by: profile.id, resolved_at: new Date().toISOString(),
      resolution_notes: 'Comercio bloqueado automáticamente por alerta de fraude'
    }).eq('id', blockModal.id)
    setBlockModal(null)
    fetchAlerts()
  }

  const pendingCount = alerts.filter(a => !a.is_resolved).length
  const criticalCount = alerts.filter(a => !a.is_resolved && a.severity === 'critical').length

  return (
    <div>
      <div className="section-title">🚨 Alertas y Antifraude</div>
      <div className="section-sub">Monitoreo de transacciones sospechosas y control de riesgo</div>

      {/* Stats */}
      <div className="metrics-grid mb-6">
        <div className="metric-card" style={{ '--metric-color': 'var(--red)', '--metric-bg': 'var(--red-dim)' }}>
          <div className="metric-icon">⚠️</div>
          <div className="metric-value">{pendingCount}</div>
          <div className="metric-label">Alertas Pendientes</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': criticalCount > 0 ? 'var(--red)' : 'var(--green)', '--metric-bg': criticalCount > 0 ? 'var(--red-dim)' : 'var(--green-dim)' }}>
          <div className="metric-icon">🔴</div>
          <div className="metric-value">{criticalCount}</div>
          <div className="metric-label">Alertas Críticas</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': 'var(--green)', '--metric-bg': 'var(--green-dim)' }}>
          <div className="metric-icon">✅</div>
          <div className="metric-value">{alerts.filter(a => a.is_resolved).length}</div>
          <div className="metric-label">Resueltas</div>
        </div>
      </div>

      {/* Critical banner */}
      {criticalCount > 0 && (
        <div className="alert alert-error mb-4" style={{ fontSize: 14 }}>
          🚨 <strong>¡ALERTA CRÍTICA!</strong> Hay {criticalCount} {criticalCount === 1 ? 'transacción crítica' : 'transacciones críticas'} que requiere{criticalCount > 1 ? 'n' : ''} atención inmediata.
        </div>
      )}

      {/* Filter Tabs */}
      <div className="tabs mb-4">
        {[['all', 'Todas'], ['pending', 'Pendientes'], ['resolved', 'Resueltas']].map(([val, label]) => (
          <button key={val} className={`tab ${filter === val ? 'active' : ''}`} onClick={() => setFilter(val)}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" style={{ margin: '0 auto', width: 36, height: 36 }}></div></div>
      ) : alerts.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h3>Sin alertas pendientes</h3>
          <p>El sistema no detectó actividad sospechosa</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.map(alert => {
            const sev = severityConfig[alert.severity] || severityConfig.medium
            const type = typeConfig[alert.alert_type] || { label: alert.alert_type, icon: '❓' }
            return (
              <div
                key={alert.id}
                className="card"
                style={{
                  borderLeft: `4px solid ${sev.color}`,
                  opacity: alert.is_resolved ? 0.6 : 1
                }}
              >
                <div className="flex justify-between items-center">
                  <div className="flex gap-3 items-center">
                    <span style={{ fontSize: 24 }}>{type.icon}</span>
                    <div>
                      <div className="flex gap-2 items-center mb-1">
                        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{type.label}</span>
                        <span className={`badge ${sev.badge}`}>{sev.label}</span>
                        {alert.is_resolved && <span className="badge badge-success">✓ Resuelta</span>}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {alert.description}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 16 }}>
                    {new Date(alert.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {/* Details */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 12, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                  <div>
                    <div className="text-xs text-muted">Comercio</div>
                    <div className="text-sm font-bold">{alert.commerces?.name || 'N/A'}</div>
                  </div>
                  {alert.transactions && (
                    <>
                      <div>
                        <div className="text-xs text-muted">Transacción</div>
                        <div className="text-sm mono text-accent">{alert.transactions.transaction_code}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">Monto</div>
                        <div className="text-sm font-bold" style={{ color: 'var(--red)' }}>{formatCurrency(alert.transactions.amount)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">Cliente</div>
                        <div className="text-sm mono">{alert.transactions.client_document}</div>
                      </div>
                    </>
                  )}
                </div>

                {alert.is_resolved && alert.resolution_notes && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                    ✓ <em>{alert.resolution_notes}</em>
                  </div>
                )}

                {!alert.is_resolved && (
                  <div className="flex gap-2 mt-3">
                    <button className="btn btn-success text-sm" style={{ padding: '6px 14px' }} onClick={() => setResolveModal(alert)}>
                      ✓ Marcar Resuelta
                    </button>
                    <button className="btn btn-danger text-sm" style={{ padding: '6px 14px' }} onClick={() => setBlockModal(alert)}>
                      🔒 Bloquear Comercio
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Resolve Modal */}
      {resolveModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setResolveModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">✓ Resolver Alerta</div>
              <button onClick={() => setResolveModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Comercio: <strong style={{ color: 'var(--text-primary)' }}>{resolveModal.commerces?.name}</strong></p>
              <div className="form-group">
                <label className="form-label">Notas de resolución</label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="Describe cómo se resolvió la alerta..."
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  style={{ resize: 'none' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setResolveModal(null)}>Cancelar</button>
              <button className="btn btn-success" onClick={handleResolve} disabled={saving}>
                {saving ? <><div className="spinner"></div> Guardando...</> : '✓ Resolver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block Modal */}
      {blockModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBlockModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">🔒 Bloquear Comercio</div>
            </div>
            <div className="modal-body">
              <div className="alert alert-error">
                ⚠️ Esta acción bloqueará al comercio <strong>{blockModal.commerces?.name}</strong> inmediatamente, impidiendo todas sus operaciones.
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>¿Confirmas que deseas bloquear este comercio?</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setBlockModal(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleBlockCommerce}>🔒 Sí, Bloquear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
