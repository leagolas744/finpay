import { useState, useEffect } from 'react'
import { supabase, formatCurrency, formatDate } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import * as XLSX from 'xlsx'

const typeConfig = {
  recaudo: { label: 'Recaudo', color: 'var(--green)', bg: 'var(--green-dim)', icon: '📥' },
  retiro: { label: 'Retiro', color: 'var(--red)', bg: 'var(--red-dim)', icon: '📤' },
  transferencia: { label: 'Transfer.', color: 'var(--accent)', bg: 'var(--accent-dim)', icon: '🔁' },
  ajuste: { label: 'Ajuste', color: 'var(--yellow)', bg: 'var(--yellow-dim)', icon: '⚙️' },
  reverso: { label: 'Reverso', color: 'var(--purple)', bg: 'var(--purple-dim)', icon: '↩️' },
}

const statusBadge = {
  approved: <span className="badge badge-success">✓ Aprobado</span>,
  rejected: <span className="badge badge-danger">✗ Rechazado</span>,
  reversed: <span className="badge badge-muted">↩ Revertido</span>,
  pending: <span className="badge badge-warning">⏳ Pendiente</span>,
}

export default function CommerceHistory() {
  const { profile } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ type: '', dateFrom: '', dateTo: '', search: '' })
  const [summary, setSummary] = useState({ recaudo: 0, retiro: 0, count: 0 })
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  const commerceId = profile?.commerces?.id

  useEffect(() => { if (commerceId) fetchTransactions() }, [filters, page, commerceId])

  const fetchTransactions = async () => {
    setLoading(true)

    let query = supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('commerce_id', commerceId)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filters.type) query = query.eq('type', filters.type)
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    if (filters.search) query = query.or(`transaction_code.ilike.%${filters.search}%,client_document.ilike.%${filters.search}%`)

    const { data } = await query
    setTransactions(data || [])

    // Summary for filtered period
    if (data) {
      setSummary({
        recaudo: data.filter(t => t.type === 'recaudo' && t.status === 'approved').reduce((s, t) => s + Number(t.amount), 0),
        retiro: data.filter(t => t.type === 'retiro' && t.status === 'approved').reduce((s, t) => s + Number(t.amount), 0),
        count: data.length
      })
    }

    setLoading(false)
  }

  const exportExcel = async () => {
    // Fetch all records for export (no pagination)
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('commerce_id', commerceId)
      .order('created_at', { ascending: false })

    if (filters.type) query = query.eq('type', filters.type)
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom)
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')

    const { data } = await query

    const rows = (data || []).map(t => ({
      'Código': t.transaction_code,
      'Tipo': typeConfig[t.type]?.label || t.type,
      'Documento Cliente': t.client_document,
      'Nombre Cliente': t.client_name || '',
      'Valor ($)': Number(t.amount),
      'Comisión ($)': Number(t.fee || 0),
      'Concepto': t.concept || '',
      'Estado': t.status,
      'Saldo Antes ($)': Number(t.balance_before || 0),
      'Saldo Después ($)': Number(t.balance_after || 0),
      'Fecha y Hora': formatDate(t.created_at),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    // Column widths
    ws['!cols'] = [
      { wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 22 },
      { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 12 },
      { wch: 16 }, { wch: 16 }, { wch: 22 }
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Historial')

    // Summary sheet
    const summaryData = [
      { 'Resumen': 'Total Recaudado', 'Valor': rows.filter(r => r['Tipo'] === 'Recaudo').reduce((s, r) => s + r['Valor ($)'], 0) },
      { 'Resumen': 'Total Retirado', 'Valor': rows.filter(r => r['Tipo'] === 'Retiro').reduce((s, r) => s + r['Valor ($)'], 0) },
      { 'Resumen': 'Total Operaciones', 'Valor': rows.length },
    ]
    const ws2 = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen')

    XLSX.writeFile(wb, `historial_${profile?.commerces?.name?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div>
      <div className="section-title">📋 Historial de Operaciones</div>
      <div className="section-sub">Registro completo de transacciones de {profile?.commerces?.name}</div>

      {/* Summary mini-cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--green)' }}>
          <div className="text-xs text-muted">Recaudado (filtro)</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--green)', marginTop: 4 }}>{formatCurrency(summary.recaudo)}</div>
        </div>
        <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--red)' }}>
          <div className="text-xs text-muted">Retirado (filtro)</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--red)', marginTop: 4 }}>{formatCurrency(summary.retiro)}</div>
        </div>
        <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--accent)' }}>
          <div className="text-xs text-muted">Operaciones</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--accent)', marginTop: 4 }}>{summary.count}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <div>
            <label className="form-label">Tipo</label>
            <select className="form-control" value={filters.type} onChange={e => { setFilters({ ...filters, type: e.target.value }); setPage(0) }}>
              <option value="">Todos</option>
              <option value="recaudo">Recaudo</option>
              <option value="retiro">Retiro</option>
              <option value="transferencia">Transferencia</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </div>
          <div>
            <label className="form-label">Desde</label>
            <input type="date" className="form-control" value={filters.dateFrom} onChange={e => { setFilters({ ...filters, dateFrom: e.target.value }); setPage(0) }} />
          </div>
          <div>
            <label className="form-label">Hasta</label>
            <input type="date" className="form-control" value={filters.dateTo} onChange={e => { setFilters({ ...filters, dateTo: e.target.value }); setPage(0) }} />
          </div>
          <div>
            <label className="form-label">Buscar</label>
            <input className="form-control" placeholder="Código o documento..." value={filters.search} onChange={e => { setFilters({ ...filters, search: e.target.value }); setPage(0) }} />
          </div>
        </div>
        <div className="flex gap-2 mt-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => { setFilters({ type: '', dateFrom: '', dateTo: '', search: '' }); setPage(0) }}>🔄 Limpiar</button>
          <button className="btn btn-success" onClick={exportExcel}>📊 Exportar .xlsx</button>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Documento</th>
              <th>Cliente</th>
              <th>Valor</th>
              <th>Saldo Después</th>
              <th>Estado</th>
              <th>Fecha y Hora</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }}></div></td></tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div style={{ fontSize: 36 }}>📋</div>
                    <h3>Sin transacciones</h3>
                    <p>No se encontraron operaciones con los filtros aplicados</p>
                  </div>
                </td>
              </tr>
            ) : transactions.map(txn => {
              const type = typeConfig[txn.type] || { label: txn.type, color: 'var(--text-muted)', bg: 'transparent', icon: '' }
              return (
                <tr key={txn.id} style={{ opacity: txn.status === 'reversed' ? 0.55 : 1 }}>
                  <td><span className="mono text-accent" style={{ fontSize: 11 }}>{txn.transaction_code}</span></td>
                  <td>
                    <span className="badge" style={{ background: type.bg, color: type.color }}>
                      {type.icon} {type.label}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 13 }}>{txn.client_document}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{txn.client_name || '—'}</td>
                  <td style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: txn.type === 'recaudo' ? 'var(--green)' : txn.type === 'retiro' ? 'var(--red)' : 'var(--text-primary)'
                  }}>
                    {txn.type === 'retiro' ? '−' : txn.type === 'recaudo' ? '+' : ''}{formatCurrency(txn.amount)}
                  </td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {formatCurrency(txn.balance_after)}
                  </td>
                  <td>{statusBadge[txn.status] || statusBadge.approved}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(txn.created_at).toLocaleString('es-CO', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex gap-2 items-center mt-4" style={{ justifyContent: 'center' }}>
        <button className="btn btn-secondary" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || loading}>
          ← Anterior
        </button>
        <span className="text-sm text-muted">Página {page + 1}</span>
        <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={transactions.length < PAGE_SIZE || loading}>
          Siguiente →
        </button>
      </div>
    </div>
  )
}
