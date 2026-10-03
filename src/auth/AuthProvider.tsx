import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DataApi } from '../data/api'
import { createDemoApi, DEMO_USER_ID } from '../data/demoApi'
import { createSupabaseApi } from '../data/supabaseApi'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// eslint-disable-next-line react-refresh/only-export-components
export const isDemo = !url || !anonKey
const supabase: SupabaseClient | null = isDemo ? null : createClient(url!, anonKey!)
// One demo backend per page, created once.
const demoApi: DataApi | null = isDemo ? createDemoApi() : null

export type OAuthProvider = 'google' | 'azure'

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn'
  userId: string | null
  email: string | null
  api: DataApi | null
  isDemo: boolean
  signIn(provider: OAuthProvider): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!isDemo)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = isDemo ? DEMO_USER_ID : (session?.user.id ?? null)

  const api = useMemo<DataApi | null>(() => {
    if (demoApi) return demoApi
    return supabase && userId ? createSupabaseApi(supabase, userId) : null
  }, [userId])

  const value: AuthState = {
    status: loading ? 'loading' : userId ? 'signedIn' : 'signedOut',
    userId,
    email: session?.user.email ?? null,
    api,
    isDemo,
    async signIn(provider) {
      if (!supabase) return
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin,
          // Microsoft only returns the email address when asked for it.
          scopes: provider === 'azure' ? 'email openid profile' : undefined,
        },
      })
      if (error) throw error
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
