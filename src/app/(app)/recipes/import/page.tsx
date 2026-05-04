import { ImportForm } from "./import-form";

export default function ImportRecipePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Rezept importieren</h2>
        <p className="text-(--color-muted-foreground)">
          URL einer Recipe-Seite (z.B. chefkoch.de, bettybossi.ch) oder Plain-Text. App extrahiert
          Zutaten + Steps mit Provenance, du bestätigst und speicherst.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
