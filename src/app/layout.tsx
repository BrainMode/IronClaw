import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IronClaw — Personal Fitness Coach",
  description: "Iron Mike Methodik. Multi-Source Recipe Import. Offline-first PWA.",
  applicationName: "IronClaw",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-(--color-background) text-(--color-foreground)">
        {children}
      </body>
    </html>
  );
}
