// src/features/bulk/utils/csvParser.ts
import Papa from "papaparse";
import { BulkKind, BulkRow, BulkRowStatus, BulkValuesByKind } from "../../../types/bulk";

/**
 * Parse raw CSV content for the given bulk kind.
 * Returns an array of BulkRow with status set to "pending".
 * Validation of header & values is performed later by the review component.
 */
export function parseCsvContent<K extends BulkKind>(
  content: string,
  _kind: K
): BulkRow<BulkValuesByKind[K]>[] {
  // Detect delimiter based on header line
  const firstLine = content.split(/\r?\n/)[0] ?? "";
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  const result = Papa.parse(content, {
    header: true,
    delimiter,
    skipEmptyLines: true,
  }) as Papa.ParseResult<BulkValuesByKind[K]>;

  const rows: BulkRow<BulkValuesByKind[K]>[] = [];
  result.data.forEach((values: BulkValuesByKind[K], index: number) => {
    rows.push({
      rowNumber: index + 1, // 1‑based as per SRS
      values,
      errors: {},
      warnings: [],
      status: "pending" as BulkRowStatus,
    });
  });

  return rows;
}
