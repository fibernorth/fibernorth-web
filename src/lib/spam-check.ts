// Bot filter for the public quote and contact forms. Real people are never
// blocked on one weak sign; it takes the hidden trap field, a form filled in
// under a couple of seconds, or several fields of random letters.

/** "TyjRXqYynSMWumOffVeMgkvV": one long run of letters with case flipping all over. */
export function looksRandom(text: string): boolean {
  const s = (text || "").trim();
  if (s.length < 10 || /\s/.test(s) || !/^[A-Za-z]+$/.test(s)) return false;
  let flips = 0;
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1] === s[i - 1].toUpperCase();
    const b = s[i] === s[i].toUpperCase();
    if (a !== b) flips++;
  }
  const vowels = (s.match(/[aeiouAEIOU]/g) || []).length / s.length;
  return flips >= 5 || vowels < 0.15;
}

/** Gmail addresses with dots sprinkled through them ("i.h.o.x.i") are a bot habit. */
function dottedGmail(email: string): boolean {
  const m = /^([^@]+)@(gmail|googlemail)\.com$/i.exec((email || "").trim());
  return !!m && (m[1].match(/\./g) || []).length >= 3;
}

export interface SpamInput {
  name: string;
  address: string;
  email: string;
  description?: string;
  /** Hidden field people never see; bots fill it. */
  hp?: string;
  /** How long the form was open before sending, in ms. */
  elapsedMs?: number;
}

/** Why this looks like a bot, or "" for a real person. */
export function spamReason(f: SpamInput): string {
  if ((f.hp || "").trim()) return "hidden field filled";
  if (typeof f.elapsedMs === "number" && f.elapsedMs >= 0 && f.elapsedMs < 2500) return "sent too fast";
  let score = 0;
  if (looksRandom(f.name)) score += 2;
  if (looksRandom(f.address)) score += 2;
  // "Business Name: vaACiTFhYqGdVLGys" lines from the longer forms.
  for (const line of (f.description || "").split("\n")) {
    const value = line.includes(":") ? line.slice(line.indexOf(":") + 1) : line;
    for (const word of value.split(/\s+/)) if (looksRandom(word)) score += 1;
  }
  if (dottedGmail(f.email)) score += 1;
  return score >= 3 ? "random letters" : "";
}
