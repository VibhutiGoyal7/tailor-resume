// Combined sign-up / log-in screen, matching screens/tailor_screen_signup_login.svg:
// logo header, a Create account | Log in segmented toggle, Continue with Google,
// an "or use email" divider, email + password fields, and the primary CTA — all on
// the ambient background. Copy follows the design's conversational tone (§9b).
// Auth plumbing is the same AuthContext; only presentation is to spec.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { LogoHeader } from '../../components/brand/LogoHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { GoogleButton } from '../../components/ui/GoogleButton';
import { OrDivider } from '../../components/ui/OrDivider';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { useAuth } from '../../auth/AuthContext';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AuthMode, AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Auth'>;

const COPY: Record<AuthMode, { title: string; subtitle: string; cta: string }> = {
  signup: {
    title: "Let's get you set up",
    subtitle: 'Your experience bank starts here.',
    cta: 'Create account',
  },
  login: {
    title: 'Welcome back',
    subtitle: "Let's tailor your next one.",
    cta: 'Log in',
  },
};

export function AuthScreen({ navigation, route }: Props) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>(route.params?.mode ?? 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  const onSubmit = async () => {
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password);
        navigation.navigate('VerifyEmail', { email: email.trim() });
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      logger.warn(`${mode} failed`);
      setDialog(errorToCopy(err));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = () =>
    setDialog({
      title: 'Google sign-in is coming soon',
      message: 'For now, use your email and a password to continue.',
    });

  const canSubmit =
    email.trim().length > 0 &&
    (mode === 'login' ? password.length > 0 : password.length >= 8) &&
    !busy;

  const copy = COPY[mode];

  return (
    <ScreenContainer scroll>
      <LogoHeader onBack={() => navigation.goBack()} />

      <SegmentedControl<AuthMode>
        options={[
          { key: 'signup', label: 'Create account' },
          { key: 'login', label: 'Log in' },
        ]}
        value={mode}
        onChange={setMode}
      />

      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.subtitle}>{copy.subtitle}</Text>

      <View style={styles.googleWrap}>
        <GoogleButton onPress={onGoogle} />
      </View>

      <OrDivider />

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
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={mode === 'signup' ? 'password-new' : 'password'}
        textContentType={mode === 'signup' ? 'newPassword' : 'password'}
        placeholder="••••••••••"
      />
      {mode === 'signup' ? (
        <Text style={styles.helper}>At least 8 characters, one number.</Text>
      ) : (
        <Text style={styles.forgot} onPress={() => navigation.navigate('ForgotPassword')}>
          Forgot password?
        </Text>
      )}

      <View style={styles.ctaWrap}>
        <Button label={copy.cta} onPress={onSubmit} loading={busy} disabled={!canSubmit} />
      </View>

      <Text style={styles.footer} onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
        {mode === 'signup' ? 'Already have an account? ' : 'New here? '}
        <Text style={styles.footerLink}>{mode === 'signup' ? 'Log in' : 'Create account'}</Text>
      </Text>

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, fontSize: 20, color: colors.ink, marginTop: spacing.xl },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  googleWrap: { marginTop: spacing.lg },
  helper: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  forgot: {
    ...typography.caption,
    color: colors.accent,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
    alignSelf: 'flex-end',
  },
  ctaWrap: { marginTop: spacing.md },
  footer: {
    ...typography.body,
    color: colors.accentInactive,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  footerLink: { ...typography.bodyStrong, color: colors.accent },
});
