import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./stock-alert.css";
import "./brand-specialized.css";
import "./module-shortcut.css";
import "./performance.css";
import "./purchases.css";
import "./pwa.css";
import "./mobile.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "CRM Family",
  description: "Gestão integrada da Sedux, Schemmer Cell e House Pet",
  applicationName: "CRM Family",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "CRM Family",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#13243a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body><PwaRegister />{children}</body>
    </html>
  );
}
