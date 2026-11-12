// Small form pieces shared by the administrator screens.
import { StyleSheet, View } from 'react-native';

import { AppText, Banner, Chip, TextField } from '@/shared/components';
import { spacing } from '@/shared/theme';

export type Notice = { tone: 'info' | 'error'; text: string } | null;

export function NoticeBanner({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <Banner tone={notice.tone}>{notice.text}</Banner>;
}

/** Single-choice chip row. */
export function ChoiceChips<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {label && (
        <AppText variant="small" color="textMuted" style={styles.label}>
          {label}
        </AppText>
      )}
      <View style={styles.wrap}>
        {options.map((o) => (
          <Chip key={String(o.value)} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

/** A text field that edits a number as text, so partial input like "1." or "" is allowed while typing. */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
  decimal = false,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  hint?: string;
  error?: string;
  decimal?: boolean;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={(t) => onChange(t.replace(decimal ? /[^0-9.\-]/g : /[^0-9]/g, ''))}
      keyboardType={decimal ? 'numbers-and-punctuation' : 'number-pad'}
      hint={hint}
      error={error}
    />
  );
}

/** Whole number within [min, max], or null. */
export function parseIntIn(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

export function parseNumberIn(text: string, min: number, max: number): number | null {
  const t = text.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

/** Strip control characters and trim (NFR-SEC-06); null for empty. */
export function cleanText(s: string, max = 500): string | null {
  const t = s.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date in Singapore as 'YYYY-MM-DD', offset by `days`. */
export function sgDate(days = 0, base = new Date()): string {
  const sgt = new Date(base.getTime() + 8 * 3600_000 + days * 86_400_000);
  return `${sgt.getUTCFullYear()}-${pad(sgt.getUTCMonth() + 1)}-${pad(sgt.getUTCDate())}`;
}

/** First day of the Singapore month containing `base`, shifted by `months`, as 'YYYY-MM-DD'. */
export function sgMonthStart(months = 0, base = new Date()): string {
  const sgt = new Date(base.getTime() + 8 * 3600_000);
  const d = new Date(Date.UTC(sgt.getUTCFullYear(), sgt.getUTCMonth() + months, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}

/** 'YYYY-MM-DD' that is a real calendar date. */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** ISO timestamp -> 'YYYY-MM-DD HH:MM' in Singapore time (for editing). */
export function toSgLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 'YYYY-MM-DD HH:MM' Singapore time -> ISO string with +08:00, or null if invalid. */
export function fromSgLocal(text: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/.exec(text.trim());
  if (!m || !isIsoDate(m[1]) || Number(m[2]) > 23 || Number(m[3]) > 59) return null;
  return `${m[1]}T${m[2]}:${m[3]}:00+08:00`;
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  label: { fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
