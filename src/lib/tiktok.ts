// Send a TikTok pixel event when the pixel is on the page (public pages,
// production). Never throws: tracking must not break a form.
type Ttq = { track?: (event: string, props?: Record<string, unknown>) => void };

export function ttqTrack(event: string, props?: Record<string, unknown>): void {
  try {
    const ttq = (globalThis as { ttq?: Ttq }).ttq;
    ttq?.track?.(event, props);
  } catch {
    /* ignore */
  }
}
