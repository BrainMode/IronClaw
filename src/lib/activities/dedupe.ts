/**
 * Activity Deduplication.
 *
 * Problem: User trackt eine MTB-Tour mit AllTrails (→ Strava → unsere App) UND
 * gleichzeitig mit der Samsung Watch (→ Health Connect → unsere App).
 * Beide landen als separate Activity in der DB. Doof.
 *
 * Lösung: nach jedem Sync-Run einmal über die Activities laufen, Duplikate
 * matchen und die schlechtere Quelle als 'merged_into' markieren.
 *
 * Match-Kriterien (alle müssen erfüllt sein):
 *   1. Start-Zeit innerhalb ±5 Min
 *   2. Distanz unterscheidet sich um < 10%
 *   3. Dauer unterscheidet sich um < 10%
 *   4. Aktivitäts-Typ kompatibel (cycling matcht mountain_biking, hiking matcht walking, …)
 *
 * Bei Match: bevorzuge die Quelle mit:
 *   1. Mehr Datenpunkten (HR-Track, Power, etc.)
 *   2. Bei Gleichstand: Strava (weil dort meistens AllTrails-Routen mit GPX vollständiger sind
 *      als die Watch-Aufzeichnung wenn der User nur die Tour mitloggt).
 *
 * Edge cases:
 *   - User macht 2 Touren am selben Tag (Vor- und Nachmittag) — nicht mergen
 *   - User pausiert Tracking lang (Picknick) — Dauer kann driften, daher beide Kriterien nötig
 *   - Activity läuft über Mitternacht — start_time-Match noch ok, aber auf UTC achten
 */

export type ActivitySource = "strava" | "health_connect" | "withings" | "manual";

export interface ActivityRecord {
  id: string;
  source: ActivitySource;
  source_external_id: string; // Strava activity-id oder Health-Connect record-id
  type: string; // canonical type, siehe ACTIVITY_TYPE_CANONICAL
  started_at: Date;
  duration_seconds: number;
  distance_meters: number | null;
  elevation_gain_meters?: number | null;
  has_heart_rate?: boolean;
  has_power?: boolean;
  has_gpx?: boolean;
  data_completeness_score?: number; // 0-100, vom Sync vorab berechnet
  merged_into_id?: string | null;
}

// =============================================================================
// TYPE-NORMALISIERUNG
// =============================================================================

/**
 * Mapping verschiedene Quellen-Typen → kanonischer Aktivitäts-Typ.
 */
export const ACTIVITY_TYPE_CANONICAL: Record<string, string> = {
  // Strava
  Ride: "cycling",
  MountainBikeRide: "mountain_biking",
  EBikeRide: "ebike",
  EMountainBikeRide: "ebike_mtb",
  Run: "running",
  TrailRun: "trail_running",
  Hike: "hiking",
  Walk: "walking",
  Swim: "swimming",
  StandUpPaddling: "sup",
  RockClimbing: "climbing",

  // Health Connect / Samsung Health
  EXERCISE_TYPE_BIKING: "cycling",
  EXERCISE_TYPE_BIKING_STATIONARY: "cycling_indoor",
  EXERCISE_TYPE_RUNNING: "running",
  EXERCISE_TYPE_RUNNING_TREADMILL: "running_indoor",
  EXERCISE_TYPE_HIKING: "hiking",
  EXERCISE_TYPE_WALKING: "walking",
  EXERCISE_TYPE_SWIMMING_POOL: "swimming",
  EXERCISE_TYPE_SWIMMING_OPEN_WATER: "swimming",
  EXERCISE_TYPE_PADDLING: "sup",
  EXERCISE_TYPE_ROCK_CLIMBING: "climbing",
};

/**
 * Welche Typen sind kompatibel zum Mergen?
 * (Watch labelt MTB oft als "cycling", AllTrails-Strava als "MountainBikeRide" → matchen)
 */
const TYPE_COMPATIBILITY: Record<string, string[]> = {
  cycling: ["cycling", "mountain_biking", "ebike", "ebike_mtb"],
  mountain_biking: ["cycling", "mountain_biking", "ebike_mtb"],
  ebike: ["ebike", "ebike_mtb", "cycling"],
  running: ["running", "trail_running"],
  trail_running: ["running", "trail_running", "hiking"], // grenzwertig, aber GPS-Pace überlappt
  hiking: ["hiking", "walking"],
  walking: ["walking", "hiking"],
  swimming: ["swimming"],
  sup: ["sup"],
  climbing: ["climbing"],
};

export function areTypesCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  return TYPE_COMPATIBILITY[a]?.includes(b) ?? false;
}

// =============================================================================
// MATCH-LOGIC
// =============================================================================

const TIME_WINDOW_MS = 5 * 60 * 1000; // 5 Minuten
const DISTANCE_TOLERANCE = 0.1; // 10%
const DURATION_TOLERANCE = 0.1; // 10%

export interface MatchResult {
  match: boolean;
  reasons: string[];
}

/**
 * Sind diese zwei Activities wahrscheinlich die gleiche?
 */
export function areActivitiesDuplicates(a: ActivityRecord, b: ActivityRecord): MatchResult {
  const reasons: string[] = [];

  // Kriterium 1: Start-Zeit-Differenz
  const timeDiffMs = Math.abs(a.started_at.getTime() - b.started_at.getTime());
  if (timeDiffMs > TIME_WINDOW_MS) {
    return { match: false, reasons: [`time differs by ${Math.round(timeDiffMs / 60000)} min`] };
  }
  reasons.push(`time match (Δ ${Math.round(timeDiffMs / 1000)}s)`);

  // Kriterium 2: Type-Compatibility
  if (!areTypesCompatible(a.type, b.type)) {
    return { match: false, reasons: [`types incompatible: ${a.type} vs ${b.type}`] };
  }
  reasons.push(`types compatible (${a.type} ↔ ${b.type})`);

  // Kriterium 3: Dauer (gewichtet — nicht hart, weil Pause-Behandlung variiert)
  const durDiff =
    Math.abs(a.duration_seconds - b.duration_seconds) /
    Math.max(a.duration_seconds, b.duration_seconds);
  if (durDiff > DURATION_TOLERANCE) {
    // Bei sehr kurzen Activities (<10min) ist die relative Toleranz kritisch.
    // Bei langen (>30min) erlauben wir ±15% um Pausen-Drift zu tolerieren.
    const relaxed = a.duration_seconds > 1800 && b.duration_seconds > 1800 && durDiff < 0.15;
    if (!relaxed) {
      return { match: false, reasons: [`duration differs by ${(durDiff * 100).toFixed(0)}%`] };
    }
  }
  reasons.push(`duration match (Δ ${(durDiff * 100).toFixed(1)}%)`);

  // Kriterium 4: Distanz (nur wenn beide eine haben)
  if (a.distance_meters !== null && b.distance_meters !== null) {
    const distDiff =
      Math.abs(a.distance_meters - b.distance_meters) /
      Math.max(a.distance_meters, b.distance_meters);
    if (distDiff > DISTANCE_TOLERANCE) {
      return { match: false, reasons: [`distance differs by ${(distDiff * 100).toFixed(0)}%`] };
    }
    reasons.push(`distance match (Δ ${(distDiff * 100).toFixed(1)}%)`);
  } else {
    reasons.push("one activity has no distance — relying on time+duration");
  }

  return { match: true, reasons };
}

// =============================================================================
// QUELLEN-PRIORISIERUNG
// =============================================================================

/**
 * Welche der zwei Activities behalten?
 * Returns: die zu behaltende, die andere wird als merged_into markiert.
 */
export function preferActivity(
  a: ActivityRecord,
  b: ActivityRecord,
): { keep: ActivityRecord; drop: ActivityRecord } {
  // 1. Mehr data_completeness gewinnt
  const aScore = a.data_completeness_score ?? defaultCompletenessScore(a);
  const bScore = b.data_completeness_score ?? defaultCompletenessScore(b);

  if (aScore > bScore) return { keep: a, drop: b };
  if (bScore > aScore) return { keep: b, drop: a };

  // 2. Bei Gleichstand: Strava bevorzugen (AllTrails-GPX ist meist vollständiger)
  if (a.source === "strava" && b.source !== "strava") return { keep: a, drop: b };
  if (b.source === "strava" && a.source !== "strava") return { keep: b, drop: a };

  // 3. Final: ältere Eintragung gewinnt (deterministisch)
  return { keep: a, drop: b };
}

function defaultCompletenessScore(a: ActivityRecord): number {
  let score = 0;
  if (a.has_gpx) score += 40;
  if (a.has_heart_rate) score += 30;
  if (a.has_power) score += 15;
  if (a.elevation_gain_meters !== null && a.elevation_gain_meters !== undefined) score += 10;
  if (a.distance_meters !== null) score += 5;
  return score;
}

// =============================================================================
// BATCH-DEDUPE
// =============================================================================

export interface DedupeAction {
  keep_id: string;
  drop_id: string;
  reasons: string[];
}

/**
 * Findet alle Duplikate in einer Activity-Liste.
 * Returns: Liste von Aktionen ("merge X into Y"). Aufrufer wendet sie auf die DB an.
 *
 * Komplexität: O(n²) — für n=1000 noch ok. Wenn das wachsen sollte:
 * Pre-Bucket nach Tag (Activities am selben Tag matchen, andere skippen).
 */
export function findDuplicates(activities: ActivityRecord[]): DedupeAction[] {
  const actions: DedupeAction[] = [];
  const dropped = new Set<string>();

  // Sortiere nach started_at — Activities die zeitlich nah sind landen nebeneinander
  const sorted = [...activities].sort((x, y) => x.started_at.getTime() - y.started_at.getTime());

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (!a) continue;
    if (dropped.has(a.id)) continue;
    if (a.merged_into_id) continue; // schon gemerged

    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (!b) continue;
      if (dropped.has(b.id)) continue;
      if (b.merged_into_id) continue;

      // Optimization: wenn b.started_at - a.started_at > Window → break (sortiert)
      if (b.started_at.getTime() - a.started_at.getTime() > TIME_WINDOW_MS) break;

      // Quellen müssen unterschiedlich sein, sonst ist es kein Quellen-Duplicat
      if (a.source === b.source) continue;

      const match = areActivitiesDuplicates(a, b);
      if (!match.match) continue;

      const { keep, drop } = preferActivity(a, b);
      actions.push({
        keep_id: keep.id,
        drop_id: drop.id,
        reasons: match.reasons,
      });
      dropped.add(drop.id);
    }
  }

  return actions;
}
