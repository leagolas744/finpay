import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn, profile } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await signIn(email, password)
      // La navegación se hará desde AppRoutes basado en el rol
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
        : err.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-panel">
        {/* Logo */}
        <div className="login-logo">
          <div className="icon">💳</div>
          <div>
            <div className="login-title">Fin<span>Pay</span></div>
            <div className="login-subtitle">Sistema de Pagos y Recaudos</div>
          </div>
        </div>

        {/* Card */}
        <div className="login-card">
          <h2>Iniciar Sesión</h2>
          <p>Ingresa tus credenciales para continuar</p>

          {error && (
            <div className="alert alert-error">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Correo Electrónico</label>
              <input
                type="email"
                className="form-control form-control-lg"
                placeholder="correo@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input
                type="password"
                className="form-control form-control-lg"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg w-full"
              disabled={loading}
              style={{ marginTop: 8 }}
            >
              {loading ? (
                <><div className="spinner"></div> Ingresando...</>
              ) : (
                <>🔐 Ingresar al Sistema</>
              )}
            </button>
          </form>
        </div>

        {/* Info */}
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <p className="text-xs text-muted">
            Sistema protegido · Acceso solo para personal autorizado
          </p>
          <p className="text-xs text-muted" style={{ marginTop: 8 }}>
            🔒 Conexión segura con cifrado SSL
          </p>
        </div>
      </div>
    </div>
  )
}
