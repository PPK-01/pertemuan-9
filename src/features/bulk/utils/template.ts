// src/features/bulk/utils/template.ts
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

// Path where the bundled template CSV will be copied. In Expo, we can use `FileSystem.documentDirectory`.
// The actual file will be placed in the project at `src/features/bulk/templates/bulk-template.csv` and
// bundled with the app. At runtime we reference it via `require` which yields an Expo asset object.
// The `uri` property of the asset is a file:// URL that can be shared.

let _uri: string | null = null;
export async function getTemplateUri(): Promise<string> {
  if (_uri) return _uri;
  // The asset is bundled; `require` returns a number (module id) that Expo resolves.
  // Using `expo-asset` is ideal, but to keep it lightweight we use FileSystem to copy from the
  // bundled asset to a writable location.
  const asset = require("../../templates/bulk-template.csv"); // eslint-disable-line @typescript-eslint/no-var-requires
  // Asset.uri works on both iOS and Android after Expo bundles it.
  const sourceUri: string = (asset as any).uri;
  const destUri = FileSystem.documentDirectory + "bulk-template.csv";
  // Copy once.
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  _uri = destUri;
  return _uri;
}

export const BULK_TEMPLATE_URI = FileSystem.documentDirectory + "bulk-template.csv";
