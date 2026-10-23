import { useState, type ComponentProps, type ComponentRef, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '@/shared/theme';
import { AppText } from './AppText';

type Props = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ComponentProps<typeof Feather>['name'];
  /** Adds a show/hide toggle and masks input. */
  password?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
};

export function TextField({ label, hint, error, icon, password, style, onFocus, onBlur, ref, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? colors.danger : focused ? colors.text : colors.border;

  return (
    <View style={styles.wrap}>
      {label && (
        <AppText variant="small" color="textMuted" style={styles.label}>
          {label}
        </AppText>
      )}
      <View style={[styles.box, { borderColor }]}>
        {(icon || password) && <Feather name={icon ?? 'lock'} size={18} color={colors.textMuted} />}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={password && hidden}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, style]}
        />
        {password && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Feather name={hidden ? 'eye' : 'eye-off'} size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      {error ? (
        <AppText variant="small" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" color="textFaint">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { fontWeight: '600' },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  input: { ...typography.body, flex: 1, color: colors.text, paddingVertical: spacing.md },
});
