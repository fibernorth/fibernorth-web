// Server side of "Connect to Bore-ON" (see src/lib/bore-on/pairing.ts for the
// flow). Takes the database and fetch as arguments so it is tested without
// either. The pending state and the saved key both live in integrationSecrets,
// which is server-only in firestore.rules.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  BORE_ON_DEFAULT_BASE, PAIRING_REDIRECT_URI, challengeFor, consentUrl, makeState, makeVerifier,
  normalizeBase, parseExchange, pendingMatches, readCallback,
  type PairingOutcome, type PendingPairing,
} from "@/lib/bore-on/pairing";
import { INTEGRATION_VISIBLE_FIELDS } from "@/lib/settings-fields";
import { maskSecrets, writeAudit } from "@/services/audit";

const SECRETS = "integrationSecrets";
const PENDING_DOC = "boreOnPairing";
const KEY_DOC = "boreOn";

export interface PairingActor {
  uid: string;
  email?: string | null;
}

/** Remember a fresh state and verifier; hand back the Bore-ON page to open. */
export async function startPairing(db: Firestore, owner: PairingActor): Promise<{ url: string }> {
  const saved = (await db.collection(SECRETS).doc(KEY_DOC).get()).data() as { baseUrl?: string } | undefined;
  const base = normalizeBase(saved?.baseUrl) || BORE_ON_DEFAULT_BASE;
  const state = makeState();
  const verifier = makeVerifier();
  await db.collection(SECRETS).doc(PENDING_DOC).set({
    state, verifier, base,
    startedAt: new Date().toISOString(),
    startedBy: { uid: owner.uid, email: owner.email || "" },
  });
  return { url: consentUrl(base, { state, challenge: challengeFor(verifier) }) };
}

/**
 * The browser is back from Bore-ON. Check it is the pairing we started, trade
 * the code for the key, store it. The pending record is deleted before
 * anything else happens, so a return can only ever be used once.
 */
export async function completePairing(
  db: Firestore,
  params: URLSearchParams,
  fetchFn: typeof fetch = fetch,
): Promise<PairingOutcome> {
  const returned = readCallback(params);
  const pendingRef = db.collection(SECRETS).doc(PENDING_DOC);
  const pending = (await pendingRef.get()).data() as (PendingPairing & { startedBy?: PairingActor }) | undefined;

  if (returned.kind === "invalid" || !pendingMatches(pending, returned.state, Date.now())) return "state";
  await pendingRef.delete();
  if (returned.kind === "denied") return "denied";

  let res: Response;
  try {
    res = await fetchFn(`${pending!.base}/api/v1/pairing/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: returned.code, code_verifier: pending!.verifier, redirect_uri: PAIRING_REDIRECT_URI }),
      // A redirect could carry the verifier somewhere we never meant.
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return "unreachable";
  }
  if (!res.ok) return "exchange";
  const got = parseExchange(await res.json().catch(() => null));
  if (!got) return "exchange";

  const keyRef = db.collection(SECRETS).doc(KEY_DOC);
  const before = ((await keyRef.get()).data() ?? {}) as Record<string, unknown>;
  const connectedAt = new Date().toISOString();
  // The base we STARTED with, never one named by the response.
  const after = {
    baseUrl: pending!.base!, apiKey: got.apiKey, webhookSecret: got.webhookSecret,
    connectedAt, connectedCompany: got.companyName, connectedKeyId: got.keyId,
  };
  await keyRef.set({ ...after, updatedAt: connectedAt }, { merge: true });
  await writeAudit({
    actor: { uid: pending!.startedBy?.uid || "bore-on-pairing", email: pending!.startedBy?.email || "" },
    action: "secret.update",
    target: { col: SECRETS, id: KEY_DOC },
    before: maskSecrets(pick(before, ["baseUrl", "apiKey", "webhookSecret"]), INTEGRATION_VISIBLE_FIELDS),
    after: maskSecrets(pick(after, ["baseUrl", "apiKey", "webhookSecret"]), INTEGRATION_VISIBLE_FIELDS),
    note: `connected through Bore-ON pairing${got.companyName ? ` (${got.companyName})` : ""}`,
  }, { db });
  return "connected";
}

/** Forget the key and the callback secret. The base URL stays so reconnecting is one click. */
export async function disconnectBoreOn(db: Firestore, owner: PairingActor): Promise<void> {
  const keyRef = db.collection(SECRETS).doc(KEY_DOC);
  const before = ((await keyRef.get()).data() ?? {}) as Record<string, unknown>;
  await keyRef.set({
    apiKey: FieldValue.delete(), webhookSecret: FieldValue.delete(),
    connectedAt: FieldValue.delete(), connectedCompany: FieldValue.delete(), connectedKeyId: FieldValue.delete(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  await writeAudit({
    actor: { uid: owner.uid, email: owner.email || "" },
    action: "secret.update",
    target: { col: SECRETS, id: KEY_DOC },
    before: maskSecrets(pick(before, ["baseUrl", "apiKey", "webhookSecret"]), INTEGRATION_VISIBLE_FIELDS),
    after: maskSecrets({ baseUrl: before.baseUrl ?? "", apiKey: "", webhookSecret: "" }, INTEGRATION_VISIBLE_FIELDS),
    note: "disconnected from Bore-ON",
  }, { db });
}

function pick(o: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map(k => [k, o[k] ?? ""]));
}
