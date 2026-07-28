// Welcome — the first auth-stack screen (screens/tailor_screen_welcome.svg):
// logo + wordmark, the signature-flourish motif, the value headline, and two
// CTAs that route into the combined auth screen in the right mode.
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Button } from '../../components/ui/Button';
import { LogoMark } from '../../components/brand/LogoMark';
import { SignatureFlourish } from '../../components/brand/motifs/SignatureFlourish';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <ScreenContainer center>
      <View style={styles.brand}>
        <LogoMark size={88} />
        <Text style={styles.wordmark}>Tailor</Text>
        <SignatureFlourish width={170} />
      </View>

      <Text style={styles.headline}>Shape your resume{'\n'}to fit the job.</Text>
      <Text style={styles.subtext}>
        Every application, tailored to what they're actually asking for.
      </Text>

      <View style={styles.actions}>
        <Button label="Get started" onPress={() => navigation.navigate('Auth', { mode: 'signup' })} />
        <View style={styles.secondary}>
          <Button
            label="I already have an account"
            variant="secondary"
            onPress={() => navigation.navigate('Auth', { mode: 'login' })}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  wordmark: {
    ...typography.display,
    color: colors.ink,
    marginTop: spacing.md,
  },
  headline: {
    ...typography.title,
    fontSize: 24,
    lineHeight: 30,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  subtext: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  actions: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.xxl,
  },
  secondary: {
    marginTop: spacing.md,
  },
});
