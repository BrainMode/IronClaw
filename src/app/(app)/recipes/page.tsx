import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RecipesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Rezepte</h2>
        <p className="text-(--color-muted-foreground)">
          Sammlung des Haushalts — gemeinsam editierbar.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Noch leer</CardTitle>
          <CardDescription>Import-Pipeline kommt in Phase 4.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-(--color-muted-foreground)">
            Dann kannst du URL / Foto / Plain-Text reinwerfen — App erkennt YouTube, Instagram,
            Web-Blogs (JSON-LD), Fotos vom Kochbuch, etc., extrahiert Zutaten + Steps mit
            Provenance, schaut Migros-Verfügbarkeit ab.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
