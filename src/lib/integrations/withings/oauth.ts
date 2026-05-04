/**
 * Withings OAuth + Daten-Sync.
 *
 * Doku: https://developer.withings.com/api-reference/
 *
 * Flow:
 *   1. User klickt "Withings verbinden" → /api/integrations/withings/connect
 *      → redirect zu account.withings.com/oauth2_user/authorize2 mit CLIENT_ID
 *   2. Callback /api/integrations/withings/callback?code=...&state=...
 *      → Token-Exchange POST zu wbsapi.withings.net/v2/oauth2 (action=requesttoken)
 *      → Persistiere access_token, refresh_token in integration_tokens
 *   3. Periodischer Sync: Cron auf Vercel (täglich 6:00 CET):
 *      → /api/integrations/withings/sync
 *      → Refresh Token wenn expired
 *      → /measure?action=getmeas für Gewicht, BodyFat
 *      → /v2/heart?action=list für HRV
 *      → /v2/sleep?action=getsummary für Schlaf
 *      → Insert in body_metrics
 *
 * Wichtig:
 * - Withings OAuth ist QUIRKY: token-endpoint will action=requesttoken im body
 * - Refresh-Token ist single-use → bei jedem Refresh den neuen speichern
 * - Daten sind oft delayed (Withings published nicht in Echtzeit)
 *
 * Test-Account: dev.withings.com → Sandbox kann Test-Daten generieren.
 */

export interface WithingsTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  userId: string; // external Withings user ID
  scope: string;
}

export async function exchangeCode(_code: string, _redirectUri: string): Promise<WithingsTokens> {
  throw new Error("Not implemented — Claude Code: see file header for flow");
}

export async function refreshToken(_refreshToken: string): Promise<WithingsTokens> {
  throw new Error("Not implemented");
}

export async function fetchBodyMetrics(_accessToken: string, _sinceTimestamp?: number) {
  throw new Error("Not implemented");
}
