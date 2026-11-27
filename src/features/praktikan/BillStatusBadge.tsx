import { StyleSheet, Text, View } from 'react-native';

import { BILL_STATUS_LABEL, BILL_STATUS_SYMBOL } from '@/features/praktikan/billFormat';
import { colors, type ColorPair } from '@/theme/colors';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import type { BillStatus } from '@/types';

export type BillStatusBadgeProps = {
  status: BillStatus;
  size?: 'sm' | 'md';
};

const TONE_BY_STATUS: Record<BillStatus, ColorPair> = {
  unpaid: colors.feedback.warning,
  pending: colors.feedback.info,
  success: colors.feedback.success,
  failed: colors.feedback.danger,
};

export function BillStatusBadge({ status, size = 'sm' }: BillStatusBadgeProps) {
  const tone = TONE_BY_STATUS[status];
  const label = BILL_STATUS_LABEL[status];
  const symbol = BILL_STATUS_SYMBOL[status];

  return (
    <View
      accessible
      accessibilityLabel={`Status tagihan: ${label}`}
      style={[
        styles.badge,
        size === 'md' && styles.badgeMd,
        { backgroundColor: tone.bg },
      ]}
    >
      <Text style={[styles.symbol, { color: tone.text }]}>{symbol}</Text>
      <Text style={[styles.label, size === 'md' && styles.labelMd, { color: tone.text }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  badgeMd: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  symbol: {
    ...typography.caption,
    fontWeight: '700',
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
  },
  labelMd: {
    ...typography.label,
  },
});
