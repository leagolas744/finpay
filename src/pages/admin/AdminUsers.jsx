import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

const roleBadge = {
  admin:    <span className="badge badge-info">👑 Admin</span>,
  commerce: <span className="badge badge-success">🏪 Comercio</span>,
}

export default function AdminUsers() {
  const { profile: currentProfile } = useAuth()
  const [users, setUsers] = useState([])
  const [commerces, setCommerces] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [form, setForm] = useState({
    full_name: '', role: 'commerce', commerce_id: '',
    is_active: true, new_password: '', confirm_password: '',
  })

  useEffect(() => {
    fetchUsers()
    fetchCommerces()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('get_all_users')

    if (rpcError) {
      console.error('RPC error:', rpcError)
      // Fallback a profiles
      const { data: fb } = await supabase
        .from('profiles')
        .select('*, commerces(name, status)')
        .order('created_at', { ascending: false })
      setUsers((fb || []).map(u => ({ ...u, has_profile: true })))
      setLoading(false)
      return
    }

    // Obtener comercios asociados
    const ids = [...new Set((data || []).filter(u => u.commerce_id).map(u => u.commerce_id))]
    let cMap = {}
    if (ids.length > 0) {
      const { data: cData } = await supabase
        .from('commerces').select('id, name, status').in('id', ids)
      ;(cData || []).forEach(c => { cMap[c.id] = c })
    }

    setUsers((data || []).map(u => ({ ...u, commerces: cMap[u.commerce_id] || null })))
    setLoading(false)
  }

  const fetchCommerces = async () => {
    const { data } = await supabase.from('commerces').select('id, name, status').order('name')
    setCommerces(data || [])
  }

  const openEdit = (user) => {
    setSelectedUser(user)
    setForm({
      full_name: user.full_name || '',
      role: user.role || 'commerce',
      commerce_id: user.commerce_id || '',
      is_active: user.is_active !== false,
      new_password: '',
      confirm_password: '',
    })
    setError('')
    setSuccess('')
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      if (form.new_password) {
        if (form.new_password.length < 6) {
          setError('La contraseña debe tener al menos 6 caracteres')
          setSaving(false)
          return
        }
        if (form.new_password !== form.confirm_password) {
          setError('Las contraseñas no coinciden')
          setSaving(false)
          return
        }
      }

      // Upsert del perfil
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_upsert_profile', {
  p_user_id: selectedUser.id,
  p_email: selectedUser.email,
  p_full_name: form.full_name,
  p_role: form.role,
  p_commerce_id: form.role === 'admin' ? null : (form.commerce_id || null),
  p_is_active: form.is_active
})

if (rpcError) throw rpcError
if (!rpcData?.success) throw new Error(rpcData?.error || 'Error al actualizar')

      // Cambiar contraseña si se ingresó una
      if (form.new_password) {
        const session = await supabase.auth.getSession()
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/admin/users/${selectedUser.id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${session.data.session?.access_token}`
            },
            body: JSON.stringify({ password: form.new_password })
          }
        )
        if (!res.ok) {
          setSuccess('Perfil guardado. Para cambiar la contraseña ve a Supabase → Authentication → Users → busca el usuario → Reset password.')
          fetchUsers()
          setTimeout(() => setShowModal(false), 3000)
          setSaving(false)
          return
        }
      }

      setSuccess('Usuario actualizado correctamente')
      fetchUsers()
      setTimeout(() => setShowModal(false), 1000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (user) => {
    if (user.id === currentProfile?.id) return
    await supabase.rpc('admin_upsert_profile', {
      p_user_id: user.id,
      p_email: user.email,
      p_full_name: user.full_name || '',
      p_role: user.role,
      p_commerce_id: user.commerce_id || null,
      p_is_active: user.is_active === false
    })
    fetchUsers()
  }

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    const matchRole = !filterRole || u.role === filterRole
    return matchSearch && matchRole
  })

  return (
    <div>
      <div className="section-title">👥 Gestión de Usuarios</div>
      <div className="section-sub">Todos los usuarios registrados en el sistema</div>

      {success && !showModal && (
        <div className="alert alert-success mb-4">{success}
          <button onClick={() => setSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}
      {error && !showModal && (
        <div className="alert alert-error mb-4">{error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          ['Total', users.length, 'var(--accent)'],
          ['Admins', users.filter(u => u.role === 'admin').length, 'var(--purple)'],
          ['Comercios', users.filter(u => u.role === 'commerce').length, 'var(--green)'],
          ['Activos', users.filter(u => u.is_active !== false).length, 'var(--yellow)'],
        ].map(([label, count, color]) => (
          <div key={label} className="card" style={{ padding: 14, borderLeft: `3px solid ${color}` }}>
            <div className="text-xs text-muted">{label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 4 }}>{count}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="filters-bar mb-4">
        <div className="search-input" style={{ flex: 1 }}>
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" className="form-control" style={{ paddingLeft: 38 }} placeholder="Buscar por nombre o email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-control" style={{ width: 180 }} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">Todos los roles</option>
          <option value="admin">👑 Admin</option>
          <option value="commerce">🏪 Comercio</option>
        </select>
        <button className="btn btn-secondary" onClick={fetchUsers}>🔄</button>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Comercio</th>
              <th>Estado</th>
              <th>Último acceso</th>
              <th>Registrado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>
                <div className="spinner" style={{ margin: '0 auto' }}></div>
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                No se encontraron usuarios
              </td></tr>
            ) : filtered.map(user => {
              const isMe = user.id === currentProfile?.id
              return (
                <tr key={user.id} style={{ opacity: user.is_active === false ? 0.5 : 1 }}>
                  <td>
                    <div className="flex gap-2 items-center">
                      <div style={{
                        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                        background: user.role === 'admin'
                          ? 'linear-gradient(135deg, #00d4ff, #0066ff)'
                          : 'linear-gradient(135deg, #00e676, #008844)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: '#fff'
                      }}>
                        {(user.full_name || user.email || '?')
                          .split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                          {user.full_name || <span style={{ color: 'var(--text-muted)' }}>Sin nombre</span>}
                          {isMe && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)' }}>(tú)</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</td>
                  <td>{roleBadge[user.role] || <span className="badge badge-muted">{user.role}</span>}</td>
                  <td>
                    {user.commerces
                      ? <div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user.commerces.name}</div>
                          <span className={`badge ${user.commerces.status === 'active' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: 10 }}>
                            {user.commerces.status}
                          </span>
                        </div>
                      : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                    }
                  </td>
                  <td>
                    {user.is_active !== false
                      ? <span className="badge badge-success">● Activo</span>
                      : <span className="badge badge-danger">● Inactivo</span>
                    }
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {user.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : 'Nunca'
                    }
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {user.created_at
                      ? new Date(user.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'
                    }
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary text-xs" style={{ padding: '5px 10px' }} onClick={() => openEdit(user)}>
                        ✏️ Editar
                      </button>
                      {!isMe && (
                        <button
                          className={`btn text-xs ${user.is_active !== false ? 'btn-warning' : 'btn-success'}`}
                          style={{ padding: '5px 10px' }}
                          onClick={() => handleToggleActive(user)}
                        >
                          {user.is_active !== false ? '⏸' : '▶'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)' }}>
        💡 Para <strong>crear nuevos usuarios</strong> ve a <strong>Supabase → Authentication → Users → Add user</strong>, luego haz clic en 🔄 para actualizar la lista.
      </div>

      {/* MODAL */}
      {showModal && selectedUser && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <div className="modal-title">✏️ Editar Usuario</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error mb-4">{error}</div>}
              {success && <div className="alert alert-success mb-4">{success}</div>}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--accent), #0066ff)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700, color: '#fff'
                }}>
                  {(selectedUser.full_name || selectedUser.email || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedUser.full_name || 'Sin nombre'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>📧 {selectedUser.email}</div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Nombre Completo</label>
                <input className="form-control" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Nombre y apellidos" />
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Rol</label>
                  <select className="form-control" value={form.role} onChange={e => setForm({ ...form, role: e.target.value, commerce_id: '' })}>
                    <option value="admin">👑 Administrador</option>
                    <option value="commerce">🏪 Comercio</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <select className="form-control" value={form.is_active.toString()} onChange={e => setForm({ ...form, is_active: e.target.value === 'true' })}>
                    <option value="true">● Activo</option>
                    <option value="false">● Inactivo</option>
                  </select>
                </div>
              </div>
              {form.role === 'commerce' && (
                <div className="form-group">
                  <label className="form-label">Comercio Asignado</label>
                  <select className="form-control" value={form.commerce_id} onChange={e => setForm({ ...form, commerce_id: e.target.value })}>
                    <option value="">Sin comercio asignado</option>
                    {commerces.map(c => (
                      <option key={c.id} value={c.id}>{c.name} {c.status !== 'active' ? `(${c.status})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                  🔐 Cambiar Contraseña
                  <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', marginLeft: 8 }}>(dejar vacío para no cambiar)</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Nueva Contraseña</label>
                  <input type="password" className="form-control" placeholder="Mínimo 6 caracteres" value={form.new_password} onChange={e => setForm({ ...form, new_password: e.target.value })} autoComplete="new-password" />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirmar Contraseña</label>
                  <input type="password" className="form-control" placeholder="Repite la contraseña" value={form.confirm_password} onChange={e => setForm({ ...form, confirm_password: e.target.value })} autoComplete="new-password" />
                </div>
                {form.new_password && form.confirm_password && (
                  <div style={{ fontSize: 12, marginTop: -8, marginBottom: 8, color: form.new_password === form.confirm_password ? 'var(--green)' : 'var(--red)' }}>
                    {form.new_password === form.confirm_password ? '✓ Coinciden' : '⚠️ No coinciden'}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || (form.new_password && form.new_password !== form.confirm_password)}>
                {saving ? <><div className="spinner"></div> Guardando...</> : '✓ Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}