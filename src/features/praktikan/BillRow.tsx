import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import {
  BILL_STATUS_LABEL,
  type BillDisplayInfo,
  formatRupiah,
} from '@/features/praktikan/billFormat';
import { BillStatusBadge } from '@/features/praktikan/BillStatusBadge';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import type { Bill } from '@/types';

export type BillRowProps = {
  bill: Bill;
  display: BillDisplayInfo;
  onPress: () => void;
};

export function BillRow({ bill, display, onPress }: BillRowProps) {
  const nominalText = formatRupiah(bill.amount);
  const statusLabel = BILL_STATUS_LABEL[bill.status];

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Tagihan ${display.praktikumName}, ${display.sessionTopic}, terlambat ${bill.lateMinutes} menit, ${nominalText}, ${statusLabel}`}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.praktikum} numberOfLines={1}>
            {display.praktikumName}
          </Text>
          <BillStatusBadge status={bill.status} />
        </View>

        <Text style={styles.topic} numberOfLines={2}>
          {display.sessionTopic}
        </Text>

        <View style={styles.metaList}>
          <Text style={styles.metaText} numberOfLines={1}>
            {display.labName} · {display.sessionDateText}
          </Text>
          <Text style={styles.lateText}>
            Terlambat {bill.lateMinutes} menit
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.amount}>{nominalText}</Text>
          <Text style={styles.detailCue}>Lihat rincian</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  praktikum: {
    ...typography.heading,
    color: colors.primary,
    flex: 1,
  },
  topic: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  metaList: {
    gap: spacing.xs / 2,
  },
  metaText: {
    ...typography.caption,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  lateText: {
    ...typography.caption,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amount: {
    ...typography.heading,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  detailCue: {
    ...typography.label,
    color: colors.primary,
  },
});
