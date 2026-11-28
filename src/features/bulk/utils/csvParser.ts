// src/features/bulk/utils/csvParser.ts
import Papa from "papaparse";
import { BulkKind, BulkRow, BulkRowStatus } from "../../../types/bulk";

/**
 * Parse raw CSV content for the given bulk kind.
 * Returns an array of BulkRow with status set to 'pending'.
 * Errors and warnings are left empty – validation will be applied later
 * by the review component.
 */
export function parseCsvContent<T>(content: string, kind: BulkKind): BulkRow<T>[] {
  // Detect delimiter: try comma and semicolon, choose the one that yields more fields in header
  const firstLine = content.split(/\r?\n/)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  const result = Papa.parse<T>(content, {
    header: true,
    delimiter,
    skipEmptyLines: true,
  });
  const result = Papa.parse<T>(content, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length) {
    // In a real app we would surface these errors, but for now just log.
    console.warn("CSV parsing errors:", result.errors);
  }

  const rows: BulkRow<T>[] = [];
  result.data.forEach((values, index) => {
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
