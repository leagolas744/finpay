import { useState, useEffect } from 'react'
import { supabase, formatCurrency } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export default function CommerceWallets() {
  const { profile } = useAuth()
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const commerceId = profile?.commerces?.id

  useEffect(() => {
    if (!commerceId) return
    fetchWallets()

    // Tiempo real
    const channel = supabase
      .channel(`wallets_${commerceId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'commerce_wallets',
        filter: `commerce_id=eq.${commerceId}`
      }, fetchWallets)
      .subscribe()

    return () => channel.unsubscribe()
  }, [commerceId])

  const fetchWallets = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('commerce_wallets')
      .select('*, wallet_types(name, icon, color, description)')
      .eq('commerce_id', commerceId)
      .eq('is_active', true)
      .order('created_at')
    setWallets(data || [])
    setLoading(false)
  }

  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance), 0)

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>

  if (wallets.length === 0) return (
    <div>
      <div className="section-title">💼 Mis Saldos</div>
      <div className="empty-state">
        <div style={{ fontSize: 48 }}>💼</div>
        <h3>Sin saldos configurados</h3>
        <p>El administrador aún no ha configurado los tipos de saldo para tu comercio</p>
      </div>
    </div>
  )

  return (
    <div>
      <div className="section-title">💼 Mis Saldos</div>
      <div className="section-sub">Todos los saldos disponibles en tu comercio</div>

      {/* Total */}
      <div className="balance-display mb-6">
        <div className="balance-label">💼 Saldo Total Combinado</div>
        <div className="balance-amount positive">{formatCurrency(totalBalance)}</div>
        <div className="text-sm text-muted">{wallets.length} tipo{wallets.length !== 1 ? 's' : ''} de saldo activo{wallets.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Wallets grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {wallets.map(wallet => {
          const isLow = Number(wallet.balance) < Number(wallet.alert_threshold)
          const color = wallet.wallet_types?.color || '#00d4ff'
          return (
            <div
              key={wallet.id}
              className="card"
              style={{
                borderTop: `3px solid ${color}`,
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Background glow */}
              <div style={{
                position: 'absolute', top: -40, right: -40,
                width: 120, height: 120,
                background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
                pointerEvents: 'none'
              }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: `${color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, flexShrink: 0
                }}>
                  {wallet.wallet_types?.icon || '💰'}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {wallet.wallet_types?.name}
                  </div>
                  {wallet.wallet_types?.description && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {wallet.wallet_types.description}
                    </div>
                  )}
                </div>
              </div>

              <div style={{
                fontSize: 28, fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: isLow ? '#ff4569' : color,
                letterSpacing: -1, marginBottom: 8, lineHeight: 1
              }}>
                {formatCurrency(wallet.balance)}
              </div>

              {isLow ? (
                <div style={{ fontSize: 11, color: '#ff4569', padding: '4px 8px', background: 'rgba(255,69,105,0.1)', borderRadius: 4 }}>
                  ⚠️ Saldo bajo — umbral: {formatCurrency(wallet.alert_threshold)}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Umbral mínimo: {formatCurrency(wallet.alert_threshold)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
