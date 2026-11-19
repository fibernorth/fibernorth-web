// Guard against a changed column layout on the marketing firm's lead sheet.
//
// The Apps Script used to read columns by position. If columns are inserted
// (Nov 19, 2026: "Where does the line need to go" and "City" went in at G/H),
// every field shifts: names land in Email, phones in Name, and nothing
// matches, so a run would create a duplicate lead for every row. A run whose
// rows look like that is refused before anything is written.

export interface LayoutRow {
  name?: string;
  phone?: string;
  email?: string;
}

const EMAILISH = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Share of rows whose phone or email cell clearly holds something else. */
export function misreadShare(rows: LayoutRow[]): number {
  const withContact = rows.filter((r) => (r.name || r.phone || r.email || "").trim());
  if (!withContact.length) return 0;
  let bad = 0;
  for (const r of withContact) {
    const email = (r.email || "").trim();
    const phone = (r.phone || "").trim();
    const digits = phone.replace(/\D+/g, "");
    const emailBad = email !== "" && !EMAILISH.test(email);
    const phoneBad = phone !== "" && digits.length < 7;
    const noContact = digits.length < 7 && !EMAILISH.test(email);
    if (emailBad || phoneBad || noContact) bad += 1;
  }
  return bad / withContact.length;
}

/**
 * True when the batch looks shifted: at least 5 rows and 40% or more of them
 * have a non-email in Email, a non-phone in Phone, or no usable contact at
 * all. A normal sheet has a stray bad row or two, not dozens.
 */
export function layoutLooksShifted(rows: LayoutRow[]): boolean {
  const n = rows.filter((r) => (r.name || r.phone || r.email || "").trim()).length;
  return n >= 5 && misreadShare(rows) >= 0.4;
}

export const LAYOUT_SHIFTED_MESSAGE =
  "Sync refused: the sheet's columns look moved (names or cities where phones and emails should be). Nothing was changed. Update the Apps Script to the latest version, which reads columns by their header names.";
