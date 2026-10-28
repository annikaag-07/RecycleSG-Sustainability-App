import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { api, toApiError, type ContributionResult, type Milestone, type MilestoneContribution, type Profile } from '@/shared/api';
import { newRequestId } from '@/shared/api/proposed';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, Chip, EmptyState, Header, Screen, TextField } from '@/shared/components';
import { colors, spacing } from '@/shared/theme';
import { MilestoneProgress, MilestoneStatusBadge, formatClosingDate, isOpen } from './MilestoneBits';

type Load =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }
  /** `history` is null if it couldn't be loaded; the rest of the screen still works. */
  | { kind: 'ready'; milestone: Milestone; profile: Profile; history: MilestoneContribution[] | null };

type Step =
  | { kind: 'choose' }
  /** The request ID is fixed when the user reaches the confirm step, so every retry of that confirmation reuses it. */
  | { kind: 'confirm'; amount: number; requestId: string }
  | { kind: 'done'; result: ContributionResult };

const QUICK_AMOUNTS = [10, 50, 100];

// The backend raises plain exceptions, so its message text is the only way to tell these apart.
const CONTRIBUTION_ERRORS: Record<string, string> = {
  'Insufficient Eco Points': 'You don’t have that many available Eco Points any more. Go back and choose a smaller amount.',
  'Milestone unavailable': 'This milestone has just closed to contributions, so nothing was deducted.',
  'Milestone target reached': 'Someone else has just filled this milestone, so nothing was deducted.',
  'Verified account required': 'Verify your email to contribute. Nothing was deducted.',
};

/** UC 3.3 steps 3–11: put part of your available Eco Points towards a community milestone. */
export default function MilestoneContributionUI() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const { user, isVerified } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [amountText, setAmountText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const fetchData = useCallback(async () => {
    if (!user) return;
    if (!Number.isInteger(id)) return setLoad({ kind: 'notFound' });
    setLoad({ kind: 'loading' });
    try {
      const [milestones, profile, history] = await Promise.all([
        api.milestones.listMilestones(),
        api.profile.getMyProfile(user.id),
        api.milestones.listMyContributions().catch(() => null),
      ]);
      const milestone = milestones.find((m) => m.id === id);
      if (!milestone) return setLoad({ kind: 'notFound' });
      setLoad({ kind: 'ready', milestone, profile, history: history?.filter((c) => c.milestone_id === id) ?? null });
    } catch (e) {
      setLoad({ kind: 'error', message: toApiError(e).message });
    }
  }, [id, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!user) {
    return (
      <Screen>
        <Header title="Milestone" leading="back" />
        <EmptyState icon="user" title="Log in to contribute" message="Contributions come out of the Eco Points you've earned, so they need an account." />
        <Button label="Log in" onPress={() => router.push('/login')} />
      </Screen>
    );
  }
  if (load.kind === 'loading') {
    return (
      <Screen>
        <Header title="Milestone" leading="back" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      </Screen>
    );
  }
  if (load.kind === 'notFound') {
    return (
      <Screen>
        <Header title="Milestone" leading="back" />
        <EmptyState icon="flag" title="This milestone isn't listed" message="It may have been removed. Go back to see the milestones that are open." />
      </Screen>
    );
  }
  if (load.kind === 'error') {
    return (
      <Screen>
        <Header title="Milestone" leading="back" />
        <Banner tone="error" title="Couldn't load this milestone">
          {load.message}
        </Banner>
        <Button label="Try again" onPress={fetchData} />
      </Screen>
    );
  }

  const { milestone: m, profile, history } = load;
  const available = profile.available_eco_points;
  const remaining = Math.max(0, m.target_points - m.current_points);
  const open = isOpen(m);

  if (step.kind === 'done') {
    const r = step.result;
    return (
      <Screen scroll>
        <Header title="Milestone" leading="back" />
        <EmptyState icon="check-circle" title={`You contributed ${r.accepted_amount} Eco Points`} message={`${m.name} is now at ${r.current_points} of ${m.target_points}.`} />
        {r.status === 'AwaitingVerification' && (
          // UC 3.3 step 11: reaching the target doesn't prove the outcome happened, so say what happens next.
          <Banner tone="info" title="That reached the target">
            The milestone is now closed to contributions while an administrator checks the evidence. You'll be told once it's verified.
          </Banner>
        )}
        <AppText color="textMuted" style={styles.center}>
          Available balance: {r.available_eco_points} Eco Points
        </AppText>
        <Button label="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace('/you/impact'))} />
      </Screen>
    );
  }

  if (step.kind === 'confirm') {
    // UC 3.3.AC.3: only what the target still needs is taken; the rest stays in the balance.
    const accepted = Math.min(step.amount, remaining);
    const onConfirm = async () => {
      setSubmitting(true);
      setSubmitError(undefined);
      try {
        const result = await api.milestones.contributeToMilestone(m.id, step.amount, step.requestId);
        setStep({ kind: 'done', result });
      } catch (e) {
        const err = toApiError(e);
        // UC 3.3.EX.5: never queue an unconfirmed contribution. The same request ID makes the retry safe (EX.4).
        if (err.isNetwork) setSubmitError('Couldn’t confirm the result. Your contribution may have succeeded. Retry this confirmation when you’re back online; the same request will not deduct twice.');
        else setSubmitError(CONTRIBUTION_ERRORS[err.message] ?? err.message);
      } finally {
        setSubmitting(false);
      }
    };
    return (
      <Screen scroll>
        <Header title="Confirm" leading="back" onLeadingPress={() => setStep({ kind: 'choose' })} />
        <Card label="You're about to contribute">
          <AppText variant="title">{accepted} Eco Points</AppText>
          <AppText color="textMuted">to {m.name}</AppText>
          {step.amount > accepted && (
            <AppText variant="small" color="textMuted">
              You chose {step.amount}, but only {accepted} is needed to reach the target. The other {step.amount - accepted} stay in your balance.
            </AppText>
          )}
        </Card>
        <Card label="Your balance">
          <Row label="Available now" value={available} />
          <Row label="Available after" value={available - accepted} strong />
          <AppText variant="small" color="textFaint">
            Your lifetime Eco Points ({profile.eco_points}), used for levels and the leaderboard, don't go down.
          </AppText>
        </Card>
        {submitError && (
          <Banner tone="error" title="Not contributed">
            {submitError}
          </Banner>
        )}
        <Button label="Confirm contribution" loading={submitting} onPress={onConfirm} />
        {/* UC 3.3.AC.1 change the amount, AC.2 cancel without deducting anything. */}
        <Button label="Change amount" variant="secondary" disabled={submitting} onPress={() => setStep({ kind: 'choose' })} />
        <Button label="Cancel" variant="ghost" disabled={submitting} onPress={() => router.back()} />
      </Screen>
    );
  }

  const amount = Number(amountText);
  const amountError = !amountText
    ? undefined
    : !Number.isInteger(amount) || amount < 1
      ? 'Enter a whole number of Eco Points.'
      : amount > available
        ? `You have ${available} available. Choose a smaller amount.` // UC 3.3.EX.1
        : undefined;
  const canReview = open && !!amountText && !amountError;

  return (
    <Screen scroll>
      <Header title="Milestone" leading="back" />

      <View style={styles.titleBlock}>
        <AppText variant="heading" accessibilityRole="header">
          {m.name}
        </AppText>
        <AppText color="textMuted">{m.organisation}</AppText>
        <MilestoneStatusBadge status={m.status} />
      </View>

      <Card label="Community progress">
        <MilestoneProgress milestone={m} />
        <AppText>
          <AppText style={styles.bold}>{m.current_points}</AppText> of {m.target_points} Eco Points
          {remaining > 0 && m.status === 'Active' ? ` · ${remaining} still needed` : ''}
        </AppText>
        {m.closing_date && (
          <AppText variant="small" color="textMuted">
            Closes {formatClosingDate(m.closing_date)}
          </AppText>
        )}
      </Card>

      {(m.description || m.expected_outcome) && (
        <Card label="About">
          {m.description && <AppText>{m.description}</AppText>}
          {m.expected_outcome && (
            <AppText variant="small" color="textMuted">
              Expected outcome: {m.expected_outcome}
            </AppText>
          )}
        </Card>
      )}

      {m.status === 'Verified' && (
        <Banner tone="info" title="Outcome verified">
          An administrator has checked the evidence that this outcome happened.
        </Banner>
      )}
      {m.status === 'Rejected' && (
        <Banner tone="warning" title="Verification rejected">
          The evidence for this milestone wasn't accepted, so the outcome isn't confirmed.
        </Banner>
      )}
      {m.status === 'AwaitingVerification' && (
        <Banner tone="info" title="Target reached">
          It's closed to contributions while an administrator checks the evidence.
        </Banner>
      )}
      {m.status === 'Active' && !open && (
        // UC 3.3.EX.2: past its closing date, or already full.
        <Banner tone="warning" title="Closed to contributions">
          This milestone has closed. Go back to pick another.
        </Banner>
      )}

      {open && !isVerified && (
        <Banner tone="warning" title="Verify your email to contribute">
          Contributions need a verified account.
        </Banner>
      )}
      {open && isVerified && available === 0 && (
        <Card label="Contribute">
          <AppText color="textMuted">
            You don't have any available Eco Points yet. They're added when a recycling drop is verified.
          </AppText>
          <Button label="Find a bin" variant="secondary" onPress={() => router.push('/find')} />
        </Card>
      )}
      {open && isVerified && available > 0 && (
        <Card label="Contribute">
          <AppText color="textMuted">You have {available} available Eco Points.</AppText>
          <View style={styles.chips}>
            {QUICK_AMOUNTS.filter((a) => a <= available).map((a) => (
              <Chip key={a} label={String(a)} selected={amountText === String(a)} onPress={() => setAmountText(String(a))} />
            ))}
            <Chip
              label={`Max (${Math.min(available, remaining)})`}
              selected={amountText === String(Math.min(available, remaining))}
              onPress={() => setAmountText(String(Math.min(available, remaining)))}
            />
          </View>
          <TextField
            label="Amount"
            value={amountText}
            onChangeText={(t) => setAmountText(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="Eco Points"
            error={amountError}
            hint={!amountError && amount > remaining ? `Only ${remaining} is needed to reach the target — the rest stays in your balance.` : undefined}
          />
          <Button
            label="Review contribution"
            disabled={!canReview}
            onPress={() => {
              setSubmitError(undefined);
              setStep({ kind: 'confirm', amount, requestId: newRequestId() });
            }}
          />
          <AppText variant="small" color="textFaint">
            This spends your available balance only. Your lifetime Eco Points, used for levels and the leaderboard, don't go down.
          </AppText>
        </Card>
      )}

      {history && history.length > 0 && (
        // UC 3.3.AC.4.
        <Card label="Your contributions">
          {history.map((c) => (
            <Row
              key={c.id}
              label={new Date(c.created_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
              value={c.amount}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <AppText color="textMuted" style={styles.fill}>
        {label}
      </AppText>
      <AppText variant={strong ? 'bodyStrong' : 'body'}>{value} Eco Points</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
