/**
 * Halaman utama (dashboard ringkas) Aslab – /aslab/index (FR-60).
 * Menampilkan daftar mata kuliah dan lab milik Aslab,
 * serta shortcut ke kelola lab dan anggota.
 * Dashboard lengkap (FR-69, FR-70) dikerjakan di Tahap 3.
 */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';

import { AppBar } from '@/components/ui/AppBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { PRESSED_OPACITY } from '@/components/ui/pressable';
import { useAppStore, useCurrentUser, useIsOnline } from '@/store/appStore';
import { useAslabLabs, useAslabMataKuliah, useAslabMataKuliahSync } from '@/store/aslabStore';
import { colors } from '@/theme/colors';
import { radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import type { Lab, MataKuliah } from '@/types';

type LabCountByMk = Record<string, number>;

function MataKuliahCard({
  mk,
  labCount,
  onKelola,
}: {
  mk: MataKuliah;
  labCount: number;
  onKelola: () => void;
}) {
  return (
    <Card>
      <View style={styles.mkCardContent}>
        <View style={styles.mkCardInfo}>
          <Text style={styles.mkKode}>{mk.kode}</Text>
          <Text style={styles.mkNama} numberOfLines={2}>
            {mk.nama}
          </Text>
          <Text style={styles.mkLabCount}>
            {labCount === 0 ? 'Belum ada lab' : `${labCount} lab`}
          </Text>
        </View>
        <Pressable
          onPress={onKelola}
          style={({ pressed }) => [styles.kelolaButton, pressed && { opacity: PRESSED_OPACITY }]}
          accessibilityRole="button"
          accessibilityLabel={`Kelola lab ${mk.nama}`}
        >
          <Text style={styles.kelolaLabel}>Kelola Lab</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

export default function AslabIndexScreen() {
  const currentUser = useCurrentUser();
  const logout = useAppStore((s) => s.logout);
  const isOnline = useIsOnline();
  const mataKuliah = useAslabMataKuliah();
  const mkSync = useAslabMataKuliahSync();
  const labs = useAslabLabs();
  const [loggingOut, setLoggingOut] = useState(false);

  const labCountByMk: LabCountByMk = {};
  for (const lab of labs) {
    if (lab.mataKuliahId) {
      labCountByMk[lab.mataKuliahId] = (labCountByMk[lab.mataKuliahId] ?? 0) + 1;
    }
  }

  const isLoading = mkSync === 'idle' || mkSync === 'loading';

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <AppBar subtitle="Aslab" />
        <LoadingState fullScreen label="Memuat data Aslab…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppBar subtitle="Aslab" />
      <Screen scroll={false} edges={['left', 'right', 'bottom']}>
        {/* Header info user */}
        <View style={styles.header}>
          <Text style={styles.greetTitle}>Halo, {currentUser?.name ?? 'Aslab'}</Text>
          <Text style={styles.greetSub}>{currentUser?.email}</Text>
        </View>

        {mataKuliah.length === 0 ? (
          <EmptyState
            title="Belum ada mata kuliah"
            message="Akun Aslab ini belum dikaitkan dengan mata kuliah. Hubungi PM untuk melakukan seed data."
          />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Mata Kuliah</Text>
            <FlatList
              data={mataKuliah}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <MataKuliahCard
                  mk={item}
                  labCount={labCountByMk[item.id] ?? 0}
                  onKelola={() =>
                    router.push({
                      pathname: '/aslab/lab',
                      params: { mkId: item.id, mkNama: item.nama },
                    } as unknown as Href)
                  }
                />
              )}
              ItemSeparatorComponent={ListSeparator}
              contentContainerStyle={styles.listContent}
              scrollEnabled={false}
            />
          </>
        )}

        <View style={styles.footer}>
          <Button
            label="Keluar"
            variant="danger"
            onPress={() => void handleLogout()}
            loading={loggingOut}
            disabled={!isOnline || loggingOut}
          />
          {!isOnline && (
            <Text style={styles.hint}>Logout tidak tersedia saat offline.</Text>
          )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  greetTitle: {
    ...typography.heading,
    color: colors.text,
  },
  greetSub: {
    ...typography.caption,
    color: colors.textMuted,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  listContent: {
    gap: spacing.sm,
  },
  mkCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  mkCardInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  mkKode: {
    ...typography.caption,
    color: colors.textMuted,
  },
  mkNama: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  mkLabCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
  kelolaButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kelolaLabel: {
    ...typography.label,
    color: colors.onPrimary,
  },
  separator: {
    height: spacing.sm,
  },
  footer: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
