import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { IzinStatusBadge } from '@/components/izin/IzinStatusBadge';
import { isLabsLoading, pickLabName } from '@/components/session/labText';
import { SessionInfo } from '@/components/session/SessionInfo';
import { AppBar } from '@/components/ui/AppBar';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { ATTEND_FAIL_MESSAGE } from '@/features/praktikan/attendMessages';
import { isPraktikanOfLab } from '@/services/labs';
import {
  useAttendanceByUser,
  useCurrentUser,
  useIzinByUser,
  useLabForSession,
  useSessionById,
  useSyncState,
} from '@/store/appStore';
import { colors } from '@/theme/colors';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import { formatDateTime, formatTime } from '@/utils/time';

export default function DetailSesiScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const sessionId = Array.isArray(params.id) ? params.id[0] ?? '' : params.id ?? '';

  const currentUser = useCurrentUser();
  const session = useSessionById(sessionId);
  const lab = useLabForSession(sessionId);

  const attendances = useAttendanceByUser(currentUser?.id ?? '');
  const attendance = attendances.find((item) => item.sessionId === sessionId);

  const izinList = useIzinByUser(currentUser?.id ?? '');
  const existingIzin = izinList.find((item) => item.sessionId === sessionId);

  const labsLoading = isLabsLoading(useSyncState('labs'));
  // FR-03: nama lab -> ruang (sesi lama) -> "Lab belum diatur"; '' bila lab belum tersinkron.
  const labName = pickLabName(session?.labId, lab?.nama, labsLoading);

  if (!currentUser) {
    return (
      <View style={styles.container}>
        <AppBar subtitle="Detail Sesi" canGoBack onGoBack={() => router.back()} />
        <Screen edges={['left', 'right', 'bottom']}>
          <EmptyState
            title="Identitas tidak ditemukan"
            message="Silakan masuk kembali untuk melihat detail sesi."
            action={{ label: 'Masuk', onPress: () => router.replace('/(auth)/login') }}
          />
        </Screen>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <AppBar subtitle="Detail Sesi" canGoBack onGoBack={() => router.back()} />
        <Screen edges={['left', 'right', 'bottom']}>
          <EmptyState
            title="Sesi tidak ditemukan"
            message="Sesi yang kamu cari tidak terdaftar."
            action={{ label: 'Lihat jadwal', onPress: () => router.back() }}
          />
        </Screen>
      </View>
    );
  }

  const isLabMismatch = !labsLoading && (!lab || !isPraktikanOfLab(lab, currentUser.email));
  if (isLabMismatch) {
    return (
      <View style={styles.container}>
        <AppBar subtitle="Detail Sesi" canGoBack onGoBack={() => router.back()} />
        <Screen edges={['left', 'right', 'bottom']}>
          <View style={styles.page}>
            <Card>
              <SessionInfo session={session} labName={labName} />
            </Card>
            <Banner tone="danger" message={ATTEND_FAIL_MESSAGE.NOT_IN_CLASS} />
          </View>
        </Screen>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppBar subtitle="Detail Sesi" canGoBack onGoBack={() => router.back()} />

      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.page}>
          <Card>
            <SessionInfo session={session} labName={labName} />
          </Card>

          {/* Skenario: Izin Disetujui (FR-28) */}
          {existingIzin?.status === 'approved' ? (
            <View style={styles.attendanceBlock}>
              <Banner
                tone="info"
                title="Izin Disetujui"
                message={ATTEND_FAIL_MESSAGE.IZIN_APPROVED}
              />
              <Button
                label="Lihat Detail Izin"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/praktikan/izin/[id]',
                    params: { id: existingIzin.id },
                  })
                }
              />
            </View>
          ) : existingIzin ? (
            /* Skenario: Izin Sedang Diproses */
            <View style={styles.izinStatusCard}>
              <View style={styles.izinHeaderRow}>
                <Text style={styles.izinStatusTitle}>Pengajuan Izin Kamu</Text>
                <IzinStatusBadge status={existingIzin.status} />
              </View>
              <Text style={styles.izinSnippet} numberOfLines={2}>
                &ldquo;{existingIzin.alasan}&rdquo;
              </Text>
              <Button
                label="Cek Status Izin"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/praktikan/izin/[id]',
                    params: { id: existingIzin.id },
                  })
                }
              />
            </View>
          ) : null}

          {/* Presensi Section (FR-34: Form presensi dipindah ke halaman presensi) */}
          {attendance ? (
            <View style={styles.attendanceBlock}>
              <Banner
                tone="success"
                title="Presensi tercatat"
                message={`Kamu sudah presensi pada sesi ini. Kehadiran tercatat pada ${formatDateTime(
                  attendance.timestamp,
                )}.`}
              />
              <Button
                label={`Sudah presensi pukul ${formatTime(attendance.timestamp)}`}
                onPress={() => undefined}
                disabled
              />
            </View>
          ) : existingIzin?.status === 'approved' ? null : session.status === 'open' ? (
            <View style={styles.attendanceBlock}>
              <Button
                label="Buka halaman presensi"
                onPress={() => router.push('/praktikan/presensi')}
              />

              {/* Tombol Ajukan Izin jika belum ada izin (FR-21) */}
              {!existingIzin ? (
                <View style={styles.ajukanIzinBlock}>
                  <Text style={styles.ajukanIzinPrompt}>Berhalangan hadir di laboratorium?</Text>
                  <Button
                    label="Ajukan Izin Ketidakhadiran"
                    variant="secondary"
                    onPress={() =>
                      router.push({
                        pathname: '/praktikan/izin/baru',
                        params: { sessionId: session.id },
                      })
                    }
                  />
                </View>
              ) : null}
            </View>
          ) : session.status === 'closed' ? (
            <View style={styles.attendanceBlock}>
              <Banner
                tone="info"
                title="Sesi sudah ditutup"
                message={ATTEND_FAIL_MESSAGE.SESSION_NOT_OPEN}
              />
              <Button label="Sesi ditutup" onPress={() => undefined} disabled />
            </View>
          ) : (
            <View style={styles.attendanceBlock}>
              <Banner
                tone="info"
                title="Sesi belum dibuka"
                message={ATTEND_FAIL_MESSAGE.SESSION_NOT_OPEN}
              />
              <Button label="Sesi belum dibuka" onPress={() => undefined} disabled />

              {/* Boleh mengajukan izin pada sesi Dijadwalkan (FR-21) */}
              {!existingIzin ? (
                <View style={styles.ajukanIzinBlock}>
                  <Text style={styles.ajukanIzinPrompt}>Sudah tahu akan berhalangan hadir?</Text>
                  <Button
                    label="Ajukan Izin Lebih Awal"
                    variant="secondary"
                    onPress={() =>
                      router.push({
                        pathname: '/praktikan/izin/baru',
                        params: { sessionId: session.id },
                      })
                    }
                  />
                </View>
              ) : null}
            </View>
          )}
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
  attendanceBlock: {
    gap: spacing.md,
  },
  ajukanIzinBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    alignItems: 'center',
  },
  ajukanIzinPrompt: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  izinStatusCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  izinHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  izinStatusTitle: {
    ...typography.label,
    color: colors.primary,
    fontWeight: '700',
  },
  izinSnippet: {
    ...typography.body,
    fontSize: 14,
    color: colors.text,
    fontStyle: 'italic',
  },
});
