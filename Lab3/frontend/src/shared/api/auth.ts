import * as Linking from 'expo-linking';

import { supabase } from './supabase';
import { toApiError } from './errors';

/** REQ-1.2: at least 8 characters, letters and digits. The backend only enforces 6, so the UI must check. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'At least 8 characters';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers';
  return null;
}

export function emailProblem(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Enter a valid email address';
}

/** Version of the Community Guidelines and Privacy Terms shown at sign-up (UC 1.1 postcondition 2). */
export const TERMS_VERSION = '2026-09';

/** Local backend `auth.email.otp_expiry` (config.toml) — reset and verification links last 1 hour. */
export const EMAIL_LINK_EXPIRY_MINUTES = 60;

export type SignUpResult =
  | { status: 'active' } // signed in straight away (email confirmation disabled)
  | { status: 'pendingVerification' } // verification email sent, no session yet
  | { status: 'alreadyRegistered' };

export async function signUp(email: string, password: string, opts: { displayName?: string } = {}): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      // The backend has no consent table yet, so acceptance is recorded in auth user metadata.
      data: {
        ...(opts.displayName ? { display_name: opts.displayName } : {}),
        terms_version: TERMS_VERSION,
        terms_accepted_at: new Date().toISOString(),
      },
      emailRedirectTo: Linking.createURL('/'),
    },
  });
  if (error) {
    if (error.code === 'user_already_exists') return { status: 'alreadyRegistered' };
    throw toApiError(error);
  }
  // With confirmations on, Supabase hides existing accounts by returning a user with no identities.
  if (data.user && data.user.identities?.length === 0) return { status: 'alreadyRegistered' };
  return { status: data.session ? 'active' : 'pendingVerification' };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw toApiError(error);
  return data;
}

/**
 * REQ-1.6: ends the session. Tries to revoke it on the server first; if that request fails
 * (e.g. offline), supabase-js keeps the stored session, so fall back to clearing it on this device —
 * logging out must always work.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (!error) return;
  const local = await supabase.auth.signOut({ scope: 'local' });
  if (local.error) throw toApiError(local.error);
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: Linking.createURL('/login'),
  });
  if (error) throw toApiError(error);
}

export async function resendVerification(email: string) {
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
  if (error) throw toApiError(error);
}

export async function updatePassword(password: string) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw toApiError(error);
  return data.user;
}
