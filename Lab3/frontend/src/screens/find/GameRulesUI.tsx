import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { api, type QuestType } from '@/shared/api';
import type { BadgeCriterion, BadgeRule, GameRules, MaterialRewardRule, QuestRule, SeasonRule } from '@/shared/api/admin';
import { adminErrorMessage } from '@/shared/api/admin';
import { AppText, Button, Card, Header, Screen, TextField } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { AdminGate } from './AdminGate';
import { ChoiceChips, cleanText, fromSgLocal, NoticeBanner, NumberField, parseIntIn, toSgLocal, type Notice } from './adminBits';

type Editing =
  | { kind: 'quest'; item: QuestRule | null }
  | { kind: 'badge'; item: BadgeRule | null }
  | { kind: 'season'; item: SeasonRule | null }
  | null;

const QUEST_TYPES: { value: QuestType; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'one_time', label: 'One-time' },
];
const CRITERIA: { value: BadgeCriterion; label: string; unit: string }[] = [
  { value: 'verified_actions', label: 'Verified actions', unit: 'verified recycling actions' },
  { value: 'streak', label: 'Streak', unit: 'consecutive days' },
  { value: 'regions', label: 'Regions', unit: 'named regions visited' },
];

/** REQ-12.3 — point values per material, level thresholds, quests, badges and seasonal events. Administrators only. */
export default function GameRulesUI() {
  return (
    <AdminGate title="Game rules" need="admin">
      <Rules />
    </AdminGate>
  );
}

function Rules() {
  const [rules, setRules] = useState<GameRules | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<Editing>(null);

  const load = useCallback(async () => {
    try {
      setRules(await api.admin.getGameRules());
    } catch (e) {
      setNotice({ tone: 'error', text: adminErrorMessage(e) });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saved = (text: string) => {
    setEditing(null);
    setNotice({ tone: 'info', text });
    load();
  };

  if (editing?.kind === 'quest') return <QuestEditor quest={editing.item} onDone={(m) => (m ? saved(m) : setEditing(null))} />;
  if (editing?.kind === 'badge') return <BadgeEditor badge={editing.item} onDone={(m) => (m ? saved(m) : setEditing(null))} />;
  if (editing?.kind === 'season') return <SeasonEditor season={editing.item} onDone={(m) => (m ? saved(m) : setEditing(null))} />;

  return (
    <Screen scroll>
      <Header title="Game rules" leading="back" />
      <AppText color="textMuted">
        Changes apply to new rewards. Rewards already paid keep their recorded values, and users keep levels they've reached.
      </AppText>
      <NoticeBanner notice={notice} />
      {!rules && !notice && <ActivityIndicator color={colors.text} />}
      {rules && (
        <>
          <LevelStep xpStep={rules.xp_step} onSaved={saved} />

          <Card label="Rewards per item">
            {rules.materials.map((m) => (
              <MaterialRow key={m.material_id} rule={m} onSaved={saved} />
            ))}
          </Card>

          <Card label="Quests">
            {rules.quests.map((q) => (
              <ListRow
                key={q.id}
                title={q.title}
                detail={`${QUEST_TYPES.find((t) => t.value === q.quest_type)?.label ?? q.quest_type} · ${q.target_actions} action${q.target_actions === 1 ? '' : 's'} · +${q.reward_eco_points} pts, +${q.reward_xp} XP${q.is_active ? '' : ' · inactive'}`}
                onPress={() => setEditing({ kind: 'quest', item: q })}
              />
            ))}
            <Button label="Add a quest" variant="secondary" icon="plus" onPress={() => setEditing({ kind: 'quest', item: null })} />
          </Card>

          <Card label="Badges">
            {rules.badges.map((b) => (
              <ListRow
                key={b.id}
                title={b.name}
                detail={`${b.required_verified_actions} ${CRITERIA.find((c) => c.value === b.criterion)?.unit ?? b.criterion}`}
                onPress={() => setEditing({ kind: 'badge', item: b })}
              />
            ))}
            <Button label="Add a badge" variant="secondary" icon="plus" onPress={() => setEditing({ kind: 'badge', item: null })} />
          </Card>

          <Card label="Seasonal events">
            {rules.seasons.length === 0 && <AppText color="textMuted">No events yet.</AppText>}
            {rules.seasons.map((s) => (
              <ListRow
                key={s.id}
                title={s.name}
                detail={`×${s.multiplier} · ${toSgLocal(s.starts_at)} to ${toSgLocal(s.ends_at)}${s.multiplier === 1 ? ' · bonus off' : ''}`}
                onPress={() => setEditing({ kind: 'season', item: s })}
              />
            ))}
            <Button label="Add an event" variant="secondary" icon="plus" onPress={() => setEditing({ kind: 'season', item: null })} />
          </Card>
        </>
      )}
    </Screen>
  );
}

function ListRow({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Edit ${title}`} style={styles.row}>
      <View style={styles.fill}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="small" color="textMuted">
          {detail}
        </AppText>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function LevelStep({ xpStep, onSaved }: { xpStep: number; onSaved: (m: string) => void }) {
  const [value, setValue] = useState(String(xpStep));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = parseIntIn(value, 1, 1_000_000);
    if (n == null) return setError('A whole number from 1 to 1,000,000');
    setBusy(true);
    setError(undefined);
    try {
      await api.admin.setLevelStep(n);
      onSaved(`Levels now every ${n} XP.`);
    } catch (e) {
      setError(adminErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card label="Levels">
      <NumberField label="XP per level" value={value} onChange={setValue} error={error} hint="Level = 1 + XP ÷ this value" />
      <Button label="Save level step" variant="secondary" onPress={save} loading={busy} />
    </Card>
  );
}

function MaterialRow({ rule, onSaved }: { rule: MaterialRewardRule; onSaved: (m: string) => void }) {
  const [points, setPoints] = useState(String(rule.points_per_unit));
  const [xp, setXp] = useState(String(rule.xp_per_unit));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const changed = points !== String(rule.points_per_unit) || xp !== String(rule.xp_per_unit);
  const save = async () => {
    const p = parseIntIn(points, 1, 1000);
    const x = parseIntIn(xp, 1, 1000);
    if (p == null || x == null) return setError('Points and XP must be whole numbers from 1 to 1000');
    setBusy(true);
    setError(undefined);
    try {
      await api.admin.setMaterialReward(rule.material_id, p, x);
      onSaved(`${rule.name}: ${p} points and ${x} XP per item.`);
    } catch (e) {
      setError(adminErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.materialRow}>
      <AppText variant="bodyStrong" style={styles.materialName}>
        {rule.name}
      </AppText>
      <View style={styles.pair}>
        <View style={styles.fill}>
          <NumberField label="Points" value={points} onChange={setPoints} />
        </View>
        <View style={styles.fill}>
          <NumberField label="XP" value={xp} onChange={setXp} />
        </View>
      </View>
      {error && (
        <AppText variant="small" color="danger">
          {error}
        </AppText>
      )}
      {changed && <Button label={`Save ${rule.name}`} variant="secondary" onPress={save} loading={busy} />}
    </View>
  );
}

function EditorShell({ title, onCancel, children }: { title: string; onCancel: () => void; children: ReactNode }) {
  return (
    <Screen scroll>
      <Header title={title} leading="close" onLeadingPress={onCancel} />
      {children}
    </Screen>
  );
}

function QuestEditor({ quest, onDone }: { quest: QuestRule | null; onDone: (m?: string) => void }) {
  const [title, setTitle] = useState(quest?.title ?? '');
  const [description, setDescription] = useState(quest?.description ?? '');
  const [type, setType] = useState<QuestType>(quest?.quest_type ?? 'daily');
  const [target, setTarget] = useState(String(quest?.target_actions ?? 1));
  const [points, setPoints] = useState(String(quest?.reward_eco_points ?? 10));
  const [xp, setXp] = useState(String(quest?.reward_xp ?? 10));
  const [active, setActive] = useState(quest?.is_active ?? true);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const t = parseIntIn(target, 1, 1000);
    const p = parseIntIn(points, 0, 100000);
    const x = parseIntIn(xp, 0, 100000);
    const name = cleanText(title, 120);
    if (!name || t == null || p == null || x == null) {
      setNotice({ tone: 'error', text: 'A title, and whole numbers for the target and rewards, are required.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await api.admin.saveQuest(quest?.id ?? null, {
        title: name,
        description: cleanText(description, 300),
        quest_type: type,
        target_actions: t,
        reward_eco_points: p,
        reward_xp: x,
        is_active: active,
      });
      onDone(quest ? `Saved quest "${name}".` : `Added quest "${name}".`);
    } catch (e) {
      setNotice({ tone: 'error', text: adminErrorMessage(e) });
      setBusy(false);
    }
  };
  return (
    <EditorShell title={quest ? 'Edit quest' : 'New quest'} onCancel={() => onDone()}>
      <NoticeBanner notice={notice} />
      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={120} />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={300} />
      <ChoiceChips<QuestType> label="Repeats" value={type} onChange={setType} options={QUEST_TYPES} />
      <NumberField label="Verified recycling actions needed" value={target} onChange={setTarget} />
      <View style={styles.pair}>
        <View style={styles.fill}>
          <NumberField label="Reward points" value={points} onChange={setPoints} />
        </View>
        <View style={styles.fill}>
          <NumberField label="Reward XP" value={xp} onChange={setXp} />
        </View>
      </View>
      <View style={styles.switchRow}>
        <AppText variant="bodyStrong" style={styles.fill}>
          Active
        </AppText>
        <Switch value={active} onValueChange={setActive} accessibilityLabel="Active" trackColor={{ false: colors.borderStrong, true: colors.success }} thumbColor={colors.text} />
      </View>
      <Button label="Save quest" onPress={save} loading={busy} />
    </EditorShell>
  );
}

function BadgeEditor({ badge, onDone }: { badge: BadgeRule | null; onDone: (m?: string) => void }) {
  const [name, setName] = useState(badge?.name ?? '');
  const [description, setDescription] = useState(badge?.description ?? '');
  const [criterion, setCriterion] = useState<BadgeCriterion>(badge?.criterion ?? 'verified_actions');
  const [target, setTarget] = useState(String(badge?.required_verified_actions ?? 1));
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const unit = CRITERIA.find((c) => c.value === criterion)!.unit;
  const save = async () => {
    const t = parseIntIn(target, 1, 100000);
    const n = cleanText(name, 80);
    if (!n || t == null) {
      setNotice({ tone: 'error', text: 'A name and a whole-number target are required.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await api.admin.saveBadge(badge?.id ?? null, { name: n, description: cleanText(description, 300), criterion, target: t });
      onDone(`${badge ? 'Saved' : 'Added'} badge "${n}". Anyone who already qualifies has been awarded it.`);
    } catch (e) {
      setNotice({ tone: 'error', text: adminErrorMessage(e) });
      setBusy(false);
    }
  };
  return (
    <EditorShell title={badge ? 'Edit badge' : 'New badge'} onCancel={() => onDone()}>
      <NoticeBanner notice={notice} />
      <TextField label="Name" value={name} onChangeText={setName} maxLength={80} />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={300} />
      <ChoiceChips<BadgeCriterion> label="Earned by" value={criterion} onChange={setCriterion} options={CRITERIA} />
      <NumberField label={`Target (${unit})`} value={target} onChange={setTarget} />
      <AppText variant="small" color="textFaint">
        Saving applies to existing history: users who already meet the target receive the badge straight away.
      </AppText>
      <Button label="Save badge" onPress={save} loading={busy} />
    </EditorShell>
  );
}

function SeasonEditor({ season, onDone }: { season: SeasonRule | null; onDone: (m?: string) => void }) {
  const [name, setName] = useState(season?.name ?? '');
  const [starts, setStarts] = useState(season ? toSgLocal(season.starts_at) : '');
  const [ends, setEnds] = useState(season ? toSgLocal(season.ends_at) : '');
  const [multiplier, setMultiplier] = useState(String(season?.multiplier ?? 2));
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = cleanText(name, 80);
    const s = fromSgLocal(starts);
    const e = fromSgLocal(ends);
    const m = parseIntIn(multiplier, 1, 10);
    if (!n || !s || !e || m == null) {
      setNotice({ tone: 'error', text: 'A name, start and end as YYYY-MM-DD HH:MM, and a multiplier from 1 to 10 are required.' });
      return;
    }
    if (new Date(e) <= new Date(s)) {
      setNotice({ tone: 'error', text: 'The end must be after the start.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await api.admin.saveSeason(season?.id ?? null, { name: n, starts_at: s, ends_at: e, multiplier: m });
      onDone(`${season ? 'Saved' : 'Added'} event "${n}" (×${m}).`);
    } catch (err) {
      setNotice({ tone: 'error', text: adminErrorMessage(err) });
      setBusy(false);
    }
  };
  return (
    <EditorShell title={season ? 'Edit event' : 'New event'} onCancel={() => onDone()}>
      <NoticeBanner notice={notice} />
      <TextField label="Name" value={name} onChangeText={setName} maxLength={80} placeholder="e.g. Green Week" />
      <TextField label="Starts (Singapore time)" value={starts} onChangeText={setStarts} placeholder="2026-11-21 00:00" />
      <TextField label="Ends (Singapore time, not included)" value={ends} onChangeText={setEnds} placeholder="2026-11-28 00:00" />
      <NumberField label="Multiplier (1–10)" value={multiplier} onChange={setMultiplier} hint="Multiplies points and XP for actions submitted during the event. Set 1 to switch the bonus off." />
      <Button label="Save event" onPress={save} loading={busy} />
    </EditorShell>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pair: { flexDirection: 'row', gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  materialRow: { gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  materialName: { marginBottom: spacing.xs },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.sm, borderRadius: radius.md },
});
