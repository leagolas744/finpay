import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminClients() {
  const [tab, setTab] = useState('clients')
  const [clients, setClients] = useState([])
  const [groups, setGroups] = useState([])
  const [commerces, setCommerces] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editingGroup, setEditingGroup] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')

  const emptyClient = { document: '', document_type: 'CC', full_name: '', email: '', phone: '', address: '', city: '', group_id: '', commerce_id: '', notes: '', is_active: true }
  const emptyGroup = { name: '', description: '', commerce_id: '', parent_id: '', is_active: true }
  const [clientForm, setClientForm] = useState(emptyClient)
  const [groupForm, setGroupForm] = useState(emptyGroup)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: c }, { data: g }, { data: com }] = await Promise.all([
      supabase.from('clients').select('*, client_groups(name), commerces(name)').order('full_name'),
      supabase.from('client_groups').select('*, commerces(name), parent:parent_id(name)').order('name'),
      supabase.from('commerces').select('id, name').eq('status', 'active').order('name')
    ])
    setClients(c || [])
    setGroups(g || [])
    setCommerces(com || [])
    setLoading(false)
  }

  // ===== CLIENTS =====
  const openCreateClient = () => {
    setEditing(null)
    setClientForm(emptyClient)
    setError('')
    setShowModal(true)
  }

  const openEditClient = (client) => {
    setEditing(client)
    setClientForm({
      document: client.document, document_type: client.document_type,
      full_name: client.full_name, email: client.email || '',
      phone: client.phone || '', address: client.address || '',
      city: client.city || '', group_id: client.group_id || '',
      commerce_id: client.commerce_id || '', notes: client.notes || '',
      is_active: client.is_active
    })
    setError('')
    setShowModal(true)
  }

  const handleSaveClient = async () => {
    if (!clientForm.document || !clientForm.full_name) return setError('Documento y nombre son obligatorios')
    setSaving(true)
    setError('')
    try {
      const payload = {
        document: clientForm.document, document_type: clientForm.document_type,
        full_name: clientForm.full_name, email: clientForm.email || null,
        phone: clientForm.phone || null, address: clientForm.address || null,
        city: clientForm.city || null, group_id: clientForm.group_id || null,
        commerce_id: clientForm.commerce_id || null, notes: clientForm.notes || null,
        is_active: clientForm.is_active
      }
      if (editing) {
        const { error } = await supabase.from('clients').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clients').insert(payload)
        if (error) throw error
      }
      setSuccess(editing ? 'Cliente actualizado' : 'Cliente creado')
      setShowModal(false)
      fetchAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClient = async (client) => {
    if (!confirm(`¿Eliminar el cliente ${client.full_name}?`)) return
    await supabase.from('clients').delete().eq('id', client.id)
    fetchAll()
  }

  // ===== GROUPS =====
  const openCreateGroup = () => {
    setEditingGroup(null)
    setGroupForm(emptyGroup)
    setError('')
    setShowGroupModal(true)
  }

  const openEditGroup = (group) => {
    setEditingGroup(group)
    setGroupForm({
      name: group.name, description: group.description || '',
      commerce_id: group.commerce_id || '', parent_id: group.parent_id || '',
      is_active: group.is_active
    })
    setError('')
    setShowGroupModal(true)
  }

  const handleSaveGroup = async () => {
    if (!groupForm.name) return setError('El nombre del grupo es obligatorio')
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: groupForm.name, description: groupForm.description || null,
        commerce_id: groupForm.commerce_id || null,
        parent_id: groupForm.parent_id || null,
        is_active: groupForm.is_active
      }
      if (editingGroup) {
        const { error } = await supabase.from('client_groups').update(payload).eq('id', editingGroup.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('client_groups').insert(payload)
        if (error) throw error
      }
      setSuccess(editingGroup ? 'Grupo actualizado' : 'Grupo creado')
      setShowGroupModal(false)
      fetchAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteGroup = async (group) => {
    if (!confirm(`¿Eliminar el grupo ${group.name}? Los clientes quedarán sin grupo.`)) return
    await supabase.from('client_groups').delete().eq('id', group.id)
    fetchAll()
  }

  const filteredClients = clients.filter(c =>
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.document?.includes(search)
  )

  const filteredGroups = groups.filter(g =>
    g.name?.toLowerCase().includes(search.toLowerCase())
  )

  // Grupos raíz (sin padre) y subgrupos
  const rootGroups = groups.filter(g => !g.parent_id)
  const subgroups = groups.filter(g => g.parent_id)

  return (
    <div>
      <div className="section-title">👥 Clientes y Grupos</div>
      <div className="section-sub">Administra clientes, grupos y subgrupos del sistema</div>

      {success && <div className="alert alert-success mb-4">{success}<button onClick={() => setSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></div>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--accent)' }}>
          <div className="text-xs text-muted">Total Clientes</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>{clients.length}</div>
        </div>
        <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--green)' }}>
          <div className="text-xs text-muted">Grupos</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>{rootGroups.length}</div>
        </div>
        <div className="card" style={{ padding: 14, borderLeft: '3px solid var(--purple)' }}>
          <div className="text-xs text-muted">Subgrupos</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--purple)', marginTop: 4 }}>{subgroups.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs mb-4">
        <button className={`tab ${tab === 'clients' ? 'active' : ''}`} onClick={() => setTab('clients')}>👤 Clientes ({clients.length})</button>
        <button className={`tab ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>📁 Grupos ({groups.length})</button>
      </div>

      {/* Search + Actions */}
      <div className="filters-bar mb-4">
        <div className="search-input flex-1">
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" className="form-control" style={{ paddingLeft: 38 }} placeholder={tab === 'clients' ? 'Buscar por nombre o documento...' : 'Buscar grupo...'} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {tab === 'clients'
          ? <button className="btn btn-primary" onClick={openCreateClient}>+ Nuevo Cliente</button>
          : <button className="btn btn-primary" onClick={openCreateGroup}>+ Nuevo Grupo</button>
        }
      </div>

      {/* CLIENTS TABLE */}
      {tab === 'clients' && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Ciudad</th>
                <th>Grupo</th>
                <th>Comercio</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }}></div></td></tr>
              ) : filteredClients.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No hay clientes registrados</td></tr>
              ) : filteredClients.map(client => (
                <tr key={client.id}>
                  <td><span className="mono">{client.document_type}: {client.document}</span></td>
                  <td className="text-primary font-bold">{client.full_name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{client.phone || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{client.city || '—'}</td>
                  <td>{client.client_groups?.name ? <span className="badge badge-info">{client.client_groups.name}</span> : '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{client.commerces?.name || '—'}</td>
                  <td>{client.is_active ? <span className="badge badge-success">● Activo</span> : <span className="badge badge-danger">● Inactivo</span>}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary text-xs" style={{ padding: '4px 8px' }} onClick={() => openEditClient(client)}>✏️</button>
                      <button className="btn btn-danger text-xs" style={{ padding: '4px 8px' }} onClick={() => handleDeleteClient(client)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* GROUPS TABLE */}
      {tab === 'groups' && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Grupo Padre</th>
                <th>Comercio</th>
                <th>Clientes</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32 }}><div className="spinner" style={{ margin: '0 auto' }}></div></td></tr>
              ) : filteredGroups.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No hay grupos registrados</td></tr>
              ) : filteredGroups.map(group => (
                <tr key={group.id}>
                  <td className="text-primary font-bold">
                    {group.parent_id ? '↳ ' : ''}{group.name}
                  </td>
                  <td>{group.parent_id ? <span className="badge badge-purple">Subgrupo</span> : <span className="badge badge-info">Grupo</span>}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{group.parent?.name || '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{group.commerces?.name || 'Global'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {clients.filter(c => c.group_id === group.id).length}
                  </td>
                  <td>{group.is_active ? <span className="badge badge-success">● Activo</span> : <span className="badge badge-danger">● Inactivo</span>}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary text-xs" style={{ padding: '4px 8px' }} onClick={() => openEditGroup(group)}>✏️</button>
                      <button className="btn btn-danger text-xs" style={{ padding: '4px 8px' }} onClick={() => handleDeleteGroup(group)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CLIENT MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <div className="modal-title">{editing ? '✏️ Editar Cliente' : '👤 Nuevo Cliente'}</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error mb-4">{error}</div>}
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Tipo de Documento</label>
                  <select className="form-control" value={clientForm.document_type} onChange={e => setClientForm({ ...clientForm, document_type: e.target.value })}>
                    <option value="CC">Cédula de Ciudadanía</option>
                    <option value="NIT">NIT</option>
                    <option value="CE">Cédula Extranjería</option>
                    <option value="PAS">Pasaporte</option>
                    <option value="TI">Tarjeta de Identidad</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Número de Documento *</label>
                  <input className="form-control" value={clientForm.document} onChange={e => setClientForm({ ...clientForm, document: e.target.value })} placeholder="123456789" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Nombre Completo *</label>
                <input className="form-control" value={clientForm.full_name} onChange={e => setClientForm({ ...clientForm, full_name: e.target.value })} placeholder="Nombre y apellidos" />
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-control" value={clientForm.phone} onChange={e => setClientForm({ ...clientForm, phone: e.target.value })} placeholder="300 000 0000" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-control" value={clientForm.email} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} placeholder="correo@ejemplo.com" />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Ciudad</label>
                  <input className="form-control" value={clientForm.city} onChange={e => setClientForm({ ...clientForm, city: e.target.value })} placeholder="Medellín" />
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <input className="form-control" value={clientForm.address} onChange={e => setClientForm({ ...clientForm, address: e.target.value })} placeholder="Calle 1 #2-3" />
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Grupo</label>
                  <select className="form-control" value={clientForm.group_id} onChange={e => setClientForm({ ...clientForm, group_id: e.target.value })}>
                    <option value="">Sin grupo</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.parent_id ? '↳ ' : ''}{g.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Comercio</label>
                  <select className="form-control" value={clientForm.commerce_id} onChange={e => setClientForm({ ...clientForm, commerce_id: e.target.value })}>
                    <option value="">Global</option>
                    {commerces.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-control" rows={2} value={clientForm.notes} onChange={e => setClientForm({ ...clientForm, notes: e.target.value })} placeholder="Observaciones..." style={{ resize: 'none' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveClient} disabled={saving}>
                {saving ? <><div className="spinner"></div> Guardando...</> : '✓ Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GROUP MODAL */}
      {showGroupModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowGroupModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editingGroup ? '✏️ Editar Grupo' : '📁 Nuevo Grupo'}</div>
              <button onClick={() => setShowGroupModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20 }}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error mb-4">{error}</div>}
              <div className="form-group">
                <label className="form-label">Nombre del Grupo *</label>
                <input className="form-control" value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="Ej: Clientes VIP" />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <input className="form-control" value={groupForm.description} onChange={e => setGroupForm({ ...groupForm, description: e.target.value })} placeholder="Descripción opcional" />
              </div>
              <div className="form-group">
                <label className="form-label">Grupo Padre (para subgrupos)</label>
                <select className="form-control" value={groupForm.parent_id} onChange={e => setGroupForm({ ...groupForm, parent_id: e.target.value })}>
                  <option value="">Es un grupo principal</option>
                  {groups.filter(g => !g.parent_id && g.id !== editingGroup?.id).map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Comercio</label>
                <select className="form-control" value={groupForm.commerce_id} onChange={e => setGroupForm({ ...groupForm, commerce_id: e.target.value })}>
                  <option value="">Global (todos los comercios)</option>
                  {commerces.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowGroupModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveGroup} disabled={saving}>
                {saving ? <><div className="spinner"></div> Guardando...</> : '✓ Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
