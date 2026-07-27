// Signup screen. Creates the account (201) but does NOT log in — the backend
// requires email verification first (build brief §5), so on success we show a
// "check your email" confirmation and route back to Login. The full verify-email
// deep-link handling lands in slice 2.
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

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

export function SignupScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCopy | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    try {
      await signUp(email.trim(), password);
      setDone(true);
    } catch (err) {
      logger.warn('signup failed');
      setError(errorToCopy(err));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.trim().length > 0 && password.length >= 8 && !busy;

  if (done) {
    return (
      <ScreenContainer center>
        <View style={styles.header}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a verification link to {email.trim()}. Verify it, then sign in.
          </Text>
        </View>
        <Button label="Back to sign in" onPress={() => navigation.navigate('Login')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer center>
      <View style={styles.header}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Build your Experience Bank once, tailor endlessly.</Text>
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
        autoComplete="password-new"
        textContentType="newPassword"
        placeholder="At least 8 characters"
      />

      <Button label="Create account" onPress={onSubmit} loading={busy} disabled={!canSubmit} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Text style={styles.link} onPress={() => navigation.navigate('Login')}>
          Sign in
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
    ...typography.title,
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
