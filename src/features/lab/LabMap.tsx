import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera, Map, Marker } from '@maplibre/maplibre-react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LabInfoSheet } from '@/components/location/LabInfoSheet';
import { LocationStatusCard } from '@/components/location/LocationStatusCard';
import type { LocationStatusCardAction } from '@/components/location/LocationStatusCard';
import { PermissionPrompt } from '@/components/location/PermissionPrompt';
import { Banner } from '@/components/ui/Banner';
import { DEFAULT_RADIUS_M } from '@/constants/location';
import { LabMarker } from '@/features/lab/LabMarker';
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

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER_LAT = -7.770123;
const DEFAULT_CENTER_LNG = 110.370123;
const DEFAULT_ZOOM = 16;
const DELTA_BOUNDS_PADDING = 0.002;

export type LabMapProps = {
  role?: 'praktikan' | 'asisten';
};

export function LabMap({ role = 'praktikan' }: LabMapProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  const cameraRef = useRef<CameraRef>(null);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
      };
    }, []),
  );

  const labsWithOpenSession = useMemo(() => {
    const allowedLabIds = new Set(labs.map((l) => l.id));
    const openSet = new Set<string>();
    for (const s of sessions) {
      if (s.status === 'open' && s.labId && allowedLabIds.has(s.labId)) {
        openSet.add(s.labId);
      }
    }
    return openSet;
  }, [sessions, labs]);

  const selectedLab = useMemo(() => {
    if (selectedLabId) {
      return labs.find((l) => l.id === selectedLabId) ?? labs[0] ?? null;
    }
    return labs.find((l) => labsWithOpenSession.has(l.id)) ?? labs[0] ?? null;
  }, [labs, selectedLabId, labsWithOpenSession]);

  const labActivity = useLabActivity(selectedLab?.id);
  const distanceInfo = useDistanceToLab(selectedLab?.id);

  // Pindahkan kamera dari titik fallback awal begitu posisi user atau data lab dari Firestore tersedia
  const hasAutoCenteredRef = useRef(false);
  useEffect(() => {
    if (hasAutoCenteredRef.current) return;
    if (location.status === 'ready' && location.position) {
      hasAutoCenteredRef.current = true;
      cameraRef.current?.flyTo({
        center: [location.position.lng, location.position.lat],
        zoom: DEFAULT_ZOOM,
        duration: 600,
      });
      return;
    }
    if (labs.length > 0) {
      const targetLab = labs.find((l) => labsWithOpenSession.has(l.id)) ?? labs[0];
      hasAutoCenteredRef.current = true;
      cameraRef.current?.flyTo({
        center: [targetLab.lng, targetLab.lat],
        zoom: DEFAULT_ZOOM,
        duration: 600,
      });
    }
  }, [location.status, location.position, labs, labsWithOpenSession]);

  // Initial center coordinates
  const initialCenter: [number, number] = useMemo(() => {
    if (location.status === 'ready' && location.position?.lng && location.position?.lat) {
      return [location.position.lng, location.position.lat];
    }
    if (labs.length > 0) {
      return [labs[0].lng, labs[0].lat];
    }
    return [DEFAULT_CENTER_LNG, DEFAULT_CENTER_LAT];
  }, [location.status, location.position, labs]);

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

  // Navigasi ke posisi pengguna: flyTo setelah refresh bila status ready
  const handleFlyToMyLocation = async () => {
    if (location.status === 'ready' && location.position) {
      cameraRef.current?.flyTo({
        center: [location.position.lng, location.position.lat],
        zoom: DEFAULT_ZOOM,
        duration: 800,
      });
      return;
    }

    setIsActionLoading(true);
    try {
      await refreshLocation();
      const updated = useAppStore.getState().location;
      if (updated.status === 'ready' && updated.position) {
        cameraRef.current?.flyTo({
          center: [updated.position.lng, updated.position.lat],
          zoom: DEFAULT_ZOOM,
          duration: 800,
        });
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  // Navigasi untuk melihat semua lab (bounds hanya dari lab dan tangani koordinat sama)
  const handleFitAllLabs = () => {
    if (labs.length === 0) return;

    if (labs.length === 1) {
      cameraRef.current?.flyTo({
        center: [labs[0].lng, labs[0].lat],
        zoom: DEFAULT_ZOOM,
        duration: 800,
      });
      return;
    }

    let minLng = labs[0].lng;
    let maxLng = labs[0].lng;
    let minLat = labs[0].lat;
    let maxLat = labs[0].lat;

    for (const lab of labs) {
      if (lab.lng < minLng) minLng = lab.lng;
      if (lab.lng > maxLng) maxLng = lab.lng;
      if (lab.lat < minLat) minLat = lab.lat;
      if (lab.lat > maxLat) maxLat = lab.lat;
    }

    // Tangani jika koordinat semua lab sama atau sangat berdekatan
    if (minLng === maxLng && minLat === maxLat) {
      cameraRef.current?.flyTo({
        center: [minLng, minLat],
        zoom: DEFAULT_ZOOM,
        duration: 800,
      });
      return;
    }

    // Beri sedikit margin jika selisihnya terlalu kecil
    const adjustedMinLng = minLng === maxLng ? minLng - DELTA_BOUNDS_PADDING : minLng;
    const adjustedMaxLng = minLng === maxLng ? maxLng + DELTA_BOUNDS_PADDING : maxLng;
    const adjustedMinLat = minLat === maxLat ? minLat - DELTA_BOUNDS_PADDING : minLat;
    const adjustedMaxLat = minLat === maxLat ? maxLat + DELTA_BOUNDS_PADDING : maxLat;

    cameraRef.current?.fitBounds([adjustedMinLng, adjustedMinLat, adjustedMaxLng, adjustedMaxLat], {
      padding: { top: 60, bottom: 60, left: 60, right: 60 },
      duration: 800,
    });
  };

  const handleSelectLab = (lab: Lab) => {
    setSelectedLabId(lab.id);
    cameraRef.current?.flyTo({
      center: [lab.lng, lab.lat],
      zoom: DEFAULT_ZOOM,
      duration: 600,
    });
  };

  const handleSelectSession = (sessionId: string) => {
    if (role === 'asisten') {
      router.push(`/asisten/sesi/${sessionId}`);
    } else {
      router.push(`/praktikan/sesi/${sessionId}`);
    }
  };

  const isLocationProblem =
    location.status !== 'ready' && location.status !== 'checking';

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
      {/* Area Peta */}
      <View style={styles.mapContainer}>
        <Map
          mapStyle={MAP_STYLE}
          style={styles.map}
          attribution={false}
          logo={false}
          accessibilityLabel="Peta laboratorium dan lokasi perangkat"
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: initialCenter,
              zoom: DEFAULT_ZOOM,
            }}
          />

          {/* Marker Posisi Perangkat Sendiri hanya saat status ready */}
          {location.status === 'ready' && location.position ? (
            <Marker lngLat={[location.position.lng, location.position.lat]} anchor="center">
              <View
                accessible
                accessibilityRole="none"
                aria-label="Posisiku saat ini"
                style={styles.userMarker}
              >
                <View style={styles.userMarkerPulse} />
                <View style={styles.userMarkerCore} />
              </View>
            </Marker>
          ) : null}

          {/* Marker Semua Lab */}
          {labs.map((lab) => (
            <LabMarker
              key={`${lab.id}-${lab.lat}-${lab.lng}`}
              lab={lab}
              hasOpenSession={labsWithOpenSession.has(lab.id)}
              isSelected={selectedLab?.id === lab.id}
              onPress={() => handleSelectLab(lab)}
            />
          ))}
        </Map>

        {/* Tombol Kontrol Peta: Ke posisiku & Lihat semua lab dengan safe area inset atas */}
        <View style={[styles.mapControls, { top: spacing.md + (role === 'praktikan' ? insets.top : 0) }]}>
          <Pressable
            accessibilityRole="button"
            aria-label="Ke posisiku"
            onPress={handleFlyToMyLocation}
            style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
          >
            <Text style={styles.controlButtonText}>Ke posisiku</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            aria-label="Lihat semua lab"
            onPress={handleFitAllLabs}
            style={({ pressed }) => [styles.controlButton, pressed && styles.controlButtonPressed]}
          >
            <Text style={styles.controlButtonText}>Lihat semua lab</Text>
          </Pressable>
        </View>

        {/* Atribusi Tunggal OpenStreetMap & OpenFreeMap */}
        <View style={styles.attributionContainer} pointerEvents="none">
          <Text style={styles.attributionText}>© OpenStreetMap contributors, OpenFreeMap</Text>
        </View>
      </View>

      {/* Bagian Bawah: Panel Izin/Status Lokasi & LabInfoSheet dibungkus ScrollView */}
      <View style={styles.bottomSection}>
        <ScrollView
          style={styles.bottomScrollView}
          contentContainerStyle={styles.bottomScrollContent}
          showsVerticalScrollIndicator
        >
          {/* Banner Offline FR-58 */}
          {!isOnline ? (
            <Banner
              tone="info"
              message="Kamu sedang offline. Data aktivitas lab mungkin belum terbaru."
            />
          ) : null}

          {/* Kartu status lokasi hanya saat status bermasalah */}
          {isLocationProblem ? (
            <View style={styles.statusSection}>
              {showPermissionPrompt ? (
                <PermissionPrompt
                  title="Izin Lokasi"
                  explanation="Rawuh membutuhkan lokasimu untuk menampilkan jarak ke lab dan posisimu di peta."
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

          {/* Panel Informasi Lab Terpilih */}
          {selectedLab ? (
            <LabInfoSheet
              lab={selectedLab}
              berlangsung={labActivity.berlangsung}
              berikutnya={labActivity.berikutnya}
              jarakM={distanceInfo?.jarakM ?? null}
              onPilihSesi={handleSelectSession}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Belum ada data laboratorium.</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapContainer: {
    flex: 1,
    minHeight: 250,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapControls: {
    position: 'absolute',
    right: spacing.md,
    gap: spacing.sm,
    zIndex: 20,
  },
  controlButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: layout.minTouch,
    minWidth: layout.minTouch,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  controlButtonPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  controlButtonText: {
    ...typography.label,
    color: colors.primary,
  },
  attributionContainer: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attributionText: {
    ...typography.caption,
    fontSize: 10,
    lineHeight: 12,
    color: colors.textMuted,
  },
  userMarker: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerPulse: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  userMarkerCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  bottomSection: {
    maxHeight: '50%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  bottomScrollView: {
    flexGrow: 0,
  },
  bottomScrollContent: {
    flexGrow: 1,
    gap: spacing.sm,
  },
  statusSection: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
});
