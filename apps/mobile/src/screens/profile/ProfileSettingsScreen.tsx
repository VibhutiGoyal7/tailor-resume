// The Profile tab, built to screens/tailor_screen_profile_settings.svg: an avatar
// (name initials) with the name + email, a list of settings rows, a "Log out" link,
// and a destructive "Delete account". Name comes from Resume basics, email from the
// account. Two rows (Resume basics, How this works) open their designed sub-screens;
// the rest have no finalized design yet and open a shared placeholder (flagged for
// the owner, build brief §8). Log out clears the session; Delete account cascades all
// data server-side (DELETE /account) then clears the session.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { ScreenContainer } from '../../components/ScreenContainer';
import { Button } from '../../components/ui/Button';
import { ErrorDialog } from '../../components/ErrorDialog';
import { useAuth } from '../../auth/AuthContext';
import { getAccount, deleteAccount } from '../../api/account';
import { getResumeBasics } from '../../api/bank';
import { initialsFromName } from '../../lib/resume';
import { errorToCopy, type ErrorCopy } from '../../errors/errorCopy';
import { logger } from '../../lib/logger';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ProfileSettings'>;

// The settings rows, top to bottom as in the design. `to` names a designed
// sub-screen; `placeholder` routes to the shared not-yet-designed screen with copy
// specific to that row (build brief §8: these four rows lack a finalized design).
type Row =
  | { label: string; to: 'ResumeBasics' | 'HowThisWorks' }
  | { label: string; placeholder: string };

const ROWS: Row[] = [
  { label: 'Account details', placeholder: 'Your account details will live here.' },
  { label: 'Password', placeholder: 'Changing your password will be available here soon.' },
  {
    label: 'Notifications',
    placeholder: "Tailor doesn't send notifications yet — controls will appear here when it does.",
  },
  { label: 'Resume basics', to: 'ResumeBasics' },
  { label: 'How this works', to: 'HowThisWorks' },
  { label: 'Legal and privacy', placeholder: 'Terms, privacy policy, and licenses will appear here.' },
];

export function ProfileSettingsScreen({ navigation }: Props) {
  const { signOut } = useAuth();
  const account = useQuery({ queryKey: ['account'], queryFn: getAccount });
  const basics = useQuery({ queryKey: ['bank', 'basics'], queryFn: getResumeBasics });

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState<'logout' | 'delete' | null>(null);
  const [dialog, setDialog] = useState<ErrorCopy | null>(null);

  const name = basics.data?.fullName?.trim() || '';
  const email = account.data?.email ?? '';
  const initials = initialsFromName(name) || (email ? email.charAt(0).toUpperCase() : '?');

  const onLogout = async () => {
    setBusy('logout');
    try {
      await signOut();
    } catch (err) {
      setDialog(errorToCopy(err));
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    setBusy('delete');
    try {
      await deleteAccount();
      logger.info('account deleted');
      // The account (and its tokens) are gone — clear the local session, which
      // returns the app to the auth stack.
      await signOut();
    } catch (err) {
      setDialog(errorToCopy(err));
      setBusy(null);
    }
  };

  const openRow = (row: Row) => {
    if ('to' in row) navigation.navigate(row.to);
    else navigation.navigate('ProfilePlaceholder', { title: row.label, note: row.placeholder });
  };

  return (
    <ScreenContainer scroll>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name} numberOfLines={1}>
            {name || 'Your profile'}
          </Text>
          {email ? (
            <Text style={styles.email} numberOfLines={1}>
              {email}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.rows}>
        {ROWS.map((row) => (
          <Pressable
            key={row.label}
            accessibilityRole="button"
            onPress={() => openRow(row)}
            style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
          >
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Chevron />
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onLogout}
        disabled={busy !== null}
        hitSlop={8}
        style={({ pressed }) => [styles.logout, pressed ? styles.pressed : null]}
      >
        <Text style={styles.logoutText}>{busy === 'logout' ? 'Logging out…' : 'Log out'}</Text>
      </Pressable>

      {confirmingDelete ? (
        <View style={styles.deleteConfirm}>
          <Text style={styles.confirmText}>
            Delete your account and all your data? This can&apos;t be undone.
          </Text>
          <View style={styles.confirmActions}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={() => setConfirmingDelete(false)}
              disabled={busy === 'delete'}
              style={styles.confirmAction}
            />
            <Pressable
              accessibilityRole="button"
              onPress={onDelete}
              disabled={busy === 'delete'}
              style={({ pressed }) => [styles.deleteBtn, pressed ? styles.pressed : null]}
            >
              <Text style={styles.deleteBtnText}>{busy === 'delete' ? 'Deleting…' : 'Delete'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirmingDelete(true)}
          style={({ pressed }) => [styles.deleteOutline, pressed ? styles.pressed : null]}
        >
          <Text style={styles.deleteOutlineText}>Delete account</Text>
        </Pressable>
      )}

      <ErrorDialog error={dialog} onDismiss={() => setDialog(null)} />
    </ScreenContainer>
  );
}

function Chevron() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M9 6 L15 12 L9 18"
        fill="none"
        stroke={colors.iconMuted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.ink, marginTop: spacing.sm },

  identity: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.badgeTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.heading, color: colors.accent },
  identityText: { flex: 1, marginLeft: spacing.lg },
  name: { ...typography.heading, color: colors.ink },
  email: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },

  rows: { marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  rowLabel: { ...typography.body, color: colors.ink },

  logout: { marginTop: spacing.xl, paddingVertical: spacing.sm },
  logoutText: { ...typography.bodyStrong, color: colors.accent },

  deleteOutline: {
    marginTop: spacing.lg,
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteOutlineText: { ...typography.bodyStrong, color: colors.dangerText },

  deleteConfirm: { marginTop: spacing.lg },
  confirmText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm },
  confirmActions: { flexDirection: 'row', gap: spacing.md },
  confirmAction: { flex: 1 },
  deleteBtn: {
    flex: 1,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { ...typography.bodyStrong, color: colors.background },

  pressed: { opacity: 0.7 },
});
