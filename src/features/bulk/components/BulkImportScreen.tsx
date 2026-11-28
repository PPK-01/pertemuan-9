// src/features/bulk/components/BulkImportScreen.tsx – Ibrahim's bulk CSV import UI (T2 FR‑66)
import React, { useState } from "react";
import { View, ActivityIndicator, StyleSheet, Alert } from "react-native";
// @ts-ignore – expo-document-picker typings may be missing
import * as DocumentPicker from "expo-document-picker";
// @ts-ignore – expo-file-system typings may be missing
import * as FileSystem from "expo-file-system";
// @ts-ignore – expo-sharing typings may be missing
import * as Sharing from "expo-sharing";
// @ts-ignore – papaparse typings may be missing
import Papa from "papaparse";
import { BULK_KIND_LIST, BulkRow } from "../../../types/bulk";
import { parseCsvContent } from "../utils/csvParser";
import { shareTemplate } from "../utils/template";
import { Button, Text } from "../../../components/ui";

export default function BulkImportScreen({ kind }: { kind: typeof BULK_KIND_LIST[number] }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [rows, setRows] = useState<BulkRow<any>[]>([]);

  const expectedHeaders: Record<string, string[]> = {
    lab: ["nama", "gedung", "lat", "lng", "radiusM", "graceMinutes"],
    praktikan: ["email", "nama"],
    asprak: ["email", "nama"],
  };

  const downloadTemplate = async () => {
    try {
      await shareTemplate(kind);
    } catch (e) {
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
      const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });

      // Detect header and delimiter
      const firstLine = content.split(/\r?\n/)[0] || "";
      const commaCount = (firstLine.match(/,/g) || []).length;
      const semicolonCount = (firstLine.match(/;/g) || []).length;
      const delimiter = semicolonCount > commaCount ? ";" : ",";
      const rawHeaders = firstLine.split(delimiter).map(h => h.trim());
      const ok = expectedHeaders[kind].every(h => rawHeaders.includes(h));
      if (!ok) {
        Alert.alert("Format tidak sesuai", "Format file tidak sesuai template. Unduh template lalu coba lagi.");
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
      setRows(parsed);
      setStatus(`Terbaca ${parsed.length} baris`);
    } catch (e) {
      Alert.alert("Error", "Gagal memproses file CSV.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    Alert.alert("Submit", `${rows.length} baris akan dikirim ke server.`);
  };

  return (
    <View style={styles.container}>
      <Button title="Unduh Template CSV" onPress={downloadTemplate} />
      <View style={styles.spacer} />
      <Button title="Pilih CSV" onPress={importCsv} />
      {loading && <ActivityIndicator style={styles.spacer} />}
      {status !== "" && <Text style={styles.status}>{status}</Text>}
      {rows.length > 0 && <Button title="Kirim ke Server" onPress={submit} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: "center" },
  spacer: { height: 12 },
  status: { marginTop: 8, textAlign: "center" },
});