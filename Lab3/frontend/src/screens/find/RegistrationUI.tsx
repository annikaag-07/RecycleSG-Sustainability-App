import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { api, toApiError } from '@/shared/api';
import { EMAIL_LINK_EXPIRY_MINUTES, emailProblem, passwordProblem } from '@/shared/api/auth';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Checkbox, Header, Screen, TextField } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';

/** UC 1.1.AC.3: short cooldown before another verification email can be requested. */
const RESEND_COOLDOWN_S = 60;

export default function RegistrationUI() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [pendingEmail, setPendingEmail] = useState<string>();

  if (pendingEmail) return <CheckInbox email={pendingEmail} />;
  return <CreateAccountForm initialEmail={params.email ?? ''} onPending={setPendingEmail} />;
}

function CreateAccountForm({ initialEmail, onPending }: { initialEmail: string; onPending: (email: string) => void }) {
  // The imperative `router.canGoBack()` throws before the first render completes; the hook is render-safe.
  const navigation = useNavigation();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const eErr = emailProblem(email) ?? undefined;
    const pErr = passwordProblem(password) ?? undefined;
    setEmailError(eErr);
    setPasswordError(pErr);
    setFormError(undefined);
    if (eErr || pErr || !accepted) return;

    setSubmitting(true);
    try {
      const result = await api.auth.signUp(email, password);
      if (result.status === 'active') {
        router.replace('/find');
      } else if (result.status === 'pendingVerification') {
        onPending(email.trim());
      } else {
        // UC 1.1.EX.3 / AC.4: say only that an account exists, and offer log in with the email pre-filled.
        setEmailError('An account already exists for this email.');
      }
    } catch (e) {
      const err = toApiError(e);
      // UC 1.1.EX.5: inputs are kept; retrying is safe because sign-up for an existing email is detected above.
      setFormError(
        err.code === 'weak_password'
          ? 'That password is too weak. Try a longer one.'
          : err.code === 'over_email_send_rate_limit'
            ? 'Too many sign-up emails sent. Please try again later.'
            : err.message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const accountExists = emailError === 'An account already exists for this email.';

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll edges={['top', 'bottom']}>
        {navigation.canGoBack() && <Header leading="back" />}
        <View style={styles.titleRow}>
          <View style={styles.logo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Feather name="refresh-cw" size={18} color={colors.textMuted} />
          </View>
          <AppText variant="title" accessibilityRole="header">
            Create account
          </AppText>
        </View>

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
        />
        {accountExists && (
          <View style={styles.inlineActions}>
            <Button
              label="Log in instead"
              variant="secondary"
              style={styles.fill}
              onPress={() => router.replace({ pathname: '/login', params: { email: email.trim() } })}
            />
          </View>
        )}

        <TextField
          label="Password"
          password
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setPasswordError(undefined);
          }}
          error={passwordError}
          hint="At least 8 characters, with letters and numbers"
          autoComplete="new-password"
          textContentType="newPassword"
        />

        <View style={styles.termsBox}>
          <Checkbox
            checked={accepted}
            onChange={setAccepted}
            accessibilityLabel="I accept the Community Guidelines and Privacy Terms. Posts are public by default and may be reported by other users."
          >
            <AppText variant="small" color="textMuted">
              I accept the <AppText variant="small" style={styles.bold}>Community Guidelines</AppText> and{' '}
              <AppText variant="small" style={styles.bold}>Privacy Terms</AppText>. Posts are public by default and may
              be reported by other users.
            </AppText>
          </Checkbox>
        </View>

        {formError && <Banner tone="error">{formError}</Banner>}

        {/* UC 1.1.EX.2: disabled until the guidelines are accepted, so the user is never left guessing. */}
        <Button
          label="Create account"
          onPress={submit}
          loading={submitting}
          disabled={!accepted}
          accessibilityHint={accepted ? undefined : 'Accept the Community Guidelines and Privacy Terms first'}
        />

        <View style={styles.divider}>
          <View style={styles.rule} />
          <AppText variant="small" color="textFaint">
            or
          </AppText>
          <View style={styles.rule} />
        </View>

        {/* Singpass is deferred for the prototype (Lab 2 tech stack: "Email Before Singpass"). */}
        <Button label="Log in with Singpass" variant="danger" disabled accessibilityHint="Not available yet" />
        <AppText variant="small" color="textFaint" style={styles.center}>
          Singpass sign-in isn't available in this prototype yet.
        </AppText>

        <Banner tone="info">
          A verification link goes to your email. The account stays inactive until you confirm it — you can browse the
          map before then, but not check in or post.
        </Banner>

        <View style={styles.footer}>
          <AppText variant="small" color="textMuted">
            Already have an account?{' '}
          </AppText>
          <Pressable
            onPress={() => router.replace({ pathname: '/login', params: email ? { email: email.trim() } : {} })}
            accessibilityRole="link"
            hitSlop={8}
          >
            <AppText variant="small" style={styles.link}>
              Log in
            </AppText>
          </Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** UC 1.1 steps 9–10 and AC.2/AC.3: link sent; browse meanwhile or resend with a cooldown. */
function CheckInbox({ email }: { email: string }) {
  const { continueAsGuest } = useAuth();
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string }>();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setResending(true);
    setMessage(undefined);
    try {
      await api.auth.resendVerification(email);
      setMessage({ tone: 'info', text: 'A new link was sent. Older links no longer work.' });
      setCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      setMessage({ tone: 'error', text: toApiError(e).message });
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Header title="Check your inbox" />
      <View style={styles.notice} accessibilityLiveRegion="polite">
        <AppText variant="label" color="textMuted">
          Verification sent
        </AppText>
        <AppText variant="small" color="textMuted">
          We sent a link to <AppText variant="small" style={styles.bold}>{email}</AppText>. It expires in{' '}
          {EMAIL_LINK_EXPIRY_MINUTES} minutes.
        </AppText>
        <AppText variant="small" color="textMuted">
          Until you confirm it you can search the map, see point details and get directions. Checking in, logging
          recycling and posting unlock once you're verified.
        </AppText>
      </View>
      {message && <Banner tone={message.tone}>{message.text}</Banner>}
      <Button
        label="Browse the map"
        onPress={() => {
          continueAsGuest();
          router.replace('/find');
        }}
      />
      <Button
        label={cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend link'}
        variant="secondary"
        onPress={resend}
        loading={resending}
        disabled={cooldown > 0}
      />
      <Button label="I've verified — log in" variant="ghost" onPress={() => router.replace({ pathname: '/login', params: { email } })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  bold: { fontWeight: '700', color: colors.text },
  link: { fontWeight: '700', color: colors.text, textDecorationLine: 'underline' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineActions: { flexDirection: 'row', marginTop: -spacing.sm },
  termsBox: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: spacing.sm },
  notice: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
});
