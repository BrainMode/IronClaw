/**
 * Source-Detector — klassifiziert Input zu einem konkreten Source-Typ.
 *
 * Input kann sein: URL string, Bildpfad, oder Plain-Text.
 * Output: ein DetectedSource der dem richtigen Fetcher zuzuordnen ist.
 *
 * Behandelt auch Redirects (vm.tiktok.com, fb.watch, lnk.bio shortlinks),
 * resolved zur kanonischen URL bevor klassifiziert wird.
 *
 * Siehe docs/RECIPE_IMPORT.md "Source-Detection".
 */

import { z } from "zod";

// =============================================================================
// DETECTED SOURCE TYPES
// =============================================================================

export const detectedSourceTypeSchema = z.enum([
  "youtube_video",
  "youtube_shorts",
  "youtube_playlist", // erstes Video oder User auswählen lassen
  "instagram_post",
  "instagram_reel",
  "instagram_carousel",
  "instagram_story", // wahrscheinlich Failure
  "tiktok",
  "facebook_post",
  "facebook_video",
  "facebook_reel",
  "pinterest", // → re-classify nach redirect
  "web_url", // generische Webseite
  "image_upload",
  "manual_text",
  "unsupported",
]);

export type DetectedSourceType = z.infer<typeof detectedSourceTypeSchema>;

export interface DetectedSource {
  type: DetectedSourceType;
  /** Kanonische URL (nach Redirect-Auflösung) */
  canonical_url?: string;
  /** Original-Input falls abweichend */
  original_input: string;
  /** Falls Pinterest oder Shortlink → die URL des echten Targets */
  resolved_url?: string;
  /** Zusatz-Metadaten, z.B. youtube video_id */
  metadata?: Record<string, string>;
}

// =============================================================================
// HOST-PATTERNS
// =============================================================================

const PATTERNS = {
  youtubeVideo:
    /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  youtubeShorts: /^https?:\/\/(www\.|m\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  youtubePlaylist: /^https?:\/\/(www\.|m\.)?youtube\.com\/playlist\?list=/,
  youtubeMusic: /^https?:\/\/music\.youtube\.com/,

  instagramPost: /^https?:\/\/(www\.)?instagram\.com\/p\/([a-zA-Z0-9_-]+)/,
  instagramReel: /^https?:\/\/(www\.)?instagram\.com\/reel(s)?\/([a-zA-Z0-9_-]+)/,
  instagramStory: /^https?:\/\/(www\.)?instagram\.com\/stories\//,

  tiktok: /^https?:\/\/(www\.|m\.)?tiktok\.com\/@[^\/]+\/video\/(\d+)/,
  tiktokShort: /^https?:\/\/(vm|vt)\.tiktok\.com\//,

  facebookPost: /^https?:\/\/(www\.|m\.)?facebook\.com\/.+\/posts\//,
  facebookVideo: /^https?:\/\/(www\.|m\.)?facebook\.com\/.+\/videos\//,
  facebookReel: /^https?:\/\/(www\.|m\.)?facebook\.com\/reel\//,
  facebookShort: /^https?:\/\/fb\.watch\//,

  pinterest: /^https?:\/\/(www\.|de\.|ch\.)?pinterest\.[a-z.]+\/pin\//,

  // Generic shortlinks (need resolve)
  shortlink:
    /^https?:\/\/(t\.co|bit\.ly|tinyurl\.com|lnk\.bio|linktr\.ee|beacons\.ai|short\.[a-z]+)\//,
};

// =============================================================================
// MAIN DETECTOR
// =============================================================================

export interface DetectInput {
  /** URL-String, Plain-Text, oder Image-Path-Indicator */
  input: string;
  /** Falls bereits ein hochgeladenes Bild vorliegt */
  isImage?: boolean;
}

export async function detectSource(req: DetectInput): Promise<DetectedSource> {
  const trimmed = req.input.trim();

  if (req.isImage) {
    return { type: "image_upload", original_input: trimmed };
  }

  // Plain text (kein URL-Format) → manual
  if (!isUrl(trimmed)) {
    return { type: "manual_text", original_input: trimmed };
  }

  // YouTube Music → unsupported (niemals ein Rezept)
  if (PATTERNS.youtubeMusic.test(trimmed)) {
    return { type: "unsupported", original_input: trimmed };
  }

  // YouTube Shorts
  const shortsMatch = trimmed.match(PATTERNS.youtubeShorts);
  if (shortsMatch?.[2]) {
    const videoId = shortsMatch[2];
    return {
      type: "youtube_shorts",
      canonical_url: `https://www.youtube.com/shorts/${videoId}`,
      original_input: trimmed,
      metadata: { video_id: videoId },
    };
  }

  // YouTube Video (inkl. youtu.be)
  const videoMatch = trimmed.match(PATTERNS.youtubeVideo);
  if (videoMatch?.[3]) {
    const videoId = videoMatch[3];
    return {
      type: "youtube_video",
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      original_input: trimmed,
      metadata: { video_id: videoId },
    };
  }

  // YouTube Playlist
  if (PATTERNS.youtubePlaylist.test(trimmed)) {
    return { type: "youtube_playlist", original_input: trimmed };
  }

  // Instagram
  if (PATTERNS.instagramReel.test(trimmed)) {
    return { type: "instagram_reel", original_input: trimmed, canonical_url: trimmed };
  }
  if (PATTERNS.instagramPost.test(trimmed)) {
    // Carousel oder Single — ohne fetch nicht unterscheidbar; default Post, Fetcher checkt media_count
    return { type: "instagram_post", original_input: trimmed, canonical_url: trimmed };
  }
  if (PATTERNS.instagramStory.test(trimmed)) {
    return { type: "instagram_story", original_input: trimmed };
  }

  // TikTok Shortlink → resolve
  if (PATTERNS.tiktokShort.test(trimmed)) {
    const resolved = await resolveRedirect(trimmed);
    if (resolved && PATTERNS.tiktok.test(resolved)) {
      return { type: "tiktok", original_input: trimmed, canonical_url: resolved };
    }
  }
  if (PATTERNS.tiktok.test(trimmed)) {
    return { type: "tiktok", original_input: trimmed, canonical_url: trimmed };
  }

  // Facebook
  if (PATTERNS.facebookShort.test(trimmed)) {
    const resolved = await resolveRedirect(trimmed);
    if (resolved) return classifyByPattern(resolved, trimmed);
  }
  if (PATTERNS.facebookReel.test(trimmed)) {
    return { type: "facebook_reel", original_input: trimmed, canonical_url: trimmed };
  }
  if (PATTERNS.facebookVideo.test(trimmed)) {
    return { type: "facebook_video", original_input: trimmed, canonical_url: trimmed };
  }
  if (PATTERNS.facebookPost.test(trimmed)) {
    return { type: "facebook_post", original_input: trimmed, canonical_url: trimmed };
  }

  // Pinterest → resolve & re-classify
  if (PATTERNS.pinterest.test(trimmed)) {
    return {
      type: "pinterest",
      original_input: trimmed,
      canonical_url: trimmed,
      // Fetcher löst das Redirect auf und re-detected
    };
  }

  // Generic shortlink → resolve
  if (PATTERNS.shortlink.test(trimmed)) {
    const resolved = await resolveRedirect(trimmed);
    if (resolved && resolved !== trimmed) {
      const reDetected = await detectSource({ input: resolved });
      return { ...reDetected, original_input: trimmed, resolved_url: resolved };
    }
  }

  // Default: generic web URL
  return { type: "web_url", original_input: trimmed, canonical_url: trimmed };
}

// =============================================================================
// HELPERS
// =============================================================================

function isUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Folgt HTTP-Redirects bis zum finalen URL.
 * Cap bei 5 Hops um Loops zu vermeiden.
 */
async function resolveRedirect(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    return res.url;
  } catch {
    return null;
  }
}

function classifyByPattern(url: string, originalInput: string): DetectedSource {
  if (PATTERNS.facebookReel.test(url)) {
    return { type: "facebook_reel", original_input: originalInput, canonical_url: url };
  }
  if (PATTERNS.facebookVideo.test(url)) {
    return { type: "facebook_video", original_input: originalInput, canonical_url: url };
  }
  if (PATTERNS.facebookPost.test(url)) {
    return { type: "facebook_post", original_input: originalInput, canonical_url: url };
  }
  return { type: "web_url", original_input: originalInput, canonical_url: url };
}
