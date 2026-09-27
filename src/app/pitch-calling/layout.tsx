import type { Metadata, Viewport } from "next";
import "./pitch.css";

export const metadata: Metadata = {
  title: { absolute: "TC Diamonds" },
  description: "Pitch calling for wristband cards.",
  manifest: "/pitch-calling.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "TC Diamonds", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/tc-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icons/tc-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0C1017",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function PitchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
