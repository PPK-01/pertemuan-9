import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { LabInfoSheet } from '@/components/location/LabInfoSheet';
import { LocationStatusCard } from '@/components/location/LocationStatusCard';
import type { LocationStatusCardAction } from '@/components/location/LocationStatusCard';
import { PermissionPrompt } from '@/components/location/PermissionPrompt';
import { Banner } from '@/components/ui/Banner';
import { DEFAULT_RADIUS_M } from '@/constants/location';
import {
  useAppStore,
  useDistanceToLab,
  useIsOnline,
  useLabActivity,
  useLabs,
  useLabsForAsprak,
  useLocation,
  useWatchPosition,
} from '@/store/appStore';
import { colors } from '@/theme/colors';
import { layout, radius, spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import type { Lab } from '@/types';

export type LabMapProps = {
  role?: 'praktikan' | 'asisten';
};

/**
 * LabMap untuk platform Web (FR-44):
 * Pengganti berupa daftar lab + jarak (.web.tsx), jangan impor MapLibre statis.
 */
export function LabMap({ role = 'praktikan' }: LabMapProps) {
  const router = useRouter();
  const [isFocused, setIsFocused] = useState(true);
  useWatchPosition(isFocused);

  const allLabs = useLabs();
  const asprakLabs = useLabsForAsprak();
  const labs = role === 'asisten' ? asprakLabs : allLabs;
  const location = useLocation();
  const isOnline = useIsOnline();

  const sessions = useAppStore((state) => state.sessions);
  const refreshLocation = useAppStore((state) => state.refreshLocation);
  const requestLocation = useAppStore((state) => state.requestLocation);
  const openLocationSettings = useAppStore((state) => state.openLocationSettings);
  const enableLocationServices = useAppStore((state) => state.enableLocationServices);

  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [hasRequestedPermission, setHasRequestedPermission] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      void refreshLocation();
      return () => {
        setIsFocused(false);
      };
    }, [refreshLocation]),
  );

  const selectedLab = selectedLabId ? labs.find((l) => l.id === selectedLabId) ?? (labs[0] ?? null) : (labs[0] ?? null);
  const labActivity = useLabActivity(selectedLab?.id);
  const distanceInfo = useDistanceToLab(selectedLab?.id);

  const handleAction = async (actionFn: () => Promise<unknown>) => {
    setIsActionLoading(true);
    try {
      await actionFn();
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRequestLocation = () => {
    setHasRequestedPermission(true);
    void handleAction(requestLocation);
  };

  const handleSelectSession = (sessionId: string) => {
    if (role === 'asisten') {
      router.push(`/asisten/sesi/${sessionId}`);
    } else {
      router.push(`/praktikan/sesi/${sessionId}`);
    }
  };

  const showPermissionPrompt =
    location.status === 'idle' ||
    (location.status === 'permission_denied' && !hasRequestedPermission);

  const getCardAction = (): LocationStatusCardAction | undefined => {
    switch (location.status) {
      case 'idle':
      case 'permission_denied':
        return {
          label: location.status === 'idle' ? 'Izinkan lokasi' : 'Coba lagi',
          onPress: handleRequestLocation,
          loading: isActionLoading,
        };
      case 'permission_blocked':
        return {
          label: 'Buka Pengaturan',
          onPress: () => void handleAction(openLocationSettings),
        };
      case 'services_off':
        return {
          label: 'Aktifkan lokasi',
          onPress: () => void handleAction(enableLocationServices),
          loading: isActionLoading,
        };
      case 'low_accuracy':
      case 'timeout':
      case 'ready':
      case 'checking':
        return {
          label: 'Perbarui lokasi',
          onPress: () => void handleAction(refreshLocation),
          loading: isActionLoading || location.status === 'checking',
        };
      case 'mocked':
      case 'unavailable':
        return undefined;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Banner Offline FR-58 */}
        {!isOnline ? (
          <Banner
            tone="info"
            message="Kamu sedang offline. Data aktivitas lab mungkin belum terbaru."
          />
        ) : null}

        {/* Info Pengganti Peta Web */}
        <View style={styles.webNotice}>
          <Text style={styles.webNoticeTitle}>Daftar Laboratorium</Text>
          <Text style={styles.webNoticeText}>
            Peta grafis MapLibre hanya tersedia di aplikasi Android. Di web ditampilkan daftar laboratorium beserta jarak dan aktivitasnya.
          </Text>
        </View>

        {/* Status Lokasi / Izin */}
        {location.status !== 'ready' ? (
          <View style={styles.statusSection}>
            {showPermissionPrompt ? (
              <PermissionPrompt
                title="Izin Lokasi"
                explanation="Rawuh membutuhkan lokasimu untuk menghitung jarak ke tiap laboratorium."
                primaryAction={{
                  label: 'Izinkan lokasi',
                  onPress: handleRequestLocation,
                  loading: isActionLoading,
                }}
              />
            ) : (
              <LocationStatusCard
                status={location.status}
                labName={selectedLab?.nama ?? 'Lab'}
                jarakM={distanceInfo?.jarakM ?? null}
                radiusM={selectedLab?.radiusM ?? DEFAULT_RADIUS_M}
                akurasiM={location.position?.akurasiM ?? null}
                action={getCardAction()}
              />
            )}
          </View>
        ) : null}

        {/* Daftar Lab + Jarak */}
        <View style={styles.labListSection}>
          <Text style={styles.sectionTitle}>Pilih Laboratorium</Text>
          <FlatList
            data={labs}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <LabListItem
                lab={item}
                isSelected={selectedLab?.id === item.id}
                onSelect={() => setSelectedLabId(item.id)}
                hasOpenSession={sessions.some((s) => s.status === 'open' && s.labId === item.id)}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Belum ada data laboratorium.</Text>
            }
          />
        </View>

        {/* Panel Detail & Aktivitas Lab Terpilih */}
        {selectedLab ? (
          <View style={styles.sheetSection}>
            <LabInfoSheet
              lab={selectedLab}
              berlangsung={labActivity.berlangsung}
              berikutnya={labActivity.berikutnya}
              jarakM={distanceInfo?.jarakM ?? null}
              onPilihSesi={handleSelectSession}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function LabListItem({
  lab,
  isSelected,
  onSelect,
  hasOpenSession,
}: {
  lab: Lab;
  isSelected: boolean;
  onSelect: () => void;
  hasOpenSession: boolean;
}) {
  const distanceInfo = useDistanceToLab(lab.id);
  const roundedJarak = distanceInfo?.jarakM != null ? Math.round(distanceInfo.jarakM) : null;

  return (
    <Pressable
      accessibilityRole="button"
      aria-label={`${lab.nama}${hasOpenSession ? ', ada sesi dibuka' : ''}${roundedJarak != null ? `, jarak ${roundedJarak} meter` : ''}`}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.labItem,
        isSelected && styles.labItemSelected,
        pressed && styles.labItemPressed,
      ]}
    >
      <View style={styles.labItemHeader}>
        <Text style={[styles.labItemName, isSelected && styles.labItemNameSelected]}>
          {hasOpenSession ? `• ${lab.nama}` : lab.nama}
        </Text>
        {hasOpenSession ? (
          <View style={styles.openBadge}>
            <Text style={styles.openBadgeText}>Dibuka</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.labItemMeta}>
        {lab.gedung ? <Text style={styles.labItemGedung}>{lab.gedung}</Text> : null}
        {roundedJarak != null ? (
          <Text style={styles.labItemJarak}>{roundedJarak} m</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  webNotice: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  webNoticeTitle: {
    ...typography.heading,
    color: colors.text,
  },
  webNoticeText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  statusSection: {
    gap: spacing.sm,
  },
  labListSection: {
    flex: 1,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textMuted,
  },
  labItem: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  labItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceMuted,
  },
  labItemPressed: {
    opacity: 0.8,
  },
  labItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labItemName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  labItemNameSelected: {
    color: colors.primary,
  },
  openBadge: {
    backgroundColor: colors.status.open.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  openBadgeText: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '700',
    color: colors.status.open.text,
  },
  labItemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labItemGedung: {
    ...typography.caption,
    color: colors.textMuted,
  },
  labItemJarak: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  sheetSection: {
    marginTop: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginVertical: spacing.md,
  },
});
