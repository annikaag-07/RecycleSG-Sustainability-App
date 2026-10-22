import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { api, toApiError } from '@/shared/api';
import type { ContentAction, ModerationItem, UserAction } from '@/shared/api/proposed';
import { AppText, Banner, Button, Card, Chip, Header, Screen, TextField } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { AdminGate, NotOnServerYet } from './AdminGate';

type Load = { kind: 'loading' } | { kind: 'ready' } | { kind: 'notAvailable' } | { kind: 'error'; message: string };

const CONTENT_ACTIONS: { key: ContentAction; label: string }[] = [
  { key: 'dismiss', label: 'Keep (dismiss reports)' },
  { key: 'hide', label: 'Hide' },
  { key: 'delete', label: 'Delete' },
];
const USER_ACTIONS: { key: UserAction; label: string }[] = [
  { key: 'none', label: 'No action' },
  { key: 'warn', label: 'Warn' },
  { key: 'suspend', label: 'Suspend' },
  { key: 'ban', label: 'Ban' },
];

/** REQ-11.3 / REQ-11.4 — reported posts and comments, most-reported first. Moderators and admins only. */
export default function ModerationQueueUI() {
  return (
    <AdminGate title="Moderation queue" need="moderator">
      <Queue />
    </AdminGate>
  );
}

function Queue() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [notice, setNotice] = useState<string>();

  const fetchQueue = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const rows = await api.proposed.moderationQueue();
      // REQ-11.3: ordered by report volume (server should already do this; enforce here too).
      setItems([...rows].sort((a, b) => b.report_count - a.report_count));
      setLoad({ kind: 'ready' });
    } catch (e) {
      const err = toApiError(e);
      setLoad(err.code === 'not_available' ? { kind: 'notAvailable' } : { kind: 'error', message: err.message });
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return (
    <Screen scroll>
      <Header title="Moderation queue" leading="back" />
      {notice && <Banner tone="info">{notice}</Banner>}
      {load.kind === 'loading' && <ActivityIndicator color={colors.text} />}
      {load.kind === 'notAvailable' && <NotOnServerYet feature="Moderation" />}
      {load.kind === 'error' && (
        <>
          <Banner tone="error" title="Couldn't load the queue">
            {load.message}
          </Banner>
          <Button label="Try again" onPress={fetchQueue} />
        </>
      )}
      {load.kind === 'ready' && items.length === 0 && <AppText color="textMuted">No reported content. Nice.</AppText>}
      {load.kind === 'ready' &&
        items.map((item) => (
          <QueueItem
            key={`${item.target_type}:${item.target_id}`}
            item={item}
            onResolved={(msg) => {
              setNotice(msg);
              setItems((list) => list.filter((i) => !(i.target_type === item.target_type && i.target_id === item.target_id)));
            }}
          />
        ))}
    </Screen>
  );
}

function QueueItem({ item, onResolved }: { item: ModerationItem; onResolved: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<ContentAction>('hide');
  const [user, setUser] = useState<UserAction>('none');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const severe = content === 'delete' || user === 'suspend' || user === 'ban';

  const apply = async () => {
    // Deleting content or suspending/banning a user gets an extra confirmation step.
    if (severe && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api.proposed.moderateContent(item, content, user, note.trim() || null);
      onResolved(`${capitalise(item.target_type)} by ${item.author_name}: ${CONTENT_ACTIONS.find((c) => c.key === content)!.label.toLowerCase()}${user !== 'none' ? `, user ${user === 'ban' ? 'banned' : user === 'suspend' ? 'suspended' : 'warned'}` : ''}.`);
    } catch (e) {
      setError(toApiError(e).message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={styles.headRow}>
        <View style={styles.typePill}>
          <AppText variant="caption" color="textMuted">
            {item.target_type}
          </AppText>
        </View>
        <AppText variant="bodyStrong" style={styles.fill}>
          {item.author_name}
        </AppText>
        <AppText variant="bodyStrong" style={{ color: colors.warning }} accessibilityLabel={`${item.report_count} reports`}>
          {item.report_count} report{item.report_count === 1 ? '' : 's'}
        </AppText>
      </View>
      {/* User content is shown as plain text; React escapes it, so reported HTML can't run (NFR-SEC-06). */}
      <AppText color="textMuted" numberOfLines={open ? undefined : 3}>
        “{item.excerpt}”
      </AppText>
      <View style={styles.chips}>
        {item.reasons.map((r) => (
          <Chip key={r} label={r} tone="notAccepted" />
        ))}
      </View>
      <AppText variant="small" color="textFaint">
        First reported {new Date(item.first_reported_at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </AppText>

      {!open ? (
        <Button label="Review" variant="secondary" onPress={() => setOpen(true)} />
      ) : (
        <>
          <AppText variant="label" color="textMuted">
            Content
          </AppText>
          <View style={styles.chips}>
            {CONTENT_ACTIONS.map((a) => (
              <Chip key={a.key} label={a.label} selected={content === a.key} onPress={() => { setContent(a.key); setConfirming(false); }} />
            ))}
          </View>
          <AppText variant="label" color="textMuted">
            Author
          </AppText>
          <View style={styles.chips}>
            {USER_ACTIONS.map((a) => (
              <Chip key={a.key} label={a.label} selected={user === a.key} onPress={() => { setUser(a.key); setConfirming(false); }} />
            ))}
          </View>
          <TextField label="Note for the record (optional)" value={note} onChangeText={setNote} maxLength={300} />
          {error && <Banner tone="error">{error}</Banner>}
          {confirming && (
            <Banner tone="warning" title="Are you sure?">
              {content === 'delete' ? 'The content will be permanently deleted. ' : ''}
              {user === 'ban' ? 'The author will be banned. ' : user === 'suspend' ? 'The author will be suspended. ' : ''}
              Tap again to confirm.
            </Banner>
          )}
          <Button label={confirming ? 'Confirm' : 'Apply'} variant={confirming ? 'danger' : 'primary'} onPress={apply} loading={busy} />
          <Button label="Cancel" variant="ghost" onPress={() => { setOpen(false); setConfirming(false); }} disabled={busy} />
        </>
      )}
    </Card>
  );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typePill: { backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
