// The ad form answers the marketing firm added to the lead sheet (Nov 2026):
// "City" and "Where does the line need to go, and what's in the way?".
// They fill blanks on the lead and never replace what someone typed.

import type { Lead } from "@/lib/leads";

export function formAnswersPatch(
  lead: Partial<Pick<Lead, "address" | "city" | "siteDetails">>,
  row: { city?: string; where?: string }
): Partial<Pick<Lead, "address" | "city" | "siteDetails">> {
  const out: Partial<Pick<Lead, "address" | "city" | "siteDetails">> = {};
  const city = (row.city || "").trim();
  const where = (row.where || "").trim();
  if (city && !(lead.city || "").trim()) out.city = city;
  // The town is a start on the address (map, MISS DIG sheet); a real address wins.
  if (city && !(lead.address || "").trim()) out.address = city;
  if (where && !(lead.siteDetails || "").trim()) out.siteDetails = where;
  return out;
}
