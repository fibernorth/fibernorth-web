"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useAdminTheme } from "@/lib/admin-theme";

/** The admin (and its login) use Bill's light/dark choice; the public site is always light. */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const pathname = usePathname() || "";
  const adminArea = pathname.startsWith("/admin") || pathname.startsWith("/login");
  const [adminTheme] = useAdminTheme();
  return (
    <NextThemesProvider
      {...props}
      forcedTheme={pathname.startsWith("/pitch-calling") ? "dark" : adminArea ? adminTheme : "light"}
    >
      {children}
    </NextThemesProvider>
  );
}
