import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Capacitor: Build als statisches Export wenn für Native gebaut wird.
  // Für Vercel-Web-Deploy: server-side rendering OK, kein Output-Override.
  // Wir setzen das via env-flag, sodass Capacitor-Build und Web-Build koexistieren.
  ...(process.env.BUILD_TARGET === "capacitor" && {
    output: "export",
    images: { unoptimized: true },
  }),

  experimental: {
    // Server Actions für Form-Submissions
    serverActions: {
      bodySizeLimit: "10mb", // für Foto-Uploads
    },
  },

  // PowerSync, AI SDK, native modules
  serverExternalPackages: ["@powersync/web", "elevenlabs"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },

  // Hardening: keine x-powered-by header
  poweredByHeader: false,
};

export default nextConfig;
