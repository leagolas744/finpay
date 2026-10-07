import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase, formatCurrency } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

const FEE_RATE = 0.005

export default function CommerceOperations() {
  const { profile, refreshProfile } = useAuth()
  const location = useLocation()
  const [step, setStep] = useState('select')
  const [selectedType, setSelectedType] = useState(location.state?.type || null)
  const [form, setForm] = useState({
    clientDocument: '', clientName: '', amount: '',
    concept: '', destCommerceId: '',
    walletTypeId: ''   // Feature: saldo destino
  })
  const [wallets, setWallets] = useState([])         // wallets del comercio
  const [mainBalance, setMainBalance] = useState(profile?.commerces?.balance || 0)
  const [commerces, setCommerces] = useState([])
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const commerceId = profile?.commerces?.id
  const commerce = profile?.commerces

  useEffect(() => {
    if (location.state?.type) { setSelectedType(location.state.type); setStep('form') }
    fetchCommerces()
    fetchBalance()
    fetchWallets()
  }, [])

  const fetchBalance = async () => {
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

  const fetchCommerces = async () => {
    // Fix: obtener todos los comercios activos en tiempo real (Feature #3 admin)
    const { data } = await supabase
      .from('commerces')
      .select('id, name, balance')
      .eq('status', 'active')
      .neq('id', commerceId)
      .order('name')
    setCommerces(data || [])
  }

  // Obtener saldo del wallet seleccionado o el principal
  const getSelectedBalance = () => {
    if (!form.walletTypeId) return Number(mainBalance)
    const w = wallets.find(w => w.wallet_type_id === form.walletTypeId)
    return w ? Number(w.balance) : 0
  }

  const getSelectedWalletName = () => {
    if (!form.walletTypeId) return 'Saldo Principal'
    const w = wallets.find(w => w.wallet_type_id === form.walletTypeId)
    return w ? `${w.wallet_types?.icon} ${w.wallet_types?.name}` : 'Saldo Principal'
  }

  const selectType = (type) => {
    setSelectedType(type)
    setForm({ clientDocument: '', clientName: '', amount: '', concept: '', destCommerceId: '', walletTypeId: '' })
    setError('')
    setStep('form')
  }

  const validateAndConfirm = () => {
    if (!form.clientDocument.trim()) return setError('El documento del cliente es obligatorio')
    if (!form.amount || Number(form.amount) <= 0) return setError('El valor debe ser mayor a 0')
    const selectedBalance = getSelectedBalance()
    if (selectedType === 'retiro' && Number(form.amount) > selectedBalance) {
      return setError(`Saldo insuficiente en ${getSelectedWalletName()}. Disponible: ${formatCurrency(selectedBalance)}`)
    }
    if (selectedType === 'transferencia' && !form.destCommerceId) return setError('Selecciona el comercio de destino')
    if (selectedType === 'transferencia' && Number(form.amount) > Number(mainBalance)) {
      return setError(`Saldo principal insuficiente para transferir. Disponible: ${formatCurrency(mainBalance)}`)
    }
    setError('')
    setStep('confirm')
  }

  const executeTransaction = async () => {
    setLoading(true)
    setError('')
    try {
      const fee = selectedType === 'recaudo' ? Number(form.amount) * FEE_RATE : 0

      const { data, error: rpcError } = await supabase.rpc('execute_transaction', {
        p_type: selectedType,
        p_commerce_id: commerceId,
        p_dest_commerce_id: selectedType === 'transferencia' ? form.destCommerceId : null,
        p_client_document: form.clientDocument.trim(),
        p_client_name: form.clientName.trim() || null,
        p_amount: Number(form.amount),
        p_concept: form.concept.trim() || null,
        p_fee: fee,
        p_performed_by: profile.id,
        p_ip_address: null,
        p_wallet_type_id: (form.walletTypeId && selectedType !== 'transferencia') ? form.walletTypeId : null
      })

      if (rpcError) throw new Error(rpcError.message)
      if (!data?.success) throw new Error(data?.error)

      // Actualizar saldos locales
      if (form.walletTypeId && data.wallet_type_id) {
        setWallets(prev => prev.map(w =>
          w.wallet_type_id === form.walletTypeId
            ? { ...w, balance: data.balance_after }
            : w
        ))
      } else {
        setMainBalance(data.balance_after)
      }

      setResult({ ...data, fee, amount: Number(form.amount), type: selectedType, walletName: getSelectedWalletName() })
      setStep('success')
      refreshProfile()
    } catch (err) {
      setError(err.message)
      setStep('confirm')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep('select')
    setSelectedType(null)
    setForm({ clientDocument: '', clientName: '', amount: '', concept: '', destCommerceId: '', walletTypeId: '' })
    setResult(null)
    setError('')
    fetchBalance()
    fetchWallets()
  }

  const fee = selectedType === 'recaudo' ? Number(form.amount || 0) * FEE_RATE : 0
  const selectedBalance = getSelectedBalance()

  const typeConfig = {
    recaudo:      { label: 'Recaudo',      color: '#00e676', bg: 'rgba(0,230,118,0.12)',  icon: '📥', desc: 'Cobrar dinero del cliente' },
    retiro:       { label: 'Retiro',       color: '#ff4569', bg: 'rgba(255,69,105,0.12)', icon: '📤', desc: 'Pagar dinero al cliente' },
    transferencia:{ label: 'Transferencia',color: '#00d4ff', bg: 'rgba(0,212,255,0.12)',  icon: '🔁', desc: 'Enviar saldo a otro comercio' },
  }

  if (commerce?.status !== 'active') {
    return (
      <div>
        <div className="section-title">💸 Nueva Operación</div>
        <div className="alert alert-error">🔒 Tu comercio está {commerce?.status}. No puedes realizar operaciones.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="section-title">💸 Nueva Operación</div>
      <div className="section-sub">Sistema POS · Operaciones rápidas y seguras</div>

      {/* Balance bar — muestra todos los saldos */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>💵 Principal</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: Number(mainBalance) > 200000 ? 'var(--green)' : 'var(--red)' }}>
                {formatCurrency(mainBalance)}
              </div>
            </div>
            {wallets.map(w => (
              <div key={w.id}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
                  {w.wallet_types?.icon} {w.wallet_types?.name}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: w.wallet_types?.color || 'var(--accent)' }}>
                  {formatCurrency(w.balance)}
                </div>
              </div>
            ))}
          </div>
          {step !== 'select' && (
            <button className="btn btn-secondary" onClick={reset} style={{ fontSize: 13 }}>← Inicio</button>
          )}
        </div>
      </div>

      {/* STEP 1: Select type */}
      {step === 'select' && (
        <div>
          <div className="text-sm text-muted mb-4" style={{ textAlign: 'center' }}>Selecciona el tipo de operación</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {Object.entries(typeConfig).map(([type, config]) => (
              <button key={type} className={`pos-btn ${type}`} onClick={() => selectType(type)} style={{ cursor: 'pointer' }}>
                <div className="pos-icon" style={{ fontSize: 32, width: 64, height: 64, background: config.bg, color: config.color }}>{config.icon}</div>
                <div className="pos-label" style={{ fontSize: 16 }}>{config.label}</div>
                <div className="pos-desc">{config.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Form */}
      {step === 'form' && selectedType && (
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '14px 18px', background: typeConfig[selectedType]?.bg, border: `1px solid ${typeConfig[selectedType]?.color}30`, borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: 28 }}>{typeConfig[selectedType]?.icon}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: typeConfig[selectedType]?.color }}>{typeConfig[selectedType]?.label}</div>
              <div className="text-xs text-muted">{typeConfig[selectedType]?.desc}</div>
            </div>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="card">
            <div className="form-group">
              <label className="form-label">Documento del Cliente *</label>
              <input className="form-control form-control-lg" placeholder="Cédula / NIT / Pasaporte" value={form.clientDocument} onChange={e => setForm({ ...form, clientDocument: e.target.value })} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Nombre del Cliente</label>
              <input className="form-control" placeholder="Nombre completo (opcional)" value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} />
            </div>

            {/* Feature: Selección de saldo — solo para recaudo y retiro */}
            {(selectedType === 'recaudo' || selectedType === 'retiro') && wallets.length > 0 && (
              <div className="form-group">
                <label className="form-label">
                  {selectedType === 'recaudo' ? '¿A qué saldo va el recaudo?' : '¿De qué saldo sale el retiro?'}
                </label>
                <select
                  className="form-control"
                  value={form.walletTypeId}
                  onChange={e => setForm({ ...form, walletTypeId: e.target.value })}
                >
                  <option value="">💵 Saldo Principal — {formatCurrency(mainBalance)}</option>
                  {wallets.map(w => (
                    <option key={w.wallet_type_id} value={w.wallet_type_id}>
                      {w.wallet_types?.icon} {w.wallet_types?.name} — {formatCurrency(w.balance)}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Saldo disponible en {getSelectedWalletName()}: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatCurrency(selectedBalance)}</strong>
                </div>
              </div>
            )}

            {/* Monto */}
            <div className="form-group">
              <label className="form-label">Valor * (COP)</label>
              <input
                type="number" className="form-control" placeholder="0"
                value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                min="1"
                style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', padding: '14px 16px', textAlign: 'right', letterSpacing: -1 }}
              />
              {form.amount > 0 && (
                <div style={{ textAlign: 'right', marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                  = {formatCurrency(form.amount)}
                  {selectedType === 'recaudo' && fee > 0 && <span style={{ color: 'var(--yellow)' }}> · Comisión: {formatCurrency(fee)}</span>}
                </div>
              )}
            </div>

            {selectedType === 'transferencia' && (
              <div className="form-group">
                <label className="form-label">Comercio Destino *</label>
                <select className="form-control" value={form.destCommerceId} onChange={e => setForm({ ...form, destCommerceId: e.target.value })}>
                  <option value="">Seleccionar comercio...</option>
                  {commerces.map(c => (
                    <option key={c.id} value={c.id}>{c.name} — {formatCurrency(c.balance)}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Concepto</label>
              <input className="form-control" placeholder="Descripción (opcional)" value={form.concept} onChange={e => setForm({ ...form, concept: e.target.value })} />
            </div>

            {selectedType === 'retiro' && form.amount > 0 && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,69,105,0.12)', border: '1px solid rgba(255,69,105,0.25)', borderRadius: 'var(--radius-sm)', marginBottom: 16, fontSize: 13 }}>
                Saldo en <strong>{getSelectedWalletName()}</strong> después: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {formatCurrency(selectedBalance - Number(form.amount))}
                </strong>
              </div>
            )}

            <button
              className={`btn btn-lg w-full ${selectedType === 'recaudo' ? 'btn-success' : selectedType === 'retiro' ? 'btn-danger' : 'btn-primary'}`}
              onClick={validateAndConfirm}
            >
              Continuar → Confirmar {typeConfig[selectedType]?.label}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Confirm */}
      {step === 'confirm' && (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="card">
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>{typeConfig[selectedType]?.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Confirmar {typeConfig[selectedType]?.label}</div>
              <div className="text-sm text-muted">Verifica los datos antes de continuar</div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="confirm-amount">{formatCurrency(form.amount)}</div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 20 }}>
              {[
                ['Operación', typeConfig[selectedType]?.label],
                ['Documento', form.clientDocument],
                ...(form.clientName ? [['Cliente', form.clientName]] : []),
                ['Saldo afectado', getSelectedWalletName()],
                ...(form.concept ? [['Concepto', form.concept]] : []),
                ...(fee > 0 ? [['Comisión', formatCurrency(fee)]] : []),
                ['Saldo actual', formatCurrency(selectedBalance)],
                ['Saldo después', formatCurrency(
                  selectedType === 'recaudo'
                    ? selectedBalance + Number(form.amount)
                    : selectedBalance - Number(form.amount)
                )],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between" style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <span className="text-sm text-muted">{label}</span>
                  <span className="text-sm font-bold">{value}</span>
                </div>
              ))}
            </div>

            {Number(form.amount) >= (commerce?.alert_threshold || 1000000) && (
              <div className="alert alert-warning mb-4">⚠️ Monto alto — será revisado por el administrador</div>
            )}

            <div className="flex gap-3">
              <button className="btn btn-secondary btn-lg flex-1" onClick={() => setStep('form')} disabled={loading}>← Editar</button>
              <button
                className={`btn btn-lg flex-1 ${selectedType === 'recaudo' ? 'btn-success' : selectedType === 'retiro' ? 'btn-danger' : 'btn-primary'}`}
                onClick={executeTransaction}
                disabled={loading}
              >
                {loading ? <><div className="spinner"></div> Procesando...</> : `✓ EJECUTAR ${typeConfig[selectedType]?.label?.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Success */}
      {step === 'success' && result && (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: 'var(--green)' }}>¡Operación Exitosa!</div>
            <div className="text-muted mb-4">{typeConfig[result.type]?.label} procesada correctamente</div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 20, marginBottom: 20, textAlign: 'left' }}>
              <div className="flex justify-between mb-3">
                <span className="text-sm text-muted">Código</span>
                <span className="mono text-accent font-bold">{result.transaction_code}</span>
              </div>
              <div className="flex justify-between mb-3">
                <span className="text-sm text-muted">Saldo afectado</span>
                <span className="text-sm font-bold">{result.walletName}</span>
              </div>
              <div className="flex justify-between mb-3">
                <span className="text-sm text-muted">Monto</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 800, color: result.type === 'recaudo' ? 'var(--green)' : 'var(--red)' }}>
                  {formatCurrency(result.amount)}
                </span>
              </div>
              {result.fee > 0 && (
                <div className="flex justify-between mb-3">
                  <span className="text-sm text-muted">Comisión</span>
                  <span style={{ fontSize: 13, color: 'var(--yellow)' }}>{formatCurrency(result.fee)}</span>
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div className="flex justify-between">
                  <span className="text-sm text-muted">Nuevo Saldo</span>
                  <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                    {formatCurrency(result.balance_after)}
                  </span>
                </div>
              </div>
            </div>

            {result.is_flagged && <div className="alert alert-warning mb-4">⚠️ Operación marcada para revisión (monto alto)</div>}

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
              {new Date().toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'medium' })}
            </div>

            <div className="flex gap-3">
              <button className="btn btn-secondary btn-lg flex-1" onClick={reset}>🔄 Nueva Operación</button>
              <button className="btn btn-primary btn-lg flex-1" onClick={() => window.print()}>🖨️ Imprimir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
