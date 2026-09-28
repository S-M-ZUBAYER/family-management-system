import type { Metadata } from "next";
import { ActionModalProvider } from "@/components/action-modal-provider";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <body className="antialiased">
        <ActionModalProvider>{children}</ActionModalProvider>
      </body>
    </html>
  );
}
