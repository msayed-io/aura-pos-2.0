import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Aura POS 2.0 - نظام الإدارة الذكي المتكامل",
  description: "منصة احترافية متكاملة لإدارة نقاط البيع، المخزون، والتقارير المالية بدقة وعصرية بهوية أورا الفاخرة.",
  icons: {
    icon: "/logo_aura.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistMono.variable} antialiased`}
      >
        {children}
        {/* Portal root for modals (Analytics Auth, Settings Auth, etc.) */}
        <div id="modal-root" />
        {/* Printable content container for invoice printing */}
        <div id="printable-content" />
      </body>
    </html>
  );
}
