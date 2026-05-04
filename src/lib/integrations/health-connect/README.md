# Health Connect (Android)

## Was

Health Connect ist Androids Standard-API für Gesundheitsdaten. Samsung Health, Google Fit, andere Apps schreiben Daten dort hinein. Wir LESEN aus Health Connect.

## Plugin

Wir nutzen `@kduma-autoid/capacitor-health-connect`.

```bash
npm install @kduma-autoid/capacitor-health-connect
npx cap sync android
```

## AndroidManifest.xml — Permissions

In `android/app/src/main/AndroidManifest.xml` müssen folgende Permissions deklariert werden:

```xml
<uses-permission android:name="android.permission.health.READ_STEPS" />
<uses-permission android:name="android.permission.health.READ_HEART_RATE" />
<uses-permission android:name="android.permission.health.READ_WEIGHT" />
<uses-permission android:name="android.permission.health.READ_BODY_FAT" />
<uses-permission android:name="android.permission.health.READ_SLEEP" />
<uses-permission android:name="android.permission.health.READ_EXERCISE" />
<uses-permission android:name="android.permission.health.READ_DISTANCE" />
<uses-permission android:name="android.permission.health.READ_TOTAL_CALORIES_BURNED" />
<uses-permission android:name="android.permission.health.READ_HEART_RATE_VARIABILITY" />

<!-- Privacy Policy URL (Pflicht ab Health Connect 2024) -->
<activity android:name=".MainActivity">
  <intent-filter>
    <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
    <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
  </intent-filter>
</activity>
```

## Workflow

1. App-Start: prüfe `HealthConnect.isAvailable()`
2. Wenn ja: `HealthConnect.requestPermissions(...)` für die nötigen Datentypen
3. Sync (z.B. einmal täglich oder bei App-Open):
   - `HealthConnect.readRecords({ type: 'Steps', timeRange: ... })` → in `activities`
   - `HealthConnect.readRecords({ type: 'HeartRate', ... })` → in `body_metrics` aggregiert
   - `HealthConnect.readRecords({ type: 'Weight', ... })` → in `body_metrics`
4. Dedup via `(user_id, source='health_connect', source_id=recordId)`

## Hinweise

- Health Connect kann erst Daten lesen wenn andere Apps sie GESCHRIEBEN haben — Samsung Health muss explizit "Daten teilen mit Health Connect" aktiviert haben
- Auf manchen Geräten ist Health Connect als separate App installiert (Play Store), auf neueren System-built-in
- Reine PWA (Browser) hat KEINEN Zugriff — daher der Capacitor-Wrapper

## Fallback wenn HC nicht verfügbar

UI-Hinweis: "Health Connect nicht installiert/aktiviert. Daten manuell eingeben oder Withings/Strava nutzen."
