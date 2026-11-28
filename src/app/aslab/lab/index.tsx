/**
 * Layar daftar lab milik Aslab per mata kuliah (FR-61).
 * Dipindahkan dari src/app/asisten/lab/index.tsx ke sini.
 * Aslab bisa melihat, membuat, mengubah, dan menghapus lab pada mata kuliah miliknya.
 */
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';

import { AppBar } from '@/components/ui/AppBar';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { PRESSED_OPACITY } from '@/components/ui/pressable';
import { DeleteLabSheet } from '@/features/lab/DeleteLabSheet';
import { useCurrentUser, useIsOnline } from '@/store/appStore';
import { useAslabStore, useAslabLabs, useAslabLabsSync } from '@/store/aslabStore';
import { deleteAslabLab } from '@/services/aslab';
import { DEFAULT_GRACE_MINUTES } from '@/constants/denda';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import type { Lab } from '@/types';

type FlashState = { id: number; message: string };

function LabRow({
  lab,
  onPress,
  onDelete,
  deleteDisabled,
}: {
  lab: Lab;
  onPress: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
}) {
  const grace = lab.graceMinutes ?? DEFAULT_GRACE_MINUTES;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        role="button"
        accessibilityLabel={`Ubah lab ${lab.nama}`}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: PRESSED_OPACITY }]}
      >
        <Text style={styles.rowTitle} numberOfLines={1}>
          {lab.nama}
        </Text>
        {lab.gedung ? <Text style={styles.rowMeta}>{lab.gedung}</Text> : null}
        <Text style={styles.rowMeta}>{`Radius ${lab.radiusM} m · Toleransi ${grace} mnt`}</Text>
      </Pressable>
      <Pressable
        onPress={onDelete}
        disabled={deleteDisabled}
        role="button"
        accessibilityLabel={`Hapus lab ${lab.nama}`}
        accessibilityState={{ disabled: deleteDisabled }}
        style={({ pressed }) => [
          styles.deleteButton,
          pressed && { opacity: PRESSED_OPACITY },
          deleteDisabled && { opacity: 0.5 },
        ]}
      >
        <Text style={styles.deleteLabel}>Hapus</Text>
      </Pressable>
    </View>
  );
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

export default function AslabLabListScreen() {
  const { mkId, mkNama } = useLocalSearchParams<{ mkId: string; mkNama: string }>();
  const currentUser = useCurrentUser();
  const isOnline = useIsOnline();
  const allLabs = useAslabLabs();
  const labsSync = useAslabLabsSync();

  // Filter lab hanya untuk mata kuliah ini
  const labs = allLabs.filter((l) => l.mataKuliahId === mkId);

  const [flash, setFlash] = useState<FlashState | null>(null);
  const [labToDelete, setLabToDelete] = useState<Lab | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isLoading = (labsSync === 'idle' || labsSync === 'loading') && labs.length === 0;

  function openCreate() {
    router.push({ pathname: '/aslab/lab/form', params: { mkId, mkNama } } as unknown as Href);
  }

  function openEdit(lab: Lab) {
    router.push({
      pathname: '/aslab/lab/form',
      params: { id: lab.id, mkId, mkNama },
    } as unknown as Href);
  }

  async function confirmDelete() {
    if (!isOnline || !labToDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteAslabLab(labToDelete.id);
    setDeleting(false);
    if (res.ok) {
      setLabToDelete(null);
      setFlash((prev) => ({ message: 'Lab berhasil dihapus.', id: (prev?.id ?? 0) + 1 }));
      return;
    }
    setDeleteError(res.message);
  }

  function closeDelete() {
    if (deleting) return;
    setLabToDelete(null);
    setDeleteError(null);
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <AppBar subtitle={mkNama ?? 'Lab'} canGoBack onGoBack={() => router.back()} />
        <LoadingState fullScreen label="Memuat lab…" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppBar subtitle={mkNama ?? 'Lab'} canGoBack onGoBack={() => router.back()} />
      <Screen scroll={false} edges={['left', 'right', 'bottom']}>
        <FlatList
          data={labs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LabRow
              lab={item}
              onPress={() => openEdit(item)}
              onDelete={() => {
                setDeleteError(null);
                setLabToDelete(item);
              }}
              deleteDisabled={!isOnline}
            />
          )}
          ItemSeparatorComponent={ListSeparator}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            flash ? (
              <Banner key={flash.id} tone="success" message={flash.message} />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title="Belum ada lab"
              message="Belum ada lab untuk mata kuliah ini. Tambahkan lab pertama."
              action={{ label: 'Tambah lab', onPress: openCreate }}
            />
          }
        />

        {labs.length > 0 && (
          <View style={styles.addButton}>
            <Button
              label="Tambah lab"
              onPress={openCreate}
              disabled={!isOnline}
              accessibilityLabel="Tambah lab baru"
            />
            {!isOnline && (
              <Text style={styles.hint}>Tambah lab tidak tersedia saat offline.</Text>
            )}
          </View>
        )}

        <DeleteLabSheet
          visible={labToDelete !== null}
          loading={deleting}
          errorMessage={deleteError}
          confirmDisabled={!isOnline}
          onClose={closeDelete}
          onConfirm={() => void confirmDelete()}
        />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  rowMain: { flex: 1, gap: spacing.xs },
  rowTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  rowMeta: { ...typography.caption, color: colors.textMuted },
  deleteButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  deleteLabel: { ...typography.label, color: colors.feedback.danger.text },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  addButton: { padding: spacing.lg, gap: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
