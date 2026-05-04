/**
 * Strava OAuth + Activity-Sync.
 *
 * Doku: https://developers.strava.com/docs/authentication/
 *
 * Flow:
 *   1. /api/integrations/strava/connect → redirect zu www.strava.com/oauth/authorize
 *      Scope: 'read,activity:read_all'  (Activities lesen, inkl. private)
 *   2. Callback /api/integrations/strava/callback?code=...
 *      → POST oauth/token mit grant_type=authorization_code
 *      → Persistiere tokens
 *   3. Webhook für neue Activities:
 *      → Strava Push-Subscriptions: https://developers.strava.com/docs/webhooks/
 *      → /api/webhooks/strava → on activity.created → fetch full activity → insert
 *
 * Strava-spezifisch:
 * - Activities haben strava-eigene activity_type (Ride, MountainBikeRide, Run, etc.)
 *   → unsere activityType-enum mappen (siehe mapping unten)
 * - HRV nicht über Strava — HR-Daten ja, aber ZONE-2-Berechnung müssen wir selbst machen
 * - Free-Tier API limits: 200 calls/15min, 2000 calls/day. Für 2 User easy.
 *
 * Zone-2-Calc:
 * - Aus HR-Streams (heartrate stream via /activities/{id}/streams) → Sekunden zählen
 *   wo HR zwischen 0.6 * HRmax und 0.7 * HRmax. HRmax = 220 - Alter.
 *
 * Mapping:
 *   Run → run
 *   Walk, Hike → walk / hike
 *   Ride → road_bike
 *   GravelRide → gravel_bike
 *   MountainBikeRide → mtb
 *   Swim → swim
 *   StandUpPaddling → sup
 *   RockClimbing → climbing
 */

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  athleteId: number;
}

export async function exchangeCode(_code: string): Promise<StravaTokens> {
  throw new Error("Not implemented — Claude Code: see file header");
}

export async function refreshToken(_refreshToken: string): Promise<StravaTokens> {
  throw new Error("Not implemented");
}

export async function fetchActivities(_accessToken: string, _afterUnix?: number) {
  throw new Error("Not implemented");
}
