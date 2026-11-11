import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';

import { flushReportOutbox, getMyRoles } from '@/shared/api/proposed';
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
   * From the backend's `is_app_admin()` (membership of `public.app_admins`). This only decides which UI
   * to show — every admin RPC checks it again on the server (NFR-SEC-09).
   */
  isAdmin: boolean;
  /** Admins and designated content moderators may access the moderation queue. */
  isModerator: boolean;
  /** False while the admin check for the current user is still running (avoids flashing "Administrators only"). */
  roleChecked: boolean;
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
    if (!userId) return;
    let flushing = false;
    const retry = async () => {
      if (flushing) return;
      flushing = true;
      try {
        await flushReportOutbox(userId);
      } finally {
        flushing = false;
      }
    };
    const flush = () => { retry().catch(() => undefined); };
    flush();
    const timer = setInterval(flush, 60_000);
    return () => clearInterval(timer);
  }, [userId]);

  // Admin status per signed-in user. Any failure counts as "not an admin".
  const [roleCheck, setRoleCheck] = useState<{ userId: string; isAdmin: boolean; isModerator: boolean } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getMyRoles().then(
      (roles) => { if (!cancelled) setRoleCheck({ userId, ...roles }); },
      () => { if (!cancelled) setRoleCheck({ userId, isAdmin: false, isModerator: false }); },
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo<AuthState>(() => {
    const user = session?.user ?? null;
    const checked = !user || roleCheck?.userId === user.id;
    const isAdmin = !!user && roleCheck?.userId === user.id && roleCheck.isAdmin;
    return {
      isAdmin,
      isModerator: !!user && roleCheck?.userId === user.id && roleCheck.isModerator,
      roleChecked: checked,
      loading,
      session,
      user,
      isGuest: !user && guest,
      isVerified: !!user?.email_confirmed_at,
      continueAsGuest: () => setGuest(true),
      passwordRecovery,
      finishPasswordRecovery: () => setPasswordRecovery(false),
    };
  }, [loading, session, guest, passwordRecovery, roleCheck]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
