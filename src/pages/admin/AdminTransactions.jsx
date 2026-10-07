import { useState, useEffect } from 'react'
import { supabase, formatCurrency, formatDate } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import * as XLSX from 'xlsx'

// Fix: ajuste ahora es reversible y editable
const typeConfig = {
  recaudo:      { label: 'Recaudo',      color: '#00e676', bg: 'rgba(0,230,118,0.12)',     icon: '📥', canReverse: true,  canEdit: true  },
  retiro:       { label: 'Retiro',       color: '#ff4569', bg: 'rgba(255,69,105,0.12)',    icon: '📤', canReverse: true,  canEdit: true  },
  transferencia:{ label: 'Transfer.',    color: '#00d4ff', bg: 'rgba(0,212,255,0.12)',     icon: '🔁', canReverse: false, canEdit: true  },
  ajuste:       { label: 'Ajuste',       color: '#ffd740', bg: 'rgba(255,215,64,0.12)',    icon: '⚙️', canReverse: true,  canEdit: true  },
  reverso:      { label: 'Reverso',      color: '#b388ff', bg: 'rgba(179,136,255,0.12)',   icon: '↩️', canReverse: false, canEdit: false },
}

const statusConfig = {
  approved: <span className="badge badge-success">✓ Aprobado</span>,
  rejected: <span className="badge badge-danger">✗ Rechazado</span>,
  reversed: <span className="badge badge-muted">↩ Revertido</span>,
  pending:  <span className="badge badge-warning">⏳ Pendiente</span>,
}

export default function AdminTransactions() {
  const { profile } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ type: '', status: '', commerce: '', dateFrom: '', dateTo: '', search: '' })
  const [commerces, setCommerces] = useState([])
  const [showReverseModal, setShowReverseModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedTxn, setSelectedTxn] = useState(null)
  const [reverseReason, setReverseReason] = useState('')
  const [editForm, setEditForm] = useState({ concept: '', client_name: '' })
  const [reversing, setReversing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  useEffect(() => { fetchCommerces(); fetchTransactions() }, [filters, page])

  const fetchCommerces = async () => {
    const { data } = await supabase.from('commerces').select('id, name').order('name')
    setCommerces(data || [])
  }

  const fetchTransactions = async () => {
    setLoading(true)
    let query = supabase
      .from('transactions')
      .select('*, commerces!transactions_commerce_id_fkey(name), profiles!performed_by(full_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filters.type)     query = query.eq('type', filters.type)
    if (filters.status)   query = query.eq('status', filters.status)
    if (filters.commerce) query = query.eq('commerce_id', filters.commerce)
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00.000Z')
    if (filters.dateTo)   query = query.lte('created_at', filters.dateTo + 'T23:59:59.999Z')
    if (filters.search)   query = query.or(`transaction_code.ilike.%${filters.search}%,client_document.ilike.%${filters.search}%`)

    const { data } = await query
    setTransactions(data || [])
    setLoading(false)
  }

  const handleReverse = async () => {
  setReversing(true)
    try {
      const { data, error } = await supabase.rpc('reverse_transaction', {
        p_transaction_id: selectedTxn.id,
        p_reversed_by: profile.id,
        p_reason: reverseReason
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error)
      setSuccess(`Transacción ${selectedTxn.transaction_code} revertida correctamente`)
      setShowReverseModal(false)
      setReverseReason('')
      fetchTransactions()
    } catch (err) { alert(err.message) }
    finally { setReversing(false) }
  }

  const openEdit = (txn) => {
    setSelectedTxn(txn)
    setEditForm({ concept: txn.concept || '', client_name: txn.client_name || '' })
    setShowEditModal(true)
  }

  const handleEdit = async () => {
    setSaving(true)
    try {
      const { data, error } = await supabase.rpc('edit_transaction', {
        p_transaction_id: selectedTxn.id,
        p_edited_by: profile.id,
        p_concept: editForm.concept || null,
        p_client_name: editForm.client_name || null,
        p_flag_reason: null
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error)
      setSuccess(`Transacción ${selectedTxn.transaction_code} actualizada`)
      setShowEditModal(false)
      fetchTransactions()
    } catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  const exportToExcel = () => {
    const rows = transactions.map(t => ({
      'Código': t.transaction_code, 'Tipo': typeConfig[t.type]?.label || t.type,
      'Comercio': t.commerces?.name || '', 'Documento': t.client_document,
      'Cliente': t.client_name || '', 'Concepto': t.concept || '',
      'Valor': Number(t.amount), 'Comisión': Number(t.fee || 0),
      'Estado': t.status, 'Operador': t.profiles?.full_name || '',
      'Fecha': formatDate(t.created_at),
      'Saldo Antes': Number(t.balance_before || 0),
      'Saldo Después': Number(t.balance_after || 0),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transacciones')
    XLSX.writeFile(wb, `transacciones_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const setFilter = (key, val) => { setFilters(f => ({ ...f, [key]: val })); setPage(0) }

  return (
    <div>
      <div className="section-title">💸 Transacciones</div>
      <div className="section-sub">Registro completo de todas las operaciones del sistema</div>

      {success && (
        <div className="alert alert-success mb-4">{success}
          <button onClick={() => setSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-4">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <div>
            <label className="form-label">Tipo</label>
            <select className="form-control" value={filters.type} onChange={e => setFilter('type', e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(typeConfig).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Estado</label>
            <select className="form-control" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
              <option value="">Todos</option>
              <option value="approved">✓ Aprobado</option>
              <option value="reversed">↩ Revertido</option>
              <option value="rejected">✗ Rechazado</option>
            </select>
          </div>
          <div>
            <label className="form-label">Comercio</label>
            <select className="form-control" value={filters.commerce} onChange={e => setFilter('commerce', e.target.value)}>
              <option value="">Todos</option>
              {commerces.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Desde</label>
            <input type="date" className="form-control" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Hasta</label>
            <input type="date" className="form-control" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} />
          </div>
          <div>
            <label className="form-label">Buscar</label>
            <input className="form-control" placeholder="Código o doc..." value={filters.search} onChange={e => setFilter('search', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 mt-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => { setFilters({ type: '', status: '', commerce: '', dateFrom: '', dateTo: '', search: '' }); setPage(0) }}>🔄 Limpiar</button>
          <button className="btn btn-success" onClick={exportToExcel}>📊 Excel</button>
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Comercio</th>
              <th>Documento</th>
              <th>Cliente / Concepto</th>
              <th>Valor</th>
              <th>Saldo Post.</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }}></div></td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No se encontraron transacciones</td></tr>
            ) : transactions.map(txn => {
              const type = typeConfig[txn.type] || { label: txn.type, color: 'var(--text-muted)', bg: 'transparent', icon: '❓', canReverse: false, canEdit: false }
              return (
                <tr key={txn.id} style={{ opacity: txn.status === 'reversed' ? 0.55 : 1 }}>
                  <td><span className="mono text-accent" style={{ fontSize: 11 }}>{txn.transaction_code}</span></td>
                  <td><span className="badge" style={{ background: type.bg, color: type.color }}>{type.icon} {type.label}</span></td>
                  <td className="text-primary" style={{ fontSize: 12 }}>{txn.commerces?.name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{txn.client_document}</td>
                  <td style={{ fontSize: 12 }}>
                    <div style={{ color: 'var(--text-secondary)' }}>{txn.client_name || '—'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{txn.concept || ''}</div>
                    {txn.edit_history?.length > 0 && <span style={{ fontSize: 10, color: 'var(--yellow)' }}>✏️ editada</span>}
                  </td>
                  <td style={{
                    fontFamily: 'var(--font-mono)', fontWeight: 700,
                    color: txn.type === 'recaudo' ? '#00e676' : txn.type === 'retiro' ? '#ff4569' : 'var(--text-primary)'
                  }}>
                    {txn.type === 'retiro' ? '−' : txn.type === 'recaudo' ? '+' : ''}{formatCurrency(txn.amount)}
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatCurrency(txn.balance_after)}</td>
                  <td>{statusConfig[txn.status]}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(txn.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {txn.status !== 'reversed' && type.canEdit && (
                        <button className="btn btn-secondary" style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => openEdit(txn)} title="Editar">✏️</button>
                      )}
                      {/* Fix: ajuste ahora aparece aquí también */}
                      {txn.status === 'approved' && type.canReverse && (
                        <button className="btn btn-danger" style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => { setSelectedTxn(txn); setShowReverseModal(true) }} title="Revertir">↩</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 items-center mt-4" style={{ justifyContent: 'center' }}>
        <button className="btn btn-secondary" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Anterior</button>
        <span className="text-sm text-muted">Página {page + 1}</span>
        <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={transactions.length < PAGE_SIZE}>Siguiente →</button>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedTxn && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowEditModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">✏️ Editar Transacción</div>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info mb-4" style={{ fontSize: 12 }}>
                ℹ️ Solo puedes editar el concepto y nombre del cliente. El monto no se modifica por seguridad.
              </div>
              <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 14, fontSize: 12 }}>
                <div className="flex justify-between mb-1"><span className="text-muted">Código:</span><span className="mono text-accent">{selectedTxn.transaction_code}</span></div>
                <div className="flex justify-between mb-1"><span className="text-muted">Tipo:</span><span className="badge" style={{ background: typeConfig[selectedTxn.type]?.bg, color: typeConfig[selectedTxn.type]?.color }}>{typeConfig[selectedTxn.type]?.label}</span></div>
                <div className="flex justify-between"><span className="text-muted">Monto:</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{formatCurrency(selectedTxn.amount)}</span></div>
              </div>
              <div className="form-group">
                <label className="form-label">Nombre del Cliente</label>
                <input className="form-control" value={editForm.client_name} onChange={e => setEditForm({ ...editForm, client_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Concepto</label>
                <textarea className="form-control" rows={3} value={editForm.concept} onChange={e => setEditForm({ ...editForm, concept: e.target.value })} style={{ resize: 'none' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleEdit} disabled={saving}>
                {saving ? <><div className="spinner"></div></> : '✓ Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Modal */}
      {showReverseModal && selectedTxn && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowReverseModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">↩ Revertir Transacción</div>
              <button onClick={() => setShowReverseModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="alert alert-warning mb-4">
                ⚠️ Revertir un <strong>{typeConfig[selectedTxn.type]?.label}</strong> deshará el efecto en el saldo del comercio y será visible en tiempo real en su panel.
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                <div className="flex justify-between mb-2"><span className="text-muted text-sm">Código:</span><span className="mono text-accent">{selectedTxn.transaction_code}</span></div>
                <div className="flex justify-between mb-2"><span className="text-muted text-sm">Tipo:</span><span className="badge" style={{ background: typeConfig[selectedTxn.type]?.bg, color: typeConfig[selectedTxn.type]?.color }}>{typeConfig[selectedTxn.type]?.label}</span></div>
                <div className="flex justify-between"><span className="text-muted text-sm">Monto:</span><span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 18 }}>{formatCurrency(selectedTxn.amount)}</span></div>
              </div>
              <div className="form-group">
                <label className="form-label">Motivo de la reversión *</label>
                <textarea className="form-control" rows={3} placeholder="Motivo de la reversión (opcional)" value={reverseReason} onChange={e => setReverseReason(e.target.value)} style={{ resize: 'none' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowReverseModal(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleReverse} disabled={reversing}>
                {reversing ? <><div className="spinner"></div> Revirtiendo...</> : '↩ Confirmar Reversión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
