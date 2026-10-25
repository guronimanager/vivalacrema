import { PortalReadOnly } from "@/components/users/read-only";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { AppSupport } from "@/components/pwa/app-support";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Viva La Crema | İşletme Yönetimi",
  description: "Viva La Crema satış, gider ve finans yönetimi",
  applicationName: "Viva La Crema",
  appleWebApp: { capable: true, title: "Viva La Crema", statusBarStyle: "default" },
  icons: { icon: "/icons/viva-la-crema-192.png", apple: "/icons/viva-la-crema-apple-180.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#09090b", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><ClerkProvider><AppSupport /><PortalReadOnly>{children}</PortalReadOnly></ClerkProvider></body>
    </html>
  );
}
