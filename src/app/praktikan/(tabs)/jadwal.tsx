import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { isLabsLoading, pickLabName } from '@/components/session/labText';
import { SessionRow } from '@/components/session/SessionRow';
import { AppBar } from '@/components/ui/AppBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { IdentityCard } from '@/components/ui/IdentityCard';
import { LoadingState } from '@/components/ui/LoadingState';
import { PRESSED_OPACITY } from '@/components/ui/pressable';
import { Screen } from '@/components/ui/Screen';
import { SyncErrorState } from '@/components/ui/SyncErrorState';
import { useSyncRetry } from '@/features/asisten/useSyncRetry';
import { TagihanShortcut } from '@/features/praktikan/TagihanShortcut';
import {
  useAppStore,
  useAttendanceByUser,
  useCurrentUser,
  useIzinByUser,
  useLabs,
  useSessionsForUser,
  useSyncState,
} from '@/store/appStore';
import {
  useBills,
  useBillsSyncState,
  useUnpaidBillsCount,
} from '@/store/dendaStore';
import { colors } from '@/theme/colors';
import { layout, radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

const JADWAL_SYNC_KEYS = ['sessions'] as const;

function ListSeparator() {
  return <View style={styles.separator} />;
}

export default function JadwalScreen() {
  const currentUser = useCurrentUser();
  const userId = currentUser?.id ?? '';
  const logout = useAppStore((state) => state.logout);
  const sessions = useSessionsForUser(userId);
  const attendances = useAttendanceByUser(userId);
  const izinList = useIzinByUser(userId);
  const labs = useLabs();
  const labsLoading = isLabsLoading(useSyncState('labs'));

  // FR-03: lookup labId -> nama lab sekali per perubahan labs, bukan hook per baris.
  const labNameById = useMemo(() => new Map(labs.map((lab) => [lab.id, lab.nama])), [labs]);

  const sessionsSync = useSyncState('sessions');
  const sessionsRetry = useSyncRetry(JADWAL_SYNC_KEYS);
  const bills = useBills();
  const billsSync = useBillsSyncState();
  const unpaidBillsCount = useUnpaidBillsCount();
  const syncError = sessionsSync === 'error';
  const loadingInitial = sessionsSync === 'loading' && sessions.length === 0;

  const attendedSessionIds = useMemo(
    () => new Set(attendances.map((a) => a.sessionId)),
    [attendances],
  );

  const approvedIzinSessionIds = useMemo(
    () => new Set(izinList.filter((i) => i.status === 'approved').map((i) => i.sessionId)),
    [izinList],
  );

  const activeOpenSessions = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.status === 'open' &&
          !attendedSessionIds.has(s.id) &&
          !approvedIzinSessionIds.has(s.id),
      ),
    [sessions, attendedSessionIds, approvedIzinSessionIds],
  );

  const userInitials = useMemo(() => {
    if (!currentUser?.name) return '?';
    const parts = currentUser.name.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }, [currentUser]);

  function handleOpenProfile() {
    router.push('/praktikan/profil');
  }

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/login');
  }

  if (!currentUser) {
    return (
      <View style={styles.container}>
        <AppBar subtitle="Jadwal" />
        <Screen edges={['left', 'right', 'bottom']}>
          <EmptyState
            title="Identitas tidak ditemukan"
            message="Silakan masuk kembali ke akun praktikan."
            action={{ label: 'Masuk', onPress: () => router.replace('/(auth)/login') }}
          />
        </Screen>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppBar
        subtitle="Jadwal Praktikum"
        rightAction={
          <Pressable
            onPress={handleOpenProfile}
            role="button"
            aria-label="Profil praktikan"
            style={({ pressed }) => [
              styles.avatarButton,
              pressed && { opacity: PRESSED_OPACITY },
            ]}
          >
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{userInitials}</Text>
            </View>
          </Pressable>
        }
      />

      <Screen scroll={false} edges={['left', 'right']} noPadding>
        <View style={styles.screenInner}>
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const attended = attendedSessionIds.has(item.id);
              const izinApproved = approvedIzinSessionIds.has(item.id);
              const isOpen = item.status === 'open' && !attended && !izinApproved;

              let footerText: string | undefined;
              if (attended) {
                footerText = 'Sudah presensi';
              } else if (izinApproved) {
                footerText = 'Izin disetujui';
              } else if (isOpen) {
                footerText = 'Sedang dibuka • Tekan untuk presensi';
              }

              return (
                <SessionRow
                  session={item}
                  onPress={() =>
                    router.push({
                      pathname: '/praktikan/sesi/[id]',
                      params: { id: item.id },
                    })
                  }
                  footerText={footerText}
                  labName={pickLabName(
                    item.labId,
                    item.labId ? labNameById.get(item.labId) : undefined,
                    labsLoading,
                  )}
                />
              );
            }}
            ItemSeparatorComponent={ListSeparator}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={styles.headerBlock}>
                <IdentityCard
                  name={currentUser.name}
                  keyInfo={currentUser.kelas ? `Kelas ${currentUser.kelas}` : 'Praktikan'}
                  supportingInfo="Laboratorium Komputer"
                  actionLabel="Keluar"
                  onAction={handleLogout}
                />

                <TagihanShortcut
                  unpaidCount={unpaidBillsCount}
                  totalCount={bills.length}
                  syncStatus={billsSync}
                  onPress={() => router.push('/praktikan/tagihan')}
                />

                {sessionsRetry.visible ? (
                  <SyncErrorState
                    message={sessionsRetry.message}
                    onRetry={sessionsRetry.retry}
                    retrying={sessionsRetry.retrying}
                  />
                ) : null}

                {/* Strip Sedang Dibuka */}
                {activeOpenSessions.length > 0 ? (
                  <View style={styles.openStrip}>
                    <View style={styles.openStripDot} />
                    <Text style={styles.openStripText}>
                      Ada {activeOpenSessions.length} sesi yang sedang dibuka untuk presensi.
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.sectionTitle}>Semua Sesi Praktikum</Text>
              </View>
            }
            ListEmptyComponent={
              syncError && sessions.length === 0 ? undefined : loadingInitial ? (
                <LoadingState label="Memuat jadwal praktikum…" />
              ) : (
                <EmptyState
                  title="Belum ada sesi"
                  message={`Belum ada sesi praktikum yang dijadwalkan untuk Kelas ${currentUser.kelas ?? ''}.`}
                />
              )
            }
          />
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
  screenInner: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.sm,
  },
  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  separator: {
    height: spacing.sm,
  },
  openStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.status.open.bg,
    borderColor: colors.status.open.text,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  openStripDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.status.open.text,
  },
  openStripText: {
    ...typography.caption,
    color: colors.status.open.text,
    fontWeight: '600',
    flex: 1,
  },
  avatarButton: {
    minWidth: layout.minTouch,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.onPrimarySubtle,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});
