import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { AppBar } from '@/components/ui/AppBar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { SyncErrorState } from '@/components/ui/SyncErrorState';
import { formatRupiah, resolveBillDisplay } from '@/features/praktikan/billFormat';
import { BillRow } from '@/features/praktikan/BillRow';
import { useAppStore, useLabs } from '@/store/appStore';
import {
  useBills,
  useBillsSyncState,
  useDendaStore,
  useMataKuliahMap,
} from '@/store/dendaStore';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import type { Bill } from '@/types';

type BillFilter = 'all' | 'active' | 'paid';

const FILTER_LIST: readonly BillFilter[] = ['all', 'active', 'paid'];

const FILTER_LABEL: Record<BillFilter, string> = {
  all: 'Semua',
  active: 'Belum lunas',
  paid: 'Lunas',
};

const BORDER_WIDTH = 1;

function matchesFilter(bill: Bill, filter: BillFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'paid') return bill.status === 'success';
  return bill.status !== 'success';
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

const goBack = () =>
  router.canGoBack() ? router.back() : router.replace('/praktikan/jadwal');

export default function PraktikanTagihanListScreen() {
  const bills = useBills();
  const billsSync = useBillsSyncState();
  const retryBillsSync = useDendaStore((state) => state.retryBillsSync);
  const sessions = useAppStore((state) => state.sessions);
  const labs = useLabs();
  const mataKuliahById = useMataKuliahMap();

  const [filter, setFilter] = useState<BillFilter>('all');

  const sessionById = useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions],
  );
  const labById = useMemo(() => new Map(labs.map((l) => [l.id, l])), [labs]);

  const counts = useMemo(() => {
    let active = 0;
    let paid = 0;
    let activeNominal = 0;
    for (const bill of bills) {
      if (bill.status === 'success') {
        paid += 1;
      } else {
        active += 1;
        activeNominal += bill.amount;
      }
    }
    return {
      all: bills.length,
      active,
      paid,
      activeNominal,
    };
  }, [bills]);

  const filteredBills = useMemo(
    () => bills.filter((bill) => matchesFilter(bill, filter)),
    [bills, filter],
  );

  const loadingInitial =
    (billsSync === 'idle' || billsSync === 'loading') && bills.length === 0;
  const syncError = billsSync === 'error';

  const emptyStateProps =
    filter === 'all'
      ? {
          title: 'Belum ada tagihan denda',
          message: 'Tagihan muncul bila presensi melewati batas toleransi keterlambatan.',
        }
      : {
          title:
            filter === 'active'
              ? 'Tidak ada tagihan belum lunas'
              : 'Belum ada tagihan lunas',
          action: {
            label: 'Tampilkan semua tagihan',
            onPress: () => setFilter('all'),
          },
        };

  return (
    <View style={styles.container}>
      <AppBar subtitle="Tagihan Denda" canGoBack onGoBack={goBack} />

      <Screen scroll={false} edges={['left', 'right', 'bottom']} noPadding>
        <FlatList
          data={filteredBills}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const session = sessionById.get(item.sessionId);
            const lab = labById.get(item.labId);
            const mk = mataKuliahById[item.mataKuliahId];
            return (
              <BillRow
                bill={item}
                display={resolveBillDisplay(item, session, lab, mk)}
                onPress={() =>
                  router.push({
                    pathname: '/praktikan/tagihan/[id]',
                    params: { id: item.id },
                  })
                }
              />
            );
          }}
          ItemSeparatorComponent={ListSeparator}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <Card>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Total belum lunas</Text>
                    <Text style={styles.summaryAmount}>
                      {formatRupiah(counts.activeNominal)}
                    </Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryCountBox}>
                    <Text style={styles.summaryCount}>{counts.active}</Text>
                    <Text style={styles.summaryLabel}>Tagihan aktif</Text>
                  </View>
                </View>
              </Card>

              <View
                role="radiogroup"
                aria-label="Filter status tagihan"
                style={styles.filterRow}
              >
                {FILTER_LIST.map((item) => (
                  <Chip
                    key={item}
                    label={`${FILTER_LABEL[item]} (${counts[item]})`}
                    selected={filter === item}
                    onPress={() => setFilter(item)}
                  />
                ))}
              </View>

              {syncError ? (
                <SyncErrorState
                  compact={bills.length > 0}
                  message="Gagal memuat daftar tagihan. Periksa koneksi lalu coba lagi."
                  onRetry={retryBillsSync}
                  retrying={false}
                />
              ) : null}
            </View>
          }
          ListEmptyComponent={
            syncError && bills.length === 0 ? undefined : loadingInitial ? (
              <LoadingState label="Memuat tagihan denda…" />
            ) : (
              <EmptyState
                title={emptyStateProps.title}
                message={emptyStateProps.message}
                action={emptyStateProps.action}
              />
            )
          }
        />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryItem: {
    flex: 1,
    gap: spacing.xs,
  },
  summaryDivider: {
    width: BORDER_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  summaryCountBox: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  summaryAmount: {
    ...typography.title,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  summaryCount: {
    ...typography.title,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  separator: {
    height: spacing.sm,
  },
});
