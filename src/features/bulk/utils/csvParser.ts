// src/features/bulk/utils/csvParser.ts
// @ts-ignore – papaparse typings may be missing in this project
import Papa from "papaparse";
import { BulkKind, BulkRow, BulkRowStatus } from "../../../types/bulk";

/**
 * Parse raw CSV content for the given bulk kind.
 * Returns an array of BulkRow with status set to "pending".
 * Validation of header & values is performed later by the review component.
 */
export function parseCsvContent<T>(content: string, kind: BulkKind): BulkRow<T>[] {
  // Detect delimiter based on header line
  const firstLine = content.split(/\r?\n/)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  const result = Papa.parse<T>(content, {
    header: true,
    delimiter,
    skipEmptyLines: true,
  });

  const rows: BulkRow<T>[] = [];
  result.data.forEach((values: T, index: number) => {
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
