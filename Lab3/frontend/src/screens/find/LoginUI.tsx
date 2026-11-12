import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, toApiError } from '@/shared/api';
import { EMAIL_LINK_EXPIRY_MINUTES, emailProblem, passwordProblem } from '@/shared/api/auth';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Header, Logo, Screen, TextField } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';

type Notice =
  | { kind: 'resetSent'; email: string }
  | { kind: 'unverified'; email: string }
  | { kind: 'verificationResent'; email: string };

/** Maps Supabase Auth error codes to the messages in UC 1.2's exception flows. */
function loginErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    // UC 1.2.EX.4: same message for unknown email and wrong password, so addresses can't be harvested.
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    // UC 1.2.EX.2: Supabase rate-limits sign-in attempts rather than locking a single account.
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a few minutes, or reset your password below.';
    default:
      return fallback;
  }
}

export default function LoginUI() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { passwordRecovery } = useAuth();

  if (passwordRecovery) return <SetNewPassword />;
  return <LogInForm initialEmail={params.email ?? ''} />;
}

function LogInForm({ initialEmail }: { initialEmail: string }) {
  const { continueAsGuest } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState<'login' | 'reset' | 'resend'>();

  const logIn = async () => {
    const eErr = emailProblem(email) ?? undefined;
    const pErr = password ? undefined : 'Enter your password';
    setEmailError(eErr);
    setPasswordError(pErr);
    setFormError(undefined);
    if (eErr || pErr) return;

    setBusy('login');
    try {
      await api.auth.signIn(email, password);
      router.replace('/find');
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'email_not_confirmed') {
        setNotice({ kind: 'unverified', email: email.trim() });
      } else if (err.code === 'invalid_credentials') {
        setPasswordError(loginErrorMessage(err.code, err.message));
      } else {
        setFormError(loginErrorMessage(err.code, err.message));
      }
      // UC 1.2.EX.5: keep the email, clear the password.
      setPassword('');
    } finally {
      setBusy(undefined);
    }
  };

  const forgotPassword = async () => {
    if (emailProblem(email)) {
      setEmailError('Enter your email above first, then tap Forgot password.');
      return;
    }
    setEmailError(undefined);
    setFormError(undefined);
    setBusy('reset');
    try {
      await api.auth.sendPasswordReset(email);
      // Shown whether or not the address has an account (UC 1.2.AC.2).
      setNotice({ kind: 'resetSent', email: email.trim() });
    } catch (e) {
      const err = toApiError(e);
      setFormError(
        err.code === 'over_email_send_rate_limit' ? 'Too many emails sent. Please try again later.' : err.message,
      );
    } finally {
      setBusy(undefined);
    }
  };

  const resendVerification = async (address: string) => {
    setBusy('resend');
    try {
      await api.auth.resendVerification(address);
      setNotice({ kind: 'verificationResent', email: address });
    } catch (e) {
      setFormError(toApiError(e).message);
    } finally {
      setBusy(undefined);
    }
  };

  const browseAsGuest = () => {
    continueAsGuest();
    router.replace('/find');
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll edges={['top', 'bottom']}>
        <View style={styles.brand}>
          <Logo size={44} />
          <AppText variant="heading">RecycleSG</AppText>
        </View>
        <Header title="Log in" />

        <TextField
          label="Email"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setEmailError(undefined);
          }}
          error={emailError}
          placeholder="you@e.ntu.edu.sg"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          password
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setPasswordError(undefined);
          }}
          error={passwordError}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={logIn}
        />

        {formError && <Banner tone="error">{formError}</Banner>}

        <Button label="Log in" onPress={logIn} loading={busy === 'login'} disabled={!!busy} />
        <Button
          label="Forgot password?"
          variant="ghost"
          onPress={forgotPassword}
          loading={busy === 'reset'}
          disabled={!!busy}
        />

        {notice && <NoticeCard notice={notice} onResend={resendVerification} resending={busy === 'resend'} />}

        <Button label="Browse as guest" variant="secondary" onPress={browseAsGuest} disabled={!!busy} />
        <AppText variant="small" color="textFaint" style={styles.center}>
          Guests can search the map and see point details. Checking in, earning points and posting need an account.
        </AppText>

        <View style={styles.footer}>
          <AppText variant="small" color="textMuted">
            New here?{' '}
          </AppText>
          <Pressable
            onPress={() => router.push({ pathname: '/register', params: email ? { email: email.trim() } : {} })}
            accessibilityRole="link"
            hitSlop={8}
          >
            <AppText variant="small" style={styles.link}>
              Create an account
            </AppText>
          </Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function NoticeCard({
  notice,
  onResend,
  resending,
}: {
  notice: Notice;
  onResend: (email: string) => void;
  resending: boolean;
}) {
  const label = notice.kind === 'resetSent' ? 'Reset sent' : notice.kind === 'unverified' ? 'Not verified yet' : 'Link sent';
  const strong = (
    <AppText variant="small" style={styles.bold}>
      {notice.email}
    </AppText>
  );
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <View style={styles.noticeRow}>
        <View style={styles.noticeIcon}>
          <Feather name="mail" size={16} color={colors.textMuted} />
        </View>
        <AppText variant="small" color="textMuted" style={styles.fill}>
          {notice.kind === 'resetSent' && (
            <>
              If an account exists for {strong}, a reset link is on its way. It expires in {EMAIL_LINK_EXPIRY_MINUTES}{' '}
              minutes.
            </>
          )}
          {notice.kind === 'unverified' && (
            <>{strong} hasn't been verified yet. Open the link we emailed you, or send a new one.</>
          )}
          {notice.kind === 'verificationResent' && (
            <>A new verification link was sent to {strong}. Older links no longer work.</>
          )}
        </AppText>
      </View>
      {notice.kind === 'unverified' && (
        <Button
          label="Resend verification link"
          variant="secondary"
          onPress={() => onResend(notice.email)}
          loading={resending}
        />
      )}
    </View>
  );
}

/** Shown after following a reset link: the user has a recovery session and sets a new password (UC 1.2.AC.2). */
function SetNewPassword() {
  const { finishPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const problem = passwordProblem(password);
    setError(problem ?? undefined);
    setFormError(undefined);
    if (problem) return;
    setSaving(true);
    try {
      await api.auth.updatePassword(password);
      finishPasswordRecovery();
      router.replace('/find');
    } catch (e) {
      const err = toApiError(e);
      // UC 1.2.EX.6: link expired or already used.
      setFormError(
        err.code === 'same_password'
          ? 'Choose a password different from your old one.'
          : err.code === 'session_not_found' || err.code === 'session_expired'
            ? 'This reset link has expired. Go back and request a new one.'
            : err.message,
      );
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    finishPasswordRecovery();
    await api.auth.signOut().catch(() => undefined);
    router.replace('/login');
  };

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Header title="Set a new password" />
      <TextField
        label="New password"
        password
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          setError(undefined);
        }}
        error={error}
        hint="At least 8 characters, with letters and numbers"
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={save}
      />
      {formError && <Banner tone="error">{formError}</Banner>}
      <Button label="Save password" onPress={save} loading={saving} />
      <Button label="Cancel" variant="ghost" onPress={cancel} disabled={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  bold: { fontWeight: '700', color: colors.text },
  link: { fontWeight: '700', color: colors.text, textDecorationLine: 'underline' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: spacing.lg },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  notice: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  noticeRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  noticeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
