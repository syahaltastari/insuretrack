import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Mono } from "next/font/google";
import "./globals.css";

// Roobert proprietary — substitute dengan Plus Jakarta Sans (geometric,
// OpenType-rich). Space Mono persis dengan spec.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  title: "InsureTrack — Digital Insurance Platform",
  description: "Asuransi digital, prosesnya cepat, polis langsung terbit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${jakarta.variable} ${spaceMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
