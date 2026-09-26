// Which fields Admin -> Settings may write, and which of them only an owner
// may change. Client + server safe (no Firebase imports).

/** siteSettings/general fields the Settings screen edits (all text). */
export const SETTINGS_FIELDS: ReadonlySet<string> = new Set([
  "companyName",
  "legalName",
  "phone",
  "email",
  "address",
  "poBox",
  "city",
  "state",
  "zip",
  "googleReviewUrl",
  "quoteEmailTo",
  "quoteSmsTo",
  "quoteSlackWebhook",
]);

/**
 * Where quote and lead notifications go. Owner only: redirecting them would
 * quietly hide new customers from Bill.
 */
export const OWNER_SETTINGS_FIELDS: ReadonlySet<string> = new Set(["quoteEmailTo", "quoteSmsTo", "quoteSlackWebhook"]);

/** integrationSecrets/{id}: the fields the Settings screen saves for each. */
export const INTEGRATION_FIELDS: Record<string, ReadonlySet<string>> = {
  boreOn: new Set(["baseUrl", "apiKey", "webhookSecret"]),
  leadsSync: new Set(["secret", "writeBack"]),
  anthropic: new Set(["apiKey"]),
  googleCalendar: new Set(["clientId", "clientSecret"]),
};

/** Integration fields that aren't secret, so the change log may show their values. */
export const INTEGRATION_VISIBLE_FIELDS: ReadonlySet<string> = new Set(["baseUrl", "writeBack", "clientId"]);
