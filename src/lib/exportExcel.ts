import * as XLSX from 'xlsx';

export type ExportRow = Record<string, string | number>;

/**
 * Export an array of row objects to an .xlsx file and trigger a download.
 * Object keys become the column headers (Hebrew supported). The sheet is
 * marked RTL so it opens right-to-left in Excel.
 */
export function exportToExcel(filename: string, rows: ExportRow[], sheetName = 'גיליון') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filename}-${stamp}.xlsx`);
}
