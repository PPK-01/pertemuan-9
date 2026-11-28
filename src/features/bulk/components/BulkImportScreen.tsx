// src/features/bulk/components/BulkImportScreen.tsx – Ibrahim's bulk CSV import UI (T2 FR‑66)
import React, { useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import type { Href } from "expo-router";

import { BulkKind } from "../../../types/bulk";
import { parseCsvContent } from "../utils/csvParser";
import { shareTemplate } from "../utils/template";
import { Button } from "@/components/ui/Button";

const EXPECTED_HEADERS: Record<BulkKind, string[]> = {
  lab: ["nama", "gedung", "lat", "lng", "radiusM", "graceMinutes"],
  praktikan: ["email", "nama"],
  asprak: ["email", "nama"],
};

export default function BulkImportScreen({ kind }: { kind: BulkKind }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [rowCount, setRowCount] = useState(0);

  const downloadTemplate = async () => {
    try {
      await shareTemplate(kind);
    } catch {
      Alert.alert("Error", "Tidak dapat membagikan template.");
    }
  };

  const importCsv = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const uri = result.assets[0].uri;
      setLoading(true);
      setStatus("Membaca file …");
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Detect delimiter based on header line
      const firstLine = content.split(/\r?\n/)[0] ?? "";
      const commaCount = (firstLine.match(/,/g) ?? []).length;
      const semicolonCount = (firstLine.match(/;/g) ?? []).length;
      const delimiter = semicolonCount > commaCount ? ";" : ",";
      const rawHeaders = firstLine.split(delimiter).map((h) => h.trim());
      const ok = EXPECTED_HEADERS[kind].every((h) => rawHeaders.includes(h));
      if (!ok) {
        Alert.alert(
          "Format tidak sesuai",
          "Format file tidak sesuai template. Unduh template lalu coba lagi."
        );
        setLoading(false);
        setStatus("");
        return;
      }

      setStatus("Mengurai CSV …");
      const parsed = parseCsvContent(content, kind);
      if (parsed.length > 500) {
        Alert.alert("Batas baris", "Maksimum 500 baris data diperbolehkan.");
        setLoading(false);
        setStatus("");
        return;
      }
      setRowCount(parsed.length);
      setStatus(`Terbaca ${parsed.length} baris`);
    } catch {
      Alert.alert("Error", "Gagal memproses file CSV.");
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    Alert.alert(
      "Submit",
      `${rowCount} baris akan dikirim ke server.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Kirim",
          onPress: () => {
            // TODO: panggil service bulk insert, lalu arahkan ke halaman aslab
            router.push("/aslab" as Href);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Button label="Unduh Template CSV" onPress={downloadTemplate} />
      <View style={styles.spacer} />
      <Button label="Pilih CSV" onPress={importCsv} />
      {loading && <ActivityIndicator style={styles.spacer} />}
      {status !== "" && <Text style={styles.status}>{status}</Text>}
      {rowCount > 0 && (
        <View style={styles.spacer}>
          <Button label="Kirim ke Server" onPress={submit} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: "center" },
  spacer: { height: 12 },
  status: { marginTop: 8, textAlign: "center" },
});
