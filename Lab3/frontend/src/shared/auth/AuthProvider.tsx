import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';

import { flushReportOutbox } from '@/shared/api/proposed';
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
  /**
   * From `app_metadata.role`, which only the service role can set. This only hides admin UI —
   * the admin RPCs must check the role server-side (NFR-SEC-09).
   */
  isAdmin: boolean;
  isModerator: boolean;
  /** User opened a password-reset link and must choose a new password before continuing (UC 1.2.AC.2). */
  passwordRecovery: boolean;
  finishPasswordRecovery: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

// On web the reset link lands with `#...&type=recovery`; read it before supabase-js strips the hash.
const openedFromRecoveryLink =
  Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash.includes('type=recovery');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [guest, setGuest] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(openedFromRecoveryLink);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (next) setGuest(false);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
    });
    supabase.auth.getSession().then(({ data: current }) => {
      setSession(current.session);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Retry reports saved while offline / before the endpoint existed (UC 2.3.EX.4). Best-effort.
  const userId = session?.user?.id;
  useEffect(() => {
    if (userId) flushReportOutbox().catch(() => undefined);
  }, [userId]);

  const value = useMemo<AuthState>(() => {
    const user = session?.user ?? null;
    const role = user?.app_metadata?.role;
    return {
      isAdmin: role === 'admin',
      isModerator: role === 'admin' || role === 'moderator',
      loading,
      session,
      user,
      isGuest: !user && guest,
      isVerified: !!user?.email_confirmed_at,
      continueAsGuest: () => setGuest(true),
      passwordRecovery,
      finishPasswordRecovery: () => setPasswordRecovery(false),
    };
  }, [loading, session, guest, passwordRecovery]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
