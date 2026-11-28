import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppBar } from '@/components/ui/AppBar';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { SyncErrorState } from '@/components/ui/SyncErrorState';
import { OFFLINE_ACTION_HINT } from '@/features/asisten/writeErrorMessage';
import {
  BILL_STATUS_LABEL,
  formatRupiah,
  resolveBillDisplay,
} from '@/features/praktikan/billFormat';
import { BillStatusBadge } from '@/features/praktikan/BillStatusBadge';
import { useAppStore, useIsOnline, useLabs } from '@/store/appStore';
import {
  useBillById,
  useBillsSyncState,
  useDendaStore,
  useIsPayingBill,
  useMataKuliahMap,
} from '@/store/dendaStore';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { formatDateTime } from '@/utils/time';

const goBack = () =>
  router.canGoBack() ? router.back() : router.replace('/praktikan/tagihan');

function DetailField({
  label,
  value,
  tabular = false,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, tabular && styles.tabular]}>{value}</Text>
    </View>
  );
}

export default function PraktikanDetailTagihanScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const billId = Array.isArray(params.id) ? (params.id[0] ?? '') : (params.id ?? '');

  const bill = useBillById(billId);
  const billsSync = useBillsSyncState();
  const retryBillsSync = useDendaStore((state) => state.retryBillsSync);
  const createPayment = useDendaStore((state) => state.createPayment);
  const isPaying = useIsPayingBill(billId);
  const isOnline = useIsOnline();
  const sessions = useAppStore((state) => state.sessions);
  const labs = useLabs();
  const mataKuliahById = useMataKuliahMap();

  const [paymentError, setPaymentError] = useState<{ id: number; message: string } | null>(null);
  const payingRef = useRef(false);

  if (!bill) {
    const loading = billsSync === 'idle' || billsSync === 'loading';
    return (
      <View style={styles.container}>
        <AppBar subtitle="Detail Tagihan" canGoBack onGoBack={goBack} />
        <Screen edges={['left', 'right', 'bottom']}>
          <View style={styles.page}>
            {loading ? (
              <LoadingState label="Memuat rincian tagihan…" />
            ) : billsSync === 'error' ? (
              <SyncErrorState
                message="Gagal memuat rincian tagihan. Periksa koneksi lalu coba lagi."
                onRetry={retryBillsSync}
                retrying={false}
              />
            ) : (
              <EmptyState
                title="Tagihan tidak ditemukan"
                message="Tagihan mungkin tidak tersedia atau tautan tidak valid."
                action={{ label: 'Kembali ke daftar tagihan', onPress: goBack }}
              />
            )}
          </View>
        </Screen>
      </View>
    );
  }

  const session = sessions.find((s) => s.id === bill.sessionId);
  const lab = labs.find((l) => l.id === bill.labId);
  const mk = mataKuliahById[bill.mataKuliahId];
  const display = resolveBillDisplay(bill, session, lab, mk);
  const nominalText = formatRupiah(bill.amount);
  const canPay = bill.status === 'unpaid' || bill.status === 'failed';

  const handlePay = async () => {
    if (payingRef.current || !canPay || !isOnline) return;
    payingRef.current = true;
    setPaymentError(null);

    try {
      const res = await createPayment(bill.id);
      if (!res.ok) {
        const message =
          res.code === 'CONFLICT'
            ? res.message
            : 'Pembayaran belum bisa dimulai. Periksa koneksi lalu coba lagi.';
        setPaymentError((prev) => ({ id: (prev?.id ?? 0) + 1, message }));
        return;
      }

      try {
        await WebBrowser.openBrowserAsync(res.data.redirectUrl);
      } catch {
        setPaymentError((prev) => ({
          id: (prev?.id ?? 0) + 1,
          message: 'Halaman pembayaran gagal dibuka. Silakan coba lagi.',
        }));
      }
    } finally {
      payingRef.current = false;
    }
  };

  return (
    <View style={styles.container}>
      <AppBar subtitle="Detail Tagihan" canGoBack onGoBack={goBack} />
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.page}>
          {billsSync === 'error' ? (
            <SyncErrorState
              compact
              message="Sinkronisasi tagihan terganggu. Data di layar mungkin belum terbaru."
              onRetry={retryBillsSync}
              retrying={false}
            />
          ) : null}

          <Card>
            <View style={styles.heroHeader}>
              <BillStatusBadge status={bill.status} size="md" />
              <Text style={styles.amount}>{nominalText}</Text>
              <Text style={styles.praktikumTitle}>{display.praktikumName}</Text>
              <Text style={styles.topicSubtitle}>{display.sessionTopic}</Text>
            </View>
          </Card>

          {bill.status === 'pending' ? (
            <Banner
              tone="info"
              message="Menunggu konfirmasi pembayaran dari Midtrans."
            />
          ) : bill.status === 'success' ? (
            <Banner
              tone="success"
              message="Tagihan denda ini sudah lunas."
            />
          ) : bill.status === 'failed' ? (
            <Banner
              tone="danger"
              message="Pembayaran belum berhasil. Silakan bayar ulang."
            />
          ) : null}

          {paymentError ? (
            <Banner key={paymentError.id} tone="danger" message={paymentError.message} />
          ) : null}

          {canPay ? (
            <View style={styles.paySection}>
              <Button
                label={bill.status === 'failed' ? 'Bayar ulang' : 'Bayar'}
                onPress={() => void handlePay()}
                loading={isPaying}
                disabled={!isOnline}
              />
              {isOnline ? null : <Text style={styles.footerNote}>{OFFLINE_ACTION_HINT}</Text>}
            </View>
          ) : null}

          <Card>
            <View style={styles.fields}>
              <Text role="heading" style={styles.sectionTitle}>
                Rincian Tagihan
              </Text>
              <DetailField label="Praktikum" value={display.praktikumName} />
              <DetailField label="Sesi" value={display.sessionTopic} />
              <DetailField label="Laboratorium" value={display.labName} />
              <DetailField label="Tanggal & Waktu Sesi" value={display.sessionDateText} tabular />
              <DetailField
                label="Keterlambatan"
                value={`Terlambat ${bill.lateMinutes} menit`}
                tabular
              />
              <DetailField label="Nominal Denda" value={nominalText} tabular />
              <DetailField label="Status" value={BILL_STATUS_LABEL[bill.status]} />
              <DetailField label="Tagihan Dibuat" value={display.createdDateText} tabular />
              {bill.paidAt ? (
                <DetailField label="Waktu Lunas" value={formatDateTime(bill.paidAt)} tabular />
              ) : null}
            </View>
          </Card>

          <Text style={styles.footerNote}>
            Pembayaran denda tidak mengubah status kehadiranmu pada sesi praktikum ini.
          </Text>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  page: {
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  heroHeader: {
    gap: spacing.sm,
  },
  amount: {
    ...typography.display,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
  praktikumTitle: {
    ...typography.heading,
    color: colors.text,
  },
  topicSubtitle: {
    ...typography.body,
    color: colors.textMuted,
  },
  sectionTitle: {
    ...typography.heading,
    color: colors.text,
  },
  fields: {
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  fieldValue: {
    ...typography.body,
    color: colors.text,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  footerNote: {
    ...typography.caption,
    color: colors.textMuted,
  },
  paySection: {
    gap: spacing.sm,
  },
});
