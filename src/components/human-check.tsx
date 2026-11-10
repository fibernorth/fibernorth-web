"use client";

import { useEffect, useRef } from "react";

// The Cloudflare Turnstile widget for the public forms. Renders nothing until
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set (see src/lib/turnstile.ts). Most
// people just see a small "Success" box; a few get one click. `resetKey`
// changes after a failed send so a fresh token is issued.

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
  if (existing) return new Promise((res) => existing.addEventListener("load", () => res(), { once: true }));
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.defer = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error("turnstile script"));
    document.head.appendChild(s);
  });
}

export function HumanCheck({ onToken, resetKey = 0 }: { onToken: (token: string) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>("");
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !box.current || !window.turnstile || widgetId.current) return;
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "auto",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(""),
          "error-callback": () => cb.current(""),
        });
      })
      .catch(() => {
        // Script blocked (ad blocker, no network): the button stays off and
        // the form's error line gives the phone number.
      });
    return () => {
      alive = false;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = "";
    };
  }, []);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) {
      cb.current("");
      window.turnstile.reset(widgetId.current);
    }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" aria-label="Are you human check" />;
}
