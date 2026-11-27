import { useCallback, useEffect, useRef } from 'react';
import { DefaultTheme, Stack, router, useSegments, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { LoadingState } from '@/components/ui/LoadingState';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import {
  getNotifTargetRoute,
  useAppStore,
  useAuthStatus,
  useCurrentUser,
  useIsOnline,
  useNotificationHandler,
} from '@/store/appStore';
import type { NotifPayload } from '@/types';
import { colors } from '@/theme/colors';
import { getHomeRouteForRole } from '@/utils/routes';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.feedback.danger.text,
  },
};

export default function RootLayout() {
  const currentUser = useCurrentUser();
  const authStatus = useAuthStatus();
  const isOnline = useIsOnline();
  const segments = useSegments();
  const initAuth = useAppStore((state) => state.initAuth);

  // Ref untuk menyimpan notifikasi yang diketuk sebelum login (FR-52)
  const pendingNotifPayloadRef = useRef<NotifPayload | null>(null);

  // 1. Inisialisasi Auth Observer (SRS §10 Aturan 6: tanpa impor services/)
  useEffect(() => {
    const unsubscribe = initAuth();
    return () => {
      unsubscribe();
    };
  }, [initAuth]);

  // 2. Listener Notifikasi (N1 -> /praktikan/presensi, N2/N4 -> detail sesi, N3 -> detail izin)
  useNotificationHandler(
    useCallback((targetRoute: string, payload: NotifPayload) => {
      const user = useAppStore.getState().currentUser;
      if (!user) {
        // Belum login: simpan payload agar layar terkait dibuka setelah login (FR-52)
        pendingNotifPayloadRef.current = payload;
      } else {
        router.push(targetRoute as Href);
      }
    }, []),
  );

  // 3. Proteksi Rute (Route Guarding / Role Gate) & Navigasi Notifikasi Tertunda
  useEffect(() => {
    if (authStatus === 'loading') return;

    const rootSegment = (segments[0] as string | undefined) ?? '';
    const inAuthGroup = rootSegment === '(auth)';
    const inAsistenGroup = rootSegment === 'asisten';
    const inPraktikanGroup = rootSegment === 'praktikan';
    const inAslabGroup = rootSegment === 'aslab';

    if (!currentUser) {
      // Belum login, arahkan ke login jika mencoba buka rute terproteksi
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else {
      // Sudah login tapi masih di layar auth
      if (inAuthGroup) {
        if (pendingNotifPayloadRef.current) {
          const payload = pendingNotifPayloadRef.current;
          pendingNotifPayloadRef.current = null;
          const target = getNotifTargetRoute(payload, currentUser.role);
          router.replace(target as Href);
          return;
        }

        router.replace(getHomeRouteForRole(currentUser.role));
        return;
      }

      // Notifikasi tertunda saat user sudah di rute dalam aplikasi
      if (pendingNotifPayloadRef.current) {
        const payload = pendingNotifPayloadRef.current;
        pendingNotifPayloadRef.current = null;
        const target = getNotifTargetRoute(payload, currentUser.role);
        router.push(target as Href);
        return;
      }

      // Lindungi rute lintas peran (FR-17, FR-60)
      const allowedSegment =
        currentUser.role === 'asisten'
          ? 'asisten'
          : currentUser.role === 'aslab'
            ? 'aslab'
            : 'praktikan';
      if ((inAsistenGroup || inPraktikanGroup || inAslabGroup) && rootSegment !== allowedSegment) {
        router.replace(getHomeRouteForRole(currentUser.role));
      }
    }
  }, [currentUser, authStatus, segments]);

  if (authStatus === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style="light" />
        <LoadingState fullScreen label="Memeriksa sesi login Rawuh..." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <OfflineBanner isOnline={isOnline} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </View>
  );
}
