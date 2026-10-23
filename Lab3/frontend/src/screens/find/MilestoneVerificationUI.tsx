import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { api, toApiError } from '@/shared/api';
import type { MilestoneDecision, MilestoneForReview, MilestoneStatus } from '@/shared/api/proposed';
import { AppText, Banner, Button, Card, Header, Screen, TextField } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { AdminGate, NotOnServerYet } from './AdminGate';

// NFR-QUAL-12: each state has its own wording and colour, never colour alone.
const STATUS: Record<MilestoneStatus, { label: string; color: string }> = {
  Active: { label: 'Collecting', color: colors.textMuted },
  AwaitingVerification: { label: 'Awaiting verification', color: colors.warning },
  Verified: { label: 'Verified outcome', color: colors.success },
  VerificationRejected: { label: 'Verification rejected', color: colors.danger },
};

type Load = { kind: 'loading' } | { kind: 'ready' } | { kind: 'notAvailable' } | { kind: 'error'; message: string };

/** UC 7.1 — review partner evidence, then verify, reject or ask for more. Admin only. */
export default function MilestoneVerificationUI() {
  return (
    <AdminGate title="Milestone verification" need="admin">
      <Verification />
    </AdminGate>
  );
}

function Verification() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [items, setItems] = useState<MilestoneForReview[]>([]);
  const [selected, setSelected] = useState<MilestoneForReview | null>(null);
  const [notice, setNotice] = useState<string>();

  const fetchItems = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      setItems(await api.proposed.listMilestonesForReview());
      setLoad({ kind: 'ready' });
    } catch (e) {
      const err = toApiError(e);
      setLoad(err.code === 'not_available' ? { kind: 'notAvailable' } : { kind: 'error', message: err.message });
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  if (selected) {
    return (
      <Review
        milestone={selected}
        onBack={() => setSelected(null)}
        onDecided={(msg) => {
          setNotice(msg);
          setSelected(null);
          fetchItems();
        }}
      />
    );
  }

  const awaiting = items.filter((m) => m.status === 'AwaitingVerification');
  const decided = items.filter((m) => m.status === 'Verified' || m.status === 'VerificationRejected');

  return (
    <Screen scroll>
      <Header title="Milestone verification" leading="back" />
      {notice && <Banner tone="info">{notice}</Banner>}
      {load.kind === 'loading' && <ActivityIndicator color={colors.text} />}
      {load.kind === 'notAvailable' && <NotOnServerYet feature="Milestone verification" />}
      {load.kind === 'error' && (
        <>
          <Banner tone="error" title="Couldn't load milestones">
            {load.message}
          </Banner>
          <Button label="Try again" onPress={fetchItems} />
        </>
      )}
      {load.kind === 'ready' && (
        <>
          <AppText variant="label" color="textMuted">
            Awaiting verification ({awaiting.length})
          </AppText>
          {awaiting.length === 0 && <AppText color="textMuted">Nothing to review right now.</AppText>}
          {awaiting.map((m) => (
            <MilestoneRow key={m.id} m={m} onPress={() => setSelected(m)} />
          ))}
          {decided.length > 0 && (
            <>
              <AppText variant="label" color="textMuted">
                Decided
              </AppText>
              {/* UC 7.1.AC.3: view a past decision without changing it. */}
              {decided.map((m) => (
                <MilestoneRow key={m.id} m={m} onPress={() => setSelected(m)} />
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function MilestoneRow({ m, onPress }: { m: MilestoneForReview; onPress: () => void }) {
  const s = STATUS[m.status];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${m.name}, ${s.label}`} style={styles.row}>
      <View style={styles.fill}>
        <AppText variant="bodyStrong">{m.name}</AppText>
        <AppText variant="small" color="textMuted">
          {m.organisation} · {m.current_points.toLocaleString('en-SG')} / {m.target_points.toLocaleString('en-SG')} Eco Points
        </AppText>
      </View>
      <StatusPill status={m.status} />
    </Pressable>
  );
}

function Review({ milestone: m, onBack, onDecided }: { milestone: MilestoneForReview; onBack: () => void; onDecided: (msg: string) => void }) {
  const [pending, setPending] = useState<MilestoneDecision | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const decidable = m.status === 'AwaitingVerification';
  const needsReason = pending === 'reject' || pending === 'request_evidence';

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.proposed.decideMilestone(m.id, pending, reason.trim() || null);
      onDecided(
        pending === 'verify'
          ? `${m.name} is verified. Contributors will be notified.`
          : pending === 'reject'
            ? `${m.name} was rejected. It won't be shown as a completed outcome.`
            : `More evidence requested for ${m.name}. It stays awaiting verification.`,
      );
    } catch (e) {
      // UC 7.1.EX.2: another admin may have decided first — the server refuses and we show its message.
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const openEvidence = async () => {
    if (!m.evidence_url) return;
    try {
      await Linking.openURL(m.evidence_url);
    } catch {
      setError("Couldn't open the evidence. Try again."); // UC 7.1.EX.1
    }
  };

  return (
    <Screen scroll>
      <Header title={m.name} leading="back" onLeadingPress={onBack} />
      <StatusPill status={m.status} />
      <Card label="Milestone">
        <Field label="Organisation" value={m.organisation} />
        <Field label="Target" value={`${m.target_points.toLocaleString('en-SG')} Eco Points`} />
        <Field label="Contributed" value={`${m.current_points.toLocaleString('en-SG')} Eco Points`} />
        <Field label="Expected outcome" value={m.expected_outcome} />
        {m.closing_date && <Field label="Closing date" value={new Date(m.closing_date).toLocaleDateString('en-SG')} />}
        <AppText color="textMuted">{m.description}</AppText>
      </Card>
      <Card label="Evidence from the organisation">
        {m.evidence_notes ? <AppText>{m.evidence_notes}</AppText> : <AppText color="textMuted">No notes supplied.</AppText>}
        {m.evidence_url ? (
          <Button label="Open evidence" icon="external-link" variant="secondary" onPress={openEvidence} />
        ) : (
          <AppText color="textMuted">No evidence file attached yet.</AppText>
        )}
        {m.evidence_requested_note && (
          <Banner tone="info" title="More evidence was requested">
            {m.evidence_requested_note}
          </Banner>
        )}
      </Card>
      {!decidable && m.decided_at && (
        <Card label="Decision">
          <AppText>
            {STATUS[m.status].label} on {new Date(m.decided_at).toLocaleString('en-SG')}
          </AppText>
          {m.decision_reason && <AppText color="textMuted">Reason: {m.decision_reason}</AppText>}
        </Card>
      )}

      {error && <Banner tone="error">{error}</Banner>}

      {decidable && !pending && (
        <>
          <Button label="Verify outcome" onPress={() => setPending('verify')} />
          <Button label="Request more evidence" variant="secondary" onPress={() => setPending('request_evidence')} />
          <Button label="Reject" variant="ghost" onPress={() => setPending('reject')} />
        </>
      )}

      {decidable && pending && (
        // UC 7.1 step 7: confirm before recording the decision.
        <Card label="Confirm">
          <AppText variant="bodyStrong">
            {pending === 'verify'
              ? `Confirm that "${m.expected_outcome}" happened?`
              : pending === 'reject'
                ? 'Reject this outcome?'
                : 'Ask the organisation for more evidence?'}
          </AppText>
          {pending === 'verify' && (
            <AppText variant="small" color="textMuted">
              Users will see it as a verified real-world outcome and contributors will be notified.
            </AppText>
          )}
          {needsReason && (
            <TextField
              label={pending === 'reject' ? 'Reason (required)' : 'What evidence is needed? (required)'}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
              style={styles.multiline}
            />
          )}
          <Button
            label={pending === 'verify' ? 'Confirm verification' : pending === 'reject' ? 'Confirm rejection' : 'Send request'}
            onPress={confirm}
            loading={busy}
            disabled={needsReason && !reason.trim()}
          />
          <Button label="Cancel" variant="ghost" onPress={() => { setPending(null); setReason(''); }} disabled={busy} />
        </Card>
      )}
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <AppText variant="small" color="textMuted">
        {label}
      </AppText>
      <AppText style={styles.fieldValue}>{value}</AppText>
    </View>
  );
}

function StatusPill({ status }: { status: MilestoneStatus }) {
  const s = STATUS[status];
  return (
    <View style={[styles.pill, { borderColor: s.color }]}>
      <AppText variant="caption" style={{ color: s.color }}>
        {s.label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  field: { flexDirection: 'row', gap: spacing.md },
  fieldValue: { flex: 1, textAlign: 'right' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
