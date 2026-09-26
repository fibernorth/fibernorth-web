/**
 * Spreadsheet formula-injection guard (CSV/Sheets "formula injection").
 *
 * Text starting with = + - @ (or a tab / carriage return) is interpreted by
 * Google Sheets and Excel as a formula. Prefixing a single apostrophe makes
 * the cell plain text; the apostrophe is not displayed, so the cell's display
 * value is still the original string. Text that already starts with ' gets
 * one too so it displays as sent. Plain numbers (e.g. "-250", "1500.50") are
 * left untouched so they stay numeric.
 *
 * Mirror of sheetSafe_() in marketing/tools/leads-sheet-sync.gs — keep the
 * two in step.
 */
export function sheetSafe(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/^[-+]?\d+(\.\d+)?$/.test(s)) return s;
  return /^[=+\-@\t\r']/.test(s) ? `'${s}` : s;
}

/**
 * What a Sheets cell displays after `setValue(sheetSafe(v))`: the leading
 * apostrophe added by sheetSafe is hidden. Useful for comparing a value the
 * script reports back (getDisplayValue) with the value the server sent.
 */
export function sheetDisplayed(written: string): string {
  return written.startsWith("'") ? written.slice(1) : written;
}
