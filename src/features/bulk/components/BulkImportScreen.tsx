// BulkImportScreen.tsx – Ibrahim's bulk CSV import UI (T2 FR‑66)
import React, { useState } from "react";
import { View, Button, Text, ActivityIndicator, StyleSheet, Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import Papa from "papaparse";
import { BULK_KIND_LIST, BulkRow, BulkRowStatus } from "../../../types/bulk";
import { parseCsvContent } from "../utils/csvParser";
import { BULK_TEMPLATE_URI } from "../utils/template";

export default function BulkImportScreen({ kind }: { kind: typeof BULK_KIND_LIST[number] }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [rows, setRows] = useState<BulkRow<any>[]>([]);

  const downloadTemplate = async () => {
    try {
      const exists = await FileSystem.getInfoAsync(BULK_TEMPLATE_URI);
      if (!exists.exists) {
        Alert.alert("Template not found", "Template file is missing in the bundle.");
        return;
      }
      // Share the template (will copy to Downloads / share sheet)
      await Sharing.shareAsync(BULK_TEMPLATE_URI);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Unable to share template.");
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
      setStatus("Reading file …");
      const content = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      setStatus("Parsing CSV …");
      const parsed = parseCsvContent(content, kind);
      if (parsed.length > 500) {
        Alert.alert("Batas baris", "Maksimum 500 baris data diperbolehkan.");
        setLoading(false);
        setStatus("");
        return;
      }
      setRows(parsed);
      setStatus(`Parsed ${parsed.length} baris`);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Gagal memproses file CSV.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    // TODO: kirim rows dengan status accepted ke backend (batch insert)
    Alert.alert("Submit", `${rows.length} baris akan dikirim ke server.`);
  };

  return (
    <View style={styles.container}>
      <Button title="Unduh Template CSV" onPress={downloadTemplate} />
      <View style={styles.spacer} />
      <Button title="Pilih CSV" onPress={importCsv} />
      {loading && <ActivityIndicator style={styles.spacer} />}
      {status !== "" && <Text style={styles.status}>{status}</Text>}
      {rows.length > 0 && (
        <Button title="Kirim ke Server" onPress={submit} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: "center" },
  spacer: { height: 12 },
  status: { marginTop: 8, textAlign: "center" },
});
