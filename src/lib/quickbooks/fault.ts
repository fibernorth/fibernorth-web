// Reading QuickBooks API errors. Pure.
//
// Intuit's error body: {"Fault":{"Error":[{"Message":"...","Detail":"...","code":"610"}],"type":"ValidationFault"}}

export interface QboFaultInfo {
  message: string;
  code: string;
  type: string;
}

export function parseFault(body: string): QboFaultInfo | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const fault = (json as { Fault?: { Error?: Array<{ Message?: string; Detail?: string; code?: string }>; type?: string } })?.Fault;
  const err = fault?.Error?.[0];
  if (!err) return null;
  const message = [err.Message, err.Detail].filter((s) => s && s.trim()).join(": ");
  return { message: message || "Unknown error", code: String(err.code ?? ""), type: String(fault?.type ?? "") };
}

/** "Object Not Found" (code 610), e.g. an estimate deleted in QuickBooks. */
export function isNotFound(status: number, fault: QboFaultInfo | null): boolean {
  if (status === 404) return true;
  if (!fault) return false;
  return fault.code === "610" || /object not found/i.test(fault.message);
}

export function faultText(status: number, body: string): string {
  const f = parseFault(body);
  if (f) return `QuickBooks said: ${f.message}`;
  if (status === 401) return "QuickBooks refused the saved login. Click Reconnect QuickBooks in Settings.";
  if (status === 403) return "QuickBooks says this login isn't allowed to do that. Reconnect as a QuickBooks admin.";
  const short = body.replace(/\s+/g, " ").trim().slice(0, 200);
  return `QuickBooks error (HTTP ${status})${short ? `: ${short}` : ""}`;
}
