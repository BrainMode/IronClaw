# Android (Capacitor)

Dieses Verzeichnis wird beim ersten `npx cap add android` automatisch generiert.

Im Repo wird es nicht committed (siehe `.gitignore`), die Konfiguration kommt aus `capacitor.config.ts` im Root.

## Erst-Generation

```bash
npm run build              # Next.js bauen
npx cap add android        # erstellt /android/* Struktur
npx cap sync android       # kopiert /out + plugins
npx cap open android       # öffnet Android Studio
```

## Nach Plugin-Installation

```bash
npx cap sync android
```

(Kopiert neue/aktualisierte Capacitor-Plugins in das Android-Projekt.)

## AndroidManifest Permissions

Health Connect benötigt spezifische Permissions — siehe `src/lib/integrations/health-connect/README.md`.
