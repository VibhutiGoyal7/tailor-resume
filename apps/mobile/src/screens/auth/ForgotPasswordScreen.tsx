// Forgot password — request a reset link. Reached from the log-in mode of the
// auth screen. On success we show a neutral "check your email" confirmation (the
// backend always returns 200 so we never reveal whether an email exists).
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

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  const onSubmit = async () => {
    setBusy(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setDialog(errorToCopy(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <ScreenContainer center>
        <LogoHeader onBack={() => navigation.goBack()} />
        <View style={styles.confirm}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            If an account exists for {email.trim()}, a reset link is on its way.
          </Text>
        </View>
        <Button label="Back to log in" onPress={() => navigation.navigate('Auth', { mode: 'login' })} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <LogoHeader onBack={() => navigation.goBack()} />
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.subtitle}>We'll email you a link to set a new one.</Text>
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="name@email.com"
        />
        <Button
          label="Send reset link"
          onPress={onSubmit}
          loading={busy}
          disabled={email.trim().length === 0 || busy}
        />
      </View>
      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, fontSize: 22, color: colors.ink, marginTop: spacing.lg },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  form: { marginTop: spacing.xl },
  confirm: { alignItems: 'center', marginVertical: spacing.xxl },
});
