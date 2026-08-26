import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { GoogleAnalytics } from "@next/third-parties/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://fibernorth.com"),
  alternates: { canonical: "./" },
  title: {
    // Keep rendered titles ≤60 chars so SERPs don't truncate the payoff.
    default: "Trenchless Utility Boring, Northern Michigan | FiberNorth",
    template: "%s | FiberNorth",
  },
  description:
    "Bury a water, power, gas or internet line without digging up your yard. Directional boring across Northern Michigan, usually done in a day. Call (231) 264-0757.",
  keywords: [
    "trenching service",
    "bury water line",
    "run power to pole barn",
    "bury electrical line",
    "underground line installation",
    "directional drilling",
    "trenchless installation",
    "Northern Michigan",
    "Traverse City",
    "Williamsburg MI",
  ],
  // No og:title/og:description here: a root-level pair overrides every page's
  // own copy, so all shares looked like the homepage. With them absent,
  // scrapers fall back to each page's real title and meta description.
  openGraph: {
    siteName: "FiberNorth Underground",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        {process.env.NODE_ENV === "production" && (
          <GoogleAnalytics gaId="G-6RYR5FJT1E" />
        )}
      </body>
    </html>
  );
}
