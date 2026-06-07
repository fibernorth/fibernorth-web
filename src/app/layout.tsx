import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default:
      "FiberNorth Underground - Directional Drilling & Trenchless Installations | Northern Michigan",
    template: "%s | FiberNorth Underground",
  },
  description:
    "Professional directional drilling and trenchless utility installations in Northern Michigan. Water, septic, power, gas, drainage, irrigation. Your yard stays intact. Call (231) 384-0105.",
  keywords: [
    "directional drilling",
    "trenchless installation",
    "boring contractor",
    "Northern Michigan",
    "water line installation",
    "septic line boring",
    "underground utilities",
    "Traverse City",
    "Williamsburg MI",
  ],
  openGraph: {
    title: "FiberNorth Underground - We Bore So You Don't Have to Dig",
    description:
      "Professional directional drilling and trenchless installations across Northern Michigan. Your yard stays intact.",
    url: "https://fibernorth.com",
    siteName: "FiberNorth Underground",
    locale: "en_US",
    type: "website",
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
      </body>
    </html>
  );
}
