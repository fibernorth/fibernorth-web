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
  leadsSync: { secret: SecretHint; writeBack: boolean };
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
  const [[boreOn, leadsSync, anthropic, cal], calStatus] = await Promise.all([
    Promise.all(
      ["boreOn", "leadsSync", "anthropic", "googleCalendar"].map(async (id) => {
        const snap = await col.doc(id).get();
        return (snap.data() ?? {}) as Record<string, unknown>;
      })
    ),
    db
      .collection("integrationStatus")
      .doc("googleCalendar")
      .get()
      .then((snap) => (snap.data() ?? {}) as Record<string, unknown>),
  ]);

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
