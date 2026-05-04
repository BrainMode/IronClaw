/**
 * Nutrition-Module Domain-Logik.
 *
 * Hier kommen reine Domain-Funktionen hin (keine API-/DB-Calls direkt):
 * - Aggregationen (kcal-Summen pro Tag/Woche)
 * - Macro-Target-Berechnung mit Trainings-Tag-Offset
 * - Portionen-Skalierung von Rezept zu Logged Meal
 *
 * Geplante Files (von Claude Code):
 * - aggregate.ts       — Aggregations-Helper für Dashboards
 * - barcode.ts         — Barcode-Pipeline orchestriert OFF + Migros + Cache
 * - vision-estimator.ts — Photo → AI → nutrition_logs
 * - macro-targets.ts   — Berechne effektive Targets für einen Tag (mit/ohne Training)
 */

export {};
