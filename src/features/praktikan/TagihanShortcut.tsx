import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PRESSED_OPACITY } from '@/components/ui/pressable';
import type { SyncStatus } from '@/store/sync';
import { colors } from '@/theme/colors';
import { layout, radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

export type TagihanShortcutProps = {
  unpaidCount: number;
  totalCount: number;
  syncStatus: SyncStatus;
  onPress: () => void;
};

const BORDER_WIDTH = 1;

export function TagihanShortcut({
  unpaidCount,
  totalCount,
  syncStatus,
  onPress,
}: TagihanShortcutProps) {
  let rightText = 'Tidak ada tagihan';
  let isAlert = false;

  if (syncStatus === 'loading' || syncStatus === 'idle') {
    rightText = totalCount > 0 ? `${totalCount} tagihan` : 'Memuat…';
  } else if (syncStatus === 'error' && totalCount === 0) {
    rightText = 'Lihat tagihan';
  } else if (unpaidCount > 0) {
    rightText = `${unpaidCount} belum dibayar`;
    isAlert = true;
  } else if (totalCount > 0) {
    rightText = 'Semua lunas';
  }

  return (
    <Pressable
      onPress={onPress}
      role="button"
      aria-label={`Tagihan denda, ${rightText}`}
      style={({ pressed }) => [styles.button, pressed && { opacity: PRESSED_OPACITY }]}
    >
      <Text style={styles.label}>Tagihan Denda</Text>
      <View style={styles.spacer} />
      {isAlert ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{rightText}</Text>
        </View>
      ) : (
        <Text style={styles.hint}>{rightText}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: BORDER_WIDTH,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  label: {
    ...typography.label,
    color: colors.text,
  },
  spacer: {
    flex: 1,
  },
  badge: {
    backgroundColor: colors.feedback.warning.bg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.feedback.warning.text,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
});
