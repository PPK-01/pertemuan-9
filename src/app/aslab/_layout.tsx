/**
 * Root layout untuk grup rute /aslab (Ibrahim – Sprint 4).
 * Mengatur header, inisialisasi listener MataKuliah & Lab Aslab,
 * dan membersihkan store saat Aslab logout.
 */
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/theme/colors';
import { useCurrentUser } from '@/store/appStore';
import { useAslabStore } from '@/store/aslabStore';
import { listenAslabLabs } from '@/services/aslab';

export default function AslabLayout() {
  const currentUser = useCurrentUser();
  const startListenMataKuliah = useAslabStore((s) => s.startListenMataKuliah);
  const stopListenMataKuliah = useAslabStore((s) => s.stopListenMataKuliah);
  const setLabs = useAslabStore((s) => s.setLabs);
  const setLabsSync = useAslabStore((s) => s.setLabsSync);
  const reset = useAslabStore((s) => s.reset);

  const mataKuliahIds = currentUser?.role === 'aslab'
    ? (currentUser.mataKuliahIds ?? [])
    : [];

  // Mulai listener MataKuliah saat Aslab login
  useEffect(() => {
    if (currentUser?.role !== 'aslab') {
      reset();
      return;
    }

    startListenMataKuliah(mataKuliahIds);
    return () => {
      stopListenMataKuliah();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  // Listener Lab berdasarkan mataKuliahIds
  useEffect(() => {
    if (currentUser?.role !== 'aslab' || mataKuliahIds.length === 0) {
      setLabs([]);
      setLabsSync('ready');
      return;
    }

    setLabsSync('loading');
    const cleanup = listenAslabLabs(
      mataKuliahIds,
      (labs) => {
        setLabs(labs);
        setLabsSync('ready');
      },
      (err) => {
        setLabsSync('error', err.message);
      },
    );

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role, mataKuliahIds.join(',')]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
