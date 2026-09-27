"use client";

import { useEffect, useState } from "react";

// The admin's own light/dark choice. Dark by default (easier on the eyes and
// the brand's own look); light for bright sun on a jobsite. Kept per phone
// or computer in localStorage; the public site always stays light.

export type AdminTheme = "dark" | "light";
const KEY = "fn-admin-theme";
const EVENT = "fn-admin-theme";

export function readAdminTheme(): AdminTheme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function writeAdminTheme(theme: AdminTheme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode or storage blocked: the choice lasts until reload.
  }
  window.dispatchEvent(new CustomEvent<AdminTheme>(EVENT, { detail: theme }));
}

export function useAdminTheme(): [AdminTheme, (t: AdminTheme) => void] {
  const [theme, setTheme] = useState<AdminTheme>("dark");
  useEffect(() => {
    setTheme(readAdminTheme());
    const onChange = (e: Event) => setTheme((e as CustomEvent<AdminTheme>).detail);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setTheme(readAdminTheme());
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [theme, writeAdminTheme];
}
