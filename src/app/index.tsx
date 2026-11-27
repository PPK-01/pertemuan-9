import { useEffect } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { LoadingState } from '@/components/ui/LoadingState';
import { useAuthStatus, useCurrentUser } from '@/store/appStore';
import { colors } from '@/theme/colors';
import { getHomeRouteForRole } from '@/utils/routes';

export default function IndexGate() {
  const authStatus = useAuthStatus();
  const currentUser = useCurrentUser();

  useEffect(() => {
    if (authStatus === 'loading') return;

    if (!currentUser) {
      router.replace('/(auth)/login');
    } else {
      router.replace(getHomeRouteForRole(currentUser.role));
    }
  }, [authStatus, currentUser]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LoadingState fullScreen label="Mempersiapkan Rawuh..." />
    </View>
  );
}
