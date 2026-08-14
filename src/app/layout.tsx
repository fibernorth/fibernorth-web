import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://fibernorth.com"),
  alternates: { canonical: "./" },
  title: {
    default:
      "FiberNorth Underground — Bury Water, Power & Gas Lines Without Digging | Northern Michigan",
    template: "%s | FiberNorth Underground",
  },
  description:
    "Need a trench dug to bury a water, power, gas, or internet line? We bore underneath instead — no torn-up yard, done in a day, price-competitive with trenching. Northern Michigan. Call (231) 264-0757.",
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
  openGraph: {
    title: "FiberNorth Underground - We Bore So You Don't Have to Dig",
    description:
      "Bury any line — water, power, gas, internet — without a trench through your yard. Done in a day, Northern Michigan.",
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
      </body>
    </html>
  );
}
