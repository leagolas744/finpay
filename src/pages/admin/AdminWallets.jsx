import { useState, useEffect } from 'react'
import { supabase, formatCurrency } from '../../lib/supabase'

export default function AdminWallets() {
  const [wallets, setWallets] = useState([])
  const [walletTypes, setWalletTypes] = useState([])
  const [commerces, setCommerces] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editingType, setEditingType] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filterCommerce, setFilterCommerce] = useState('')

  const emptyWallet = { commerce_id: '', wallet_type_id: '', balance: 0, alert_threshold: 100000, is_active: true }
  const emptyType = { name: '', description: '', icon: '💰', color: '#00d4ff', is_active: true }
  const [walletForm, setWalletForm] = useState(emptyWallet)
  const [typeForm, setTypeForm] = useState(emptyType)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: w }, { data: t }, { data: c }] = await Promise.all([
      supabase.from('commerce_wallets').select('*, commerces(name), wallet_types(name, icon, color)').order('created_at'),
      supabase.from('wallet_types').select('*').order('name'),
      supabase.from('commerces').select('id, name').eq('status', 'active').order('name')
    ])
    setWallets(w || [])
    setWalletTypes(t || [])
    setCommerces(c || [])
    setLoading(false)
  }

  // ===== WALLET TYPES =====
  const openCreateType = () => { setEditingType(null); setTypeForm(emptyType); setError(''); setShowTypeModal(true) }
  const openEditType = (t) => {
    setEditingType(t)
    setTypeForm({ name: t.name, description: t.description || '', icon: t.icon, color: t.color, is_active: t.is_active })
    setError('')
    setShowTypeModal(true)
  }
  const handleSaveType = async () => {
    if (!typeForm.name) return setError('El nombre es obligatorio')
    setSaving(true)
    setError('')
    try {
      if (editingType) {
        const { error } = await supabase.from('wallet_types').update(typeForm).eq('id', editingType.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('wallet_types').insert(typeForm)
        if (error) throw error
      }
      setSuccess(editingType ? 'Tipo actualizado' : 'Tipo creado')
      setShowTypeModal(false)
      fetchAll()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }
  const handleDeleteType = async (t) => {
    if (!confirm(`¿Eliminar el tipo "${t.name}"?`)) return
    await supabase.from('wallet_types').delete().eq('id', t.id)
    fetchAll()
  }

  // ===== WALLETS =====
  const openCreateWallet = () => { setEditing(null); setWalletForm(emptyWallet); setError(''); setShowModal(true) }
  const openEditWallet = (w) => {
    setEditing(w)
    setWalletForm({ commerce_id: w.commerce_id, wallet_type_id: w.wallet_type_id, balance: w.balance, alert_threshold: w.alert_threshold, is_active: w.is_active })
    setError('')
    setShowModal(true)
  }
  const handleSaveWallet = async () => {
    if (!walletForm.commerce_id || !walletForm.wallet_type_id) return setError('Comercio y tipo son obligatorios')
    setSaving(true)
    setError('')
    try {
      const payload = { ...walletForm, balance: Number(walletForm.balance), alert_threshold: Number(walletForm.alert_threshold) }
      if (editing) {
        const { error } = await supabase.from('commerce_wallets').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('commerce_wallets').insert(payload)
        if (error) throw error
      }
      setSuccess(editing ? 'Saldo actualizado' : 'Saldo creado')
      setShowModal(false)
      fetchAll()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const handleAdjustBalance = async (wallet) => {
    const amount = prompt(`Ajustar saldo de ${wallet.wallet_types?.name} - ${wallet.commerces?.name}\nSaldo actual: ${formatCurrency(wallet.balance)}\n\nIngresa el nuevo saldo:`)
    if (!amount || isNaN(Number(amount))) return
    await supabase.from('commerce_wallets').update({ balance: Number(amount) }).eq('id', wallet.id)
    setSuccess('Saldo ajustado correctamente')
    fetchAll()
  }

  const filtered = wallets.filter(w => !filterCommerce || w.commerce_id === filterCommerce)

  // Agrupar por comercio
  const grouped = filtered.reduce((acc, w) => {
    const name = w.commerces?.name || 'Sin comercio'
    if (!acc[name]) acc[name] = []
    acc[name].push(w)
    return acc
  }, {})

  return (
    <div>
      <div className="section-title">💼 Saldos por Comercio</div>
      <div className="section-sub">Gestiona múltiples tipos de saldo: efectivo, plataformas, datafonos</div>

      {success && <div className="alert alert-success mb-4">{success}<button onClick={() => setSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></div>}

      {/* Actions bar */}
      <div className="filters-bar mb-4">
        <div className="flex-1">
          <select className="form-control" value={filterCommerce} onChange={e => setFilterCommerce(e.target.value)}>
            <option value="">Todos los comercios</option>
            {commerces.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary" onClick={openCreateType}>⚙️ Tipos de Saldo</button>
        <button className="btn btn-primary" onClick={openCreateWallet}>+ Agregar Saldo</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 48 }}>💼</div>
          <h3>No hay saldos configurados</h3>
          <p>Agrega tipos de saldo a los comercios con el botón de arriba</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.entries(grouped).map(([commerceName, commerceWallets]) => {
            const totalBalance = commerceWallets.reduce((s, w) => s + Number(w.balance), 0)
            return (
              <div key={commerceName} className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">🏪 {commerceName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Saldo total combinado: <strong style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{formatCurrency(totalBalance)}</strong>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {commerceWallets.map(wallet => {
                    const isLow = Number(wallet.balance) < Number(wallet.alert_threshold)
                    return (
                      <div key={wallet.id} style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        padding: 16,
                        border: `1px solid ${isLow ? 'rgba(255,69,105,0.3)' : 'var(--border)'}`,
                        position: 'relative'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 24 }}>{wallet.wallet_types?.icon || '💰'}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {wallet.wallet_types?.name}
                            </div>
                            {!wallet.is_active && <span className="badge badge-danger" style={{ fontSize: 10 }}>Inactivo</span>}
                          </div>
                        </div>
                        <div style={{
                          fontSize: 22, fontWeight: 800,
                          fontFamily: 'var(--font-mono)',
                          color: isLow ? 'var(--red)' : wallet.wallet_types?.color || 'var(--green)',
                          letterSpacing: -1, marginBottom: 4
                        }}>
                          {formatCurrency(wallet.balance)}
                        </div>
                        {isLow && (
                          <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>
                            ⚠️ Por debajo del umbral ({formatCurrency(wallet.alert_threshold)})
                          </div>
                        )}
                        <div className="flex gap-2 mt-2">
                          <button className="btn btn-warning text-xs" style={{ padding: '4px 8px', flex: 1, fontSize: 11 }} onClick={() => handleAdjustBalance(wallet)}>
                            💰 Ajustar
                          </button>
                          <button className="btn btn-secondary text-xs" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => openEditWallet(wallet)}>
                            ✏️
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Wallet Types Modal */}
      {showTypeModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowTypeModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">⚙️ {editingType ? 'Editar Tipo' : 'Nuevo Tipo de Saldo'}</div>
              <button onClick={() => setShowTypeModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error mb-4">{error}</div>}

              {/* Lista de tipos existentes */}
              {!editingType && walletTypes.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="form-label">Tipos existentes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {walletTypes.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                        <span>{t.icon} {t.name}</span>
                        <div className="flex gap-2">
                          <button className="btn btn-secondary text-xs" style={{ padding: '3px 8px' }} onClick={() => openEditType(t)}>✏️</button>
                          <button className="btn btn-danger text-xs" style={{ padding: '3px 8px' }} onClick={() => handleDeleteType(t)}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                    <div className="form-label">Crear nuevo tipo</div>
                  </div>
                </div>
              )}

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Nombre *</label>
                  <input className="form-control" value={typeForm.name} onChange={e => setTypeForm({ ...typeForm, name: e.target.value })} placeholder="Ej: Nequi, Daviplata" />
                </div>
                <div className="form-group">
                  <label className="form-label">Ícono (emoji)</label>
                  <input className="form-control" value={typeForm.icon} onChange={e => setTypeForm({ ...typeForm, icon: e.target.value })} placeholder="💰" style={{ fontSize: 20, textAlign: 'center' }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <input className="form-control" value={typeForm.description} onChange={e => setTypeForm({ ...typeForm, description: e.target.value })} placeholder="Descripción del tipo de saldo" />
              </div>
              <div className="form-group">
                <label className="form-label">Color (hex)</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={typeForm.color} onChange={e => setTypeForm({ ...typeForm, color: e.target.value })} style={{ width: 44, height: 36, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: 'none' }} />
                  <input className="form-control" value={typeForm.color} onChange={e => setTypeForm({ ...typeForm, color: e.target.value })} placeholder="#00d4ff" style={{ flex: 1 }} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTypeModal(false)}>Cerrar</button>
              <button className="btn btn-primary" onClick={handleSaveType} disabled={saving}>
                {saving ? <><div className="spinner"></div> Guardando...</> : '✓ Guardar Tipo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Wallet Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editing ? '✏️ Editar Saldo' : '+ Agregar Saldo a Comercio'}</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error mb-4">{error}</div>}
              <div className="form-group">
                <label className="form-label">Comercio *</label>
                <select className="form-control" value={walletForm.commerce_id} onChange={e => setWalletForm({ ...walletForm, commerce_id: e.target.value })} disabled={!!editing}>
                  <option value="">Seleccionar comercio...</option>
                  {commerces.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de Saldo *</label>
                <select className="form-control" value={walletForm.wallet_type_id} onChange={e => setWalletForm({ ...walletForm, wallet_type_id: e.target.value })} disabled={!!editing}>
                  <option value="">Seleccionar tipo...</option>
                  {walletTypes.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
                </select>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Saldo Inicial ($)</label>
                  <input type="number" className="form-control" value={walletForm.balance} onChange={e => setWalletForm({ ...walletForm, balance: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Umbral de Alerta ($)</label>
                  <input type="number" className="form-control" value={walletForm.alert_threshold} onChange={e => setWalletForm({ ...walletForm, alert_threshold: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-control" value={walletForm.is_active} onChange={e => setWalletForm({ ...walletForm, is_active: e.target.value === 'true' })}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveWallet} disabled={saving}>
                {saving ? <><div className="spinner"></div> Guardando...</> : '✓ Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
