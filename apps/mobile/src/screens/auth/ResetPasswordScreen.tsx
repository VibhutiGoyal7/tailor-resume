// Reset password — the deep-link target from the reset email
// (screens/tailor_screen_reset_password.svg). Takes the one-time token from the
// link params, collects a new password (confirmed), and on success routes back to
// log in. If opened without a token, it explains how to get here.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { LogoHeader } from '../../components/brand/LogoHeader';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import * as authApi from '../../api/auth';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export function ResetPasswordScreen({ navigation, route }: Props) {
  const token = route.params?.token;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = !!token && password.length >= 8 && confirm === password && !busy;

  const onSubmit = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      setDialog({ title: 'Password updated', message: 'Log in with your new password.' });
    } catch (err) {
      setDialog(errorToCopy(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer scroll>
      <LogoHeader onBack={() => navigation.goBack()} />
      <Text style={styles.title}>Set a new password</Text>
      <Text style={styles.subtitle}>Make it something you'll remember.</Text>

      {token ? (
        <View style={styles.form}>
          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            placeholder="••••••••••"
          />
          <TextField
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="newPassword"
            placeholder="••••••••••"
            errorText={mismatch ? "Passwords don't match." : undefined}
          />
          <Text style={styles.helper}>At least 8 characters, one number.</Text>
          <Button label="Reset password" onPress={onSubmit} loading={busy} disabled={!canSubmit} />
        </View>
      ) : (
        <Text style={styles.note}>
          Open the reset link from your email on this device to set a new password.
        </Text>
      )}

      <ErrorDialog
        error={dialog}
        onDismiss={() => {
          const done = dialog?.title === 'Password updated';
          setDialog(null);
          if (done) navigation.navigate('Auth', { mode: 'login' });
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, fontSize: 22, color: colors.ink, marginTop: spacing.lg },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  form: { marginTop: spacing.xl },
  helper: { ...typography.caption, color: colors.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.md },
  note: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xl },
});
