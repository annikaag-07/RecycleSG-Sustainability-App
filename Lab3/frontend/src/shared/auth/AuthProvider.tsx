import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/shared/api/supabase';

type AuthState = {
  /** True until the stored session has been read on startup. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** Guests can browse Find without an account (SRS 2.3); check-in, posting and ranks need sign-in. */
  isGuest: boolean;
  /** Email confirmed (or confirmation disabled). Unverified accounts can browse but not check in or post (UC 1.1). */
  isVerified: boolean;
  continueAsGuest: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) setGuest(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(() => {
    const user = session?.user ?? null;
    return {
      loading,
      session,
      user,
      isGuest: !user && guest,
      isVerified: !!user?.email_confirmed_at,
      continueAsGuest: () => setGuest(true),
    };
  }, [loading, session, guest]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
