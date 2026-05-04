import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function BodyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Körper</h2>
        <p className="text-(--color-muted-foreground)">Body-Metrics + Trends.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Phase 7</CardTitle>
          <CardDescription>Withings-Anbindung (Gewicht, BF%, HRV) folgt später.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
