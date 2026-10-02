// QuickBooks OAuth token bookkeeping. Pure: the network calls and Firestore
// writes are in src/services/quickbooks.ts.
//
// Intuit rotates refresh tokens: every refresh may hand back a new one, and
// the old one stops working some time later. So the newest refresh token is
// always saved, and a cached access token that is still good for a couple of
// minutes is used instead of refreshing again.

/** integrationSecrets/quickbooks. Server-only (rules deny browser access). */
export interface QboSecret {
  clientId?: string;
  clientSecret?: string;
  /** Send an estimate when a customer accepts online. Absent = on. */
  autoSend?: boolean;
  realmId?: string;
  companyName?: string;
  connectedAt?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  pendingState?: string;
  pendingStateAt?: string;
  updatedAt?: string;
}

export interface IntuitTokenResponse {
  access_token?: string;
  refresh_token?: string;
  /** Seconds (about 3600). */
  expires_in?: number;
  /** Seconds (about 100 days). */
  x_refresh_token_expires_in?: number;
}

/** Refresh this long before the access token runs out. */
export const ACCESS_TOKEN_MARGIN_MS = 2 * 60_000;

export function isQboConnected(s: QboSecret | null | undefined): boolean {
  return Boolean(s?.clientId && s?.clientSecret && s?.refreshToken && s?.realmId);
}

/** The cached access token, if it is good for at least the margin. */
export function usableAccessToken(s: QboSecret, now: number = Date.now()): string | null {
  if (!s.accessToken || !s.accessTokenExpiresAt) return null;
  const exp = new Date(s.accessTokenExpiresAt).getTime();
  return Number.isFinite(exp) && exp - now > ACCESS_TOKEN_MARGIN_MS ? s.accessToken : null;
}

/**
 * What to save after a token call. Keeps the old refresh token only when
 * Intuit didn't send one (it always should).
 */
export function tokenPatch(
  res: IntuitTokenResponse,
  previous: Pick<QboSecret, "refreshToken" | "refreshTokenExpiresAt">,
  now: number = Date.now()
): Required<Pick<QboSecret, "accessToken" | "accessTokenExpiresAt" | "refreshToken" | "refreshTokenExpiresAt">> {
  if (!res.access_token) throw new Error("QuickBooks sent no access token.");
  const refreshToken = res.refresh_token || previous.refreshToken || "";
  if (!refreshToken) throw new Error("QuickBooks sent no refresh token.");
  const accessSecs = typeof res.expires_in === "number" && res.expires_in > 0 ? res.expires_in : 3600;
  const refreshTokenExpiresAt =
    typeof res.x_refresh_token_expires_in === "number" && res.x_refresh_token_expires_in > 0
      ? new Date(now + res.x_refresh_token_expires_in * 1000).toISOString()
      : res.refresh_token && res.refresh_token !== previous.refreshToken
        ? ""
        : previous.refreshTokenExpiresAt || "";
  return {
    accessToken: res.access_token,
    accessTokenExpiresAt: new Date(now + accessSecs * 1000).toISOString(),
    refreshToken,
    refreshTokenExpiresAt,
  };
}

/** Authorization: Basic header for Intuit's token endpoints. */
export function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

/** Intuit's error body for a token call, e.g. {"error":"invalid_grant"}. */
export function tokenErrorMessage(status: number, body: string): string {
  let code = "";
  try {
    code = String((JSON.parse(body) as { error?: unknown }).error || "");
  } catch {
    code = /"error"\s*:\s*"([^"]+)"/.exec(body)?.[1] || "";
  }
  if (code === "invalid_grant") {
    return "QuickBooks refused the saved login (it expired or was disconnected). Click Reconnect QuickBooks in Settings.";
  }
  if (code === "invalid_client") return "QuickBooks refused the client ID or secret. Check them in Settings.";
  return `QuickBooks token refresh failed (${status})${code ? `: ${code}` : ""}`;
}
