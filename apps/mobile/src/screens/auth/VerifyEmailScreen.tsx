// Verify-email — the ADR-014 gate (screens/tailor_screen_verify_email.svg):
// the paper-airplane "sent" motif, a masked destination address, and a way back to
// log in once verified. Nothing past this works unverified (the backend rejects
// login until the email is confirmed).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Button } from '../../components/ui/Button';
import { PaperAirplane } from '../../components/brand/motifs/PaperAirplane';
import { ErrorDialog } from '../../components/ErrorDialog';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';
import type { ErrorCopy } from '../../errors/errorCopy';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyEmail'>;

/** Mask an email for display: `name@email.com` -> `n****@email.com`. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}****@${domain}`;
}

export function VerifyEmailScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  return (
    <ScreenContainer center>
      <View style={styles.art}>
        <PaperAirplane size={150} />
      </View>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.body}>We sent a verification link to</Text>
      <Text style={styles.email}>{maskEmail(email)}</Text>

      <View style={styles.cta}>
        <Button label="I've verified it" onPress={() => navigation.navigate('Auth', { mode: 'login' })} />
      </View>
      <Text
        style={styles.resend}
        onPress={() =>
          setDialog({
            title: 'Check your inbox and spam',
            message: "If the link still hasn't arrived, sign up again to trigger a new one.",
          })
        }
      >
        Didn't get it? <Text style={styles.resendLink}>Resend link</Text>
      </Text>

      <Text style={styles.note}>
        Nothing past this works until you verify — it keeps the tailoring pipeline from anonymous
        use.
      </Text>

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', marginBottom: spacing.xl },
  title: { ...typography.title, color: colors.ink, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  email: { ...typography.bodyStrong, color: colors.ink, textAlign: 'center', marginTop: spacing.xs },
  cta: { alignSelf: 'stretch', marginTop: spacing.xxl },
  resend: { ...typography.body, color: colors.accentInactive, textAlign: 'center', marginTop: spacing.xl },
  resendLink: { ...typography.bodyStrong, color: colors.accent },
  note: {
    ...typography.caption,
    color: colors.iconMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
});
