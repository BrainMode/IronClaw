import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ch.dennyweber.wdcfitness",
  appName: "WDC Fitness",
  webDir: "out", // Next.js static export output
  server: {
    androidScheme: "https",
    // Wenn man im DEV-Modus auf der lokalen Vercel-URL laufen will:
    // url: "http://10.0.2.2:3000",
    // cleartext: true,
  },
  plugins: {
    Camera: {
      // Permissions werden in AndroidManifest.xml deklariert
    },
    Preferences: {
      group: "WdcFitnessPrefs",
    },
  },
  android: {
    // Ziel: Health Connect verfügbar erst ab Android 14+ stabil
    minWebViewVersion: 110,
  },
};

export default config;
