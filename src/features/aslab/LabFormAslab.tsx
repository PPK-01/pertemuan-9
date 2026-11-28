/**
 * Komponen form lab khusus Aslab (FR-61, FR-62).
 * Wrapper di atas LabFormBase dengan field graceMinutes (toleransi keterlambatan, 0–60 mnt).
 * Menggunakan peta MapLibre sama persis dengan LabForm asisten untuk konsistensi.
 *
 * Kepemilikan: Ibrahim (Domain A).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeSyntheticEvent } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import type { CameraRef, PressEvent, PressEventWithFeatures } from '@maplibre/maplibre-react-native';

import { Banner } from '@/components/ui/Banner';
import { TextField } from '@/components/ui/TextField';
import { LabFormBase } from '@/features/lab/LabFormBase';
import type { LabFormFeedback, LabFormMapSlot, LabFormProps } from '@/features/lab/LabFormBase';
import { buildRadiusPolygon } from '@/features/lab/radiusPolygon';
import { DEFAULT_GRACE_MINUTES, MIN_GRACE_MINUTES, MAX_GRACE_MINUTES } from '@/constants/denda';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { typography } from '@/theme/typography';
import type { CreateLabInput } from '@/types';

export type { LabFormFeedback };

// ── Peta (sama persis dengan LabMapCanvas di LabForm asisten) ─────────────────

const INITIAL_LAT = -7.770123;
const INITIAL_LNG = 110.370123;
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const CAMERA_ZOOM = 16;
const RADIUS_SOURCE_ID = 'aslab-lab-radius-source';
const RADIUS_FILL_LAYER_ID = 'aslab-lab-radius-fill';
const RADIUS_LINE_LAYER_ID = 'aslab-lab-radius-line';

type LatLngTuple = [number, number];

function LabMapCanvas({
  lat,
  lng,
  radiusM,
  latText,
  lngText,
  latError,
  lngError,
  centerNonce,
  onPickCoordinate,
}: LabFormMapSlot) {
  const cameraRef = useRef<CameraRef>(null);
  const lastCenterNonce = useRef(centerNonce);

  useEffect(() => {
    if (centerNonce === lastCenterNonce.current) return;
    lastCenterNonce.current = centerNonce;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    cameraRef.current?.flyTo({ center: [lng, lat], zoom: CAMERA_ZOOM, duration: 600 });
  }, [centerNonce, lat, lng]);

  const hasValidCenter =
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const center: LatLngTuple = hasValidCenter ? [lng, lat] : [INITIAL_LNG, INITIAL_LAT];
  const radiusPolygon = hasValidCenter ? buildRadiusPolygon(lat, lng, radiusM) : null;

  function handleMapPress(
    event: NativeSyntheticEvent<PressEvent> | NativeSyntheticEvent<PressEventWithFeatures>,
  ) {
    const { lngLat } = event.nativeEvent as PressEvent;
    onPickCoordinate(lngLat[1], lngLat[0]);
  }

  return (
    <>
      <View style={mapStyles.mapContainer}>
        <Map
          mapStyle={MAP_STYLE}
          style={mapStyles.map}
          attribution={false}
          logo={false}
          onPress={handleMapPress}
          accessibilityLabel="Peta lokasi lab. Ketuk peta untuk memindahkan titik lab."
        >
          <Camera ref={cameraRef} initialViewState={{ center, zoom: CAMERA_ZOOM }} />
          {radiusPolygon ? (
            <>
              <GeoJSONSource id={RADIUS_SOURCE_ID} data={radiusPolygon} />
              <Layer
                id={RADIUS_FILL_LAYER_ID}
                type="fill"
                source={RADIUS_SOURCE_ID}
                paint={{ 'fill-color': colors.primary, 'fill-opacity': 0.2 }}
              />
              <Layer
                id={RADIUS_LINE_LAYER_ID}
                type="line"
                source={RADIUS_SOURCE_ID}
                paint={{ 'line-color': colors.primary, 'line-width': 2 }}
              />
            </>
          ) : null}
          {hasValidCenter ? (
            <Marker lngLat={center}>
              <View accessible accessibilityLabel="Titik lab" style={mapStyles.marker}>
                <View style={mapStyles.markerDot} />
              </View>
            </Marker>
          ) : null}
        </Map>
      </View>
      <Text style={mapStyles.coordinate}>{`Koordinat: ${latText || '—'}, ${lngText || '—'}`}</Text>
      {latError || lngError ? (
        <Banner tone="danger" message={latError ?? lngError ?? ''} />
      ) : null}
      <Text style={mapStyles.hint}>Ketuk peta untuk memindahkan titik lab.</Text>
      <Text style={mapStyles.attribution}>© OpenStreetMap contributors, OpenFreeMap</Text>
    </>
  );
}

const mapStyles = StyleSheet.create({
  mapContainer: { height: 300 },
  map: { width: '100%', height: '100%' },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.onPrimary },
  coordinate: { ...typography.caption, color: colors.textMuted },
  attribution: { ...typography.caption, color: colors.textMuted, textAlign: 'right' },
  hint: { ...typography.caption, color: colors.textMuted },
});

// ── LabFormAslab ──────────────────────────────────────────────────────────────

export type LabFormAslabProps = Omit<LabFormProps, 'onSubmit' | 'onDelete'> & {
  mataKuliahId: string;
  onSubmit: (input: CreateLabInput) => void;
};

type GraceError = string | null;

function validateGrace(value: string): GraceError {
  const trimmed = value.trim();
  if (trimmed === '') return 'Toleransi wajib diisi.';
  const num = Number(trimmed);
  if (!Number.isInteger(num) || Number.isNaN(num))
    return 'Toleransi harus berupa bilangan bulat.';
  if (num < MIN_GRACE_MINUTES || num > MAX_GRACE_MINUTES)
    return `Toleransi harus antara ${MIN_GRACE_MINUTES} dan ${MAX_GRACE_MINUTES} menit.`;
  return null;
}

export function LabFormAslab({
  lab,
  labs = [],
  mataKuliahId,
  onSubmit,
  submitting = false,
  submitError,
  disabledHint,
}: LabFormAslabProps) {
  const initialGrace = lab?.graceMinutes ?? DEFAULT_GRACE_MINUTES;
  const [graceText, setGraceText] = useState(String(initialGrace));
  const [graceAttempted, setGraceAttempted] = useState(false);

  const graceError: GraceError = useMemo(() => validateGrace(graceText), [graceText]);

  /**
   * Intercept submit dari LabFormBase:
   * validasi graceMinutes, baru teruskan ke onSubmit dengan field tambahan.
   */
  function handleBaseSubmit(baseInput: CreateLabInput) {
    setGraceAttempted(true);
    if (graceError) return; // block: form tidak valid
    const graceMinutes = Number(graceText.trim());
    onSubmit({ ...baseInput, mataKuliahId, graceMinutes });
  }

  return (
    <View style={styles.wrapper}>
      {/* Field grace period ditampilkan sebelum form base */}
      <View style={styles.graceSection}>
        <Text style={styles.sectionTitle}>Toleransi keterlambatan (FR-62)</Text>
        <TextField
          label={`Batas toleransi (${MIN_GRACE_MINUTES}–${MAX_GRACE_MINUTES} menit)`}
          value={graceText}
          onChangeText={setGraceText}
          placeholder={String(DEFAULT_GRACE_MINUTES)}
          keyboardType="number-pad"
          hint="Praktikan yang presensi lebih dari batas ini setelah jam mulai dianggap terlambat dan dikenakan denda."
          error={graceAttempted ? (graceError ?? undefined) : undefined}
          maxLength={3}
        />
      </View>

      <LabFormBase
        lab={lab}
        labs={labs}
        onSubmit={handleBaseSubmit}
        submitting={submitting}
        submitError={submitError}
        disabledHint={disabledHint}
        renderMap={(slot) => <LabMapCanvas {...slot} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xl },
  graceSection: { gap: spacing.sm },
  sectionTitle: { ...typography.heading, color: colors.text },
});
