// Login screen. Minimal-but-real: email + password → useAuth().signIn, errors via
// the shared ErrorDialog, a link to Signup. Email verification + forgot-password
// land in slice 2; this proves the auth gate end-to-end.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { useAuth } from '../../auth/AuthContext';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCopy | null>(null);

  const onSubmit = async () => {
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      logger.warn('login failed');
      setError(errorToCopy(err));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  return (
    <ScreenContainer center>
      <View style={styles.header}>
        <Text style={styles.title}>Tailor</Text>
        <Text style={styles.subtitle}>Sign in to tailor your resume to any job.</Text>
      </View>

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        placeholder="Your password"
      />

      <Button label="Sign in" onPress={onSubmit} loading={busy} disabled={!canSubmit} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>New here? </Text>
        <Text style={styles.link} onPress={() => navigation.navigate('Signup')}>
          Create an account
        </Text>
      </View>

      <ErrorDialog error={error} onDismiss={() => setError(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xxl,
    alignItems: 'center',
  },
  title: {
    ...typography.display,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  link: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
});
