import { useState, useEffect } from 'react'
import { supabase, formatCurrency } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

const statusBadge = {
  active:    <span className="badge badge-success">● Activo</span>,
  suspended: <span className="badge badge-warning">⏸ Suspendido</span>,
  blocked:   <span className="badge badge-danger">🔒 Bloqueado</span>,
}

export default function AdminCommerces() {
  const { profile } = useAuth()
  const [commerces, setCommerces] = useState([])
  const [walletsMap, setWalletsMap] = useState({})
  const [walletTypes, setWalletTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [editingCommerce, setEditingCommerce] = useState(null)
  const [selectedCommerce, setSelectedCommerce] = useState(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [deleteInfo, setDeleteInfo] = useState(null) // info de txns al intentar borrar
  const [forceDelete, setForceDelete] = useState(false)

  const [adjustForm, setAdjustForm] = useState({
    operation: 'add', amount: '', concept: '', walletTypeId: ''
  })

  const emptyForm = {
    name: '', address: '', city: '', responsible_name: '',
    responsible_phone: '', responsible_email: '', nit: '',
    daily_limit: 5000000, alert_threshold: 1000000, balance: 0, status: 'active'
  }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel('commerces_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commerces' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commerce_wallets' }, fetchWallets)
      .subscribe()
    return () => channel.unsubscribe()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchCommerces(), fetchWallets(), fetchWalletTypes()])
    setLoading(false)
  }

  const fetchCommerces = async () => {
    const { data } = await supabase.from('commerces').select('*').order('name')
    setCommerces(data || [])
  }

  const fetchWallets = async () => {
    const { data } = await supabase
      .from('commerce_wallets')
      .select('*, wallet_types(name, icon, color)')
      .eq('is_active', true)
    if (data) {
      const map = {}
      data.forEach(w => {
        if (!map[w.commerce_id]) map[w.commerce_id] = []
        map[w.commerce_id].push(w)
      })
      setWalletsMap(map)
    }
  }

  const fetchWalletTypes = async () => {
    const { data } = await supabase.from('wallet_types').select('*').eq('is_active', true).order('name')
    setWalletTypes(data || [])
  }

  const openCreate = () => {
    setEditingCommerce(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  const openEdit = (c) => {
    setEditingCommerce(c)
    setForm({
      name: c.name, address: c.address || '', city: c.city || '',
      responsible_name: c.responsible_name, responsible_phone: c.responsible_phone || '',
      responsible_email: c.responsible_email || '', nit: c.nit || '',
      daily_limit: c.daily_limit, alert_threshold: c.alert_threshold,
      balance: c.balance, status: c.status
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.responsible_name) return setError('Nombre y responsable son obligatorios')
    setSaving(true)
    setError('')
    try {
      if (editingCommerce) {
        const { error } = await supabase.from('commerces').update({
          name: form.name, address: form.address || null, city: form.city || null,
          responsible_name: form.responsible_name,
          responsible_phone: form.responsible_phone || null,
          responsible_email: form.responsible_email || null,
          nit: form.nit || null,
          daily_limit: Number(form.daily_limit),
          alert_threshold: Number(form.alert_threshold),
          status: form.status
        }).eq('id', editingCommerce.id)
        if (error) throw error
        setSuccess('Comercio actualizado')
      } else {
        const { error } = await supabase.from('commerces').insert({
          name: form.name, address: form.address || null, city: form.city || null,
          responsible_name: form.responsible_name,
          responsible_phone: form.responsible_phone || null,
          responsible_email: form.responsible_email || null,
          nit: form.nit || null,
          daily_limit: Number(form.daily_limit),
          alert_threshold: Number(form.alert_threshold),
          balance: Number(form.balance) || 0,
          status: 'active',
          created_by: profile?.id
        })
        if (error) throw error
        setSuccess('Comercio creado correctamente')
      }
      setShowModal(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (commerce) => {
    const newStatus = commerce.status === 'active' ? 'suspended' : 'active'
    await supabase.from('commerces').update({ status: newStatus }).eq('id', commerce.id)
  }

  // ============================================================
  // ELIMINAR COMERCIO
  // ============================================================
  const openDelete = (commerce) => {
    setSelectedCommerce(commerce)
    setDeleteInfo(null)
    setForceDelete(false)
    setError('')
    setShowDeleteModal(true)
  }

  const handleDelete = async (force = false) => {
    setDeleting(true)
    setError('')
    try {
      const { data, error } = await supabase.rpc('delete_commerce', {
        p_commerce_id: selectedCommerce.id,
        p_deleted_by: profile.id,
        p_force: force
      })
      if (error) throw error
      if (!data.success) {
        if (data.requires_force) {
          // Tiene transacciones, mostrar advertencia y opción de forzar
          setDeleteInfo(data)
          setDeleting(false)
          return
        }
        throw new Error(data.error)
      }
      setSuccess(data.message + (data.users_unlinked > 0 ? ` · ${data.users_unlinked} usuario(s) desvinculado(s).` : ''))
      setShowDeleteModal(false)
      setDeleteInfo(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ============================================================
  // AJUSTE DE SALDO
  // ============================================================
  const openAdjust = (commerce) => {
    setSelectedCommerce(commerce)
    setAdjustForm({ operation: 'add', amount: '', concept: '', walletTypeId: '' })
    setError('')
    setShowAdjustModal(true)
  }

  const handleAdjust = async () => {
    const amount = Number(adjustForm.amount)
    if (!amount || amount <= 0) return setError('Ingresa un monto válido mayor a 0')
    if (!adjustForm.concept.trim()) return setError('El concepto es obligatorio')
    setSaving(true)
    setError('')
    try {
      const signedAmount = adjustForm.operation === 'add' ? amount : -amount
      const { data, error } = await supabase.rpc('adjust_balance', {
        p_commerce_id: selectedCommerce.id,
        p_amount: signedAmount,
        p_concept: adjustForm.concept,
        p_performed_by: profile.id,
        p_wallet_type_id: adjustForm.walletTypeId || null
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error)
      const walletName = adjustForm.walletTypeId
        ? walletTypes.find(w => w.id === adjustForm.walletTypeId)?.name || 'Saldo'
        : 'Saldo principal'
      setSuccess(`${walletName} ${adjustForm.operation === 'add' ? 'recargado' : 'descontado'}: ${formatCurrency(amount)}`)
      setShowAdjustModal(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const getTotalBalance = (commerceId, mainBalance) => {
    const wallets = walletsMap[commerceId] || []
    return Number(mainBalance) + wallets.reduce((s, w) => s + Number(w.balance), 0)
  }

  const filtered = commerces.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.responsible_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="section-title">🏪 Gestión de Comercios</div>
      <div className="section-sub">Administra los puntos aliados de la red de pagos</div>

      {success && <div className="alert alert-success mb-4">{success}<button onClick={() => setSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></div>}
      {error && !showModal && !showAdjustModal && !showDeleteModal && <div className="alert alert-error mb-4">{error}<button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></div>}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--accent)' }}>
          <div className="text-xs text-muted">Total Comercios</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>{commerces.length}</div>
        </div>
        <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--green)' }}>
          <div className="text-xs text-muted">Activos</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>{commerces.filter(c => c.status === 'active').length}</div>
        </div>
        <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--yellow)' }}>
          <div className="text-xs text-muted">Suspendidos / Bloqueados</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--yellow)', marginTop: 4 }}>{commerces.filter(c => c.status !== 'active').length}</div>
        </div>
      </div>

      <div className="filters-bar">
        <div className="search-input flex-1">
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" className="form-control" style={{ paddingLeft: 38 }} placeholder="Buscar comercio o responsable..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Nuevo Comercio</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(c => {
            const wallets = walletsMap[c.id] || []
            const totalBalance = getTotalBalance(c.id, c.balance)
            const isExpanded = expandedId === c.id
            return (
              <div key={c.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      👤 {c.responsible_name}
                      {c.city ? ` · 📍 ${c.city}` : ''}
                      {c.nit ? ` · NIT: ${c.nit}` : ''}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Saldo total</div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 18, letterSpacing: -0.5,
                      color: totalBalance > 500000 ? 'var(--green)' : totalBalance > 0 ? 'var(--yellow)' : 'var(--red)'
                    }}>
                      {formatCurrency(totalBalance)}
                    </div>
                    {wallets.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Principal: {formatCurrency(c.balance)}</div>
                    )}
                  </div>

                  <div>{statusBadge[c.status] || statusBadge.active}</div>

                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary text-xs" style={{ padding: '5px 10px' }} onClick={() => openEdit(c)}>✏️ Editar</button>
                    <button className="btn btn-warning text-xs" style={{ padding: '5px 10px' }} onClick={() => openAdjust(c)}>💰 Saldo</button>
                    <button
                      className={`btn text-xs ${c.status === 'active' ? 'btn-danger' : 'btn-success'}`}
                      style={{ padding: '5px 10px' }}
                      onClick={() => handleToggleStatus(c)}
                    >
                      {c.status === 'active' ? '⏸' : '▶'}
                    </button>
                    {wallets.length > 0 && (
                      <button className="btn btn-secondary text-xs" style={{ padding: '5px 10px' }} onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                        {isExpanded ? '▲' : '▼'} ({wallets.length})
                      </button>
                    )}
                    {/* ELIMINAR */}
                    <button className="btn btn-danger text-xs" style={{ padding: '5px 10px' }} onClick={() => openDelete(c)}>
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Saldos expandidos */}
                {isExpanded && wallets.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', background: 'var(--bg-secondary)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Saldos por tipo</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                      <div style={{ padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>💵 Principal</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>{formatCurrency(c.balance)}</div>
                      </div>
                      {wallets.map(w => {
                        const isLow = Number(w.balance) < Number(w.alert_threshold)
                        return (
                          <div key={w.id} style={{ padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${isLow ? 'var(--red)' : w.wallet_types?.color || 'var(--green)'}` }}>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                              {w.wallet_types?.icon} {w.wallet_types?.name}{isLow && ' ⚠️'}
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: isLow ? 'var(--red)' : w.wallet_types?.color || 'var(--green)' }}>
                              {formatCurrency(w.balance)}
                            </div>
                          </div>
                        )
                      })}
                      <div style={{ padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--purple)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>🔢 Total</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--purple)' }}>{formatCurrency(totalBalance)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="empty-state">
              <div style={{ fontSize: 36 }}>🏪</div>
              <h3>No hay comercios</h3>
              <p>Crea el primero con el botón de arriba</p>
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          CREATE / EDIT MODAL
      ============================================================ */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="modal-title">{editingCommerce ? '✏️ Editar Comercio' : '🏪 Nuevo Comercio'}</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error mb-4">{error}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Datos obligatorios</div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Nombre del Comercio *</label>
                  <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Punto Pago Norte" />
                </div>
                <div className="form-group">
                  <label className="form-label">Responsable *</label>
                  <input className="form-control" value={form.responsible_name} onChange={e => setForm({ ...form, responsible_name: e.target.value })} placeholder="Nombre completo" />
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '12px 0 10px' }}>Datos opcionales</div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">NIT</label>
                  <input className="form-control" value={form.nit} onChange={e => setForm({ ...form, nit: e.target.value })} placeholder="900.123.456-1" />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-control" value={form.responsible_phone} onChange={e => setForm({ ...form, responsible_phone: e.target.value })} placeholder="300 000 0000" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-control" value={form.responsible_email} onChange={e => setForm({ ...form, responsible_email: e.target.value })} placeholder="correo@comercio.com" />
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Ciudad</label>
                  <input className="form-control" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Medellín" />
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <input className="form-control" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Calle 1 #2-3" />
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '12px 0 10px' }}>Configuración financiera</div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Límite Diario ($)</label>
                  <input type="number" className="form-control" value={form.daily_limit} onChange={e => setForm({ ...form, daily_limit: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Umbral de Alerta ($)</label>
                  <input type="number" className="form-control" value={form.alert_threshold} onChange={e => setForm({ ...form, alert_threshold: e.target.value })} />
                </div>
              </div>
              {!editingCommerce && (
                <div className="form-group">
                  <label className="form-label">Saldo Inicial ($)</label>
                  <input type="number" className="form-control" value={form.balance} onChange={e => setForm({ ...form, balance: e.target.value })} placeholder="0" />
                </div>
              )}
              {editingCommerce && (
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <select className="form-control" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Activo</option>
                    <option value="suspended">Suspendido</option>
                    <option value="blocked">Bloqueado</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name || !form.responsible_name}>
                {saving ? <><div className="spinner"></div> Guardando...</> : '✓ Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          ADJUST BALANCE MODAL
      ============================================================ */}
      {showAdjustModal && selectedCommerce && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdjustModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">💰 Ajustar Saldo — {selectedCommerce.name}</div>
              <button onClick={() => setShowAdjustModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error mb-4">{error}</div>}
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Saldos actuales</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>💵 Principal</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>{formatCurrency(selectedCommerce.balance)}</div>
                  </div>
                  {(walletsMap[selectedCommerce.id] || []).map(w => (
                    <div key={w.id}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{w.wallet_types?.icon} {w.wallet_types?.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: w.wallet_types?.color || 'var(--green)' }}>{formatCurrency(w.balance)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">¿A qué saldo aplicar?</label>
                <select className="form-control" value={adjustForm.walletTypeId} onChange={e => setAdjustForm({ ...adjustForm, walletTypeId: e.target.value })}>
                  <option value="">💵 Saldo Principal</option>
                  {(walletsMap[selectedCommerce.id] || []).map(w => (
                    <option key={w.wallet_type_id} value={w.wallet_type_id}>
                      {w.wallet_types?.icon} {w.wallet_types?.name} — {formatCurrency(w.balance)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Operación</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button type="button" className={`btn btn-lg ${adjustForm.operation === 'add' ? 'btn-success' : 'btn-secondary'}`} onClick={() => setAdjustForm({ ...adjustForm, operation: 'add' })} style={{ justifyContent: 'center' }}>
                    ➕ Cargar saldo
                  </button>
                  <button type="button" className={`btn btn-lg ${adjustForm.operation === 'subtract' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setAdjustForm({ ...adjustForm, operation: 'subtract' })} style={{ justifyContent: 'center' }}>
                    ➖ Descontar saldo
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Monto ($)</label>
                <input type="number" className="form-control" value={adjustForm.amount} onChange={e => setAdjustForm({ ...adjustForm, amount: e.target.value })} placeholder="0" min="1"
                  style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'right' }} />
                {adjustForm.amount > 0 && <div style={{ textAlign: 'right', marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>= {formatCurrency(adjustForm.amount)}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Concepto *</label>
                <input className="form-control" value={adjustForm.concept} onChange={e => setAdjustForm({ ...adjustForm, concept: e.target.value })} placeholder={adjustForm.operation === 'add' ? 'Recarga de saldo...' : 'Descuento, ajuste contable...'} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdjustModal(false)}>Cancelar</button>
              <button className={`btn ${adjustForm.operation === 'add' ? 'btn-success' : 'btn-danger'}`} onClick={handleAdjust} disabled={saving || !adjustForm.amount || !adjustForm.concept}>
                {saving ? <><div className="spinner"></div></> : adjustForm.operation === 'add' ? `➕ Cargar ${formatCurrency(adjustForm.amount || 0)}` : `➖ Descontar ${formatCurrency(adjustForm.amount || 0)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          DELETE MODAL
      ============================================================ */}
      {showDeleteModal && selectedCommerce && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowDeleteModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">🗑️ Eliminar Comercio</div>
              <button onClick={() => setShowDeleteModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error mb-4">{error}</div>}

              {/* Sin transacciones: confirmación simple */}
              {!deleteInfo && (
                <>
                  <div className="alert alert-error mb-4">
                    ⚠️ Esta acción es <strong>permanente e irreversible</strong>.
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{selectedCommerce.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      <div>👤 {selectedCommerce.responsible_name}</div>
                      <div style={{ marginTop: 4 }}>💰 Saldo principal: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{formatCurrency(selectedCommerce.balance)}</span></div>
                      {(walletsMap[selectedCommerce.id] || []).length > 0 && (
                        <div style={{ marginTop: 4 }}>💼 {(walletsMap[selectedCommerce.id] || []).length} tipo(s) de saldo adicional</div>
                      )}
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Se eliminarán: saldos, wallets y alertas asociadas. Los usuarios serán desvinculados del comercio pero <strong>no serán eliminados</strong>.
                  </p>
                </>
              )}

              {/* Con transacciones: advertencia fuerte */}
              {deleteInfo && (
                <>
                  <div className="alert alert-warning mb-4">
                    🚨 Este comercio tiene <strong>{deleteInfo.txn_count} transacciones</strong> registradas en el historial.
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                    Las transacciones <strong>no se eliminarán</strong> (se conservan para auditoría), pero quedarán sin comercio activo asociado. ¿Deseas continuar de todas formas?
                  </p>
                  <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(255,69,105,0.3)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 13, color: 'var(--red)' }}>
                    ⚠️ Confirmar eliminación forzada de <strong>{selectedCommerce.name}</strong>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancelar</button>
              {!deleteInfo ? (
                <button className="btn btn-danger" onClick={() => handleDelete(false)} disabled={deleting}>
                  {deleting ? <><div className="spinner"></div> Eliminando...</> : '🗑️ Eliminar Comercio'}
                </button>
              ) : (
                <button className="btn btn-danger" onClick={() => handleDelete(true)} disabled={deleting}>
                  {deleting ? <><div className="spinner"></div> Eliminando...</> : '🗑️ Sí, eliminar de todas formas'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
