import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import './index.css'

// Pages — Admin
import LoginPage from './pages/LoginPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminCommerces from './pages/admin/AdminCommerces'
import AdminTransactions from './pages/admin/AdminTransactions'
import AdminReports from './pages/admin/AdminReports'
import AdminAlerts from './pages/admin/AdminAlerts'
import AdminUsers from './pages/admin/AdminUsers'         // Feature 1
import AdminClients from './pages/admin/AdminClients'     // Feature 4
import AdminWallets from './pages/admin/AdminWallets'     // Feature 6

// Pages — Commerce
import CommerceLayout from './pages/commerce/CommerceLayout'
import CommerceDashboard from './pages/commerce/CommerceDashboard'
import CommerceOperations from './pages/commerce/CommerceOperations'
import CommerceHistory from './pages/commerce/CommerceHistory'
import CommerceWallets from './pages/commerce/CommerceWallets'  // Feature 6

function ProtectedRoute({ children, requiredRole }) {
  const { user, profile, loading } = useAuth()
  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div>
      <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Cargando sistema...</span>
    </div>
  )
  if (!user || !profile) return <Navigate to="/login" replace />
  if (requiredRole && profile.role !== requiredRole) {
    return <Navigate to={profile.role === 'admin' ? '/admin' : '/commerce'} replace />
  }
  return children
}

function AppRoutes() {
  const { profile, user, loading } = useAuth()

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div>
      <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Iniciando...</span>
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={
        user && profile
          ? <Navigate to={profile.role === 'admin' ? '/admin' : '/commerce'} replace />
          : <LoginPage />
      } />

      {/* ADMIN ROUTES */}
      <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="commerces" element={<AdminCommerces />} />
        <Route path="transactions" element={<AdminTransactions />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="alerts" element={<AdminAlerts />} />
        <Route path="users" element={<AdminUsers />} />       {/* Feature 1 */}
        <Route path="clients" element={<AdminClients />} />   {/* Feature 4 */}
        <Route path="wallets" element={<AdminWallets />} />   {/* Feature 6 */}
      </Route>

      {/* COMMERCE ROUTES */}
      <Route path="/commerce" element={<ProtectedRoute requiredRole="commerce"><CommerceLayout /></ProtectedRoute>}>
        <Route index element={<CommerceDashboard />} />
        <Route path="operations" element={<CommerceOperations />} />
        <Route path="history" element={<CommerceHistory />} />
        <Route path="wallets" element={<CommerceWallets />} />  {/* Feature 6 */}
      </Route>

      <Route path="/" element={
        !user ? <Navigate to="/login" replace />
          : !profile ? <div className="loading-screen"><div className="spinner"></div></div>
          : <Navigate to={profile.role === 'admin' ? '/admin' : '/commerce'} replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
