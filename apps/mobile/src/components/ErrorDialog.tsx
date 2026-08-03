// The ONE error surface (CLAUDE.md §4). Every error shown to the user renders
// through this component — no screen builds its own Alert.alert with custom copy.
// Screens resolve a thrown value to { title, message } via errorCopy.errorToCopy,
// hold it in state, and render <ErrorDialog> with an onDismiss.
import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';
import type { ErrorCopy } from '../errors/errorCopy';
import { Button } from './ui/Button';

interface ErrorDialogProps {
  /** The resolved copy to show; when null the dialog is hidden. */
  error: ErrorCopy | null;
  onDismiss: () => void;
}

export function ErrorDialog({ error, onDismiss }: ErrorDialogProps) {
  return (
    <Modal visible={error !== null} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{error?.title}</Text>
          <Text style={styles.message}>{error?.message}</Text>
          <Button label="OK" onPress={onDismiss} style={styles.button} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(29, 34, 38, 0.45)', // ink @ 45% — scrim
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.background,
    padding: spacing.xl,
    ...radii.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  title: {
    ...typography.heading,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  button: {
    alignSelf: 'flex-end',
    minWidth: 96,
  },
});
