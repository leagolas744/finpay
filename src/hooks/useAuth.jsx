import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user)
          fetchProfile(session.user.id)
        } else {
          setUser(null)
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId) => {
    try {
      // Paso 1: obtener el perfil básico sin joins
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, commerce_id, is_active')
        .eq('id', userId)
        .single()

      if (profileError) {
        console.error('Error perfil:', profileError.message)
        setLoading(false)
        return
      }

      // Paso 2: si es comercio, obtener datos del comercio por separado
      if (profileData.commerce_id) {
        const { data: commerceData } = await supabase
          .from('commerces')
          .select('*')
          .eq('id', profileData.commerce_id)
          .single()

        setProfile({ ...profileData, commerces: commerceData })
      } else {
        setProfile({ ...profileData, commerces: null })
      }

      console.log('Perfil cargado correctamente:', profileData.role)
    } catch (err) {
      console.error('Error inesperado:', err)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const refreshProfile = () => {
    if (user) fetchProfile(user.id)
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signIn,
      signOut,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}