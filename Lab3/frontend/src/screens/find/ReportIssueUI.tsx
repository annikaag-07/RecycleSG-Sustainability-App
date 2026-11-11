import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { api, toApiError } from '@/shared/api';
import type { PointReport, ReportCategory } from '@/shared/api/proposed';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, EmptyState, Header, Screen, TextField } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { PointTypeTile } from './PointBits';

const CATEGORIES: { key: ReportCategory; label: string; hint?: string }[] = [
  { key: 'full', label: 'Bin is full' },
  { key: 'missing_or_damaged', label: 'Bin is missing or damaged' },
  { key: 'wrong_info', label: 'Wrong information shown', hint: 'Tell us which detail is wrong — it helps the reviewer most.' },
  { key: 'contaminated', label: 'Contaminated / misused' },
];
const MAX_DESCRIPTION = 500;

/** NFR-SEC-06: strip control characters and trim. React escapes text on display, so no HTML can run. */
function cleanText(s: string): string | null {
  const t = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return t ? t.slice(0, MAX_DESCRIPTION) : null;
}

type Outcome = { kind: 'sent' } | { kind: 'queued'; reason: 'offline' | 'not_available' };

/** UC 2.3 — one category, optional note, send. Reports go to review; they never change what others see directly. */
export default function ReportIssueUI() {
  const params = useLocalSearchParams<{ id: string; title?: string }>();
  const pointId = Number(params.id);
  const { user, isVerified } = useAuth();
  const [category, setCategory] = useState<ReportCategory>();
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<Outcome>();
  // One request id per report, reused on retry, so a retried send can't create a duplicate (UC 2.3.EX.5).
  const requestId = useRef(api.proposed.newRequestId());
  const [title, setTitle] = useState(params.title ?? '');

  useEffect(() => {
    if (title || !Number.isInteger(pointId)) return;
    api.points
      .getPointDetail(pointId)
      .then((p) => setTitle(p.address.split(',')[0] ?? p.name))
      .catch(() => setTitle(`Point #${pointId}`));
  }, [pointId, title]);

  if (!user || !isVerified) {
    return (
      <Screen>
        <Header title="Report an issue" leading="close" />
        <EmptyState
          icon="flag"
          title={user ? 'Verify your email to send reports' : 'Log in to report a problem'}
          message="Reports need a verified account so reviewers can follow up and points can be credited for valid reports."
        />
        {!user && <Button label="Log in" onPress={() => router.replace('/login')} />}
      </Screen>
    );
  }

  const send = async () => {
    if (!category) return;
    setSending(true);
    setError(undefined);
    const report: PointReport = {
      clientRequestId: requestId.current,
      recyclingPointId: pointId,
      pointTitle: title,
      category,
      description: cleanText(description),
      createdAt: new Date().toISOString(),
    };
    try {
      await api.proposed.submitPointReport(user.id, report);
      setOutcome({ kind: 'sent' });
    } catch (e) {
      const err = toApiError(e);
      if (err.isNetwork || err.code === 'not_available') {
        // UC 2.3.EX.4: keep it on the device and send later with the same request id.
        try {
          await api.proposed.queueReport(user.id, report);
          setOutcome({ kind: 'queued', reason: err.isNetwork ? 'offline' : 'not_available' });
        } catch {
          setError('Could not save this report on your device. Please try sending it again.');
        }
      } else {
        setError(err.message);
      }
    } finally {
      setSending(false);
    }
  };

  if (outcome) {
    return (
      <Screen>
        <Header title="Report an issue" leading="close" />
        <EmptyState
          icon={outcome.kind === 'sent' ? 'check-circle' : 'clock'}
          title={outcome.kind === 'sent' ? 'Report received' : 'Report saved on this device'}
          message={
            outcome.kind === 'sent'
              ? 'Thanks — an administrator will review it. Nothing other users see changes until then.'
              : outcome.reason === 'offline'
                ? "You're offline. It will be sent automatically when you're back online."
                : "The server doesn't accept reports yet. It's saved here and will be sent automatically once reporting is switched on."
          }
        />
        <Button label="Back to the point" onPress={() => (router.canGoBack() ? router.back() : router.replace(`/find/point/${pointId}`))} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen scroll>
        <Header title="Report an issue" leading="close" />
        <View style={styles.pointCard}>
          <PointTypeTile stream="blueBin" />
          <AppText variant="bodyStrong" style={styles.fill} numberOfLines={2}>
            {title || 'Loading…'}
          </AppText>
        </View>

        <AppText variant="label" color="textMuted">
          What is wrong?
        </AppText>
        <View accessibilityRole="radiogroup">
          {CATEGORIES.map((c) => {
            const selected = category === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => setCategory(c.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={c.label}
                style={styles.radioRow}
              >
                <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
                <AppText variant="bodyStrong">{c.label}</AppText>
              </Pressable>
            );
          })}
        </View>

        <TextField
          label={category === 'wrong_info' ? 'Which detail is wrong?' : 'Anything else? (optional)'}
          placeholder={category === 'wrong_info' ? 'e.g. it no longer takes glass' : 'e.g. overflowing since Saturday'}
          value={description}
          onChangeText={(t) => setDescription(t.slice(0, MAX_DESCRIPTION))}
          hint={`${description.length}/${MAX_DESCRIPTION}${category === 'wrong_info' ? ' · ' + CATEGORIES[2].hint : ''}`}
          multiline
          style={styles.multiline}
        />

        {/* Photo upload needs a storage bucket the backend doesn't have yet (Lab3/backend: "photo-storage integration pending"). */}
        <Button label="Add a photo" icon="camera" variant="secondary" disabled accessibilityHint="Not available yet" />
        <AppText variant="small" color="textFaint">
          Photos can't be attached yet — the server has no photo storage. Reports send without one.
        </AppText>

        <Banner tone="info">Reports are user-submitted and reviewed by an administrator before anything changes.</Banner>
        {error && <Banner tone="error">{error}</Banner>}

        {/* UC 2.3.EX.1: disabled until a category is chosen. */}
        <Button label={error ? 'Try again' : 'Send report'} onPress={send} loading={sending} disabled={!category} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pointCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.text, backgroundColor: colors.text },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.background },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
