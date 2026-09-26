// The hidden "website" field on the public forms (src/components/forms/honeypot.tsx).
export const HONEYPOT_FIELD = "website";

/** True when a submission's honeypot was filled in: a bot. Drop it quietly. */
export function honeypotTripped(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const v = (raw as Record<string, unknown>)[HONEYPOT_FIELD];
  return typeof v === "string" && v.trim() !== "";
}
