"use server";

import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "@/services/firebase-admin";
import { verifyServerActionCaller } from "@/lib/server-action-auth";

// Admin -> Settings reads integration status through here instead of reading
// integrationSecrets/* in the browser (firestore.rules denies client reads).
// Only non-secret fields and "set / last 4" hints ever leave the server.
// Saving still goes through updateIntegrationSecret in crud.ts.

export interface SecretHint {
  set: boolean;
  last4: string; // "" when not set or too short to hint safely
}

export interface IntegrationStatus {
  boreOn: { baseUrl: string; apiKey: SecretHint; webhookSecret: SecretHint };
  leadsSync: {
    secret: SecretHint;
    writeBack: boolean;
    /** Last sync's check of the sheet against the CRM (integrationStatus/leadsSync). */
    lastSyncAt: string;
    sheetRows: number;
    matched: number;
    missingCount: number;
    missing: Array<{ id: string; name: string }>;
    missingChecked: boolean;
  };
  anthropic: { apiKey: SecretHint };
  googleCalendar: {
    clientId: string;
    clientSecret: SecretHint;
    connected: boolean;
    accountEmail: string;
    calendarId: string;
    /** Last calendar sync that worked / failed (integrationStatus/googleCalendar). */
    lastOkAt: string;
    lastError: string;
    lastErrorAt: string;
  };
}

function hint(value: unknown): SecretHint {
  if (typeof value !== "string" || !value.trim()) return { set: false, last4: "" };
  const v = value.trim();
  return { set: true, last4: v.length >= 12 ? v.slice(-4) : "" };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function getIntegrationStatus(authToken: string): Promise<IntegrationStatus> {
  await verifyServerActionCaller(authToken);
  const db = getFirestore(initializeAdminApp());
  const col = db.collection("integrationSecrets");
  const statusDoc = (id: string) =>
    db
      .collection("integrationStatus")
      .doc(id)
      .get()
      .then((snap) => (snap.data() ?? {}) as Record<string, unknown>);
  const [[boreOn, leadsSync, anthropic, cal], calStatus, syncStatus] = await Promise.all([
    Promise.all(
      ["boreOn", "leadsSync", "anthropic", "googleCalendar"].map(async (id) => {
        const snap = await col.doc(id).get();
        return (snap.data() ?? {}) as Record<string, unknown>;
      })
    ),
    statusDoc("googleCalendar"),
    statusDoc("leadsSync"),
  ]);
  const num = (v: unknown) => (typeof v === "number" ? v : 0);

  return {
    boreOn: {
      baseUrl: str(boreOn.baseUrl),
      apiKey: hint(boreOn.apiKey),
      webhookSecret: hint(boreOn.webhookSecret),
    },
    leadsSync: {
      secret: hint(leadsSync.secret),
      // Default ON: only an explicit false turns write-back off.
      writeBack: leadsSync.writeBack !== false,
      lastSyncAt: str(syncStatus.lastSyncAt),
      sheetRows: num(syncStatus.sheetRows),
      matched: num(syncStatus.matched),
      missingCount: num(syncStatus.missingCount),
      missing: Array.isArray(syncStatus.missing)
        ? (syncStatus.missing as Array<{ id?: unknown; name?: unknown }>).map((m) => ({ id: str(m.id), name: str(m.name) }))
        : [],
      missingChecked: syncStatus.missingChecked === true,
    },
    anthropic: { apiKey: hint(anthropic.apiKey) },
    googleCalendar: {
      clientId: str(cal.clientId),
      clientSecret: hint(cal.clientSecret),
      connected: Boolean(cal.refreshToken),
      accountEmail: str(cal.accountEmail),
      calendarId: str(cal.calendarId),
      lastOkAt: str(calStatus.lastOkAt),
      lastError: str(calStatus.lastError),
      lastErrorAt: str(calStatus.lastErrorAt),
    },
  };
}
