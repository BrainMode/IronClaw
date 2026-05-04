/**
 * Tests for activity deduplication.
 * Run: pnpm test src/lib/activities/dedupe.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  type ActivityRecord,
  areActivitiesDuplicates,
  areTypesCompatible,
  findDuplicates,
  preferActivity,
} from "./dedupe";

const baseA: ActivityRecord = {
  id: "a",
  source: "strava",
  source_external_id: "strava-1",
  type: "mountain_biking",
  started_at: new Date("2026-05-01T09:00:00Z"),
  duration_seconds: 3600,
  distance_meters: 25000,
  elevation_gain_meters: 800,
  has_gpx: true,
  has_heart_rate: false,
};

const baseB: ActivityRecord = {
  id: "b",
  source: "health_connect",
  source_external_id: "hc-1",
  type: "cycling",
  started_at: new Date("2026-05-01T09:02:00Z"),
  duration_seconds: 3650,
  distance_meters: 24800,
  elevation_gain_meters: null,
  has_gpx: false,
  has_heart_rate: true,
};

describe("areTypesCompatible", () => {
  it("matches mountain_biking with cycling", () => {
    expect(areTypesCompatible("mountain_biking", "cycling")).toBe(true);
  });
  it("matches running with trail_running", () => {
    expect(areTypesCompatible("running", "trail_running")).toBe(true);
  });
  it("does not match cycling with running", () => {
    expect(areTypesCompatible("cycling", "running")).toBe(false);
  });
});

describe("areActivitiesDuplicates", () => {
  it("matches near-identical MTB tour from Strava + Health Connect", () => {
    const result = areActivitiesDuplicates(baseA, baseB);
    expect(result.match).toBe(true);
  });

  it("rejects when start times are >5 min apart", () => {
    const b = { ...baseB, started_at: new Date("2026-05-01T09:10:00Z") };
    const result = areActivitiesDuplicates(baseA, b);
    expect(result.match).toBe(false);
  });

  it("rejects when distances differ by >10%", () => {
    const b = { ...baseB, distance_meters: 30000 };
    const result = areActivitiesDuplicates(baseA, b);
    expect(result.match).toBe(false);
  });

  it("rejects when types incompatible", () => {
    const b = { ...baseB, type: "swimming" };
    const result = areActivitiesDuplicates(baseA, b);
    expect(result.match).toBe(false);
  });

  it("relaxes duration tolerance for long activities", () => {
    const a = { ...baseA, duration_seconds: 7200 }; // 2h
    const b = { ...baseB, duration_seconds: 8100 }; // 2h15 — 12% diff, should still match because >30min
    const result = areActivitiesDuplicates(a, b);
    expect(result.match).toBe(true);
  });
});

describe("preferActivity", () => {
  it("prefers activity with GPX + HR over barebone activity", () => {
    const richer: ActivityRecord = { ...baseA, has_heart_rate: true };
    const sparse = { ...baseB, has_gpx: false, has_heart_rate: false };
    const { keep } = preferActivity(richer, sparse);
    expect(keep.id).toBe(richer.id);
  });

  it("prefers Strava over Health Connect at completeness tie", () => {
    const a: ActivityRecord = {
      ...baseA,
      has_gpx: false,
      has_heart_rate: false,
      data_completeness_score: 50,
    };
    const b: ActivityRecord = {
      ...baseB,
      source: "health_connect",
      has_gpx: false,
      has_heart_rate: false,
      data_completeness_score: 50,
    };
    const { keep } = preferActivity(a, b);
    expect(keep.source).toBe("strava");
  });
});

describe("findDuplicates", () => {
  it("finds the obvious MTB tour duplicate", () => {
    const actions = findDuplicates([baseA, baseB]);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.keep_id).toBe("a"); // strava + gpx wins
    expect(actions[0]!.drop_id).toBe("b");
  });

  it("does not merge two real activities on the same day", () => {
    const morning: ActivityRecord = {
      ...baseA,
      id: "m",
      started_at: new Date("2026-05-01T08:00:00Z"),
    };
    const afternoon: ActivityRecord = {
      ...baseB,
      id: "a",
      started_at: new Date("2026-05-01T14:00:00Z"),
    };
    const actions = findDuplicates([morning, afternoon]);
    expect(actions).toHaveLength(0);
  });

  it("does not merge two activities from the same source", () => {
    const a: ActivityRecord = { ...baseA, id: "x", source: "strava" };
    const b: ActivityRecord = { ...baseB, id: "y", source: "strava" };
    const actions = findDuplicates([a, b]);
    expect(actions).toHaveLength(0);
  });

  it("handles a list of mixed activities correctly", () => {
    const activities: ActivityRecord[] = [
      // Tour 1 — duplicate pair
      { ...baseA, id: "t1-strava" },
      { ...baseB, id: "t1-hc" },
      // Tour 2 — only Strava (no dupe)
      {
        ...baseA,
        id: "t2-strava",
        source_external_id: "strava-2",
        started_at: new Date("2026-05-02T09:00:00Z"),
      },
      // Tour 3 — duplicate pair
      {
        ...baseA,
        id: "t3-strava",
        source_external_id: "strava-3",
        started_at: new Date("2026-05-03T15:00:00Z"),
      },
      {
        ...baseB,
        id: "t3-hc",
        source_external_id: "hc-3",
        started_at: new Date("2026-05-03T15:01:00Z"),
      },
    ];
    const actions = findDuplicates(activities);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.drop_id).sort()).toEqual(["t1-hc", "t3-hc"]);
  });
});
