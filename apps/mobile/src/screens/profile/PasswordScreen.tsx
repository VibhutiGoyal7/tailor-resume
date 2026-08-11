// "Password" — change the account password (PATCH /account/password). No dedicated
// design SVG exists for this row yet (flagged in the build brief §8), so it's built on
// the established design system (header, TextField, Button, tokens). Client-side
// checks mirror the backend policy; the server owns the "current password is
// incorrect" check. On success the backend ends *other* sessions and rotates this
// device's tokens (via AuthContext.changePassword), so the user stays signed in here
// while other devices are logged out.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { FieldIssue } from '@tailor/shared-types';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { useAuth } from '../../auth/AuthContext';
import { isApiRequestError } from '../../api/errors';
import { validatePasswordChange, hasFieldErrors, type PasswordFieldErrors } from '../../lib/account';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, spacing, typography } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Password'>;

export function PasswordScreen({ navigation }: Props) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<PasswordFieldErrors>({});
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);
  const [done, setDone] = useState(false);

  const change = useMutation({
    mutationFn: () => changePassword(current.trim(), next),
    onSuccess: () => {
      logger.info('password changed');
      setDone(true);
    },
    onError: (err) => {
      // Wrong current password comes back as INVALID_CREDENTIALS; validation issues
      // as VALIDATION_FAILED with field paths (currentPassword / newPassword).
      if (isApiRequestError(err)) {
        if (err.code === 'INVALID_CREDENTIALS') {
          setFieldErrors({ current: 'Your current password is incorrect.' });
          return;
        }
        const mapped = mapServerFields(err.fields);
        if (hasFieldErrors(mapped)) {
          setFieldErrors(mapped);
          return;
        }
      }
      setDialog(errorToCopy(err));
    },
  });

  const submit = () => {
    const errors = validatePasswordChange({ current, next, confirm });
    setFieldErrors(errors);
    if (hasFieldErrors(errors)) return;
    change.mutate();
  };

  if (done) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Password changed" onBack={() => navigation.goBack()} />
        <View style={styles.doneBody}>
          <Text style={styles.doneTitle}>Your password is updated.</Text>
          <Text style={styles.doneText}>
            You&apos;re still signed in on this device. For your security, any other devices have
            been signed out.
          </Text>
          <Button label="Done" onPress={() => navigation.goBack()} style={styles.doneCta} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <ScreenHeader
        title="Password"
        subtitle="Changing your password signs out your other devices."
        onBack={() => navigation.goBack()}
      />

      <TextField
        label="Current password"
        value={current}
        onChangeText={setCurrent}
        placeholder="Your current password"
        secureTextEntry
        autoCapitalize="none"
        errorText={fieldErrors.current}
      />
      <TextField
        label="New password"
        value={next}
        onChangeText={setNext}
        placeholder="At least 8 characters"
        secureTextEntry
        autoCapitalize="none"
        errorText={fieldErrors.next}
      />
      <TextField
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Re-enter your new password"
        secureTextEntry
        autoCapitalize="none"
        errorText={fieldErrors.confirm}
      />

      <Button
        label="Update password"
        onPress={submit}
        loading={change.isPending}
        disabled={change.isPending}
        style={styles.cta}
      />

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

/** Map backend field paths (currentPassword / newPassword) to the form's fields. */
function mapServerFields(fields: FieldIssue[] | undefined): PasswordFieldErrors {
  const errors: PasswordFieldErrors = {};
  for (const f of fields ?? []) {
    if (f.field === 'currentPassword') errors.current = f.issue;
    if (f.field === 'newPassword') errors.next = f.issue;
  }
  return errors;
}

const styles = StyleSheet.create({
  cta: { marginTop: spacing.sm, marginBottom: spacing.xl },
  doneBody: { flex: 1, justifyContent: 'center', paddingBottom: spacing.xxxl },
  doneTitle: { ...typography.heading, color: colors.ink, textAlign: 'center' },
  doneText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  doneCta: { marginTop: spacing.xl },
});
