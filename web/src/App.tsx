import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { Login } from './components/Login'
import { supabase } from './lib/supabase'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  return session ? <Dashboard /> : <Login />
}
