/**
 * Liest den Iron-Mike-Podcast-JSON und extrahiert nur die Text-Segmente
 * als zusammenhängender Plain-Text.
 *
 * Run: node scripts/extract-podcast-text.mjs
 */
import { readFile, writeFile } from "node:fs/promises";

const inputPath =
  "Z:/General/Claude Code Projekte/Trainingsapp/Vom_Knast_zum_BIOHACKER_-_So_wirst_du_zum_HIGHPERFORMER_IRON_MIKE_deu.json";
const outputPath = "C:/dev/IronClaw/docs/iron-mike-transcript.txt";

const json = JSON.parse(await readFile(inputPath, "utf8"));
const segments = json.segments ?? [];

const text = segments
  .map((s) => s.text?.trim() ?? "")
  .filter(Boolean)
  .join(" ");

await writeFile(outputPath, text, "utf8");
console.log(`Extracted ${text.length} chars from ${segments.length} segments → ${outputPath}`);
