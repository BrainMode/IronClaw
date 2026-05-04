/**
 * Tailwind v4 Setup.
 *
 * Tailwind v4 ist CSS-first — die Hauptkonfiguration ist in src/app/globals.css
 * via @theme und @config. Diese .ts-Datei ist optional, dient als Hinweis.
 *
 * shadcn/ui Komponenten werden via `npx shadcn@latest add <component>` hinzugefügt
 * und nutzen automatisch die Tokens aus globals.css.
 */

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
};

export default config;
