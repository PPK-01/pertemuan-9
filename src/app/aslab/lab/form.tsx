/**
 * Layar form tambah/ubah lab untuk Aslab (FR-61, FR-62).
 * Wrapper tipis yang menghubungkan LabFormAslab (fitur) dengan navigasi Expo Router.
 */
import { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';

import { AppBar } from '@/components/ui/AppBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Screen } from '@/components/ui/Screen';
import { LabFormAslab } from '@/features/aslab/LabFormAslab';
import type { LabFormFeedback } from '@/features/lab/LabFormBase';
import { useCurrentUser, useIsOnline } from '@/store/appStore';
import { useAslabLabs, useAslabLabsSync } from '@/store/aslabStore';
import { addAslabLab, updateAslabLab } from '@/services/aslab';
import { spacing } from '@/theme/spacing';
import type { CreateLabInput } from '@/types';

const OFFLINE_HINT = 'Simpan lab tidak tersedia saat offline.';

export default function AslabLabFormScreen() {
  const { id, mkId, mkNama } = useLocalSearchParams<{
    id?: string;
    mkId: string;
    mkNama: string;
  }>();

  const currentUser = useCurrentUser();
  const isOnline = useIsOnline();
  const allLabs = useAslabLabs();
  const labsSync = useAslabLabsSync();

  const isEdit = Boolean(id);
  const target = id ? allLabs.find((l) => l.id === id) : undefined;

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<LabFormFeedback | null>(null);

  const showError = (message: string) =>
    setSubmitError((prev) => ({ id: (prev?.id ?? 0) + 1, message }));

  function goBack() {
    router.back();
  }

  function goToList() {
    router.replace({ pathname: '/aslab/lab', params: { mkId, mkNama } } as unknown as Href);
  }

  async function handleCreate(input: CreateLabInput) {
    if (submittingRef.current || !currentUser) return;
    submittingRef.current = true;
    setSubmitting(true);

    const res = await addAslabLab(
      { ...input, mataKuliahId: mkId },
      currentUser.id,
      allLabs,
    );

    if (res.ok) {
      goBack();
      return;
    }

    submittingRef.current = false;
    setSubmitting(false);
    showError(res.message);
  }

  async function handleUpdate(input: CreateLabInput) {
    if (!id || submittingRef.current || !currentUser) return;
    submittingRef.current = true;
    setSubmitting(true);

    const res = await updateAslabLab(id, input, currentUser.id, allLabs);

    if (res.ok) {
      goBack();
      return;
    }

    submittingRef.current = false;
    setSubmitting(false);
    showError(res.message);
  }

  const title = isEdit ? 'Ubah lab' : 'Tambah lab';

  let body: React.ReactNode;

  if (isEdit && labsSync === 'idle') {
    body = <LoadingState label="Memuat lab…" />;
  } else if (isEdit && !target) {
    body = (
      <EmptyState
        title="Lab tidak ditemukan"
        message="Lab mungkin sudah dihapus atau tautan tidak valid."
        action={{ label: 'Kembali', onPress: goToList }}
      />
    );
  } else {
    body = (
      <LabFormAslab
        lab={target}
        labs={allLabs}
        mataKuliahId={mkId}
        onSubmit={isEdit ? handleUpdate : handleCreate}
        submitting={submitting}
        submitError={submitError}
        disabledHint={isOnline ? undefined : OFFLINE_HINT}
      />
    );
  }

  return (
    <View style={styles.container}>
      <AppBar subtitle={title} canGoBack onGoBack={goBack} />
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.content}>{body}</View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: spacing.md },
});
