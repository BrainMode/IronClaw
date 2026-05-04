import { AnamneseChat } from "./anamnese-chat";

export default function AnamnesePage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Anamnese</h2>
        <p className="text-(--color-muted-foreground)">
          Kurzes Gespräch mit dem Coach (~5 Fragen) um deinen Trainings-Stil + Frequenz zu
          ermitteln. Danach kommt das Equipment-Setup.
        </p>
      </div>
      <AnamneseChat />
    </div>
  );
}
