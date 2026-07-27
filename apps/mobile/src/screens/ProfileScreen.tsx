// Profile & settings. Account actions (change password, delete account, notif
// placeholder) land in slice 5; Sign Out is wired now so the auth gate is
// demoable both directions from slice 1.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { ErrorDialog } from '../components/ErrorDialog';
import { useAuth } from '../auth/AuthContext';
import { errorToCopy, type ErrorCopy } from '../errors/errorCopy';
import { colors, spacing, typography } from '../theme/tokens';

export function ProfileScreen() {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCopy | null>(null);

  const onSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
    } catch (err) {
      setError(errorToCopy(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.body}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.note}>Account settings land here — Milestone 8, slice 5.</Text>
      </View>
      <Button label="Sign out" variant="secondary" onPress={onSignOut} loading={busy} />
      <ErrorDialog error={error} onDismiss={() => setError(null)} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { ...typography.title, color: colors.ink, marginBottom: spacing.sm },
  note: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
