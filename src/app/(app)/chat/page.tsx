import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Coach</h2>
        <p className="text-(--color-muted-foreground)">AI-Chat mit Tool-Calling.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Phase 6</CardTitle>
          <CardDescription>
            Coach mit Zugriff auf Trainings-Verlauf, Nutrition, Body-Metrics folgt nach Phase 5.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-(--color-muted-foreground)">
            "Wie war mein Bankdrücken letzte Woche?" — "Log mir 100g Hähnchen" — "Was kann ich heute
            mit dem Pantry-Inhalt kochen?"
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
