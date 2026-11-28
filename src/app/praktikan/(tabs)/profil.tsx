import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AppBar } from '@/components/ui/AppBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IdentityCard } from '@/components/ui/IdentityCard';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { KeluarSheet } from '@/features/asisten/KeluarSheet';
import {
  clearBarkKeyLocally,
  getSavedBarkKey,
  parseBarkKey,
  saveBarkKeyLocally,
  sendBarkNotification,
  toBarkDeviceToken,
} from '@/services/bark';
import { removeDeviceToken, saveDeviceToken } from '@/services/notifications';
import {
  useAppStore,
  useAttendanceByUser,
  useCurrentUser,
  useIzinByUser,
  useLabsForPraktikan,
  useSessionsForUser,
} from '@/store/appStore';
import { colors } from '@/theme/colors';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';

export default function PraktikanProfilScreen() {
  const currentUser = useCurrentUser();
  const userId = currentUser?.id ?? '';
  const logout = useAppStore((state) => state.logout);

  const sessions = useSessionsForUser(userId);
  const attendances = useAttendanceByUser(userId);
  const izinList = useIzinByUser(userId);
  const memberLabs = useLabsForPraktikan();
  const memberLabLabel =
    memberLabs.length > 0 ? memberLabs.map((l) => l.nama).join(', ') : 'Belum terdaftar di lab';

  const [keluarVisible, setKeluarVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [keluarError, setKeluarError] = useState<string | null>(null);

  const [barkInput, setBarkInput] = useState('');
  const [savedBarkKey, setSavedBarkKey] = useState<string | null>(null);
  const [barkBusy, setBarkBusy] = useState(false);
  const [barkFeedback, setBarkFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    getSavedBarkKey().then((key) => {
      if (active && key) {
        setSavedBarkKey(key);
        setBarkInput(key);
        if (userId) {
          void saveDeviceToken(userId, toBarkDeviceToken(key));
        }
      }
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const hadirCount = attendances.length;
  const izinApprovedCount = useMemo(
    () => izinList.filter((i) => i.status === 'approved').length,
    [izinList],
  );
  const totalSesi = sessions.length;

  const handleSaveBarkKey = async () => {
    const parsed = parseBarkKey(barkInput);
    if (!parsed) {
      setBarkFeedback({
        tone: 'error',
        message: 'Format Bark Key tidak valid. Tempel key atau URL dari aplikasi Bark.',
      });
      return;
    }

    setBarkBusy(true);
    setBarkFeedback(null);
    try {
      await saveBarkKeyLocally(parsed);
      const res = await saveDeviceToken(userId, toBarkDeviceToken(parsed));
      if (!res.ok) {
        setBarkFeedback({
          tone: 'error',
          message: res.message || 'Gagal mendaftarkan Bark Key ke server.',
        });
        return;
      }
      setSavedBarkKey(parsed);
      setBarkInput(parsed);
      setBarkFeedback({
        tone: 'success',
        message: 'Bark Key tersimpan dan siap menerima notifikasi.',
      });
    } finally {
      setBarkBusy(false);
    }
  };

  const handleTestBark = async () => {
    if (!savedBarkKey) return;
    setBarkBusy(true);
    setBarkFeedback(null);
    try {
      const res = await sendBarkNotification(
        savedBarkKey,
        'Tes Notifikasi Rawuh',
        'Notifikasi Bark berhasil terhubung ke LiveContainer.',
      );
      setBarkFeedback(
        res.ok
          ? { tone: 'success', message: 'Notifikasi uji terkirim! Periksa banner iPhone kamu.' }
          : { tone: 'error', message: 'Gagal mengirim uji notifikasi. Periksa key Bark kamu.' },
      );
    } finally {
      setBarkBusy(false);
    }
  };

  const handleRemoveBarkKey = async () => {
    if (!savedBarkKey) return;
    setBarkBusy(true);
    setBarkFeedback(null);
    try {
      await removeDeviceToken(userId, toBarkDeviceToken(savedBarkKey));
      await clearBarkKeyLocally();
      setSavedBarkKey(null);
      setBarkInput('');
      setBarkFeedback({
        tone: 'success',
        message: 'Bark Key dihapus dari perangkat ini.',
      });
    } finally {
      setBarkBusy(false);
    }
  };

  const confirmKeluar = async () => {
    setKeluarError(null);
    setLoggingOut(true);
    try {
      await logout();
      setKeluarVisible(false);
      router.replace('/(auth)/login');
    } catch {
      setKeluarError('Gagal keluar. Coba lagi.');
    } finally {
      setLoggingOut(false);
    }
  };

  if (!currentUser) {
    return (
      <View style={styles.container}>
        <AppBar subtitle="Profil" />
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
        subtitle="Profil Saya"
        canGoBack
        onGoBack={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/praktikan/jadwal');
          }
        }}
      />

      <Screen noPadding edges={['left', 'right']}>
        <View style={styles.scrollBody}>
          {/* Kartu Identitas */}
          <IdentityCard
            name={currentUser.name}
            keyInfo={
              memberLabs.length > 0 ? memberLabs.map((l) => l.nama).join(' · ') : 'Praktikan'
            }
            supportingInfo="Laboratorium Komputer"
            actionLabel="Keluar"
            onAction={() => setKeluarVisible(true)}
          />

          {/* Ringkasan Kehadiran */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryNumber}>{hadirCount}</Text>
              <Text style={styles.summaryLabel}>Total Hadir</Text>
            </View>
            <View style={[styles.summaryCard, styles.summaryCardIzin]}>
              <Text style={[styles.summaryNumber, styles.summaryNumberIzin]}>
                {izinApprovedCount}
              </Text>
              <Text style={styles.summaryLabel}>Izin Diterima</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryNumber}>{totalSesi}</Text>
              <Text style={styles.summaryLabel}>Total Sesi</Text>
            </View>
          </View>

          {/* Detail Informasi Akun */}
          <Card>
            <Text style={styles.sectionTitle}>Informasi Akun</Text>
            <View style={styles.infoList}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Nama Lengkap</Text>
                <Text style={styles.infoValue}>{currentUser.name}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email Kampus</Text>
                <Text style={styles.infoValue}>{currentUser.email}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Laboratorium</Text>
                <Text style={styles.infoValue}>{memberLabLabel}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Peran Akun</Text>
                <Text style={styles.infoValue}>Praktikan</Text>
              </View>
            </View>
          </Card>

          {/* Panduan Singkat */}
          <Card>
            <Text style={styles.sectionTitle}>Panduan Presensi</Text>
            <Text style={styles.guideText}>
              • Pastikan kamu hadir di lab tepat waktu sebelum sesi ditutup oleh asisten.{'\n'}
              • Masukkan kode 4 digit yang ditampilkan oleh asisten di depan kelas.{'\n'}
              • Jika berhalangan hadir, ajukan izin melalui tab Izin sebelum sesi selesai.
            </Text>
          </Card>

          {/* Setup Notifikasi iOS LiveContainer via Bark */}
          {Platform.OS === 'ios' && (
            <Card>
              <Text style={styles.sectionTitle}>Notifikasi iOS (Bark Relay)</Text>
              <Text style={styles.guideText}>
                Khusus pengguna LiveContainer iOS, masukkan Device Key dari aplikasi Bark agar
                notifikasi sesi dan izin tetap masuk di layar kunci.
              </Text>
              <View style={styles.barkForm}>
                <TextField
                  label="Bark Device Key / URL"
                  value={barkInput}
                  onChangeText={setBarkInput}
                  placeholder="Contoh: xYz12345AbCd atau https://api.day.app/..."
                  autoCapitalize="none"
                  autoCorrect={false}
                  disabled={barkBusy}
                />
                {barkFeedback && (
                  <Text
                    style={[
                      styles.barkFeedback,
                      barkFeedback.tone === 'error'
                        ? styles.barkFeedbackError
                        : styles.barkFeedbackSuccess,
                    ]}
                  >
                    {barkFeedback.message}
                  </Text>
                )}
                <View style={styles.barkActions}>
                  <Button
                    label={savedBarkKey ? 'Perbarui Key' : 'Simpan & Aktifkan'}
                    onPress={handleSaveBarkKey}
                    loading={barkBusy}
                    disabled={barkBusy || !barkInput.trim()}
                    style={styles.barkActionBtn}
                  />
                  {savedBarkKey && (
                    <Button
                      label="Tes"
                      variant="secondary"
                      onPress={handleTestBark}
                      disabled={barkBusy}
                    />
                  )}
                  {savedBarkKey && (
                    <Button
                      label="Hapus"
                      variant="danger"
                      onPress={handleRemoveBarkKey}
                      disabled={barkBusy}
                    />
                  )}
                </View>
              </View>
            </Card>
          )}

          {/* Tombol Logout Utama */}
          <Button
            label="Keluar dari Akun"
            variant="danger"
            onPress={() => setKeluarVisible(true)}
          />

          <Text style={styles.versionText}>Rawuh Mobile • v1.0.0</Text>
        </View>
      </Screen>

      <KeluarSheet
        visible={keluarVisible}
        loading={loggingOut}
        errorMessage={keluarError}
        onClose={() => setKeluarVisible(false)}
        onConfirm={confirmKeluar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollBody: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  summaryCardIzin: {
    backgroundColor: colors.surfaceMuted,
  },
  summaryNumber: {
    ...typography.heading,
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  summaryNumberIzin: {
    color: colors.feedback.info.text,
  },
  summaryLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionTitle: {
    ...typography.label,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  infoList: {
    gap: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  infoValue: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  guideText: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
  },
  barkForm: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  barkFeedback: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  barkFeedbackSuccess: {
    color: colors.feedback.success.text,
  },
  barkFeedbackError: {
    color: colors.feedback.danger.text,
  },
  barkActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  barkActionBtn: {
    flex: 1,
  },
  versionText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});