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

/** `session` is null when email confirmation is required — show "check your inbox" (UC 1.1 step 9). */
export async function signUp(email: string, password: string, displayName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: displayName ? { display_name: displayName } : undefined,
      emailRedirectTo: Linking.createURL('/'),
    },
  });
  if (error) throw toApiError(error);
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw toApiError(error);
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw toApiError(error);
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: Linking.createURL('/'),
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
