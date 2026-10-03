import type { Metadata } from "next";
import { ActionModalProvider } from "@/components/action-modal-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Management System",
  description: "Secure family management for members, events, Kurbani, communication and family records.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Family Management System",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <LocaleProvider>
          <ActionModalProvider>
            {children}
            <PwaRegistration />
          </ActionModalProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
