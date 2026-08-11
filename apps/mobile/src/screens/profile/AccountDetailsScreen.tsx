// "Account details" — a read-only view of the signed-in account (GET /account):
// email, verification status, and when the account was created. No dedicated design
// SVG exists for this row yet (flagged in the build brief §8), so it's built on the
// established design system — the same header, tokens, and label/value rows used
// across the app — rather than a bespoke layout.
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenHeader } from '../../components/ScreenHeader';
import { getAccount } from '../../api/account';
import { formatJoinDate } from '../../lib/account';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'AccountDetails'>;

export function AccountDetailsScreen({ navigation }: Props) {
  const account = useQuery({ queryKey: ['account'], queryFn: getAccount });

  return (
    <ScreenContainer scroll>
      <ScreenHeader title="Account details" onBack={() => navigation.goBack()} />

      {account.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : account.isError || !account.data ? (
        <Text style={styles.meta}>Couldn&apos;t load your account details. Please try again.</Text>
      ) : (
        <View style={styles.card}>
          <Field label="Email" value={account.data.email} />
          <Divider />
          <Field
            label="Email status"
            value={account.data.emailVerified ? 'Verified' : 'Not verified'}
            tint={account.data.emailVerified ? colors.accent : colors.textSecondary}
          />
          <Divider />
          <Field label="Member since" value={formatJoinDate(account.data.createdAt)} />
        </View>
      )}
    </ScreenContainer>
  );
}

function Field({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, tint ? { color: tint } : null]}>{value || '—'}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  meta: { ...typography.body, color: colors.textSecondary, marginTop: spacing.lg },
  card: {
    marginTop: spacing.sm,
    backgroundColor: colors.fieldBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    ...radii.card,
  },
  field: { paddingVertical: spacing.lg },
  fieldLabel: { ...typography.caption, color: colors.textSecondary },
  fieldValue: { ...typography.body, color: colors.ink, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.cardBorder },
});
