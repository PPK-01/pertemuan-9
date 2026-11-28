// src/features/bulk/utils/template.ts
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

// Template strings untuk setiap jenis bulk
const TEMPLATES: Record<string, string> = {
  lab: "nama,gedung,lat,lng,radiusM,graceMinutes\nContoh Lab,Gedung A,-6.200000,106.816666,50,15\n",
  praktikan: "email,nama\npraktikan@example.com,Contoh Praktikan\n",
  asprak: "email,nama\nasprak@example.com,Contoh Asprak\n",
};

/**
 * Tulis template CSV ke file temporer dan bagikan lewat sharing.
 * Mengembalikan URI file yang ditulis.
 */
export async function shareTemplate(kind: string): Promise<string> {
  const content = TEMPLATES[kind];
  if (!content) throw new Error("Template tidak ditemukan");
  const dest = (FileSystem.cacheDirectory ?? "") + `${kind}-template.csv`;
  await FileSystem.writeAsStringAsync(dest, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(dest);
  return dest;
}
