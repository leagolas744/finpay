import { useState, useEffect } from 'react'
import { supabase, formatCurrency } from '../../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import * as XLSX from 'xlsx'

// Feature 2: Colores consistentes en TODOS los gráficos
const CHART_COLORS = {
  recaudo: '#00e676',
  retiro: '#ff4569',
  transferencia: '#00d4ff',
  ajuste: '#ffd740',
  reverso: '#b388ff',
}
const PIE_COLORS = ['#00e676', '#ff4569', '#00d4ff', '#ffd740', '#b388ff', '#ff9100']

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ fontSize: 13, fontWeight: 600, color: p.color }}>
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

const CustomLegend = ({ payload }) => (
  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
    {payload?.map((entry, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
        {entry.value}
      </div>
    ))}
  </div>
)

export default function AdminReports() {
  const [period, setPeriod] = useState('today')
  const [dailyData, setDailyData] = useState([])
  const [commerceRanking, setCommerceRanking] = useState([])
  const [typeDistribution, setTypeDistribution] = useState([])
  const [summary, setSummary] = useState({ totalRecaudo: 0, totalRetiro: 0, totalFees: 0, count: 0 })
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => { fetchReports() }, [period])

  const getDateRange = () => {
    const now = new Date()
    const pad = n => String(n).padStart(2, '0')
    const todayUTC = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`

    if (period === 'today') return { from: todayUTC, to: todayUTC }
    if (period === 'week') {
      const d = new Date(now); d.setUTCDate(d.getUTCDate() - 7)
      return { from: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, to: todayUTC }
    }
    if (period === 'month') {
      return { from: `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-01`, to: todayUTC }
    }
    return { from: todayUTC, to: todayUTC }
  }

  const fetchReports = async () => {
    setLoading(true)
    const { from, to } = getDateRange()
    try {
      const { data: txns, error } = await supabase
        .from('transactions')
        .select('*, commerces!transactions_commerce_id_fkey(name)')
        .eq('status', 'approved')
        .gte('created_at', from + 'T00:00:00.000Z')
        .lte('created_at', to + 'T23:59:59.999Z')

      if (error) { console.error(error); setLoading(false); return }
      if (!txns?.length) {
        setSummary({ totalRecaudo: 0, totalRetiro: 0, totalFees: 0, count: 0 })
        setDailyData([]); setCommerceRanking([]); setTypeDistribution([])
        setLoading(false); return
      }

      // Summary
      const totalRecaudo = txns.filter(t => t.type === 'recaudo').reduce((s, t) => s + Number(t.amount), 0)
      const totalRetiro = txns.filter(t => t.type === 'retiro').reduce((s, t) => s + Number(t.amount), 0)
      const totalFees = txns.reduce((s, t) => s + Number(t.fee || 0), 0)
      setSummary({ totalRecaudo, totalRetiro, totalFees, count: txns.length })

      // Feature 2: Distribución por tipo con colores consistentes
      const byType = {}
      txns.forEach(t => { byType[t.type] = (byType[t.type] || 0) + Number(t.amount) })
      setTypeDistribution(Object.entries(byType).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        fill: CHART_COLORS[name] || '#00d4ff'
      })))

      // Ranking
      const byCommerce = {}
      txns.forEach(t => {
        const name = t.commerces?.name || 'Sin nombre'
        if (!byCommerce[name]) byCommerce[name] = { name, recaudo: 0, retiro: 0, count: 0 }
        if (t.type === 'recaudo') byCommerce[name].recaudo += Number(t.amount)
        if (t.type === 'retiro') byCommerce[name].retiro += Number(t.amount)
        byCommerce[name].count++
      })
      setCommerceRanking(Object.values(byCommerce).sort((a, b) => b.recaudo - a.recaudo).slice(0, 10))

      // Por día
      const byDay = {}
      txns.forEach(t => {
        const day = t.created_at.split('T')[0]
        if (!byDay[day]) byDay[day] = { date: day, recaudo: 0, retiro: 0, fees: 0, count: 0 }
        if (t.type === 'recaudo') byDay[day].recaudo += Number(t.amount)
        if (t.type === 'retiro') byDay[day].retiro += Number(t.amount)
        byDay[day].fees += Number(t.fee || 0)
        byDay[day].count++
      })
      setDailyData(Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
        ...d, date: new Date(d.date + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
      })))
      setLastUpdated(new Date())
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const exportExcel = () => {
    const ws1 = XLSX.utils.json_to_sheet(dailyData.map(d => ({ 'Fecha': d.date, 'Recaudo ($)': d.recaudo, 'Retiro ($)': d.retiro, 'Comisiones ($)': d.fees, 'Transacciones': d.count })))
    const ws2 = XLSX.utils.json_to_sheet(commerceRanking.map((c, i) => ({ 'Ranking': i + 1, 'Comercio': c.name, 'Total Recaudado ($)': c.recaudo, 'Total Retirado ($)': c.retiro, 'Operaciones': c.count })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws1, 'Por Día')
    XLSX.utils.book_append_sheet(wb, ws2, 'Por Comercio')
    XLSX.writeFile(wb, `reporte_${period}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div>
      <div className="section-title">📈 Reportes y Analytics</div>
      <div className="section-sub">
        Análisis financiero del sistema de pagos
        {lastUpdated && <span style={{ marginLeft: 12, fontSize: 11, color: 'var(--accent)' }}>● Actualizado: {lastUpdated.toLocaleTimeString('es-CO')}</span>}
      </div>

      <div className="flex gap-3 mb-6 items-center" style={{ flexWrap: 'wrap' }}>
        <div className="tabs" style={{ flex: 'none', display: 'inline-flex' }}>
          {[['today', '📅 Hoy'], ['week', '📆 Semana'], ['month', '🗓️ Mes']].map(([val, label]) => (
            <button key={val} className={`tab ${period === val ? 'active' : ''}`} onClick={() => setPeriod(val)} style={{ flex: 'none', padding: '8px 20px' }}>{label}</button>
          ))}
        </div>
        <button className="btn btn-secondary" onClick={fetchReports}>🔄 Actualizar</button>
        <button className="btn btn-success" onClick={exportExcel} disabled={!dailyData.length}>📊 Exportar Excel</button>
      </div>

      {/* Summary */}
      <div className="metrics-grid mb-6">
        <div className="metric-card" style={{ '--metric-color': CHART_COLORS.recaudo, '--metric-bg': 'rgba(0,230,118,0.12)' }}>
          <div className="metric-icon">📥</div>
          <div className="metric-value">{formatCurrency(summary.totalRecaudo)}</div>
          <div className="metric-label">Total Recaudado</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': CHART_COLORS.retiro, '--metric-bg': 'rgba(255,69,105,0.12)' }}>
          <div className="metric-icon">📤</div>
          <div className="metric-value">{formatCurrency(summary.totalRetiro)}</div>
          <div className="metric-label">Total Retirado</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': CHART_COLORS.ajuste, '--metric-bg': 'rgba(255,215,64,0.12)' }}>
          <div className="metric-icon">💰</div>
          <div className="metric-value">{formatCurrency(summary.totalFees)}</div>
          <div className="metric-label">Comisiones</div>
        </div>
        <div className="metric-card" style={{ '--metric-color': CHART_COLORS.transferencia, '--metric-bg': 'rgba(0,212,255,0.12)' }}>
          <div className="metric-icon">🔄</div>
          <div className="metric-value">{summary.count}</div>
          <div className="metric-label">Operaciones</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 64 }}>
          <div className="spinner" style={{ margin: '0 auto', width: 40, height: 40 }}></div>
          <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>Cargando reportes...</p>
        </div>
      ) : summary.count === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <h3>Sin datos para este período</h3>
          <p>No hay transacciones aprobadas en el período seleccionado</p>
          <button className="btn btn-primary" onClick={() => setPeriod('month')} style={{ marginTop: 16 }}>Ver este mes</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Feature 2: Bar chart con colores consistentes */}
            <div className="card">
              <div className="card-header"><div className="card-title">📊 Recaudo vs Retiro por Día</div></div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailyData}>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} width={50} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="recaudo" name="Recaudo" fill={CHART_COLORS.recaudo} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="retiro" name="Retiro" fill={CHART_COLORS.retiro} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {/* Leyenda consistente */}
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                {[['Recaudo', CHART_COLORS.recaudo], ['Retiro', CHART_COLORS.retiro]].map(([label, color]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />{label}
                  </div>
                ))}
              </div>
            </div>

            {/* Feature 2: Pie chart con mismos colores */}
            <div className="card">
              <div className="card-header"><div className="card-title">🥧 Por Tipo de Operación</div></div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={typeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={35}>
                    {typeDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.fill || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={v => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              {/* Leyenda manual con colores consistentes */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                {typeDistribution.map((entry, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: entry.fill || PIE_COLORS[i % PIE_COLORS.length] }} />
                    {entry.name}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Commerce Ranking */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">🏆 Ranking de Comercios</div>
              <span className="text-xs text-muted">Top 10 por volumen</span>
            </div>
            <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Comercio</th>
                    <th>Recaudado</th>
                    <th>Retirado</th>
                    <th>Operaciones</th>
                    <th>% del Total</th>
                  </tr>
                </thead>
                <tbody>
                  {commerceRanking.map((c, i) => (
                    <tr key={c.name}>
                      <td>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--bg-card-hover)', color: i < 3 ? '#000' : 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                      </td>
                      <td className="text-primary font-bold">{c.name}</td>
                      <td style={{ color: CHART_COLORS.recaudo, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatCurrency(c.recaudo)}</td>
                      <td style={{ color: CHART_COLORS.retiro, fontFamily: 'var(--font-mono)' }}>{formatCurrency(c.retiro)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{c.count}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: CHART_COLORS.recaudo, borderRadius: 3, width: `${Math.min(100, (c.recaudo / (summary.totalRecaudo || 1)) * 100)}%` }} />
                          </div>
                          <span className="text-xs text-muted">{((c.recaudo / (summary.totalRecaudo || 1)) * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
