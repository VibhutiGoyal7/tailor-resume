// Labeled text input primitive. Pulls all styling from tokens (CLAUDE.md §5).
// `errorText` shows a per-field validation hint under the field (used with the
// backend's `fields[]` on VALIDATION_FAILED).
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface TextFieldProps extends TextInputProps {
  label: string;
  errorText?: string;
}

export function TextField({ label, errorText, style, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.iconMuted}
        style={[styles.input, errorText ? styles.inputError : null, style]}
        {...inputProps}
      />
      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    ...typography.body,
    color: colors.ink,
    backgroundColor: colors.background,
  },
  inputError: {
    borderColor: colors.accent,
  },
  error: {
    ...typography.caption,
    color: colors.accent,
    marginTop: spacing.xs,
  },
});
