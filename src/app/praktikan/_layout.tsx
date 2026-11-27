import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';
import { useCurrentUser } from '@/store/appStore';
import { useDendaStore } from '@/store/dendaStore';
import { colors } from '@/theme/colors';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function PraktikanLayout() {
  const currentUser = useCurrentUser();
  const startBillsSync = useDendaStore((state) => state.startBillsSync);
  const stopBillsSync = useDendaStore((state) => state.stopBillsSync);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'praktikan') {
      stopBillsSync();
      return;
    }
    startBillsSync(currentUser);
    return () => {
      stopBillsSync();
    };
  }, [currentUser, startBillsSync, stopBillsSync]);

  if (!currentUser || currentUser.role !== 'praktikan') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sesi/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="izin/baru" options={{ headerShown: false }} />
      <Stack.Screen name="izin/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="tagihan/index" options={{ headerShown: false }} />
      <Stack.Screen name="tagihan/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
