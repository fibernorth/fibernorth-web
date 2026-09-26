// Admin -> Settings form state, as pure functions. The stored settings doc
// stays live; the form keeps only the fields this person edited, each with
// the stored value it started from, so Save writes just those fields and a
// change made elsewhere to any other field is never reverted.

export type FieldEdits = Record<string, { value: string; base: string }>;

/** Record a keystroke. Typing a field back to its stored value drops the edit. */
export function editField(edits: FieldEdits, stored: Record<string, string>, key: string, value: string): FieldEdits {
  const current = stored[key] ?? "";
  const next = { ...edits };
  if (value === current) delete next[key];
  else next[key] = { value, base: key in edits ? edits[key].base : current };
  return next;
}

/** Drop edits the stored doc has caught up with (saved, or same value typed elsewhere). */
export function dropCaughtUpEdits(edits: FieldEdits, stored: Record<string, string>): FieldEdits {
  let changed = false;
  const next: FieldEdits = {};
  for (const [k, e] of Object.entries(edits)) {
    if (e.value === (stored[k] ?? "")) changed = true;
    else next[k] = e;
  }
  return changed ? next : edits;
}

/** Fields to write: edited values that differ from what's stored now. */
export function changedFields(edits: FieldEdits, stored: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, e] of Object.entries(edits)) if (e.value !== (stored[k] ?? "")) out[k] = e.value;
  return out;
}

/** Edited fields whose stored value changed elsewhere since the edit began. */
export function staleEdits(edits: FieldEdits, stored: Record<string, string>): string[] {
  return Object.entries(edits)
    .filter(([k, e]) => (stored[k] ?? "") !== e.base)
    .map(([k]) => k);
}
